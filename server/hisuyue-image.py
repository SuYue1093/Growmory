"""Return a smaller lossless copy of a still PNG when Pillow is available."""
import io
import sys

from PIL import Image, PngImagePlugin

source = sys.stdin.buffer.read()
with Image.open(io.BytesIO(source)) as original:
    if original.format != 'PNG' or getattr(original, 'is_animated', False):
        sys.exit(0)

    candidates = []
    png = io.BytesIO()
    # Keep color and display metadata that Pillow does not copy by default.
    metadata = PngImagePlugin.PngInfo()
    color_chunks = {b'cHRM', b'gAMA', b'sBIT', b'sRGB', b'cICP'}
    has_color_chunks = False
    offset = 8
    while offset + 12 <= len(source):
        size = int.from_bytes(source[offset:offset + 4], 'big')
        kind = source[offset + 4:offset + 8]
        if kind in color_chunks:
            metadata.add(kind, source[offset + 8:offset + 8 + size])
            has_color_chunks = True
        offset += size + 12
    original.save(png, 'PNG', optimize=True, pnginfo=metadata, dpi=original.info.get('dpi'))
    candidates.append(b'P' + png.getvalue())

    if not has_color_chunks and original.mode in ('1', 'L', 'LA', 'P', 'RGB', 'RGBA'):
        webp = io.BytesIO()
        original.convert('RGBA').save(
            webp, 'WEBP', lossless=True, exact=True, method=4,
            icc_profile=original.info.get('icc_profile', b''),
            exif=original.info.get('exif', b''),
        )
        candidates.append(b'W' + webp.getvalue())

    for candidate in sorted(candidates, key=len):
        data = candidate[1:]
        if len(data) >= len(source):
            break
        with Image.open(io.BytesIO(data)) as result:
            if result.size != original.size:
                continue
            mode = original.mode if original.mode.startswith('I') else 'RGBA'
            if result.convert(mode).tobytes() == original.convert(mode).tobytes():
                sys.stdout.buffer.write(candidate)
                break
