(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const meter = document.getElementById("meter");
  const meterCtx = meter.getContext("2d");

  const speedEl = document.getElementById("speed");
  const distanceEl = document.getElementById("distance");
  const rankEl = document.getElementById("rank");
  const stateTextEl = document.getElementById("stateText");

  const startOverlay = document.getElementById("start");
  const startBtn = document.getElementById("startBtn");
  const fullscreenBtn = document.getElementById("fullscreenBtn");
  const fullscreenStartBtn = document.getElementById("fullscreenStartBtn");

  const leftBtn = document.getElementById("leftBtn");
  const rightBtn = document.getElementById("rightBtn");
  const gasBtn = document.getElementById("gasBtn");
  const brakeBtn = document.getElementById("brakeBtn");

  let W = 0;
  let H = 0;
  let DPR = 1;
  let running = false;
  let lastTime = 0;
  let shake = 0;
  let frameNo = 0;

  const keys = new Set();
  const touch = { left: false, right: false, gas: false, brake: false };

  const segmentLength = 200;
  const roadWidth = 1800;
  const cameraHeight = 930;
  const drawDistance = 240;
  const fieldOfView = 92;
  const cameraDepth = 1 / Math.tan((fieldOfView / 2) * Math.PI / 180);
  const playerZ = cameraHeight * cameraDepth;
  const maxSpeed = 12600;
  const accel = 2350;
  const braking = -4400;
  const decel = -880;
  const offRoadDecel = -3000;
  const offRoadLimit = 2800;
  const centrifugal = 0.265;

  const segments = [];
  let trackLength = 0;

  const player = {
    x: 0,
    z: 0,
    speed: 0,
    totalDistance: 0,
    roll: 0,
    hitFlash: 0,
  };

  const traffic = [
    { z: 1700, x: -0.34, speed: 7600, color: "#d9eef4", name: "銀車" },
    { z: 3200, x:  0.24, speed: 7200, color: "#ffd23c", name: "黃車" },
    { z: 5200, x:  0.00, speed: 7400, color: "#ff7a3d", name: "橘車" }
  ];

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;

    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    const meterSize = Math.min(170, Math.max(132, Math.round(W * 0.16)));
    meter.width = meterSize * DPR;
    meter.height = meterSize * DPR;
    meter.style.width = meterSize + "px";
    meter.style.height = meterSize + "px";
    meterCtx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const easeIn = (a, b, p) => a + (b - a) * Math.pow(p, 2);
  const easeInOut = (a, b, p) => a + (b - a) * ((-Math.cos(p * Math.PI) / 2) + 0.5);
  const percentRemaining = (n, total) => (n % total) / total;
  const accelerate = (v, a, dt) => v + a * dt;
  const interpolate = (a, b, p) => a + (b - a) * p;

  function increase(start, increment, max) {
    let result = start + increment;
    while (result >= max) result -= max;
    while (result < 0) result += max;
    return result;
  }

  function requestFullscreen() {
    const root = document.documentElement;
    if (root.requestFullscreen) root.requestFullscreen().catch(() => {});
  }

  function pulseVibrate(ms = 18) {
    if (navigator.vibrate) navigator.vibrate(ms);
  }

  function lastY() {
    return segments.length === 0 ? 0 : segments[segments.length - 1].p2.world.y;
  }

  function addSegment(curve, y) {
    const n = segments.length;
    segments.push({
      index: n,
      p1: { world: { x: 0, y: lastY(), z: n * segmentLength }, camera: {}, screen: {} },
      p2: { world: { x: 0, y: y, z: (n + 1) * segmentLength }, camera: {}, screen: {} },
      curve,
    });
  }

  function addRoad(enter, hold, leave, curve, y) {
    const startY = lastY();
    const endY = startY + (y * segmentLength);
    const total = enter + hold + leave;
    for (let n = 0; n < enter; n++) {
      addSegment(easeIn(0, curve, n / enter), easeInOut(startY, endY, n / total));
    }
    for (let n = 0; n < hold; n++) {
      addSegment(curve, easeInOut(startY, endY, (enter + n) / total));
    }
    for (let n = 0; n < leave; n++) {
      addSegment(easeInOut(curve, 0, n / leave), easeInOut(startY, endY, (enter + hold + n) / total));
    }
  }

  function buildTrack() {
    segments.length = 0;
    addRoad(20, 80, 20, 0.0, 0);
    addRoad(20, 70, 20, 0.62, 3);
    addRoad(18, 50, 18, -0.84, -4);
    addRoad(24, 85, 24, 0.12, 0);
    addRoad(25, 85, 25, 1.02, 4);
    addRoad(18, 44, 18, -0.42, -2);
    addRoad(24, 86, 24, -1.0, -5);
    addRoad(18, 42, 18, 0.62, 3);
    addRoad(18, 42, 18, -0.62, -3);
    addRoad(22, 72, 22, 0.25, 2);
    addRoad(22, 80, 22, 0.0, 0);
    trackLength = segments.length * segmentLength;
  }

  function findSegment(z) {
    return segments[Math.floor(z / segmentLength) % segments.length];
  }

  function project(p, cameraX, cameraY, cameraZ) {
    const dz = p.world.z - cameraZ;
    const dx = p.world.x - cameraX;
    const dy = p.world.y - cameraY;
    p.camera.x = dx;
    p.camera.y = dy;
    p.camera.z = dz;
    p.screen.scale = cameraDepth / dz;
    p.screen.x = Math.round((1 + p.screen.scale * dx / roadWidth) * W / 2);
    p.screen.y = Math.round((1 - p.screen.scale * dy) * H / 2);
    p.screen.w = Math.round((p.screen.scale * roadWidth * W) / 2);
  }

  function drawPolygon(x1, y1, x2, y2, x3, y3, x4, y4, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x3, y3);
    ctx.lineTo(x4, y4);
    ctx.closePath();
    ctx.fill();
  }

  function drawQuad(x1, y1, w1, x2, y2, w2, color) {
    drawPolygon(x1 - w1, y1, x1 + w1, y1, x2 + w2, y2, x2 - w2, y2, color);
  }

  function drawSky() {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#07101f");
    sky.addColorStop(0.45, "#121e30");
    sky.addColorStop(1, "#3b2930");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    const bloom = ctx.createRadialGradient(W / 2, H * 0.43, 0, W / 2, H * 0.43, W * 0.42);
    bloom.addColorStop(0, "rgba(255, 240, 186, 0.70)");
    bloom.addColorStop(0.08, "rgba(255, 232, 170, 0.32)");
    bloom.addColorStop(1, "rgba(255, 232, 170, 0)");
    ctx.fillStyle = bloom;
    ctx.fillRect(0, 0, W, H);
  }

  function drawMotionOverlay(speedPct) {
    if (speedPct < 0.2) return;
    ctx.save();
    ctx.globalAlpha = (speedPct - 0.2) * 0.22;
    for (let i = 0; i < 14; i++) {
      const y = ((frameNo * 14 + i * 50) % (H + 120)) - 60;
      const leftX = 0;
      const rightX = W;
      const len = 80 + speedPct * 140;
      const alpha = 0.06 + (i % 3) * 0.02;
      const gradL = ctx.createLinearGradient(leftX, y, leftX + len, y + 18);
      gradL.addColorStop(0, `rgba(255,255,255,${alpha})`);
      gradL.addColorStop(1, `rgba(255,255,255,0)`);
      ctx.fillStyle = gradL;
      ctx.fillRect(leftX, y, len, 2.2);
      const gradR = ctx.createLinearGradient(rightX - len, y + 10, rightX, y - 10);
      gradR.addColorStop(0, `rgba(255,255,255,0)`);
      gradR.addColorStop(1, `rgba(255,255,255,${alpha})`);
      ctx.fillStyle = gradR;
      ctx.fillRect(rightX - len, y, len, 2.2);
    }
    ctx.restore();
  }

  function drawCityBackground(speedPct) {
    const horizon = H * 0.42;
    const parallax = Math.sin(frameNo * 0.01) * 2 + player.x * -20;

    for (let i = 0; i < 18; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const depth = Math.floor(i / 2);
      const w = 130 - depth * 5;
      const h = 170 + (i % 5) * 34;
      const x = side < 0 ? (depth * 96 - 65 + parallax * (0.25 + depth * 0.02)) : (W - depth * 96 - 65 + parallax * (0.25 + depth * 0.02));
      const y = horizon - h * 0.24;
      ctx.save();
      ctx.globalAlpha = 0.9 - depth * 0.025;
      ctx.fillStyle = i % 3 === 0 ? "#283547" : "#1b2431";
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = i % 4 === 0 ? "rgba(255,120,90,0.55)" : "rgba(255,235,150,0.58)";
      for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 3; col++) {
          if ((row + col + i) % 2 === 0) {
            ctx.fillRect(x + 16 + col * 29, y + 18 + row * 24, 16, 11);
          }
        }
      }
      if (i % 5 === 0) {
        ctx.fillStyle = "rgba(255,90,110,0.75)";
        ctx.fillRect(x + w * 0.25, y + h * 0.2, w * 0.4, 8);
      }
      ctx.restore();
    }

    for (let i = 0; i < 7; i++) {
      const x = W * 0.5 + (i - 3) * 112 + player.x * -15;
      const y = horizon + 8 + i * 5;
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = "#d7d7d7";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y + 90);
      ctx.lineTo(x, y);
      ctx.stroke();
      const g = ctx.createRadialGradient(x, y, 0, x, y, 76);
      g.addColorStop(0, "rgba(255,245,190,0.95)");
      g.addColorStop(0.22, "rgba(255,245,190,0.18)");
      g.addColorStop(1, "rgba(255,245,190,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - 80, y - 80, 160, 160);
      ctx.restore();
    }

    if (speedPct > 0.35) {
      ctx.save();
      ctx.globalAlpha = speedPct * 0.14;
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fillRect(0, 0, 28, H);
      ctx.fillRect(W - 28, 0, 28, H);
      ctx.restore();
    }
  }

  function drawRoadSegment(seg, x1, y1, w1, x2, y2, w2) {
    const roadColor = Math.floor(seg.index / 3) % 2 === 0 ? "#33383d" : "#2d3137";
    drawQuad(x1, y1, w1 * 1.38, x2, y2, w2 * 1.38, "#74787f");
    drawQuad(x1, y1, w1 * 1.15, x2, y2, w2 * 1.15, "#565b63");
    drawQuad(x1, y1, w1, x2, y2, w2, roadColor);
    drawQuad(x1, y1, w1 * 0.014, x2, y2, w2 * 0.014, "#f1d35b");
    const laneW1 = w1 * 0.35;
    const laneW2 = w2 * 0.35;
    drawQuad(x1 - laneW1, y1, w1 * 0.008, x2 - laneW2, y2, w2 * 0.008, "rgba(255,255,255,0.65)");
    drawQuad(x1 + laneW1, y1, w1 * 0.008, x2 + laneW2, y2, w2 * 0.008, "rgba(255,255,255,0.65)");

    // reflective road shine
    if (seg.index % 7 === 0) {
      drawQuad(x1, y1, w1 * 0.45, x2, y2, w2 * 0.45, "rgba(255,255,255,0.04)");
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawTrafficCar(x, y, scale, color) {
    const w = 94 * scale;
    const h = 156 * scale;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "rgba(0,0,0,0.24)";
    ctx.beginPath();
    ctx.ellipse(0, h * 0.42, w * 0.48, h * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    roundRect(-w * 0.5, -h * 0.42, w, h * 0.84, 10 * scale);
    ctx.fill();
    ctx.fillStyle = "#141824";
    roundRect(-w * 0.26, -h * 0.30, w * 0.52, h * 0.30, 6 * scale);
    ctx.fill();
    ctx.fillStyle = "#111";
    ctx.fillRect(-w * 0.44, -h * 0.20, w * 0.16, h * 0.09);
    ctx.fillRect(w * 0.28, -h * 0.20, w * 0.16, h * 0.09);
    ctx.fillRect(-w * 0.44, h * 0.14, w * 0.16, h * 0.09);
    ctx.fillRect(w * 0.28, h * 0.14, w * 0.16, h * 0.09);
    ctx.fillStyle = "#ff5148";
    ctx.fillRect(-w * 0.26, h * 0.12, w * 0.18, h * 0.07);
    ctx.fillRect(w * 0.08, h * 0.12, w * 0.18, h * 0.07);
    ctx.restore();
  }

  function drawFlame(x, y, w, h, color1, color2) {
    const grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, color1);
    grad.addColorStop(1, color2);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x - w * 0.5, y + h * 0.35, x - w * 0.12, y + h);
    ctx.quadraticCurveTo(x, y + h * 0.78, x + w * 0.12, y + h);
    ctx.quadraticCurveTo(x + w * 0.5, y + h * 0.35, x, y);
    ctx.fill();
  }

  function drawPlayerCar(speedPct, steerInput) {
    const cx = W / 2 + player.x * W * 0.18;
    const cy = H * 0.79;
    const w = Math.min(W * 0.37, 288);
    const h = w * 0.72;
    const tilt = clamp((-steerInput * 0.12) + Math.sin(frameNo * 0.2) * 0.002, -0.13, 0.13);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(tilt);

    const thruster = touch.gas || keys.has("ArrowUp");
    if (thruster) {
      ctx.save();
      const plume = ctx.createRadialGradient(0, h * 0.38, 0, 0, h * 0.38, w * 0.44);
      plume.addColorStop(0, "rgba(80,170,255,0.9)");
      plume.addColorStop(1, "rgba(80,170,255,0)");
      ctx.fillStyle = plume;
      ctx.fillRect(-w * 0.48, h * 0.08, w * 0.96, h * 0.65);
      drawFlame(-w * 0.23, h * 0.34, w * 0.10, h * 0.31, "#fff7ae", "rgba(76,166,255,0)");
      drawFlame(w * 0.23, h * 0.34, w * 0.10, h * 0.31, "#fff7ae", "rgba(76,166,255,0)");
      ctx.restore();
    }

    ctx.fillStyle = "rgba(0,0,0,0.34)";
    ctx.beginPath();
    ctx.ellipse(0, h * 0.28, w * 0.46, h * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();

    const body = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
    body.addColorStop(0, "#0fa7ff");
    body.addColorStop(0.52, "#3de8ff");
    body.addColorStop(1, "#087cd6");
    ctx.fillStyle = body;
    roundRect(-w * 0.50, -h * 0.20, w, h * 0.50, 24);
    ctx.fill();

    ctx.fillStyle = "#1fc0ff";
    roundRect(-w * 0.33, -h * 0.46, w * 0.66, h * 0.32, 18);
    ctx.fill();

    ctx.fillStyle = "#101421";
    roundRect(-w * 0.24, -h * 0.40, w * 0.48, h * 0.19, 13);
    ctx.fill();

    const tailGlow = ctx.createLinearGradient(-w*0.45, 0, w*0.45, 0);
    tailGlow.addColorStop(0, "#ff3a34");
    tailGlow.addColorStop(0.5, "#ff6156");
    tailGlow.addColorStop(1, "#ff3a34");
    ctx.fillStyle = tailGlow;
    roundRect(-w * 0.42, -h * 0.02, w * 0.22, h * 0.09, 9);
    ctx.fill();
    roundRect(w * 0.20, -h * 0.02, w * 0.22, h * 0.09, 9);
    ctx.fill();

    ctx.fillStyle = "#d9fbff";
    ctx.fillRect(-w * 0.14, h * 0.02, w * 0.28, h * 0.03);
    ctx.fillStyle = "#0a0b0d";
    ctx.fillRect(-w * 0.46, h * 0.22, w * 0.92, h * 0.11);
    ctx.fillStyle = "#eef7ff";
    roundRect(-w * 0.63, -h * 0.19, w * 0.12, h * 0.08, 8);
    ctx.fill();
    roundRect(w * 0.51, -h * 0.19, w * 0.12, h * 0.08, 8);
    ctx.fill();

    // light bloom
    if (speedPct > 0.3) {
      ctx.save();
      ctx.globalAlpha = 0.25 + speedPct * 0.2;
      ctx.fillStyle = "rgba(255,50,60,0.35)";
      ctx.fillRect(-w * 0.48, -h * 0.05, w * 0.28, h * 0.14);
      ctx.fillRect(w * 0.20, -h * 0.05, w * 0.28, h * 0.14);
      ctx.restore();
    }

    ctx.restore();
  }

  function drawLensFlare() {
    const cx = W / 2;
    const cy = H * 0.43;
    ctx.save();
    ctx.globalAlpha = 0.35;
    for (let i = 0; i < 3; i++) {
      const r = 6 + i * 10;
      ctx.strokeStyle = `rgba(255,245,195,${0.4 - i * 0.1})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx - r * 6, cy);
      ctx.lineTo(cx + r * 6, cy);
      ctx.moveTo(cx, cy - r * 2.4);
      ctx.lineTo(cx, cy + r * 2.4);
      ctx.stroke();
    }
    ctx.restore();
  }

  function render(steerInput) {
    frameNo += 1;
    const speedPct = player.speed / maxSpeed;
    const shakeMag = shake * 6 + speedPct * 1.4;
    const shakeX = shakeMag ? (Math.sin(frameNo * 0.85) * shakeMag) : 0;
    const shakeY = shakeMag ? (Math.cos(frameNo * 0.65) * shakeMag * 0.5) : 0;

    ctx.save();
    ctx.translate(shakeX, shakeY);
    drawSky();
    drawCityBackground(speedPct);

    const baseSegment = findSegment(player.z);
    const basePercent = percentRemaining(player.z, segmentLength);
    const playerSegment = findSegment(player.z + playerZ);
    const playerPercent = percentRemaining(player.z + playerZ, segmentLength);
    const playerY = interpolate(playerSegment.p1.world.y, playerSegment.p2.world.y, playerPercent) + cameraHeight;

    let x = 0;
    let dx = -(baseSegment.curve * basePercent);
    let maxy = H;
    const visibleCars = [];

    for (let n = 0; n < drawDistance; n++) {
      const segment = segments[(baseSegment.index + n) % segments.length];
      segment.looped = segment.index < baseSegment.index;
      project(segment.p1, (player.x * roadWidth) - x, playerY, player.z - (segment.looped ? trackLength : 0));
      project(segment.p2, (player.x * roadWidth) - x - dx, playerY, player.z - (segment.looped ? trackLength : 0));
      x += dx;
      dx += segment.curve;
      if (segment.p1.camera.z <= cameraDepth || segment.p2.screen.y >= segment.p1.screen.y || segment.p2.screen.y >= maxy) continue;
      drawRoadSegment(segment, segment.p1.screen.x, segment.p1.screen.y, segment.p1.screen.w, segment.p2.screen.x, segment.p2.screen.y, segment.p2.screen.w);
      maxy = segment.p2.screen.y;

      for (const car of traffic) {
        let carZ = car.z;
        if (segment.looped && carZ < baseSegment.index * segmentLength) carZ += trackLength;
        if (carZ >= segment.p1.world.z && carZ < segment.p2.world.z) {
          const p = percentRemaining(carZ, segmentLength);
          const scale = interpolate(segment.p1.screen.scale, segment.p2.screen.scale, p);
          const screenX = interpolate(segment.p1.screen.x, segment.p2.screen.x, p) + (scale * car.x * roadWidth * W / 2);
          const screenY = interpolate(segment.p1.screen.y, segment.p2.screen.y, p);
          visibleCars.push({ x: screenX, y: screenY, scale: scale * 1.15, color: car.color });
        }
      }
    }

    visibleCars.sort((a, b) => a.scale - b.scale);
    visibleCars.forEach(car => { if (car.scale > 0.02) drawTrafficCar(car.x, car.y, car.scale, car.color); });

    drawLensFlare();
    drawMotionOverlay(speedPct);
    drawPlayerCar(speedPct, steerInput);

    if (player.hitFlash > 0) {
      ctx.save();
      ctx.globalAlpha = player.hitFlash * 0.3;
      ctx.fillStyle = "rgba(255,80,80,0.45)";
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    ctx.restore();
  }

  function update(dt) {
    const accelInput = touch.gas || keys.has("ArrowUp");
    const brakeInput = touch.brake || keys.has("ArrowDown");
    const steerInput = (touch.left || keys.has("ArrowLeft") ? -1 : 0) + (touch.right || keys.has("ArrowRight") ? 1 : 0);

    if (accelInput) {
      player.speed = accelerate(player.speed, accel, dt);
      stateTextEl.textContent = "加速";
    } else if (brakeInput) {
      player.speed = accelerate(player.speed, braking, dt);
      stateTextEl.textContent = "煞車";
    } else {
      player.speed = accelerate(player.speed, decel, dt);
      stateTextEl.textContent = "巡航";
    }

    const playerSegment = findSegment(player.z + playerZ);
    const speedPercent = player.speed / maxSpeed;
    const dx = dt * 2.15 * speedPercent;
    player.x += dx * steerInput;
    player.x -= dx * speedPercent * playerSegment.curve * centrifugal;
    player.x = clamp(player.x, -1.32, 1.32);
    player.roll = interpolate(player.roll, -steerInput * 0.13, dt * 7);

    if ((player.x < -1 || player.x > 1) && player.speed > offRoadLimit) {
      player.speed = accelerate(player.speed, offRoadDecel, dt);
      stateTextEl.textContent = "貼邊";
      shake = Math.max(shake, 0.22);
    }

    player.z = increase(player.z, dt * player.speed, trackLength);
    player.totalDistance += dt * player.speed;

    for (const car of traffic) {
      car.z = increase(car.z, dt * car.speed, trackLength);
      const dz = Math.abs(car.z - player.z);
      const close = Math.min(dz, trackLength - dz);
      if (close < 1700) {
        car.x += (car.x < player.x ? -0.11 : 0.11) * dt;
        car.x = clamp(car.x, -0.85, 0.85);
      } else {
        car.x += Math.sin(frameNo * 0.04 + car.z * 0.001) * 0.002;
        car.x = clamp(car.x, -0.75, 0.75);
      }
      if (close < 155 && Math.abs(car.x - player.x) < 0.22) {
        player.speed *= 0.68;
        stateTextEl.textContent = "碰撞";
        shake = 0.8;
        player.hitFlash = 1;
        pulseVibrate(28);
      }
    }

    player.speed = clamp(player.speed, 0, maxSpeed);
    shake = Math.max(0, shake - dt * 2.2);
    player.hitFlash = Math.max(0, player.hitFlash - dt * 3.0);
    return steerInput;
  }

  function drawMeter() {
    const size = parseInt(meter.style.width || 170, 10);
    const cx = size / 2;
    const cy = size / 2;
    const speed = Math.round((player.speed / maxSpeed) * 330);
    const pct = Math.min(speed / 330, 1);
    const start = Math.PI * 0.72;
    const end = Math.PI * 2.28;
    const angle = start + (end - start) * pct;

    meterCtx.clearRect(0, 0, size, size);
    meterCtx.save();

    meterCtx.fillStyle = "rgba(0,0,0,0.34)";
    meterCtx.beginPath();
    meterCtx.arc(cx, cy, size * 0.42, 0, Math.PI * 2);
    meterCtx.fill();

    meterCtx.lineWidth = 5;
    meterCtx.strokeStyle = "rgba(255,255,255,0.18)";
    meterCtx.beginPath();
    meterCtx.arc(cx, cy, size * 0.37, start, end);
    meterCtx.stroke();

    const arcGrad = meterCtx.createLinearGradient(0, 0, size, size);
    arcGrad.addColorStop(0, "#ffffff");
    arcGrad.addColorStop(0.5, "#ff6aa2");
    arcGrad.addColorStop(1, "#ff275f");
    meterCtx.strokeStyle = arcGrad;
    meterCtx.beginPath();
    meterCtx.arc(cx, cy, size * 0.37, start, angle);
    meterCtx.stroke();

    for (let i = 0; i <= 7; i++) {
      const a = start + (end - start) * (i / 7);
      const x1 = cx + Math.cos(a) * size * 0.29;
      const y1 = cy + Math.sin(a) * size * 0.29;
      const x2 = cx + Math.cos(a) * size * 0.37;
      const y2 = cy + Math.sin(a) * size * 0.37;
      meterCtx.strokeStyle = "rgba(255,255,255,0.72)";
      meterCtx.lineWidth = 2;
      meterCtx.beginPath();
      meterCtx.moveTo(x1, y1);
      meterCtx.lineTo(x2, y2);
      meterCtx.stroke();
    }

    meterCtx.save();
    meterCtx.translate(cx, cy);
    meterCtx.rotate(angle);
    meterCtx.strokeStyle = "#ffffff";
    meterCtx.lineWidth = 4;
    meterCtx.beginPath();
    meterCtx.moveTo(-8, 0);
    meterCtx.lineTo(size * 0.30, 0);
    meterCtx.stroke();
    meterCtx.restore();

    meterCtx.fillStyle = "#ffffff";
    meterCtx.font = `bold ${Math.round(size * 0.21)}px Arial`;
    meterCtx.textAlign = "center";
    meterCtx.fillText(String(speed).padStart(3, "0"), cx, cy + size * 0.18);
    meterCtx.fillStyle = "rgba(255,255,255,0.78)";
    meterCtx.font = `${Math.round(size * 0.08)}px Arial`;
    meterCtx.fillText("KPH", cx + size * 0.22, cy + 2);
    meterCtx.restore();
  }

  function updateHUD() {
    const distances = [
      { label: "你", progress: player.totalDistance },
      ...traffic.map(car => {
        let d = car.z - player.z;
        if (d < -trackLength / 2) d += trackLength;
        if (d > trackLength / 2) d -= trackLength;
        return { label: car.name, progress: player.totalDistance + d };
      })
    ];
    const sorted = distances.slice().sort((a, b) => b.progress - a.progress);
    const rank = sorted.findIndex(item => item.label === "你") + 1;
    speedEl.textContent = Math.round((player.speed / maxSpeed) * 330);
    distanceEl.textContent = Math.round(player.totalDistance / 4);
    rankEl.textContent = rank;
  }

  function bindButton(btn, key) {
    const set = v => {
      touch[key] = v;
      btn.classList.toggle("active", v);
      if (v) pulseVibrate(10);
    };
    ["pointerdown", "touchstart"].forEach(type => {
      btn.addEventListener(type, e => { e.preventDefault(); set(true); }, { passive: false });
    });
    ["pointerup", "pointerleave", "pointercancel", "touchend", "touchcancel"].forEach(type => {
      btn.addEventListener(type, e => { e.preventDefault(); set(false); }, { passive: false });
    });
  }

  function startGame() {
    running = true;
    player.x = 0; player.z = 0; player.speed = 0; player.totalDistance = 0; player.hitFlash = 0; shake = 0;
    traffic[0].z = 1700; traffic[0].x = -0.34;
    traffic[1].z = 3200; traffic[1].x = 0.24;
    traffic[2].z = 5200; traffic[2].x = 0.00;
    startOverlay.style.display = "none";
  }

  function frame(t) {
    if (!lastTime) lastTime = t;
    let dt = Math.min((t - lastTime) / 1000, 0.05);
    let steerInput = 0;
    while (dt > 1 / 60) {
      if (running) steerInput = update(1 / 60);
      dt -= 1 / 60;
    }
    lastTime = t;
    render(steerInput);
    drawMeter();
    updateHUD();
    requestAnimationFrame(frame);
  }

  window.addEventListener("keydown", e => {
    keys.add(e.code);
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(e.code)) e.preventDefault();
  });
  window.addEventListener("keyup", e => keys.delete(e.code));
  window.addEventListener("resize", resize);

  startBtn.addEventListener("click", startGame);
  fullscreenBtn.addEventListener("click", requestFullscreen);
  fullscreenStartBtn.addEventListener("click", requestFullscreen);

  bindButton(leftBtn, "left");
  bindButton(rightBtn, "right");
  bindButton(gasBtn, "gas");
  bindButton(brakeBtn, "brake");

  resize();
  buildTrack();
  render(0);
  drawMeter();
  updateHUD();
  requestAnimationFrame(frame);
})();
