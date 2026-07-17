(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;
  const shell = document.querySelector('.game-shell');
  const gameCanvas = $('gameCanvas');
  const steering = $('steeringWheel');
  const steeringKnob = $('steeringKnob');
  const speedText = $('speedText');
  const rankText = $('rankText');
  const lapText = $('lapText');
  const gasBtn = $('gasBtn');
  const brakeBtn = $('brakeBtn');
  const nitroBtn = $('nitroBtn');
  const driftBtn = $('driftBtn');
  const eventFeed = $('raceEventFeed');
  const sectorPanel = $('sectorPanel');
  const sectorName = $('sectorName');
  const sectorTime = $('sectorTime');
  const boostPadFlash = $('boostPadFlash');
  const impactFlash = $('impactFlash');
  const lightingToggle = $('lightingToggle');

  if (!shell || !gameCanvas) return;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const numberFrom = (text, fallback = 0) => {
    const value = Number(String(text || '').replace(/[^\d.]/g, ''));
    return Number.isFinite(value) ? value : fallback;
  };
  const pointerEvent = (type, init = {}) => {
    try {
      return new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: init.pointerId || 77, buttons: type === 'pointerdown' || type === 'pointermove' ? 1 : 0, clientX: init.clientX || 0, clientY: init.clientY || 0 });
    } catch (_) {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.assign(event, init);
      return event;
    }
  };

  let steerPointer = null;
  let steerValue = 0;
  let lastTime = performance.now();
  let lastSpeed = 0;
  let lastRank = numberFrom(rankText?.textContent?.split('/')[0], 1);
  let lastLap = numberFrom(lapText?.textContent?.split('/')[0], 1);
  let sectorIndex = 0;
  let sectorStartedAt = performance.now();
  let lastProgress = 0;
  let boostPadLock = false;
  let boostPadTimer = 0;
  let lightingEnabled = localStorage.getItem('neon-toy-v84-lighting') !== 'off';
  let toastTimer = 0;

  const BOOST_PADS = [0.105, 0.362, 0.615, 0.845];
  const SECTORS = [0.3333, 0.6666, 0.9995];

  function gameData() {
    try { return window.NeonToyGame?.getMinimapData?.() || null; }
    catch (_) { return null; }
  }

  function emitFeed(text, tone = 'purple') {
    if (!eventFeed) return;
    eventFeed.textContent = text;
    eventFeed.dataset.tone = tone;
    eventFeed.classList.remove('show');
    void eventFeed.offsetWidth;
    eventFeed.classList.add('show');
    toastTimer = 2.1;
  }

  function vibrate(pattern) {
    try { navigator.vibrate?.(pattern); } catch (_) {}
  }

  function sendSteer(value, sourceEvent) {
    const rect = gameCanvas.getBoundingClientRect();
    const startX = rect.left + rect.width * 0.5;
    const x = startX + clamp(value, -1, 1) * Math.max(125, rect.width * 0.25);
    gameCanvas.dispatchEvent(pointerEvent('pointermove', {
      pointerId: sourceEvent?.pointerId || 77,
      clientX: x,
      clientY: rect.top + rect.height * 0.72
    }));
  }

  function updateSteeringVisual(value) {
    steerValue = clamp(value, -1, 1);
    const degrees = steerValue * 112;
    steering?.style.setProperty('--steer', `${degrees}deg`);
    steeringKnob?.style.setProperty('--steer-x', `${steerValue * 16}px`);
    root.style.setProperty('--steer-amount', String(Math.abs(steerValue)));
  }

  function beginSteering(event) {
    if (!steering) return;
    event.preventDefault();
    steerPointer = event.pointerId;
    steering.setPointerCapture?.(event.pointerId);
    const rect = gameCanvas.getBoundingClientRect();
    gameCanvas.dispatchEvent(pointerEvent('pointerdown', {
      pointerId: event.pointerId,
      clientX: rect.left + rect.width * 0.5,
      clientY: rect.top + rect.height * 0.72
    }));
    moveSteering(event);
    steering.classList.add('active');
    vibrate(5);
  }

  function moveSteering(event) {
    if (steerPointer !== event.pointerId || !steering) return;
    event.preventDefault();
    const rect = steering.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = event.clientX - centerX;
    const dy = event.clientY - centerY;
    let angle = Math.atan2(dy, dx) + Math.PI / 2;
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    const value = clamp(angle / 1.12, -1, 1);
    updateSteeringVisual(value);
    sendSteer(value, event);
  }

  function endSteering(event) {
    if (steerPointer !== event.pointerId) return;
    event.preventDefault();
    gameCanvas.dispatchEvent(pointerEvent('pointerup', { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY }));
    steerPointer = null;
    updateSteeringVisual(0);
    steering?.classList.remove('active');
  }

  function pressButton(button, duration = 650) {
    if (!button || button.classList.contains('is-down')) return;
    const rect = button.getBoundingClientRect();
    const id = 84;
    button.dispatchEvent(pointerEvent('pointerdown', { pointerId: id, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }));
    window.setTimeout(() => {
      button.dispatchEvent(pointerEvent('pointerup', { pointerId: id, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }));
    }, duration);
  }

  function crossedProgress(previous, current, target) {
    if (current >= previous) return previous < target && current >= target;
    return previous < target || current >= target;
  }

  function triggerBoostPad() {
    if (boostPadLock) return;
    boostPadLock = true;
    boostPadTimer = 1.0;
    boostPadFlash?.classList.remove('show');
    void boostPadFlash?.offsetWidth;
    boostPadFlash?.classList.add('show');
    emitFeed('加速帶！AUTO BOOST', 'cyan');
    root.classList.add('boost-pad-active');
    if (gasBtn?.classList.contains('is-down')) pressButton(nitroBtn, 720);
    vibrate([12, 18, 12]);
  }

  function updateSector(progress, lap) {
    const target = SECTORS[sectorIndex];
    if (crossedProgress(lastProgress, progress, target)) {
      const now = performance.now();
      const elapsed = Math.max(0, (now - sectorStartedAt) / 1000);
      const key = `neon-toy-v84-sector-${lap}-${sectorIndex}`;
      const best = Number(localStorage.getItem(key) || 0);
      const improved = !best || elapsed < best;
      if (improved) localStorage.setItem(key, String(elapsed));
      if (sectorName) sectorName.textContent = sectorIndex === 2 ? '本圈完成' : `區段 ${sectorIndex + 1}`;
      if (sectorTime) sectorTime.textContent = `${elapsed.toFixed(2)}s${improved ? '  BEST' : ''}`;
      sectorPanel?.classList.add('visible');
      window.setTimeout(() => sectorPanel?.classList.remove('visible'), 2100);
      emitFeed(improved ? '最佳區段時間！' : `區段 ${sectorIndex + 1} 完成`, improved ? 'gold' : 'purple');
      sectorStartedAt = now;
      sectorIndex = (sectorIndex + 1) % 3;
    }
  }

  function updateRaceEvents(data, speed, dt) {
    const progress = clamp(data?.progress || 0, 0, 1);
    const rank = numberFrom(rankText?.textContent?.split('/')[0], 1);
    const lap = numberFrom(data?.lap || lapText?.textContent?.split('/')[0], 1);

    if (rank !== lastRank) {
      emitFeed(rank < lastRank ? `完成超車！目前第 ${rank} 名` : `被超越！降至第 ${rank} 名`, rank < lastRank ? 'green' : 'red');
      vibrate(rank < lastRank ? [12, 18, 12] : 18);
      lastRank = rank;
    }

    if (lap !== lastLap) {
      lastLap = lap;
      sectorIndex = 0;
      sectorStartedAt = performance.now();
    }

    for (const pad of BOOST_PADS) {
      if (crossedProgress(lastProgress, progress, pad)) {
        triggerBoostPad();
        break;
      }
    }

    if (boostPadLock) {
      boostPadTimer -= dt;
      if (boostPadTimer <= 0) {
        boostPadLock = false;
        root.classList.remove('boost-pad-active');
      }
    }

    updateSector(progress, lap);
    lastProgress = progress;

    const speedDrop = lastSpeed - speed;
    const braking = brakeBtn?.classList.contains('is-down');
    if (speed > 30 && speedDrop > 46 && !braking) {
      impactFlash?.classList.remove('show');
      void impactFlash?.offsetWidth;
      impactFlash?.classList.add('show');
      shell.classList.remove('impact-shake');
      void shell.offsetWidth;
      shell.classList.add('impact-shake');
      window.setTimeout(() => shell.classList.remove('impact-shake'), 300);
      emitFeed('碰撞警告', 'red');
      vibrate([22, 22, 28]);
    }
    lastSpeed = speed;

    const gas = gasBtn?.classList.contains('is-down');
    const brake = brakeBtn?.classList.contains('is-down');
    const drift = driftBtn?.classList.contains('is-down');
    root.classList.toggle('v84-gas', !!gas);
    root.classList.toggle('v84-brake', !!brake);
    root.classList.toggle('v84-drift', !!drift);
    root.classList.toggle('v84-lights-off', !lightingEnabled);
  }

  function updateLightingToggle() {
    if (!lightingToggle) return;
    lightingToggle.textContent = lightingEnabled ? '燈光：開' : '燈光：關';
    lightingToggle.setAttribute('aria-pressed', String(lightingEnabled));
  }

  function frame(now) {
    const dt = clamp((now - lastTime) / 1000, 0, 0.05);
    lastTime = now;
    const data = gameData();
    const speed = numberFrom(speedText?.textContent, 0);
    updateRaceEvents(data, speed, dt);
    if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0) eventFeed?.classList.remove('show');
    }
    requestAnimationFrame(frame);
  }

  steering?.addEventListener('pointerdown', beginSteering, { passive: false });
  steering?.addEventListener('pointermove', moveSteering, { passive: false });
  steering?.addEventListener('pointerup', endSteering, { passive: false });
  steering?.addEventListener('pointercancel', endSteering, { passive: false });

  lightingToggle?.addEventListener('click', () => {
    lightingEnabled = !lightingEnabled;
    localStorage.setItem('neon-toy-v84-lighting', lightingEnabled ? 'on' : 'off');
    updateLightingToggle();
    emitFeed(lightingEnabled ? '賽車燈光已開啟' : '賽車燈光已關閉', lightingEnabled ? 'cyan' : 'purple');
  });

  updateLightingToggle();
  requestAnimationFrame(frame);
})();
