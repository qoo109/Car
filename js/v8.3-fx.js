(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;
  const gameShell = document.querySelector('.game-shell');
  const speedText = $('speedText');
  const lapText = $('lapText');
  const nitroBtn = $('nitroBtn');
  const driftBtn = $('driftBtn');
  const brakeBtn = $('brakeBtn');
  const zoneBadge = $('trackZoneBadge');
  const curveWarning = $('curveWarning');
  const proximityBadge = $('proximityBadge');
  const raceToast = $('raceToast');
  const startGateFx = $('startGateFx');
  const canvas = $('speedFxCanvas');
  const ctx = canvas?.getContext('2d');

  if (!gameShell || !canvas || !ctx) return;

  let width = 1;
  let height = 1;
  let dpr = 1;
  let lastTime = performance.now();
  let lastLap = 1;
  let toastTimer = 0;
  let shake = 0;
  let lastNear = false;
  const streaks = [];

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const circularDelta = (a, b) => {
    let d = b - a;
    if (d > 0.5) d -= 1;
    if (d < -0.5) d += 1;
    return d;
  };

  function numberFrom(text, fallback = 0) {
    const n = Number(String(text || '').replace(/[^\d.]/g, ''));
    return Number.isFinite(n) ? n : fallback;
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    width = Math.max(1, gameShell.clientWidth);
    height = Math.max(1, gameShell.clientHeight);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function currentGameData() {
    try {
      return window.NeonToyGame?.getMinimapData?.() || null;
    } catch (_) {
      return null;
    }
  }

  function zoneFor(progress) {
    if (progress < 0.143 || progress > 0.933) return ['維修直線', 'PIT STRAIGHT'];
    if (progress < 0.327) return ['霓虹城市', 'NEON CITY'];
    if (progress < 0.503) return ['高空森林', 'SKY FOREST'];
    if (progress < 0.703) return ['雲端高架', 'CLOUD BRIDGE'];
    if (progress < 0.853) return ['工業港區', 'INDUSTRIAL PORT'];
    return ['終點霓虹區', 'FINAL NEON'];
  }

  function curveData(data) {
    if (!data?.points?.length) return { side: 0, strength: 0 };
    const points = data.points;
    const n = points.length - 1;
    const index = Math.floor(clamp(data.progress || 0, 0, 0.9999) * n);
    const a = points[index % n];
    const b = points[(index + 3) % n];
    const c = points[(index + 9) % n];
    const h1 = Math.atan2(b.y - a.y, b.x - a.x);
    const h2 = Math.atan2(c.y - b.y, c.x - b.x);
    let turn = h2 - h1;
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    return { side: Math.sign(turn), strength: clamp(Math.abs(turn) / 0.95, 0, 1) };
  }

  function showToast(text, accent = 'purple') {
    if (!raceToast) return;
    raceToast.textContent = text;
    raceToast.dataset.accent = accent;
    raceToast.classList.remove('show');
    void raceToast.offsetWidth;
    raceToast.classList.add('show');
    toastTimer = 2.2;
  }

  function updateHud(data, speed) {
    const progress = clamp(data?.progress ?? 0, 0, 1);
    const [zoneZh, zoneEn] = zoneFor(progress);
    if (zoneBadge) zoneBadge.innerHTML = `<b>${zoneZh}</b><small>${zoneEn}</small>`;

    const curve = curveData(data);
    if (curveWarning) {
      const visible = curve.strength > 0.24 && speed > 95;
      curveWarning.classList.toggle('visible', visible);
      curveWarning.classList.toggle('left', curve.side < 0);
      curveWarning.classList.toggle('right', curve.side > 0);
      curveWarning.style.setProperty('--curve-strength', curve.strength.toFixed(3));
      const direction = curve.side < 0 ? '左彎' : '右彎';
      curveWarning.querySelector('b').textContent = direction;
      curveWarning.querySelector('small').textContent = curve.strength > 0.67 ? '急彎 · 建議煞車' : '彎道接近';
    }

    let nearestAhead = 1;
    let nearestBehind = 1;
    for (const aiProgress of data?.ai || []) {
      const delta = circularDelta(progress, aiProgress);
      if (delta >= 0) nearestAhead = Math.min(nearestAhead, delta);
      else nearestBehind = Math.min(nearestBehind, Math.abs(delta));
    }
    const closeAhead = nearestAhead < 0.035;
    const closeBehind = nearestBehind < 0.022;
    if (proximityBadge) {
      proximityBadge.classList.toggle('visible', closeAhead || closeBehind);
      proximityBadge.classList.toggle('behind', closeBehind && !closeAhead);
      if (closeAhead) proximityBadge.innerHTML = `<i></i><span>前方車輛 <b>${Math.max(3, Math.round(nearestAhead * 3000))}m</b></span>`;
      else if (closeBehind) proximityBadge.innerHTML = `<i></i><span>後方逼近 <b>${Math.max(3, Math.round(nearestBehind * 3000))}m</b></span>`;
    }
    const isNear = closeAhead || closeBehind;
    if (isNear && !lastNear && navigator.vibrate) navigator.vibrate(8);
    lastNear = isNear;

    const lap = Number(data?.lap || String(lapText?.textContent || '1/3').split('/')[0]) || 1;
    if (lap !== lastLap) {
      lastLap = lap;
      showToast(`第 ${lap} 圈`, 'gold');
      if (navigator.vibrate) navigator.vibrate([18, 45, 18]);
    }

    const gateVisible = progress < 0.035 || progress > 0.965;
    startGateFx?.classList.toggle('visible', gateVisible);
    root.classList.toggle('is-high-speed', speed > 220);
    root.classList.toggle('is-max-speed', speed > 285);
    root.classList.toggle('is-nitro-active', !!nitroBtn?.classList.contains('is-down'));
    root.classList.toggle('is-drifting', !!driftBtn?.classList.contains('is-down'));
  }

  function spawnStreak(speed, nitro) {
    const intensity = clamp((speed - 145) / 180, 0, 1) + (nitro ? 0.55 : 0);
    if (intensity <= 0 || Math.random() > intensity * 0.55) return;
    const side = Math.random() < 0.5 ? -1 : 1;
    streaks.push({
      x: width * 0.5 + side * (width * (0.18 + Math.random() * 0.34)),
      y: height * (0.42 + Math.random() * 0.54),
      vx: side * (40 + Math.random() * 120),
      vy: 70 + Math.random() * 165,
      life: 0.25 + Math.random() * 0.35,
      maxLife: 0.6,
      length: 22 + intensity * 48 + Math.random() * 30,
      nitro
    });
  }

  function drawFx(dt, speed) {
    ctx.clearRect(0, 0, width, height);
    const nitro = !!nitroBtn?.classList.contains('is-down');
    const drifting = !!driftBtn?.classList.contains('is-down');
    const braking = !!brakeBtn?.classList.contains('is-down');

    spawnStreak(speed, nitro);
    if (nitro) spawnStreak(speed + 120, true);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = streaks.length - 1; i >= 0; i--) {
      const p = streaks[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.life <= 0 || p.y > height + 80) {
        streaks.splice(i, 1);
        continue;
      }
      const alpha = clamp(p.life / p.maxLife, 0, 1) * (p.nitro ? 0.72 : 0.38);
      const gradient = ctx.createLinearGradient(p.x, p.y - p.length, p.x, p.y);
      gradient.addColorStop(0, 'rgba(255,255,255,0)');
      gradient.addColorStop(0.58, p.nitro ? `rgba(130,96,255,${alpha})` : `rgba(218,212,255,${alpha * 0.65})`);
      gradient.addColorStop(1, p.nitro ? `rgba(74,226,255,${alpha})` : `rgba(255,255,255,${alpha})`);
      ctx.strokeStyle = gradient;
      ctx.lineWidth = p.nitro ? 2.2 : 1.2;
      ctx.beginPath();
      ctx.moveTo(p.x - p.vx * 0.05, p.y - p.length);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    ctx.restore();

    const speedGlow = clamp((speed - 110) / 220, 0, 1);
    if (speedGlow > 0) {
      const vignette = ctx.createRadialGradient(width * 0.5, height * 0.62, height * 0.08, width * 0.5, height * 0.62, Math.max(width, height) * 0.64);
      vignette.addColorStop(0, 'rgba(120,84,255,0)');
      vignette.addColorStop(0.72, `rgba(98,62,210,${speedGlow * 0.045})`);
      vignette.addColorStop(1, `rgba(15,8,38,${speedGlow * 0.22})`);
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, width, height);
    }

    if (nitro) {
      const pulse = 0.10 + Math.sin(performance.now() * 0.018) * 0.025;
      const glow = ctx.createRadialGradient(width * 0.5, height * 0.78, 20, width * 0.5, height * 0.78, width * 0.56);
      glow.addColorStop(0, `rgba(96,225,255,${pulse})`);
      glow.addColorStop(0.5, `rgba(132,83,255,${pulse * 0.72})`);
      glow.addColorStop(1, 'rgba(70,40,180,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);
    }

    if (braking || drifting) {
      const red = ctx.createLinearGradient(0, height, 0, height * 0.55);
      red.addColorStop(0, `rgba(255,44,68,${drifting ? 0.12 : 0.075})`);
      red.addColorStop(1, 'rgba(255,44,68,0)');
      ctx.fillStyle = red;
      ctx.fillRect(0, height * 0.48, width, height * 0.52);
    }
  }

  function hapticPress(button, pattern) {
    button?.addEventListener('pointerdown', () => {
      shake = 1;
      if (navigator.vibrate) navigator.vibrate(pattern);
    }, { passive: true });
  }

  hapticPress(nitroBtn, 12);
  hapticPress(driftBtn, 9);
  hapticPress(brakeBtn, 6);

  function frame(now) {
    const dt = clamp((now - lastTime) / 1000, 0, 0.05);
    lastTime = now;
    const speed = numberFrom(speedText?.textContent, 0);
    const data = currentGameData();
    updateHud(data, speed);
    drawFx(dt, speed);
    if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0) raceToast?.classList.remove('show');
    }
    shake *= Math.pow(0.01, dt);
    gameShell.style.setProperty('--fx-shake', `${shake * 1.8}px`);
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('orientationchange', () => setTimeout(resize, 120), { passive: true });
  resize();
  window.NeonToyGame = { ...(window.NeonToyGame || {}), version: '8.3' };
  showToast('V8.3 賽道系統啟動', 'purple');
  requestAnimationFrame(frame);
})();
