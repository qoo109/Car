(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;
  const shell = document.querySelector('.game-shell');
  const gameCanvas = $('gameCanvas');
  const speedText = $('speedText');
  const progressText = $('progressText');
  const timeText = $('timeText');
  const bestText = $('bestText');
  const fpsText = $('fpsText');
  const countdown = $('countdown');
  const driftBtn = $('driftBtn');
  const nitroBtn = $('nitroBtn');

  if (!shell || !gameCanvas) return;

  const weatherCanvas = document.createElement('canvas');
  weatherCanvas.id = 'v85WeatherCanvas';
  weatherCanvas.setAttribute('aria-hidden', 'true');
  shell.appendChild(weatherCanvas);

  const weatherTint = document.createElement('div');
  weatherTint.className = 'v85-weather-tint';
  weatherTint.setAttribute('aria-hidden', 'true');
  shell.appendChild(weatherTint);

  const startLights = document.createElement('div');
  startLights.className = 'v85-start-lights';
  startLights.setAttribute('aria-hidden', 'true');
  startLights.innerHTML = '<i></i><i></i><i></i><i></i><i></i>';
  shell.appendChild(startLights);

  const panel = document.createElement('section');
  panel.className = 'v85-pro-panel';
  panel.setAttribute('aria-label', '專業賽車數據');
  panel.innerHTML = `
    <header><span>PRO TELEMETRY</span><b>V8.5</b></header>
    <div class="v85-pro-grid">
      <div class="v85-pro-stat"><span>配速差</span><strong id="v85Pace">--</strong></div>
      <div class="v85-pro-stat"><span>漂移分數</span><strong id="v85DriftScore">0</strong></div>
      <div class="v85-pro-stat"><span>連擊</span><strong id="v85Combo">x1.0</strong></div>
      <div class="v85-pro-stat"><span>最高漂移</span><strong id="v85BestDrift">0</strong></div>
    </div>
    <div class="v85-drift-bar"><i id="v85DriftFill"></i></div>`;
  shell.appendChild(panel);

  const weatherButton = document.createElement('button');
  weatherButton.id = 'v85WeatherButton';
  weatherButton.className = 'v85-weather-button';
  weatherButton.type = 'button';
  weatherButton.setAttribute('aria-label', '切換天候');
  shell.appendChild(weatherButton);

  const performanceBadge = document.createElement('div');
  performanceBadge.className = 'v85-performance-badge';
  performanceBadge.textContent = 'AUTO PERFORMANCE';
  shell.appendChild(performanceBadge);

  const paceEl = $('v85Pace');
  const driftScoreEl = $('v85DriftScore');
  const comboEl = $('v85Combo');
  const bestDriftEl = $('v85BestDrift');
  const driftFill = $('v85DriftFill');
  const ctx = weatherCanvas.getContext('2d');

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const weatherNames = { clear: '天候：晴朗', rain: '天候：雨夜', night: '天候：夜景' };
  const weatherOrder = ['clear', 'rain', 'night'];
  let weather = localStorage.getItem('neon-toy-v85-weather') || 'clear';
  if (!weatherOrder.includes(weather)) weather = 'clear';

  let dpr = 1;
  let width = 1;
  let height = 1;
  let drops = [];
  let last = performance.now();
  let driftScore = 0;
  let driftBank = 0;
  let driftCombo = 1;
  let driftHold = 0;
  let driftRelease = 0;
  let bestDrift = Number(localStorage.getItem('neon-toy-v85-best-drift') || 0);
  let lowFpsTime = 0;
  let goodFpsTime = 0;
  let performanceMode = false;

  function numberFrom(text, fallback = 0) {
    const n = Number(String(text || '').replace(/[^\d.]/g, ''));
    return Number.isFinite(n) ? n : fallback;
  }

  function parseClock(text) {
    const value = String(text || '').trim();
    if (!value || value === '--') return 0;
    const parts = value.split(':');
    if (parts.length === 2) {
      const minutes = Number(parts[0]);
      const seconds = Number(parts[1]);
      return Number.isFinite(minutes) && Number.isFinite(seconds) ? minutes * 60 + seconds : 0;
    }
    const seconds = Number(value);
    return Number.isFinite(seconds) ? seconds : 0;
  }

  function currentGameData() {
    try { return window.NeonToyGame?.getMinimapData?.() || null; }
    catch (_) { return null; }
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 1.65);
    width = Math.max(1, shell.clientWidth);
    height = Math.max(1, shell.clientHeight);
    weatherCanvas.width = Math.floor(width * dpr);
    weatherCanvas.height = Math.floor(height * dpr);
    weatherCanvas.style.width = `${width}px`;
    weatherCanvas.style.height = `${height}px`;
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    drops = Array.from({ length: performanceMode ? 42 : 82 }, () => makeDrop(true));
  }

  function makeDrop(randomY = false) {
    return {
      x: Math.random() * width,
      y: randomY ? Math.random() * height : -20 - Math.random() * 120,
      speed: 420 + Math.random() * 520,
      length: 12 + Math.random() * 25,
      drift: 55 + Math.random() * 75,
      alpha: 0.14 + Math.random() * 0.36
    };
  }

  function applyWeather() {
    root.classList.toggle('v85-weather-rain', weather === 'rain');
    root.classList.toggle('v85-weather-night', weather === 'night');
    weatherButton.textContent = weatherNames[weather];
    weatherButton.setAttribute('aria-pressed', String(weather !== 'clear'));
    localStorage.setItem('neon-toy-v85-weather', weather);
  }

  function cycleWeather() {
    weather = weatherOrder[(weatherOrder.indexOf(weather) + 1) % weatherOrder.length];
    applyWeather();
    try { navigator.vibrate?.(7); } catch (_) {}
  }

  function updateStartLights() {
    const visible = countdown && !countdown.hidden;
    startLights.classList.toggle('visible', !!visible);
    const value = String(countdown?.textContent || '').trim().toUpperCase();
    const lamps = [...startLights.children];
    lamps.forEach((lamp) => lamp.className = '');
    if (!visible) return;
    if (value === 'GO!') {
      lamps.forEach((lamp) => lamp.classList.add('green'));
      return;
    }
    const stage = clamp(4 - Number(value || 3), 1, 3);
    for (let i = 0; i < stage; i++) lamps[i].classList.add('red');
  }

  function updatePace(data) {
    const current = parseClock(timeText?.textContent);
    const best = parseClock(bestText?.textContent);
    const lap = Number(data?.lap || 1);
    const laps = Number(data?.laps || 1);
    const progress = clamp(Number(data?.progress || 0), 0, 1);
    const totalProgress = clamp(((lap - 1) + progress) / Math.max(1, laps), 0, 1);

    if (!best || totalProgress < 0.025) {
      paceEl.textContent = '--';
      paceEl.className = '';
      return;
    }

    const delta = current - best * totalProgress;
    paceEl.textContent = `${delta >= 0 ? '+' : '−'}${Math.abs(delta).toFixed(1)}s`;
    paceEl.className = delta <= 0 ? 'good' : 'bad';
  }

  function updateDrift(dt, speed) {
    const active = !!driftBtn?.classList.contains('is-down') && speed > 65;
    root.classList.toggle('v85-drift-active', active);

    if (active) {
      driftHold += dt;
      driftRelease = 0;
      driftCombo = clamp(1 + Math.floor(driftHold / 1.25) * 0.5, 1, 5);
      driftScore += dt * speed * 0.54 * driftCombo;
      driftBank = driftScore;
    } else if (driftScore > 0) {
      driftRelease += dt;
      if (driftRelease > 0.7) {
        if (driftBank > bestDrift) {
          bestDrift = Math.round(driftBank);
          localStorage.setItem('neon-toy-v85-best-drift', String(bestDrift));
        }
        driftScore = 0;
        driftHold = 0;
        driftCombo = 1;
        driftRelease = 0;
      }
    }

    driftScoreEl.textContent = String(Math.round(driftScore));
    driftScoreEl.className = active ? 'cyan' : '';
    comboEl.textContent = `x${driftCombo.toFixed(1)}`;
    comboEl.className = driftCombo >= 2.5 ? 'gold' : '';
    bestDriftEl.textContent = String(Math.round(bestDrift));
    driftFill.style.width = `${clamp((driftHold / 5.5) * 100, 0, 100)}%`;
  }

  function updatePerformance(dt) {
    const fps = numberFrom(fpsText?.textContent, 60);
    if (fps < 38) {
      lowFpsTime += dt;
      goodFpsTime = 0;
    } else if (fps > 50) {
      goodFpsTime += dt;
      lowFpsTime = 0;
    } else {
      lowFpsTime = Math.max(0, lowFpsTime - dt * 0.4);
      goodFpsTime = Math.max(0, goodFpsTime - dt * 0.4);
    }

    if (!performanceMode && lowFpsTime > 2.8) {
      performanceMode = true;
      root.classList.add('v85-performance');
      resize();
    } else if (performanceMode && goodFpsTime > 5.5) {
      performanceMode = false;
      root.classList.remove('v85-performance');
      resize();
    }
  }

  function updateCameraPunch(speed) {
    const nitro = !!nitroBtn?.classList.contains('is-down');
    const zoom = 1 + clamp((speed - 180) / 420, 0, 0.018) + (nitro ? 0.010 : 0);
    root.style.setProperty('--v85-zoom', zoom.toFixed(4));
    root.classList.toggle('v85-camera-punch', speed > 175 || nitro);
  }

  function drawWeather(dt, speed) {
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    if (weather !== 'rain') return;

    const speedBoost = clamp(speed / 320, 0, 1);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.lineCap = 'round';
    for (let i = 0; i < drops.length; i++) {
      const p = drops[i];
      p.y += (p.speed + speedBoost * 260) * dt;
      p.x += (p.drift + speedBoost * 48) * dt;
      if (p.y > height + 50 || p.x > width + 80) drops[i] = makeDrop(false);
      ctx.strokeStyle = `rgba(185,218,255,${p.alpha})`;
      ctx.lineWidth = performanceMode ? 0.7 : 1;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - 5 - speedBoost * 7, p.y - p.length);
      ctx.stroke();
    }
    ctx.restore();
  }

  function frame(now) {
    const dt = clamp((now - last) / 1000, 0, 0.05);
    last = now;
    const speed = numberFrom(speedText?.textContent, 0);
    const data = currentGameData();

    updateStartLights();
    updatePace(data);
    updateDrift(dt, speed);
    updatePerformance(dt);
    updateCameraPunch(speed);
    drawWeather(dt, speed);

    requestAnimationFrame(frame);
  }

  weatherButton.addEventListener('click', cycleWeather);
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 140));
  window.visualViewport?.addEventListener('resize', resize);

  if (window.NeonToyGame) window.NeonToyGame.version = '8.5';
  window.NeonToyV85 = {
    get weather() { return weather; },
    setWeather(value) {
      if (weatherOrder.includes(value)) {
        weather = value;
        applyWeather();
      }
    },
    get bestDrift() { return bestDrift; }
  };

  bestDriftEl.textContent = String(Math.round(bestDrift));
  applyWeather();
  resize();
  requestAnimationFrame(frame);
})();
