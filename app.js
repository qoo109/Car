import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/loaders/GLTFLoader.js";
import RAPIER from "https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.14.0/rapier.es.js";

const lapEl = document.getElementById("lap");
const rankEl = document.getElementById("rank");
const speedEl = document.getElementById("speed");
const driftScoreEl = document.getElementById("driftScore");
const aiStateEl = document.getElementById("aiState");
const nitroBar = document.getElementById("nitroBar");
const leaderboardEl = document.getElementById("leaderboard");
const minimap = document.getElementById("minimap");
const minimapCtx = minimap.getContext("2d");
const speedometer = document.getElementById("speedometer");
const speedCtx = speedometer.getContext("2d");
const startPanel = document.getElementById("start");
const startBtn = document.getElementById("startBtn");

const ui = {
  steerPad: document.getElementById("steerPad"),
  steerKnob: document.getElementById("steerKnob"),
  gas: document.getElementById("btnGas"),
  brake: document.getElementById("btnBrake"),
  nitro: document.getElementById("btnNitro"),
  drift: document.getElementById("btnDrift")
};

const keys = new Set();
const touchInput = { steer: 0, gas: false, brake: false, nitro: false, drift: false };

let running = false;
let last = 0;
let world;
let carTemplate = null;
let skidMarks = [];
let smokeParticles = [];
let raceFinished = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x08101b);
scene.fog = new THREE.Fog(0x08101b, 45, 260);

const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 800);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const hemi = new THREE.HemisphereLight(0xbfeeff, 0x1a0a25, 1.05);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffffff, 1.55);
sun.position.set(55, 75, -30);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -170;
sun.shadow.camera.right = 170;
sun.shadow.camera.top = 170;
sun.shadow.camera.bottom = -170;
scene.add(sun);

const track = { outerRx: 96, outerRz: 61, innerRx: 49, innerRz: 26 };
const checkpoints = [
  { x: 0, z: -55, name: "Start" },
  { x: 86, z: 0, name: "East" },
  { x: 0, z: 55, name: "South" },
  { x: -86, z: 0, name: "West" }
];

const personalities = [
  { name: "你", color: 0x00eaff, emoji: "🏎️", type: "Player" },
  { name: "AI Tiger", color: 0xff4b2b, emoji: "🐯", type: "攻擊", aggression: 1.25, caution: 0.55, overtake: 1.15 },
  { name: "AI Turtle", color: 0x5dff86, emoji: "🐢", type: "保守", aggression: 0.55, caution: 1.35, overtake: 0.72 },
  { name: "AI Eagle", color: 0xf6ff5d, emoji: "🦅", type: "抓線", aggression: 0.9, caution: 0.9, overtake: 1.35 },
  { name: "AI Fox", color: 0xff4fd8, emoji: "🦊", type: "假動作", aggression: 0.95, caution: 0.8, overtake: 1.45 },
  { name: "AI Bull", color: 0xb16bff, emoji: "🦬", type: "硬擠", aggression: 1.45, caution: 0.45, overtake: 0.95 }
];

let cars = [];
let player;

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function ellipseValue(x, z, rx, rz) { return (x*x)/(rx*rx) + (z*z)/(rz*rz); }
function onRoad(x, z) { return ellipseValue(x,z,track.outerRx,track.outerRz) <= 1 && ellipseValue(x,z,track.innerRx,track.innerRz) >= 1; }
function roadCenterAngle(x, z) { return Math.atan2(z / track.outerRz, x / track.outerRx); }
function roadCenterPoint(a) {
  const rx = (track.outerRx + track.innerRx) * 0.5;
  const rz = (track.outerRz + track.innerRz) * 0.5;
  return { x: Math.cos(a) * rx, z: Math.sin(a) * rz };
}
function makeMat(color, emissive = 0x000000, intensity = 0, roughness = 0.45, metalness = 0.2) {
  return new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: intensity, roughness, metalness });
}

function createAsphaltTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256; canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#151923"; ctx.fillRect(0,0,256,256);
  for (let i=0;i<4200;i++) {
    const v = 18 + Math.floor(Math.random()*45);
    ctx.fillStyle = `rgba(${v},${v+3},${v+8},${Math.random()*0.35})`;
    ctx.fillRect(Math.random()*256, Math.random()*256, 1+Math.random()*2, 1+Math.random()*2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8,5); tex.anisotropy = 4;
  return tex;
}

function createWorldVisuals() {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(460,460), makeMat(0x05100b,0,0,0.95,0));
  ground.rotation.x = -Math.PI/2; ground.receiveShadow = true; scene.add(ground);

  const roadShape = new THREE.Shape();
  roadShape.absellipse(0,0,track.outerRx,track.outerRz,0,Math.PI*2,false,0);
  const hole = new THREE.Path();
  hole.absellipse(0,0,track.innerRx,track.innerRz,0,Math.PI*2,true,0);
  roadShape.holes.push(hole);

  const road = new THREE.Mesh(new THREE.ShapeGeometry(roadShape,192), new THREE.MeshStandardMaterial({ color:0xffffff, map:createAsphaltTexture(), roughness:0.82, metalness:0.05 }));
  road.rotation.x = -Math.PI/2; road.position.y = 0.03; road.receiveShadow = true; scene.add(road);

  createCurbs(); createRoadLines(); createGuardRails(); createArrowSigns(); createLampPosts(); createTreesAndRocks(); createMountains(); createBridge(); createCity();
}

function createCurbs() {
  const red = makeMat(0xff213e,0x4a0010,0.25,0.5,0.1);
  const white = makeMat(0xffffff,0x222222,0.1,0.55,0.1);
  for (let i=0;i<112;i++) {
    const a = i/112*Math.PI*2, useRed = i%2===0;
    const outer = new THREE.Mesh(new THREE.BoxGeometry(3.8,0.13,0.9), useRed ? red : white);
    outer.position.set(Math.cos(a)*track.outerRx,0.16,Math.sin(a)*track.outerRz); outer.rotation.y = -a; scene.add(outer);
    const inner = new THREE.Mesh(new THREE.BoxGeometry(3.2,0.13,0.75), useRed ? white : red);
    inner.position.set(Math.cos(a)*track.innerRx,0.16,Math.sin(a)*track.innerRz); inner.rotation.y = -a; scene.add(inner);
  }
}

function createRoadLines() {
  const pts = [];
  for (let i=0;i<=260;i++) {
    const a = i/260*Math.PI*2;
    const p = roadCenterPoint(a);
    pts.push(new THREE.Vector3(p.x,0.1,p.z));
  }
  scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color:0xffffff, transparent:true, opacity:0.35 })));
  const addRing = (rx,rz,color) => {
    const ring = [];
    for (let i=0;i<=260;i++) {
      const a = i/260*Math.PI*2;
      ring.push(new THREE.Vector3(Math.cos(a)*rx,0.13,Math.sin(a)*rz));
    }
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ring), new THREE.LineBasicMaterial({ color })));
  };
  addRing(track.outerRx, track.outerRz, 0x00eaff);
  addRing(track.innerRx, track.innerRz, 0xff3ee8);
}

function createGuardRails() {
  const railMat = makeMat(0x0b1728,0x003b55,0.5,0.3,0.55);
  for (let i=0;i<92;i++) {
    const a = i/92*Math.PI*2;
    const rail = new THREE.Mesh(new THREE.BoxGeometry(3.4,0.58,0.36), railMat);
    rail.position.set(Math.cos(a)*103,0.65,Math.sin(a)*67); rail.rotation.y = -a; rail.castShadow = true; scene.add(rail);
  }
}

function createArrowSigns() {
  const arrowMat = makeMat(0xffc400,0xff8c00,1.25,0.28,0.15);
  const blackMat = makeMat(0x080808,0,0,0.5,0.2);
  [[80,-25,-0.78],[89,-5,-1.03],[82,21,-1.25],[-80,25,2.35],[-89,5,2.1],[-82,-21,1.82]].forEach(([x,z,rot]) => {
    const group = new THREE.Group();
    const board = new THREE.Mesh(new THREE.BoxGeometry(8.2,3.5,0.28), blackMat);
    board.position.y = 2.6; group.add(board);
    for (let i=-1;i<=1;i++) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(1.15,2.38,0.36), arrowMat);
      c.position.set(i*1.72,2.6,0.2); c.rotation.z = Math.PI/5; group.add(c);
    }
    group.position.set(x,0,z); group.rotation.y = rot; scene.add(group);
  });
}

function createLampPosts() {
  const poleMat = makeMat(0x111822,0x001522,0.2,0.35,0.5);
  for (let i=0;i<22;i++) {
    const a = i/22*Math.PI*2, x = Math.cos(a)*112, z = Math.sin(a)*72;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.13,0.18,7,10), poleMat);
    pole.position.set(x,3.5,z); scene.add(pole);
    const lightBox = new THREE.Mesh(new THREE.BoxGeometry(1.6,0.35,0.55), makeMat(0x9df7ff,0x00eaff,1.8,0.2,0.1));
    lightBox.position.set(x,7.1,z); lightBox.rotation.y = -a; scene.add(lightBox);
    const light = new THREE.PointLight(0x72f5ff,0.8,24); light.position.set(x,6.8,z); scene.add(light);
  }
}

function createTreesAndRocks() {
  const trunkMat = makeMat(0x3a2110,0,0,0.8,0), leafMat = makeMat(0x0b3c24,0x002010,0.15,0.9,0), rockMat = makeMat(0x4d555f,0,0,0.8,0.05);
  for (let i=0;i<95;i++) {
    const a = Math.random()*Math.PI*2, r = Math.random()>0.45 ? 126+Math.random()*70 : 18+Math.random()*18;
    const x = Math.cos(a)*r, z = Math.sin(a)*r; if (onRoad(x,z)) continue;
    const group = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25,0.34,3.2,8), trunkMat); trunk.position.y=1.6; group.add(trunk);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(1.7,5.2,8), leafMat); crown.position.y=5.1; crown.castShadow=true; group.add(crown);
    group.position.set(x,0,z); group.rotation.y=Math.random()*Math.PI; scene.add(group);
  }
  for (let i=0;i<42;i++) {
    const a=Math.random()*Math.PI*2, r=118+Math.random()*70;
    const rock=new THREE.Mesh(new THREE.DodecahedronGeometry(1.2+Math.random()*1.6,0), rockMat);
    rock.position.set(Math.cos(a)*r,0.8,Math.sin(a)*r); rock.scale.y=0.5+Math.random()*0.6; rock.castShadow=true; scene.add(rock);
  }
}

function createMountains() {
  const mat = makeMat(0x172033,0x02040a,0.2,0.82,0.02);
  for (let i=0;i<18;i++) {
    const a=i/18*Math.PI*2;
    const m=new THREE.Mesh(new THREE.ConeGeometry(18+Math.random()*12,32+Math.random()*25,6),mat);
    m.position.set(Math.cos(a)*(195+Math.random()*32),13,Math.sin(a)*(195+Math.random()*32)); m.rotation.y=Math.random()*Math.PI; scene.add(m);
  }
}

function createBridge() {
  const mat = makeMat(0x101820,0x001522,0.25,0.35,0.3);
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(56,0.55,7.2), mat);
  bridge.position.set(0,0.55,55); bridge.receiveShadow=true; bridge.castShadow=true; scene.add(bridge);
}

function createCity() {
  const mat = makeMat(0x091224,0x001d36,0.65,0.4,0.2);
  for (let i=0;i<70;i++) {
    const a=Math.random()*Math.PI*2, r=142+Math.random()*75, h=9+Math.random()*42;
    const b=new THREE.Mesh(new THREE.BoxGeometry(4+Math.random()*7,h,4+Math.random()*7),mat);
    b.position.set(Math.cos(a)*r,h/2,Math.sin(a)*r); b.castShadow=true; b.receiveShadow=true; scene.add(b);
    if (Math.random()>0.55) {
      const light=new THREE.PointLight(Math.random()>0.5?0x00eaff:0xff3ee8,0.75,26);
      light.position.set(b.position.x,h+1,b.position.z); scene.add(light);
    }
  }
}

function initRapierWorld() {
  world = new RAPIER.World({ x: 0, y: 0, z: 0 });

  const groundBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.08, 0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(240, 0.05, 240), groundBody);

  // 真正物理護欄：用 Rapier 固定碰撞箱排成橢圓外圈與內圈
  for (let i=0;i<96;i++) {
    const a = i/96*Math.PI*2;
    const outer = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(Math.cos(a)*104, 0.65, Math.sin(a)*67).setRotation({x:0,y:Math.sin(-a/2),z:0,w:Math.cos(-a/2)}));
    world.createCollider(RAPIER.ColliderDesc.cuboid(1.8,0.45,0.28).setFriction(1.0).setRestitution(0.15), outer);

    const inner = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(Math.cos(a)*44, 0.65, Math.sin(a)*23).setRotation({x:0,y:Math.sin(-a/2),z:0,w:Math.cos(-a/2)}));
    world.createCollider(RAPIER.ColliderDesc.cuboid(1.45,0.45,0.28).setFriction(1.0).setRestitution(0.1), inner);
  }
}

async function loadCarTemplate() {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync("./assets/cars/neon-supercar.gltf");
  carTemplate = gltf.scene;
  carTemplate.traverse(o => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
}

function createFallbackCar(color) {
  const g = new THREE.Group();
  const mat = makeMat(color, color, 0.75, 0.32, 0.35);
  const dark = makeMat(0x05080e, color, 0.12, 0.28, 0.65);
  const body = new THREE.Mesh(new THREE.BoxGeometry(4.4,0.8,7.2), mat);
  body.position.y=0.75; body.castShadow=true; g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.55,0.85,2.25), dark);
  cabin.position.set(0,1.55,0.05); cabin.castShadow=true; g.add(cabin);
  return g;
}

function tintModel(model, color, isPlayer=false) {
  model.traverse(o => {
    if (!o.isMesh) return;
    const name = (o.material?.name || "").toLowerCase();
    if (name.includes("body") || name.includes("cyan")) {
      o.material = o.material.clone();
      o.material.color.setHex(color);
      o.material.emissive.setHex(color);
      o.material.emissiveIntensity = isPlayer ? 0.75 : 0.45;
    }
  });
}

function createCar(config, isPlayer=false) {
  const mesh = carTemplate ? carTemplate.clone(true) : createFallbackCar(config.color);
  tintModel(mesh, config.color, isPlayer);
  scene.add(mesh);

  const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(0, 0.72, -47)
    .setLinearDamping(0.45)
    .setAngularDamping(2.8)
    .setCanSleep(false);

  const body = world.createRigidBody(bodyDesc);
  body.setEnabledRotations(false, true, false, true);
  const collider = world.createCollider(
    RAPIER.ColliderDesc.cuboid(2.15, 0.55, 3.25)
      .setMass(1.1)
      .setFriction(1.15)
      .setRestitution(0.08),
    body
  );

  return {
    name: config.name, emoji: config.emoji, type: config.type, color: config.color,
    mesh, body, collider,
    x: 0, z: -47, angle: Math.PI, yawVel: 0, speed: 0,
    lap: 1, cp: 0, progress: 0, nitro: 1, driftScore: 0, combo: 1,
    isDrifting: false, isPlayer, finished: false,
    maxSpeed: isPlayer ? 86 : 68 + Math.random()*12,
    accel: isPlayer ? 62 : 44 + Math.random()*12,
    brake: isPlayer ? 72 : 48,
    steerPower: isPlayer ? 2.8 : 2.25,
    grip: isPlayer ? 0.78 : 0.84,
    aiMode: isPlayer ? "玩家" : "巡航",
    aggression: config.aggression || 1, caution: config.caution || 1, overtake: config.overtake || 1,
    overtakeSide: Math.random() > 0.5 ? 1 : -1
  };
}

function syncCarFromPhysics(car) {
  const p = car.body.translation();
  const q = car.body.rotation();
  car.x = p.x; car.z = p.z;
  car.mesh.position.set(p.x, 0, p.z);
  car.mesh.quaternion.set(q.x, q.y, q.z, q.w);
  car.mesh.rotation.x = 0;
  car.mesh.rotation.z = 0;
}

function getForwardFromAngle(angle) { return { x: -Math.sin(angle), z: -Math.cos(angle) }; }
function getRightFromAngle(angle) { return { x: Math.cos(angle), z: -Math.sin(angle) }; }
function carSpeed(car) {
  const v = car.body.linvel();
  return Math.hypot(v.x, v.z);
}

function updateCarPhysics(car, controls, dt) {
  const lin = car.body.linvel();
  const speed = Math.hypot(lin.x, lin.z);
  car.speed = speed;

  const forward = getForwardFromAngle(car.angle);
  const right = getRightFromAngle(car.angle);
  const fwdSpeed = lin.x * forward.x + lin.z * forward.z;
  const sideSpeed = lin.x * right.x + lin.z * right.z;

  const driftIntent = controls.drift && speed > 16;
  const usingNitro = controls.nitro && car.nitro > 0 && fwdSpeed > 14;

  if (controls.throttle > 0) {
    const boost = usingNitro ? 1.6 : 1;
    car.body.addForce({ x: forward.x * car.accel * controls.throttle * boost, y: 0, z: forward.z * car.accel * controls.throttle * boost }, true);
  }
  if (controls.brake > 0) {
    car.body.addForce({ x: -forward.x * car.brake * controls.brake, y: 0, z: -forward.z * car.brake * controls.brake }, true);
  }

  if (usingNitro) {
    car.nitro = Math.max(0, car.nitro - 0.32 * dt);
    spawnSmoke(car, 0x79f7ff, 0.8);
  } else {
    car.nitro = Math.min(1, car.nitro + 0.08 * dt);
  }

  const steerScale = clamp(speed / 35, 0.16, 1);
  const yawBoost = driftIntent ? 1.45 : 1;
  car.yawVel += controls.steer * car.steerPower * steerScale * yawBoost * dt;
  car.yawVel *= Math.pow(driftIntent ? 0.92 : 0.78, dt * 60);
  car.angle += car.yawVel;

  const grip = driftIntent ? 0.18 : car.grip;
  car.body.addForce({ x: -right.x * sideSpeed * grip * 13.5, y: 0, z: -right.z * sideSpeed * grip * 13.5 }, true);

  const max = usingNitro ? car.maxSpeed * 1.35 : car.maxSpeed;
  const curr = car.body.linvel();
  const currSpeed = Math.hypot(curr.x, curr.z);
  if (currSpeed > max) {
    const scale = max / currSpeed;
    car.body.setLinvel({ x: curr.x * scale, y: 0, z: curr.z * scale }, true);
  }

  if (!onRoad(car.x, car.z)) {
    const a = roadCenterAngle(car.x, car.z);
    const center = roadCenterPoint(a);
    const pull = { x: (center.x - car.x) * 3.2, y: 0, z: (center.z - car.z) * 3.2 };
    car.body.addForce(pull, true);
    const v = car.body.linvel();
    car.body.setLinvel({ x: v.x * 0.96, y: 0, z: v.z * 0.96 }, true);
  }

  const half = car.angle / 2;
  car.body.setRotation({ x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) }, true);

  const slip = Math.abs(sideSpeed);
  car.isDrifting = (driftIntent || slip > 8.5) && speed > 21;

  if (car.isDrifting) {
    if (Math.random() > 0.48) addSkidMark(car);
    spawnSmoke(car, 0xdde6ee, 0.65);
    if (car.isPlayer) {
      car.combo += dt * 0.18;
      car.driftScore += Math.round((slip + speed * 0.12) * car.combo * dt * 9);
    }
  } else if (car.isPlayer) {
    car.combo = Math.max(1, car.combo - dt * 0.5);
  }

  checkCheckpoint(car);
}

function checkCheckpoint(car) {
  const target = checkpoints[car.cp];
  const d = Math.hypot(car.x - target.x, car.z - target.z);
  if (d < 19) {
    car.cp = (car.cp + 1) % checkpoints.length;
    if (car.cp === 0) {
      car.lap++;
      if (car.lap > 3) car.finished = true;
    }
  }
  car.progress = (car.lap - 1) * checkpoints.length + car.cp + (1 - Math.min(d / 145, 1));
}

function addSkidMark(car) {
  if (skidMarks.length > 240) {
    const old = skidMarks.shift(); scene.remove(old); old.geometry.dispose(); old.material.dispose();
  }
  const mark = new THREE.Mesh(
    new THREE.PlaneGeometry(1.15, 4.9),
    new THREE.MeshBasicMaterial({ color: 0x030303, transparent: true, opacity: 0.35, depthWrite: false })
  );
  mark.rotation.x = -Math.PI/2; mark.rotation.z = -car.angle; mark.position.set(car.x,0.042,car.z);
  scene.add(mark); skidMarks.push(mark);
}

function spawnSmoke(car, color=0xdde6ee, strength=1) {
  if (smokeParticles.length > 260) {
    const s=smokeParticles.shift(); scene.remove(s.mesh); s.mesh.geometry.dispose(); s.mesh.material.dispose();
  }
  const forward = getForwardFromAngle(car.angle), right = getRightFromAngle(car.angle);
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.45+Math.random()*0.5,8,8), new THREE.MeshBasicMaterial({ color, transparent:true, opacity:0.28*strength, depthWrite:false }));
  const side = Math.random() > 0.5 ? 1 : -1;
  mesh.position.set(car.x - forward.x*3.4 + right.x*side*1.3, 0.45, car.z - forward.z*3.4 + right.z*side*1.3);
  scene.add(mesh);
  smokeParticles.push({ mesh, life:0.72+Math.random()*0.35, vx:-forward.x*2+(Math.random()-0.5)*2, vz:-forward.z*2+(Math.random()-0.5)*2 });
}

function updateSmoke(dt) {
  for (let i=smokeParticles.length-1;i>=0;i--) {
    const s = smokeParticles[i];
    s.life -= dt; s.mesh.position.x += s.vx*dt; s.mesh.position.z += s.vz*dt; s.mesh.position.y += 0.9*dt; s.mesh.scale.multiplyScalar(1+dt*1.8);
    s.mesh.material.opacity = Math.max(0, s.life*0.25);
    if (s.life <= 0) {
      scene.remove(s.mesh); s.mesh.geometry.dispose(); s.mesh.material.dispose(); smokeParticles.splice(i,1);
    }
  }
}

function targetAngleTo(car, target) {
  return Math.atan2(-(target.x - car.x), -(target.z - car.z));
}
function angleDiff(a,b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI*2;
  while (d < -Math.PI) d += Math.PI*2;
  return d;
}

function updatePlayer(dt) {
  const steerKeyboard = (keys.has("KeyA") || keys.has("ArrowLeft") ? -1 : 0) + (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0);
  updateCarPhysics(player, {
    throttle: keys.has("KeyW") || keys.has("ArrowUp") || touchInput.gas ? 1 : 0,
    brake: keys.has("KeyS") || keys.has("ArrowDown") || touchInput.brake ? 1 : 0,
    steer: clamp(steerKeyboard + touchInput.steer, -1, 1),
    nitro: keys.has("ShiftLeft") || keys.has("ShiftRight") || touchInput.nitro,
    drift: keys.has("Space") || touchInput.drift
  }, dt);
}

function updateAI(car, dt) {
  const distToPlayer = Math.hypot(player.x - car.x, player.z - car.z);
  const playerAhead = player.progress > car.progress || player.lap > car.lap;
  const aiAhead = car.progress > player.progress && car.lap >= player.lap;

  let mode = "巡航", target = checkpoints[car.cp], throttle = 0.86, brake = 0, drift = false, nitro = false;
  const aheadCar = cars.filter(c => c !== car).sort((a,b) => Math.hypot(a.x-car.x,a.z-car.z) - Math.hypot(b.x-car.x,b.z-car.z))[0];

  if (distToPlayer < 24 && aiAhead && car.aggression > 0.8) {
    mode = "阻擋";
    const f = getForwardFromAngle(player.angle);
    target = { x: player.x + f.x*5, z: player.z + f.z*5 };
    throttle = 0.72 + car.aggression * 0.12;
  } else if (playerAhead && distToPlayer < 64) {
    mode = "追擊"; target = { x: player.x, z: player.z }; throttle = 1; nitro = car.nitro > 0.28 && car.aggression > 0.75;
  } else if (aheadCar && Math.hypot(aheadCar.x-car.x,aheadCar.z-car.z) < 25) {
    mode = "超車";
    const side = car.overtakeSide * car.overtake;
    target = { x: aheadCar.x + Math.cos(aheadCar.angle)*side*9, z: aheadCar.z - Math.sin(aheadCar.angle)*side*9 };
    throttle = 0.95 + car.aggression * 0.08;
  } else if (car.type === "保守" && carSpeed(car) > car.maxSpeed*0.78) {
    mode = "穩線"; throttle = 0.72; brake = 0.12;
  } else if (car.type === "假動作" && distToPlayer < 42) {
    mode = "假動作"; car.overtakeSide = Math.sin(performance.now()*0.004)>0 ? 1 : -1;
    target = { x: checkpoints[car.cp].x + car.overtakeSide*10, z: checkpoints[car.cp].z };
    throttle = 0.92;
  }

  const desired = targetAngleTo(car, target);
  const diff = angleDiff(desired, car.angle);
  let steer = clamp(diff * 1.55, -1, 1);
  if (Math.abs(diff) > 0.58 && carSpeed(car) > 34) {
    drift = car.type !== "保守" || Math.abs(diff) > 0.9;
    brake = car.caution > 1 ? 0.18 : 0.05;
  }
  if (car.type === "硬擠" && distToPlayer < 18) { steer *= 1.2; throttle = 1; }

  car.aiMode = mode;
  updateCarPhysics(car, { throttle, brake, steer, nitro, drift }, dt);
}

function drawMinimap() {
  const ctx = minimapCtx;
  ctx.clearRect(0,0,minimap.width,minimap.height);
  ctx.save();
  ctx.translate(minimap.width/2, minimap.height/2);
  ctx.scale(0.92,0.92);
  ctx.strokeStyle="rgba(0,234,255,.95)"; ctx.lineWidth=4; ctx.beginPath(); ctx.ellipse(0,0,track.outerRx,track.outerRz,0,0,Math.PI*2); ctx.stroke();
  ctx.strokeStyle="rgba(255,62,232,.85)"; ctx.lineWidth=3; ctx.beginPath(); ctx.ellipse(0,0,track.innerRx,track.innerRz,0,0,Math.PI*2); ctx.stroke();
  cars.forEach(c => { ctx.fillStyle = c.isPlayer ? "#00eaff" : "#ffffff"; ctx.beginPath(); ctx.arc(c.x,c.z,c.isPlayer?4.4:3.2,0,Math.PI*2); ctx.fill(); });
  ctx.restore();
}

function drawSpeedometer() {
  const ctx = speedCtx, w=speedometer.width, h=speedometer.height, cx=w/2, cy=h/2;
  const speed = Math.round(carSpeed(player)*4.2), pct = Math.min(speed/470,1), start=Math.PI*0.78, end=Math.PI*2.22, angle=start+(end-start)*pct;
  ctx.clearRect(0,0,w,h);
  ctx.lineWidth=9; ctx.strokeStyle="rgba(255,255,255,.18)"; ctx.beginPath(); ctx.arc(cx,cy,70,start,end); ctx.stroke();
  ctx.strokeStyle="#00eaff"; ctx.beginPath(); ctx.arc(cx,cy,70,start,angle); ctx.stroke();
  ctx.save(); ctx.translate(cx,cy); ctx.rotate(angle); ctx.strokeStyle="#ff3ee8"; ctx.lineWidth=4; ctx.beginPath(); ctx.moveTo(-8,0); ctx.lineTo(58,0); ctx.stroke(); ctx.restore();
  ctx.fillStyle="#ffffff"; ctx.font="bold 38px Arial"; ctx.textAlign="center"; ctx.fillText(speed,cx,cy+18);
  ctx.fillStyle="rgba(255,255,255,.75)"; ctx.font="14px Arial"; ctx.fillText("KM/H",cx,cy+42);
  ctx.fillStyle="#00eaff"; ctx.font="bold 16px Arial"; ctx.fillText(player.isDrifting ? "DRIFT" : "RAPIER", cx, cy - 42);
}

function drawLeaderboard() {
  const ranked = [...cars].sort((a,b) => (b.lap*10+b.progress) - (a.lap*10+a.progress));
  leaderboardEl.innerHTML = `<div class="boardTitle">POSITION</div>` + ranked.map((c,i) => {
    const cls = c.isPlayer ? "row me" : "row";
    return `<div class="${cls}"><span>${String(i+1).padStart(2,"0")} ${c.emoji} ${c.name}</span><span>${c.aiMode || "玩家"}</span></div>`;
  }).join("");
  rankEl.textContent = ranked.findIndex(c => c === player) + 1;
}

function updateHUD() {
  lapEl.textContent = Math.min(player.lap,3);
  speedEl.textContent = Math.round(carSpeed(player)*4.2);
  driftScoreEl.textContent = player.driftScore;
  nitroBar.style.width = `${Math.round(player.nitro*100)}%`;
  const nearestAI = cars.slice(1).sort((a,b) => Math.hypot(a.x-player.x,a.z-player.z)-Math.hypot(b.x-player.x,b.z-player.z))[0];
  aiStateEl.textContent = nearestAI ? `${nearestAI.emoji} ${nearestAI.aiMode}` : "無";
  drawLeaderboard(); drawMinimap(); drawSpeedometer();
}

function updateCamera(dt) {
  const speed = carSpeed(player), forward = getForwardFromAngle(player.angle), right = getRightFromAngle(player.angle);
  const back = 13 + clamp(speed/84,0,1)*6, height = 5.2 + clamp(speed/84,0,1)*3.8;
  const cam = new THREE.Vector3(player.x - forward.x*back + right.x*player.yawVel*5, height, player.z - forward.z*back + right.z*player.yawVel*5);
  camera.position.lerp(cam, 1 - Math.pow(0.002, dt));
  camera.fov = lerp(camera.fov, 68 + clamp(speed/84,0,1)*10, dt*2.5);
  camera.updateProjectionMatrix();
  camera.lookAt(player.x + forward.x*8, 1.9, player.z + forward.z*8);
}

function bindButton(button, key) {
  const set = v => { touchInput[key] = v; button.classList.toggle("active", v); };
  ["touchstart","pointerdown"].forEach(type => button.addEventListener(type, e => { e.preventDefault(); set(true); }, { passive:false }));
  ["touchend","touchcancel","pointerup","pointerleave"].forEach(type => button.addEventListener(type, e => { e.preventDefault(); set(false); }, { passive:false }));
}

function setupMobileControls() {
  bindButton(ui.gas,"gas"); bindButton(ui.brake,"brake"); bindButton(ui.nitro,"nitro"); bindButton(ui.drift,"drift");
  let activePointer = null;
  const updateSteer = (clientX, clientY) => {
    const rect = ui.steerPad.getBoundingClientRect(), cx=rect.left+rect.width/2, cy=rect.top+rect.height/2;
    const dx=clientX-cx, dy=clientY-cy, max=rect.width*0.38;
    const nx=clamp(dx/max,-1,1), ny=clamp(dy/max,-1,1), len=Math.min(1,Math.hypot(nx,ny)), angle=Math.atan2(ny,nx);
    const kx=Math.cos(angle)*len*max, ky=Math.sin(angle)*len*max;
    touchInput.steer = clamp(nx,-1,1);
    ui.steerKnob.style.transform = `translate(${kx}px, ${ky}px)`;
  };
  const reset = () => { touchInput.steer = 0; ui.steerKnob.style.transform = "translate(0px, 0px)"; activePointer = null; };
  ui.steerPad.addEventListener("pointerdown", e => { e.preventDefault(); activePointer = e.pointerId; ui.steerPad.setPointerCapture(e.pointerId); updateSteer(e.clientX,e.clientY); });
  ui.steerPad.addEventListener("pointermove", e => { if (activePointer !== e.pointerId) return; e.preventDefault(); updateSteer(e.clientX,e.clientY); });
  ui.steerPad.addEventListener("pointerup", e => { if (activePointer === e.pointerId) reset(); });
  ui.steerPad.addEventListener("pointercancel", reset);
  document.addEventListener("touchmove", e => e.preventDefault(), { passive:false });
}

function resetGame() {
  const startPositions = [[0,-48],[-8,-49],[8,-49],[-16,-45],[16,-45],[0,-40]];
  cars.forEach((c,i) => {
    c.body.setTranslation({ x:startPositions[i][0], y:0.72, z:startPositions[i][1] }, true);
    c.body.setLinvel({ x:0, y:0, z:0 }, true);
    c.body.setAngvel({ x:0, y:0, z:0 }, true);
    c.angle = Math.PI; c.yawVel = 0; c.speed = 0; c.lap = 1; c.cp = 0; c.progress = 0; c.nitro = 1; c.driftScore = 0; c.combo = 1; c.finished = false; c.aiMode = c.isPlayer ? "玩家" : "巡航";
    const half = c.angle / 2;
    c.body.setRotation({ x:0, y:Math.sin(half), z:0, w:Math.cos(half) }, true);
    syncCarFromPhysics(c);
  });
  raceFinished = false;
}

function finishRace() {
  if (raceFinished) return;
  raceFinished = true; running = false;
  startPanel.style.display = "flex";
  startPanel.querySelector("h1").textContent = "FINISH!";
  startPanel.querySelector("p").textContent = `完成比賽！漂移分數：${player.driftScore}`;
  startBtn.textContent = "重新開始";
}

function loop(t=0) {
  const dt = Math.min((t-last)/1000, 0.033);
  last = t;

  if (running) {
    updatePlayer(dt);
    cars.slice(1).forEach(c => updateAI(c, dt));
    world.timestep = dt;
    world.step();
    cars.forEach(syncCarFromPhysics);
    if (player.finished) finishRace();
  } else if (world) {
    world.timestep = dt;
    world.step();
    cars.forEach(syncCarFromPhysics);
  }

  updateSmoke(dt);
  if (player) {
    updateCamera(dt);
    updateHUD();
  }
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

async function init() {
  await RAPIER.init();
  initRapierWorld();
  createWorldVisuals();

  try {
    await loadCarTemplate();
  } catch (e) {
    console.warn("GLTF load failed, using fallback car model.", e);
  }

  cars = personalities.map((p,i) => createCar(p, i === 0));
  player = cars[0];
  resetGame();
  setupMobileControls();

  camera.position.set(0,10,-24);
  camera.lookAt(0,0,-40);

  startBtn.addEventListener("click", () => {
    resetGame();
    running = true;
    startPanel.style.display = "none";
  });

  requestAnimationFrame(loop);
}

window.addEventListener("keydown", e => {
  keys.add(e.code);
  if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space","ShiftLeft","ShiftRight"].includes(e.code)) e.preventDefault();
});
window.addEventListener("keyup", e => keys.delete(e.code));
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

init();
