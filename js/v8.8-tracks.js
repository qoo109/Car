(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;
  const shell = document.querySelector('.game-shell');
  const notice = $('notice');
  const noticeCard = document.querySelector('.notice-card');
  const startBtn = $('startBtn');
  const gameCanvas = $('gameCanvas');
  const gasBtn = $('gasBtn');
  const nitroBtn = $('nitroBtn');
  const minimapPath = $('minimapPath');
  const mapShadow = document.querySelector('.map-shadow');
  const mapLine = document.querySelector('.map-line');
  const eventFeed = $('raceEventFeed');

  if (!shell || !noticeCard || !gameCanvas) return;

  const TRACKS = {
    skyline: {
      name: '晴空高架', en: 'SKYLINE GP', weather: 'clear', handling: 1.00,
      description: '明亮高速的標準賽道', boosts: [0.105, 0.362, 0.615, 0.845],
      map: 'M28 85 C28 35 70 24 101 49 C126 69 135 115 172 115 C211 115 230 87 220 57 C210 25 170 27 156 50 C141 75 146 132 109 139 C66 147 39 125 28 85 Z'
    },
    harbor: {
      name: '霓虹港灣', en: 'NEON HARBOR', weather: 'night', handling: 0.94,
      description: '港區長直線與密集加速帶', boosts: [0.08, 0.22, 0.47, 0.70, 0.91],
      map: 'M31 116 C20 76 38 35 77 31 C115 27 116 73 148 75 C178 77 184 35 218 39 C238 42 239 77 221 92 C199 112 169 99 148 116 C119 140 49 146 31 116 Z'
    },
    alpine: {
      name: '雲海山路', en: 'ALPINE CLOUDS', weather: 'clear', handling: 1.16,
      description: '高抓地、連續技術彎道', boosts: [0.18, 0.53, 0.82],
      map: 'M26 92 C19 58 48 30 79 43 C107 55 89 91 117 104 C145 117 163 79 190 75 C221 70 238 94 224 119 C208 147 166 137 139 131 C103 123 37 137 26 92 Z'
    },
    industrial: {
      name: '工業疾走', en: 'INDUSTRIAL RUSH', weather: 'night', handling: 0.88,
      description: '窄路、重煞與高速出口', boosts: [0.14, 0.41, 0.66, 0.94],
      map: 'M29 47 L89 31 C111 27 124 43 122 62 L119 91 C117 110 134 124 154 122 L218 116 L225 78 L184 75 C165 74 151 59 155 41 L160 27 L89 27 C55 27 33 31 29 47 Z'
    },
    sunset: {
      name: '黃昏環線', en: 'SUNSET LOOP', weather: 'clear', handling: 1.03,
      description: '寬闊高速彎與夕陽直線', boosts: [0.11, 0.31, 0.58, 0.79],
      map: 'M34 91 C25 45 62 24 105 35 C145 45 150 79 183 65 C214 51 235 72 224 103 C212 136 169 138 139 123 C104 105 77 143 48 126 C38 120 35 105 34 91 Z'
    },
    storm: {
      name: '暴風天橋', en: 'STORM BRIDGE', weather: 'rain', handling: 0.82,
      description: '雨夜低抓地與高風險加速區', boosts: [0.19, 0.49, 0.76],
      map: 'M28 81 C28 43 58 26 91 37 C127 49 113 91 145 102 C176 113 192 76 218 84 C242 92 229 132 198 136 C162 140 145 116 113 123 C77 131 31 123 28 81 Z'
    }
  };

  const trackOrder = ['skyline', 'harbor', 'alpine', 'industrial', 'sunset', 'storm'];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  let currentTrack = localStorage.getItem('neon-toy-v88-track');
  if (!TRACKS[currentTrack]) currentTrack = 'skyline';
  let lastProgress = 0;
  let lastFrame = performance.now();
  let wasRacing = false;
  let boostLock = 0;

  const selector = document.createElement('section');
  selector.className = 'v88-track-select';
  selector.setAttribute('aria-label', '選擇賽道');
  selector.innerHTML = `<header><span>選擇賽道</span><small>6 TRACK LAYOUTS</small></header>${trackOrder.map((id) => {
    const track = TRACKS[id];
    return `<button class="v88-track-card" type="button" data-track="${id}"><b>${track.name}</b><small>${track.en}</small><i></i></button>`;
  }).join('')}`;
  const champToggle = document.querySelector('.v86-champ-toggle');
  noticeCard.insertBefore(selector, champToggle || startBtn || null);

  const badge = document.createElement('div');
  badge.className = 'v88-track-badge';
  badge.innerHTML = '<span>ACTIVE TRACK</span><b></b><small></small>';
  shell.appendChild(badge);

  const intro = document.createElement('div');
  intro.className = 'v88-track-intro';
  intro.innerHTML = '<strong></strong><span></span><small></small>';
  shell.appendChild(intro);

  const boostFlash = document.createElement('div');
  boostFlash.className = 'v88-boost-flash';
  boostFlash.setAttribute('aria-hidden', 'true');
  shell.appendChild(boostFlash);

  function emit(text, tone = 'cyan') {
    if (!eventFeed) return;
    eventFeed.textContent = text;
    eventFeed.dataset.tone = tone;
    eventFeed.classList.remove('show');
    void eventFeed.offsetWidth;
    eventFeed.classList.add('show');
  }

  function gameData() {
    try { return window.NeonToyGame?.getMinimapData?.() || null; }
    catch (_) { return null; }
  }

  function setWeatherForState() {
    const menuOpen = !notice || !notice.classList.contains('hidden');
    const weather = menuOpen ? 'clear' : TRACKS[currentTrack].weather;
    window.NeonToyV85?.setWeather?.(weather);
    window.NeonToySkyV86?.setMode?.(weather);
  }

  function updateMap(track) {
    [minimapPath, mapShadow, mapLine].forEach((path) => path?.setAttribute('d', track.map));
  }

  function applyTrack(id, announce = false) {
    if (!TRACKS[id]) id = 'skyline';
    currentTrack = id;
    const track = TRACKS[id];
    trackOrder.forEach((name) => root.classList.toggle(`v88-track-${name}`, name === id));
    localStorage.setItem('neon-toy-v88-track', id);
    selector.querySelectorAll('[data-track]').forEach((button) => {
      const active = button.dataset.track === id;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    badge.querySelector('b').textContent = track.name;
    badge.querySelector('small').textContent = track.en;
    intro.querySelector('strong').textContent = track.name;
    intro.querySelector('span').textContent = track.en;
    intro.querySelector('small').textContent = track.description;
    updateMap(track);
    setWeatherForState();
    if (announce) emit(`已選擇 ${track.name}`, id === 'industrial' || id === 'storm' ? 'gold' : 'cyan');
  }

  selector.addEventListener('click', (event) => {
    const button = event.target.closest('[data-track]');
    if (!button) return;
    applyTrack(button.dataset.track, true);
    try { navigator.vibrate?.(8); } catch (_) {}
  });

  function crossed(previous, current, target) {
    if (current >= previous) return previous < target && current >= target;
    return previous < target || current >= target;
  }

  function pointerEvent(type, button, id = 88) {
    const rect = button.getBoundingClientRect();
    try {
      return new PointerEvent(type, {
        bubbles: true, cancelable: true, pointerType: 'touch', pointerId: id,
        buttons: type === 'pointerdown' ? 1 : 0,
        clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2
      });
    } catch (_) {
      return new Event(type, { bubbles: true, cancelable: true });
    }
  }

  function triggerTrackBoost() {
    if (boostLock > 0) return;
    boostLock = 1.0;
    boostFlash.classList.remove('show');
    void boostFlash.offsetWidth;
    boostFlash.classList.add('show');
    if (gasBtn?.classList.contains('is-down') && nitroBtn) {
      nitroBtn.dispatchEvent(pointerEvent('pointerdown', nitroBtn));
      window.setTimeout(() => nitroBtn.dispatchEvent(pointerEvent('pointerup', nitroBtn)), 680);
    }
    emit(`${TRACKS[currentTrack].name} · 加速區`, 'cyan');
    try { navigator.vibrate?.([10, 16, 10]); } catch (_) {}
  }

  const pointerStarts = new Map();
  const synthetic = new WeakSet();
  gameCanvas.addEventListener('pointerdown', (event) => {
    if (synthetic.has(event)) return;
    pointerStarts.set(event.pointerId, event.clientX);
  }, { capture: true, passive: true });
  gameCanvas.addEventListener('pointermove', (event) => {
    if (synthetic.has(event)) return;
    const start = pointerStarts.get(event.pointerId);
    if (start == null) return;
    const scale = TRACKS[currentTrack].handling;
    if (Math.abs(scale - 1) < 0.01) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const x = start + (event.clientX - start) * scale;
    let next;
    try {
      next = new PointerEvent('pointermove', {
        bubbles: true, cancelable: true, pointerType: event.pointerType || 'touch',
        pointerId: event.pointerId, buttons: event.buttons, clientX: x, clientY: event.clientY,
        pressure: event.pressure
      });
    } catch (_) {
      next = new Event('pointermove', { bubbles: true, cancelable: true });
      Object.defineProperties(next, {
        pointerId: { value: event.pointerId }, clientX: { value: x },
        clientY: { value: event.clientY }, buttons: { value: event.buttons }
      });
    }
    synthetic.add(next);
    gameCanvas.dispatchEvent(next);
  }, { capture: true, passive: false });
  ['pointerup', 'pointercancel'].forEach((type) => gameCanvas.addEventListener(type, (event) => pointerStarts.delete(event.pointerId), { capture: true }));

  function beginRaceIntro() {
    intro.classList.remove('show');
    void intro.offsetWidth;
    intro.classList.add('show');
    window.setTimeout(() => intro.classList.remove('show'), 2450);
  }

  function frame(now) {
    const dt = clamp((now - lastFrame) / 1000, 0, 0.05);
    lastFrame = now;
    boostLock = Math.max(0, boostLock - dt);
    const data = gameData();
    const menuOpen = !notice || !notice.classList.contains('hidden');
    const racing = !menuOpen && Number(data?.progress || 0) >= 0;
    const progress = clamp(Number(data?.progress || 0), 0, 1);

    badge.classList.toggle('visible', !menuOpen);
    if (racing && !wasRacing) {
      lastProgress = progress;
      setWeatherForState();
      beginRaceIntro();
    }
    if (!racing && wasRacing) setWeatherForState();

    if (racing) {
      for (const zone of TRACKS[currentTrack].boosts) {
        if (crossed(lastProgress, progress, zone)) {
          triggerTrackBoost();
          break;
        }
      }
    }
    lastProgress = progress;
    wasRacing = racing;
    requestAnimationFrame(frame);
  }

  if (notice) {
    const observer = new MutationObserver(() => setTimeout(setWeatherForState, 30));
    observer.observe(notice, { attributes: true, attributeFilter: ['class'] });
  }

  applyTrack(currentTrack, false);
  if (window.NeonToyGame) window.NeonToyGame.version = '8.8';
  window.NeonToyTracksV88 = {
    version: '8.8',
    tracks: TRACKS,
    get current() { return currentTrack; },
    setTrack(id) { applyTrack(id, false); }
  };
  requestAnimationFrame(frame);
})();
