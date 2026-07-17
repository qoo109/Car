(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const nitroBtn = $('nitroBtn');
  const driftBtn = $('driftBtn');
  const gasBtn = $('gasBtn');
  const brakeBtn = $('brakeBtn');
  const cameraBtn = $('cameraBtn');
  const mapSettingsBtn = $('mapSettingsBtn');
  const speedText = $('speedText');
  const speedFill = $('speedMeterFill');
  const progressText = $('progressText');
  const progressFill = $('progressMeterFill');
  const lapText = $('lapText');
  const miniLapText = $('miniLapText');
  const minimapPath = $('minimapPath');
  const minimapPlayer = $('minimapPlayer');
  const notice = $('notice');

  function dispatchPointer(target, type, sourceEvent) {
    if (!target) return;
    let event;
    try {
      event = new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: sourceEvent?.pointerId || 1,
        pointerType: sourceEvent?.pointerType || 'touch',
        clientX: sourceEvent?.clientX || 0,
        clientY: sourceEvent?.clientY || 0,
        buttons: type === 'pointerdown' ? 1 : 0
      });
    } catch (_) {
      event = new Event(type, { bubbles: true, cancelable: true });
    }
    target.dispatchEvent(event);
  }

  function bridgeHold(source, target) {
    if (!source || !target) return;
    const down = (event) => {
      event.preventDefault();
      source.classList.add('is-down');
      source.setPointerCapture?.(event.pointerId);
      dispatchPointer(target, 'pointerdown', event);
    };
    const up = (event) => {
      event.preventDefault();
      source.classList.remove('is-down');
      dispatchPointer(target, 'pointerup', event);
    };
    source.addEventListener('pointerdown', down, { passive: false });
    source.addEventListener('pointerup', up, { passive: false });
    source.addEventListener('pointercancel', up, { passive: false });
    source.addEventListener('pointerleave', (event) => {
      if (source.classList.contains('is-down')) up(event);
    }, { passive: false });
  }

  // The existing game already consumes boost while accelerating.
  // Nitro becomes a large alternate accelerator; drift forwards to brake.
  bridgeHold(nitroBtn, gasBtn);
  bridgeHold(driftBtn, brakeBtn);

  if (mapSettingsBtn && cameraBtn) {
    mapSettingsBtn.addEventListener('click', () => cameraBtn.click());
  }

  let mapLength = 0;
  if (minimapPath) {
    try { mapLength = minimapPath.getTotalLength(); } catch (_) {}
  }

  function numberFrom(text, fallback = 0) {
    const value = Number(String(text || '').replace(/[^\d.]/g, ''));
    return Number.isFinite(value) ? value : fallback;
  }

  function updateVisuals() {
    const speed = numberFrom(speedText?.textContent, 0);
    if (speedFill) speedFill.style.width = `${Math.max(0, Math.min(100, speed / 3.2))}%`;

    const progress = numberFrom(progressText?.textContent, 0);
    if (progressFill) progressFill.style.width = `${Math.max(0, Math.min(100, progress))}%`;

    if (miniLapText && lapText) {
      miniLapText.textContent = `${String(lapText.textContent || '1/3').replace('/', ' / ')} 圈`;
    }

    if (minimapPlayer && minimapPath && mapLength > 0) {
      const point = minimapPath.getPointAtLength(mapLength * Math.max(0, Math.min(1, progress / 100)));
      minimapPlayer.setAttribute('cx', point.x.toFixed(2));
      minimapPlayer.setAttribute('cy', point.y.toFixed(2));
    }

    document.documentElement.classList.toggle('race-active', !!notice?.classList.contains('hidden'));
    requestAnimationFrame(updateVisuals);
  }

  requestAnimationFrame(updateVisuals);
})();