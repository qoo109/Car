import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js";

const lapEl = document.getElementById("lap");
const rankEl = document.getElementById("rank");
const speedEl = document.getElementById("speed");
const aiStateEl = document.getElementById("aiState");
const audioStateEl = document.getElementById("audioState");
const nitroBar = document.getElementById("nitroBar");
const startPanel = document.getElementById("start");
const startBtn = document.getElementById("startBtn");

const keys = new Set();
let running = false;
let last = 0;
let rain = false;
let night = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x02040a);
scene.fog = new THREE.Fog(0x02040a, 45, 250);

const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 700);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const hemi = new THREE.HemisphereLight(0x9df7ff, 0x080018, 1.05);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffffff, 1.45);
sun.position.set(32, 56, 24);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
scene.add(sun);

const track = { outerRx: 88, outerRz: 56, innerRx: 48, innerRz: 25 };
const checkpoints = [
  { x: 0, z: -52, name: "Start" },
  { x: 78, z: 0, name: "East" },
  { x: 0, z: 52, name: "South" },
  { x: -78, z: 0, name: "West" }
];

const audio = {
  ctx: null, master: null, engineOsc: null, engineGain: null,
  driftGain: null, nitroGain: null, musicGain: null,
  started: false, lastCrash: 0
};

function startAudio() {
  if (audio.started) return;
  audio.ctx = new (window.AudioContext || window.webkitAudioContext)();
  audio.master = audio.ctx.createGain();
  audio.master.gain.value = 0.45;
  audio.master.connect(audio.ctx.destination);

  audio.engineOsc = audio.ctx.createOscillator();
  audio.engineOsc.type = "sawtooth";
  audio.engineGain = audio.ctx.createGain();
  audio.engineGain.gain.value = 0.05;
  const engineFilter = audio.ctx.createBiquadFilter();
  engineFilter.type = "lowpass";
  engineFilter.frequency.value = 480;
  audio.engineOsc.connect(engineFilter);
  engineFilter.connect(audio.engineGain);
  audio.engineGain.connect(audio.master);
  audio.engineOsc.start();

  audio.driftGain = audio.ctx.createGain();
  audio.driftGain.gain.value = 0;
  const driftOsc = audio.ctx.createOscillator();
  driftOsc.type = "triangle";
  driftOsc.frequency.value = 92;
  const driftFilter = audio.ctx.createBiquadFilter();
  driftFilter.type = "highpass";
  driftFilter.frequency.value = 680;
  driftOsc.connect(driftFilter);
  driftFilter.connect(audio.driftGain);
  audio.driftGain.connect(audio.master);
  driftOsc.start();

  audio.nitroGain = audio.ctx.createGain();
  audio.nitroGain.gain.value = 0;
  const nitroOsc = audio.ctx.createOscillator();
  nitroOsc.type = "square";
  nitroOsc.frequency.value = 135;
  const nitroFilter = audio.ctx.createBiquadFilter();
  nitroFilter.type = "bandpass";
  nitroFilter.frequency.value = 950;
  nitroOsc.connect(nitroFilter);
  nitroFilter.connect(audio.nitroGain);
  audio.nitroGain.connect(audio.master);
  nitroOsc.start();

  makeMusic();
  audio.started = true;
  audioStateEl.textContent = "已啟動";
}

function makeMusic() {
  audio.musicGain = audio.ctx.createGain();
  audio.musicGain.gain.value = 0.055;
  audio.musicGain.connect(audio.master);
  const notes = [55, 65.41, 73.42, 82.41, 98.0, 82.41, 73.42, 65.41];
  let step = 0;
  setInterval(() => {
    if (!audio.started || !running) return;
    const t = audio.ctx.currentTime;
    const osc = audio.ctx.createOscillator();
    const g = audio.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(notes[step % notes.length], t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.22, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    osc.connect(g);
    g.connect(audio.musicGain);
    osc.start(t);
    osc.stop(t + 0.24);
    step++;
  }, 185);
}

function playCrash(power = 1) {
  if (!audio.started) return;
  const now = audio.ctx.currentTime;
  if (now - audio.lastCrash < 0.18) return;
  audio.lastCrash = now;
  const osc = audio.ctx.createOscillator();
  const g = audio.ctx.createGain();
  const f = audio.ctx.createBiquadFilter();
  osc.type = "square";
  osc.frequency.setValueAtTime(90 + power * 80, now);
  osc.frequency.exponentialRampToValueAtTime(30, now + 0.18);
  g.gain.setValueAtTime(0.18 * power, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
  f.type = "lowpass";
  f.frequency.value = 380;
  osc.connect(f);
  f.connect(g);
  g.connect(audio.master);
  osc.start(now);
  osc.stop(now + 0.22);
}

function updateAudio(speed, drift, nitro) {
  if (!audio.started) return;
  const t = audio.ctx.currentTime;
  audio.engineOsc.frequency.setTargetAtTime(80 + Math.abs(speed) * 6.5, t, 0.04);
  audio.engineGain.gain.setTargetAtTime(0.035 + Math.min(Math.abs(speed) / 95, 1) * 0.09, t, 0.04);
  audio.driftGain.gain.setTargetAtTime(drift ? 0.06 : 0.0, t, 0.05);
  audio.nitroGain.gain.setTargetAtTime(nitro ? 0.08 : 0.0, t, 0.03);
}

function ellipseValue(x, z, rx, rz) {
  return (x * x) / (rx * rx) + (z * z) / (rz * rz);
}

function onRoad(x, z) {
  return ellipseValue(x, z, track.outerRx, track.outerRz) <= 1 &&
         ellipseValue(x, z, track.innerRx, track.innerRz) >= 1;
}

function makeMaterial(color, emissive = color, intensity = 0.6) {
  return new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: intensity, roughness: 0.35, metalness: 0.3 });
}

function createWorld() {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(440, 440), new THREE.MeshStandardMaterial({ color: 0x020711, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const grid = new THREE.GridHelper(440, 80, 0x00eaff, 0x15344d);
  grid.position.y = 0.02;
  scene.add(grid);

  const outer = new THREE.Shape();
  outer.absellipse(0, 0, track.outerRx, track.outerRz, 0, Math.PI * 2, false, 0);
  const inner = new THREE.Path();
  inner.absellipse(0, 0, track.innerRx, track.innerRz, 0, Math.PI * 2, true, 0);
  outer.holes.push(inner);

  const road = new THREE.Mesh(new THREE.ShapeGeometry(outer, 160), new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.55, metalness: 0.1 }));
  road.rotation.x = -Math.PI / 2;
  road.receiveShadow = true;
  scene.add(road);

  ring(track.outerRx, track.outerRz, 0x00eaff);
  ring(track.innerRx, track.innerRz, 0xff3ee8);
  startLine();
  city();
  createRain();
}

function ring(rx, rz, color) {
  const pts = [];
  for (let i = 0; i <= 260; i++) {
    const a = i / 260 * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * rx, 0.2, Math.sin(a) * rz));
  }
  scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color })));
}

function startLine() {
  for (let i = -4; i <= 4; i++) {
    const block = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.12, 1.1), makeMaterial(i % 2 ? 0xffffff : 0x00eaff, i % 2 ? 0x333333 : 0x00eaff, 0.8));
    block.position.set(i * 3.4, 0.16, -52.5);
    block.castShadow = true;
    scene.add(block);
  }
}

function city() {
  const mat = new THREE.MeshStandardMaterial({ color: 0x091224, emissive: 0x001d36, emissiveIntensity: 0.7, roughness: 0.4, metalness: 0.2 });
  for (let i = 0; i < 90; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 118 + Math.random() * 70;
    const h = 10 + Math.random() * 48;
    const b = new THREE.Mesh(new THREE.BoxGeometry(5 + Math.random()*8, h, 5 + Math.random()*8), mat);
    b.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r);
    b.castShadow = true;
    b.receiveShadow = true;
    scene.add(b);
    if (Math.random() > 0.55) {
      const light = new THREE.PointLight(Math.random() > 0.5 ? 0x00eaff : 0xff3ee8, 0.8, 28);
      light.position.set(b.position.x, h + 1, b.position.z);
      scene.add(light);
    }
  }
}

let rainPoints;
function createRain() {
  const count = 1600;
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i*3] = (Math.random() - 0.5) * 180;
    pos[i*3+1] = Math.random() * 70 + 8;
    pos[i*3+2] = (Math.random() - 0.5) * 180;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  rainPoints = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x88cfff, size: 0.13, transparent: true, opacity: 0.65 }));
  rainPoints.visible = false;
  scene.add(rainPoints);
}

function updateRain(dt) {
  if (!rain || !rainPoints) return;
  const arr = rainPoints.geometry.attributes.position.array;
  for (let i = 0; i < arr.length; i += 3) {
    arr[i + 1] -= 38 * dt;
    arr[i] -= 3 * dt;
    if (arr[i + 1] < 0) arr[i + 1] = 72;
  }
  rainPoints.geometry.attributes.position.needsUpdate = true;
}

function createCar(name, color, isPlayer = false) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.05, 7), makeMaterial(color, color, isPlayer ? 1.1 : 0.75));
  body.position.y = 1.05;
  body.castShadow = true;
  g.add(body);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.85, 2.7), new THREE.MeshStandardMaterial({ color: 0x06121f, emissive: color, emissiveIntensity: 0.25, roughness: 0.2, metalness: 0.6 }));
  cabin.position.set(0, 1.78, -0.75);
  cabin.castShadow = true;
  g.add(cabin);

  const wheelGeo = new THREE.CylinderGeometry(0.58, 0.58, 0.55, 24);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.45, metalness: 0.25 });
  [[-2.25,.65,2.35],[2.25,.65,2.35],[-2.25,.65,-2.35],[2.25,.65,-2.35]].forEach(p => {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(...p);
    w.castShadow = true;
    g.add(w);
  });

  const tail = new THREE.PointLight(0xff0040, isPlayer ? 2.5 : 1.4, 18);
  tail.position.set(0, 1.0, 4.2);
  g.add(tail);

  scene.add(g);
  return {
    name, mesh: g, color, x: 0, z: -42, prevX: 0, prevZ: -42, angle: Math.PI,
    speed: 0, maxSpeed: isPlayer ? 76 : 58 + Math.random() * 10,
    accel: isPlayer ? 38 : 25 + Math.random() * 8,
    turn: isPlayer ? 2.15 : 1.65 + Math.random() * 0.55,
    lap: 1, cp: 0, progress: 0, nitro: 1, isPlayer, finished: false,
    aiMode: "追擊", aiAggression: 0.5 + Math.random() * 0.7,
    blockTimer: 0, overtakeSide: Math.random() > 0.5 ? 1 : -1
  };
}

createWorld();

const player = createCar("你", 0x00eaff, true);
const cars = [
  player,
  createCar("AI Fox", 0xff3ee8),
  createCar("AI Wolf", 0xffd23e),
  createCar("AI Bear", 0xff6d2d),
  createCar("AI Owl", 0x91ff4f),
  createCar("AI Turtle", 0xb16bff)
];

const startPositions = [[0,-42],[-8,-43],[8,-43],[-15,-40],[15,-40],[0,-36]];
cars.forEach((c, i) => {
  c.x = startPositions[i][0];
  c.z = startPositions[i][1];
  c.mesh.position.set(c.x, 0, c.z);
});

function moveCar(car, dt) {
  car.prevX = car.x;
  car.prevZ = car.z;
  car.x -= Math.sin(car.angle) * car.speed * dt;
  car.z -= Math.cos(car.angle) * car.speed * dt;
  car.speed *= 0.985;

  if (!onRoad(car.x, car.z)) {
    car.x = car.prevX + (car.x - car.prevX) * 0.32;
    car.z = car.prevZ + (car.z - car.prevZ) * 0.32;
    car.speed *= 0.84;
    if (car.isPlayer) playCrash(0.5);
  }

  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.angle;
  checkCheckpoint(car);
}

function checkCheckpoint(car) {
  const target = checkpoints[car.cp];
  const d = Math.hypot(car.x - target.x, car.z - target.z);
  if (d < 18) {
    car.cp = (car.cp + 1) % checkpoints.length;
    if (car.cp === 0) {
      car.lap++;
      if (car.lap > 3) car.finished = true;
    }
  }
  car.progress = (car.lap - 1) * checkpoints.length + car.cp + (1 - Math.min(d / 140, 1));
}

function targetAngleTo(car, target) {
  return Math.atan2(-(target.x - car.x), -(target.z - car.z));
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function updatePlayer(dt) {
  if (!running) return;
  const up = keys.has("KeyW") || keys.has("ArrowUp");
  const down = keys.has("KeyS") || keys.has("ArrowDown");
  const left = keys.has("KeyA") || keys.has("ArrowLeft");
  const right = keys.has("KeyD") || keys.has("ArrowRight");
  const nitroKey = keys.has("ShiftLeft") || keys.has("ShiftRight");

  if (up) player.speed += player.accel * dt;
  if (down) player.speed -= player.accel * 0.72 * dt;

  const usingNitro = nitroKey && player.nitro > 0 && player.speed > 12;
  if (usingNitro) {
    player.speed += 42 * dt;
    player.nitro = Math.max(0, player.nitro - 0.34 * dt);
  } else {
    player.nitro = Math.min(1, player.nitro + 0.08 * dt);
  }

  const max = usingNitro ? player.maxSpeed * 1.45 : player.maxSpeed;
  player.speed = THREE.MathUtils.clamp(player.speed, -24, max);

  const steer = THREE.MathUtils.clamp(Math.abs(player.speed) / 36, 0.25, 1);
  if (left) player.angle += player.turn * steer * dt * Math.sign(player.speed || 1);
  if (right) player.angle -= player.turn * steer * dt * Math.sign(player.speed || 1);

  const drifting = Math.abs(player.speed) > 28 && (left || right);
  updateAudio(player.speed, drifting, usingNitro);

  moveCar(player, dt);
}

function updateAI(car, dt) {
  if (car.finished) return;

  const distanceToPlayer = Math.hypot(player.x - car.x, player.z - car.z);
  const aiAhead = car.progress > player.progress && car.lap >= player.lap;
  const aiBehind = player.progress > car.progress || player.lap > car.lap;

  let mode = "巡航";
  let target = checkpoints[car.cp];
  let desiredSpeed = car.maxSpeed;

  if (distanceToPlayer < 22 && aiAhead) {
    mode = "阻擋";
    const blockX = player.x + Math.sin(player.angle) * 4.5;
    const blockZ = player.z + Math.cos(player.angle) * 4.5;
    target = { x: target.x * 0.55 + blockX * 0.45, z: target.z * 0.55 + blockZ * 0.45 };
    desiredSpeed = Math.min(car.maxSpeed, Math.abs(player.speed) + 4);
  } else if (aiBehind && distanceToPlayer < 55) {
    mode = "追擊";
    target = { x: player.x, z: player.z };
    desiredSpeed = car.maxSpeed * 1.12;
  } else if (distanceToPlayer < 28 && !aiAhead) {
    mode = "超車";
    target = {
      x: player.x + Math.cos(player.angle) * car.overtakeSide * 10,
      z: player.z - Math.sin(player.angle) * car.overtakeSide * 10
    };
    desiredSpeed = car.maxSpeed * 1.18;
  }

  car.aiMode = mode;
  const desired = targetAngleTo(car, target);
  const diff = angleDiff(desired, car.angle);
  car.angle += THREE.MathUtils.clamp(diff, -car.turn * dt, car.turn * dt);

  if (car.speed < desiredSpeed) car.speed += car.accel * dt;
  else car.speed -= car.accel * 0.5 * dt;
  if (Math.abs(diff) > 0.75) car.speed *= 0.982;
  car.speed = THREE.MathUtils.clamp(car.speed, 0, car.maxSpeed * 1.2);

  moveCar(car, dt);
}

function handleCollisions() {
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      const dx = a.x - b.x, dz = a.z - b.z;
      const d = Math.hypot(dx, dz);
      if (d < 5.2 && d > 0.001) {
        const nx = dx / d, nz = dz / d;
        const push = (5.2 - d) * 0.5;
        a.x += nx * push; a.z += nz * push;
        b.x -= nx * push; b.z -= nz * push;
        a.speed *= 0.88; b.speed *= 0.88;
        a.mesh.position.set(a.x, 0, a.z);
        b.mesh.position.set(b.x, 0, b.z);
        if (a.isPlayer || b.isPlayer) playCrash(1);
      }
    }
  }
}

function updateRank() {
  const ranked = [...cars].sort((a, b) => (b.lap * 10 + b.progress) - (a.lap * 10 + a.progress));
  rankEl.textContent = ranked.findIndex(c => c === player) + 1;
  const nearestAI = cars.slice(1).sort((a,b) => Math.hypot(a.x-player.x,a.z-player.z) - Math.hypot(b.x-player.x,b.z-player.z))[0];
  aiStateEl.textContent = nearestAI ? `${nearestAI.name}：${nearestAI.aiMode}` : "無";
}

function updateEnvironment(dt) {
  hemi.intensity += ((night ? 0.45 : 1.05) - hemi.intensity) * dt;
  sun.intensity += ((night ? 0.08 : 1.45) - sun.intensity) * dt;
  scene.fog.near += ((night ? 28 : 45) - scene.fog.near) * dt;
  scene.fog.far += ((night ? 170 : 250) - scene.fog.far) * dt;
  updateRain(dt);
}

function updateHUD() {
  lapEl.textContent = Math.min(player.lap, 3);
  speedEl.textContent = Math.round(Math.abs(player.speed) * 4.2);
  nitroBar.style.width = `${Math.round(player.nitro * 100)}%`;
  updateRank();
}

function updateCamera(dt) {
  const back = new THREE.Vector3(Math.sin(player.angle) * 13, 7.5, Math.cos(player.angle) * 13);
  const targetCam = new THREE.Vector3(player.x, 0, player.z).add(back);
  camera.position.lerp(targetCam, 1 - Math.pow(0.001, dt));
  camera.lookAt(player.x, 2.1, player.z);
}

function loop(t = 0) {
  const dt = Math.min((t - last) / 1000, 0.033);
  last = t;
  updatePlayer(dt);
  cars.slice(1).forEach(c => updateAI(c, dt));
  handleCollisions();
  updateEnvironment(dt);
  updateCamera(dt);
  updateHUD();

  if (running && player.finished) {
    running = false;
    startPanel.style.display = "flex";
    startPanel.querySelector("h1").textContent = "FINISH!";
    startPanel.querySelector("p").textContent = "比賽完成！再跑一場？";
    startBtn.textContent = "重新開始";
  }

  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

function resetGame() {
  cars.forEach((c, i) => {
    c.x = startPositions[i][0]; c.z = startPositions[i][1];
    c.prevX = c.x; c.prevZ = c.z; c.angle = Math.PI;
    c.speed = 0; c.lap = 1; c.cp = 0; c.progress = 0; c.finished = false;
    c.mesh.position.set(c.x, 0, c.z);
    c.mesh.rotation.y = c.angle;
  });
  player.nitro = 1;
}

window.addEventListener("keydown", e => {
  keys.add(e.code);
  if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","ShiftLeft","ShiftRight"].includes(e.code)) e.preventDefault();
  if (e.code === "KeyR") {
    rain = !rain;
    if (rainPoints) rainPoints.visible = rain;
  }
  if (e.code === "KeyT") night = !night;
});

window.addEventListener("keyup", e => keys.delete(e.code));

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

startBtn.addEventListener("click", async () => {
  startAudio();
  if (audio.ctx.state === "suspended") await audio.ctx.resume();
  resetGame();
  running = true;
  startPanel.style.display = "none";
});

camera.position.set(0, 14, -25);
camera.lookAt(0, 0, 0);
requestAnimationFrame(loop);
