(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const canvas = $('gameCanvas');
  const gl = canvas.getContext('webgl', { antialias: true, alpha: false, powerPreference: 'high-performance' });
  const errorBox = $('webglError');

  if (!gl) {
    errorBox.hidden = false;
    return;
  }

  const UI = {
    speedText: $('speedText'), rankText: $('rankText'), lapText: $('lapText'), progressText: $('progressText'), timeText: $('timeText'), bestText: $('bestText'),
    healthBar: $('healthBar'), boostBar: $('boostBar'), fpsText: $('fpsText'), notice: $('notice'), noticeText: $('noticeText'), countdown: $('countdown'),
    startBtn: $('startBtn'), gasBtn: $('gasBtn'), brakeBtn: $('brakeBtn'), resetBtn: $('resetBtn'), cameraBtn: $('cameraBtn'), soundBtn: $('soundBtn'),
    carChoices: Array.from(document.querySelectorAll('.car-choice')),
    lapChoices: Array.from(document.querySelectorAll('.lap-choice')),
    raceChoices: Array.from(document.querySelectorAll('.race-choice'))
  };

  function updateOrientationClass() {
    const w = window.innerWidth || document.documentElement.clientWidth || 0;
    const h = window.innerHeight || document.documentElement.clientHeight || 0;
    const portrait = h > w && w <= 820;
    document.documentElement.classList.toggle('is-portrait-mobile', portrait);
    document.documentElement.classList.toggle('is-landscape-mobile', !portrait && h <= 520 && w <= 980);
  }

  const CAR_SKINS = [
    { name: '白色', body: [0.94, 0.91, 0.78], stripe: [0.12, 0.13, 0.14], glass: [0.08, 0.16, 0.22], max: 126, accel: 74, grip: 1.00 },
    { name: '黃色', body: [1.00, 0.67, 0.08], stripe: [0.95, 0.16, 0.09], glass: [0.08, 0.12, 0.18], max: 126, accel: 74, grip: 1.00 },
    { name: '藍色', body: [0.08, 0.30, 0.86], stripe: [0.26, 0.55, 1.00], glass: [0.04, 0.10, 0.18], max: 126, accel: 74, grip: 1.00 },
    { name: '黑色', body: [0.05, 0.06, 0.08], stripe: [0.42, 0.45, 0.52], glass: [0.02, 0.05, 0.09], max: 126, accel: 74, grip: 1.00 },
    { name: '紅色', body: [0.88, 0.06, 0.08], stripe: [1.00, 0.45, 0.20], glass: [0.06, 0.10, 0.15], max: 126, accel: 74, grip: 1.00 },
    { name: '綠色', body: [0.07, 0.55, 0.22], stripe: [0.55, 1.00, 0.35], glass: [0.04, 0.11, 0.13], max: 126, accel: 74, grip: 1.00 }
  ];

  const palette = {
    sky: [0.42, 0.72, 0.95, 1],
    grass: [0.26, 0.56, 0.26],
    grass2: [0.18, 0.43, 0.18],
    dirt: [0.48, 0.30, 0.16],
    asphalt: [0.11, 0.12, 0.13],
    asphalt2: [0.16, 0.17, 0.18],
    line: [0.95, 0.88, 0.55],
    white: [0.92, 0.94, 0.92],
    red: [0.78, 0.09, 0.08],
    rail: [0.46, 0.48, 0.52],
    railDark: [0.24, 0.25, 0.28],
    trunk: [0.45, 0.27, 0.14],
    leaves: [0.10, 0.45, 0.16],
    house: [0.75, 0.55, 0.34],
    roof: [0.58, 0.13, 0.10],
    cyan: [0.14, 0.88, 1.00],
    boost: [0.35, 0.95, 1.00],
    smoke: [0.65, 0.68, 0.72]
  };

  const WORLD = {
    roadWidth: 32,
    segment: 8,
    drawAhead: 345,
    drawBehind: 52,
    propRange: 410,
    roadY: 0,
    lapLength: 2860
  };

  // V6.3：把 V6.1 的 GP 路線壓縮成短程高速賽道，保留大圈彎、S 彎、髮夾與盲坡節奏。
  const TRACK_TEMPLATE_LENGTH = 3920;
  const TRACK_SCALE = TRACK_TEMPLATE_LENGTH / WORLD.lapLength;

  const state = {
    running: false,
    countingDown: false,
    countdown: 0,
    goFlash: 0,
    sound: true,
    camera: 0,
    selectedCar: 0,
    lapCount: Number(localStorage.getItem('racing-v7.0-laps') || localStorage.getItem('racing-v6.9-laps') || localStorage.getItem('racing-v6.8-laps') || 3),
    carTotal: Number(localStorage.getItem('racing-v7.0-cars') || localStorage.getItem('racing-v6.9-cars') || localStorage.getItem('racing-v6.8-cars') || 6),
    rank: 1,
    currentLap: 1,
    lapProgress: 0,
    raceTime: 0,
    raceFinished: false,
    best: 0,
    distance: 0,
    level: 1,
    health: 100,
    boost: 0,
    speed: 0,
    car: { x: 0, y: 0.7, z: 6, yaw: 0, roll: 0, steer: 0, lateral: 0 },
    traffic: [],
    aiCars: [],
    gates: [],
    props: [],
    particles: [],
    lastTime: 0,
    fpsAccum: 0,
    fpsCount: 0,
    fps: 60,
    shake: 0,
    crashedCooldown: 0
  };

  const input = {
    gas: false,
    brake: false,
    left: false,
    right: false,
    pointerActive: false,
    pointerStartX: 0,
    pointerLastX: 0,
    touchSteer: 0,
    touchDrift: false,
    touchDriftHold: 0
  };

  function compileShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader));
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
    varying vec3 vColor;
    varying float vFog;
    void main() {
      vec4 world = uModel * vec4(aPosition, 1.0);
      vec3 n = normalize((uModel * vec4(aNormal, 0.0)).xyz);
      float light = clamp(dot(n, normalize(uLightDir)) * 0.65 + 0.55, 0.24, 1.15);
      vColor = uColor * light;
      vec4 viewPos = uView * world;
      float d = length(viewPos.xyz);
      vFog = clamp((d - 90.0) / 220.0, 0.0, 1.0);
      gl_Position = uProj * viewPos;
    }
  `);

  const fragmentShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    varying vec3 vColor;
    varying float vFog;
    void main() {
      vec3 fogColor = vec3(0.46, 0.72, 0.91);
      vec3 c = mix(vColor, fogColor, vFog);
      gl_FragColor = vec4(c, 1.0);
    }
  `);

  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);

  const loc = {
    aPosition: gl.getAttribLocation(program, 'aPosition'),
    aNormal: gl.getAttribLocation(program, 'aNormal'),
    uModel: gl.getUniformLocation(program, 'uModel'),
    uView: gl.getUniformLocation(program, 'uView'),
    uProj: gl.getUniformLocation(program, 'uProj'),
    uColor: gl.getUniformLocation(program, 'uColor'),
    uLightDir: gl.getUniformLocation(program, 'uLightDir')
  };

  const cubeData = new Float32Array([
    -1,-1, 1, 0,0,1,  1,-1, 1, 0,0,1,  1, 1, 1, 0,0,1,  -1,-1, 1, 0,0,1,  1, 1, 1, 0,0,1, -1, 1, 1, 0,0,1,
     1,-1,-1, 0,0,-1, -1,-1,-1, 0,0,-1, -1, 1,-1, 0,0,-1,  1,-1,-1, 0,0,-1, -1, 1,-1, 0,0,-1, 1, 1,-1, 0,0,-1,
    -1, 1, 1, 0,1,0,  1, 1, 1, 0,1,0,  1, 1,-1, 0,1,0,  -1, 1, 1, 0,1,0,  1, 1,-1, 0,1,0, -1, 1,-1, 0,1,0,
    -1,-1,-1, 0,-1,0, 1,-1,-1, 0,-1,0, 1,-1, 1, 0,-1,0, -1,-1,-1, 0,-1,0, 1,-1, 1, 0,-1,0, -1,-1, 1, 0,-1,0,
     1,-1, 1, 1,0,0,  1,-1,-1, 1,0,0,  1, 1,-1, 1,0,0,  1,-1, 1, 1,0,0,  1, 1,-1, 1,0,0, 1, 1, 1, 1,0,0,
    -1,-1,-1, -1,0,0, -1,-1, 1, -1,0,0, -1, 1, 1, -1,0,0, -1,-1,-1, -1,0,0, -1, 1, 1, -1,0,0, -1, 1,-1, -1,0,0
  ]);
  const cubeBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, cubeBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, cubeData, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(loc.aPosition);
  gl.vertexAttribPointer(loc.aPosition, 3, gl.FLOAT, false, 24, 0);
  gl.enableVertexAttribArray(loc.aNormal);
  gl.vertexAttribPointer(loc.aNormal, 3, gl.FLOAT, false, 24, 12);

  gl.enable(gl.DEPTH_TEST);
  // 關閉背面剔除，讓低階手機與不同 GPU 上的方塊模型更穩定顯示。
  gl.clearColor(...palette.sky);
  gl.uniform3f(loc.uLightDir, -0.45, 0.9, 0.38);

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
    let zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
    let len = Math.hypot(zx, zy, zz) || 1; zx /= len; zy /= len; zz /= len;
    let xx = up[1] * zz - up[2] * zy;
    let xy = up[2] * zx - up[0] * zz;
    let xz = up[0] * zy - up[1] * zx;
    len = Math.hypot(xx, xy, xz) || 1; xx /= len; xy /= len; xz /= len;
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

  function setBoxModel(out, x, y, z, w, h, d, yaw = 0) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const sx = w * 0.5, sy = h * 0.5, sz = d * 0.5;
    out[0] = c * sx; out[1] = 0; out[2] = -s * sx; out[3] = 0;
    out[4] = 0; out[5] = sy; out[6] = 0; out[7] = 0;
    out[8] = s * sz; out[9] = 0; out[10] = c * sz; out[11] = 0;
    out[12] = x; out[13] = y; out[14] = z; out[15] = 1;
  }

  function drawBox(x, y, z, w, h, d, yaw, color) {
    setBoxModel(model, x, y, z, w, h, d, yaw || 0);
    gl.uniformMatrix4fv(loc.uModel, false, model);
    gl.uniform3f(loc.uColor, color[0], color[1], color[2]);
    gl.drawArrays(gl.TRIANGLES, 0, 36);
  }

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smoothstep(edge0, edge1, x) { const t = clamp((x - edge0) / (edge1 - edge0), 0, 1); return t * t * (3 - 2 * t); }

  function lapZ(z) {
    return ((z % WORLD.lapLength) + WORLD.lapLength) % WORLD.lapLength;
  }

  function trackT(z) {
    return lapZ(z) * TRACK_SCALE;
  }

  function plateau(t, start, riseEnd, fallStart, end, amount) {
    return amount * smoothstep(start, riseEnd, t) * (1 - smoothstep(fallStart, end, t));
  }

  function roadCenter(z) {
    // V6.3：專家 GP 賽道。用多段 plateau 疊出大圈彎、反向髮夾、窄橋 chicane 與終點前技術區。
    const t = trackT(z);
    let c = 0;

    // 1. 起跑後中速 S：先右再左，讓開局就需要修線。
    c += plateau(t, 120, 245, 360, 500, 13.0);
    c += plateau(t, 425, 570, 705, 850, -18.0);

    // 2. 超長外圈右彎：維持很久的大半徑彎，AI 會走內線。
    c += plateau(t, 760, 1040, 1500, 1790, 41.0);
    c += Math.sin(clamp((t - 790) / 890, 0, 1) * Math.PI) * 10.5;

    // 3. 盲坡後左收回，路線會快速往內切。
    c += plateau(t, 1680, 1830, 1975, 2150, -26.0);

    // 4. 技術區：右、左、右、左，適合大角度滑動漂移。
    c += plateau(t, 2080, 2185, 2265, 2365, 19.5);
    c += plateau(t, 2300, 2405, 2505, 2615, -24.5);
    c += plateau(t, 2560, 2665, 2760, 2875, 22.0);
    c += plateau(t, 2810, 2920, 3020, 3135, -20.5);

    // 5. 新增高速 chicane：高速左切、立刻右髮夾，再回正。
    c += plateau(t, 3110, 3185, 3245, 3330, 16.0);
    c += plateau(t, 3260, 3320, 3395, 3485, -24.0);
    c += plateau(t, 3430, 3490, 3548, 3618, 15.0);

    // 6. 終點前大圈左彎，先放大再收窄，形成最後追擊區。
    c += plateau(t, 3520, 3660, 3830, 3910, -34.0);

    // 7. 細微高頻擺動：直線也需要微調，不會像軌道一樣平。
    c += Math.sin(z * 0.030) * 0.55 + Math.sin(z * 0.012) * 0.65;
    c += Math.sin(z * 0.085) * 0.42 * (1 + Math.sin(z * 0.003) * 0.28);
    return c;
  }

  function roadWidthAt(z) {
    const t = trackT(z);
    let w = WORLD.roadWidth;

    // 大外圈加寬，讓高速走線有空間。
    w += plateau(t, 720, 920, 1580, 1840, 10.0);

    // 盲坡橋與技術區收窄，產生壓迫感。
    w -= plateau(t, 1550, 1700, 1980, 2180, 9.0);
    w -= plateau(t, 2090, 2200, 2320, 2435, 5.5);
    w += plateau(t, 2350, 2470, 2640, 2790, 3.5);
    w -= plateau(t, 2790, 2900, 3060, 3185, 7.0);

    // 新增極窄 chicane，會要求玩家提早轉向與降速。
    w -= plateau(t, 3160, 3240, 3330, 3415, 12.0);
    w += plateau(t, 3420, 3500, 3590, 3660, 4.0);

    // 終點前大圈左彎放寬，提供超車空間。
    w += plateau(t, 3540, 3670, 3845, 3918, 7.0);

    return clamp(w, 19, 45);
  }

  function roadHeight(z) {
    const t = trackT(z);
    let h = 0;

    // 丘陵與盲坡：讓視野、速度感、AI 剎車點都有變化。
    h += plateau(t, 470, 710, 1080, 1280, 1.25);      // 緩上坡進大右彎
    h += plateau(t, 1000, 1170, 1500, 1660, 2.15);    // 大圈彎高點
    h += plateau(t, 1560, 1710, 1920, 2110, 3.15);    // 盲坡橋面
    h -= plateau(t, 1900, 2050, 2250, 2410, 0.95);    // 出橋下坡
    h += plateau(t, 2360, 2490, 2680, 2820, 1.05);    // 技術彎小丘

    // V6.3 新增：陡上後立刻下坡接急彎，變化比 V6.0 更明顯。
    h += plateau(t, 3120, 3200, 3280, 3370, 3.20);
    h -= plateau(t, 3380, 3450, 3550, 3650, 2.65);
    h += plateau(t, 3660, 3760, 3870, 3918, 1.05);

    // 小幅細節起伏，讓畫面有路面質感但不過度晃動。
    h += Math.sin(z * 0.010) * 0.12 + Math.sin(z * 0.023) * 0.055;
    return h;
  }

  function roadTangentYaw(z) {
    const a = roadCenter(z - 3), b = roadCenter(z + 3);
    return Math.atan2(b - a, 6);
  }
  function roadLaneX(z, lane) {
    return roadCenter(z) + lane;
  }

  function drawLocalBox(c, y, z, localX, localZ, w, h, d, yaw, color, yawOffset = 0) {
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    drawBox(c + localX * cs + localZ * sn, y, z - localX * sn + localZ * cs, w, h, d, yaw + yawOffset, color);
  }

  function seededNoise(n) {
    const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  function bestKey(laps = state.lapCount) {
    return `racing-v6.8-best-${laps}-${state.carTotal}`;
  }

  function loadBestForLaps(laps = state.lapCount) {
    return Number(localStorage.getItem(bestKey(laps)) || 0);
  }

  function formatTime(seconds) {
    if (!seconds || seconds <= 0) return '0:00.0';
    const m = Math.floor(seconds / 60);
    const s = seconds - m * 60;
    return `${m}:${s.toFixed(1).padStart(4, '0')}`;
  }

  function resetGame() {
    state.running = false;
    state.countingDown = false;
    state.countdown = 0;
    state.goFlash = 0;
    if (UI.countdown) { UI.countdown.hidden = true; UI.countdown.classList.remove('go'); }
    state.distance = 0;
    state.level = 1;
    state.currentLap = 1;
    state.lapProgress = 0;
    state.raceTime = 0;
    state.raceFinished = false;
    state.rank = 1;
    state.best = loadBestForLaps();
    state.health = 100;
    state.boost = 0;
    state.speed = 0;
    state.shake = 0;
    state.crashedCooldown = 0;
    state.car.x = roadCenter(0);
    state.car.y = roadHeight(6) + 0.82;
    state.car.z = 6;
    state.car.yaw = 0;
    state.car.roll = 0;
    state.car.steer = 0;
    state.car.lateral = 0;
    state.traffic = [];
    state.aiCars = [];
    state.gates = [];
    state.props = [];
    state.particles = [];
    generateWorld();
    UI.notice.classList.remove('hidden');
    UI.startBtn.textContent = '啟動';
    updateCameraButton();
    updateUI();
  }

  function generateWorld() {
    // V6.3：高難度 AI GP，路線更緊湊、賽道略窄、比賽時間更短；碰撞扣血仍關閉。
    state.traffic = [];
    state.aiCars = [];
    state.gates = [];
    state.props = [];

    const total = WORLD.lapLength * state.lapCount;
    const gateCount = Math.max(22, Math.ceil(total / 185) + 6);
    for (let i = 0; i < gateCount; i++) {
      // 能量門放在出彎與坡頂之後，鼓勵玩家切好線再加速。
      const z = 160 + i * 185 + (i % 4 === 0 ? 34 : i % 3 === 0 ? -20 : 0);
      state.gates.push({ z, taken: false });
    }

    const propCount = Math.ceil(total / 18);
    for (let i = 0; i < propCount; i++) {
      const z = 18 + i * 22 + seededNoise(i) * 8;
      const side = seededNoise(i + 10) > 0.5 ? 1 : -1;
      const typeRoll = seededNoise(i + 20);
      const t = trackT(z);
      let type = typeRoll > 0.88 ? 'house' : typeRoll > 0.74 ? 'rock' : 'tree';
      if ((t > 120 && t < 270) || (t > 390 && t < 620) || (t > 760 && t < 1120) || (t > 1560 && t < 2030) || (t > 2080 && t < 2420) || (t > 2550 && t < 2880) || (t > 3120 && t < 3480) || (t > 3540 && t < 3860)) type = 'chevron';
      if (typeRoll > 0.935) type = 'grandstand';
      if (typeRoll > 0.962) type = 'banner';
      const width = roadWidthAt(z);
      const offset = width * 0.5 + 8 + seededNoise(i + 30) * 25;
      state.props.push({ z, side, type, offset, scale: 0.75 + seededNoise(i + 40) * 1.45 });
    }

    generateAICars();

    const keyCorners = [145, 245, 420, 570, 770, 940, 1170, 1560, 1710, 1880, 2095, 2245, 2390, 2570, 2720, 2890, 3140, 3265, 3375, 3545, 3705, 3840].map(v => v / TRACK_SCALE);
    for (let lap = 0; lap < state.lapCount; lap++) {
      for (const k of keyCorners) {
        const z = lap * WORLD.lapLength + k;
        const side = roadCenter(z + 24) > roadCenter(z - 24) ? -1 : 1;
        state.props.push({ z, side, type: 'chevron', offset: roadWidthAt(z) * 0.5 + 5.8, scale: 1.25 });
      }
    }
  }

  function trafficColor(i) {
    const colors = [[0.95,0.9,0.82],[0.95,0.72,0.1],[0.07,0.22,0.70],[0.04,0.04,0.05],[0.75,0.08,0.08],[0.12,0.55,0.25]];
    return colors[i % colors.length];
  }

  function generateAICars() {
    state.aiCars = [];
    const totalCars = clamp(Math.round(state.carTotal || 1), 1, 6);
    state.carTotal = totalCars;
    const gridOffsets = [5.8, -5.8, 0, 11.2, -11.2];
    for (let i = 1; i < totalCars; i++) {
      const z = 6 - Math.ceil(i / 2) * 4.2;
      const lane = gridOffsets[(i - 1) % gridOffsets.length];
      const skinIndex = i % CAR_SKINS.length;
      const tier = i / Math.max(1, totalCars - 1);
      state.aiCars.push({
        id: i,
        skinIndex,
        x: roadCenter(z) + lane,
        y: roadHeight(z) + 0.82,
        z,
        yaw: roadTangentYaw(z),
        lane,
        speed: 0,
        distance: 0,
        // V6.8：AI 再強化。最後一台是王牌，倒數第二台是勁敵，一般 AI 也更積極。
        ace: totalCars >= 5 && i >= totalCars - 2,
        champion: totalCars >= 5 && i === totalCars - 1,
        rival: totalCars >= 5 && i === totalCars - 2,
        skill: totalCars >= 5 && i === totalCars - 1
          ? 1.27
          : totalCars >= 5 && i === totalCars - 2
            ? 1.22
            : clamp(0.98 + tier * 0.12 + seededNoise(300 + i) * 0.06, 0.96, 1.12),
        aggression: totalCars >= 5 && i === totalCars - 1
          ? 1.18
          : totalCars >= 5 && i === totalCars - 2
            ? 1.10
            : clamp(0.54 + tier * 0.32 + seededNoise(510 + i) * 0.15, 0.52, 0.96),
        phase: seededNoise(420 + i) * Math.PI * 2,
        overtakeBias: seededNoise(620 + i) > 0.5 ? 1 : -1,
        finished: false,
        finishTime: 0
      });
    }
  }

  function updateAICars(dt) {
    const totalRaceDistance = WORLD.lapLength * state.lapCount;
    const player = state.car;
    for (const ai of state.aiCars) {
      if (ai.finished) continue;

      // 看更遠，提前為髮夾、窄路、盲坡煞車。
      const nearZ = ai.z + 18;
      const futureZ = ai.z + 68;
      const farZ = ai.z + 108;
      const curveNear = Math.abs(roadCenter(nearZ) - roadCenter(ai.z)) / 22 + Math.abs(roadTangentYaw(nearZ)) * 1.05;
      const curveFuture = Math.abs(roadCenter(farZ) - roadCenter(nearZ)) / 34 + Math.abs(roadTangentYaw(futureZ)) * 1.25;
      const curveStrength = curveNear * 0.65 + curveFuture * 0.92;
      const widthNow = roadWidthAt(ai.z);
      const widthFuture = roadWidthAt(futureZ);
      const narrowPenalty = widthFuture < 28 ? 10.5 : widthFuture < 32 ? 6.5 : 0;
      const hillDelta = roadHeight(ai.z + 42) - roadHeight(ai.z - 10);
      const hillPenalty = Math.max(0, hillDelta) * 4.1;
      const downhillBonus = Math.max(0, -hillDelta) * 2.0;

      // 靠近玩家且速度更快時，AI 會更積極超車；沒有碰撞扣血，只做視覺與名次壓力。
      const gapToPlayer = player.z - ai.z;
      const playerLane = player.x - roadCenter(player.z);
      const canAttack = gapToPlayer > -22 && gapToPlayer < 96 && ai.speed >= state.speed * 0.86 && state.carTotal > 1;
      const aceScale = ai.champion ? 1.0 : ai.rival ? 0.82 : 0.0;
      const attackBoost = canAttack ? (ai.ace ? (8.6 + aceScale * 1.8) : 5.8) * ai.aggression : 0;
      const raceBreathing = Math.sin(state.raceTime * (1.02 + ai.aggression * 0.13) + ai.phase) * (ai.champion ? 2.15 : ai.rival ? 1.85 : 1.35);
      const startBoost = state.raceTime < 1.0 ? 0.86 : 1;
      const base = (ai.champion ? 124.5 : ai.rival ? 122.0 : 113.5) * ai.skill;
      const curveBrake = curveStrength * (ai.champion ? 16.6 : ai.rival ? 17.2 : 20.2 - ai.aggression * 2.2);
      const target = clamp((base - curveBrake - narrowPenalty * (ai.ace ? 0.76 : 0.98) - hillPenalty * (ai.ace ? 0.78 : 0.98) + downhillBonus * 0.96 + attackBoost + raceBreathing) * startBoost, 64, ai.champion ? 164 : ai.rival ? 158 : 146);
      ai.speed = lerp(ai.speed, target, 1 - Math.pow(ai.champion ? 0.0048 : ai.rival ? 0.0058 : 0.0088, dt));
      ai.z += ai.speed * dt * 0.78;
      ai.distance = Math.max(0, ai.z - 6);

      // 理想線：彎前靠外、彎中切內，再加上超車偏移。
      const curveDir = Math.sign(roadCenter(futureZ) - roadCenter(ai.z + 4)) || Math.sign(roadTangentYaw(futureZ)) || 1;
      const innerLane = -curveDir * (5.4 + ai.aggression * (ai.champion ? 1.85 : ai.rival ? 1.62 : 1.18));
      const setupLane = curveDir * (ai.champion ? 2.85 : ai.rival ? 2.55 : 2.05) * smoothstep(0.10, 0.74, curveStrength);
      let overtakeLane = 0;
      if (canAttack) {
        const passSide = Math.abs(playerLane) > 2.5 ? -Math.sign(playerLane) : ai.overtakeBias;
        overtakeLane = passSide * ((ai.champion ? 7.0 : ai.rival ? 6.4 : 5.2) + ai.aggression * 1.70);
      }
      const laneWave = Math.sin(ai.z * 0.021 + ai.phase) * (ai.champion ? 0.18 : ai.rival ? 0.26 : 0.46 + (1.05 - ai.aggression) * 0.24);
      const desiredLane = clamp(ai.lane * (ai.champion ? 0.09 : ai.rival ? 0.12 : 0.19) + innerLane * (ai.champion ? 0.68 : ai.rival ? 0.63 : 0.53) + setupLane + overtakeLane + laneWave, -widthNow * 0.405, widthNow * 0.405);
      const desiredX = roadCenter(ai.z) + desiredLane;
      ai.x = lerp(ai.x, desiredX, 1 - Math.pow(ai.champion ? 0.0028 : ai.rival ? 0.0034 : 0.0048, dt));
      ai.y = roadHeight(ai.z) + 0.82;
      ai.yaw = lerp(ai.yaw, roadTangentYaw(ai.z + 12) + (desiredX - ai.x) * 0.032, 1 - Math.pow(0.009, dt));

      if (ai.distance >= totalRaceDistance) {
        ai.finished = true;
        ai.finishTime = state.raceTime;
        ai.distance = totalRaceDistance;
        ai.z = totalRaceDistance + 6;
      }
    }
  }

  function updateRank() {
    const playerProgress = state.raceFinished ? WORLD.lapLength * state.lapCount : state.distance;
    let faster = 0;
    for (const ai of state.aiCars) {
      if ((ai.finished ? WORLD.lapLength * state.lapCount : ai.distance) > playerProgress + 0.35) faster++;
    }
    state.rank = clamp(1 + faster, 1, state.carTotal);
  }

  function startCountdown() {
    if (state.running || state.countingDown || state.raceFinished) return;
    state.countingDown = true;
    state.countdown = 3.15;
    state.goFlash = 0;
    UI.notice.classList.add('hidden');
    UI.startBtn.textContent = '倒數';
    if (UI.countdown) {
      UI.countdown.hidden = false;
      UI.countdown.classList.remove('go');
      UI.countdown.textContent = '3';
    }
    chord([280, 420], 0.08, 0.034);
  }

  function setRunning(next) {
    if (next) {
      startCountdown();
      return;
    }
    state.running = false;
    state.countingDown = false;
    state.countdown = 0;
    state.goFlash = 0;
    if (UI.countdown) { UI.countdown.hidden = true; UI.countdown.classList.remove('go'); }
    UI.notice.classList.remove('hidden');
    UI.startBtn.textContent = state.raceFinished ? '再跑一次' : '啟動';
  }

  function gameOver() {
    state.running = false;
    UI.notice.classList.remove('hidden');
    UI.startBtn.textContent = '重開';
    UI.noticeText.textContent = '按「啟動」重新挑戰，或換一個車色再出發。';
    beep(90, 0.2, 'sawtooth', 0.08);
  }

  let audioCtx = null;
  let masterGain = null;
  let engineOsc = null;
  let engineSub = null;
  let engineGain = null;
  let musicTimer = 0;
  let musicStep = 0;
  const MUSIC_PATTERN = [0, 3, 7, 10, 7, 3, 5, 8, 12, 8, 5, 2, 0, 5, 7, 12];

  function ensureAudio() {
    try {
      audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      if (!masterGain) {
        masterGain = audioCtx.createGain();
        masterGain.gain.value = 0.32;
        masterGain.connect(audioCtx.destination);
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  function tone(freq = 220, dur = 0.05, type = 'sine', gain = 0.04, delay = 0) {
    if (!state.sound || !ensureAudio()) return;
    const t = audioCtx.currentTime + delay;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.frequency.setValueAtTime(freq, t);
    osc.type = type;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(masterGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function beep(freq = 220, dur = 0.05, type = 'sine', gain = 0.04) {
    tone(freq, dur, type, gain);
    if (freq > 420) tone(freq * 1.5, dur * 0.72, 'triangle', gain * 0.34, 0.01);
  }

  function chord(freqs, dur = 0.12, gain = 0.035) {
    freqs.forEach((freq, i) => tone(freq, dur + i * 0.018, i ? 'triangle' : 'square', gain * (i ? 0.58 : 1), i * 0.018));
  }

  function startEngineLoop() {
    if (!state.sound || !ensureAudio() || engineOsc) return;
    engineGain = audioCtx.createGain();
    engineGain.gain.value = 0.0001;
    engineGain.connect(masterGain);
    engineOsc = audioCtx.createOscillator();
    engineSub = audioCtx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineSub.type = 'triangle';
    engineOsc.frequency.value = 72;
    engineSub.frequency.value = 36;
    engineOsc.connect(engineGain);
    engineSub.connect(engineGain);
    engineOsc.start();
    engineSub.start();
  }

  function stopEngineLoop() {
    try {
      if (engineOsc) engineOsc.stop();
      if (engineSub) engineSub.stop();
    } catch (_) {}
    engineOsc = null;
    engineSub = null;
    engineGain = null;
  }

  function updateAudio(dt) {
    if (!state.sound) { stopEngineLoop(); return; }
    if (!audioCtx || !masterGain) return;
    if (audioCtx.state === 'suspended') return;
    startEngineLoop();
    const now = audioCtx.currentTime;
    const moving = state.running || state.countingDown || state.goFlash > 0;
    const speed01 = clamp(state.speed / 126, 0, 1);
    if (engineGain && engineOsc && engineSub) {
      const engineVolume = moving ? 0.020 + speed01 * 0.040 + (input.gas ? 0.012 : 0) : 0.0001;
      engineGain.gain.setTargetAtTime(engineVolume, now, 0.055);
      engineOsc.frequency.setTargetAtTime(58 + speed01 * 112 + (input.gas ? 12 : 0), now, 0.045);
      engineSub.frequency.setTargetAtTime(29 + speed01 * 52, now, 0.06);
    }

    if (!state.running) return;
    musicTimer -= dt;
    if (musicTimer <= 0) {
      const step = MUSIC_PATTERN[musicStep % MUSIC_PATTERN.length];
      const base = 98;
      const freq = base * Math.pow(2, step / 12);
      tone(freq, 0.065, musicStep % 4 === 0 ? 'square' : 'triangle', 0.010 + speed01 * 0.006);
      if (musicStep % 4 === 0) tone(base * 0.5, 0.09, 'sawtooth', 0.010);
      if (state.boost > 18 && musicStep % 2 === 0) tone(freq * 2, 0.045, 'triangle', 0.007);
      musicStep += 1;
      musicTimer = state.boost > 18 ? 0.165 : 0.215;
    }
  }

  function setViewportVars() {
    const vv = window.visualViewport;
    const h = Math.round((vv && vv.height) || window.innerHeight || document.documentElement.clientHeight || 0);
    const w = Math.round((vv && vv.width) || window.innerWidth || document.documentElement.clientWidth || 0);
    if (h > 0) document.documentElement.style.setProperty('--app-height', `${h}px`);
    if (w > 0) document.documentElement.style.setProperty('--app-width', `${w}px`);
  }

  function resize() {
    setViewportVars();
    updateOrientationClass();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(1, rect.width || canvas.clientWidth || window.innerWidth);
    const cssH = Math.max(1, rect.height || canvas.clientHeight || window.innerHeight);
    const w = Math.floor(cssW * dpr);
    const h = Math.floor(cssH * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      perspective(proj, Math.PI / 3.18, w / h, 0.08, 430);
      gl.uniformMatrix4fv(loc.uProj, false, proj);
    }
  }

  function update(dt) {
    if (state.countingDown) {
      state.countdown -= dt;
      const n = Math.ceil(Math.max(0, state.countdown));
      if (UI.countdown) UI.countdown.textContent = n > 0 ? String(n) : 'GO!';
      if (state.countdown <= 0) {
        state.countingDown = false;
        state.running = true;
        state.goFlash = 0.58;
        UI.startBtn.textContent = '暫停';
        if (UI.countdown) { UI.countdown.hidden = false; UI.countdown.classList.add('go'); UI.countdown.textContent = 'GO!'; }
        chord([520, 780, 1040], 0.13, 0.050);
      } else if (Math.abs(state.countdown - Math.round(state.countdown)) < dt * 0.65) {
        chord([280 + n * 52, 420 + n * 56], 0.075, 0.028);
      }
      state.speed = 0;
      return;
    }
    if (state.goFlash > 0) {
      state.goFlash -= dt;
      if (state.goFlash <= 0 && UI.countdown) UI.countdown.hidden = true;
    }
    if (!state.running) {
      state.speed *= Math.pow(0.90, dt * 60);
      return;
    }

    const skin = CAR_SKINS[state.selectedCar];
    const car = state.car;
    state.raceTime += dt;
    const roadC = roadCenter(car.z);
    car.y = roadHeight(car.z) + 0.82;
    const keyboardSteer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const targetSteer = clamp(keyboardSteer + input.touchSteer, -1, 1);
    car.steer = lerp(car.steer, targetSteer, 1 - Math.pow(0.000035, dt));

    // V6.6：極速維持約 320 km/h，加速反應提高，起跑與出彎補油更快。
    const maxSpeed = skin.max + state.boost * 0.16;
    if (input.gas) state.speed += skin.accel * dt;
    else state.speed -= 18 * dt;
    if (input.brake) state.speed -= 72 * dt;
    if (state.boost > 1 && input.gas) state.speed += 16 * dt;

    // V6.3：坡度影響速度。上坡會吃力，下坡會自然變快，但 km/h 顯示仍維持合理。
    const slope = roadHeight(car.z + 18) - roadHeight(car.z - 10);
    state.speed += clamp(-slope * 7.0, -12.0, 10.0) * dt;
    state.speed = clamp(state.speed, 0, maxSpeed);
    state.boost = clamp(state.boost - dt * (input.gas ? 8 : 4), 0, 100);

    const curveYaw = roadTangentYaw(car.z + 10);
    input.touchDriftHold = Math.max(0, input.touchDriftHold - dt);
    const touchDrift = input.pointerActive && (Math.abs(input.touchSteer) > 0.90 || input.touchDriftHold > 0);
    const drift = (input.brake || touchDrift) && Math.abs(car.steer) > 0.40 && state.speed > 38;
    const lateralPower = (5.55 + state.speed * 0.068) * skin.grip * (drift ? 1.22 : 1);
    car.lateral += car.steer * lateralPower * dt;
    car.lateral *= Math.pow(drift ? 0.935 : 0.73, dt * 60);
    car.x += car.lateral * dt;
    car.z += state.speed * dt * 0.78;
    state.distance = Math.max(0, car.z - 6);
    const totalRaceDistance = WORLD.lapLength * state.lapCount;
    state.currentLap = clamp(Math.floor(state.distance / WORLD.lapLength) + 1, 1, state.lapCount);
    state.lapProgress = clamp((state.distance % WORLD.lapLength) / WORLD.lapLength, 0, 1);
    state.level = state.currentLap;
    car.yaw = lerp(car.yaw, curveYaw + car.steer * (drift ? 0.38 : 0.21), 1 - Math.pow(0.0045, dt));
    const bankFeel = clamp((roadTangentYaw(car.z + 18) - roadTangentYaw(car.z - 18)) * 1.2, -0.16, 0.16);
    car.roll = lerp(car.roll, bankFeel - car.steer * (drift ? 0.11 : 0.045), 1 - Math.pow(0.012, dt));

    const laneOffset = car.x - roadC;
    const limit = roadWidthAt(car.z) * 0.5 - 1.45;
    if (Math.abs(laneOffset) > limit) {
      const side = Math.sign(laneOffset);
      car.x = roadC + side * limit;
      // V6.7：取消撞牆減速，只保留邊界推回，避免玩家被卡在護欄外。
      car.lateral *= -0.035;
    }

    updateAICars(dt);
    updateRank();
    updateGates();
    updateParticles(dt, drift);

    state.crashedCooldown = Math.max(0, state.crashedCooldown - dt);
    state.shake = 0;
    if (state.distance >= totalRaceDistance) finishRace();
  }

  function finishRace() {
    if (state.raceFinished) return;
    state.raceFinished = true;
    state.running = false;
    state.countingDown = false;
    if (UI.countdown) { UI.countdown.hidden = true; UI.countdown.classList.remove('go'); }
    state.speed = 0;
    const previousBest = loadBestForLaps();
    const isBest = !previousBest || state.raceTime < previousBest;
    if (isBest) {
      state.best = state.raceTime;
      localStorage.setItem(bestKey(), String(state.raceTime));
    }
    UI.notice.classList.remove('hidden');
    UI.startBtn.textContent = '再跑一次';
    UI.noticeText.textContent = `完成 ${state.lapCount} 圈！成績 ${formatTime(state.raceTime)}，名次第 ${state.rank}/${state.carTotal}${isBest ? '，刷新最佳成績！' : `，最佳 ${formatTime(previousBest)}。`} 可調整圈數、車色或比賽車數再跑。`;
    chord(isBest ? [620, 820, 1040] : [520, 660, 820], 0.18, 0.050);
    setTimeout(() => chord(isBest ? [760, 980, 1240] : [440, 620, 760], 0.16, 0.038), 140);
  }

  function updateTraffic(dt) {
    const car = state.car;
    for (const t of state.traffic) {
      t.z += t.speed * dt * 0.24;
      if (t.z < car.z - 26) respawnTraffic(t, car.z + 220 + seededNoise(t.z) * 160);
      if (t.z > car.z + 340) respawnTraffic(t, car.z + 80 + seededNoise(t.z + 7) * 200);
      const tx = roadLaneX(t.z, t.lane + Math.sin(t.z * 0.03 + t.wiggle) * 0.2);
      const dz = t.z - car.z;
      const dx = tx - car.x;
      if (Math.abs(dz) < 3.4 && Math.abs(dx) < 2.6 && state.crashedCooldown <= 0) {
        state.health -= 16;
        state.speed *= 0.62;
        state.car.lateral -= Math.sign(dx || 1) * 5.5;
        state.shake = 0.38;
        state.crashedCooldown = 0.45;
        spawnCrashParticles(car.x, car.z + 1.6, 7);
        if (navigator.vibrate) navigator.vibrate(18);
        beep(105, 0.08, 'sine', 0.045);
      }
    }
  }

  function respawnTraffic(t, z) {
    const lanes = [-5.8, 0, 5.8];
    t.z = z;
    t.lane = lanes[Math.floor(seededNoise(z + 8) * lanes.length)];
    t.speed = 18 + seededNoise(z + 12) * 25;
    t.color = trafficColor(Math.floor(z));
  }

  function updateGates() {
    const car = state.car;
    for (const g of state.gates) {
      if (g.z < car.z - 40) { g.z += WORLD.lapLength * state.lapCount; g.taken = false; }
      const dz = g.z - car.z;
      if (!g.taken && Math.abs(dz) < 3.0 && Math.abs(car.x - roadCenter(g.z)) < roadWidthAt(g.z) * 0.42) {
        g.taken = true;
        state.boost = clamp(state.boost + 35, 0, 100);
        spawnBoostParticles(car.x, car.z + 1, 14);
        chord([520, 750, 980], 0.11, 0.038);
      }
    }
  }

  function spawnCrashParticles(x, z, count) {
    for (let i = 0; i < count; i++) {
      state.particles.push({ x, y: 0.9 + seededNoise(i + z) * 0.8, z, vx: (seededNoise(i) - .5) * 4.5, vy: seededNoise(i + 2) * 2.4, vz: (seededNoise(i + 4) - .5) * 4.5, life: 0.32 + seededNoise(i + 5) * 0.22, color: palette.smoke, size: 0.12 + seededNoise(i + 9) * 0.16 });
    }
  }

  function spawnBoostParticles(x, z, count) {
    for (let i = 0; i < count; i++) {
      state.particles.push({ x: x + (seededNoise(i) - .5) * 5, y: 0.5 + seededNoise(i + 2) * 2.2, z: z + (seededNoise(i + 4) - .5) * 4, vx: (seededNoise(i + 6) - .5) * 5, vy: seededNoise(i + 8) * 3, vz: -2 - seededNoise(i + 10) * 4, life: 0.7 + seededNoise(i + 12) * 0.45, color: palette.boost, size: 0.16 + seededNoise(i + 14) * 0.25 });
    }
  }

  function updateParticles(dt, drift) {
    if (drift && state.running) {
      const car = state.car;
      const sx = Math.sin(car.yaw), cz = Math.cos(car.yaw);
      for (let i = 0; i < 1; i++) {
        const side = i ? 1 : -1;
        state.particles.push({
          x: car.x + side * 0.95 * cz - sx * 1.8,
          y: 0.25,
          z: car.z - 1.7 * cz - side * 0.95 * sx,
          vx: side * 0.2, vy: 0.7, vz: -2.0,
          life: 0.55, color: palette.smoke, size: 0.25 + Math.random() * 0.15
        });
      }
    }
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vy -= 4 * dt;
      if (p.life <= 0 || p.y < 0) state.particles.splice(i, 1);
    }
    if (state.particles.length > 90) state.particles.splice(0, state.particles.length - 90);
  }

  function render() {
    resize();
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    setCamera();
    drawSkyDecor();
    drawTrack();
    drawProps();
    drawGates();
    drawAICars();
    drawParticles();
    drawCar(state.car.x, state.car.y, state.car.z, state.car.yaw, CAR_SKINS[state.selectedCar], true);
  }

  function cameraLabel() {
    return state.camera === 0 ? '追尾' : '近距';
  }

  function updateCameraButton() {
    UI.cameraBtn.textContent = `視角：${cameraLabel()}`;
  }

  function setCamera() {
    const car = state.car;
    const aheadZ = car.z + 30;
    const aheadCenter = roadCenter(aheadZ);
    const h = roadHeight(car.z);
    const aheadH = roadHeight(aheadZ);
    let eye;
    let target;

    if (state.camera === 0) {
      // 追尾：距離稍遠，可看清連續彎與路線箭頭，車子仍在正中。
      eye = [car.x, h + 7.7 + state.speed * 0.006, car.z - 19.0];
      target = [lerp(aheadCenter, car.x, 0.76), aheadH + 1.42, aheadZ];
    } else {
      // 近距：更貼近玩家車，速度感比較強。
      eye = [car.x, h + 5.35 + state.speed * 0.004, car.z - 11.6];
      target = [lerp(aheadCenter, car.x, 0.90), aheadH + 1.10, car.z + 21];
    }

    lookAt(view, eye, target, [0, 1, 0]);
    gl.uniformMatrix4fv(loc.uView, false, view);
  }

  function drawSkyDecor() {
    const zBase = state.car.z + 155;
    const cx = roadCenter(state.car.z + 130);
    drawBox(cx - 38, 38, zBase, 7, 7, 7, 0, [1.0, 0.82, 0.25]);
    for (let i = 0; i < 11; i++) {
      const z = state.car.z + 45 + i * 22;
      const x = cx + (seededNoise(i + Math.floor(state.car.z / 90)) - 0.5) * 85;
      const y = 24 + seededNoise(i + 80) * 12;
      drawBox(x, y, z, 8, 1.4, 2.3, 0, [0.82, 0.92, 0.98]);
      drawBox(x + 5, y + 0.2, z + 1.8, 5, 1.2, 2.0, 0, [0.74, 0.87, 0.96]);
    }
  }

  function drawTrack() {
    const carZ = state.car.z;
    const seg = WORLD.segment;
    const start = Math.floor((carZ - WORLD.drawBehind) / seg) * seg;
    const end = carZ + WORLD.drawAhead;

    for (let z = start; z < end; z += seg) {
      const mid = z + seg * 0.5;
      const c = roadCenter(mid);
      const yaw = roadTangentYaw(mid);
      const h = roadHeight(mid);
      const rw = roadWidthAt(mid);
      const band = Math.floor(mid / seg) % 2 === 0;
      const t = trackT(mid);
      const isBridge = (t > 1550 && t < 2005) || (t > 3160 && t < 3420);

      drawBox(c, h - 0.34, mid, 118, 0.25, seg * 1.08, yaw, band ? palette.grass : palette.grass2);
      if (isBridge) {
        drawBox(c, h - 0.05, mid, rw + 4.6, 0.34, seg * 1.08, yaw, [0.36, 0.38, 0.40]);
      }
      drawBox(c, h + 0.02, mid, rw, 0.16, seg * 1.08, yaw, band ? palette.asphalt : palette.asphalt2);

      const lapLine = Math.round(mid / WORLD.lapLength) * WORLD.lapLength;
      if (Math.abs(mid - lapLine) < seg * 0.55) drawFinishLine(c, mid, yaw, rw);

      // 分隔線：從原本簡單雙線，變成更像賽道的三段導引線。
      if (Math.floor(mid / seg) % 2 === 0) {
        drawLocalBox(c, h + 0.14, mid, -rw / 6, 0, 0.22, 0.045, seg * 0.52, yaw, palette.line);
        drawLocalBox(c, h + 0.14, mid, rw / 6, 0, 0.22, 0.045, seg * 0.52, yaw, palette.line);
        if (t > 560 && t < 950) drawLocalBox(c, h + 0.145, mid, 0, 0, 0.18, 0.045, seg * 0.38, yaw, [0.95,0.95,0.82]);
      }

      // 彎道前的路面箭頭。
      if ((t > 105 && t < 210) || (t > 735 && t < 910) || (t > 2070 && t < 2240) || (t > 2550 && t < 2715) || (t > 3110 && t < 3225) || (t > 3420 && t < 3560)) {
        drawTrackArrow(c, h, mid, yaw, 1, rw);
      } else if ((t > 405 && t < 560) || (t > 1660 && t < 1850) || (t > 2290 && t < 2470) || (t > 2790 && t < 2980) || (t > 3255 && t < 3405) || (t > 3540 && t < 3820)) {
        drawTrackArrow(c, h, mid, yaw, -1, rw);
      }

      // 道路邊線、紅白路肩、護欄
      drawLocalBox(c, h + 0.16, mid, -rw * 0.5 + 0.3, 0, 0.25, 0.05, seg * 1.02, yaw, palette.white);
      drawLocalBox(c, h + 0.16, mid, rw * 0.5 - 0.3, 0, 0.25, 0.05, seg * 1.02, yaw, palette.white);
      const curbColorA = Math.floor(mid / 8) % 2 === 0 ? palette.red : palette.white;
      const curbColorB = Math.floor(mid / 8) % 2 === 0 ? palette.white : palette.red;
      drawLocalBox(c, h + 0.18, mid, -rw * 0.5 - 0.45, 0, 0.58, 0.08, seg * 0.45, yaw, curbColorA);
      drawLocalBox(c, h + 0.18, mid, rw * 0.5 + 0.45, 0, 0.58, 0.08, seg * 0.45, yaw, curbColorB);

      const railHeight = isBridge ? 1.05 : 0.72;
      drawLocalBox(c, h + railHeight, mid, -rw * 0.5 - 1.25, 0, 0.28, isBridge ? 1.18 : 0.75, seg * 0.98, yaw, palette.rail);
      drawLocalBox(c, h + railHeight, mid, rw * 0.5 + 1.25, 0, 0.28, isBridge ? 1.18 : 0.75, seg * 0.98, yaw, palette.rail);
      if (Math.floor(mid / 16) % 3 === 0) {
        drawLocalBox(c, h + 1.35, mid, -rw * 0.5 - 1.25, 0, 0.42, 0.22, seg * 0.55, yaw, palette.railDark);
        drawLocalBox(c, h + 1.35, mid, rw * 0.5 + 1.25, 0, 0.42, 0.22, seg * 0.55, yaw, palette.railDark);
      }
    }
  }

  function drawTrackArrow(c, h, z, yaw, dir, rw) {
    const x = dir * rw * 0.18;
    drawLocalBox(c, h + 0.21, z, x, 0.2, 0.28, 0.055, 2.35, yaw, [0.96,0.88,0.28], dir * 0.52);
    drawLocalBox(c, h + 0.21, z, x, 0.2, 0.28, 0.055, 2.35, yaw, [0.96,0.88,0.28], -dir * 0.52);
  }

  function drawFinishLine(c, z, yaw, rw = roadWidthAt(z)) {
    const h = roadHeight(z);
    const squares = 14;
    const squareW = rw / squares;
    for (let i = 0; i < squares; i++) {
      const localX = -rw * 0.5 + squareW * (i + 0.5);
      const colorA = i % 2 === 0 ? palette.white : [0.03, 0.035, 0.04];
      const colorB = i % 2 === 0 ? [0.03, 0.035, 0.04] : palette.white;
      drawLocalBox(c, h + 0.22, z, localX, -1.15, squareW * 0.92, 0.08, 1.1, yaw, colorA);
      drawLocalBox(c, h + 0.22, z, localX, 1.15, squareW * 0.92, 0.08, 1.1, yaw, colorB);
    }
    drawLocalBox(c, h + 3.0, z, -rw * 0.48, 0, 0.42, 5.2, 0.42, yaw, palette.white);
    drawLocalBox(c, h + 3.0, z, rw * 0.48, 0, 0.42, 5.2, 0.42, yaw, palette.white);
    drawBox(c, h + 5.35, z, rw * 0.96, 0.38, 0.42, yaw, [0.03, 0.035, 0.04]);
    drawBox(c, h + 5.86, z, rw * 0.70, 0.34, 0.34, yaw, [0.90, 0.12, 0.10]);
  }

  function drawProps() {
    const carZ = state.car.z;
    for (const p of state.props) {
      const total = WORLD.lapLength * state.lapCount;
      while (p.z < carZ - 60) p.z += total;
      while (p.z > carZ + WORLD.propRange) p.z -= total;
      if (p.z < carZ - 55 || p.z > carZ + WORLD.propRange) continue;
      const baseX = roadCenter(p.z) + p.side * p.offset;
      if (p.type === 'tree') drawTree(baseX, p.z, p.scale);
      else if (p.type === 'house') drawHouse(baseX, p.z, p.scale, p.side);
      else if (p.type === 'grandstand') drawGrandstand(baseX, p.z, p.scale, p.side);
      else if (p.type === 'banner') drawBanner(baseX, p.z, p.scale, p.side);
      else if (p.type === 'chevron') drawChevron(baseX, p.z, p.scale, p.side);
      else drawRock(baseX, p.z, p.scale);
    }
  }

  function drawTree(x, z, s) {
    const y = roadHeight(z);
    drawBox(x, y + 0.9 * s, z, 0.7 * s, 1.8 * s, 0.7 * s, 0, palette.trunk);
    drawBox(x, y + 2.4 * s, z, 2.2 * s, 1.5 * s, 2.2 * s, 0.25, palette.leaves);
    drawBox(x + 0.3 * s, y + 3.15 * s, z - 0.2 * s, 1.5 * s, 1.2 * s, 1.5 * s, -0.15, [0.08, 0.36, 0.13]);
  }

  function drawHouse(x, z, s, side) {
    const y = roadHeight(z);
    drawBox(x, y + 0.9 * s, z, 3.2 * s, 1.8 * s, 2.7 * s, 0.12 * side, palette.house);
    drawBox(x, y + 2.05 * s, z, 3.7 * s, 0.75 * s, 3.1 * s, 0.12 * side, palette.roof);
    drawBox(x + side * 0.9 * s, y + 1.05 * s, z - 1.37 * s, 0.65 * s, 0.75 * s, 0.08 * s, 0.12 * side, [0.08, 0.15, 0.23]);
    drawBox(x - side * 1.0 * s, y + 0.78 * s, z + 1.38 * s, 0.42 * s, 0.95 * s, 0.08 * s, 0.12 * side, [0.28, 0.16, 0.08]);
  }

  function drawRock(x, z, s) {
    const y = roadHeight(z);
    drawBox(x, y + 0.35 * s, z, 1.6 * s, 0.7 * s, 1.2 * s, 0.4, [0.36, 0.37, 0.34]);
    drawBox(x + 0.55 * s, y + 0.55 * s, z - 0.2 * s, 0.9 * s, 0.7 * s, 0.8 * s, -0.2, [0.26, 0.27, 0.25]);
  }

  function drawChevron(x, z, s, side) {
    const y = roadHeight(z);
    const yaw = roadTangentYaw(z);
    const face = yaw + side * 0.2;
    drawBox(x, y + 1.0 * s, z, 0.26 * s, 2.0 * s, 0.26 * s, face, [0.10,0.10,0.11]);
    drawBox(x, y + 2.25 * s, z, 2.5 * s, 1.0 * s, 0.24 * s, face, [0.95,0.80,0.10]);
    drawBox(x + side * 0.42 * s, y + 2.25 * s, z + 0.05 * s, 0.42 * s, 0.78 * s, 0.30 * s, face + side * 0.55, [0.05,0.06,0.07]);
    drawBox(x - side * 0.32 * s, y + 2.25 * s, z + 0.05 * s, 0.42 * s, 0.78 * s, 0.30 * s, face - side * 0.55, [0.05,0.06,0.07]);
  }

  function drawGrandstand(x, z, s, side) {
    const y = roadHeight(z);
    const yaw = roadTangentYaw(z) + side * 0.02;
    drawBox(x, y + 0.55 * s, z, 6.2 * s, 1.1 * s, 2.4 * s, yaw, [0.28,0.30,0.33]);
    drawBox(x, y + 1.45 * s, z - 0.25 * s, 5.7 * s, 0.55 * s, 2.1 * s, yaw, [0.42,0.44,0.48]);
    drawBox(x, y + 2.0 * s, z - 0.5 * s, 5.2 * s, 0.4 * s, 1.8 * s, yaw, [0.55,0.56,0.58]);
    drawBox(x, y + 2.75 * s, z - 0.65 * s, 6.8 * s, 0.28 * s, 2.6 * s, yaw, [0.95,0.10,0.12]);
  }

  function drawBanner(x, z, s, side) {
    const y = roadHeight(z);
    const yaw = roadTangentYaw(z);
    drawBox(x, y + 1.8 * s, z, 0.20 * s, 3.6 * s, 0.20 * s, yaw, palette.railDark);
    drawBox(x + side * 2.4 * s, y + 1.8 * s, z, 0.20 * s, 3.6 * s, 0.20 * s, yaw, palette.railDark);
    drawBox(x + side * 1.2 * s, y + 3.15 * s, z, 2.8 * s, 0.70 * s, 0.20 * s, yaw, [0.10,0.55,0.85]);
    drawBox(x + side * 1.2 * s, y + 3.15 * s, z + 0.04, 2.1 * s, 0.22 * s, 0.22 * s, yaw, [0.95,0.95,0.90]);
  }

  function drawGates() {
    for (const g of state.gates) {
      if (g.z < state.car.z - 30 || g.z > state.car.z + WORLD.drawAhead) continue;
      const c = roadCenter(g.z);
      const yaw = roadTangentYaw(g.z);
      const h = roadHeight(g.z);
      const rw = roadWidthAt(g.z);
      const col = g.taken ? [0.12, 0.34, 0.42] : palette.cyan;
      drawLocalBox(c, h + 2.2, g.z, -rw * 0.34, 0, 0.38, 4.4, 0.38, yaw, col);
      drawLocalBox(c, h + 2.2, g.z, rw * 0.34, 0, 0.38, 4.4, 0.38, yaw, col);
      drawBox(c, h + 4.25, g.z, rw * 0.68, 0.38, 0.38, yaw, col);
      drawBox(c, h + 0.35, g.z, rw * 0.52, 0.08, 0.24, yaw, g.taken ? [0.06,0.18,0.22] : [0.2,0.95,1.0]);
    }
  }

  function drawAICars() {
    for (const ai of state.aiCars) {
      if (ai.z < state.car.z - 42 || ai.z > state.car.z + WORLD.drawAhead) continue;
      drawCar(ai.x, roadHeight(ai.z) + 0.82, ai.z, ai.yaw, CAR_SKINS[ai.skinIndex], false);
      // 電腦車上方的小色塊標記，讓 6 車混戰時更容易辨識。
      drawBox(ai.x, roadHeight(ai.z) + 3.35, ai.z, 1.25, 0.16, 0.36, ai.yaw, CAR_SKINS[ai.skinIndex].stripe);
    }
  }

  function drawTraffic() {
    for (const t of state.traffic) {
      if (t.z < state.car.z - 25 || t.z > state.car.z + WORLD.drawAhead) continue;
      const x = roadLaneX(t.z, t.lane + Math.sin(t.z * 0.03 + t.wiggle) * 0.2);
      drawCar(x, 0.72, t.z, roadTangentYaw(t.z), { body: t.color, stripe: [0.88,0.9,0.92], glass: [0.04,0.08,0.12] }, false);
    }
  }

  function drawParticles() {
    for (const p of state.particles) {
      if (p.z < state.car.z - 30 || p.z > state.car.z + WORLD.drawAhead) continue;
      drawBox(p.x, p.y, p.z, p.size, p.size, p.size, 0, p.color);
    }
  }

  function rotated(parent, ox, oy, oz) {
    const s = Math.sin(parent.yaw), c = Math.cos(parent.yaw);
    return [parent.x + ox * c + oz * s, parent.y + oy, parent.z - ox * s + oz * c];
  }

  function carPart(parent, ox, oy, oz, w, h, d, color, yawOffset = 0) {
    const p = rotated(parent, ox, oy, oz);
    drawBox(p[0], p[1], p[2], w, h, d, parent.yaw + yawOffset, color);
  }

  function drawCar(x, y, z, yaw, skin, isPlayer) {
    const p = { x, y, z, yaw };
    const body = skin.body;
    const stripe = skin.stripe;
    const glass = skin.glass;
    const tire = [0.015, 0.017, 0.02];
    const rim = isPlayer ? [0.88, 0.90, 0.88] : [0.65, 0.68, 0.70];

    // 陰影
    carPart(p, 0, -0.68, 0, 3.35, 0.08, 5.15, [0.035,0.045,0.05]);
    // 車身：小模型車比例
    carPart(p, 0, -0.18, 0, 2.85, 0.75, 4.55, body);
    carPart(p, 0, 0.38, -0.22, 2.25, 0.78, 2.25, body);
    carPart(p, 0, 0.88, -0.42, 1.75, 0.72, 1.42, glass);
    carPart(p, 0, 0.72, 0.55, 1.7, 0.38, 1.0, glass);
    // 引擎蓋、尾翼與貼紙線條
    carPart(p, 0, 0.24, 1.38, 2.35, 0.12, 1.35, body);
    carPart(p, 0, 0.34, -2.05, 2.45, 0.18, 0.28, stripe);
    carPart(p, -1.08, 0.05, 0.05, 0.11, 0.16, 3.55, stripe);
    carPart(p, 1.08, 0.05, 0.05, 0.11, 0.16, 3.55, stripe);
    // 車燈
    carPart(p, -0.72, 0.02, 2.31, 0.42, 0.22, 0.08, [1.0, 0.95, 0.62]);
    carPart(p, 0.72, 0.02, 2.31, 0.42, 0.22, 0.08, [1.0, 0.95, 0.62]);
    carPart(p, -0.78, 0.02, -2.32, 0.38, 0.20, 0.08, [1.0, 0.12, 0.08]);
    carPart(p, 0.78, 0.02, -2.32, 0.38, 0.20, 0.08, [1.0, 0.12, 0.08]);
    // 輪胎與輪框
    const wheelZ = 1.45;
    for (const sx of [-1, 1]) {
      for (const sz of [-wheelZ, wheelZ]) {
        carPart(p, sx * 1.46, -0.55, sz, 0.46, 0.82, 0.72, tire);
        carPart(p, sx * 1.49, -0.55, sz, 0.08, 0.48, 0.42, rim);
      }
    }
    if (isPlayer && state.boost > 8) {
      carPart(p, -0.5, -0.08, -2.72, 0.34, 0.34, 0.9, palette.boost);
      carPart(p, 0.5, -0.08, -2.72, 0.34, 0.34, 0.9, palette.boost);
    }
  }

  function updateUI() {
    UI.speedText.textContent = Math.round(Math.min(320, state.speed * 2.25));
    if (UI.rankText) UI.rankText.textContent = `${state.rank}/${state.carTotal}`;
    UI.lapText.textContent = `${state.currentLap}/${state.lapCount}`;
    const raceProgress = clamp(state.distance / (WORLD.lapLength * state.lapCount), 0, 1);
    UI.progressText.textContent = `${Math.floor(raceProgress * 100)}%`;
    UI.timeText.textContent = formatTime(state.raceTime);
    UI.bestText.textContent = state.best ? formatTime(state.best) : '--';
    if (UI.healthBar) UI.healthBar.style.width = `${clamp(state.health, 0, 100)}%`;
    UI.boostBar.style.width = `${clamp(state.boost, 0, 100)}%`;
  }

  function frame(now) {
    const dt = Math.min(0.04, (now - (state.lastTime || now)) / 1000);
    state.lastTime = now;
    update(dt);
    updateAudio(dt);
    render();
    updateUI();

    state.fpsAccum += dt;
    state.fpsCount++;
    if (state.fpsAccum >= 0.5) {
      state.fps = Math.round(state.fpsCount / state.fpsAccum);
      state.fpsAccum = 0;
      state.fpsCount = 0;
      UI.fpsText.textContent = `${state.fps} FPS · 3D · ${cameraLabel()}`;
    }
    requestAnimationFrame(frame);
  }

  function bindHoldButton(btn, prop) {
    const down = (e) => { e.preventDefault(); input[prop] = true; btn.classList.add('is-down'); ensureAudio(); };
    const up = (e) => { if (e) e.preventDefault(); input[prop] = false; btn.classList.remove('is-down'); };
    btn.addEventListener('pointerdown', down);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('pointerleave', up);
  }

  function bindInput() {
    bindHoldButton(UI.gasBtn, 'gas');
    bindHoldButton(UI.brakeBtn, 'brake');

    UI.startBtn.addEventListener('click', () => {
      if (state.raceFinished || state.health <= 0) resetGame();
      UI.noticeText.textContent = `V7.1：橫式實戰 HUD 已壓縮，Safari 工具列出現時也較穩；${state.lapCount} 圈、共 ${state.carTotal} 台車。6 車模式有兩台強敵 AI。`;
      setRunning(!(state.running || state.countingDown));
    });
    UI.resetBtn.addEventListener('click', resetGame);
    UI.soundBtn.addEventListener('click', () => {
      state.sound = !state.sound;
      UI.soundBtn.textContent = `音效：${state.sound ? '開' : '關'}`;
      if (state.sound) { ensureAudio(); chord([440, 660], 0.08, 0.030); }
      else stopEngineLoop();
    });
    UI.cameraBtn.addEventListener('click', () => {
      state.camera = (state.camera + 1) % 2;
      updateCameraButton();
      if (state.sound) beep(360, 0.035, 'triangle', 0.025);
    });
    UI.carChoices.forEach((btn) => {
      btn.addEventListener('click', () => {
        state.selectedCar = Number(btn.dataset.car);
        UI.carChoices.forEach((b) => b.classList.toggle('active', b === btn));
        beep(300 + state.selectedCar * 80, 0.04, 'triangle', 0.035);
      });
    });

    UI.lapChoices.forEach((btn) => {
      const laps = Number(btn.dataset.laps);
      btn.classList.toggle('active', laps === state.lapCount);
      btn.addEventListener('click', () => {
        state.lapCount = laps;
        localStorage.setItem('racing-v7.1-laps', String(laps));
        UI.lapChoices.forEach((b) => b.classList.toggle('active', b === btn));
        resetGame();
        UI.noticeText.textContent = `已設定 ${laps} 圈比賽。現在共 ${state.carTotal} 台車，按「啟動」開始。`;
        beep(430 + laps * 45, 0.045, 'triangle', 0.035);
      });
    });

    UI.raceChoices.forEach((btn) => {
      const cars = Number(btn.dataset.cars);
      btn.classList.toggle('active', cars === state.carTotal);
      btn.addEventListener('click', () => {
        state.carTotal = clamp(cars, 1, 6);
        localStorage.setItem('racing-v7.1-cars', String(state.carTotal));
        UI.raceChoices.forEach((b) => b.classList.toggle('active', b === btn));
        resetGame();
        UI.noticeText.textContent = state.carTotal === 1
          ? `已切換單人練習。沒有電腦車，專心練路線。`
          : `已切換 ${state.carTotal} 台車比賽。6 車模式會有兩台強敵 AI；取消撞牆減速，過彎可以更專心。`;
        beep(380 + state.carTotal * 35, 0.045, 'triangle', 0.035);
      });
    });

    window.addEventListener('keydown', (e) => {
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' ','Space','KeyW','KeyA','KeyS','KeyD'].includes(e.code)) e.preventDefault();
      if (e.code === 'ArrowUp' || e.code === 'KeyW') input.gas = true;
      if (e.code === 'ArrowDown' || e.code === 'KeyS') input.brake = true;
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') input.left = true;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') input.right = true;
      if (e.code === 'Space') { if (state.raceFinished) resetGame(); setRunning(!(state.running || state.countingDown)); }
      if (e.code === 'KeyR') resetGame();
      if (e.code === 'KeyC') UI.cameraBtn.click();
    }, { passive: false });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'ArrowUp' || e.code === 'KeyW') input.gas = false;
      if (e.code === 'ArrowDown' || e.code === 'KeyS') input.brake = false;
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') input.left = false;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') input.right = false;
    });

    canvas.addEventListener('pointerdown', (e) => {
      input.pointerActive = true;
      input.pointerStartX = e.clientX;
      input.pointerLastX = e.clientX;
      canvas.setPointerCapture?.(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!input.pointerActive) return;
      const dx = e.clientX - input.pointerStartX;
      input.pointerLastX = e.clientX;
      input.touchSteer = clamp(dx / Math.max(130, canvas.clientWidth * 0.28), -1, 1);
      input.touchDrift = Math.abs(input.touchSteer) > 0.90;
      if (input.touchDrift) input.touchDriftHold = 0.10;
    });
    const endPointer = () => {
      input.pointerActive = false;
      input.touchSteer = 0;
      input.touchDrift = false;
    };
    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);

    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', () => { updateOrientationClass(); setTimeout(resize, 120); setTimeout(resize, 420); });
    if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) setRunning(false);
    });
  }

  updateOrientationClass();
  bindInput();
  resetGame();
  requestAnimationFrame(frame);
})();
