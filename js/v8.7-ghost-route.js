(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;
  const shell = document.querySelector('.game-shell');
  const gameCanvas = $('gameCanvas');
  const notice = $('notice');
  const noticeCard = document.querySelector('.notice-card');
  const startBtn = $('startBtn');
  const bottomActions = document.querySelector('.bottom-actions');
  const timeText = $('timeText');
  const eventFeed = $('raceEventFeed');

  if (!shell || !gameCanvas) return;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const parseClock = (text) => {
    const value = String(text || '').trim();
    if (!value || value === '--') return 0;
    const parts = value.split(':');
    if (parts.length === 2) return Number(parts[0]) * 60 + Number(parts[1]);
    return Number(value) || 0;
  };

  const routePanel = document.createElement('section');
  routePanel.className = 'v87-route-panel';
  routePanel.setAttribute('aria-label', '選擇賽道路線');
  routePanel.innerHTML = `
    <div><span>賽道路線</span><small>TRACK LAYOUT</small></div>
    <button type="button" data-route="normal">正向賽道</button>
    <button type="button" data-route="mirror">鏡像賽道</button>`;
  const champToggle = document.querySelector('.v86-champ-toggle');
  if (noticeCard) noticeCard.insertBefore(routePanel, champToggle || startBtn || null);

  const ghostToggle = document.createElement('button');
  ghostToggle.id = 'v87GhostToggle';
  ghostToggle.type = 'button';
  ghostToggle.className = 'v87-ghost-toggle';
  ghostToggle.textContent = '幽靈：開';
  bottomActions?.insertBefore(ghostToggle, bottomActions.lastElementChild || null);

  const routeBadge = document.createElement('div');
  routeBadge.className = 'v87-route-badge';
  routeBadge.innerHTML = '<span>ROUTE</span><b>正向賽道</b>';
  shell.appendChild(routeBadge);

  const ghostCanvas = document.createElement('canvas');
  ghostCanvas.id = 'v87GhostCanvas';
  ghostCanvas.setAttribute('aria-hidden', 'true');
  shell.insertBefore(ghostCanvas, $('speedFxCanvas') || gameCanvas.nextSibling);

  let route = localStorage.getItem('neon-toy-v87-route') === 'mirror' ? 'mirror' : 'normal';
  let ghostEnabled = localStorage.getItem('neon-toy-v87-ghost') !== 'off';
  let lastFrame = performance.now();
  let width = 1;
  let height = 1;
  let dpr = 1;

  function emit(text, tone = 'cyan') {
    if (!eventFeed) return;
    eventFeed.textContent = text;
    eventFeed.dataset.tone = tone;
    eventFeed.classList.remove('show');
    void eventFeed.offsetWidth;
    eventFeed.classList.add('show');
  }

  function applyRoute(next, announce = false) {
    route = next === 'mirror' ? 'mirror' : 'normal';
    root.classList.toggle('v87-route-mirror', route === 'mirror');
    localStorage.setItem('neon-toy-v87-route', route);
    routePanel.querySelectorAll('[data-route]').forEach((button) => {
      const active = button.dataset.route === route;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    routeBadge.querySelector('b').textContent = route === 'mirror' ? '鏡像賽道' : '正向賽道';
    if (announce) emit(route === 'mirror' ? '鏡像賽道已啟用 · 方向同步反轉' : '正向賽道已啟用', route === 'mirror' ? 'gold' : 'cyan');
  }

  routePanel.addEventListener('click', (event) => {
    const button = event.target.closest('[data-route]');
    if (!button) return;
    applyRoute(button.dataset.route, true);
    try { navigator.vibrate?.(8); } catch (_) {}
  });

  ghostToggle.addEventListener('click', () => {
    ghostEnabled = !ghostEnabled;
    localStorage.setItem('neon-toy-v87-ghost', ghostEnabled ? 'on' : 'off');
    ghostToggle.textContent = `幽靈：${ghostEnabled ? '開' : '關'}`;
    ghostToggle.classList.toggle('active', ghostEnabled);
    if (!ghostEnabled) ghostCanvas.classList.remove('visible');
    emit(ghostEnabled ? '3D 幽靈車已開啟' : '3D 幽靈車已關閉', ghostEnabled ? 'cyan' : 'purple');
  });

  const syntheticPointers = new WeakSet();
  function mirroredPointer(event) {
    const rect = gameCanvas.getBoundingClientRect();
    const reflectedX = rect.left + rect.width - (event.clientX - rect.left);
    let next;
    try {
      next = new PointerEvent(event.type, {
        bubbles: true,
        cancelable: true,
        pointerId: event.pointerId,
        pointerType: event.pointerType || 'touch',
        isPrimary: event.isPrimary,
        buttons: event.buttons,
        button: event.button,
        clientX: reflectedX,
        clientY: event.clientY,
        pressure: event.pressure
      });
    } catch (_) {
      next = new Event(event.type, { bubbles: true, cancelable: true });
      Object.defineProperties(next, {
        pointerId: { value: event.pointerId },
        clientX: { value: reflectedX },
        clientY: { value: event.clientY },
        buttons: { value: event.buttons }
      });
    }
    syntheticPointers.add(next);
    return next;
  }

  ['pointerdown', 'pointermove'].forEach((type) => {
    gameCanvas.addEventListener(type, (event) => {
      if (route !== 'mirror' || syntheticPointers.has(event)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      gameCanvas.dispatchEvent(mirroredPointer(event));
    }, { capture: true, passive: false });
  });

  const syntheticKeys = new WeakSet();
  const oppositeCode = { ArrowLeft: 'ArrowRight', ArrowRight: 'ArrowLeft', KeyA: 'KeyD', KeyD: 'KeyA' };
  ['keydown', 'keyup'].forEach((type) => {
    window.addEventListener(type, (event) => {
      const code = oppositeCode[event.code];
      if (route !== 'mirror' || !code || syntheticKeys.has(event)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const keyMap = { ArrowLeft: 'ArrowRight', ArrowRight: 'ArrowLeft', KeyA: 'd', KeyD: 'a' };
      const next = new KeyboardEvent(type, {
        bubbles: true,
        cancelable: true,
        code,
        key: keyMap[event.code] || event.key,
        repeat: event.repeat,
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        metaKey: event.metaKey
      });
      syntheticKeys.add(next);
      window.dispatchEvent(next);
    }, { capture: true, passive: false });
  });

  function getGameData() {
    try { return window.NeonToyGame?.getMinimapData?.() || null; }
    catch (_) { return null; }
  }

  function getGhost() {
    try { return window.NeonToyV86?.ghost || null; }
    catch (_) { return null; }
  }

  function sampleGhost(ghost, time) {
    if (!ghost?.samples?.length || time < 0 || time > ghost.total + 0.2) return null;
    const samples = ghost.samples;
    let lo = 0;
    let hi = samples.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (samples[mid].t < time) lo = mid + 1;
      else hi = mid;
    }
    const b = samples[lo];
    const a = samples[Math.max(0, lo - 1)];
    if (!a || a === b) return b;
    const mix = clamp((time - a.t) / Math.max(0.001, b.t - a.t), 0, 1);
    return { t: time, o: a.o + (b.o - a.o) * mix };
  }

  const gl = ghostCanvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: false });
  let program = null;
  let buffer = null;
  let loc = null;
  const projection = new Float32Array(16);
  const model = new Float32Array(16);

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  }

  function initGhostRenderer() {
    if (!gl) return;
    const vertex = compile(gl.VERTEX_SHADER, `
      attribute vec3 aPosition;
      uniform mat4 uProjection;
      uniform mat4 uModel;
      varying float vDepth;
      void main(){
        vec4 p = uModel * vec4(aPosition, 1.0);
        vDepth = clamp((-p.z - 3.0) / 18.0, 0.0, 1.0);
        gl_Position = uProjection * p;
      }`);
    const fragment = compile(gl.FRAGMENT_SHADER, `
      precision mediump float;
      uniform vec3 uColor;
      uniform float uAlpha;
      varying float vDepth;
      void main(){
        float scan = 0.82 + 0.18 * sin(gl_FragCoord.y * 0.32);
        vec3 color = uColor * (1.15 - vDepth * 0.18) * scan;
        gl_FragColor = vec4(color, uAlpha * (0.95 - vDepth * 0.28));
      }`);
    program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    loc = {
      position: gl.getAttribLocation(program, 'aPosition'),
      projection: gl.getUniformLocation(program, 'uProjection'),
      model: gl.getUniformLocation(program, 'uModel'),
      color: gl.getUniformLocation(program, 'uColor'),
      alpha: gl.getUniformLocation(program, 'uAlpha')
    };
    const vertices = new Float32Array([
      -1,-1,1, 1,-1,1, 1,1,1, -1,-1,1, 1,1,1, -1,1,1,
      1,-1,-1, -1,-1,-1, -1,1,-1, 1,-1,-1, -1,1,-1, 1,1,-1,
      -1,1,1, 1,1,1, 1,1,-1, -1,1,1, 1,1,-1, -1,1,-1,
      -1,-1,-1, 1,-1,-1, 1,-1,1, -1,-1,-1, 1,-1,1, -1,-1,1,
      1,-1,1, 1,-1,-1, 1,1,-1, 1,-1,1, 1,1,-1, 1,1,1,
      -1,-1,-1, -1,-1,1, -1,1,1, -1,-1,-1, -1,1,1, -1,1,-1
    ]);
    buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc.position);
    gl.vertexAttribPointer(loc.position, 3, gl.FLOAT, false, 0, 0);
    gl.useProgram(program);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 0);
  }

  function perspective(out, fov, aspect, near, far) {
    const f = 1 / Math.tan(fov / 2);
    out[0] = f / aspect; out[1] = 0; out[2] = 0; out[3] = 0;
    out[4] = 0; out[5] = f; out[6] = 0; out[7] = 0;
    out[8] = 0; out[9] = 0; out[10] = (far + near) / (near - far); out[11] = -1;
    out[12] = 0; out[13] = 0; out[14] = (2 * far * near) / (near - far); out[15] = 0;
  }

  function compose(out, x, y, z, sx, sy, sz, yaw = 0, pitch = 0) {
    const cy = Math.cos(yaw), syaw = Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    out[0] = cy * sx; out[1] = syaw * sp * sx; out[2] = -syaw * cp * sx; out[3] = 0;
    out[4] = 0; out[5] = cp * sy; out[6] = sp * sy; out[7] = 0;
    out[8] = syaw * sz; out[9] = -cy * sp * sz; out[10] = cy * cp * sz; out[11] = 0;
    out[12] = x; out[13] = y; out[14] = z; out[15] = 1;
  }

  function drawBox(x, y, z, w, h, d, yaw, color, alpha, pitch = 0) {
    compose(model, x, y, z, w * 0.5, h * 0.5, d * 0.5, yaw, pitch);
    gl.uniformMatrix4fv(loc.model, false, model);
    gl.uniform3f(loc.color, color[0], color[1], color[2]);
    gl.uniform1f(loc.alpha, alpha);
    gl.drawArrays(gl.TRIANGLES, 0, 36);
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    width = Math.max(1, shell.clientWidth);
    height = Math.max(1, shell.clientHeight);
    ghostCanvas.width = Math.floor(width * dpr);
    ghostCanvas.height = Math.floor(height * dpr);
    ghostCanvas.style.width = `${width}px`;
    ghostCanvas.style.height = `${height}px`;
    if (gl && program && loc) {
      gl.viewport(0, 0, ghostCanvas.width, ghostCanvas.height);
      perspective(projection, Math.PI / 3.25, ghostCanvas.width / ghostCanvas.height, 0.1, 60);
      gl.useProgram(program);
      gl.uniformMatrix4fv(loc.projection, false, projection);
    }
  }

  function renderGhost(data, ghost, time, now) {
    if (!gl || !program) return;
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const menuOpen = !notice || !notice.classList.contains('hidden');
    if (!ghostEnabled || menuOpen || !data || !ghost || time <= 0) {
      ghostCanvas.classList.remove('visible');
      return;
    }

    const sample = sampleGhost(ghost, time);
    if (!sample) {
      ghostCanvas.classList.remove('visible');
      return;
    }

    const laps = Number(ghost.laps || data.laps || 1);
    const overall = clamp(((Number(data.lap || 1) - 1) + Number(data.progress || 0)) / Math.max(1, Number(data.laps || 1)), 0, 1);
    const metres = (sample.o - overall) * laps * 3000;
    if (metres < 2 || metres > 230) {
      ghostCanvas.classList.remove('visible');
      return;
    }

    ghostCanvas.classList.add('visible');
    const distance01 = clamp(metres / 230, 0, 1);
    const z = -4.2 - distance01 * 14.5;
    const routeSign = route === 'mirror' ? -1 : 1;
    const lane = Math.sin(sample.o * Math.PI * 34) * (0.42 + distance01 * 0.15) * routeSign;
    const y = -1.22 + distance01 * 0.65;
    const yaw = Math.sin(sample.o * Math.PI * 22) * 0.12 * routeSign;
    const bob = Math.sin(now * 0.004 + sample.o * 20) * 0.025;
    const alpha = 0.34 + Math.sin(now * 0.008) * 0.045;

    gl.useProgram(program);
    drawBox(lane, y + bob, z, 1.55, 0.48, 2.5, yaw, [0.26, 0.90, 1.00], alpha);
    drawBox(lane, y + 0.48 + bob, z - 0.10, 1.14, 0.58, 1.15, yaw, [0.46, 0.44, 1.00], alpha * 0.92);
    drawBox(lane, y + 0.57 + bob, z + 0.15, 0.93, 0.34, 0.54, yaw, [0.72, 0.96, 1.00], alpha * 0.72);
    drawBox(lane, y + 0.08 + bob, z - 1.27, 1.25, 0.14, 0.32, yaw, [0.66, 0.34, 1.00], alpha * 1.05);
    for (const side of [-1, 1]) {
      drawBox(lane + side * 0.72, y - 0.28 + bob, z - 0.66, 0.30, 0.44, 0.52, yaw, [0.16, 0.25, 0.42], alpha * 0.88, now * 0.006);
      drawBox(lane + side * 0.72, y - 0.28 + bob, z + 0.70, 0.30, 0.44, 0.52, yaw, [0.16, 0.25, 0.42], alpha * 0.88, now * 0.006);
    }
  }

  function frame(now) {
    const dt = clamp((now - lastFrame) / 1000, 0, 0.05);
    lastFrame = now;
    const data = getGameData();
    const ghost = getGhost();
    const time = parseClock(timeText?.textContent);
    renderGhost(data, ghost, time, now);
    routeBadge.classList.toggle('visible', !!notice?.classList.contains('hidden'));
    root.style.setProperty('--v87-route-pulse', String((Math.sin(now * 0.003) + 1) * 0.5));
    void dt;
    requestAnimationFrame(frame);
  }

  try { initGhostRenderer(); } catch (error) { console.warn('V8.7 ghost renderer disabled', error); }
  applyRoute(route, false);
  ghostToggle.textContent = `幽靈：${ghostEnabled ? '開' : '關'}`;
  ghostToggle.classList.toggle('active', ghostEnabled);
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 140));
  window.visualViewport?.addEventListener('resize', resize);

  if (window.NeonToyGame) window.NeonToyGame.version = '8.7';
  window.NeonToyV87 = {
    version: '8.7',
    get route() { return route; },
    setRoute(value) { applyRoute(value, false); },
    get ghostEnabled() { return ghostEnabled; }
  };

  requestAnimationFrame(frame);
})();
