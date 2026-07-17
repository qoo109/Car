(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const canvas = $('gameCanvas');
  const errorBox = $('webglError');
  const gl = canvas?.getContext('webgl', {
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false
  });

  if (!canvas || !gl) {
    if (errorBox) errorBox.hidden = false;
    return;
  }

  const UI = {
    speedText: $('speedText'), rankText: $('rankText'), lapText: $('lapText'),
    progressText: $('progressText'), timeText: $('timeText'), bestText: $('bestText'),
    boostBar: $('boostBar'), fpsText: $('fpsText'), notice: $('notice'),
    noticeText: $('noticeText'), countdown: $('countdown'), startBtn: $('startBtn'),
    gasBtn: $('gasBtn'), brakeBtn: $('brakeBtn'), nitroBtn: $('nitroBtn'),
    driftBtn: $('driftBtn'), resetBtn: $('resetBtn'), cameraBtn: $('cameraBtn'),
    soundBtn: $('soundBtn'), carChoices: [...document.querySelectorAll('.car-choice')],
    lapChoices: [...document.querySelectorAll('.lap-choice')],
    raceChoices: [...document.querySelectorAll('.race-choice')]
  };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const mod = (n, m) => ((n % m) + m) % m;
  const smoothstep = (a, b, v) => {
    const t = clamp((v - a) / Math.max(0.0001, b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const plateau = (v, a, b, c, d, amount) =>
    amount * smoothstep(a, b, v) * (1 - smoothstep(c, d, v));

  const COLORS = {
    sky: [0.060, 0.048, 0.118], fog: [0.145, 0.115, 0.225],
    void: [0.035, 0.032, 0.058], deck: [0.225, 0.225, 0.310],
    deckDark: [0.115, 0.108, 0.170], asphalt: [0.245, 0.250, 0.340],
    asphaltAlt: [0.275, 0.278, 0.370], lane: [0.825, 0.835, 0.930],
    rail: [0.525, 0.515, 0.705], railTop: [0.735, 0.700, 0.950],
    purple: [0.565, 0.300, 1.000], purpleSoft: [0.720, 0.520, 1.000],
    red: [1.000, 0.165, 0.225], orange: [1.000, 0.455, 0.110],
    gold: [1.000, 0.735, 0.210], green: [0.180, 0.850, 0.490],
    cyan: [0.210, 0.900, 1.000], white: [0.955, 0.955, 1.000],
    black: [0.030, 0.030, 0.050], glass: [0.055, 0.085, 0.155],
    smoke: [0.620, 0.600, 0.760], tree: [0.075, 0.095, 0.120],
    trunk: [0.155, 0.110, 0.130], building: [0.230, 0.220, 0.325],
    window: [0.730, 0.430, 1.000], industrial: [0.285, 0.275, 0.365],
    shadow: [0.018, 0.016, 0.032]
  };

  const CAR_SKINS = [
    { name:'白色', type:'classic', body:[0.92,0.91,0.99], stripe:[1.00,0.24,0.20], accent:[0.62,0.39,1.00], max:126, accel:78, grip:1.03 },
    { name:'黃色', type:'compact', body:[1.00,0.62,0.10], stripe:[1.00,0.94,0.72], accent:[1.00,0.25,0.15], max:128, accel:79, grip:1.00 },
    { name:'藍色', type:'sport', body:[0.10,0.34,0.96], stripe:[0.65,0.84,1.00], accent:[0.46,0.27,1.00], max:130, accel:75, grip:1.01 },
    { name:'黑色', type:'muscle', body:[0.052,0.058,0.088], stripe:[0.56,0.48,0.76], accent:[0.92,0.24,0.86], max:131, accel:74, grip:0.98 },
    { name:'紅色', type:'rally', body:[0.95,0.10,0.12], stripe:[1.00,0.84,0.76], accent:[1.00,0.36,0.14], max:127, accel:80, grip:1.02 },
    { name:'綠色', type:'future', body:[0.09,0.67,0.30], stripe:[0.75,1.00,0.83], accent:[0.46,0.30,1.00], max:126, accel:81, grip:1.04 }
  ];

  const WORLD = {
    lapLength: 3000,
    roadWidth: 33,
    segment: 4.6,
    drawAhead: 380,
    drawBehind: 62,
    propRange: 410
  };

  const state = {
    running:false, countingDown:false, countdown:0, goFlash:0, sound:true, camera:0,
    selectedCar:Number(localStorage.getItem('neon-toy-car') || 4),
    lapCount:Number(localStorage.getItem('neon-toy-laps') || 3),
    carTotal:Number(localStorage.getItem('neon-toy-cars') || 6),
    rank:1, currentLap:1, lapProgress:0, raceTime:0, raceFinished:false,
    best:0, distance:0, speed:0, boost:65, shake:0,
    wheelSpin:0, bodyPitch:0, bodyRoll:0, driftAmount:0, nitroPulse:0,
    car:{x:0,y:1,z:6,yaw:0,roll:0,steer:0,lateral:0},
    aiCars:[], gates:[], particles:[], lastTime:0, fpsAccum:0, fpsCount:0, fps:60
  };

  const input = {
    gas:false, brake:false, nitro:false, drift:false, left:false, right:false,
    pointerActive:false, pointerStartX:0, touchSteer:0
  };

  function updateOrientationClass() {
    const w = window.innerWidth || 0;
    const h = window.innerHeight || 0;
    const portrait = h > w && w <= 820;
    document.documentElement.classList.toggle('is-portrait-mobile', portrait);
    document.documentElement.classList.toggle('is-landscape-mobile', !portrait && h <= 560 && w <= 1180);
  }

  function compileShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader) || 'Shader compile failed');
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
    uniform float uGlow;
    varying vec3 vColor;
    varying float vFog;
    void main() {
      vec4 world = uModel * vec4(aPosition, 1.0);
      vec3 normal = normalize((uModel * vec4(aNormal, 0.0)).xyz);
      float diffuse = max(dot(normal, normalize(uLightDir)), 0.0);
      float rim = pow(1.0 - max(normal.z, 0.0), 2.0) * 0.08;
      float light = 0.45 + diffuse * 0.64 + rim;
      vColor = uColor * light + uColor * uGlow;
      vec4 viewPos = uView * world;
      float d = length(viewPos.xyz);
      vFog = clamp((d - 115.0) / 245.0, 0.0, 1.0);
      gl_Position = uProj * viewPos;
    }
  `);

  const fragmentShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    varying vec3 vColor;
    varying float vFog;
    uniform vec3 uFogColor;
    uniform float uAlpha;
    void main() {
      vec3 color = mix(vColor, uFogColor, vFog);
      gl_FragColor = vec4(color, uAlpha);
    }
  `);

  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'Program link failed');
  gl.useProgram(program);

  const loc = {
    aPosition:gl.getAttribLocation(program,'aPosition'),
    aNormal:gl.getAttribLocation(program,'aNormal'),
    uModel:gl.getUniformLocation(program,'uModel'),
    uView:gl.getUniformLocation(program,'uView'),
    uProj:gl.getUniformLocation(program,'uProj'),
    uColor:gl.getUniformLocation(program,'uColor'),
    uLightDir:gl.getUniformLocation(program,'uLightDir'),
    uFogColor:gl.getUniformLocation(program,'uFogColor'),
    uGlow:gl.getUniformLocation(program,'uGlow'),
    uAlpha:gl.getUniformLocation(program,'uAlpha')
  };

  const cubeData = new Float32Array([
    -1,-1,1,0,0,1, 1,-1,1,0,0,1, 1,1,1,0,0,1, -1,-1,1,0,0,1, 1,1,1,0,0,1, -1,1,1,0,0,1,
    1,-1,-1,0,0,-1, -1,-1,-1,0,0,-1, -1,1,-1,0,0,-1, 1,-1,-1,0,0,-1, -1,1,-1,0,0,-1, 1,1,-1,0,0,-1,
    -1,1,1,0,1,0, 1,1,1,0,1,0, 1,1,-1,0,1,0, -1,1,1,0,1,0, 1,1,-1,0,1,0, -1,1,-1,0,1,0,
    -1,-1,-1,0,-1,0, 1,-1,-1,0,-1,0, 1,-1,1,0,-1,0, -1,-1,-1,0,-1,0, 1,-1,1,0,-1,0, -1,-1,1,0,-1,0,
    1,-1,1,1,0,0, 1,-1,-1,1,0,0, 1,1,-1,1,0,0, 1,-1,1,1,0,0, 1,1,-1,1,0,0, 1,1,1,1,0,0,
    -1,-1,-1,-1,0,0, -1,-1,1,-1,0,0, -1,1,1,-1,0,0, -1,-1,-1,-1,0,0, -1,1,1,-1,0,0, -1,1,-1,-1,0,0
  ]);

  const cubeBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, cubeBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, cubeData, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(loc.aPosition);
  gl.vertexAttribPointer(loc.aPosition, 3, gl.FLOAT, false, 24, 0);
  gl.enableVertexAttribArray(loc.aNormal);
  gl.vertexAttribPointer(loc.aNormal, 3, gl.FLOAT, false, 24, 12);

  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(...COLORS.sky, 1);
  gl.uniform3f(loc.uLightDir, -0.38, 0.92, 0.35);
  gl.uniform3f(loc.uFogColor, ...COLORS.fog);

  const proj = new Float32Array(16);
  const view = new Float32Array(16);
  const model = new Float32Array(16);

  function perspective(out, fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2);
    out[0]=f/aspect; out[1]=0; out[2]=0; out[3]=0;
    out[4]=0; out[5]=f; out[6]=0; out[7]=0;
    out[8]=0; out[9]=0; out[10]=(far+near)/(near-far); out[11]=-1;
    out[12]=0; out[13]=0; out[14]=(2*far*near)/(near-far); out[15]=0;
  }

  function lookAt(out, eye, target, up) {
    let zx=eye[0]-target[0], zy=eye[1]-target[1], zz=eye[2]-target[2];
    let len=Math.hypot(zx,zy,zz)||1; zx/=len; zy/=len; zz/=len;
    let xx=up[1]*zz-up[2]*zy, xy=up[2]*zx-up[0]*zz, xz=up[0]*zy-up[1]*zx;
    len=Math.hypot(xx,xy,xz)||1; xx/=len; xy/=len; xz/=len;
    const yx=zy*xz-zz*xy, yy=zz*xx-zx*xz, yz=zx*xy-zy*xx;
    out[0]=xx; out[1]=yx; out[2]=zx; out[3]=0;
    out[4]=xy; out[5]=yy; out[6]=zy; out[7]=0;
    out[8]=xz; out[9]=yz; out[10]=zz; out[11]=0;
    out[12]=-(xx*eye[0]+xy*eye[1]+xz*eye[2]);
    out[13]=-(yx*eye[0]+yy*eye[1]+yz*eye[2]);
    out[14]=-(zx*eye[0]+zy*eye[1]+zz*eye[2]); out[15]=1;
  }

  function composeModel(out, x,y,z, sx,sy,sz, yaw=0, pitch=0, roll=0) {
    const cy=Math.cos(yaw), syaw=Math.sin(yaw);
    const cp=Math.cos(pitch), sp=Math.sin(pitch);
    const cr=Math.cos(roll), sr=Math.sin(roll);
    const r00=cy*cr+syaw*sp*sr, r01=sr*cp, r02=-syaw*cr+cy*sp*sr;
    const r10=-cy*sr+syaw*sp*cr, r11=cr*cp, r12=sr*syaw+cy*sp*cr;
    const r20=syaw*cp, r21=-sp, r22=cy*cp;
    out[0]=r00*sx; out[1]=r01*sx; out[2]=r02*sx; out[3]=0;
    out[4]=r10*sy; out[5]=r11*sy; out[6]=r12*sy; out[7]=0;
    out[8]=r20*sz; out[9]=r21*sz; out[10]=r22*sz; out[11]=0;
    out[12]=x; out[13]=y; out[14]=z; out[15]=1;
  }

  function drawBox(x,y,z,w,h,d,yaw,color,glow=0,alpha=1,pitch=0,roll=0) {
    composeModel(model,x,y,z,w*0.5,h*0.5,d*0.5,yaw,pitch,roll);
    gl.uniformMatrix4fv(loc.uModel,false,model);
    gl.uniform3f(loc.uColor,color[0],color[1],color[2]);
    gl.uniform1f(loc.uGlow,glow);
    gl.uniform1f(loc.uAlpha,alpha);
    gl.drawArrays(gl.TRIANGLES,0,36);
  }

  function drawLocalBox(cx,cy,cz,lx,ly,lz,w,h,d,yaw,color,glow=0,alpha=1,yawOffset=0,pitch=0,roll=0) {
    const cs=Math.cos(yaw), sn=Math.sin(yaw);
    const x=cx+lx*cs+lz*sn;
    const z=cz-lx*sn+lz*cs;
    drawBox(x,cy+ly,z,w,h,d,yaw+yawOffset,color,glow,alpha,pitch,roll);
  }

  function seededNoise(n) {
    const x=Math.sin(n*12.9898+78.233)*43758.5453;
    return x-Math.floor(x);
  }

  function trackT(z) { return mod(z, WORLD.lapLength); }

  function roadCenter(z) {
    const t=trackT(z);
    let c=0;
    c+=plateau(t,80,230,370,520,14);
    c+=plateau(t,430,610,760,920,-19);
    c+=plateau(t,790,1050,1440,1710,40);
    c+=Math.sin(clamp((t-820)/820,0,1)*Math.PI)*9.5;
    c+=plateau(t,1530,1710,1920,2100,-27);
    c+=plateau(t,2010,2140,2260,2390,21);
    c+=plateau(t,2290,2410,2520,2650,-25);
    c+=plateau(t,2550,2680,2780,2890,22);
    c+=plateau(t,2780,2870,2940,3000,-17);
    c+=Math.sin(z*0.008)*0.45;
    return c;
  }

  function roadHeight(z) {
    const t=trackT(z);
    let h=8.0;
    h+=plateau(t,390,670,1110,1320,2.0);
    h+=plateau(t,980,1180,1500,1670,3.5);
    h+=plateau(t,1510,1700,1950,2120,5.4);
    h-=plateau(t,1900,2080,2290,2450,1.8);
    h+=plateau(t,2350,2520,2760,2900,2.2);
    h+=Math.sin(z*0.0085)*0.15+Math.sin(z*0.019)*0.06;
    return h;
  }

  function roadWidthAt(z) {
    const t=trackT(z);
    let w=WORLD.roadWidth;
    w+=plateau(t,720,930,1510,1780,8);
    w-=plateau(t,1520,1710,2050,2190,7);
    w-=plateau(t,2070,2210,2390,2510,4);
    w-=plateau(t,2740,2850,2960,3000,7);
    return clamp(w,22,42);
  }

  function roadTangentYaw(z) {
    const delta=4.5;
    return Math.atan2(roadCenter(z+delta)-roadCenter(z-delta),delta*2);
  }

  function roadBank(z) {
    const curvature=roadTangentYaw(z+14)-roadTangentYaw(z-14);
    return clamp(-curvature*0.88,-0.13,0.13);
  }

  function zoneAt(z) {
    const t=trackT(z);
    if (t<430 || t>2800) return 'pit';
    if (t<980) return 'city';
    if (t<1510) return 'forest';
    if (t<2110) return 'skybridge';
    if (t<2560) return 'industrial';
    return 'neon';
  }

  function formatTime(seconds) {
    if (!seconds || seconds<=0) return '0:00.0';
    const m=Math.floor(seconds/60), s=seconds-m*60;
    return `${m}:${s.toFixed(1).padStart(4,'0')}`;
  }

  function bestKey() { return `neon-toy-v82-best-${state.lapCount}-${state.carTotal}`; }
  function loadBest() { return Number(localStorage.getItem(bestKey())||0); }

  function generateWorld() {
    state.gates=[];
    const total=WORLD.lapLength*state.lapCount;
    for (let z=160; z<total; z+=205) state.gates.push({z,taken:false});
    generateAICars();
  }

  function generateAICars() {
    state.aiCars=[];
    const total=clamp(Math.round(state.carTotal),1,6);
    state.carTotal=total;
    const lanes=[-6.2,6.2,0,-10.5,10.5];
    for (let i=1;i<total;i++) {
      const z=6-Math.ceil(i/2)*4.6;
      state.aiCars.push({
        id:i, skinIndex:(state.selectedCar+i)%CAR_SKINS.length,
        x:roadCenter(z)+lanes[i-1], y:roadHeight(z)+1, z,
        yaw:roadTangentYaw(z), lane:lanes[i-1], speed:0, distance:0,
        skill:0.97+i*0.045+(i===total-1?0.10:0), phase:seededNoise(i+17)*6.28,
        finished:false, wheelSpin:0, roll:0, pitch:0
      });
    }
  }

  function resetGame() {
    state.running=false; state.countingDown=false; state.countdown=0; state.goFlash=0;
    state.rank=1; state.currentLap=1; state.lapProgress=0; state.raceTime=0;
    state.raceFinished=false; state.distance=0; state.speed=0; state.boost=65;
    state.shake=0; state.wheelSpin=0; state.bodyPitch=0; state.bodyRoll=0; state.driftAmount=0;
    state.best=loadBest();
    Object.assign(state.car,{x:roadCenter(6),y:roadHeight(6)+1,z:6,yaw:roadTangentYaw(6),roll:0,steer:0,lateral:0});
    state.particles=[];
    generateWorld();
    if (UI.notice) UI.notice.classList.remove('hidden');
    if (UI.countdown) { UI.countdown.hidden=true; UI.countdown.classList.remove('go'); }
    if (UI.startBtn) UI.startBtn.querySelector('span') ? UI.startBtn.querySelector('span').textContent='啟動比賽' : UI.startBtn.textContent='啟動';
    updateCameraButton();
    updateUI();
  }

  function startCountdown() {
    if (state.running||state.countingDown) return;
    if (state.raceFinished) resetGame();
    state.countingDown=true; state.countdown=3.15;
    if (UI.notice) UI.notice.classList.add('hidden');
    if (UI.countdown) { UI.countdown.hidden=false; UI.countdown.classList.remove('go'); UI.countdown.textContent='3'; }
    chord([260,390],0.08,0.03);
  }

  function finishRace() {
    if (state.raceFinished) return;
    state.raceFinished=true; state.running=false; state.speed=0;
    const prev=loadBest(), isBest=!prev||state.raceTime<prev;
    if (isBest) { state.best=state.raceTime; localStorage.setItem(bestKey(),String(state.raceTime)); }
    if (UI.notice) UI.notice.classList.remove('hidden');
    if (UI.noticeText) UI.noticeText.textContent=`完成 ${state.lapCount} 圈！成績 ${formatTime(state.raceTime)}，名次 ${state.rank}/${state.carTotal}${isBest?'，刷新最佳成績！':`，最佳 ${formatTime(prev)}。`}`;
    chord(isBest?[620,820,1040]:[480,620,760],0.17,0.045);
  }

  function updateCountdown(dt) {
    if (!state.countingDown) return;
    const before=Math.ceil(state.countdown);
    state.countdown-=dt;
    const now=Math.ceil(state.countdown);
    if (UI.countdown && now!==before && now>0) { UI.countdown.textContent=String(now); beep(300+now*50,0.06,'square',0.035); }
    if (state.countdown<=0) {
      state.countingDown=false; state.running=true; state.goFlash=0.7;
      if (UI.countdown) { UI.countdown.textContent='GO!'; UI.countdown.classList.add('go'); }
      chord([520,760,980],0.12,0.045);
    }
  }

  function spawnParticle(x,y,z,color,options={}) {
    state.particles.push({
      x,y,z, vx:options.vx||0, vy:options.vy||0, vz:options.vz||0,
      life:options.life||0.6, size:options.size||0.25, color,
      glow:options.glow||0, alpha:options.alpha??1
    });
  }

  function spawnDriftEffects() {
    const car=state.car, cs=Math.cos(car.yaw), sn=Math.sin(car.yaw);
    for (const side of [-1,1]) {
      spawnParticle(car.x+side*1.2*cs-1.8*sn,car.y-0.55,car.z-side*1.2*sn-1.8*cs,COLORS.smoke,{
        vx:side*0.6*cs-sn*1.8,vy:0.5,vz:-side*0.6*sn-cs*1.8,life:0.65,size:0.35,alpha:0.65
      });
      if (Math.random()<0.22) spawnParticle(car.x+side*1.45*cs-1.5*sn,car.y-0.30,car.z-side*1.45*sn-1.5*cs,COLORS.gold,{
        vx:(Math.random()-0.5)*2,vy:1.3,vz:-2-Math.random()*2,life:0.28,size:0.12,glow:0.9
      });
    }
  }

  function spawnNitroEffects() {
    const car=state.car, cs=Math.cos(car.yaw), sn=Math.sin(car.yaw);
    for (const side of [-0.62,0.62]) {
      spawnParticle(car.x+side*cs-2.9*sn,car.y-0.12,car.z-side*sn-2.9*cs,side<0?COLORS.cyan:COLORS.purpleSoft,{
        vx:-sn*(4+Math.random()*4),vy:(Math.random()-0.5)*0.4,vz:-cs*(4+Math.random()*4),
        life:0.35,size:0.22+Math.random()*0.15,glow:1,alpha:0.9
      });
    }
  }

  function updatePlayer(dt) {
    if (!state.running) {
      state.speed*=Math.pow(0.88,dt*60);
      state.wheelSpin+=state.speed*dt*0.14;
      return;
    }

    state.raceTime+=dt;
    const skin=CAR_SKINS[state.selectedCar];
    const car=state.car;
    const keyboard=(input.right?1:0)-(input.left?1:0);
    const targetSteer=clamp(keyboard+input.touchSteer,-1,1);
    car.steer=lerp(car.steer,targetSteer,1-Math.pow(0.0008,dt));

    const nitroActive=input.nitro&&input.gas&&state.boost>0.5;
    const maxSpeed=skin.max+(nitroActive?20:state.boost*0.025);
    if (input.gas) state.speed+=skin.accel*dt;
    else state.speed-=16*dt;
    if (input.brake&&!input.drift) state.speed-=78*dt;
    if (nitroActive) { state.speed+=38*dt; state.boost-=24*dt; state.nitroPulse+=dt*18; spawnNitroEffects(); }
    else { state.boost-=dt*(input.gas?2.2:0.4); state.nitroPulse*=Math.pow(0.05,dt); }

    const slope=roadHeight(car.z+12)-roadHeight(car.z-8);
    state.speed+=clamp(-slope*4.8,-9,8)*dt;
    state.speed=clamp(state.speed,0,maxSpeed);

    const drift=(input.drift||input.brake)&&Math.abs(car.steer)>0.34&&state.speed>38;
    state.driftAmount=lerp(state.driftAmount,drift?1:0,1-Math.pow(drift?0.0008:0.015,dt));
    const lateralPower=(5.8+state.speed*0.071)*skin.grip*(drift?1.30:1);
    car.lateral+=car.steer*lateralPower*dt;
    car.lateral*=Math.pow(drift?0.945:0.70,dt*60);
    car.x+=car.lateral*dt;
    car.z+=state.speed*dt*0.78;
    state.distance=Math.max(0,car.z-6);

    const curveYaw=roadTangentYaw(car.z+10);
    car.yaw=lerp(car.yaw,curveYaw+car.steer*(drift?0.42:0.22),1-Math.pow(0.004,dt));
    const bank=roadBank(car.z);
    state.bodyRoll=lerp(state.bodyRoll,bank-car.steer*(drift?0.16:0.075),1-Math.pow(0.010,dt));
    const pitchTarget=(input.gas?0.035:0)+(input.brake?-0.075:0)+(nitroActive?0.05:0);
    state.bodyPitch=lerp(state.bodyPitch,pitchTarget,1-Math.pow(0.018,dt));
    state.wheelSpin=mod(state.wheelSpin+state.speed*dt*0.34,Math.PI*2);

    const center=roadCenter(car.z), limit=roadWidthAt(car.z)*0.5-1.7;
    const offset=car.x-center;
    if (Math.abs(offset)>limit) {
      car.x=center+Math.sign(offset)*limit;
      car.lateral*=-0.08; state.shake=Math.max(state.shake,0.16);
      if (navigator.vibrate) navigator.vibrate(8);
    }

    car.y=roadHeight(car.z)+1.0;
    state.currentLap=clamp(Math.floor(state.distance/WORLD.lapLength)+1,1,state.lapCount);
    state.lapProgress=clamp((state.distance%WORLD.lapLength)/WORLD.lapLength,0,1);
    if (drift) spawnDriftEffects();
    if (state.distance>=WORLD.lapLength*state.lapCount) finishRace();
  }

  function updateAICars(dt) {
    const totalDistance=WORLD.lapLength*state.lapCount;
    for (const ai of state.aiCars) {
      if (ai.finished) continue;
      if (!state.running) { ai.speed*=Math.pow(0.82,dt*60); continue; }
      const curve=Math.abs(roadTangentYaw(ai.z+55)-roadTangentYaw(ai.z-8));
      const narrow=roadWidthAt(ai.z+40)<28?10:0;
      const target=clamp((116+ai.skill*18)-curve*82-narrow+Math.sin(state.raceTime*1.1+ai.phase)*1.8,66,164);
      ai.speed=lerp(ai.speed,target,1-Math.pow(0.007,dt));
      ai.z+=ai.speed*dt*0.77;
      ai.distance=Math.max(0,ai.z-6);
      const dir=Math.sign(roadCenter(ai.z+45)-roadCenter(ai.z-5))||1;
      const desiredLane=clamp(-dir*(5.2+ai.skill*1.4)+Math.sin(ai.z*0.017+ai.phase)*0.35,-roadWidthAt(ai.z)*0.38,roadWidthAt(ai.z)*0.38);
      const desiredX=roadCenter(ai.z)+desiredLane;
      ai.x=lerp(ai.x,desiredX,1-Math.pow(0.004,dt));
      ai.y=roadHeight(ai.z)+1;
      ai.yaw=lerp(ai.yaw,roadTangentYaw(ai.z+10)+(desiredX-ai.x)*0.025,1-Math.pow(0.006,dt));
      ai.roll=lerp(ai.roll,roadBank(ai.z),1-Math.pow(0.015,dt));
      ai.pitch=lerp(ai.pitch,clamp((roadHeight(ai.z+6)-roadHeight(ai.z-6))*0.018,-0.08,0.08),1-Math.pow(0.02,dt));
      ai.wheelSpin=mod(ai.wheelSpin+ai.speed*dt*0.34,Math.PI*2);
      if (ai.distance>=totalDistance) { ai.finished=true; ai.distance=totalDistance; }
    }
  }

  function updateRank() {
    let faster=0;
    for (const ai of state.aiCars) if (ai.distance>state.distance+0.3) faster++;
    state.rank=clamp(1+faster,1,state.carTotal);
  }

  function updateGates() {
    for (const gate of state.gates) {
      const dz=gate.z-state.car.z;
      if (!gate.taken&&Math.abs(dz)<3&&Math.abs(state.car.x-roadCenter(gate.z))<roadWidthAt(gate.z)*0.42) {
        gate.taken=true; state.boost=clamp(state.boost+32,0,100);
        for (let i=0;i<18;i++) spawnParticle(state.car.x+(Math.random()-0.5)*5,state.car.y+Math.random()*2,state.car.z+(Math.random()-0.5)*3,i%2?COLORS.gold:COLORS.purpleSoft,{
          vx:(Math.random()-0.5)*4,vy:1+Math.random()*2,vz:-2-Math.random()*3,life:0.6+Math.random()*0.35,size:0.13+Math.random()*0.16,glow:0.9
        });
        chord([520,760,980],0.10,0.035);
      }
    }
  }

  function updateParticles(dt) {
    for (let i=state.particles.length-1;i>=0;i--) {
      const p=state.particles[i];
      p.life-=dt; p.x+=p.vx*dt; p.y+=p.vy*dt; p.z+=p.vz*dt; p.vy-=1.6*dt;
      if (p.life<=0) state.particles.splice(i,1);
    }
    if (state.particles.length>150) state.particles.splice(0,state.particles.length-150);
  }

  function resize() {
    const dpr=Math.min(window.devicePixelRatio||1,1.65);
    const width=Math.max(1,Math.floor(canvas.clientWidth*dpr));
    const height=Math.max(1,Math.floor(canvas.clientHeight*dpr));
    if (canvas.width!==width||canvas.height!==height) {
      canvas.width=width; canvas.height=height; gl.viewport(0,0,width,height);
    }
    perspective(proj,Math.PI/3.12,width/height,0.12,760);
    gl.uniformMatrix4fv(loc.uProj,false,proj);
  }

  function setCamera() {
    const car=state.car;
    const aheadZ=car.z+(state.camera===0?32:24);
    const aheadX=roadCenter(aheadZ), h=roadHeight(car.z), aheadH=roadHeight(aheadZ);
    const shakeX=(seededNoise(state.raceTime*100)-0.5)*state.shake;
    const shakeY=(seededNoise(state.raceTime*100+4)-0.5)*state.shake;
    const speedLift=state.speed*0.0065;
    const lateralLook=car.steer*1.3+car.lateral*0.10;
    let eye,target;
    if (state.camera===0) {
      eye=[car.x+shakeX-lateralLook*0.20,h+8.15+speedLift+shakeY,car.z-20.2];
      target=[lerp(aheadX,car.x,0.71)+lateralLook,aheadH+1.48,aheadZ];
    } else {
      eye=[car.x+shakeX,h+5.65+state.speed*0.0045+shakeY,car.z-12.7];
      target=[lerp(aheadX,car.x,0.87)+lateralLook*0.65,aheadH+1.25,aheadZ];
    }
    lookAt(view,eye,target,[0,1,0]);
    gl.uniformMatrix4fv(loc.uView,false,view);
  }

  function drawBackdrop() {
    const zBase=state.car.z+165, center=roadCenter(state.car.z+130);
    drawBox(center,-6.5,state.car.z+125,290,1.2,560,0,COLORS.void);
    const zone=zoneAt(state.car.z+140);
    for (let i=-8;i<=8;i++) {
      const noise=seededNoise(i+Math.floor(state.car.z/170));
      const x=center+i*19+(noise-0.5)*8;
      const height=(zone==='city'||zone==='neon'?10:5)+noise*(zone==='city'||zone==='neon'?27:13);
      const z=zBase+seededNoise(i+31)*95;
      const color=zone==='industrial'?COLORS.industrial:COLORS.building;
      drawBox(x,-2+height*0.5,z,9+noise*7,height,9+noise*7,0,color);
      if (zone==='city'||zone==='neon'||zone==='industrial') {
        for (let w=0;w<3;w++) if (seededNoise(i*7+w)>0.3)
          drawBox(x+(w-1)*2.3,height*0.22,z-5.0,1.25,1.0,0.14,0,w%2?COLORS.window:COLORS.gold,0.38);
      }
    }
    drawBox(center-62,40,zBase+72,8,8,8,0,[0.82,0.64,1.0],0.42);
    drawBox(center-62,40,zBase+72,14,1.0,14,0,COLORS.purpleSoft,0.72,0.20);
  }

  function drawFinishLine(cx,y,z,yaw,width) {
    const squares=14, sw=width/squares;
    for (let i=0;i<squares;i++) {
      const lx=-width*0.5+sw*(i+0.5);
      drawLocalBox(cx,y,z,lx,0.18,-1.2,sw*0.93,0.09,1.1,yaw,i%2?COLORS.white:COLORS.black);
      drawLocalBox(cx,y,z,lx,0.18,1.2,sw*0.93,0.09,1.1,yaw,i%2?COLORS.black:COLORS.white);
    }
    drawLocalBox(cx,y,z,-width*0.52,3,0,0.55,6,0.55,yaw,COLORS.railTop);
    drawLocalBox(cx,y,z,width*0.52,3,0,0.55,6,0.55,yaw,COLORS.railTop);
    drawLocalBox(cx,y,z,0,5.7,0,width*1.05,0.58,0.72,yaw,COLORS.black);
    for (let i=-4;i<=4;i++) drawLocalBox(cx,y,z,i*2.25,5.72,-0.39,1.55,0.25,0.08,yaw,i%2?COLORS.white:COLORS.red,0.35);
  }

  function drawTrackArrow(cx,y,z,yaw,dir,width) {
    const x=dir*width*0.20;
    drawLocalBox(cx,y,z,x,0.20,0.1,0.34,0.08,2.5,yaw,COLORS.gold,0.5,1,dir*0.55);
    drawLocalBox(cx,y,z,x,0.20,0.1,0.34,0.08,2.5,yaw,COLORS.gold,0.5,1,-dir*0.55);
  }

  function drawTrack() {
    const seg=WORLD.segment;
    const start=Math.floor((state.car.z-WORLD.drawBehind)/seg)*seg;
    const end=state.car.z+WORLD.drawAhead;
    for (let z=start;z<end;z+=seg) {
      const mid=z+seg*0.5, cx=roadCenter(mid), y=roadHeight(mid), yaw=roadTangentYaw(mid);
      const width=roadWidthAt(mid), stripe=Math.floor(mid/(seg*2))%2===0, t=trackT(mid), bank=roadBank(mid);
      drawBox(cx,y-0.72,mid,width+5.8,0.72,seg*1.20,yaw,stripe?COLORS.deck:COLORS.deckDark,0,1,0,bank);
      drawBox(cx,y-0.08,mid,width,0.20,seg*1.20,yaw,stripe?COLORS.asphalt:COLORS.asphaltAlt,0,1,0,bank);

      if (Math.floor(mid/12)%2===0) {
        drawLocalBox(cx,y,mid,-width/6,0.12,0,0.20,0.06,seg*0.57,yaw,COLORS.lane,0,1,0,0,bank);
        drawLocalBox(cx,y,mid,width/6,0.12,0,0.20,0.06,seg*0.57,yaw,COLORS.lane,0,1,0,0,bank);
      }

      drawLocalBox(cx,y,mid,-width*0.5+0.30,0.13,0,0.30,0.07,seg*1.12,yaw,COLORS.white,0,1,0,0,bank);
      drawLocalBox(cx,y,mid,width*0.5-0.30,0.13,0,0.30,0.07,seg*1.12,yaw,COLORS.white,0,1,0,0,bank);
      const curbA=Math.floor(mid/6.5)%2?COLORS.red:COLORS.white;
      const curbB=Math.floor(mid/6.5)%2?COLORS.white:COLORS.red;
      drawLocalBox(cx,y,mid,-width*0.5-0.48,0.18,0,0.70,0.16,seg*1.08,yaw,curbA,curbA===COLORS.red?0.24:0,1,0,0,bank);
      drawLocalBox(cx,y,mid,width*0.5+0.48,0.18,0,0.70,0.16,seg*1.08,yaw,curbB,curbB===COLORS.red?0.24:0,1,0,0,bank);

      drawLocalBox(cx,y,mid,-width*0.5-1.35,1.05,0,0.36,1.55,seg*1.12,yaw,COLORS.rail,0,1,0,0,bank);
      drawLocalBox(cx,y,mid,width*0.5+1.35,1.05,0,0.36,1.55,seg*1.12,yaw,COLORS.rail,0,1,0,0,bank);
      const pulse=0.54+Math.sin(mid*0.06+state.raceTime*2)*0.12;
      drawLocalBox(cx,y,mid,-width*0.5-1.15,1.36,0,0.18,0.23,seg*1.12,yaw,COLORS.purpleSoft,pulse,1,0,0,bank);
      drawLocalBox(cx,y,mid,width*0.5+1.15,1.36,0,0.18,0.23,seg*1.12,yaw,COLORS.red,pulse*0.78,1,0,0,bank);

      if (Math.floor(mid/34)%2===0) {
        const pillarH=Math.max(5,y+5.4), pillarY=(y-7.5)*0.5-2.3;
        drawLocalBox(cx,-2.8,mid,-width*0.34,pillarY,0,1.05,pillarH,1.05,yaw,COLORS.deckDark);
        drawLocalBox(cx,-2.8,mid,width*0.34,pillarY,0,1.05,pillarH,1.05,yaw,COLORS.deckDark);
      }

      const lapLine=Math.round(mid/WORLD.lapLength)*WORLD.lapLength;
      if (Math.abs(mid-lapLine)<seg*0.55) drawFinishLine(cx,y,mid,yaw,width);
      if ((t>90&&t<230)||(t>760&&t<980)||(t>1980&&t<2160)||(t>2470&&t<2640)) drawTrackArrow(cx,y,mid,yaw,1,width);
      else if ((t>420&&t<620)||(t>1510&&t<1770)||(t>2240&&t<2430)||(t>2710&&t<2920)) drawTrackArrow(cx,y,mid,yaw,-1,width);
    }
  }

  function drawLamp(x,y,z,side,yaw,scale=1,color=COLORS.purpleSoft) {
    drawBox(x,y+2.8*scale,z,0.28*scale,5.6*scale,0.28*scale,yaw,COLORS.railTop);
    drawBox(x+side*0.9*scale,y+5.45*scale,z,1.9*scale,0.22*scale,0.24*scale,yaw,COLORS.railTop);
    drawBox(x+side*1.75*scale,y+5.28*scale,z,0.48*scale,0.32*scale,0.5*scale,yaw,color,0.90);
  }

  function drawCone(x,y,z,yaw,scale=1) {
    drawBox(x,y+0.08*scale,z,0.75*scale,0.16*scale,0.75*scale,yaw,COLORS.white);
    drawBox(x,y+0.42*scale,z,0.44*scale,0.68*scale,0.44*scale,yaw,COLORS.orange);
    drawBox(x,y+0.52*scale,z,0.50*scale,0.14*scale,0.50*scale,yaw,COLORS.white);
  }

  function drawTree(x,y,z,scale=1) {
    drawBox(x,y+0.75*scale,z,0.55*scale,1.5*scale,0.55*scale,0,COLORS.trunk);
    drawBox(x,y+2.0*scale,z,2.3*scale,1.7*scale,2.3*scale,0.35,COLORS.tree,0,1,0,0.18);
    drawBox(x,y+3.15*scale,z,1.65*scale,1.45*scale,1.65*scale,-0.25,[0.065,0.080,0.110],0,1,0,-0.12);
  }

  function drawBillboard(x,y,z,side,yaw,scale=1,accent=COLORS.purple) {
    drawBox(x,y+2.0*scale,z,0.38*scale,4.0*scale,0.38*scale,yaw,COLORS.rail);
    drawBox(x,y+4.3*scale,z,5.5*scale,2.5*scale,0.34*scale,yaw,COLORS.deckDark);
    drawBox(x+side*0.05,y+4.3*scale,z-0.20,4.7*scale,1.8*scale,0.10*scale,yaw,accent,0.48);
    for (const lx of [-1.25,0,1.25]) drawLocalBox(x,y+4.3*scale,z-0.25,lx*scale,0,0,0.35*scale,0.95*scale,0.08,yaw,COLORS.gold,0.5,1,0.65);
  }

  function drawPitArea(cx,y,z,side,yaw) {
    const x=cx+side*(roadWidthAt(z)*0.5+15);
    drawBox(x,y+1.15,z,17,2.3,8.5,yaw,COLORS.building);
    drawBox(x,y+2.7,z-0.6,18,0.55,9.2,yaw,COLORS.purple,0.20);
    for (let i=-3;i<=3;i++) {
      drawLocalBox(x,y,z,i*2.25,1.0,-4.38,1.6,1.3,0.18,yaw,i%2?COLORS.red:COLORS.window,0.4);
      drawLocalBox(x,y,z,i*2.25,0.55,3.6,1.2,1.1,1.2,yaw,COLORS.black);
    }
  }

  function drawCargo(x,y,z,yaw,scale=1) {
    drawBox(x,y+0.85*scale,z,3.1*scale,1.7*scale,2.1*scale,yaw,COLORS.industrial);
    for (let i=-1;i<=1;i++) drawLocalBox(x,y,z,i*0.8*scale,0.88*scale,-1.07*scale,0.12*scale,1.35*scale,0.08,yaw,i===0?COLORS.orange:COLORS.rail);
  }

  function drawProps() {
    const start=Math.floor((state.car.z-45)/26)*26, end=state.car.z+WORLD.propRange;
    for (let z=start;z<end;z+=26) {
      const index=Math.floor(z/26), noise=seededNoise(index), side=noise>0.5?1:-1;
      const width=roadWidthAt(z), cx=roadCenter(z), y=roadHeight(z), yaw=roadTangentYaw(z);
      const zone=zoneAt(z), offset=width*0.5+5.8+seededNoise(index+20)*8, x=cx+side*offset;

      if (index%2===0) drawLamp(x,y,z,-side,yaw,0.82+seededNoise(index+3)*0.2,zone==='industrial'?COLORS.orange:COLORS.purpleSoft);
      if (zone==='forest') {
        drawTree(x+side*4,y-0.2,z+2,0.78+seededNoise(index+5)*0.65);
        if (index%3===0) drawTree(x+side*9,y-0.5,z-5,0.65+seededNoise(index+8)*0.5);
      } else if (zone==='industrial') {
        if (index%3!==0) drawCargo(x+side*4,y,z,yaw,0.8+seededNoise(index+7)*0.3);
        if (index%7===2) drawBillboard(cx+side*(width*0.5+12),y,z,side,yaw,0.9,COLORS.orange);
      } else if (zone==='pit') {
        if (index%5===1) for (let c=0;c<3;c++) drawCone(cx+side*(width*0.5-2.6-c*1.15),y+0.08,z+c*2.0,yaw,0.72);
        if (Math.abs(trackT(z)-335)<14) drawPitArea(cx,y,z,side,yaw);
      } else {
        if (index%7===2) drawBillboard(cx+side*(width*0.5+12),y,z,side,yaw,0.86+seededNoise(index+9)*0.18,zone==='neon'?COLORS.red:COLORS.purple);
        else if (index%5===1) drawTree(x+side*5,y-0.2,z+2,0.70+seededNoise(index+5)*0.45);
      }
    }
  }

  function drawGate(gate) {
    const z=gate.z;
    if (z<state.car.z-50||z>state.car.z+WORLD.drawAhead) return;
    const cx=roadCenter(z), y=roadHeight(z), yaw=roadTangentYaw(z), width=roadWidthAt(z);
    const active=!gate.taken, color=active?COLORS.gold:COLORS.rail, glow=active?0.68:0.05;
    drawLocalBox(cx,y,z,-width*0.42,2,0,0.42,4,0.42,yaw,color,glow);
    drawLocalBox(cx,y,z,width*0.42,2,0,0.42,4,0.42,yaw,color,glow);
    drawLocalBox(cx,y,z,0,3.95,0,width*0.84,0.42,0.42,yaw,color,glow);
    if (active) for (let i=-3;i<=3;i++)
      drawLocalBox(cx,y,z,i*width*0.10,3.92,-0.25,width*0.055,0.16,0.10,yaw,i%2?COLORS.purpleSoft:COLORS.gold,0.95);
  }

  function drawWheel(cx,cy,cz,lx,lz,yaw,spin=0,steer=0,bodyPitch=0,bodyRoll=0) {
    drawLocalBox(cx,cy,cz,lx,-0.50,lz,0.62,0.90,1.10,yaw,COLORS.black,0,1,steer,spin,bodyRoll);
    drawLocalBox(cx,cy,cz,lx,-0.50,lz,0.66,0.38,0.58,yaw,COLORS.railTop,0.06,1,steer,spin,bodyRoll);
  }

  function drawToyCar(car,skin,player=false) {
    const x=car.x,y=car.y,z=car.z,yaw=car.yaw;
    const steer=player?car.steer*0.28:0;
    const pitch=player?state.bodyPitch:(car.pitch||0);
    const roll=player?state.bodyRoll:(car.roll||0);
    const spin=player?state.wheelSpin:(car.wheelSpin||0);
    const type=skin.type;
    const length=type==='compact'?4.8:type==='sport'?5.5:type==='muscle'?5.35:type==='future'?5.45:5.2;
    const width=type==='sport'?3.55:type==='compact'?3.25:3.5;
    const roofH=type==='sport'?0.92:type==='rally'?1.32:type==='future'?0.95:1.15;
    const hoodH=type==='muscle'?0.78:0.58;

    drawLocalBox(x,y,z,0,-0.72,0,width+0.4,0.12,length+0.5,yaw,COLORS.shadow,0,0.45,0,pitch,roll);
    drawLocalBox(x,y,z,0,0,0,width,0.92,length,yaw,skin.body,0,1,0,pitch,roll);
    drawLocalBox(x,y,z,0,0.55,0.78,width*0.91,hoodH,2.35,yaw,skin.body,0,1,0,pitch,roll);
    drawLocalBox(x,y,z,0,1.18,-0.18,width*0.76,roofH,2.25,yaw,skin.body,0,1,0,pitch,roll);
    drawLocalBox(x,y,z,0,1.25,-0.42,width*0.65,roofH*0.68,1.52,yaw,COLORS.glass,0.04,1,0,pitch,roll);
    drawLocalBox(x,y,z,0,1.38,0.55,width*0.61,roofH*0.48,0.62,yaw,COLORS.glass,0.04,1,0,pitch,roll);

    if (type==='rally') {
      drawLocalBox(x,y,z,0,2.02,-0.15,1.9,0.18,1.25,yaw,COLORS.black,0,1,0,pitch,roll);
      for (const lx of [-0.62,-0.2,0.2,0.62]) drawLocalBox(x,y,z,lx,2.16,-0.65,0.22,0.22,0.22,yaw,COLORS.gold,0.55,1,0,pitch,roll);
    } else if (type==='sport') {
      drawLocalBox(x,y,z,0,0.55,-2.42,3.3,0.16,0.55,yaw,skin.accent,0.30,1,0,pitch,roll);
    } else if (type==='future') {
      drawLocalBox(x,y,z,-1.5,0.45,0,0.22,0.40,3.8,yaw,skin.accent,0.28,1,0,pitch,roll);
      drawLocalBox(x,y,z,1.5,0.45,0,0.22,0.40,3.8,yaw,skin.accent,0.28,1,0,pitch,roll);
    }

    drawLocalBox(x,y,z,0,0.64,1.55,0.40,0.09,2.10,yaw,skin.stripe,0.20,1,0,pitch,roll);
    drawLocalBox(x,y,z,0,1.75,-0.20,0.37,0.11,2.25,yaw,skin.stripe,0.20,1,0,pitch,roll);
    drawLocalBox(x,y,z,0,0.18,-length*0.5,3.62,0.42,0.38,yaw,COLORS.black,0,1,0,pitch,roll);
    drawLocalBox(x,y,z,0,0.22,length*0.5,3.48,0.38,0.34,yaw,skin.accent,0.18,1,0,pitch,roll);

    drawLocalBox(x,y,z,-1.10,0.35,-length*0.51,0.60,0.44,0.15,yaw,COLORS.red,0.82,1,0,pitch,roll);
    drawLocalBox(x,y,z,1.10,0.35,-length*0.51,0.60,0.44,0.15,yaw,COLORS.red,0.82,1,0,pitch,roll);
    drawLocalBox(x,y,z,-1.10,0.44,length*0.51,0.64,0.35,0.12,yaw,COLORS.gold,0.55,1,0,pitch,roll);
    drawLocalBox(x,y,z,1.10,0.44,length*0.51,0.64,0.35,0.12,yaw,COLORS.gold,0.55,1,0,pitch,roll);

    const wheelX=width*0.47, wheelZ=length*0.31;
    drawWheel(x,y,z,-wheelX,-wheelZ,yaw,spin,steer,pitch,roll);
    drawWheel(x,y,z,wheelX,-wheelZ,yaw,spin,steer,pitch,roll);
    drawWheel(x,y,z,-wheelX,wheelZ,yaw,spin,0,pitch,roll);
    drawWheel(x,y,z,wheelX,wheelZ,yaw,spin,0,pitch,roll);

    if (player&&input.nitro&&input.gas&&state.boost>0) {
      const flame=1.05+Math.sin(state.nitroPulse)*0.35;
      drawLocalBox(x,y,z,-0.62,-0.05,-length*0.58,0.30,0.30,1.45*flame,yaw,COLORS.cyan,1.05,0.92,0,pitch,roll);
      drawLocalBox(x,y,z,0.62,-0.05,-length*0.58,0.30,0.30,1.45*flame,yaw,COLORS.purpleSoft,1.05,0.92,0,pitch,roll);
    }
    if (player) drawLocalBox(x,y,z,0,2.18,-0.25,width*0.82,0.10,2.65,yaw,skin.accent,0.58,0.20,0,pitch,roll);
  }

  function drawAICars() {
    for (const ai of state.aiCars) if (ai.z>=state.car.z-40&&ai.z<=state.car.z+WORLD.drawAhead)
      drawToyCar(ai,CAR_SKINS[ai.skinIndex],false);
  }

  function drawParticles() {
    gl.depthMask(false);
    for (const p of state.particles) {
      const alpha=clamp(p.life*2.2,0,1)*p.alpha;
      drawBox(p.x,p.y,p.z,p.size,p.size,p.size*1.7,0,p.color,p.glow,alpha);
    }
    gl.depthMask(true);
  }

  function render() {
    resize();
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    setCamera(); drawBackdrop(); drawTrack(); drawProps();
    for (const gate of state.gates) drawGate(gate);
    drawAICars(); drawToyCar(state.car,CAR_SKINS[state.selectedCar],true); drawParticles();
  }

  function updateUI() {
    const kmh=Math.round(state.speed*2.54);
    if (UI.speedText) UI.speedText.textContent=String(kmh);
    if (UI.rankText) UI.rankText.textContent=`${state.rank}/${state.carTotal}`;
    if (UI.lapText) UI.lapText.textContent=`${state.currentLap}/${state.lapCount}`;
    if (UI.progressText) UI.progressText.textContent=`${Math.round(state.lapProgress*100)}%`;
    if (UI.timeText) UI.timeText.textContent=formatTime(state.raceTime);
    if (UI.bestText) UI.bestText.textContent=state.best?formatTime(state.best):'--';
    if (UI.boostBar) UI.boostBar.style.width=`${state.boost}%`;
    if (UI.fpsText) UI.fpsText.textContent=`${state.fps} FPS`;
  }

  function cameraLabel() { return state.camera===0?'追尾':'近距'; }
  function updateCameraButton() { if (UI.cameraBtn) UI.cameraBtn.textContent=`視角：${cameraLabel()}`; }

  let audioCtx=null, masterGain=null, engineOsc=null, engineGain=null;
  function ensureAudio() {
    try {
      audioCtx ||= new (window.AudioContext||window.webkitAudioContext)();
      if (audioCtx.state==='suspended') audioCtx.resume();
      if (!masterGain) { masterGain=audioCtx.createGain(); masterGain.gain.value=0.25; masterGain.connect(audioCtx.destination); }
      return true;
    } catch (_) { return false; }
  }
  function tone(freq=220,dur=0.05,type='sine',gain=0.04,delay=0) {
    if (!state.sound||!ensureAudio()) return;
    const t=audioCtx.currentTime+delay, osc=audioCtx.createOscillator(), g=audioCtx.createGain();
    osc.type=type; osc.frequency.setValueAtTime(freq,t);
    g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002,gain),t+0.01);
    g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    osc.connect(g).connect(masterGain); osc.start(t); osc.stop(t+dur+0.03);
  }
  function beep(freq,dur,type,gain) { tone(freq,dur,type,gain); }
  function chord(freqs,dur=0.12,gain=0.035) { freqs.forEach((f,i)=>tone(f,dur+i*0.015,i?'triangle':'square',gain*(i?0.65:1),i*0.018)); }
  function updateAudio() {
    if (!state.sound||!ensureAudio()) return;
    if (!engineOsc) {
      engineGain=audioCtx.createGain(); engineGain.gain.value=0.0001; engineGain.connect(masterGain);
      engineOsc=audioCtx.createOscillator(); engineOsc.type='sawtooth'; engineOsc.connect(engineGain); engineOsc.start();
    }
    const now=audioCtx.currentTime, speed01=clamp(state.speed/145,0,1);
    engineGain.gain.setTargetAtTime((state.running?0.015:0.0001)+speed01*0.038+(input.nitro?0.012:0),now,0.05);
    engineOsc.frequency.setTargetAtTime(55+speed01*135+(input.gas?10:0),now,0.04);
  }
  function stopAudio() {
    try { engineOsc?.stop(); } catch (_) {}
    engineOsc=null; engineGain=null;
  }

  function update(dt) {
    updateCountdown(dt);
    if (state.goFlash>0) {
      state.goFlash-=dt;
      if (state.goFlash<=0&&UI.countdown) UI.countdown.hidden=true;
    }
    updatePlayer(dt); updateAICars(dt);
    if (state.running) { updateRank(); updateGates(); }
    updateParticles(dt); state.shake*=Math.pow(0.025,dt);
    updateAudio(); updateUI();
  }

  function frame(time) {
    const now=time*0.001;
    const dt=clamp(now-(state.lastTime||now),0,0.034);
    state.lastTime=now;
    update(dt); render();
    state.fpsAccum+=dt; state.fpsCount++;
    if (state.fpsAccum>=0.5) {
      state.fps=Math.round(state.fpsCount/state.fpsAccum);
      state.fpsAccum=0; state.fpsCount=0;
    }
    requestAnimationFrame(frame);
  }

  function bindHold(btn,key) {
    if (!btn) return;
    const down=(e)=>{ e.preventDefault(); input[key]=true; btn.classList.add('is-down'); btn.setPointerCapture?.(e.pointerId); ensureAudio(); };
    const up=(e)=>{ e.preventDefault(); input[key]=false; btn.classList.remove('is-down'); };
    btn.addEventListener('pointerdown',down,{passive:false});
    btn.addEventListener('pointerup',up,{passive:false});
    btn.addEventListener('pointercancel',up,{passive:false});
    btn.addEventListener('pointerleave',(e)=>{ if(btn.classList.contains('is-down')) up(e); },{passive:false});
  }

  function bindInput() {
    bindHold(UI.gasBtn,'gas'); bindHold(UI.brakeBtn,'brake');
    bindHold(UI.nitroBtn,'nitro'); bindHold(UI.driftBtn,'drift');

    UI.startBtn?.addEventListener('click',startCountdown);
    UI.resetBtn?.addEventListener('click',resetGame);
    UI.cameraBtn?.addEventListener('click',()=>{ state.camera=(state.camera+1)%2; updateCameraButton(); beep(360,0.04,'triangle',0.024); });
    UI.soundBtn?.addEventListener('click',()=>{
      state.sound=!state.sound;
      UI.soundBtn.textContent=`音效：${state.sound?'開':'關'}`;
      if (!state.sound) stopAudio(); else chord([440,660],0.08,0.03);
    });

    UI.carChoices.forEach((btn)=>{
      const index=Number(btn.dataset.car);
      btn.classList.toggle('active',index===state.selectedCar);
      btn.addEventListener('click',()=>{
        state.selectedCar=index; localStorage.setItem('neon-toy-car',String(index));
        UI.carChoices.forEach((b)=>b.classList.toggle('active',b===btn));
        resetGame(); beep(300+index*70,0.04,'triangle',0.03);
      });
    });
    UI.lapChoices.forEach((btn)=>{
      const laps=Number(btn.dataset.laps);
      btn.classList.toggle('active',laps===state.lapCount);
      btn.addEventListener('click',()=>{
        state.lapCount=laps; localStorage.setItem('neon-toy-laps',String(laps));
        UI.lapChoices.forEach((b)=>b.classList.toggle('active',b===btn));
        resetGame();
      });
    });
    UI.raceChoices.forEach((btn)=>{
      const cars=Number(btn.dataset.cars);
      btn.classList.toggle('active',cars===state.carTotal);
      btn.addEventListener('click',()=>{
        state.carTotal=clamp(cars,1,6); localStorage.setItem('neon-toy-cars',String(state.carTotal));
        UI.raceChoices.forEach((b)=>b.classList.toggle('active',b===btn));
        resetGame();
      });
    });

    window.addEventListener('keydown',(e)=>{
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','KeyW','KeyA','KeyS','KeyD','ShiftLeft','ShiftRight'].includes(e.code)) e.preventDefault();
      if (e.code==='ArrowUp'||e.code==='KeyW') input.gas=true;
      if (e.code==='ArrowDown'||e.code==='KeyS') input.brake=true;
      if (e.code==='ArrowLeft'||e.code==='KeyA') input.left=true;
      if (e.code==='ArrowRight'||e.code==='KeyD') input.right=true;
      if (e.code==='ShiftLeft'||e.code==='ShiftRight') input.nitro=true;
      if (e.code==='Space') input.drift=true;
      if (e.code==='KeyR') resetGame();
      if (e.code==='KeyC') UI.cameraBtn?.click();
    },{passive:false});
    window.addEventListener('keyup',(e)=>{
      if (e.code==='ArrowUp'||e.code==='KeyW') input.gas=false;
      if (e.code==='ArrowDown'||e.code==='KeyS') input.brake=false;
      if (e.code==='ArrowLeft'||e.code==='KeyA') input.left=false;
      if (e.code==='ArrowRight'||e.code==='KeyD') input.right=false;
      if (e.code==='ShiftLeft'||e.code==='ShiftRight') input.nitro=false;
      if (e.code==='Space') input.drift=false;
    });

    canvas.addEventListener('pointerdown',(e)=>{
      input.pointerActive=true; input.pointerStartX=e.clientX; canvas.setPointerCapture?.(e.pointerId);
    });
    canvas.addEventListener('pointermove',(e)=>{
      if (!input.pointerActive) return;
      input.touchSteer=clamp((e.clientX-input.pointerStartX)/Math.max(125,canvas.clientWidth*0.25),-1,1);
    });
    const pointerUp=()=>{ input.pointerActive=false; input.touchSteer=0; };
    canvas.addEventListener('pointerup',pointerUp);
    canvas.addEventListener('pointercancel',pointerUp);

    window.addEventListener('resize',resize);
    window.addEventListener('orientationchange',()=>{ updateOrientationClass(); setTimeout(resize,120); setTimeout(resize,420); });
    window.visualViewport?.addEventListener('resize',resize);
    document.addEventListener('visibilitychange',()=>{ if(document.hidden){ state.running=false; stopAudio(); } });
  }

  function minimapData() {
    const points=[];
    const cx=118, cy=69;
    for (let i=0;i<=120;i++) {
      const z=WORLD.lapLength*i/120;
      const angle=-Math.PI/2+(i/120)*Math.PI*2;
      const curve=roadCenter(z);
      const elevation=roadHeight(z)-8;
      const radius=48+curve*0.34+elevation*1.25;
      points.push({
        x:cx+Math.cos(angle)*radius*1.68,
        y:cy+Math.sin(angle)*radius
      });
    }
    return {
      points,
      progress:state.lapProgress,
      ai:state.aiCars.map((ai)=>mod(ai.distance,WORLD.lapLength)/WORLD.lapLength),
      lap:state.currentLap, laps:state.lapCount
    };
  }

  window.NeonToyGame = { getMinimapData:minimapData, version:'8.2' };

  updateOrientationClass();
  bindInput();
  resetGame();
  requestAnimationFrame(frame);
})();