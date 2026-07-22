import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { THREEJSASSETS_FREE, THREEJSASSETS_DOWNLOADED_AT } from './generated/threejsassets-free-v91.js';

const waitForBridge = async () => {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    if (window.NeonThreeBridge?.ready && window.NeonThreeBridge.gl) return window.NeonThreeBridge;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Three.js bridge did not initialise.');
};

const bridge = await waitForBridge();
const canvas = document.getElementById('gameCanvas');
const toast = document.getElementById('raceToast');
const eventFeed = document.getElementById('raceEventFeed');

bridge.setThreeRendering(true);
const renderer = new THREE.WebGLRenderer({
  canvas,
  context: bridge.gl,
  antialias: true,
  alpha: false,
  powerPreference: 'high-performance'
});
renderer.autoClear = false;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
renderer.shadowMap.enabled = false;
bridge.setThreeRendering(false);
bridge.restoreGameState();

const scene = new THREE.Scene();
const camera = new THREE.Camera();
camera.matrixAutoUpdate = false;
scene.add(new THREE.HemisphereLight(0xe8f2ff, 0x38274d, 1.75));
const sun = new THREE.DirectionalLight(0xffffff, 2.25);
sun.position.set(-8, 13, -5);
scene.add(sun);
const rim = new THREE.DirectionalLight(0x9b71ff, 1.15);
rim.position.set(8, 6, -12);
scene.add(rim);

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.184.0/examples/jsm/libs/draco/');
dracoLoader.setDecoderConfig({ type: 'wasm' });
const loader = new GLTFLoader();
loader.setDRACOLoader(dracoLoader);

function removeEmbeddedCameras(root) {
  const cameras = [];
  root.traverse((object) => { if (object.isCamera) cameras.push(object); });
  cameras.forEach((object) => object.parent?.remove(object));
}

function normalizeVehicle(root, targetLength = 5.7) {
  removeEmbeddedCameras(root);
  const wrapper = new THREE.Group();
  wrapper.add(root);
  root.updateMatrixWorld(true);
  let bounds = new THREE.Box3().setFromObject(root);
  let size = bounds.getSize(new THREE.Vector3());
  if (size.x > size.z) root.rotation.y = -Math.PI / 2;
  root.updateMatrixWorld(true);
  bounds = new THREE.Box3().setFromObject(root);
  size = bounds.getSize(new THREE.Vector3());
  const length = Math.max(size.x, size.z) || 1;
  root.scale.multiplyScalar(targetLength / length);
  root.updateMatrixWorld(true);
  bounds = new THREE.Box3().setFromObject(root);
  const center = bounds.getCenter(new THREE.Vector3());
  root.position.x -= center.x;
  root.position.z -= center.z;
  root.position.y += -0.96 - bounds.min.y;
  root.updateMatrixWorld(true);
  return wrapper;
}

function addTwinStripes(root) {
  const material = new THREE.MeshStandardMaterial({
    color: 0xf7f8ff,
    roughness: 0.42,
    metalness: 0.02
  });
  const group = new THREE.Group();
  group.name = 'ReferenceTwinStripes';
  for (const x of [-0.23, 0.23]) {
    for (const part of [
      { y: 0.72, z: 1.48, length: 1.85, pitch: -0.04 },
      { y: 1.43, z: -0.05, length: 1.32, pitch: 0 },
      { y: 0.86, z: -1.48, length: 1.16, pitch: 0.09 }
    ]) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.025, part.length), material);
      stripe.position.set(x, part.y, part.z);
      stripe.rotation.x = part.pitch;
      group.add(stripe);
    }
  }
  root.add(group);
}

function cloneVehicle(source) {
  const root = source.clone(true);
  const tintMaterials = [];
  root.traverse((object) => {
    if (!object.isMesh) return;
    object.frustumCulled = false;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const cloned = materials.map((original) => {
      const material = original.clone();
      const name = String(material.name || '').toLowerCase();
      const protectedPart = /(glass|window|wind|tire|tyre|wheel|rim|light|lamp|chrome|metal|black|rubber)/.test(name);
      if (material.color && !protectedPart) {
        const base = material.color.clone();
        const brightness = Math.max(0.32, Math.min(1.15, base.r * 0.22 + base.g * 0.70 + base.b * 0.08 + 0.35));
        material.userData.neonBodyBase = brightness;
        tintMaterials.push(material);
      }
      if (/(glass|window|wind)/.test(name)) {
        material.transparent = true;
        material.opacity = Math.min(material.opacity ?? 1, 0.68);
        material.depthWrite = false;
        material.roughness = Math.max(0.08, material.roughness ?? 0.08);
      }
      material.needsUpdate = true;
      return material;
    });
    object.material = Array.isArray(object.material) ? cloned : cloned[0];
  });
  root.visible = false;
  return { root, tintMaterials, colorKey: '' };
}

function applyBodyColor(vehicle, color) {
  const key = color.map((value) => Number(value).toFixed(3)).join(',');
  if (vehicle.colorKey === key) return;
  vehicle.colorKey = key;
  const tint = new THREE.Color(color[0], color[1], color[2]);
  for (const material of vehicle.tintMaterials) {
    const brightness = material.userData.neonBodyBase || 0.85;
    material.color.copy(tint).multiplyScalar(brightness);
  }
}

function prepareSky(root) {
  removeEmbeddedCameras(root);
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  const size = bounds.getSize(new THREE.Vector3());
  const diameter = Math.max(size.x, size.y, size.z) || 1;
  root.scale.multiplyScalar(560 / diameter);
  root.traverse((object) => {
    if (!object.isMesh) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const updated = materials.map((original) => {
      const material = original.clone();
      material.side = THREE.DoubleSide;
      material.depthWrite = false;
      material.depthTest = true;
      material.fog = false;
      material.toneMapped = false;
      return material;
    });
    object.material = Array.isArray(object.material) ? updated : updated[0];
    object.renderOrder = -100;
    object.frustumCulled = false;
  });
  return root;
}

async function loadAsset(asset) {
  const gltf = await loader.loadAsync(asset.dataUri);
  return gltf.scene;
}

let sedanSource;
let taxiSource;
let skyDome;
try {
  const [sedanScene, taxiScene, skyScene] = await Promise.all([
    loadAsset(THREEJSASSETS_FREE.carSedan),
    loadAsset(THREEJSASSETS_FREE.taxi),
    loadAsset(THREEJSASSETS_FREE.daySkyDome)
  ]);
  sedanSource = normalizeVehicle(sedanScene, 5.72);
  taxiSource = normalizeVehicle(taxiScene, 5.74);
  addTwinStripes(sedanSource);
  skyDome = prepareSky(skyScene);
  scene.add(skyDome);
} catch (error) {
  console.error('threejsassets Free GLB load failed:', error);
  bridge.setEnabled(false);
  if (eventFeed) eventFeed.textContent = 'Free GLB 資產載入失敗，已保留原車模';
  throw error;
}

const instances = [];
const tempMatrix = new THREE.Matrix4();
const tempPosition = new THREE.Vector3();
const tempQuaternion = new THREE.Quaternion();
const tempScale = new THREE.Vector3();

function createInstance() {
  const sedan = cloneVehicle(sedanSource);
  const taxi = cloneVehicle(taxiSource);
  scene.add(sedan.root, taxi.root);
  return { sedan, taxi, active: null };
}

function chooseVehicle(instance, color) {
  const taxiYellow = color[0] > 0.72 && color[1] > 0.38 && color[2] < 0.28;
  instance.sedan.root.visible = !taxiYellow;
  instance.taxi.root.visible = taxiYellow;
  instance.active = taxiYellow ? instance.taxi : instance.sedan;
  return instance.active;
}

function updateCamera(snapshot) {
  if (!snapshot.view || !snapshot.projection) return false;
  camera.projectionMatrix.fromArray(snapshot.projection);
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  camera.matrixWorldInverse.fromArray(snapshot.view);
  camera.matrixWorld.copy(camera.matrixWorldInverse).invert();
  camera.position.setFromMatrixPosition(camera.matrixWorld);
  if (skyDome) skyDome.position.copy(camera.position);
  return true;
}

function updateCars(snapshot) {
  while (instances.length < snapshot.cars.length) instances.push(createInstance());
  instances.forEach((instance, index) => {
    const capture = snapshot.cars[index];
    instance.sedan.root.visible = false;
    instance.taxi.root.visible = false;
    if (!capture) return;
    const active = chooseVehicle(instance, capture.color);
    tempMatrix.fromArray(capture.matrix);
    tempMatrix.decompose(tempPosition, tempQuaternion, tempScale);
    active.root.position.copy(tempPosition);
    active.root.quaternion.copy(tempQuaternion);
    active.root.scale.set(1, 1, 1);
    applyBodyColor(active, capture.color);
  });
}

function renderFrame() {
  requestAnimationFrame(renderFrame);
  const snapshot = bridge.snapshot();
  if (!snapshot.cars.length || !updateCamera(snapshot)) return;
  updateCars(snapshot);
  bridge.setThreeRendering(true);
  try {
    renderer.resetState();
    renderer.setViewport(0, 0, canvas.width, canvas.height);
    renderer.render(scene, camera);
  } finally {
    bridge.setThreeRendering(false);
    bridge.restoreGameState();
  }
}

bridge.setEnabled(true);
if (toast) toast.textContent = 'V9.1 THREE.JSASSETS FREE GLB 啟動';
if (eventFeed) eventFeed.textContent = 'Free GLB 車模與晴空資產載入完成';
window.NeonThreeAssetsV91 = {
  ready: true,
  version: '9.1',
  threeRevision: THREE.REVISION,
  loader: 'GLTFLoader + DRACOLoader',
  downloadedAt: THREEJSASSETS_DOWNLOADED_AT,
  assets: Object.fromEntries(Object.entries(THREEJSASSETS_FREE).map(([key, asset]) => [key, {
    name: asset.name,
    sourceUrl: asset.sourceUrl,
    license: asset.license,
    licenseUrl: asset.licenseUrl,
    sha256: asset.sha256,
    bytes: asset.bytes
  }]))
};
requestAnimationFrame(renderFrame);
