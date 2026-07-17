(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;
  const shell = document.querySelector('.game-shell');
  const notice = $('notice');
  const noticeText = $('noticeText');
  const timeText = $('timeText');
  const speedText = $('speedText');
  const rankText = $('rankText');
  const brakeBtn = $('brakeBtn');
  const eventFeed = $('raceEventFeed');
  const minimapPath = $('minimapPath');
  const minimap = document.querySelector('svg.minimap');
  const startBtn = $('startBtn');
  const noticeCard = document.querySelector('.notice-card');

  if (!shell) return;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mod = (n, m) => ((n % m) + m) % m;
  const numberFrom = (text, fallback = 0) => {
    const n = Number(String(text || '').replace(/[^\d.]/g, ''));
    return Number.isFinite(n) ? n : fallback;
  };
  const parseClock = (text) => {
    const value = String(text || '').trim();
    if (!value || value === '--') return 0;
    const parts = value.split(':');
    if (parts.length === 2) return Number(parts[0]) * 60 + Number(parts[1]);
    return Number(value) || 0;
  };
  const pointerEvent = (type, init = {}) => {
    try {
      return new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerType: 'touch',
        pointerId: init.pointerId || 86,
        buttons: type === 'pointerdown' || type === 'pointermove' ? 1 : 0,
        clientX: init.clientX || 0,
        clientY: init.clientY || 0
      });
    } catch (_) {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.assign(event, init);
      return event;
    }
  };

  const skyLayer = document.createElement('div');
  skyLayer.id = 'v86SkyLayer';
  skyLayer.setAttribute('aria-hidden', 'true');
  skyLayer.innerHTML = '<i class="v86-sun"></i><i class="v86-cloud c1"></i><i class="v86-cloud c2"></i><i class="v86-cloud c3"></i>';
  shell.insertBefore(skyLayer, shell.firstChild?.nextSibling || null);

  const collisionFlash = document.createElement('div');
  collisionFlash.className = 'v86-collision-flash';
  collisionFlash.setAttribute('aria-hidden', 'true');
  shell.appendChild(collisionFlash);

  const collisionBadge = document.createElement('div');
  collisionBadge.className = 'v86-collision-badge';
  collisionBadge.textContent = '車輛接觸 · 速度下降';
  shell.appendChild(collisionBadge);

  const ghostStatus = document.createElement('div');
  ghostStatus.className = 'v86-ghost-status';
  ghostStatus.innerHTML = '幽靈車 <b>尚未記錄</b>';
  shell.appendChild(ghostStatus);

  let ghostDot = null;
  if (minimap) {
    ghostDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    ghostDot.setAttribute('class', 'v86-ghost-dot');
    ghostDot.setAttribute('r', '5.4');
    ghostDot.setAttribute('cx', '28');
    ghostDot.setAttribute('cy', '85');
    ghostDot.style.display = 'none';
    minimap.appendChild(ghostDot);
  }

  const champToggle = document.createElement('button');
  champToggle.className = 'v86-champ-toggle';
  champToggle.type = 'button';
  if (noticeCard && startBtn) noticeCard.insertBefore(champToggle, startBtn);

  const champPanel = document.createElement('section');
  champPanel.className = 'v86-champ-panel';
  champPanel.setAttribute('aria-label', '錦標賽積分');
  champPanel.innerHTML = `
    <div class="v86-champ-head"><span>SKYWAY CHAMPIONSHIP</span><b id="v86ChampRound">ROUND 1/3</b></div>
    <div class="v86-champ-score"><div><small>你的積分</small><strong id="v86ChampPoints">0</strong></div><button id="v86ChampReset" class="v86-champ-reset" type="button">重設</button></div>
    <div id="v86ChampTop" class="v86-champ-top"></div>`;
  shell.appendChild(champPanel);

  const champRound = $('v86ChampRound');
  const champPoints = $('v86ChampPoints');
  const champTop = $('v86ChampTop');
  const champReset = $('v86ChampReset');

  const DRIVER_NAMES = ['YOU', 'REX', 'NOVA', 'BOLT', 'MIKA', 'ZEN'];
  const POINTS = [10, 6, 4, 3, 2, 1];
  const defaultChampionship = () => ({
    enabled: false,
    round: 1,
    complete: false,
    standings: Object.fromEntries(DRIVER_NAMES.map((name) => [name, 0]))
  });

  function loadChampionship() {
    try {
      const parsed = JSON.parse(localStorage.getItem('neon-toy-v86-championship') || 'null');
      if (!parsed || typeof parsed !== 'object') return defaultChampionship();
      return {
        ...defaultChampionship(),
        ...parsed,
        standings: { ...defaultChampionship().standings, ...(parsed.standings || {}) }
      };
    } catch (_) {
      return defaultChampionship();
    }
  }

  let championship = loadChampionship();
  let collisionCooldown = 0;
  let lastSkyMode = '';
  let lastFrame = performance.now();
  let wasRacing = false;
  let runSamples = [];
  let lastSampleTime = -1;
  let activeGhost = null;
  let activeGhostKey = '';
  let finishFingerprint = '';

  function saveChampionship() {
    localStorage.setItem('neon-toy-v86-championship', JSON.stringify(championship));
  }

  function renderChampionship() {
    champToggle.textContent = championship.enabled ? '🏆 錦標賽模式：開啟' : '🏆 錦標賽模式：關閉';
    champToggle.classList.toggle('active', championship.enabled);
    champPanel.classList.toggle('visible', championship.enabled);
    if (champRound) champRound.textContent = championship.complete ? 'CHAMPIONSHIP COMPLETE' : `ROUND ${championship.round}/3`;
    if (champPoints) champPoints.textContent = String(championship.standings.YOU || 0);
    if (champTop) {
      const leaders = Object.entries(championship.standings).sort((a, b) => b[1] - a[1]).slice(0, 3);
      champTop.innerHTML = leaders.map(([name, points], index) => `<i>${index + 1}. ${name}<br>${points} PTS</i>`).join('');
    }
  }

  function emitFeed(text, tone = 'purple') {
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

  function raceKey(data) {
    const cars = Number(String(rankText?.textContent || '1/6').split('/')[1]) || 6;
    const laps = Number(data?.laps || 3);
    return `neon-toy-v86-ghost-${laps}-${cars}`;
  }

  function loadGhost(key) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || 'null');
      return parsed?.samples?.length ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function ghostAtTime(ghost, time) {
    if (!ghost?.samples?.length || time < 0 || time > ghost.total + 0.15) return null;
    const samples = ghost.samples;
    let low = 0;
    let high = samples.length - 1;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (samples[mid].t < time) low = mid + 1;
      else high = mid;
    }
    const b = samples[low];
    const a = samples[Math.max(0, low - 1)];
    if (!a || a === b) return b;
    const ratio = clamp((time - a.t) / Math.max(0.001, b.t - a.t), 0, 1);
    return { t: time, o: a.o + (b.o - a.o) * ratio };
  }

  function updateGhost(data, raceTime, racing) {
    if (!data) return;
    const key = raceKey(data);
    if (key !== activeGhostKey) {
      activeGhostKey = key;
      activeGhost = loadGhost(key);
    }

    if (racing && raceTime > 0) {
      const overall = clamp(((Number(data.lap || 1) - 1) + Number(data.progress || 0)) / Math.max(1, Number(data.laps || 1)), 0, 1);
      if (raceTime - lastSampleTime >= 0.14) {
        runSamples.push({ t: Number(raceTime.toFixed(3)), o: Number(overall.toFixed(6)) });
        lastSampleTime = raceTime;
      }

      const ghostSample = ghostAtTime(activeGhost, raceTime);
      if (ghostSample && minimapPath && ghostDot) {
        const laps = Number(activeGhost.laps || data.laps || 1);
        const lapProgress = mod(ghostSample.o * laps, 1);
        const length = minimapPath.getTotalLength();
        const point = minimapPath.getPointAtLength(length * lapProgress);
        ghostDot.setAttribute('cx', point.x.toFixed(2));
        ghostDot.setAttribute('cy', point.y.toFixed(2));
        ghostDot.style.display = '';
        const metres = Math.round((ghostSample.o - overall) * laps * 3000);
        ghostStatus.classList.add('visible');
        ghostStatus.classList.toggle('behind', metres < 0);
        ghostStatus.innerHTML = metres >= 0
          ? `幽靈領先 <b>${Math.abs(metres)}m</b>`
          : `你領先幽靈 <b>${Math.abs(metres)}m</b>`;
      } else {
        if (ghostDot) ghostDot.style.display = 'none';
        ghostStatus.classList.toggle('visible', !!activeGhost);
        if (activeGhost) ghostStatus.innerHTML = '幽靈車 <b>等待起跑</b>';
      }
    } else if (ghostDot) {
      ghostDot.style.display = 'none';
    }
  }

  function saveFinishedGhost(data, total) {
    if (!data || total <= 0 || runSamples.length < 8) return;
    const key = raceKey(data);
    const previous = loadGhost(key);
    runSamples.push({ t: total, o: 1 });
    if (!previous || total < previous.total) {
      const ghost = { version: '8.6', total, laps: Number(data.laps || 1), samples: runSamples.slice(-2400) };
      localStorage.setItem(key, JSON.stringify(ghost));
      activeGhost = ghost;
      emitFeed('新的最佳幽靈紀錄已儲存', 'cyan');
    }
  }

  function deterministicOrder(round, total, rank, totalTime) {
    const ai = DRIVER_NAMES.slice(1, total);
    ai.sort((a, b) => {
      const hash = (name) => {
        let value = round * 97 + Math.round(totalTime * 10);
        for (const char of name) value = (value * 31 + char.charCodeAt(0)) % 10007;
        return value;
      };
      return hash(a) - hash(b);
    });
    ai.splice(clamp(rank - 1, 0, ai.length), 0, 'YOU');
    return ai;
  }

  function processChampionshipFinish(totalTime) {
    if (!championship.enabled || championship.complete) return;
    const rankParts = String(rankText?.textContent || '1/6').split('/');
    const rank = clamp(Number(rankParts[0]) || 1, 1, 6);
    const total = clamp(Number(rankParts[1]) || 6, 1, 6);
    const order = deterministicOrder(championship.round, total, rank, totalTime);
    order.forEach((name, index) => {
      championship.standings[name] = (championship.standings[name] || 0) + (POINTS[index] || 0);
    });

    if (championship.round >= 3) {
      championship.complete = true;
      const winner = Object.entries(championship.standings).sort((a, b) => b[1] - a[1])[0]?.[0] || 'YOU';
      emitFeed(winner === 'YOU' ? '🏆 你贏得錦標賽冠軍！' : `錦標賽完成 · 冠軍 ${winner}`, winner === 'YOU' ? 'gold' : 'purple');
    } else {
      championship.round += 1;
      emitFeed(`錦標賽第 ${championship.round - 1} 戰完成`, 'gold');
    }
    saveChampionship();
    renderChampionship();
  }

  function pressBrake(duration = 180) {
    if (!brakeBtn || brakeBtn.classList.contains('is-down')) return;
    const rect = brakeBtn.getBoundingClientRect();
    const init = { pointerId: 86, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
    brakeBtn.dispatchEvent(pointerEvent('pointerdown', init));
    window.setTimeout(() => brakeBtn.dispatchEvent(pointerEvent('pointerup', init)), duration);
  }

  function triggerCollision(side) {
    collisionCooldown = 1.45;
    collisionFlash.style.setProperty('--hit-x', side < 0 ? '32%' : '68%');
    collisionFlash.classList.remove('show');
    collisionBadge.classList.remove('show');
    void collisionFlash.offsetWidth;
    collisionFlash.classList.add('show');
    collisionBadge.classList.add('show');
    shell.classList.remove('impact-shake');
    void shell.offsetWidth;
    shell.classList.add('impact-shake');
    window.setTimeout(() => shell.classList.remove('impact-shake'), 320);
    pressBrake(190);
    emitFeed(side < 0 ? '左側擦撞 · 注意車距' : '右側擦撞 · 注意車距', 'red');
    try { navigator.vibrate?.([20, 18, 25]); } catch (_) {}
  }

  function updateCollision(data, speed, dt, racing) {
    collisionCooldown = Math.max(0, collisionCooldown - dt);
    if (!racing || collisionCooldown > 0 || speed < 80 || !data?.ai?.length) return;
    const progress = Number(data.progress || 0);
    let nearest = 1;
    let nearestIndex = -1;
    data.ai.forEach((aiProgress, index) => {
      let delta = Number(aiProgress) - progress;
      if (delta > 0.5) delta -= 1;
      if (delta < -0.5) delta += 1;
      if (Math.abs(delta) < nearest) {
        nearest = Math.abs(delta);
        nearestIndex = index;
      }
    });
    const metres = nearest * 3000;
    const steer = Math.abs(Number.parseFloat(getComputedStyle(root).getPropertyValue('--steer-amount')) || 0);
    const laneSignal = Math.abs(Math.sin(progress * 93 + nearestIndex * 1.73));
    const contact = metres < 5.4 || (metres < 9.0 && steer > 0.42 && laneSignal < 0.46);
    if (contact) triggerCollision(Math.sin(progress * 121 + nearestIndex) < 0 ? -1 : 1);
  }

  function updateSky(menuOpen) {
    const weather = menuOpen ? 'clear' : (window.NeonToyV85?.weather || 'clear');
    root.classList.toggle('v86-menu-open', menuOpen);
    if (weather !== lastSkyMode) {
      lastSkyMode = weather;
      window.NeonToySkyV86?.setMode?.(weather);
    }
  }

  function frame(now) {
    const dt = clamp((now - lastFrame) / 1000, 0, 0.05);
    lastFrame = now;
    const data = gameData();
    const speed = numberFrom(speedText?.textContent, 0);
    const raceTime = parseClock(timeText?.textContent);
    const menuOpen = !notice || !notice.classList.contains('hidden');
    const racing = !menuOpen && raceTime > 0;

    updateSky(menuOpen);
    updateCollision(data, speed, dt, racing);

    if (racing && !wasRacing) {
      runSamples = [];
      lastSampleTime = -1;
      activeGhostKey = '';
    }
    updateGhost(data, raceTime, racing);

    if (!racing && wasRacing && menuOpen && String(noticeText?.textContent || '').includes('完成')) {
      const fingerprint = `${raceTime}-${rankText?.textContent}-${noticeText?.textContent}`;
      if (fingerprint !== finishFingerprint) {
        finishFingerprint = fingerprint;
        saveFinishedGhost(data, raceTime);
        processChampionshipFinish(raceTime);
      }
    }

    wasRacing = racing;
    requestAnimationFrame(frame);
  }

  champToggle.addEventListener('click', () => {
    championship.enabled = !championship.enabled;
    saveChampionship();
    renderChampionship();
    emitFeed(championship.enabled ? '錦標賽模式已開啟' : '錦標賽模式已關閉', championship.enabled ? 'gold' : 'purple');
  });

  champReset?.addEventListener('click', () => {
    const enabled = championship.enabled;
    championship = defaultChampionship();
    championship.enabled = enabled;
    saveChampionship();
    renderChampionship();
    emitFeed('錦標賽積分已重設', 'purple');
  });

  if (window.NeonToyGame) window.NeonToyGame.version = '8.6';
  window.NeonToyV86 = {
    version: '8.6',
    resetChampionship() {
      championship = defaultChampionship();
      saveChampionship();
      renderChampionship();
    },
    get championship() { return JSON.parse(JSON.stringify(championship)); },
    get ghost() { return activeGhost; }
  };

  renderChampionship();
  requestAnimationFrame(frame);
})();