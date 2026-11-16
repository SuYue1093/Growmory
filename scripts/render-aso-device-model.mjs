import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { designFilePath, designFiles } from '../server/aso-design-resources.mjs';

const rawArgs = process.argv.slice(2);
const trim = rawArgs.includes('--trim');
const positional = rawArgs.filter(arg => arg !== '--trim');
const [id, capturePath, outputPath, yawArg = '26', pitchArg = '12', rollArg = '0', finish = 'original'] = positional;
const FINISH_COLORS = {
  original: null,
  graphite: '#3c3d43',
  black: '#1f2024',
  titanium: '#9e978d',
  champagne: '#bfa382',
  silver: '#cfd4dc',
};
const model = designFiles.find(item => item.id === id && item.usage === 'screen-texture');
const yaw = Number(yawArg);
const pitch = Number(pitchArg);
const roll = Number(rollArg);
const finishColor = Object.hasOwn(FINISH_COLORS, finish) ? FINISH_COLORS[finish] : undefined;
if (!model || !capturePath || !outputPath || ![yaw, pitch, roll].every(Number.isFinite)
    || finishColor === undefined || (finish !== 'original' && !model.bodyMaterials)
    || Math.abs(yaw) > 65 || Math.abs(pitch) > 65 || Math.abs(roll) > 180) {
  console.error('Usage: node scripts/render-aso-device-model.mjs MODEL_ID UI.png OUTPUT.png [yaw -65..65] [pitch -65..65] [roll -180..180] [original|graphite|titanium|champagne|silver|black] [--trim]');
  process.exit(1);
}

const [glb, capture] = await Promise.all([readFile(designFilePath(model.file)), readFile(capturePath)]);
const three = new URL('../node_modules/three/', import.meta.url);
const modules = new Map([
  ['/three.module.js', 'build/three.module.js'],
  ['/three.core.js', 'build/three.core.js'],
  ['/loaders/GLTFLoader.js', 'examples/jsm/loaders/GLTFLoader.js'],
  ['/utils/BufferGeometryUtils.js', 'examples/jsm/utils/BufferGeometryUtils.js'],
  ['/utils/SkeletonUtils.js', 'examples/jsm/utils/SkeletonUtils.js'],
  ['/environments/RoomEnvironment.js', 'examples/jsm/environments/RoomEnvironment.js'],
]);

const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-swiftshader'] });
const RENDER_WIDTH = 1920;
const RENDER_HEIGHT = 2880;
try {
  const page = await browser.newPage({ viewport: { width: RENDER_WIDTH, height: RENDER_HEIGHT } });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://aso-device.local') return route.abort();
    if (modules.has(url.pathname)) {
      return route.fulfill({ contentType: 'text/javascript', path: fileURLToPath(new URL(modules.get(url.pathname), three)) });
    }
    if (url.pathname === '/device.glb') return route.fulfill({ body: glb, contentType: 'model/gltf-binary' });
    if (url.pathname === '/screen.png') return route.fulfill({ body: capture, contentType: 'image/png' });
    if (url.pathname !== '/') return route.abort();
    return route.fulfill({ contentType: 'text/html', body: `<!doctype html>
      <style>body{margin:0}canvas{display:block}</style>
      <script type="importmap">{"imports":{"three":"/three.module.js"}}</script>` });
  });
  await page.goto('http://aso-device.local/');
  const clip = await page.evaluate(async ({ orientation, screenMaterial, screenNormal, bodyMaterials, finishColor, yaw, pitch, roll, trim, renderWidth, renderHeight }) => {
    const THREE = await import('three');
    const { GLTFLoader } = await import('/loaders/GLTFLoader.js');
    const { scene: device } = await new GLTFLoader().loadAsync('/device.glb');
    device.updateMatrixWorld(true);
    let screen;
    device.traverse(node => {
      if (!node.isMesh) return;
      if (node.material.name === screenMaterial) screen = node;
      if (finishColor && bodyMaterials.includes(node.material.name)) {
        node.material.color.set(finishColor);
      }
    });
    if (!screen) throw new Error('Model has no dedicated screen mesh');

    const flat = orientation === 'flat-portrait';
    const expected = new THREE.Vector3(...(screenNormal ?? (flat ? [0, 1, 0] : [0, 0, 1])));
    const nominalUp = flat ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const geometry = screen.geometry;
    const normals = geometry.getAttribute('normal');
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(screen.matrixWorld);
    const facing = new THREE.Vector3();
    const direction = new THREE.Vector3();
    for (let index = 0; index < normals.count; index++) {
      direction.fromBufferAttribute(normals, index).applyNormalMatrix(normalMatrix);
      if (direction.dot(expected) > 0.85) facing.add(direction);
    }
    if (!facing.lengthSq()) throw new Error('Screen is not facing the expected direction');
    facing.normalize();
    const right = nominalUp.clone().cross(facing).normalize();
    const up = facing.clone().cross(right).normalize();
    const vertices = geometry.getAttribute('position');
    const point = new THREE.Vector3();
    const projected = Array.from({ length: vertices.count }, (_, index) => {
      point.fromBufferAttribute(vertices, index).applyMatrix4(screen.matrixWorld);
      return new THREE.Vector2(point.dot(right), point.dot(up));
    });
    const rect = new THREE.Box2().setFromPoints(projected);
    const extent = rect.getSize(new THREE.Vector2());
    if (Math.min(extent.x, extent.y) <= 0) throw new Error('Screen mesh has no usable display area');
    const uv = new Float32Array(vertices.count * 2);
    projected.forEach(({ x, y }, index) => {
      uv[index * 2] = (x - rect.min.x) / extent.x;
      uv[index * 2 + 1] = (y - rect.min.y) / extent.y;
    });
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(renderWidth, renderHeight);
    renderer.setClearColor(0, 0);

    const capture = new Image();
    capture.src = '/screen.png';
    await capture.decode();
    const canvas = document.createElement('canvas');
    const ratio = extent.x / extent.y;
    const texMax = Math.min(3072, Math.max(2048, capture.naturalHeight || 2048, capture.naturalWidth || 2048));
    canvas.width = Math.round(texMax * Math.min(ratio, 1));
    canvas.height = Math.round(texMax * Math.min(1 / ratio, 1));
    const context = canvas.getContext('2d');
    const fit = orientation === 'upright-portrait' ? Math.max : Math.min;
    const scale = fit(canvas.width / capture.width, canvas.height / capture.height);
    const width = capture.width * scale;
    const height = capture.height * scale;
    context.fillStyle = '#10141d';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(capture, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    screen.material = new THREE.MeshBasicMaterial({ map: texture, side: screen.material.side });

    const scene = new THREE.Scene();
    scene.add(device);
    scene.add(new THREE.HemisphereLight(0xf6f8ff, 0x8a95a8, 2.0));
    const key = new THREE.DirectionalLight(0xfffaf2, 2.2);
    key.position.copy(facing).add(up).sub(right);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xeef4ff, 1.1);
    rim.position.copy(facing).negate().add(up).add(right);
    scene.add(rim);
    const bounds = new THREE.Box3().setFromObject(device, true);
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    const camera = new THREE.PerspectiveCamera(31, renderWidth / renderHeight, sphere.radius / 100, sphere.radius * 100);
    direction.copy(facing)
      .addScaledVector(right, Math.tan(THREE.MathUtils.degToRad(yaw)))
      .addScaledVector(up, Math.tan(THREE.MathUtils.degToRad(pitch)))
      .normalize();
    camera.up.copy(up).applyAxisAngle(direction, THREE.MathUtils.degToRad(roll));
    const corners = [];
    for (const x of [bounds.min.x, bounds.max.x]) {
      for (const y of [bounds.min.y, bounds.max.y]) {
        for (const z of [bounds.min.z, bounds.max.z]) corners.push(new THREE.Vector3(x, y, z));
      }
    }
    for (let distance = sphere.radius * 2.2; ; distance *= 1.06) {
      camera.position.copy(sphere.center).addScaledVector(direction, distance);
      camera.lookAt(sphere.center);
      camera.updateMatrixWorld();
      if (corners.every(corner => {
        const projected = point.copy(corner).project(camera);
        return Math.max(Math.abs(projected.x), Math.abs(projected.y)) < 0.92;
      })) break;
    }
    if (orientation === 'upright-portrait') {
      const { RoomEnvironment } = await import('/environments/RoomEnvironment.js');
      const room = new RoomEnvironment();
      const environment = new THREE.PMREMGenerator(renderer);
      scene.environment = environment.fromScene(room, 0.04).texture;
    }
    document.body.append(renderer.domElement);
    renderer.render(scene, camera);
    if (!trim) return null;
    const probe = document.createElement('canvas');
    probe.width = renderWidth;
    probe.height = renderHeight;
    const pctx = probe.getContext('2d');
    pctx.drawImage(renderer.domElement, 0, 0);
    const pixels = pctx.getImageData(0, 0, renderWidth, renderHeight).data;
    let minX = renderWidth, minY = renderHeight, maxX = -1, maxY = -1;
    for (let y = 0; y < renderHeight; y++) {
      for (let x = 0; x < renderWidth; x++) {
        if (pixels[(y * renderWidth + x) * 4 + 3] > 6) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < minX || maxY < minY) return null;
    const pad = 8;
    const cx = Math.max(0, minX - pad);
    const cy = Math.max(0, minY - pad);
    const cw = Math.min(renderWidth - cx, maxX - minX + 1 + pad * 2);
    const ch = Math.min(renderHeight - cy, maxY - minY + 1 + pad * 2);
    return { x: cx, y: cy, width: cw, height: ch };
  }, {
    orientation: model.screenOrientation, screenMaterial: model.screenMaterial ?? 'screen',
    screenNormal: model.screenNormal, bodyMaterials: model.bodyMaterials || [],
    finishColor, yaw, pitch, roll, trim, renderWidth: RENDER_WIDTH, renderHeight: RENDER_HEIGHT,
  });
  await page.screenshot({ path: outputPath, omitBackground: true, ...(clip ? { clip } : {}) });
} finally {
  await browser.close();
}
