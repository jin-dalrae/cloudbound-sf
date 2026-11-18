// Cloudbound SF — true sprite-stacking engine (Canvas 2D)
// Every building is a pixel-art sprite sliced into horizontal layers;
// layers are drawn stacked upward and rotated with the camera. No 3D meshes.
const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d');
const errorBox = document.getElementById('error-box');
window.addEventListener('error', e => { errorBox.hidden = false; errorBox.textContent = 'Cloudbound hit turbulence: ' + (e.message || 'error'); });

let W = 0, H = 0, DPR = 1;
function resize(){
  DPR = Math.min(devicePixelRatio || 1, 2);
  W = innerWidth; H = innerHeight;
  canvas.width = W * DPR; canvas.height = H * DPR;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
}
addEventListener('resize', resize); resize();
ctx.imageSmoothingEnabled = false;
canvas.style.imageRendering = 'pixelated';

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

// ---------- pixel sprite factory ----------
// A "slice" is one horizontal layer of a stack, drawn as a chunky pixel rect
// with a lit wall edge, window pixels and a roof/interior fill.
function makeSlice(w, d, wall, roof, opts = {}){
  const c = document.createElement('canvas');
  const px = 3; // pixel chunk size inside the sprite
  c.width = Math.max(6, Math.round(w)); c.height = Math.max(6, Math.round(d));
  const g = c.getContext('2d');
  g.fillStyle = roof; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = wall;
  g.fillRect(0, 0, c.width, px); g.fillRect(0, c.height - px, c.width, px);
  g.fillRect(0, 0, px, c.height); g.fillRect(c.width - px, 0, px, c.height);
  // window / detail pixels on the rim (they read as glowing floors from above)
  const lit = opts.lit ?? 0.4;
  for (let x = px; x < c.width - px; x += px * 2){
    for (const y of [px, c.height - px * 2]){
      if (Math.random() < lit){ g.fillStyle = opts.win || '#ffd98a'; g.fillRect(x, y, px, px); }
    }
  }
  if (opts.dot){ g.fillStyle = opts.dot; g.fillRect(c.width / 2 - px, c.height / 2 - px, px * 2, px * 2); }
  return c;
}
function makeRoofSlice(w, d, roof, trim){
  const c = makeSlice(w, d, trim, roof, { lit: 0.06, dot: trim });
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0.13)';
  g.fillRect(3, 3, c.width - 6, 3);
  return c;
}
// side-profile sprite for the biplane, sliced into bands by drawStackProfile()
function makePlaneSprite(){
  const c = document.createElement('canvas'); c.width = 96; c.height = 40;
  const g = c.getContext('2d');
  const P = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  P(14, 18, 52, 8, '#d8443c');           // fuselage
  P(58, 14, 10, 12, '#a52a24');          // nose
  P(66, 18, 6, 5, '#2b2118');            // prop hub (animated separately)
  P(10, 8, 30, 4, '#e85d50');            // top wing
  P(12, 26, 30, 4, '#c23b22');           // bottom wing
  P(16, 12, 3, 14, '#7a2a20'); P(34, 12, 3, 14, '#7a2a20'); // struts
  P(4, 12, 8, 10, '#e85d50');            // tail
  P(28, 15, 9, 4, '#ffd98a');            // cockpit glow
  return c;
}
const planeSprite = makePlaneSprite();

// ---------- world data (compressed SF geography) ----------
const PALETTE = ['#f6c390','#efa8a0','#b9d6c5','#a8c8e8','#f2e2a4','#e8b4d8','#ffd9a8','#c5d8a8'];
const buildings = [];
function addBuilding(x, z, w, d, floors, color, kind = 'house'){
  const wall = '#6b4a3a';
  const slices = [];
  const n = clamp(Math.round(floors * 1.6), 3, 26);
  for (let i = 0; i < n; i++){
    const top = i === n - 1;
    slices.push(top ? makeRoofSlice(w, d, color, wall) : makeSlice(w, d, i % 2 ? '#7a5a48' : wall, color, { lit: kind === 'tower' ? .55 : .35 }));
  }
  buildings.push({ x, z, w, d, slices, floors, seed: Math.random() * 10, kind });
}
// downtown + neighborhoods
for (let i = 0; i < 230; i++){
  const dt = i < 115;
  const x = dt ? rand(90, 360) : rand(-430, 430);
  const z = dt ? rand(-230, 130) : rand(-260, 330);
  if (Math.hypot(x + 260, z - 260) < 125) continue;
  if (x > -135 && x < 50 && z > 110 && z < 270) continue;
  if (x < -460 || (x > 400 && z > -90 && z < 110)) continue;
  const floors = dt ? rand(8, 26) : rand(2, 7);
  addBuilding(x, z, rand(13, 24), rand(13, 24), floors, PALETTE[i % PALETTE.length], dt ? 'tower' : 'house');
}
// heroes (taller stacks)
addBuilding(265, -85, 30, 30, 34, '#9fc6d8', 'tower');   // Salesforce
addBuilding(205, -120, 26, 26, 24, '#f3e6cf', 'tower');  // Transamerica (taper handled at draw)
// Painted Ladies
['#f2a7bb','#a8c8e8','#f2e2a4','#b9d6c5','#f6c390','#e8b4d8'].forEach((c, i) => addBuilding(-118 + i * 20, 38, 16, 14, 5, c, 'lady'));
// Ferry Building
addBuilding(452, 30, 22, 66, 6, '#f3e6cf', 'ferry');
// Chinatown dense red roofs
for (let i = 0; i < 26; i++) addBuilding(rand(105, 195), rand(-205, -135), rand(11, 16), rand(11, 16), rand(3, 7), i % 3 ? '#c96f4a' : '#a33327', 'china');

const landmarks = [
  { name: 'Golden Gate Bridge', x: -350, z: -330, blurb: 'Golden Gate Bridge — fly through the fog' },
  { name: 'Downtown Skyline', x: 235, z: -100, blurb: 'Downtown — Salesforce Tower & the Pyramid' },
  { name: 'Painted Ladies', x: -70, z: 38, blurb: 'Painted Ladies — postcard row' },
  { name: 'Ferry Building', x: 452, z: 30, blurb: 'Ferry Building — Embarcadero waterfront' },
  { name: 'Chinatown', x: 150, z: -170, blurb: 'Chinatown — lantern light' },
  { name: 'Dolores Park', x: -40, z: 185, blurb: 'Dolores Park — palms & picnics' },
  { name: 'Twin Peaks', x: -260, z: 262, blurb: 'Twin Peaks — the whole city below' },
  { name: 'Ocean Beach', x: -560, z: 110, blurb: 'Ocean Beach — sunset surf' },
];
landmarks.forEach(l => l.shown = false);

// trees / palms / lanterns as mini stacks (2-4 slices)
const minis = [];
function addMini(x, z, slices, kind){ minis.push({ x, z, slices, kind, seed: Math.random() * 10 }); }
for (let i = 0; i < 90; i++){
  const park = i < 30;
  const x = park ? rand(-115, 30) : rand(-440, 430), z = park ? rand(125, 255) : rand(-250, 330);
  addMini(x, z, [makeSlice(7, 7, '#4d7d4a', '#5d9b52', { lit: .1 }), makeSlice(9, 9, '#4d7d4a', '#6cb25e', { lit: .1 }), makeSlice(6, 6, '#3c6b3a', '#7cc46e', { lit: .05 })], 'tree');
}
for (let i = 0; i < 50; i++) addMini(rand(108, 192), rand(-202, -138), [makeSlice(5, 5, '#c23b22', '#ffb347', { lit: .9, win: '#ffe9a8' })], 'lantern');

// ---------- pre-rendered ground (world space, drawn rotated each frame) ----------
const GW = 2400, GH = 1900, GOX = 1200, GOZ = 950; // world->ground px: +GOX,+GOZ, scale 1
const groundC = document.createElement('canvas'); groundC.width = GW; groundC.height = GH;
{
  const g = groundC.getContext('2d');
  g.fillStyle = '#59b8ae'; g.fillRect(0, 0, GW, GH); // bay water base
  // sparkle pixels on water
  for (let i = 0; i < 2600; i++){ g.fillStyle = Math.random() < .5 ? 'rgba(255,240,200,.5)' : 'rgba(255,255,255,.35)'; g.fillRect(Math.random() * GW, Math.random() * GH, 4, 2); }
  // landmass
  g.fillStyle = '#cbb59a';
  g.beginPath();
  g.moveTo(300 + GOX, -520 + GOZ); g.lineTo(430 + GOX, -420 + GOZ); g.lineTo(520 + GOX, 60 + GOZ);
  g.lineTo(430 + GOX, 330 + GOZ); g.lineTo(-60 + GOX, 430 + GOZ); g.lineTo(-430 + GOX, 330 + GOZ);
  g.lineTo(-540 + GOX, 60 + GOZ); g.lineTo(-430 + GOX, -330 + GOZ); g.closePath(); g.fill();
  // hill shading blobs
  for (let i = 0; i < 260; i++){
    const x = rand(-520, 500) + GOX, y = rand(-430, 400) + GOZ;
    g.fillStyle = Math.random() < .6 ? 'rgba(93,143,82,.35)' : 'rgba(185,160,107,.3)';
    g.beginPath(); g.ellipse(x, y, rand(20, 90), rand(14, 60), Math.random() * 3, 0, 7); g.fill();
  }
  // Twin Peaks massifs
  for (const [hx, hz] of [[-285, 245], [-225, 285]]){
    for (let r = 90; r > 14; r -= 16){ g.fillStyle = r > 50 ? '#5d8f52' : '#79ad68'; g.beginPath(); g.ellipse(hx + GOX, hz + GOZ, r, r * .72, .4, 0, 7); g.fill(); }
  }
  // Dolores park + beach
  g.fillStyle = '#5d9b52'; g.beginPath(); g.ellipse(-40 + GOX, 185 + GOZ, 105, 78, -.2, 0, 7); g.fill();
  g.fillStyle = '#eccf9a'; g.fillRect(-660 + GOX, -80 + GOZ, 110, 420);
  // street grid
  g.strokeStyle = 'rgba(90,74,60,.35)'; g.lineWidth = 3;
  for (let x = -440; x < 470; x += 44){ g.beginPath(); g.moveTo(x + GOX, -330 + GOZ); g.lineTo(x + GOX, 360 + GOZ); g.stroke(); }
  for (let z = -300; z < 380; z += 44){ g.beginPath(); g.moveTo(-480 + GOX, z + GOZ); g.lineTo(490 + GOX, z + GOZ); g.stroke(); }
  // Golden Gate deck base shadow on water
  g.fillStyle = 'rgba(120,40,25,.35)'; g.fillRect(-575 + GOX, -322 + GOZ, 450, 10);
}

// ---------- camera / flight state ----------
const flight = { x: 520, z: 250, alt: 120, yaw: Math.PI * 0.78, tilt: 0.58, speed: 13, targetSpeed: 13, boost: 0, bank: 0 };
const $ = id => document.getElementById(id);
let paused = false, sensitivity = 1, tiltOn = false, tiltBase = null;
const tiltSmooth = { x: 0, y: 0 };
const keys = new Set();
let dragging = false, lastX = 0, lastY = 0, dragYawV = 0, dragTiltV = 0;

// ---------- stack renderer ----------
// Draws one object's slices bottom->top. Each slice is rotated by the camera
// yaw: this per-slice rotation is the heart of sprite stacking.
function drawStack(sx, sy, slices, zoom, rot, sliceStep, shadowPass){
  const step = sliceStep * zoom;
  for (let i = 0; i < slices.length; i++){
    const img = slices[i];
    const w = img.width * zoom, h = img.height * zoom;
    ctx.save();
    ctx.translate(sx, sy - i * step);
    ctx.rotate(rot);
    if (shadowPass) { ctx.globalAlpha = .28; ctx.filter = 'brightness(0)'; }
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  }
  ctx.globalAlpha = 1; ctx.filter = 'none';
}
function project(wx, wz){
  const dx = wx - flight.x, dz = wz - flight.z;
  const c = Math.cos(-flight.yaw), s = Math.sin(-flight.yaw);
  const rx = dx * c - dz * s, rz = dx * s + dz * c;
  const zoom = clamp(flight.alt / 120, .55, 1.9) * (H / 820 + .35);
  return { sx: W / 2 + rx * zoom, sy: H * .56 + rz * zoom * flight.tilt, rz, zoom };
}

// Golden Gate as two tall red stacks + deck slices
const ggTowerSlices = [], ggDeckSlices = [];
for (let i = 0; i < 30; i++) ggTowerSlices.push(makeSlice(20, 12, '#8f2418', i > 26 ? '#e85d50' : '#c23b22', { lit: .12, win: '#ffb27a' }));
for (let i = 0; i < 3; i++) ggDeckSlices.push(makeSlice(430, 15, '#8f2418', '#d8443c', { lit: .25 }));

// clouds: 3-slice puffs drifting
const cloudPuff = [makeSlice(90, 44, '#e8a88f', '#ffe9d2', { lit: 0 }), makeSlice(70, 36, '#e8a88f', '#fff3e0', { lit: 0 }), makeSlice(46, 26, '#efa98f', '#fff8ec', { lit: 0 })];
const clouds = Array.from({ length: 30 }, () => ({ x: rand(-900, 900), z: rand(-750, 750), h: rand(6, 26), s: rand(.7, 1.6) }));
// boats: hull slice + sail slice, moving on the bay
const boats = Array.from({ length: 9 }, (_, i) => ({ x: rand(540, 820), z: rand(-280, 280), ph: i * 1.1, hull: makeSlice(20, 9, '#8a6a4a', '#ffffff', { lit: .1 }), sail: makeSlice(9, 9, '#e8ddc8', '#fffaf0', { lit: 0 }) }));

// ---------- input (same contract as before: drag / keys / tilt / touch) ----------
canvas.addEventListener('pointerdown', e => { dragging = true; lastX = e.clientX; lastY = e.clientY; canvas.setPointerCapture(e.pointerId); startAudio(); });
canvas.addEventListener('pointermove', e => {
  if (!dragging) return;
  dragYawV = clamp(dragYawV - (e.clientX - lastX) * .0035 * sensitivity, -.06, .06);
  dragTiltV = clamp(dragTiltV + (e.clientY - lastY) * .0016 * sensitivity, -.02, .02);
  lastX = e.clientX; lastY = e.clientY;
});
canvas.addEventListener('pointerup', () => dragging = false);
canvas.addEventListener('wheel', e => { e.preventDefault(); flight.targetSpeed = clamp(flight.targetSpeed - Math.sign(e.deltaY) * 2, 0, 32); $('speed-range').value = flight.targetSpeed; }, { passive: false });
canvas.addEventListener('dblclick', () => flight.boost = 30);
addEventListener('keydown', e => {
  if (e.code === 'Escape') return togglePause();
  keys.add(e.code);
  if (e.code === 'Equal') flight.targetSpeed = Math.min(32, flight.targetSpeed + 2);
  if (e.code === 'Minus') flight.targetSpeed = Math.max(0, flight.targetSpeed - 2);
  $('speed-range').value = flight.targetSpeed;
});
addEventListener('keyup', e => keys.delete(e.code));
$('speed-range').addEventListener('input', e => flight.targetSpeed = +e.target.value);
$('btn-boost').addEventListener('click', () => { flight.boost = 30; startAudio(); });
$('btn-pause').addEventListener('click', togglePause);
$('btn-resume').addEventListener('click', togglePause);
$('sens-range').addEventListener('input', e => sensitivity = +e.target.value / 100);
function togglePause(){ paused = !paused; $('pause-overlay').hidden = !paused; $('btn-pause').textContent = paused ? 'Resume' : 'Pause'; }
const TIME = { golden: ['#ffd9a0', '#f7a56b', '#e88ca0'], day: ['#bfe6f2', '#8ec9e8', '#e8f4f8'], dusk: ['#e9b8d8', '#c98bb8', '#8f6bb0'] };
let skyCols = TIME.golden;
$('time-select').addEventListener('change', e => skyCols = TIME[e.target.value]);
{
  const pad = $('touch-pad'), knob = $('touch-knob'); let tid = null;
  pad.addEventListener('pointerdown', e => { tid = e.pointerId; pad.setPointerCapture(tid); });
  pad.addEventListener('pointermove', e => {
    if (e.pointerId !== tid) return;
    const r = pad.getBoundingClientRect();
    const dx = clamp((e.clientX - (r.left + r.width / 2)) / 40, -1, 1), dy = clamp((e.clientY - (r.top + r.height / 2)) / 40, -1, 1);
    knob.style.transform = `translate(${dx * 26}px,${dy * 26}px)`;
    dragYawV = dx * .045; dragTiltV = -dy * .012;
  });
  const end = () => { tid = null; knob.style.transform = ''; };
  pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
}
$('btn-tilt').addEventListener('click', async () => {
  try {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function'){
      if (await DeviceOrientationEvent.requestPermission() !== 'granted') return toast('Motion not allowed — drag to fly instead');
    }
    tiltOn = !tiltOn; tiltBase = null;
    $('btn-tilt').classList.toggle('active', tiltOn);
    $('btn-tilt').textContent = tiltOn ? 'Tilt on — hold steady to calibrate' : '🧭 Tilt to fly';
  } catch (_) { $('btn-tilt').textContent = 'Tilt unavailable — drag to fly'; }
});
addEventListener('deviceorientation', e => {
  if (!tiltOn || e.gamma === null) return;
  if (!tiltBase) tiltBase = { g: e.gamma, b: e.beta };
  const dead = v => Math.abs(v) < .14 ? 0 : v;
  tiltSmooth.x += (dead(clamp((e.gamma - tiltBase.g) / 28, -1, 1)) - tiltSmooth.x) * .08;
  tiltSmooth.y += (dead(clamp((e.beta - tiltBase.b) / 28, -1, 1)) - tiltSmooth.y) * .08;
});
let audioOn = false;
function startAudio(){
  if (audioOn) return; audioOn = true;
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const len = 2 * ac.sampleRate, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
    const g = ac.createGain(); g.gain.value = .04;
    src.connect(f).connect(g).connect(ac.destination); src.start();
  } catch (_) {}
}
function toast(msg){
  const el = $('landmark-toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('show'), 2800);
}

// ---------- main loop ----------
let last = performance.now(), fpsEMA = 60;
function frame(now){
  requestAnimationFrame(frame);
  const dt = clamp((now - last) / 1000, .001, .05); last = now;
  fpsEMA = lerp(fpsEMA, 1 / dt, .05);
  const t = now / 1000;
  if (!paused){
    let turn = 0, climb = 0;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) turn += 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) turn -= 1;
    if (keys.has('KeyW') || keys.has('ArrowUp')) climb += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) climb -= 1;
    if (keys.has('Space')) climb += 1.2;
    if (keys.has('ShiftLeft') || keys.has('ShiftRight')) climb -= 1.2;
    flight.yaw += (turn * 1.25 + dragYawV * 22 + (tiltOn ? -tiltSmooth.x * 1.7 : 0)) * dt;
    flight.alt = clamp(flight.alt + (climb * 55 + dragTiltV * 900 + (tiltOn ? -tiltSmooth.y * 60 : 0)) * dt, 42, 300);
    flight.tilt = clamp(flight.tilt + dragTiltV * 2.2 * dt * 8, .38, .78);
    if (!dragging){ dragYawV *= .90; dragTiltV *= .88; }
    flight.boost = Math.max(0, flight.boost - dt * 11);
    flight.speed = lerp(flight.speed, flight.targetSpeed + flight.boost, Math.min(1, dt * 2.4));
    const sp = Math.max(flight.speed, 5);
    flight.x += Math.sin(flight.yaw) * sp * dt * 3.2;
    flight.z += Math.cos(flight.yaw) * sp * dt * 3.2;
    flight.x = clamp(flight.x, -980, 980); flight.z = clamp(flight.z, -820, 820);
    const targetBank = clamp(-(turn * .5 + dragYawV * 9 + (tiltOn ? -tiltSmooth.x * .6 : 0)), -.6, .6);
    flight.bank = lerp(flight.bank, targetBank, Math.min(1, dt * 4));
  }
  // --- sky ---
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, skyCols[0]); sky.addColorStop(.55, skyCols[1]); sky.addColorStop(1, skyCols[2]);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
  // sun glow
  ctx.fillStyle = 'rgba(255,236,190,.85)';
  ctx.beginPath(); ctx.arc(W * .16, H * .18, 44, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(255,236,190,.25)';
  ctx.beginPath(); ctx.arc(W * .16, H * .18, 92, 0, 7); ctx.fill();
  // --- ground (rotated world image) ---
  const zoom0 = clamp(flight.alt / 120, .55, 1.9) * (H / 820 + .35);
  ctx.save();
  ctx.translate(W / 2, H * .56);
  ctx.rotate(-flight.yaw);
  ctx.scale(zoom0, zoom0 * flight.tilt);
  ctx.translate(-flight.x, -flight.z);
  ctx.drawImage(groundC, -GOX, -GOZ);
  ctx.restore();
  // --- painters: collect visible stacks, far -> near ---
  const drawList = [];
  for (const b of buildings){
    const p = project(b.x, b.z);
    if (p.sx < -160 || p.sx > W + 160 || p.sy < -260 || p.sy > H + 200) continue;
    drawList.push({ p, b });
  }
  drawList.sort((a, b2) => a.p.rz - b2.p.rz);
  const stepBase = fpsEMA < 34 ? 4.2 : 3.1; // adaptive slice step keeps 60fps
  for (const { p, b } of drawList){
    const shrink = b.kind === 'tower' && b.x === 205 ? .55 : 1; // Transamerica taper illusion via scale on top slices handled below
    // long golden-hour shadow stack first
    drawStack(p.sx + 16 * p.zoom, p.sy + 7 * p.zoom, b.slices, p.zoom * .98, -flight.yaw, stepBase, true);
    drawStack(p.sx, p.sy, b.slices, p.zoom * (shrink === 1 ? 1 : 1), -flight.yaw, stepBase, false);
    if (b.kind === 'lady'){ // rotating showcase slice cap: ladies slowly turn (viral rotation)
      const top = b.slices[b.slices.length - 1];
      ctx.save(); ctx.translate(p.sx, p.sy - b.slices.length * stepBase * p.zoom);
      ctx.rotate(-flight.yaw + Math.sin(t * .5 + b.seed) * .5);
      const w = top.width * p.zoom, h = top.height * p.zoom;
      ctx.drawImage(top, -w / 2, -h / 2, w, h); ctx.restore();
    }
  }
  // Golden Gate towers + deck
  for (const tx of [-500, -200]){
    const p = project(tx, -330);
    drawStack(p.sx + 18 * p.zoom, p.sy + 8 * p.zoom, ggTowerSlices, p.zoom, -flight.yaw, stepBase, true);
    drawStack(p.sx, p.sy, ggTowerSlices, p.zoom, -flight.yaw + Math.sin(t * .3) * .06, stepBase, false);
  }
  {
    const p = project(-350, -330);
    ctx.save(); ctx.translate(p.sx, p.sy - 30 * stepBase * p.zoom * .92); ctx.rotate(-flight.yaw);
    const img = ggDeckSlices[1], w = img.width * p.zoom, h = img.height * p.zoom;
    ctx.drawImage(img, -w / 2, -h / 2, w, h); ctx.restore();
  }
  // minis (trees / lanterns flicker)
  for (const m of minis){
    const p = project(m.x, m.z);
    if (p.sx < -60 || p.sx > W + 60 || p.sy < -80 || p.sy > H + 60) continue;
    if (m.kind === 'lantern' && Math.sin(t * 2.4 + m.seed * 7) < -.25) continue; // blink frame
    drawStack(p.sx, p.sy, m.slices, p.zoom * .8, -flight.yaw, stepBase, false);
  }
  // boats
  for (const b of boats){
    const bz = b.z + Math.sin(t * .35 + b.ph) * 26;
    const p = project(b.x, bz);
    drawStack(p.sx, p.sy, [b.hull], p.zoom, -flight.yaw + Math.sin(t * .3 + b.ph) * .2, stepBase, false);
    drawStack(p.sx, p.sy - 4 * p.zoom, [b.sail], p.zoom, -flight.yaw, stepBase, false);
  }
  // clouds drift over the city
  for (const c of clouds){
    c.x += dt * 2.2; if (c.x > 1050) c.x = -1050;
    const p = project(c.x, c.z);
    ctx.globalAlpha = .8;
    drawStack(p.sx, p.sy - c.h * p.zoom, cloudPuff, p.zoom * c.s * 1.5, -flight.yaw, 5.5, false);
    ctx.globalAlpha = 1;
  }
  // --- player biplane: stacked profile bands, banks with turns (viral centerpiece) ---
  {
    const bands = 16, bh = planeSprite.height / bands;
    const bx = W / 2, by = H * .68 + Math.sin(t * 1.7) * 5;
    for (let i = 0; i < bands; i++){
      ctx.save();
      ctx.translate(bx, by - i * 2.6);
      ctx.rotate(flight.bank * .9);
      ctx.drawImage(planeSprite, 0, i * bh, planeSprite.width, bh, -62, -bh / 2 - 8, 124, bh * 2.2);
      ctx.restore();
    }
    // 2-frame prop flicker
    ctx.save(); ctx.translate(bx + 58, by - 22); ctx.rotate(flight.bank * .9);
    ctx.fillStyle = (Math.floor(t * 18) % 2) ? 'rgba(43,33,24,.85)' : 'rgba(43,33,24,.3)';
    ctx.fillRect(-2, -13, 4, 26); ctx.restore();
    // soft shadow of plane on ground plane area
    ctx.fillStyle = 'rgba(59,32,8,.18)';
    ctx.beginPath(); ctx.ellipse(bx + 26, by + 64, 52, 10, 0, 0, 7); ctx.fill();
  }
  // --- HUD ---
  $('stat-speed').textContent = Math.round(flight.speed * 1.5);
  $('stat-alt').textContent = Math.round(flight.alt);
  let best = landmarks[0], bd = 1e9;
  for (const l of landmarks){ const d = Math.hypot(flight.x - l.x, flight.z - l.z); if (d < bd){ bd = d; best = l; } }
  $('stat-place').textContent = bd < 150 ? best.name : 'Over the Bay';
  $('compass-label').textContent = best.name.toUpperCase();
  $('needle').style.transform = `rotate(${-flight.yaw * 57.3}deg)`;
  if (bd < 150 && !best.shown){ best.shown = true; toast(best.blurb); }
  if (bd > 190) landmarks.forEach(l => l.shown = false);
}
requestAnimationFrame(frame);
setTimeout(() => toast('The city is yours. Fly anywhere.'), 700);
