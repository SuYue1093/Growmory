export async function readLogo(file: File): Promise<string> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw Error("请选择 PNG、JPG 或 WebP 图片");
  if (file.size > 5 * 1024 * 1024) throw Error("图片不能超过 5 MB");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const context = canvas.getContext("2d")!;
    const scale = Math.min(256 / image.naturalWidth, 256 / image.naturalHeight);
    const width = image.naturalWidth * scale,
      height = image.naturalHeight * scale;
    context.drawImage(
      image,
      (256 - width) / 2,
      (256 - height) / 2,
      width,
      height,
    );
    return canvas.toDataURL("image/png");
  } catch {
    throw Error("图片无法读取，请换一张图片");
  } finally {
    URL.revokeObjectURL(url);
  }
}
