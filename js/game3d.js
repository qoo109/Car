(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const canvas = $('gameCanvas');
  const errorBox = $('webglError');
  const gl = canvas?.getContext('webgl', {
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false
  });

  if (!canvas || !gl) {
    if (errorBox) errorBox.hidden = false;
    return;
  }

  const UI = {
    speedText: $('speedText'),
    rankText: $('rankText'),
    lapText: $('lapText'),
    progressText: $('progressText'),
    timeText: $('timeText'),
    bestText: $('bestText'),
    boostBar: $('boostBar'),
    fpsText: $('fpsText'),
    notice: $('notice'),
    noticeText: $('noticeText'),
    countdown: $('countdown'),
    startBtn: $('startBtn'),
    gasBtn: $('gasBtn'),
    brakeBtn: $('brakeBtn'),
    nitroBtn: $('nitroBtn'),
    driftBtn: $('driftBtn'),
    resetBtn: $('resetBtn'),
    cameraBtn: $('cameraBtn'),
    soundBtn: $('soundBtn'),
    carChoices: Array.from(document.querySelectorAll('.car-choice')),
    lapChoices: Array.from(document.querySelectorAll('.lap-choice')),
    raceChoices: Array.from(document.querySelectorAll('.race-choice'))
  };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (a, b, v) => {
    const t = clamp((v - a) / Math.max(0.0001, b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const mod = (n, m) => ((n % m) + m) % m;

  const COLORS = {
    sky: [0.080, 0.066, 0.145],
    fog: [0.150, 0.125, 0.235],
    void: [0.055, 0.052, 0.080],
    deck: [0.205, 0.205, 0.285],
    deckDark: [0.125, 0.120, 0.185],
    asphalt: [0.225, 0.230, 0.315],
    asphaltAlt: [0.255, 0.255, 0.345],
    lane: [0.790, 0.805, 0.905],
    rail: [0.520, 0.505, 0.690],
    railTop: [0.710, 0.675, 0.920],
    purple: [0.550, 0.290, 1.000],
    purpleSoft: [0.690, 0.490, 1.000],
    red: [1.000, 0.180, 0.230],
    orange: [1.000, 0.470, 0.120],
    gold: [1.000, 0.720, 0.190],
    green: [0.190, 0.850, 0.500],
    cyan: [0.220, 0.880, 1.000],
    white: [0.950, 0.950, 1.000],
    black: [0.035, 0.035, 0.055],
    glass: [0.075, 0.110, 0.190],
    smoke: [0.620, 0.600, 0.760],
    tree: [0.090, 0.115, 0.135],
    trunk: [0.170, 0.125, 0.140],
    building: [0.235, 0.225, 0.330],
    window: [0.730, 0.430, 1.000]
  };

  const CAR_SKINS = [
    { name: '白色', body: [0.91, 0.90, 0.98], stripe: [1.00, 0.25, 0.20], accent: [0.60, 0.38, 1.00], max: 126, accel: 78, grip: 1.02 },
    { name: '黃色', body: [1.00, 0.62, 0.10], stripe: [1.00, 0.93, 0.70], accent: [1.00, 0.25, 0.16], max: 128, accel: 77, grip: 0.99 },
    { name: '藍色', body: [0.12, 0.35, 0.95], stripe: [0.63, 0.82, 1.00], accent: [0.46, 0.26, 1.00], max: 129, accel: 75, grip: 1.01 },
    { name: '黑色', body: [0.055, 0.060, 0.090], stripe: [0.52, 0.46, 0.72], accent: [0.90, 0.25, 0.85], max: 130, accel: 74, grip: 0.98 },
    { name: '紅色', body: [0.94, 0.10, 0.12], stripe: [1.00, 0.82, 0.75], accent: [1.00, 0.35, 0.14], max: 127, accel: 79, grip: 1.00 },
    { name: '綠色', body: [0.10, 0.66, 0.30], stripe: [0.74, 1.00, 0.82], accent: [0.45, 0.30, 1.00], max: 126, accel: 80, grip: 1.03 }
  ];

  const WORLD = {
    lapLength: 3000,
    roadWidth: 33,
    segment: 7,
    drawAhead: 360,
    drawBehind: 56,
    propRange: 390
  };

  const state = {
    running: false,
    countingDown: false,
    countdown: 0,
    goFlash: 0,
    sound: true,
    camera: 0,
    selectedCar: Number(localStorage.getItem('neon-toy-car') || 4),
    lapCount: Number(localStorage.getItem('neon-toy-laps') || 3),
    carTotal: Number(localStorage.getItem('neon-toy-cars') || 6),
    rank: 1,
    currentLap: 1,
    lapProgress: 0,
    raceTime: 0,
    raceFinished: false,
    best: 0,
    distance: 0,
    speed: 0,
    boost: 65,
    shake: 0,
    car: { x: 0, y: 1, z: 6, yaw: 0, roll: 0, steer: 0, lateral: 0 },
    aiCars: [],
    gates: [],
    particles: [],
    lastTime: 0,
    fpsAccum: 0,
    fpsCount: 0,
    fps: 60
  };

  const input = {
    gas: false,
    brake: false,
    nitro: false,
    drift: false,
    left: false,
    right: false,
    pointerActive: false,
    pointerStartX: 0,
    touchSteer: 0
  };

  function updateOrientationClass() {
    const w = window.innerWidth || 0;
    const h = window.innerHeight || 0;
    const portrait = h > w && w <= 820;
    document.documentElement.classList.toggle('is-portrait-mobile', portrait);
    document.documentElement.classList.toggle('is-landscape-mobile', !portrait && h <= 560 && w <= 1180);
  }

  function compileShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader) || 'Shader compile failed');
    }
    return shader;
  }

  const vertexShader = compileShader(gl.VERTEX_SHADER, `
    attribute vec3 aPosition;
    attribute vec3 aNormal;
    uniform mat4 uModel;
    uniform mat4 uView;
    uniform mat4 uProj;
    uniform vec3 uColor;
    uniform vec3 uLightDir;
    uniform float uGlow;
    varying vec3 vColor;
    varying float vFog;
    void main() {
      vec4 world = uModel * vec4(aPosition, 1.0);
      vec3 normal = normalize((uModel * vec4(aNormal, 0.0)).xyz);
      float diffuse = max(dot(normal, normalize(uLightDir)), 0.0);
      float light = 0.46 + diffuse * 0.62;
      vColor = uColor * light + uColor * uGlow;
      vec4 viewPos = uView * world;
      float distanceToCamera = length(viewPos.xyz);
      vFog = clamp((distanceToCamera - 105.0) / 235.0, 0.0, 1.0);
      gl_Position = uProj * viewPos;
    }
  `);

  const fragmentShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    varying vec3 vColor;
    varying float vFog;
    uniform vec3 uFogColor;
    uniform float uAlpha;
    void main() {
      vec3 color = mix(vColor, uFogColor, vFog);
      gl_FragColor = vec4(color, uAlpha);
    }
  `);

  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || 'Program link failed');
  }
  gl.useProgram(program);

  const loc = {
    aPosition: gl.getAttribLocation(program, 'aPosition'),
    aNormal: gl.getAttribLocation(program, 'aNormal'),
    uModel: gl.getUniformLocation(program, 'uModel'),
    uView: gl.getUniformLocation(program, 'uView'),
    uProj: gl.getUniformLocation(program, 'uProj'),
    uColor: gl.getUniformLocation(program, 'uColor'),
    uLightDir: gl.getUniformLocation(program, 'uLightDir'),
    uFogColor: gl.getUniformLocation(program, 'uFogColor'),
    uGlow: gl.getUniformLocation(program, 'uGlow'),
    uAlpha: gl.getUniformLocation(program, 'uAlpha')
  };

  const cubeData = new Float32Array([
    -1,-1, 1, 0,0,1,  1,-1, 1, 0,0,1,  1, 1, 1, 0,0,1, -1,-1, 1, 0,0,1,  1, 1, 1, 0,0,1, -1, 1, 1, 0,0,1,
     1,-1,-1, 0,0,-1,-1,-1,-1, 0,0,-1,-1, 1,-1, 0,0,-1, 1,-1,-1, 0,0,-1,-1, 1,-1, 0,0,-1, 1, 1,-1, 0,0,-1,
    -1, 1, 1, 0,1,0,  1, 1, 1, 0,1,0,  1, 1,-1, 0,1,0,-1, 1, 1, 0,1,0,  1, 1,-1, 0,1,0,-1, 1,-1, 0,1,0,
    -1,-1,-1, 0,-1,0, 1,-1,-1, 0,-1,0, 1,-1, 1, 0,-1,0,-1,-1,-1, 0,-1,0, 1,-1, 1, 0,-1,0,-1,-1, 1, 0,-1,0,
     1,-1, 1, 1,0,0,  1,-1,-1, 1,0,0,  1, 1,-1, 1,0,0, 1,-1, 1, 1,0,0,  1, 1,-1, 1,0,0, 1, 1, 1, 1,0,0,
    -1,-1,-1,-1,0,0, -1,-1, 1,-1,0,0, -1, 1, 1,-1,0,0,-1,-1,-1,-1,0,0, -1, 1, 1,-1,0,0,-1, 1,-1,-1,0,0
  ]);

  const cubeBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, cubeBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, cubeData, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(loc.aPosition);
  gl.vertexAttribPointer(loc.aPosition, 3, gl.FLOAT, false, 24, 0);
  gl.enableVertexAttribArray(loc.aNormal);
  gl.vertexAttribPointer(loc.aNormal, 3, gl.FLOAT, false, 24, 12);

  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(...COLORS.sky, 1);
  gl.uniform3f(loc.uLightDir, -0.38, 0.92, 0.35);
  gl.uniform3f(loc.uFogColor, ...COLORS.fog);

  const proj = new Float32Array(16);
  const view = new Float32Array(16);
  const model = new Float32Array(16);

  function perspective(out, fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2);
    out[0] = f / aspect; out[1] = 0; out[2] = 0; out[3] = 0;
    out[4] = 0; out[5] = f; out[6] = 0; out[7] = 0;
    out[8] = 0; out[9] = 0; out[10] = (far + near) / (near - far); out[11] = -1;
    out[12] = 0; out[13] = 0; out[14] = (2 * far * near) / (near - far); out[15] = 0;
  }

  function lookAt(out, eye, target, up) {
    let zx = eye[0] - target[0];
    let zy = eye[1] - target[1];
    let zz = eye[2] - target[2];
    let len = Math.hypot(zx, zy, zz) || 1;
    zx /= len; zy /= len; zz /= len;

    let xx = up[1] * zz - up[2] * zy;
    let xy = up[2] * zx - up[0] * zz;
    let xz = up[0] * zy - up[1] * zx;
    len = Math.hypot(xx, xy, xz) || 1;
    xx /= len; xy /= len; xz /= len;

    const yx = zy * xz - zz * xy;
    const yy = zz * xx - zx * xz;
    const yz = zx * xy - zy * xx;

    out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
    out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
    out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
    out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
    out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
    out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
    out[15] = 1;
  }

  function setModel(out, x, y, z, sx, sy, sz, yaw = 0, pitch = 0, roll = 0) {
    const cy = Math.cos(yaw), syaw = Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const cr = Math.cos(roll), sr = Math.sin(roll);

    const r00 = cy * cr + syaw * sp * sr;
    const r01 = sr * cp;
    const r02 = -syaw * cr + cy * sp * sr;
    const r10 = -cy * sr + syaw * sp * cr;
    const r11 = cr * cp;
    const r12 = sr * syaw + cy * sp * cr;
    const r20 = syaw * cp;
    const r21 = -sp;
    const r22 = cy * cp;

    out[0] = r00 * sx; out[1] = r01 * sx; out[2] = r02 * sx; out[3] = 0;
    out[4] = r10 * sy; out[5] = r11 * sy; out[6] = r12 * sy; out[7] = 0;
    out[8] = r20 * sz; out[9] = r21 * sz; out[10] = r22 * sz; out[11] = 0;
    out[12] = x; out[13] = y; out[14] = z; out[15] = 1;
  }

  function drawBox(x, y, z, w, h, d, yaw, color, glow = 0, alpha = 1, pitch = 0, roll = 0) {
    setModel(model, x, y, z, w * 0.5, h * 0.5, d * 0.5, yaw, pitch, roll);
    gl.uniformMatrix4fv(loc.uModel, false, model);
    gl.uniform3f(loc.uColor, color[0], color[1], color[2]);
    gl.uniform1f(loc.uGlow, glow);
    gl.uniform1f(loc.uAlpha, alpha);
    gl.drawArrays(gl.TRIANGLES, 0, 36);
  }

  function drawLocalBox(cx, cy, cz, lx, ly, lz, w, h, d, yaw, color, glow = 0, alpha = 1, yawOffset = 0, pitch = 0, roll = 0) {
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    const x = cx + lx * cs + lz * sn;
    const z = cz - lx * sn + lz * cs;
    drawBox(x, cy + ly, z, w, h, d, yaw + yawOffset, color, glow, alpha, pitch, roll);
  }

  function seededNoise(n) {
    const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453123;
    return x - Math.floor(x);
  }

  function trackT(z) {
    return mod(z, WORLD.lapLength);
  }

  function plateau(t, start, riseEnd, fallStart, end, amount) {
    return amount * smoothstep(start, riseEnd, t) * (1 - smoothstep(fallStart, end, t));
  }

  function roadCenter(z) {
    const t = trackT(z);
    let c = 0;
    c += plateau(t, 100, 250, 390, 535, 13);
    c += plateau(t, 430, 600, 720, 870, -18);
    c += plateau(t, 790, 1060, 1390, 1660, 39);
    c += Math.sin(clamp((t - 820) / 760, 0, 1) * Math.PI) * 8;
    c += plateau(t, 1530, 1690, 1870, 2050, -26);
    c += plateau(t, 1990, 2110, 2210, 2320, 18);
    c += plateau(t, 2260, 2370, 2470, 2580, -22);
    c += plateau(t, 2500, 2600, 2700, 2800, 18);
    c += plateau(t, 2730, 2825, 2910, 2995, -25);
    c += Math.sin(z * 0.018) * 0.34;
    return c;
  }

  function roadWidthAt(z) {
    const t = trackT(z);
    let width = WORLD.roadWidth;
    width += plateau(t, 760, 950, 1460, 1720, 7.5);
    width -= plateau(t, 1520, 1690, 1910, 2080, 7.0);
    width -= plateau(t, 2240, 2360, 2520, 2640, 4.5);
    width -= plateau(t, 2740, 2810, 2900, 2980, 7.5);
    return clamp(width, 22, 42);
  }

  function roadHeight(z) {
    const t = trackT(z);
    let h = 7.5;
    h += plateau(t, 430, 690, 1040, 1250, 2.0);
    h += plateau(t, 950, 1160, 1440, 1640, 3.1);
    h += plateau(t, 1510, 1690, 1900, 2070, 5.2);
    h -= plateau(t, 1900, 2070, 2250, 2410, 1.8);
    h += plateau(t, 2440, 2580, 2730, 2840, 2.0);
    h += plateau(t, 2760, 2840, 2910, 2995, 4.0);
    h += Math.sin(z * 0.013) * 0.12;
    return h;
  }

  function roadTangentYaw(z) {
    const a = roadCenter(z - 4);
    const b = roadCenter(z + 4);
    return Math.atan2(b - a, 8);
  }

  function curveStrength(z) {
    const y1 = roadTangentYaw(z + 10);
    const y2 = roadTangentYaw(z + 66);
    return Math.abs(y2 - y1) + Math.abs(roadCenter(z + 80) - roadCenter(z + 20)) / 65;
  }

  function bestKey() {
    return `neon-toy-best-${state.lapCount}-${state.carTotal}`;
  }

  function formatTime(seconds) {
    if (!seconds || seconds <= 0) return '0:00.0';
    const minutes = Math.floor(seconds / 60);
    const secs = seconds - minutes * 60;
    return `${minutes}:${secs.toFixed(1).padStart(4, '0')}`;
  }

  function generateWorld() {
    state.aiCars = [];
    state.gates = [];
    const totalCars = clamp(Math.round(state.carTotal), 1, 6);
    state.carTotal = totalCars;
    const lanes = [5.5, -5.5, 0, 10.5, -10.5];

    for (let i = 1; i < totalCars; i++) {
      const z = 6 - Math.ceil(i / 2) * 5;
      const lane = lanes[(i - 1) % lanes.length];
      const skinIndex = (i + 1) % CAR_SKINS.length;
      const elite = totalCars >= 5 && i >= totalCars - 2;
      state.aiCars.push({
        id: i,
        skinIndex,
        lane,
        x: roadCenter(z) + lane,
        y: roadHeight(z) + 1.0,
        z,
        yaw: roadTangentYaw(z),
        speed: 0,
        distance: 0,
        phase: seededNoise(200 + i) * Math.PI * 2,
        skill: elite ? (i === totalCars - 1 ? 1.18 : 1.12) : 0.96 + seededNoise(300 + i) * 0.12,
        aggression: elite ? 1.10 : 0.68 + seededNoise(400 + i) * 0.25,
        finished: false,
        finishTime: 0
      });
    }

    const total = WORLD.lapLength * state.lapCount;
    for (let z = 170; z < total; z += 230) {
      state.gates.push({ z: z + (seededNoise(z) - 0.5) * 36, taken: false });
    }
  }

  function resetGame() {
    state.running = false;
    state.countingDown = false;
    state.countdown = 0;
    state.goFlash = 0;
    state.raceTime = 0;
    state.raceFinished = false;
    state.currentLap = 1;
    state.lapProgress = 0;
    state.distance = 0;
    state.rank = 1;
    state.speed = 0;
    state.boost = 65;
    state.shake = 0;
    state.best = Number(localStorage.getItem(bestKey()) || 0);
    state.particles.length = 0;
    state.car.x = roadCenter(6);
    state.car.y = roadHeight(6) + 1.02;
    state.car.z = 6;
    state.car.yaw = roadTangentYaw(6);
    state.car.roll = 0;
    state.car.steer = 0;
    state.car.lateral = 0;
    generateWorld();
    if (UI.countdown) {
      UI.countdown.hidden = true;
      UI.countdown.classList.remove('go');
    }
    UI.notice?.classList.remove('hidden');
    if (UI.startBtn) UI.startBtn.querySelector('span') ? UI.startBtn.querySelector('span').textContent = '啟動比賽' : UI.startBtn.textContent = '啟動比賽';
    if (UI.noticeText) UI.noticeText.textContent = `V8.2：車子、賽道、護欄、燈光與場景已改成霓虹低多邊形玩具風；${state.lapCount} 圈、${state.carTotal} 台車。`;
    updateCameraButton();
    updateUI();
  }

  function startCountdown() {
    if (state.running || state.countingDown) return;
    if (state.raceFinished) resetGame();
    state.countingDown = true;
    state.countdown = 3.2;
    state.goFlash = 0;
    UI.notice?.classList.add('hidden');
    if (UI.countdown) {
      UI.countdown.hidden = false;
      UI.countdown.classList.remove('go');
      UI.countdown.textContent = '3';
    }
    chord([280, 420], 0.08, 0.03);
  }

  function finishRace() {
    if (state.raceFinished) return;
    state.raceFinished = true;
    state.running = false;
    state.speed = 0;
    const previous = Number(localStorage.getItem(bestKey()) || 0);
    const isBest = !previous || state.raceTime < previous;
    if (isBest) localStorage.setItem(bestKey(), String(state.raceTime));
    state.best = isBest ? state.raceTime : previous;
    UI.notice?.classList.remove('hidden');
    if (UI.noticeText) {
      UI.noticeText.textContent = `完成 ${state.lapCount} 圈！成績 ${formatTime(state.raceTime)}，名次 ${state.rank}/${state.carTotal}${isBest ? '，刷新最佳成績！' : `，最佳 ${formatTime(previous)}。`}`;
    }
    const label = UI.startBtn?.querySelector('span');
    if (label) label.textContent = '再跑一次';
    else if (UI.startBtn) UI.startBtn.textContent = '再跑一次';
    chord(isBest ? [620, 820, 1040] : [500, 650, 800], 0.18, 0.045);
  }

  function updateCountdown(dt) {
    if (!state.countingDown) return;
    state.countdown -= dt;
    if (state.countdown > 0) {
      const digit = Math.ceil(state.countdown);
      if (UI.countdown && UI.countdown.textContent !== String(digit)) {
        UI.countdown.textContent = String(digit);
        beep(260 + digit * 80, 0.055, 'square', 0.035);
      }
      return;
    }
    state.countingDown = false;
    state.running = true;
    state.goFlash = 0.7;
    if (UI.countdown) {
      UI.countdown.textContent = 'GO!';
      UI.countdown.classList.add('go');
    }
    chord([520, 780, 1040], 0.12, 0.04);
  }

  function updatePlayer(dt) {
    if (!state.running) {
      state.speed *= Math.pow(0.90, dt * 60);
      return;
    }

    const skin = CAR_SKINS[state.selectedCar];
    const car = state.car;
    state.raceTime += dt;

    const keyboardSteer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const targetSteer = clamp(keyboardSteer + input.touchSteer, -1, 1);
    car.steer = lerp(car.steer, targetSteer, 1 - Math.pow(0.00008, dt));

    const nitroActive = input.nitro && input.gas && state.boost > 1;
    const maxSpeed = skin.max + (nitroActive ? 19 : 0);
    if (input.gas) state.speed += skin.accel * dt;
    else state.speed -= 17 * dt;
    if (input.brake && !input.drift) state.speed -= 74 * dt;
    if (nitroActive) {
      state.speed += 34 * dt;
      state.boost -= 25 * dt;
      spawnNitroParticles(car.x, car.y, car.z, car.yaw, 2);
    } else {
      state.boost += 4.2 * dt;
    }
    state.boost = clamp(state.boost, 0, 100);

    const slope = roadHeight(car.z + 18) - roadHeight(car.z - 10);
    state.speed += clamp(-slope * 5.5, -9, 8) * dt;
    state.speed = clamp(state.speed, 0, maxSpeed);

    const drifting = (input.drift || input.brake) && Math.abs(car.steer) > 0.25 && state.speed > 35;
    const steerScale = 5.6 + state.speed * 0.071;
    car.lateral += car.steer * steerScale * skin.grip * (drifting ? 1.24 : 1) * dt;
    car.lateral *= Math.pow(drifting ? 0.943 : 0.74, dt * 60);
    car.x += car.lateral * dt;
    car.z += state.speed * dt * 0.78;
    car.y = roadHeight(car.z) + 1.02;

    const center = roadCenter(car.z);
    const limit = roadWidthAt(car.z) * 0.5 - 1.85;
    const laneOffset = car.x - center;
    if (Math.abs(laneOffset) > limit) {
      const side = Math.sign(laneOffset);
      car.x = center + side * limit;
      car.lateral *= -0.08;
      state.shake = 0.12;
      spawnSparks(car.x, car.y, car.z, 4);
    }

    const roadYaw = roadTangentYaw(car.z + 12);
    car.yaw = lerp(car.yaw, roadYaw + car.steer * (drifting ? 0.35 : 0.18), 1 - Math.pow(0.005, dt));
    const bank = clamp((roadTangentYaw(car.z + 18) - roadTangentYaw(car.z - 18)) * 1.3, -0.16, 0.16);
    car.roll = lerp(car.roll, bank - car.steer * (drifting ? 0.11 : 0.04), 1 - Math.pow(0.012, dt));

    if (drifting) spawnDriftParticles(car.x, car.y, car.z, car.yaw, 1);

    state.distance = Math.max(0, car.z - 6);
    const totalRace = WORLD.lapLength * state.lapCount;
    state.currentLap = clamp(Math.floor(state.distance / WORLD.lapLength) + 1, 1, state.lapCount);
    state.lapProgress = clamp(mod(state.distance, WORLD.lapLength) / WORLD.lapLength, 0, 1);
    if (state.distance >= totalRace) finishRace();
  }

  function updateAICars(dt) {
    const totalRace = WORLD.lapLength * state.lapCount;
    for (const ai of state.aiCars) {
      if (ai.finished) continue;
      if (!state.running) {
        ai.speed *= Math.pow(0.88, dt * 60);
        continue;
      }

      const curve = curveStrength(ai.z + 18);
      const width = roadWidthAt(ai.z + 55);
      const narrowPenalty = width < 28 ? 13 : width < 31 ? 7 : 0;
      const playerGap = state.car.z - ai.z;
      const attack = playerGap > -18 && playerGap < 85 ? 8 * ai.aggression : 0;
      const base = 116 * ai.skill;
      const target = clamp(base - curve * 35 - narrowPenalty + attack + Math.sin(state.raceTime * 1.2 + ai.phase) * 2.2, 62, 151);
      ai.speed = lerp(ai.speed, target, 1 - Math.pow(0.007, dt));
      ai.z += ai.speed * dt * 0.78;
      ai.distance = Math.max(0, ai.z - 6);

      const future = ai.z + 58;
      const curveDir = Math.sign(roadCenter(future) - roadCenter(ai.z + 8)) || 1;
      let desiredLane = -curveDir * (4.2 + ai.aggression * 1.8);
      if (playerGap > -10 && playerGap < 60) {
        const playerLane = state.car.x - roadCenter(state.car.z);
        desiredLane += (Math.abs(playerLane) > 2 ? -Math.sign(playerLane) : (ai.id % 2 ? 1 : -1)) * 4.8;
      }
      desiredLane += Math.sin(ai.z * 0.018 + ai.phase) * 0.45;
      desiredLane = clamp(desiredLane, -roadWidthAt(ai.z) * 0.37, roadWidthAt(ai.z) * 0.37);
      const desiredX = roadCenter(ai.z) + desiredLane;
      ai.x = lerp(ai.x, desiredX, 1 - Math.pow(0.004, dt));
      ai.y = roadHeight(ai.z) + 1.02;
      ai.yaw = lerp(ai.yaw, roadTangentYaw(ai.z + 10) + (desiredX - ai.x) * 0.028, 1 - Math.pow(0.008, dt));

      if (ai.distance >= totalRace) {
        ai.finished = true;
        ai.finishTime = state.raceTime;
        ai.distance = totalRace;
      }
    }
  }

  function updateRank() {
    const playerDistance = state.raceFinished ? WORLD.lapLength * state.lapCount : state.distance;
    let ahead = 0;
    for (const ai of state.aiCars) {
      const distance = ai.finished ? WORLD.lapLength * state.lapCount : ai.distance;
      if (distance > playerDistance + 0.3) ahead++;
    }
    state.rank = clamp(1 + ahead, 1, state.carTotal);
  }

  function updateGates() {
    for (const gate of state.gates) {
      if (gate.taken) continue;
      const dz = gate.z - state.car.z;
      if (Math.abs(dz) < 3.2 && Math.abs(state.car.x - roadCenter(gate.z)) < roadWidthAt(gate.z) * 0.38) {
        gate.taken = true;
        state.boost = clamp(state.boost + 32, 0, 100);
        spawnGateParticles(state.car.x, state.car.y + 1, state.car.z, 16);
        chord([540, 760, 980], 0.1, 0.035);
      }
    }
  }

  function spawnParticle(particle) {
    state.particles.push(particle);
    if (state.particles.length > 130) state.particles.splice(0, state.particles.length - 130);
  }

  function spawnDriftParticles(x, y, z, yaw, count) {
    const sx = Math.sin(yaw), cz = Math.cos(yaw);
    for (let i = 0; i < count; i++) {
      const side = i % 2 ? 1 : -1;
      spawnParticle({
        x: x + side * 1.2 * cz - sx * 1.8,
        y: y - 0.55,
        z: z - 1.8 * cz - side * 1.2 * sx,
        vx: (seededNoise(z + i) - 0.5) * 1.5,
        vy: 0.35 + seededNoise(i + z) * 0.6,
        vz: -1.5 - seededNoise(i + 8) * 1.8,
        life: 0.55,
        size: 0.42 + seededNoise(i + 12) * 0.24,
        color: COLORS.smoke,
        glow: 0,
        alpha: 0.52
      });
    }
  }

  function spawnNitroParticles(x, y, z, yaw, count) {
    const sx = Math.sin(yaw), cz = Math.cos(yaw);
    for (let i = 0; i < count; i++) {
      const side = i % 2 ? 1 : -1;
      spawnParticle({
        x: x + side * 0.64 * cz - sx * 2.65,
        y: y - 0.12,
        z: z - 2.65 * cz - side * 0.64 * sx,
        vx: -sx * (4 + seededNoise(i + z) * 3),
        vy: (seededNoise(i + 3) - 0.5) * 0.5,
        vz: -cz * (4 + seededNoise(i + 9) * 3),
        life: 0.28 + seededNoise(i + 4) * 0.18,
        size: 0.20 + seededNoise(i + 5) * 0.16,
        color: i % 2 ? COLORS.cyan : COLORS.purpleSoft,
        glow: 0.8,
        alpha: 0.9
      });
    }
  }

  function spawnSparks(x, y, z, count) {
    for (let i = 0; i < count; i++) {
      spawnParticle({
        x, y: y - 0.25, z,
        vx: (seededNoise(i + z) - 0.5) * 5,
        vy: 1 + seededNoise(i + 2) * 2,
        vz: -1 - seededNoise(i + 4) * 4,
        life: 0.25 + seededNoise(i + 8) * 0.2,
        size: 0.08 + seededNoise(i + 6) * 0.08,
        color: COLORS.orange,
        glow: 0.8,
        alpha: 1
      });
    }
  }

  function spawnGateParticles(x, y, z, count) {
    for (let i = 0; i < count; i++) {
      const angle = seededNoise(i + z) * Math.PI * 2;
      spawnParticle({
        x: x + Math.cos(angle) * seededNoise(i + 2) * 4,
        y: y + seededNoise(i + 3) * 2.5,
        z: z + Math.sin(angle) * seededNoise(i + 4) * 3,
        vx: Math.cos(angle) * 2.5,
        vy: 1.2 + seededNoise(i + 6) * 2.4,
        vz: Math.sin(angle) * 2.5,
        life: 0.55 + seededNoise(i + 7) * 0.35,
        size: 0.12 + seededNoise(i + 8) * 0.18,
        color: i % 2 ? COLORS.gold : COLORS.purpleSoft,
        glow: 0.7,
        alpha: 0.95
      });
    }
  }

  function updateParticles(dt) {
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vy -= 2.4 * dt;
      if (p.life <= 0) state.particles.splice(i, 1);
    }
  }

  function update(dt) {
    updateCountdown(dt);
    if (state.goFlash > 0) {
      state.goFlash -= dt;
      if (state.goFlash <= 0 && UI.countdown) UI.countdown.hidden = true;
    }
    updatePlayer(dt);
    updateAICars(dt);
    if (state.running) {
      updateRank();
      updateGates();
    }
    updateParticles(dt);
    state.shake *= Math.pow(0.02, dt);
    updateAudio(dt);
    updateUI();
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.7);
    const width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
    perspective(proj, Math.PI / 3.15, width / height, 0.12, 720);
    gl.uniformMatrix4fv(loc.uProj, false, proj);
  }

  function setCamera() {
    const car = state.car;
    const aheadZ = car.z + (state.camera === 0 ? 31 : 23);
    const aheadX = roadCenter(aheadZ);
    const h = roadHeight(car.z);
    const aheadH = roadHeight(aheadZ);
    const shakeX = (seededNoise(state.raceTime * 100) - 0.5) * state.shake;
    const shakeY = (seededNoise(state.raceTime * 100 + 4) - 0.5) * state.shake;
    let eye;
    let target;

    if (state.camera === 0) {
      eye = [car.x + shakeX, h + 7.9 + state.speed * 0.006 + shakeY, car.z - 19.5];
      target = [lerp(aheadX, car.x, 0.72), aheadH + 1.55, aheadZ];
    } else {
      eye = [car.x + shakeX, h + 5.55 + state.speed * 0.004 + shakeY, car.z - 12.3];
      target = [lerp(aheadX, car.x, 0.88), aheadH + 1.25, aheadZ];
    }

    lookAt(view, eye, target, [0, 1, 0]);
    gl.uniformMatrix4fv(loc.uView, false, view);
  }

  function drawBackdrop() {
    const zBase = state.car.z + 165;
    const center = roadCenter(state.car.z + 130);

    drawBox(center, -6.5, state.car.z + 120, 260, 1.2, 520, 0, COLORS.void, 0, 1);

    for (let i = -7; i <= 7; i++) {
      const noise = seededNoise(i + Math.floor(state.car.z / 180));
      const x = center + i * 20 + (noise - 0.5) * 8;
      const height = 8 + noise * 22;
      const z = zBase + seededNoise(i + 30) * 90;
      drawBox(x, -2 + height * 0.5, z, 10 + noise * 7, height, 10 + noise * 6, 0, COLORS.building);
      for (let w = 0; w < 3; w++) {
        if (seededNoise(i * 7 + w) > 0.34) {
          drawBox(x + (w - 1) * 2.4, height * 0.22, z - 5.2, 1.3, 1.2, 0.15, 0, w % 2 ? COLORS.window : COLORS.gold, 0.38);
        }
      }
    }

    drawBox(center - 64, 39, zBase + 70, 8, 8, 8, 0, [0.82, 0.64, 1.0], 0.45);
    drawBox(center - 64, 39, zBase + 70, 13, 1.1, 13, 0, COLORS.purpleSoft, 0.7, 0.22);
  }

  function drawFinishLine(cx, y, z, yaw, width) {
    const squares = 14;
    const squareWidth = width / squares;
    for (let i = 0; i < squares; i++) {
      const lx = -width * 0.5 + squareWidth * (i + 0.5);
      const a = i % 2 ? COLORS.white : COLORS.black;
      const b = i % 2 ? COLORS.black : COLORS.white;
      drawLocalBox(cx, y, z, lx, 0.18, -1.2, squareWidth * 0.93, 0.09, 1.1, yaw, a);
      drawLocalBox(cx, y, z, lx, 0.18, 1.2, squareWidth * 0.93, 0.09, 1.1, yaw, b);
    }
    drawLocalBox(cx, y, z, -width * 0.52, 3.0, 0, 0.55, 6.0, 0.55, yaw, COLORS.railTop);
    drawLocalBox(cx, y, z, width * 0.52, 3.0, 0, 0.55, 6.0, 0.55, yaw, COLORS.railTop);
    drawLocalBox(cx, y, z, 0, 5.7, 0, width * 1.05, 0.58, 0.72, yaw, COLORS.black);
    for (let i = -4; i <= 4; i++) {
      drawLocalBox(cx, y, z, i * 2.25, 5.72, -0.39, 1.55, 0.25, 0.08, yaw, i % 2 ? COLORS.white : COLORS.red, 0.35);
    }
  }

  function drawTrackArrow(cx, y, z, yaw, dir, width) {
    const x = dir * width * 0.20;
    drawLocalBox(cx, y, z, x, 0.20, 0.1, 0.34, 0.08, 2.5, yaw, COLORS.gold, 0.45, 1, dir * 0.55);
    drawLocalBox(cx, y, z, x, 0.20, 0.1, 0.34, 0.08, 2.5, yaw, COLORS.gold, 0.45, 1, -dir * 0.55);
  }

  function drawTrack() {
    const seg = WORLD.segment;
    const start = Math.floor((state.car.z - WORLD.drawBehind) / seg) * seg;
    const end = state.car.z + WORLD.drawAhead;

    for (let z = start; z < end; z += seg) {
      const mid = z + seg * 0.5;
      const cx = roadCenter(mid);
      const y = roadHeight(mid);
      const yaw = roadTangentYaw(mid);
      const width = roadWidthAt(mid);
      const stripe = Math.floor(mid / seg) % 2 === 0;
      const t = trackT(mid);

      drawBox(cx, y - 0.72, mid, width + 5.8, 0.72, seg * 1.12, yaw, stripe ? COLORS.deck : COLORS.deckDark);
      drawBox(cx, y - 0.08, mid, width, 0.20, seg * 1.12, yaw, stripe ? COLORS.asphalt : COLORS.asphaltAlt);

      if (Math.floor(mid / 14) % 2 === 0) {
        drawLocalBox(cx, y, mid, -width / 6, 0.12, 0, 0.21, 0.06, seg * 0.48, yaw, COLORS.lane);
        drawLocalBox(cx, y, mid, width / 6, 0.12, 0, 0.21, 0.06, seg * 0.48, yaw, COLORS.lane);
      }

      drawLocalBox(cx, y, mid, -width * 0.5 + 0.30, 0.13, 0, 0.30, 0.07, seg * 1.06, yaw, COLORS.white);
      drawLocalBox(cx, y, mid, width * 0.5 - 0.30, 0.13, 0, 0.30, 0.07, seg * 1.06, yaw, COLORS.white);

      const curbA = Math.floor(mid / 7) % 2 ? COLORS.red : COLORS.white;
      const curbB = Math.floor(mid / 7) % 2 ? COLORS.white : COLORS.red;
      drawLocalBox(cx, y, mid, -width * 0.5 - 0.46, 0.18, 0, 0.68, 0.16, seg * 1.02, yaw, curbA, curbA === COLORS.red ? 0.22 : 0);
      drawLocalBox(cx, y, mid, width * 0.5 + 0.46, 0.18, 0, 0.68, 0.16, seg * 1.02, yaw, curbB, curbB === COLORS.red ? 0.22 : 0);

      drawLocalBox(cx, y, mid, -width * 0.5 - 1.35, 1.05, 0, 0.34, 1.55, seg * 1.05, yaw, COLORS.rail);
      drawLocalBox(cx, y, mid, width * 0.5 + 1.35, 1.05, 0, 0.34, 1.55, seg * 1.05, yaw, COLORS.rail);
      drawLocalBox(cx, y, mid, -width * 0.5 - 1.15, 1.36, 0, 0.18, 0.22, seg * 1.05, yaw, COLORS.purpleSoft, 0.75);
      drawLocalBox(cx, y, mid, width * 0.5 + 1.15, 1.36, 0, 0.18, 0.22, seg * 1.05, yaw, COLORS.red, 0.58);

      if (Math.floor(mid / 35) % 2 === 0 && y > 7.3) {
        const pillarY = (y - 7.5) * 0.5 - 1.5;
        const pillarH = Math.max(4, y + 3);
        drawLocalBox(cx, -2.8, mid, -width * 0.34, pillarY, 0, 1.0, pillarH, 1.0, yaw, COLORS.deckDark);
        drawLocalBox(cx, -2.8, mid, width * 0.34, pillarY, 0, 1.0, pillarH, 1.0, yaw, COLORS.deckDark);
      }

      const lapLine = Math.round(mid / WORLD.lapLength) * WORLD.lapLength;
      if (Math.abs(mid - lapLine) < seg * 0.55) drawFinishLine(cx, y, mid, yaw, width);

      if ((t > 90 && t < 230) || (t > 760 && t < 980) || (t > 1980 && t < 2160) || (t > 2470 && t < 2640)) {
        drawTrackArrow(cx, y, mid, yaw, 1, width);
      } else if ((t > 420 && t < 620) || (t > 1510 && t < 1770) || (t > 2240 && t < 2430) || (t > 2710 && t < 2920)) {
        drawTrackArrow(cx, y, mid, yaw, -1, width);
      }
    }
  }

  function drawLamp(x, y, z, side, yaw, scale = 1) {
    drawBox(x, y + 2.8 * scale, z, 0.28 * scale, 5.6 * scale, 0.28 * scale, yaw, COLORS.railTop);
    drawBox(x + side * 0.9 * scale, y + 5.45 * scale, z, 1.9 * scale, 0.22 * scale, 0.24 * scale, yaw, COLORS.railTop);
    drawBox(x + side * 1.75 * scale, y + 5.28 * scale, z, 0.48 * scale, 0.32 * scale, 0.5 * scale, yaw, COLORS.purpleSoft, 0.85);
  }

  function drawCone(x, y, z, yaw, scale = 1) {
    drawBox(x, y + 0.08 * scale, z, 0.75 * scale, 0.16 * scale, 0.75 * scale, yaw, COLORS.white);
    drawBox(x, y + 0.42 * scale, z, 0.44 * scale, 0.68 * scale, 0.44 * scale, yaw, COLORS.orange);
    drawBox(x, y + 0.52 * scale, z, 0.50 * scale, 0.14 * scale, 0.50 * scale, yaw, COLORS.white);
  }

  function drawTree(x, y, z, scale = 1) {
    drawBox(x, y + 0.75 * scale, z, 0.55 * scale, 1.5 * scale, 0.55 * scale, 0, COLORS.trunk);
    drawBox(x, y + 2.1 * scale, z, 2.2 * scale, 1.9 * scale, 2.2 * scale, 0.35, COLORS.tree, 0, 1, 0, 0.15);
    drawBox(x, y + 3.25 * scale, z, 1.55 * scale, 1.5 * scale, 1.55 * scale, -0.25, [0.075, 0.090, 0.120], 0, 1, 0, -0.10);
  }

  function drawBillboard(x, y, z, side, yaw, scale = 1) {
    drawBox(x, y + 2.0 * scale, z, 0.38 * scale, 4.0 * scale, 0.38 * scale, yaw, COLORS.rail);
    drawBox(x, y + 4.3 * scale, z, 5.5 * scale, 2.5 * scale, 0.34 * scale, yaw, COLORS.deckDark);
    drawBox(x + side * 0.05, y + 4.3 * scale, z - 0.20, 4.7 * scale, 1.8 * scale, 0.10 * scale, yaw, side > 0 ? COLORS.purple : COLORS.orange, 0.45);
    drawLocalBox(x, y + 4.3 * scale, z - 0.25, -1.25 * scale, 0, 0, 0.35 * scale, 0.95 * scale, 0.08, yaw, COLORS.gold, 0.45, 1, 0.65);
    drawLocalBox(x, y + 4.3 * scale, z - 0.25, 0, 0, 0.35 * scale, 0.95 * scale, 0.08, yaw, COLORS.gold, 0.45, 1, 0.65);
    drawLocalBox(x, y + 4.3 * scale, z - 0.25, 1.25 * scale, 0, 0, 0.35 * scale, 0.95 * scale, 0.08, yaw, COLORS.gold, 0.45, 1, 0.65);
  }

  function drawPitArea(cx, y, z, side, yaw) {
    const x = cx + side * (roadWidthAt(z) * 0.5 + 15);
    drawBox(x, y + 1.15, z, 17, 2.3, 8.5, yaw, COLORS.building);
    drawBox(x, y + 2.7, z - 0.6, 18, 0.55, 9.2, yaw, COLORS.purple, 0.18);
    for (let i = -3; i <= 3; i++) {
      drawLocalBox(x, y, z, i * 2.25, 1.0, -4.38, 1.6, 1.3, 0.18, yaw, i % 2 ? COLORS.red : COLORS.window, 0.4);
      drawLocalBox(x, y, z, i * 2.25, 0.55, 3.6, 1.2, 1.1, 1.2, yaw, COLORS.black);
    }
  }

  function drawProps() {
    const carZ = state.car.z;
    const start = Math.floor((carZ - 40) / 28) * 28;
    const end = carZ + WORLD.propRange;

    for (let z = start; z < end; z += 28) {
      const index = Math.floor(z / 28);
      const noise = seededNoise(index);
      const side = noise > 0.5 ? 1 : -1;
      const width = roadWidthAt(z);
      const cx = roadCenter(z);
      const y = roadHeight(z);
      const yaw = roadTangentYaw(z);
      const offset = width * 0.5 + 5.5 + seededNoise(index + 20) * 8;
      const x = cx + side * offset;

      if (index % 2 === 0) drawLamp(x, y, z, -side, yaw, 0.85 + seededNoise(index + 3) * 0.18);
      if (index % 7 === 2) drawBillboard(cx + side * (width * 0.5 + 12), y, z, side, yaw, 0.85 + seededNoise(index + 9) * 0.2);
      else if (index % 5 === 1) drawTree(x + side * 5, y - 0.2, z + 2, 0.75 + seededNoise(index + 5) * 0.55);
      else if (index % 9 === 4) {
        for (let c = 0; c < 3; c++) drawCone(cx + side * (width * 0.5 - 2.6 - c * 1.15), y + 0.08, z + c * 2.1, yaw, 0.72);
      }

      const t = trackT(z);
      if (Math.abs(t - 335) < 16 || Math.abs(t - 1840) < 16) drawPitArea(cx, y, z, side, yaw);
    }
  }

  function drawGate(gate) {
    const z = gate.z;
    if (z < state.car.z - 50 || z > state.car.z + WORLD.drawAhead) return;
    const cx = roadCenter(z);
    const y = roadHeight(z);
    const yaw = roadTangentYaw(z);
    const width = roadWidthAt(z);
    const active = !gate.taken;
    const color = active ? COLORS.gold : COLORS.rail;
    drawLocalBox(cx, y, z, -width * 0.42, 2.0, 0, 0.42, 4.0, 0.42, yaw, color, active ? 0.65 : 0.05);
    drawLocalBox(cx, y, z, width * 0.42, 2.0, 0, 0.42, 4.0, 0.42, yaw, color, active ? 0.65 : 0.05);
    drawLocalBox(cx, y, z, 0, 3.95, 0, width * 0.84, 0.42, 0.42, yaw, color, active ? 0.65 : 0.05);
    if (active) {
      for (let i = -3; i <= 3; i++) {
        drawLocalBox(cx, y, z, i * width * 0.10, 3.92, -0.25, width * 0.055, 0.16, 0.10, yaw, i % 2 ? COLORS.purpleSoft : COLORS.gold, 0.9);
      }
    }
  }

  function drawWheel(cx, cy, cz, lx, lz, yaw, steer = 0) {
    drawLocalBox(cx, cy, cz, lx, -0.50, lz, 0.58, 0.82, 1.10, yaw, COLORS.black, 0, 1, steer);
    drawLocalBox(cx, cy, cz, lx, -0.50, lz, 0.62, 0.36, 0.55, yaw, COLORS.railTop, 0.05, 1, steer);
  }

  function drawToyCar(car, skin, player = false) {
    const x = car.x;
    const y = car.y;
    const z = car.z;
    const yaw = car.yaw;
    const steer = player ? car.steer * 0.24 : 0;

    drawLocalBox(x, y, z, 0, 0.00, 0.00, 3.5, 0.92, 5.2, yaw, skin.body);
    drawLocalBox(x, y, z, 0, 0.55, 0.78, 3.15, 0.65, 2.55, yaw, skin.body);
    drawLocalBox(x, y, z, 0, 1.22, -0.20, 2.65, 1.15, 2.40, yaw, skin.body);
    drawLocalBox(x, y, z, 0, 1.27, -0.38, 2.30, 0.82, 1.65, yaw, COLORS.glass);
    drawLocalBox(x, y, z, 0, 1.42, 0.65, 2.15, 0.62, 0.65, yaw, COLORS.glass);

    drawLocalBox(x, y, z, 0, 0.64, 1.55, 0.38, 0.08, 2.15, yaw, skin.stripe, 0.18);
    drawLocalBox(x, y, z, 0, 1.82, -0.20, 0.35, 0.10, 2.35, yaw, skin.stripe, 0.18);
    drawLocalBox(x, y, z, 0, 0.18, -2.55, 3.65, 0.42, 0.38, yaw, COLORS.black);
    drawLocalBox(x, y, z, 0, 0.22, 2.58, 3.52, 0.38, 0.34, yaw, skin.accent, 0.15);

    drawLocalBox(x, y, z, -1.12, 0.35, -2.63, 0.58, 0.43, 0.15, yaw, COLORS.red, 0.75);
    drawLocalBox(x, y, z, 1.12, 0.35, -2.63, 0.58, 0.43, 0.15, yaw, COLORS.red, 0.75);
    drawLocalBox(x, y, z, -1.10, 0.44, 2.64, 0.62, 0.34, 0.12, yaw, COLORS.gold, 0.45);
    drawLocalBox(x, y, z, 1.10, 0.44, 2.64, 0.62, 0.34, 0.12, yaw, COLORS.gold, 0.45);

    drawWheel(x, y, z, -1.62, -1.58, yaw, steer);
    drawWheel(x, y, z, 1.62, -1.58, yaw, steer);
    drawWheel(x, y, z, -1.62, 1.62, yaw, steer);
    drawWheel(x, y, z, 1.62, 1.62, yaw, steer);

    if (player && input.nitro && input.gas && state.boost > 0) {
      drawLocalBox(x, y, z, -0.62, -0.03, -2.95, 0.30, 0.30, 1.25, yaw, COLORS.cyan, 1.0, 0.9);
      drawLocalBox(x, y, z, 0.62, -0.03, -2.95, 0.30, 0.30, 1.25, yaw, COLORS.purpleSoft, 1.0, 0.9);
    }

    if (player) {
      drawLocalBox(x, y, z, 0, 2.25, -0.25, 2.9, 0.12, 2.8, yaw, skin.accent, 0.55, 0.22);
    }
  }

  function drawAICars() {
    for (const ai of state.aiCars) {
      if (ai.z < state.car.z - 35 || ai.z > state.car.z + WORLD.drawAhead) continue;
      drawToyCar(ai, CAR_SKINS[ai.skinIndex], false);
    }
  }

  function drawParticles() {
    gl.depthMask(false);
    for (const p of state.particles) {
      const lifeAlpha = clamp(p.life * 2.3, 0, 1) * p.alpha;
      drawBox(p.x, p.y, p.z, p.size, p.size, p.size * 1.7, 0, p.color, p.glow, lifeAlpha);
    }
    gl.depthMask(true);
  }

  function render() {
    resize();
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    setCamera();
    drawBackdrop();
    drawTrack();
    drawProps();
    for (const gate of state.gates) drawGate(gate);
    drawAICars();
    drawToyCar(state.car, CAR_SKINS[state.selectedCar], true);
    drawParticles();
  }

  function updateUI() {
    const kmh = Math.round(state.speed * 2.54);
    if (UI.speedText) UI.speedText.textContent = String(kmh);
    if (UI.rankText) UI.rankText.textContent = `${state.rank}/${state.carTotal}`;
    if (UI.lapText) UI.lapText.textContent = `${state.currentLap}/${state.lapCount}`;
    if (UI.progressText) UI.progressText.textContent = `${Math.round(state.lapProgress * 100)}%`;
    if (UI.timeText) UI.timeText.textContent = formatTime(state.raceTime);
    if (UI.bestText) UI.bestText.textContent = state.best ? formatTime(state.best) : '--';
    if (UI.boostBar) UI.boostBar.style.width = `${state.boost}%`;
    if (UI.fpsText) UI.fpsText.textContent = `${state.fps} FPS`;
  }

  function cameraLabel() {
    return state.camera === 0 ? '追尾' : '近距';
  }

  function updateCameraButton() {
    if (UI.cameraBtn) UI.cameraBtn.textContent = `視角：${cameraLabel()}`;
  }

  let audioCtx = null;
  let masterGain = null;
  let engineOsc = null;
  let engineGain = null;

  function ensureAudio() {
    try {
      audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      if (!masterGain) {
        masterGain = audioCtx.createGain();
        masterGain.gain.value = 0.26;
        masterGain.connect(audioCtx.destination);
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  function tone(freq = 220, duration = 0.06, type = 'sine', gain = 0.04, delay = 0) {
    if (!state.sound || !ensureAudio()) return;
    const t = audioCtx.currentTime + delay;
    const osc = audioCtx.createOscillator();
    const amp = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(amp).connect(masterGain);
    osc.start(t);
    osc.stop(t + duration + 0.03);
  }

  function beep(freq, duration, type, gain) {
    tone(freq, duration, type, gain);
  }

  function chord(freqs, duration = 0.12, gain = 0.035) {
    freqs.forEach((freq, i) => tone(freq, duration + i * 0.015, i ? 'triangle' : 'square', gain * (i ? 0.65 : 1), i * 0.018));
  }

  function updateAudio() {
    if (!state.sound || !ensureAudio()) return;
    if (!engineOsc) {
      engineOsc = audioCtx.createOscillator();
      engineGain = audioCtx.createGain();
      engineOsc.type = 'sawtooth';
      engineGain.gain.value = 0.0001;
      engineOsc.connect(engineGain).connect(masterGain);
      engineOsc.start();
    }
    const now = audioCtx.currentTime;
    const moving = state.running || state.countingDown;
    const speed01 = clamp(state.speed / 145, 0, 1);
    engineOsc.frequency.setTargetAtTime(55 + speed01 * 145 + (input.gas ? 16 : 0), now, 0.055);
    engineGain.gain.setTargetAtTime(moving ? 0.015 + speed01 * 0.032 : 0.0001, now, 0.07);
  }

  function stopAudio() {
    try { engineOsc?.stop(); } catch (_) {}
    engineOsc = null;
    engineGain = null;
  }

  function bindHold(button, key) {
    if (!button) return;
    const down = (event) => {
      event.preventDefault();
      input[key] = true;
      button.classList.add('is-down');
      button.setPointerCapture?.(event.pointerId);
      ensureAudio();
    };
    const up = (event) => {
      event?.preventDefault?.();
      input[key] = false;
      button.classList.remove('is-down');
    };
    button.addEventListener('pointerdown', down, { passive: false });
    button.addEventListener('pointerup', up, { passive: false });
    button.addEventListener('pointercancel', up, { passive: false });
    button.addEventListener('pointerleave', (event) => {
      if (button.classList.contains('is-down')) up(event);
    }, { passive: false });
  }

  function bindInput() {
    bindHold(UI.gasBtn, 'gas');
    bindHold(UI.brakeBtn, 'brake');
    bindHold(UI.nitroBtn, 'nitro');
    bindHold(UI.driftBtn, 'drift');

    UI.startBtn?.addEventListener('click', startCountdown);
    UI.resetBtn?.addEventListener('click', resetGame);
    UI.cameraBtn?.addEventListener('click', () => {
      state.camera = (state.camera + 1) % 2;
      updateCameraButton();
      beep(360, 0.04, 'triangle', 0.025);
    });
    UI.soundBtn?.addEventListener('click', () => {
      state.sound = !state.sound;
      UI.soundBtn.textContent = `音效：${state.sound ? '開' : '關'}`;
      if (state.sound) chord([440, 660], 0.08, 0.03);
      else stopAudio();
    });

    UI.carChoices.forEach((button) => {
      const index = Number(button.dataset.car);
      button.classList.toggle('active', index === state.selectedCar);
      button.addEventListener('click', () => {
        state.selectedCar = index;
        localStorage.setItem('neon-toy-car', String(index));
        UI.carChoices.forEach((item) => item.classList.toggle('active', item === button));
        beep(300 + index * 60, 0.05, 'triangle', 0.03);
      });
    });

    UI.lapChoices.forEach((button) => {
      const laps = Number(button.dataset.laps);
      button.classList.toggle('active', laps === state.lapCount);
      button.addEventListener('click', () => {
        state.lapCount = laps;
        localStorage.setItem('neon-toy-laps', String(laps));
        UI.lapChoices.forEach((item) => item.classList.toggle('active', item === button));
        resetGame();
      });
    });

    UI.raceChoices.forEach((button) => {
      const cars = Number(button.dataset.cars);
      button.classList.toggle('active', cars === state.carTotal);
      button.addEventListener('click', () => {
        state.carTotal = clamp(cars, 1, 6);
        localStorage.setItem('neon-toy-cars', String(state.carTotal));
        UI.raceChoices.forEach((item) => item.classList.toggle('active', item === button));
        resetGame();
      });
    });

    window.addEventListener('keydown', (event) => {
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','KeyW','KeyA','KeyS','KeyD','KeyN','ShiftLeft','ShiftRight'].includes(event.code)) event.preventDefault();
      if (event.code === 'ArrowUp' || event.code === 'KeyW') input.gas = true;
      if (event.code === 'ArrowDown' || event.code === 'KeyS') input.brake = true;
      if (event.code === 'ArrowLeft' || event.code === 'KeyA') input.left = true;
      if (event.code === 'ArrowRight' || event.code === 'KeyD') input.right = true;
      if (event.code === 'KeyN' || event.code === 'ShiftLeft' || event.code === 'ShiftRight') input.nitro = true;
      if (event.code === 'Space') input.drift = true;
      if (event.code === 'KeyR') resetGame();
      if (event.code === 'KeyC') UI.cameraBtn?.click();
      ensureAudio();
    }, { passive: false });

    window.addEventListener('keyup', (event) => {
      if (event.code === 'ArrowUp' || event.code === 'KeyW') input.gas = false;
      if (event.code === 'ArrowDown' || event.code === 'KeyS') input.brake = false;
      if (event.code === 'ArrowLeft' || event.code === 'KeyA') input.left = false;
      if (event.code === 'ArrowRight' || event.code === 'KeyD') input.right = false;
      if (event.code === 'KeyN' || event.code === 'ShiftLeft' || event.code === 'ShiftRight') input.nitro = false;
      if (event.code === 'Space') input.drift = false;
    });

    canvas.addEventListener('pointerdown', (event) => {
      input.pointerActive = true;
      input.pointerStartX = event.clientX;
      canvas.setPointerCapture?.(event.pointerId);
    });
    canvas.addEventListener('pointermove', (event) => {
      if (!input.pointerActive) return;
      const delta = event.clientX - input.pointerStartX;
      input.touchSteer = clamp(delta / Math.max(120, canvas.clientWidth * 0.26), -1, 1);
    });
    const endPointer = () => {
      input.pointerActive = false;
      input.touchSteer = 0;
    };
    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);

    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', () => {
      updateOrientationClass();
      setTimeout(resize, 120);
      setTimeout(resize, 420);
    });
    window.visualViewport?.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        input.gas = input.brake = input.nitro = input.drift = false;
        state.running = false;
        UI.notice?.classList.remove('hidden');
      }
    });
  }

  function frame(time) {
    const now = time * 0.001;
    const dt = clamp(now - (state.lastTime || now), 0, 0.033);
    state.lastTime = now;

    update(dt);
    render();

    state.fpsAccum += dt;
    state.fpsCount++;
    if (state.fpsAccum >= 0.5) {
      state.fps = Math.round(state.fpsCount / state.fpsAccum);
      state.fpsAccum = 0;
      state.fpsCount = 0;
    }
    requestAnimationFrame(frame);
  }

  updateOrientationClass();
  bindInput();
  resetGame();
  requestAnimationFrame(frame);
})();
