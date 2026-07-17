(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const speedText = $('speedText');
  const speedFill = $('speedMeterFill');
  const progressText = $('progressText');
  const progressFill = $('progressMeterFill');
  const lapText = $('lapText');
  const miniLapText = $('miniLapText');
  const minimapPath = $('minimapPath');
  const minimapPlayer = $('minimapPlayer');
  const mapSettingsBtn = $('mapSettingsBtn');
  const cameraBtn = $('cameraBtn');
  const notice = $('notice');
  const mapShadow = document.querySelector('.map-shadow');
  const mapLine = document.querySelector('.map-line');
  const rivals = [...document.querySelectorAll('.map-rival')];

  if (mapSettingsBtn && cameraBtn) {
    mapSettingsBtn.addEventListener('click', () => cameraBtn.click());
  }

  function numberFrom(text, fallback = 0) {
    const value = Number(String(text || '').replace(/[^\d.]/g, ''));
    return Number.isFinite(value) ? value : fallback;
  }

  function pathFromPoints(points) {
    if (!Array.isArray(points) || points.length < 2) return '';
    return points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ') + ' Z';
  }

  function pointAtProgress(points, progress) {
    if (!Array.isArray(points) || points.length < 2) return { x: 28, y: 85 };
    const normalized = ((progress % 1) + 1) % 1;
    const f = normalized * (points.length - 1);
    const i = Math.floor(f);
    const j = Math.min(points.length - 1, i + 1);
    const t = f - i;
    return {
      x: points[i].x + (points[j].x - points[i].x) * t,
      y: points[i].y + (points[j].y - points[i].y) * t
    };
  }

  let mapReady = false;

  function updateVisuals() {
    const speed = numberFrom(speedText?.textContent, 0);
    if (speedFill) speedFill.style.width = `${Math.max(0, Math.min(100, speed / 3.2))}%`;

    const progress = numberFrom(progressText?.textContent, 0);
    if (progressFill) progressFill.style.width = `${Math.max(0, Math.min(100, progress))}%`;

    const data = window.NeonToyGame?.getMinimapData?.();
    if (data?.points?.length) {
      if (!mapReady) {
        const d = pathFromPoints(data.points);
        minimapPath?.setAttribute('d', d);
        mapShadow?.setAttribute('d', d);
        mapLine?.setAttribute('d', d);
        mapReady = true;
      }

      const playerPoint = pointAtProgress(data.points, data.progress || 0);
      minimapPlayer?.setAttribute('cx', playerPoint.x.toFixed(2));
      minimapPlayer?.setAttribute('cy', playerPoint.y.toFixed(2));

      rivals.forEach((dot, index) => {
        const aiProgress = data.ai?.[index];
        if (Number.isFinite(aiProgress)) {
          const point = pointAtProgress(data.points, aiProgress);
          dot.setAttribute('cx', point.x.toFixed(2));
          dot.setAttribute('cy', point.y.toFixed(2));
          dot.style.display = '';
        } else {
          dot.style.display = 'none';
        }
      });

      if (miniLapText) miniLapText.textContent = `${data.lap} / ${data.laps} 圈`;
    } else if (miniLapText && lapText) {
      miniLapText.textContent = `${String(lapText.textContent || '1/3').replace('/', ' / ')} 圈`;
    }

    document.documentElement.classList.toggle('race-active', !!notice?.classList.contains('hidden'));
    requestAnimationFrame(updateVisuals);
  }

  requestAnimationFrame(updateVisuals);
})();