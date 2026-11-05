import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const $ = (s) => document.querySelector(s);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const V = (x, z) => new THREE.Vector3(x, 0, z);

/* ───────────── Cảnh 3D ───────────── */
const stage = $('#stage');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.prepend(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.domElement.className = 'labels';
stage.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#15131d');
scene.fog = new THREE.Fog('#15131d', 55, 95);

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
camera.position.set(0, 27, 27);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.44;
controls.minDistance = 6;
controls.maxDistance = 60;

scene.add(new THREE.HemisphereLight('#fff1e0', '#2b2440', 1.0));
const sun = new THREE.DirectionalLight('#fff3dc', 1.4);
sun.position.set(-12, 24, 14);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, far: 70 });
sun.shadow.bias = -0.0005;
scene.add(sun);

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.05, ...o });
const shadow = (m) => { m.castShadow = m.receiveShadow = true; return m; };
function box(w, h, d, color, x = 0, y = 0, z = 0, parent = scene, o) {
  const m = shadow(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, o)));
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}
function cyl(rt, rb, h, color, x, y, z, parent = scene) {
  const m = shadow(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 20), mat(color)));
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}
function capsule(r, len, color, parent, y = 0) {
  const m = shadow(new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 12), mat(color)));
  m.position.y = y;
  parent.add(m);
  return m;
}
function sphere(r, color, x, y, z, parent) {
  const m = shadow(new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), mat(color)));
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}
function label(html, cls, pos, parent = scene, center = [0.5, 0.5]) {
  const d = el('div', cls);
  d.innerHTML = html;
  const o = new CSS2DObject(d);
  o.position.copy(pos);
  o.center.set(...center);
  parent.add(o);
  return d;
}

/* ───────────── Mặt bằng: 7 phòng ban + sảnh giữa ───────────── */
// Sàn 30 x 24. Giữa là sảnh chung (phòng họp + quầy lễ tân).
const ZONES = {
  architect: { x: [-15, -5], z: [-12, -5], door: [V(-6, -6.2), V(-6, -3.8)] },
  coder:     { x: [-5, 5],   z: [-12, -5], door: [V(0, -6.2),  V(0, -3.8)] },
  qa:        { x: [5, 15],   z: [-12, -5], door: [V(6, -6.2),  V(6, -3.8)] },
  pm:        { x: [-15, -7], z: [-5, 3],   door: [V(-8.2, -1), V(-5.8, -1)] },
  runner:    { x: [7, 15],   z: [-5, 3],   door: [V(8.2, -1),  V(5.8, -1)] },
  scribe:    { x: [-15, -7], z: [3, 12],   door: [V(-8.2, 4.75), V(-5.8, 4.75)] },
  git:       { x: [7, 15],   z: [3, 12],   door: [V(8.2, 4.75),  V(5.8, 4.75)] },
  designer:  { x: [-7, -1],  z: [6.5, 12], door: [V(-4, 7.4),    V(-4, 5.5)] },
};
const HUB = V(0, -1);
const center = (zn) => V((zn.x[0] + zn.x[1]) / 2, (zn.z[0] + zn.z[1]) / 2);

const floor = shadow(new THREE.Mesh(new THREE.PlaneGeometry(30, 24), mat('#cdb593')));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);
for (let i = -6; i <= 6; i += 1.5) box(14, 0.005, 0.02, '#b89f7c', 0, 0.004, i * 0.95 + 1);

// Tường ngoài
box(30, 5, 0.3, '#e9e3f2', 0, 2.5, -12.15);
box(0.3, 5, 24, '#ddd5ea', -15.15, 2.5, 0);
for (const z of [-8.5, -1, 7.5]) {
  box(0.1, 2.2, 3, '#9ad0f5', -14.97, 2.9, z, scene, { emissive: '#4a8ab5', emissiveIntensity: 0.35 });
  box(0.14, 2.4, 0.12, '#f4f1f8', -14.95, 2.9, z);
}

// Vách ngăn thấp giữa các phòng, chừa lối đi (cửa) ở giữa
const WALL_H = 1.25;
function partition(x1, z1, x2, z2, gaps = [], gap = 2) {
  const horiz = z1 === z2;
  const [a, b] = horiz ? [x1, x2] : [z1, z2];
  const cuts = [a, ...gaps.flatMap((g) => [g - gap / 2, g + gap / 2]), b];
  for (let i = 0; i < cuts.length; i += 2) {
    const s = cuts[i], e = cuts[i + 1], len = e - s, mid = (s + e) / 2;
    if (len <= 0.01) continue;
    const [w, d, x, z] = horiz ? [len, 0.14, mid, z1] : [0.14, len, x1, mid];
    box(w, WALL_H, d, '#f1ecf7', x, WALL_H / 2, z);
    box(w + 0.02, 0.06, d + 0.02, '#8b7aa8', x, WALL_H + 0.03, z);
    if (gaps.length) for (const end of [s, e]) if (end !== a && end !== b) {
      const [px, pz] = horiz ? [end, z1] : [x1, end];
      box(0.22, WALL_H + 0.5, 0.22, '#8b7aa8', px, (WALL_H + 0.5) / 2, pz);
    }
  }
}
partition(-5, -12, -5, -5);
partition(5, -12, 5, -5);
partition(-15, -5, 15, -5, [-6, 0, 6]);
partition(-7, -5, -7, 12, [-1, 4.75]);
partition(7, -5, 7, 12, [-1, 4.75]);
partition(-7, 6.5, -1, 6.5, [-4]);
partition(-1, 6.5, -1, 12);
partition(-15, 3, -7, 3);
partition(7, 3, 15, 3);

function plant(x, z, s = 1) {
  cyl(0.35 * s, 0.28 * s, 0.6 * s, '#c96f4a', x, 0.3 * s, z);
  const f = shadow(new THREE.Mesh(new THREE.IcosahedronGeometry(0.65 * s, 0), mat('#3f8f5a', { flatShading: true })));
  f.position.set(x, 1.05 * s, z);
  scene.add(f);
}
plant(-6.2, 2.3, 0.9); plant(6.2, 2.3, 0.9); plant(-14.2, -11.2); plant(14.2, -11.2); plant(-14.2, 11.2); plant(14.2, 11.2);

/* Bảng Kanban trên tường Phòng Lập trình (cao hơn vách nên nhìn thấy từ sảnh) */
const kbCanvas = Object.assign(document.createElement('canvas'), { width: 1024, height: 400 });
const kbTex = new THREE.CanvasTexture(kbCanvas); kbTex.colorSpace = THREE.SRGBColorSpace;
box(9.2, 3.6, 0.12, '#55506b', 0, 3.2, -11.93);
const kbBoard = new THREE.Mesh(new THREE.PlaneGeometry(8.9, 3.48), new THREE.MeshBasicMaterial({ map: kbTex }));
kbBoard.position.set(0, 3.2, -11.86);
scene.add(kbBoard);

/* Phòng họp giữa sảnh */
cyl(2.2, 2.2, 0.1, '#8a6a4f', HUB.x, 0.78, HUB.z);
cyl(0.25, 0.5, 0.75, '#5d4636', HUB.x, 0.38, HUB.z);
const rug = new THREE.Mesh(new THREE.CircleGeometry(4.3, 48), mat('#3a3256'));
rug.rotation.x = -Math.PI / 2; rug.position.set(HUB.x, 0.012, HUB.z); rug.receiveShadow = true;
scene.add(rug);
label('<span class="ic">🤝</span>Phòng họp chung', 'dept-sign hub', V(0, 0).setY(2.6).add(V(0, -1)));

/* Bàn của Sếp (phía trước bên phải sảnh) */
const BOSS_X = 3.5;
box(4.2, 1.0, 1, '#4b3f66', BOSS_X, 0.5, 8.3);
box(4.4, 0.08, 1.15, '#f5b544', BOSS_X, 1.04, 8.3);
label('<span class="ic">🙋</span>Bàn của Sếp', 'dept-sign hub', V(BOSS_X, 10.3).setY(2.7));

/* Tủ hồ sơ (Phòng Hành chính) và tủ server (Phòng Vận hành) */
const cabinet = box(0.9, 1.9, 1.4, '#7d7397', -14.4, 0.95, 10.4);
for (let i = 0; i < 3; i++) box(0.02, 0.06, 0.5, '#d9d2ea', -13.94, 0.5 + i * 0.55, 10.4);
const leds = [];
box(1.1, 2.4, 0.9, '#22202d', 14.3, 1.2, -4.2);
for (let i = 0; i < 8; i++) {
  leds.push(box(0.02, 0.08, 0.08, '#22c55e', 13.74, 0.5 + Math.floor(i / 2) * 0.45, -4.4 + (i % 2) * 0.3, scene, { emissive: '#22c55e', emissiveIntensity: 1 }));
}

/* ───────────── Nhân viên ───────────── */
const STATUS_COLOR = { idle: '#64748b', working: '#22c55e', waiting: '#facc15', error: '#ef4444' };
const LOOK = {
  pm:        { hair: '#2b2118', pants: '#1f2937', skin: '#f1c6a0' },
  architect: { hair: '#5a3a28', pants: '#374151', skin: '#e9b98f' },
  coder:     { hair: '#141414', pants: '#1e3a5f', skin: '#f3cfaa' },
  qa:        { hair: '#7a3b2a', pants: '#3f3f46', skin: '#f0c19a', long: true },
  runner:    { hair: '#3b2f22', pants: '#14532d', skin: '#d9a47a' },
  git:       { hair: '#d9d4c7', pants: '#27272a', skin: '#f2c8a2' },
  scribe:    { hair: '#2a1a18', pants: '#4a1d3a', skin: '#f5d0ae', long: true },
  designer:  { hair: '#c084fc', pants: '#0f172a', skin: '#efc3a0' },
};
const agents = new Map();
let meta = [];
let built = false;

function makeScreen(a) {
  const cv = Object.assign(document.createElement('canvas'), { width: 512, height: 310 });
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const s = { cv, ctx: cv.getContext('2d'), tex, lines: [], a };
  drawScreen(s);
  return s;
}
function drawScreen(s, cursor = false) {
  const { ctx, cv, a } = s;
  ctx.fillStyle = '#0d1117'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = a.color; ctx.fillRect(0, 0, cv.width, 36);
  ctx.fillStyle = '#0d1117'; ctx.font = 'bold 19px "JetBrains Mono", monospace';
  ctx.fillText(`${a.role} · ${a.model}`, 14, 25);
  ctx.font = '17px "JetBrains Mono", monospace';
  const lines = s.lines.slice(-11);
  lines.forEach((l, i) => {
    ctx.fillStyle = l.startsWith('$') ? '#7ee787' : l.startsWith('»') ? '#e6edf3' : l.includes('✗') || l.includes('lỗi') ? '#ff7b72' : '#8b949e';
    ctx.fillText(l.slice(0, 44), 14, 62 + i * 22);
  });
  if (cursor) { ctx.fillStyle = '#e6edf3'; ctx.fillRect(14, 62 + lines.length * 22 - 15, 10, 18); }
  s.tex.needsUpdate = true;
}

function chair(parent, x, z, rot, color = '#2f2b40') {
  const g = new THREE.Group();
  g.position.set(x, 0, z); g.rotation.y = rot;
  box(0.62, 0.08, 0.58, color, 0, 0.46, 0, g);
  box(0.62, 0.7, 0.07, color, 0, 0.85, -0.3, g);
  cyl(0.05, 0.05, 0.42, '#55506b', 0, 0.21, 0, g);
  cyl(0.28, 0.28, 0.04, '#55506b', 0, 0.03, 0, g);
  parent.add(g);
  return g;
}

function buildDesk(a, zone) {
  const c = center(zone);
  const g = new THREE.Group();
  g.position.copy(c);
  g.rotation.y = Math.atan2(HUB.x - c.x, HUB.z - c.z);
  scene.add(g);
  box(2.6, 0.08, 1.2, '#efe7da', 0, 0.78, 0.25, g);
  for (const [lx, lz] of [[-1.2, -0.25], [1.2, -0.25], [-1.2, 0.75], [1.2, 0.75]]) box(0.07, 0.74, 0.07, '#55506b', lx, 0.37, lz, g);
  box(2.6, 0.14, 0.03, a.color, 0, 0.68, 0.84, g, { emissive: a.color, emissiveIntensity: 0.3 });
  box(0.1, 0.3, 0.1, '#2a2738', 0, 0.95, 0.55, g);
  box(1.3, 0.82, 0.07, '#1c1a26', 0, 1.45, 0.55, g);
  const screen = makeScreen(a);
  const sm = new THREE.MeshBasicMaterial({ map: screen.tex });
  const front = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.72), sm);
  front.position.set(0, 1.45, 0.51); front.rotation.y = Math.PI; g.add(front);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.72), sm);
  back.position.set(0, 1.45, 0.59); g.add(back);
  box(0.75, 0.03, 0.25, '#3a3650', 0, 0.83, 0.0, g);
  chair(g, 0, -0.55, 0);
  // Đồ riêng mỗi phòng
  if (a.id === 'pm') cyl(0.08, 0.07, 0.18, '#f5b544', 0.95, 0.91, 0.1, g);
  if (a.id === 'architect') { const r = cyl(0.07, 0.07, 0.9, '#7fb3ff', -0.85, 0.87, 0.2, g); r.rotation.z = Math.PI / 2; }
  if (a.id === 'scribe') for (let i = 0; i < 4; i++) box(0.45, 0.03, 0.6, '#ffffff', -0.9, 0.84 + i * 0.035, 0.2, g);
  if (a.id === 'runner') box(0.85, 0.55, 0.06, '#1c1a26', 1.0, 1.3, 0.4, g).rotation.y = -0.5;
  if (a.id === 'qa') { const m = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.022, 8, 20), mat('#cbd5e1')); m.position.set(0.95, 0.84, 0.1); m.rotation.x = Math.PI / 2; g.add(m); }
  if (a.id === 'git') cyl(0.16, 0.16, 0.04, '#94a3b8', 0.95, 0.84, 0.15, g);
  if (a.id === 'designer') {
    box(0.7, 0.03, 0.5, '#1c1a26', -0.85, 0.83, 0.15, g); // bảng vẽ
    ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7'].forEach((c, i) => box(0.12, 0.02, 0.12, c, 0.65 + (i % 3) * 0.15, 0.83, 0.05 + Math.floor(i / 3) * 0.15, g)); // bảng màu
  }
  g.updateMatrixWorld(true);
  const at = (x, z) => g.localToWorld(new THREE.Vector3(x, 0, z));
  // Lối đi vòng qua bàn: sau ghế → cạnh bàn → trước bàn → cửa
  const door = zone.door[0];
  const s = at(1.9, 0).distanceTo(door) < at(-1.9, 0).distanceTo(door) ? 1 : -1;
  return { screen, home: at(0, -0.55), homeRot: g.rotation.y, side: [at(1.9 * s, -0.55), at(1.9 * s, 1.3)] };
}

// Hình người: hông, 2 chân có gối, thân, 2 tay có khuỷu, đầu, tóc, phụ kiện theo phòng
function buildPerson(id, shirt, look) {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  box(0.42, 0.2, 0.26, look.pants, 0, 0.88, 0, body);
  const legs = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(0.11 * s, 0.86, 0); body.add(hip);
    capsule(0.085, 0.3, look.pants, hip, -0.2);
    const knee = new THREE.Group(); knee.position.y = -0.42; hip.add(knee);
    capsule(0.075, 0.28, look.pants, knee, -0.18);
    box(0.14, 0.08, 0.26, '#1f1f28', 0, -0.4, 0.05, knee);
    legs.push({ hip, knee });
  }
  const torso = capsule(0.23, 0.34, shirt, body, 1.2);
  torso.scale.set(1.15, 1, 0.75);
  cyl(0.07, 0.08, 0.14, look.skin, 0, 1.5, 0, body);
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(0.31 * s, 1.42, 0); body.add(sh);
    capsule(0.07, 0.24, shirt, sh, -0.17);
    const el = new THREE.Group(); el.position.y = -0.36; sh.add(el);
    capsule(0.06, 0.2, look.skin, el, -0.13);
    sphere(0.065, look.skin, 0, -0.29, 0, el);
    arms.push({ sh, el });
  }
  const head = new THREE.Group(); head.position.y = 1.7; body.add(head);
  sphere(0.2, look.skin, 0, 0, 0, head);
  const hair = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.215, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), mat(look.hair)));
  hair.position.y = 0.02; hair.rotation.x = -0.3; head.add(hair);
  if (look.long) box(0.36, 0.34, 0.1, look.hair, 0, -0.08, -0.15, head);
  for (const ex of [-0.07, 0.07]) sphere(0.028, '#1a1a1a', ex, 0.02, 0.18, head);
  box(0.07, 0.015, 0.01, '#9a4a3a', 0, -0.08, 0.195, head);
  // Phụ kiện
  if (id === 'pm') box(0.07, 0.3, 0.02, '#b91c1c', 0, 1.25, 0.18, body);
  if (id === 'architect') {
    const hat = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.235, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), mat('#facc15')));
    hat.position.y = 0.04; head.add(hat);
    cyl(0.29, 0.29, 0.03, '#facc15', 0, 0.05, 0.03, head);
  }
  if (id === 'coder') {
    const band = shadow(new THREE.Mesh(new THREE.TorusGeometry(0.225, 0.025, 8, 24, Math.PI), mat('#111827')));
    band.position.y = 0.02; head.add(band);
    for (const s of [-1, 1]) { const cup = cyl(0.08, 0.08, 0.06, '#111827', 0.22 * s, 0, 0, head); cup.rotation.z = Math.PI / 2; }
  }
  if (id === 'qa') {
    for (const s of [-1, 1]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 16), mat('#111827')); r.position.set(0.075 * s, 0.025, 0.19); head.add(r); }
    box(0.05, 0.012, 0.01, '#111827', 0, 0.03, 0.2, head);
  }
  if (id === 'runner') {
    const cap = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.225, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), mat('#16a34a')));
    cap.position.y = 0.04; head.add(cap);
    box(0.26, 0.025, 0.18, '#16a34a', 0, 0.05, 0.22, head);
  }
  if (id === 'git') {
    const b = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.225, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), mat('#475569')));
    b.position.y = 0.05; b.scale.y = 1.2; head.add(b);
  }
  if (id === 'scribe') box(0.22, 0.3, 0.02, '#a16207', 0, -0.34, 0.05, arms[0].el);
  if (id === 'designer') {
    // Mũ nồi của hoạ sĩ + bút vẽ trên tay
    const beret = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.24, 22, 12), mat('#be123c')));
    beret.scale.set(1.05, 0.35, 1.05); beret.position.set(-0.03, 0.16, -0.02); beret.rotation.z = 0.25; head.add(beret);
    const pen = cyl(0.015, 0.015, 0.28, '#06b6d4', 0, -0.32, 0.06, arms[1].el); pen.rotation.x = 1.2;
  }
  if (id === 'boss') box(0.07, 0.3, 0.02, '#f5b544', 0, 1.25, 0.18, body);
  root.traverse((o) => { o.userData.id = id; });
  return { root, body, head, legs, arms, pose: { sit: 0, hip: 0, knee: 0, sh: [0, 0], el: [0, 0] } };
}

function buildAgents() {
  for (const a of meta) {
    const zone = ZONES[a.id];
    if (!zone) continue;
    // Sàn màu riêng của phòng
    const [x0, x1] = zone.x, [z0, z1] = zone.z;
    const tile = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0 - 0.15, z1 - z0 - 0.15), mat(new THREE.Color(a.color).lerp(new THREE.Color('#f3ece2'), 0.8)));
    tile.rotation.x = -Math.PI / 2; tile.position.set((x0 + x1) / 2, 0.01, (z0 + z1) / 2); tile.receiveShadow = true;
    scene.add(tile);
    const c = center(zone);
    const signPos = V(c.x, z0 + 0.9).setY(2.4);
    label(`<span class="ic">${a.emoji}</span>${a.dept}`, 'dept-sign', signPos).style.setProperty('--c', a.color);

    const desk = buildDesk(a, zone);
    const p = buildPerson(a.id, a.color, LOOK[a.id]);
    p.root.position.copy(desk.home);
    p.root.rotation.y = desk.homeRot;
    scene.add(p.root);
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.08, 14, 10), new THREE.MeshBasicMaterial({ color: STATUS_COLOR.idle }));
    light.position.y = 2.1; p.body.add(light);
    const bubble = label('', 'bubble', new THREE.Vector3(0, 2.25, 0), p.body, [0.5, 1]);
    agents.set(a.id, {
      a, ...p, light, bubble, screen: desk.screen, zone,
      home: { p: desk.home, rot: desk.homeRot, seat: true }, side: desk.side,
      seat: null,
      path: [], seated: true, faceRot: desk.homeRot, where: 'desk', status: 'idle', seed: Math.random() * 10,
    });
  }
  // Ghế họp chia đều quanh bàn, mỗi người ngồi phía gần cửa phòng mình
  const list = [...agents.values()]
    .map((ag) => ({ ag, ang: Math.atan2(ag.zone.door[1].z - HUB.z, ag.zone.door[1].x - HUB.x) }))
    .sort((p, q) => p.ang - q.ang);
  const step = (Math.PI * 2) / list.length;
  const off = Math.atan2(
    list.reduce((s, it, i) => s + Math.sin(it.ang - i * step), 0),
    list.reduce((s, it, i) => s + Math.cos(it.ang - i * step), 0));
  list.forEach(({ ag }, i) => {
    const ang = off + i * step;
    const p = V(HUB.x + Math.cos(ang) * 3.05, HUB.z + Math.sin(ang) * 3.05);
    const rot = Math.atan2(HUB.x - p.x, HUB.z - p.z);
    chair(scene, p.x, p.z, rot, '#4b3f66');
    ag.seat = { p, rot, seat: true };
  });

  const b = buildPerson('boss', '#1f2937', { hair: '#2b2118', pants: '#111827', skin: '#f1c6a0' });
  b.root.position.set(BOSS_X, 0, 9.5); b.root.rotation.y = Math.PI;
  scene.add(b.root);
  bossBubble = label('', 'bubble', new THREE.Vector3(0, 2.25, 0), b.body, [0.5, 1]);
  boss = b;
  built = true;
}
let bossBubble, boss;

function goMeeting(on) {
  for (const ag of agents.values()) {
    const want = on ? 'meeting' : 'desk';
    if (ag.where === want) continue;
    ag.where = want;
    const [din, dout] = ag.zone.door;
    const [s1, s2] = ag.side;
    ag.path = on
      ? [{ p: s1 }, { p: s2 }, { p: din }, { p: dout }, ag.seat]
      : [{ p: dout }, { p: din }, { p: s2 }, { p: s1 }, ag.home];
  }
}

function showBubble(bubble, text, ms = 6000) {
  bubble.textContent = text;
  bubble.classList.add('show');
  clearTimeout(bubble._t);
  bubble._t = setTimeout(() => bubble.classList.remove('show'), ms);
}

/* Giấy bay về Phòng Hành chính mỗi khi có nhật ký mới */
const papers = [];
function flyPaper(fromId) {
  const from = fromId === 'boss' ? boss?.root.position : agents.get(fromId)?.root.position;
  const to = agents.get('scribe')?.root.position;
  if (!from || !to || fromId === 'scribe') return;
  const m = box(0.3, 0.02, 0.4, '#ffffff', from.x, 2, from.z);
  m.castShadow = false;
  papers.push({ m, from: from.clone().setY(2), to: to.clone().setY(1.4), t: 0 });
}

/* Kanban */
const COLS = [['todo', 'Cần làm'], ['doing', 'Đang làm'], ['review', 'Kiểm tra'], ['done', 'Xong']];
function drawKanban(cards) {
  const c = kbCanvas.getContext('2d');
  c.fillStyle = '#fbfaf7'; c.fillRect(0, 0, 1024, 400);
  const w = 1024 / 4;
  COLS.forEach(([key, name], i) => {
    const x = i * w;
    if (i) { c.fillStyle = '#ddd8e6'; c.fillRect(x, 16, 2, 368); }
    c.fillStyle = '#4b4560'; c.font = 'bold 26px "Be Vietnam Pro", sans-serif';
    c.fillText(name, x + 16, 44);
    cards.filter((k) => k.col === key).slice(0, 6).forEach((k, j) => {
      const y = 62 + j * 54;
      const color = meta.find((m) => m.id === k.owner)?.color || '#999';
      c.fillStyle = key === 'done' ? '#e5f6ec' : '#fff3c4';
      c.fillRect(x + 12, y, w - 24, 46);
      c.fillStyle = color; c.fillRect(x + 12, y, 6, 46);
      c.fillStyle = '#2a2638'; c.font = '17px "Be Vietnam Pro", sans-serif';
      c.fillText(k.title.length > 24 ? k.title.slice(0, 23) + '…' : k.title, x + 26, y + 29);
    });
  });
  if (!cards.length) { c.fillStyle = '#9a94b3'; c.font = '22px "Be Vietnam Pro", sans-serif'; c.fillText('Chưa có việc. Hãy giao việc ở bảng bên phải →', 250, 230); }
  kbTex.needsUpdate = true;
}

/* ───────────── Vòng lặp vẽ ───────────── */
function fit() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h); labelRenderer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', fit);
fit();

const turn = (g, ang, k) => {
  const diff = ((ang - g.rotation.y + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  g.rotation.y += diff * Math.min(1, k);
};
const lerp = (a, b, k) => a + (b - a) * Math.min(1, k);

function animatePerson(p, { walking, seated, working, t, seed, dt }) {
  const k = dt * 10;
  const ps = p.pose;
  const sw = Math.sin(t * 9 + seed);
  let hip = 0, knee = 0, sh = [0, 0], elb = [-0.15, -0.15], sit = 0;
  if (walking) {
    hip = sw * 0.55; knee = 0;
    sh = [-sw * 0.5, sw * 0.5]; elb = [-0.3, -0.3];
  } else if (seated) {
    sit = 1; hip = -Math.PI / 2; knee = Math.PI / 2;
    if (working) {
      const ty = Math.sin(t * 22 + seed) * 0.08;
      sh = [-0.75 + ty, -0.75 - ty]; elb = [-0.75, -0.75];
    } else { sh = [-0.35, -0.35]; elb = [-0.9, -0.9]; }
  }
  ps.sit = lerp(ps.sit, sit, k);
  ps.hip = walking ? hip : lerp(ps.hip, hip, k);
  ps.knee = lerp(ps.knee, knee, k);
  p.body.position.y = -0.3 * ps.sit + (walking ? Math.abs(sw) * 0.05 : 0);
  p.legs[0].hip.rotation.x = walking ? hip : ps.hip;
  p.legs[1].hip.rotation.x = walking ? -hip : ps.hip;
  p.legs[0].knee.rotation.x = walking ? Math.max(0, -sw) * 0.6 : ps.knee;
  p.legs[1].knee.rotation.x = walking ? Math.max(0, sw) * 0.6 : ps.knee;
  for (let i = 0; i < 2; i++) {
    ps.sh[i] = walking ? sh[i] : lerp(ps.sh[i], sh[i], k);
    ps.el[i] = lerp(ps.el[i], elb[i], k);
    p.arms[i].sh.rotation.x = ps.sh[i];
    p.arms[i].el.rotation.x = ps.el[i];
  }
  if (working && !walking) {
    p.head.rotation.x = 0.18 + Math.sin(t * 3 + seed) * 0.05;
    p.head.rotation.y = Math.sin(t * 1.3 + seed) * 0.15;
  } else {
    p.head.rotation.x *= 0.9; p.head.rotation.y *= 0.9;
  }
}

// Camera bay tới một điểm (bấm vào nhân viên) hoặc về toàn cảnh
const HOME_VIEW = { pos: camera.position.clone(), target: controls.target.clone() };
let camAnim = null;
function flyTo(target, pos) {
  camAnim = { t: 0, fromP: camera.position.clone(), fromT: controls.target.clone(), toP: pos, toT: target };
}
function focusOn(obj) {
  const tgt = obj.position.clone().setY(1);
  const dir = camera.position.clone().sub(controls.target).setY(0).normalize();
  flyTo(tgt, tgt.clone().addScaledVector(dir, 4.5).setY(4.2));
}
$('#resetView').onclick = () => flyTo(HOME_VIEW.target.clone(), HOME_VIEW.pos.clone());

const clock = new THREE.Clock();
let blink = 0;
function tick() {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  if (camAnim) {
    camAnim.t = Math.min(1, camAnim.t + dt * 1.4);
    const e = 1 - Math.pow(1 - camAnim.t, 3);
    camera.position.lerpVectors(camAnim.fromP, camAnim.toP, e);
    controls.target.lerpVectors(camAnim.fromT, camAnim.toT, e);
    if (camAnim.t >= 1) camAnim = null;
  }
  for (const ag of agents.values()) {
    let walking = false;
    if (ag.path.length) {
      const wp = ag.path[0];
      const d = wp.p.clone().sub(ag.root.position); d.y = 0;
      const dist = d.length();
      if (dist < 0.06) {
        ag.root.position.copy(wp.p);
        ag.path.shift();
        if (!ag.path.length) { ag.seated = !!wp.seat; ag.faceRot = wp.rot ?? ag.root.rotation.y; }
      } else {
        walking = true; ag.seated = false;
        ag.root.position.addScaledVector(d.normalize(), Math.min(dist, 2.8 * dt));
        turn(ag.root, Math.atan2(d.x, d.z), dt * 10);
      }
    }
    if (!walking) turn(ag.root, ag.faceRot, dt * 8);
    animatePerson(ag, { walking, seated: ag.seated, working: ag.status === 'working', t, seed: ag.seed, dt });
    ag.light.scale.setScalar(ag.status === 'working' ? 1 + Math.sin(t * 8) * 0.25 : 1);
  }
  if (boss) animatePerson(boss, { walking: false, seated: false, working: false, t, seed: 0, dt });
  for (let i = papers.length - 1; i >= 0; i--) {
    const p = papers[i];
    p.t += dt / 1.3;
    p.m.position.lerpVectors(p.from, p.to, p.t);
    p.m.position.y += Math.sin(p.t * Math.PI) * 2.5;
    p.m.rotation.y += dt * 6;
    if (p.t >= 1) { scene.remove(p.m); papers.splice(i, 1); }
  }
  if ((blink += dt) > 0.15) {
    blink = 0;
    for (const l of leds) if (Math.random() < 0.3) l.material.emissiveIntensity = Math.random() < 0.5 ? 0.2 : 1.4;
    for (const ag of agents.values()) if (ag.status === 'working') drawScreen(ag.screen, Math.floor(t * 2) % 2 === 0);
  }
  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
  requestAnimationFrame(tick);
}
drawKanban([]);
tick();

/* Bấm vào nhân viên / tủ hồ sơ */
const ray = new THREE.Raycaster();
const ptr = new THREE.Vector2();
let downAt = null;
renderer.domElement.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
  const r = renderer.domElement.getBoundingClientRect();
  ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ptr, camera);
  const hit = ray.intersectObjects([...[...agents.values()].map((a) => a.root), cabinet], true)[0];
  if (!hit) return;
  if (hit.object === cabinet) return openTab('log');
  if (agents.has(hit.object.userData.id)) showAgent(hit.object.userData.id, true);
});

let cardFor = null;
function showAgent(id, focus = false) {
  const ag = agents.get(id);
  if (!ag) return;
  cardFor = id;
  if (focus) focusOn(ag.root);
  const a = ag.a;
  const card = $('#agentCard');
  card.hidden = false;
  card.innerHTML = '';
  const close = el('button', 'close', '×'); close.onclick = () => { card.hidden = true; cardFor = null; };
  card.append(close, el('h3', '', `${a.emoji} ${a.role}`), el('div', 'role', a.dept));
  const dl = el('dl');
  const st = { idle: 'Đang rảnh', working: 'Đang làm việc', waiting: 'Đang chờ', error: 'Gặp lỗi' }[ag.status];
  for (const [k, v] of [['Trạng thái', st], ['Model', a.model], ['Công cụ', a.tools.join(', ')], ['Tính cách', a.persona]]) dl.append(el('dt', '', k), el('dd', '', v));
  card.append(dl, el('pre', '', ag.screen.lines.slice(-14).join('\n') || '(chưa làm gì)'));
}

/* ───────────── Bảng điều khiển ───────────── */
const PHASE = { idle: 'Đang rảnh', meeting: 'Đang họp chia việc', work: 'Các phòng đang làm việc', approval: 'Chờ sếp duyệt', git: 'Đang đưa lên GitHub', done: 'Hoàn thành ✓', error: 'Đã dừng' };
const RESULT = { done: '✅ Hoàn thành', kept: '💾 Đã lưu trên máy (không push)', stopped: '⏹️ Đã dừng giữa chừng', error: '❌ Gặp lỗi' };

function setRunning(v) {
  $('#startBtn').disabled = v;
  $('#stopBtn').disabled = !v;
}
function setPhase(p) {
  const ph = $('#phase');
  ph.textContent = PHASE[p] || p;
  ph.classList.toggle('live', ['meeting', 'work', 'git'].includes(p));
  goMeeting(p === 'meeting');
}
function setStatus(id, status) {
  const ag = agents.get(id);
  if (!ag) return;
  ag.status = status;
  ag.light.material.color.set(STATUS_COLOR[status] || STATUS_COLOR.idle);
  if (status !== 'working') drawScreen(ag.screen);
  renderTeam();
  if (cardFor === id) showAgent(id);
}
function who(id) {
  if (id === 'boss') return { role: 'Sếp', emoji: '🙋', color: '#f5b544' };
  return meta.find((m) => m.id === id) || { role: id, emoji: '•', color: '#999' };
}
function addLog(e, fly = true) {
  const list = $('#log');
  list.querySelector('.empty')?.remove();
  const a = who(e.agent);
  const li = el('li');
  const time = el('time', '', new Date(e.time).toLocaleTimeString('vi-VN', { hour12: false }));
  const head = el('div');
  const w = el('span', 'who', `${a.emoji} ${a.role}`); w.style.color = a.color;
  head.append(w, document.createTextNode(' · ' + e.action));
  li.append(time, head);
  if (e.detail) {
    const d = el('div', 'detail', e.detail);
    d.onclick = () => d.classList.toggle('open');
    li.append(d);
  }
  list.append(li);
  li.scrollIntoView({ block: 'end' });
  if (fly) flyPaper(e.agent);
}
function renderBoard(cards) {
  drawKanban(cards);
  const b = $('#board');
  b.innerHTML = '';
  if (!cards.length) return b.append(el('div', 'empty', 'Chưa có việc nào.'));
  for (const [key, name] of COLS) {
    const col = el('div', 'col');
    col.append(el('h4', '', `${name} (${cards.filter((c) => c.col === key).length})`));
    for (const c of cards.filter((k) => k.col === key)) {
      const a = who(c.owner);
      const card = el('div', 'card', c.title);
      card.style.borderLeftColor = a.color;
      card.append(el('small', '', `${a.emoji} ${a.dept || a.role}`));
      col.append(card);
    }
    b.append(col);
  }
}
function renderTeam() {
  const t = $('#team');
  t.innerHTML = '';
  for (const a of meta) {
    const ag = agents.get(a.id);
    const row = el('div', 'member');
    const info = el('div');
    info.append(el('b', '', a.dept), el('small', '', `${a.role} · ${a.model}`));
    row.append(el('span', 'em', a.emoji), info, el('span', 'dot ' + (ag?.status || 'idle')));
    row.onclick = () => showAgent(a.id, true);
    t.append(row);
  }
}
function renderApproval(ap) {
  const box = $('#approval');
  box.hidden = !ap;
  if (!ap) return;
  box.innerHTML = '';
  box.append(el('h2', '', '🐙 Các phòng đã làm xong, đưa code lên?'));
  if (!ap.passed) box.append(el('p', 'warn', '⚠️ Code chưa qua hết kiểm tra sau 3 vòng sửa.'));
  box.append(el('p', '', ap.repoUrl ? `Sẽ commit và push lên ${ap.repoUrl}` : 'Không có link GitHub: chỉ commit trên máy.'));
  const ul = el('ul');
  for (const f of ap.files) ul.append(el('li', '', f));
  box.append(ul, el('p', '', 'Thư mục dự án:'), el('code', 'path', ap.dir));
  const row = el('div', 'row');
  const yes = el('button', 'ok', 'Đồng ý');
  const no = el('button', 'ghost', 'Không, giữ trên máy');
  yes.onclick = () => send({ type: 'approve', ok: true });
  no.onclick = () => send({ type: 'approve', ok: false });
  row.append(yes, no);
  box.append(row);
}

// Ô kết quả: hiện rõ dự án đang được lưu ở đâu
function renderResult(r) {
  const box = $('#result');
  box.hidden = !r;
  if (!r) return;
  box.innerHTML = '';
  box.classList.toggle('bad', r.status === 'error' || r.status === 'stopped');
  box.append(el('h2', '', RESULT[r.status] || r.status));
  box.append(el('p', '', '📁 Dự án được lưu tại:'), el('code', 'path', r.dir));
  const meta = el('div', 'meta');
  meta.append(el('span', 'tag', r.passed ? '✅ Qua kiểm tra' : '⚠️ Chưa qua kiểm tra'));
  meta.append(el('span', 'tag', r.pushed ? `🐙 Đã push lên ${r.repoUrl}` : r.committed ? `💾 Commit ${r.commit} trên máy` : 'Chưa commit'));
  meta.append(el('span', 'tag', r.mode));
  if (r.cost) meta.append(el('span', 'tag', `≈ $${r.cost.toFixed(3)}`));
  box.append(meta);
  const det = el('details');
  det.append(el('summary', '', `${r.files.length} file`));
  const ul = el('ul');
  for (const f of r.files) ul.append(el('li', '', f));
  det.append(ul);
  box.append(det);
  if (r.gitOk === false) box.append(el('p', 'warn', '⚠️ Chưa đưa lên được. Xem lý do trong Nhật ký.'));
  box.append(actions(r.folder, r.dir, r));
}
// Đưa lên GitHub: chỉ chạy khi cậu bấm nút này
function publish(folder, repoUrl) {
  const link = prompt('Dán link repo GitHub TRỐNG để commit và push.\nBỏ trống rồi bấm OK = chỉ commit trên máy.', repoUrl || '');
  if (link === null) return;
  send({ type: 'publish', folder, repoUrl: link.trim() });
}
function actions(folder, dir, p = {}) {
  const row = el('div', 'actions');
  const gh = el('button', '', p.pushed ? '🐙 Push lại' : '🐙 Đưa lên GitHub');
  gh.title = p.pushed ? `Đã push lên ${p.repoUrl}` : 'Commit và push dự án này (chỉ khi cậu bấm)';
  gh.onclick = () => publish(folder, p.repoUrl);
  row.append(gh);
  const more = el('button', '', '✏️ Làm tiếp');
  more.title = 'Giao thêm việc cho dự án này (sửa, thêm tính năng) trên code đang có';
  more.onclick = () => continueProject(folder);
  row.append(more);
  const open = el('button', 'primary', '📂 Mở thư mục');
  open.onclick = () => openFolder(folder);
  const copy = el('button', '', '📋 Chép đường dẫn');
  copy.onclick = async () => {
    try { await navigator.clipboard.writeText(dir); copy.textContent = '✓ Đã chép'; } catch { copy.textContent = 'Không chép được'; }
    setTimeout(() => (copy.textContent = '📋 Chép đường dẫn'), 1500);
  };
  const log = el('button', '', '📝 Nhật ký');
  log.onclick = () => { openTab('projects'); showLog(folder); };
  row.append(open, copy, log);
  return row;
}
function openFolder(folder = '') {
  fetch('/api/open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folder }) });
}
$('#openRoot').onclick = () => openFolder('');

let billing = 'subscription';
function setCost(c) {
  const el = $('#cost');
  if (!c) { el.textContent = ''; return; }
  el.textContent = billing === 'api' ? `≈ $${c.toFixed(3)}` : `≈ $${c.toFixed(3)} · gói Pro`;
  el.title = billing === 'api' ? 'Số tiền bị trừ vào API key' : 'Chỉ là ước tính. Tính vào gói Claude Pro, không trừ thêm tiền.';
}

function openTab(name) {
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
  document.querySelectorAll('.tab').forEach((s) => s.classList.toggle('on', s.id === 'tab-' + name));
  if (name === 'projects') loadProjects();
}
document.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => openTab(b.dataset.tab)));

const STATUS_TEXT = { running: '⏳ Đang làm', ...RESULT };
async function loadProjects() {
  const data = await fetch('/api/projects').then((r) => r.json()).catch(() => ({ projects: [] }));
  fillPicker(data.projects);
  const head = $('#projectsDir');
  head.innerHTML = '';
  const open = el('button', 'small', '📁 Mở kho');
  open.onclick = () => openFolder('');
  head.append(el('span', '', 'Mọi dự án được lưu chung tại:'), el('code', 'path', data.projectsDir || ''), open);
  const list = $('#projects');
  list.innerHTML = '';
  if (!data.projects.length) return list.append(el('div', 'empty', 'Chưa có dự án nào.'));
  for (const p of data.projects) {
    const item = el('div', 'project');
    item.append(el('b', '', p.task), el('div', 'folder', p.folder));
    if (p.updates?.length) item.append(el('small', 'folder', `✏️ Đã làm tiếp ${p.updates.length} lần · mới nhất: ${p.updates.at(-1).task}`));
    const m = el('div', 'meta');
    m.append(el('span', 'tag', STATUS_TEXT[p.status] || p.status), el('span', 'tag', new Date(p.createdAt).toLocaleString('vi-VN')), el('span', 'tag', p.pushed ? '🐙 đã push' : p.committed ? '💾 commit trên máy' : 'chưa commit'));
    const row = actions(p.folder, p.dir, p);
    if (previewPort && p.files?.some((f) => f.endsWith('.html'))) {
      const entry = ['index.html', 'public/index.html', 'src/index.html'].find((f) => p.files.includes(f)) || p.files.find((f) => f.endsWith('.html'));
      const view = el('a', 'btn', '👁 Xem trang');
      view.href = `http://127.0.0.1:${previewPort}/${encodeURIComponent(p.folder)}/${entry}`;
      view.target = '_blank';
      view.rel = 'noopener';
      row.prepend(view);
    }
    item.append(m, row);
    list.append(item);
  }
}
async function showLog(folder) {
  $('#logView').textContent = await fetch(`/api/projects/${encodeURIComponent(folder)}/log`).then((r) => r.text());
  $('#logView').scrollIntoView({ block: 'start' });
}

/* ───────────── Kết nối server ───────────── */
let ws;
let previewPort = null;
const send = (m) => ws?.readyState === 1 && ws.send(JSON.stringify(m));
function connect() {
  ws = new WebSocket(`ws://${location.host}`);
  ws.onmessage = (ev) => handle(JSON.parse(ev.data));
  ws.onclose = () => { $('#phase').textContent = 'Mất kết nối, đang thử lại...'; setTimeout(connect, 1500); };
}
function handle(m) {
  switch (m.type) {
    case 'state': {
      meta = m.meta;
      previewPort = m.previewPort;
      billing = m.billing || 'subscription';
      if (!built) buildAgents();
      setRunning(m.running);
      for (const [id, s] of Object.entries(m.agents)) {
        const ag = agents.get(id);
        if (ag) { ag.screen.lines = [...s.screen]; drawScreen(ag.screen); }
        setStatus(id, s.status);
      }
      $('#log').innerHTML = '';
      if (!m.logs.length) $('#log').append(el('div', 'empty', 'Nhật ký trống. Giao việc để các phòng bắt đầu làm.'));
      m.logs.forEach((e) => addLog(e, false));
      renderBoard(m.kanban);
      renderApproval(m.approval);
      renderResult(m.result);
      setPhase(m.phase);
      setCost(m.cost);
      renderTeam();
      if (m.task) showBubble(bossBubble, m.task, 8000);
      break;
    }
    case 'agent': setStatus(m.id, m.status); break;
    case 'screen': {
      const ag = agents.get(m.id);
      if (!ag) break;
      ag.screen.lines.push(m.line);
      if (ag.screen.lines.length > 40) ag.screen.lines.shift();
      drawScreen(ag.screen);
      if (cardFor === m.id) showAgent(m.id);
      break;
    }
    case 'say': { const ag = agents.get(m.id); if (ag) showBubble(ag.bubble, m.text); break; }
    case 'log': addLog(m.entry); break;
    case 'kanban': renderBoard(m.cards); break;
    case 'phase': setPhase(m.phase); break;
    case 'approval': renderApproval(m.approval); break;
    case 'result': renderResult(m.result); refreshProjects(); break;
    case 'cost': setCost(m.cost); break;
    case 'run': setRunning(m.running); setCost(m.cost); break;
    case 'error': alert(m.message); break;
  }
}
connect();

// Báo khi server đang chạy bản code cũ (bật trước khi code được sửa)
async function checkVersion() {
  let stale = true;
  try { const r = await fetch('/api/version'); stale = !r.ok || (await r.json()).stale; } catch { return; }
  $('#staleWarn').hidden = !stale;
}
checkVersion();
setInterval(checkVersion, 30000);

// Nhớ lựa chọn demo / tự mở trang của cậu cho lần sau
const pref = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v === '1'; } catch { return d; } };
const savePref = (k, v) => { try { localStorage.setItem(k, v ? '1' : '0'); } catch {} };
$('#demo').checked = pref('aio-demo', false);
$('#autoLive').checked = pref('aio-autolive', true);
const syncDemo = () => { $('#demoWarn').hidden = !$('#demo').checked; };
syncDemo();
$('#demo').onchange = () => { savePref('aio-demo', $('#demo').checked); syncDemo(); };
$('#autoLive').onchange = () => savePref('aio-autolive', $('#autoLive').checked);

/* Đính kèm ảnh tham khảo: nút chọn ảnh, dán (Ctrl+V), kéo thả */
const IMG_OK = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const IMG_MAX = 6;
const IMG_MAX_BYTES = 5 * 1024 * 1024;
let attachments = [];
function attachError(msg) {
  const e = $('#attachErr');
  e.textContent = msg || '';
  e.hidden = !msg;
}
function renderThumbs() {
  const box = $('#thumbs');
  box.innerHTML = '';
  attachments.forEach((a, i) => {
    const t = el('div', 'thumb');
    const img = el('img');
    img.src = a.url;
    img.alt = a.name;
    img.title = a.name;
    const x = el('button', '', '×');
    x.setAttribute('aria-label', 'Bỏ ảnh ' + a.name);
    x.onclick = () => { attachments.splice(i, 1); renderThumbs(); attachError(''); };
    t.append(img, x);
    box.append(t);
  });
}
function addImages(files) {
  attachError('');
  for (const f of files) {
    if (!IMG_OK.includes(f.type)) { attachError(`"${f.name}" không phải ảnh PNG, JPG, WEBP hoặc GIF.`); continue; }
    if (f.size > IMG_MAX_BYTES) { attachError(`"${f.name}" lớn hơn 5 MB.`); continue; }
    if (attachments.length >= IMG_MAX) { attachError(`Tối đa ${IMG_MAX} ảnh mỗi lần.`); break; }
    const item = { name: f.name || 'anh-dan.png', type: f.type, data: null, url: '' };
    attachments.push(item);
    const r = new FileReader();
    r.onload = () => { item.url = r.result; item.data = String(r.result).split(',')[1]; renderThumbs(); };
    r.onerror = () => { attachments = attachments.filter((a) => a !== item); attachError(`Không đọc được "${f.name}".`); renderThumbs(); };
    r.readAsDataURL(f);
  }
}
$('#imgInput').onchange = (e) => { addImages([...e.target.files]); e.target.value = ''; };
$('#task').addEventListener('paste', (e) => {
  const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
  if (files.length) { e.preventDefault(); addImages(files); }
});
$('#task').addEventListener('dragover', (e) => { e.preventDefault(); $('#task').classList.add('dragging'); });
$('#task').addEventListener('dragleave', () => $('#task').classList.remove('dragging'));
$('#task').addEventListener('drop', (e) => {
  e.preventDefault();
  $('#task').classList.remove('dragging');
  addImages([...(e.dataTransfer?.files || [])]);
});

$('#startBtn').onclick = () => {
  const task = $('#task').value.trim();
  if (!task) return $('#task').focus();
  if ($('#demo').checked && !confirm('Đang bật CHẾ ĐỘ DEMO: đội chỉ diễn thử và ra một trang mẫu, KHÔNG làm theo yêu cầu của cậu.\n\nVẫn chạy demo? (Bấm Huỷ rồi bỏ tick "Chế độ demo" để AI làm thật.)')) return;
  // Mở ngay trong lúc bấm nút để trình duyệt không chặn cửa sổ mới
  if ($('#autoLive').checked) window.open('/live.html', 'ai-office-live');
  renderResult(null);
  if (attachments.some((a) => !a.data)) return attachError('Ảnh đang được đọc, đợi một chút rồi bấm lại.');
  send({ type: 'start', task, folder: $('#projectPick').value, demo: $('#demo').checked, images: attachments.map(({ name, type, data }) => ({ name, type, data })) });
  attachments = [];
  renderThumbs();
  attachError('');
  setRunning(true);
};
$('#stopBtn').onclick = () => send({ type: 'stop' });

/* Làm tiếp dự án cũ: chọn dự án trong ô giao việc hoặc bấm ✏️ Làm tiếp */
let projectList = [];
function refreshProjects() {
  if ($('#tab-projects').classList.contains('on')) return loadProjects();
  fetch('/api/projects').then((r) => r.json()).then((d) => fillPicker(d.projects)).catch(() => {});
}
function fillPicker(list = []) {
  projectList = list;
  const sel = $('#projectPick');
  const keep = sel.value;
  sel.innerHTML = '';
  sel.append(new Option('🆕 Dự án mới', ''));
  for (const p of list) {
    const day = new Date(p.createdAt).toLocaleDateString('vi-VN');
    const name = p.task.length > 48 ? p.task.slice(0, 47) + '…' : p.task;
    sel.append(new Option(`✏️ ${name} (${day})`, p.folder));
  }
  sel.value = list.some((p) => p.folder === keep) ? keep : '';
  syncPicker();
}
function syncPicker() {
  const p = projectList.find((x) => x.folder === $('#projectPick').value);
  const note = $('#contNote');
  note.hidden = !p;
  $('#task').placeholder = p
    ? 'Muốn sửa hoặc thêm gì cho dự án này? Ví dụ: Đổi màu chủ đạo sang xanh lá, thêm trang Liên hệ'
    : 'Ví dụ: Làm trang web máy tính bỏ túi có cộng, trừ, nhân, chia và có test';
  $('#startBtn').textContent = p ? '✏️ Giao việc làm tiếp' : 'Giao việc';
  if (!p) return;
  note.innerHTML = '';
  note.append('Đội sẽ làm tiếp trên code cũ của ', el('b', '', p.task), ', chỉ sửa và thêm phần cậu yêu cầu. ');
  const back = el('button', 'small', 'Chuyển về dự án mới');
  back.onclick = () => { $('#projectPick').value = ''; syncPicker(); };
  note.append(back);
}
function continueProject(folder) {
  const sel = $('#projectPick');
  if (![...sel.options].some((o) => o.value === folder)) return refreshProjects();
  sel.value = folder;
  syncPicker();
  $('#panel').scrollTo({ top: 0, behavior: 'smooth' });
  $('#task').focus();
}
$('#projectPick').onchange = syncPicker;
refreshProjects();
