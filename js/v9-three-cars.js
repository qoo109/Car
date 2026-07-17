import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Vehicle asset: Khronos glTF Sample Assets "Toy Car" by Adobe, CC0 1.0.
const MODEL_URL = 'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Assets@main/Models/ToyCar/glTF-Binary/ToyCar.glb';

const waitForBridge = async () => {
  for (let attempt = 0; attempt < 300; attempt += 1) {
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
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = false;
bridge.setThreeRendering(false);
bridge.restoreGameState();

const scene = new THREE.Scene();
const camera = new THREE.Camera();
camera.matrixAutoUpdate = false;
scene.add(new THREE.HemisphereLight(0xddeaff, 0x392554, 1.85));
const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
keyLight.position.set(-7, 12, -6);
scene.add(keyLight);
const rimLight = new THREE.DirectionalLight(0x9362ff, 1.35);
rimLight.position.set(8, 5, -11);
scene.add(rimLight);

function removeEmbeddedCameras(root) {
  const cameras = [];
  root.traverse((object) => { if (object.isCamera) cameras.push(object); });
  cameras.forEach((object) => object.parent?.remove(object));
}

function prepareSourceModel(root) {
  removeEmbeddedCameras(root);
  const wrapper = new THREE.Group();
  wrapper.name = 'NormalizedToyCar';
  wrapper.add(root);
  root.updateMatrixWorld(true);

  let bounds = new THREE.Box3().setFromObject(root);
  let size = bounds.getSize(new THREE.Vector3());
  if (size.x > size.z) root.rotation.y = -Math.PI / 2;
  root.updateMatrixWorld(true);

  bounds = new THREE.Box3().setFromObject(root);
  size = bounds.getSize(new THREE.Vector3());
  const horizontalLength = Math.max(size.x, size.z);
  const scale = horizontalLength > 0 ? 5.75 / horizontalLength : 1;
  root.scale.multiplyScalar(scale);
  root.updateMatrixWorld(true);

  bounds = new THREE.Box3().setFromObject(root);
  const center = bounds.getCenter(new THREE.Vector3());
  root.position.x -= center.x;
  root.position.z -= center.z;
  root.position.y += -0.96 - bounds.min.y;
  root.updateMatrixWorld(true);

  addTwinStripes(wrapper);
  wrapper.updateMatrixWorld(true);
  return wrapper;
}

function addTwinStripes(root) {
  const material = new THREE.MeshStandardMaterial({
    name: 'ReferenceTwinStripe',
    color: 0xf5f6ff,
    roughness: 0.38,
    metalness: 0.05
  });
  const stripeGroup = new THREE.Group();
  stripeGroup.name = 'ReferenceTwinStripes';
  const sections = [
    { y: 0.62, z: 1.46, length: 2.00, pitch: -0.04 },
    { y: 1.48, z: -0.12, length: 1.42, pitch: 0 },
    { y: 0.78, z: -1.55, length: 1.18, pitch: 0.10 }
  ];
  for (const x of [-0.24, 0.24]) {
    for (const section of sections) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.028, section.length), material);
      mesh.position.set(x, section.y, section.z);
      mesh.rotation.x = section.pitch;
      stripeGroup.add(mesh);
    }
  }
  root.add(stripeGroup);
}

function installBodyTint(material, targetColor) {
  const name = String(material.name || '').toLowerCase();
  if (name.includes('glass') || name.includes('fabric') || !material.map) return false;

  material = material.clone();
  material.userData.bodyTint = targetColor.clone();
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uNeonBodyTint = { value: material.userData.bodyTint };
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>\n        float neonMaxRB = max(diffuseColor.r, diffuseColor.b);\n        float neonGreenDominance = diffuseColor.g - neonMaxRB;\n        float neonMaxC = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b));\n        float neonMinC = min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b));\n        float neonSaturation = neonMaxC - neonMinC;\n        float neonBodyMask = smoothstep(0.025, 0.19, neonGreenDominance) * smoothstep(0.055, 0.28, neonSaturation);\n        float neonValue = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));\n        vec3 neonPaint = uNeonBodyTint * (0.42 + neonValue * 1.02);\n        diffuseColor.rgb = mix(diffuseColor.rgb, neonPaint, neonBodyMask);`
    );
    material.userData.shader = shader;
  };
  material.customProgramCacheKey = () => 'neon-toy-body-tint-v90';
  material.needsUpdate = true;
  return material;
}

const loader = new GLTFLoader();
let sourceModel;
try {
  const gltf = await loader.loadAsync(MODEL_URL);
  sourceModel = prepareSourceModel(gltf.scene);
} catch (error) {
  console.error('GLB car model failed to load:', error);
  bridge.setEnabled(false);
  if (eventFeed) eventFeed.textContent = 'GLB 車模載入失敗，已保留原車模';
  throw error;
}

const instances = [];
const tempMatrix = new THREE.Matrix4();
const tempPosition = new THREE.Vector3();
const tempQuaternion = new THREE.Quaternion();
const tempScale = new THREE.Vector3();
let lastTime = performance.now();

function createInstance() {
  const root = sourceModel.clone(true);
  const tintedMaterials = [];
  const seenMaterials = new Map();

  root.traverse((object) => {
    if (!object.isMesh) return;
    object.frustumCulled = false;
    const originals = Array.isArray(object.material) ? object.material : [object.material];
    const replacements = originals.map((originalMaterial) => {
      if (seenMaterials.has(originalMaterial.uuid)) return seenMaterials.get(originalMaterial.uuid);

      const tint = new THREE.Color(0.18, 0.42, 0.95);
      let material = installBodyTint(originalMaterial, tint);
      if (!material) {
        material = originalMaterial.clone();
        const materialName = String(material.name || '').toLowerCase();
        if (materialName.includes('glass')) {
          material.transmission = 0;
          material.transparent = true;
          material.opacity = 0.58;
          material.depthWrite = false;
          material.roughness = Math.max(0.1, material.roughness || 0.1);
        }
      } else {
        tintedMaterials.push(material);
      }
      seenMaterials.set(originalMaterial.uuid, material);
      return material;
    });
    object.material = Array.isArray(object.material) ? replacements : replacements[0];
  });

  root.visible = false;
  scene.add(root);
  return { root, tintedMaterials, colorKey: '' };
}

function applyBodyColor(instance, color) {
  const key = color.map((value) => value.toFixed(3)).join(',');
  if (instance.colorKey === key) return;
  instance.colorKey = key;
  const tint = new THREE.Color(color[0], color[1], color[2]);
  for (const material of instance.tintedMaterials) {
    material.userData.bodyTint.copy(tint);
    material.userData.shader?.uniforms?.uNeonBodyTint?.value.copy(tint);
  }
}

function updateCamera(snapshot) {
  if (!snapshot.view || !snapshot.projection) return false;
  camera.projectionMatrix.fromArray(snapshot.projection);
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  camera.matrixWorldInverse.fromArray(snapshot.view);
  camera.matrixWorld.copy(camera.matrixWorldInverse).invert();
  camera.position.setFromMatrixPosition(camera.matrixWorld);
  return true;
}

function updateCars(snapshot) {
  while (instances.length < snapshot.cars.length) instances.push(createInstance());
  instances.forEach((instance, index) => {
    const capture = snapshot.cars[index];
    instance.root.visible = !!capture;
    if (!capture) return;

    tempMatrix.fromArray(capture.matrix);
    tempMatrix.decompose(tempPosition, tempQuaternion, tempScale);
    instance.root.position.copy(tempPosition);
    instance.root.quaternion.copy(tempQuaternion);
    instance.root.scale.set(1, 1, 1);
    applyBodyColor(instance, capture.color);
  });
}

function renderFrame(now) {
  requestAnimationFrame(renderFrame);
  lastTime = now;
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
if (toast) toast.textContent = 'V9.0 THREE.JS · GLB 車模啟動';
if (eventFeed) eventFeed.textContent = 'Three.js GLB 車模載入完成';
window.NeonThreeCarsV90 = {
  version: '9.0',
  threeRevision: THREE.REVISION,
  loader: 'GLTFLoader',
  model: MODEL_URL,
  license: 'CC0 1.0'
};
requestAnimationFrame(renderFrame);
