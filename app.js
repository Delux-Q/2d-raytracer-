// ============================================================
// 2D SINGLE-RAY TRACER  —  refraction + total internal reflection
// With pan, pinch-zoom, and a separate world / screen coordinate space.
// ============================================================

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const zoomBadge = document.getElementById('zoomBadge');
const fitBtn = document.getElementById('fitBtn');

// ---------- Scene (all in WORLD coordinates) ----------
let boxes = [];
let ray = { x: 60, y: 60, angle: 0.6 };
let selectedBox = null;

// ---------- Viewport ----------
// Screen point  = world * scale + offset
// World point   = (screen - offset) / scale
const view = { scale: 1, offsetX: 0, offsetY: 0 };
const MIN_SCALE = 0.05;
const MAX_SCALE = 20;

// ---------- Constants ----------
const EPS = 1e-6;
const MAX_BOUNCES = 200;
const RAY_LEN_LIMIT = 200000;   // world units; large so zoom-out doesn't truncate
const HANDLE_R_PX = 14;         // touch handle radius in SCREEN pixels

// ============================================================
// COORDINATE HELPERS
// ============================================================
function screenToWorld(sx, sy) {
  return { x: (sx - view.offsetX) / view.scale, y: (sy - view.offsetY) / view.scale };
}
function handleRadiusWorld() { return HANDLE_R_PX / view.scale; }

// ============================================================
// SCENE SETUP
// ============================================================
function defaultScene() {
  boxes = [
    { kind: 'medium', x: 120, y: 200, w: 220, h: 120, n: 1.50 },
    { kind: 'medium', x: 80,  y: 360, w: 280, h: 100, n: 2.00 },
    { kind: 'medium', x: 200, y: 100, w: 120, h: 80,  n: 1.33 },
    { kind: 'kill',   x: 480, y: 200, w: 120, h: 220 },
  ];
  ray = { x: 30, y: 80, angle: 0.5 };
  selectedBox = null;
  updateSelectionUI();
}

// Compute bounds of the scene (boxes + ray origin + aim handle).
function sceneBounds() {
  let minX = ray.x, minY = ray.y, maxX = ray.x, maxY = ray.y;
  // Include the aim handle (60px from origin in WORLD units... but the aim
  // is in screen pixels, so just include the ray origin and a 60-unit pad).
  const pad = 80;
  for (const b of boxes) {
    if (b.x < minX) minX = b.x;
    if (b.y < minY) minY = b.y;
    if (b.x + b.w > maxX) maxX = b.x + b.w;
    if (b.y + b.h > maxY) maxY = b.y + b.h;
  }
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

function fitToScene() {
  const W = canvas.clientWidth, H = canvas.clientHeight;
  const b = sceneBounds();
  const sw = b.maxX - b.minX;
  const sh = b.maxY - b.minY;
  if (sw <= 0 || sh <= 0) return;
  const sx = W / sw, sy = H / sh;
  view.scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.min(sx, sy)));
  view.offsetX = (W - sw * view.scale) / 2 - b.minX * view.scale;
  view.offsetY = (H - sh * view.scale) / 2 - b.minY * view.scale;
  draw();
}

// ============================================================
// CANVAS SIZING
// ============================================================
function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = Math.max(1, w * dpr);
  canvas.height = Math.max(1, h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}
window.addEventListener('resize', resizeCanvas);
window.addEventListener('orientationchange', () => setTimeout(resizeCanvas, 100));

// ============================================================
// COLOURS
// ============================================================
function colorForN(n) {
  const t = Math.max(0, Math.min(1, (n - 1.0) / 3.0));
  const r = Math.round(80 + t * 175);
  const g = Math.round(180 - t * 140);
  const b = Math.round(220 - t * 60);
  return `rgba(${r},${g},${b},0.35)`;
}
function strokeForN(n) {
  const t = Math.max(0, Math.min(1, (n - 1.0) / 3.0));
  const r = Math.round(80 + t * 175);
  const g = Math.round(180 - t * 140);
  const b = Math.round(220 - t * 60);
  return `rgb(${r},${g},${b})`;
}

// ============================================================
// RAY TRACING (operates in WORLD coordinates)
// ============================================================
function mediumAt(px, py) {
  let hit = null;
  for (const b of boxes) {
    if (b.kind !== 'medium') continue;
    if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) hit = b;
  }
  return hit;
}
function indexAt(px, py) { const m = mediumAt(px, py); return m ? m.n : 1.0; }

// Trace next boundary the ray crosses. World-space ray clipped to
// the visible viewport rectangle (so the ray terminates on the
// screen edge when it would otherwise fly off to infinity).
function nextBoundary(x, y, dx, dy) {
  let best = null;

  const consider = (t, nx, ny, box) => {
    if (t <= EPS) return;
    if (best && t >= best.t) return;
    best = { t, nx, ny, hitX: x + dx * t, hitY: y + dy * t, box };
  };

  for (const b of boxes) {
    if (Math.abs(dx) > EPS) {
      let t = (b.x - x) / dx;
      let hy = y + dy * t;
      if (t > EPS && hy >= b.y - EPS && hy <= b.y + b.h + EPS) consider(t, -1, 0, b);
      t = (b.x + b.w - x) / dx;
      hy = y + dy * t;
      if (t > EPS && hy >= b.y - EPS && hy <= b.y + b.h + EPS) consider(t, 1, 0, b);
    }
    if (Math.abs(dy) > EPS) {
      let t = (b.y - y) / dy;
      let hx = x + dx * t;
      if (t > EPS && hx >= b.x - EPS && hx <= b.x + b.w + EPS) consider(t, 0, -1, b);
      t = (b.y + b.h - y) / dy;
      hx = x + dx * t;
      if (t > EPS && hx >= b.x - EPS && hx <= b.x + b.w + EPS) consider(t, 0, 1, b);
    }
  }

  // Viewport edges (in world coords) terminate the ray cleanly.
  const tl = screenToWorld(0, 0);
  const br = screenToWorld(canvas.clientWidth, canvas.clientHeight);
  const wMinX = tl.x, wMinY = tl.y, wMaxX = br.x, wMaxY = br.y;
  if (dx > EPS)  consider((wMaxX - x) / dx, 1, 0, null);
  if (dx < -EPS) consider((wMinX - x) / dx, -1, 0, null);
  if (dy > EPS)  consider((wMaxY - y) / dy, 0, 1, null);
  if (dy < -EPS) consider((wMinY - y) / dy, 0, -1, null);

  return best;
}

function refract(dx, dy, nx, ny, n1, n2) {
  const cosI = -(dx * nx + dy * ny);
  const eta = n1 / n2;
  const sin2T = eta * eta * (1 - cosI * cosI);
  if (sin2T > 1) return null;
  const cosT = Math.sqrt(1 - sin2T);
  return { dx: eta * dx + (eta * cosI - cosT) * nx, dy: eta * dy + (eta * cosI - cosT) * ny };
}
function reflect(dx, dy, nx, ny) {
  const d = dx * nx + dy * ny;
  return { dx: dx - 2 * d * nx, dy: dy - 2 * d * ny };
}

function traceRay() {
  const segments = [];
  const tirPoints = [];
  const killPoints = [];

  let x = ray.x, y = ray.y;
  let dx = Math.cos(ray.angle), dy = Math.sin(ray.angle);
  let totalLen = 0;

  // Nudge in world units, but make it proportional to current zoom so
  // it's well-behaved when zoomed way in or out.
  const nudge = Math.max(EPS * 10, 0.01 / view.scale);

  for (let i = 0; i < MAX_BOUNCES; i++) {
    const hit = nextBoundary(x, y, dx, dy);
    if (!hit) break;

    segments.push({ x1: x, y1: y, x2: hit.hitX, y2: hit.hitY });
    totalLen += hit.t;
    if (totalLen > RAY_LEN_LIMIT) break;

    // Hit a kill box → terminate.
    if (hit.box && hit.box.kind === 'kill') {
      killPoints.push({ x: hit.hitX, y: hit.hitY });
      break;
    }

    const n1 = indexAt(hit.hitX - dx * nudge, hit.hitY - dy * nudge);
    const n2 = indexAt(hit.hitX + dx * nudge, hit.hitY + dy * nudge);

    if (Math.abs(n1 - n2) < 1e-9) {
      x = hit.hitX + dx * nudge;
      y = hit.hitY + dy * nudge;
      continue;
    }

    let nx = hit.nx, ny = hit.ny;
    if (dx * nx + dy * ny > 0) { nx = -nx; ny = -ny; }

    const r = refract(dx, dy, nx, ny, n1, n2);
    if (r) {
      dx = r.dx; dy = r.dy;
    } else {
      tirPoints.push({ x: hit.hitX, y: hit.hitY });
      const rr = reflect(dx, dy, nx, ny);
      dx = rr.dx; dy = rr.dy;
    }
    x = hit.hitX + dx * nudge;
    y = hit.hitY + dy * nudge;
  }

  return { segments, tirPoints, killPoints };
}

// ============================================================
// DRAWING
// ============================================================
function draw() {
  const W = canvas.clientWidth, H = canvas.clientHeight;
  ctx.clearRect(0, 0, W, H);

  // Grid in WORLD space, drawn through the current transform.
  // We pick the visible world rect and step at a sensible grid size.
  const tl = screenToWorld(0, 0);
  const br = screenToWorld(W, H);
  // Choose grid step so lines stay ~40px apart on screen.
  const targetPx = 40;
  const rawStep = targetPx / view.scale;
  const pow = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const candidates = [1, 2, 5, 10].map(m => m * pow);
  let step = candidates[0];
  for (const c of candidates) if (Math.abs(c - rawStep) < Math.abs(step - rawStep)) step = c;

  ctx.save();
  ctx.translate(view.offsetX, view.offsetY);
  ctx.scale(view.scale, view.scale);

  // Grid
  ctx.strokeStyle = '#1a212c';
  ctx.lineWidth = 1 / view.scale;
  const gx0 = Math.floor(tl.x / step) * step;
  const gy0 = Math.floor(tl.y / step) * step;
  for (let x = gx0; x <= br.x; x += step) {
    ctx.beginPath(); ctx.moveTo(x, tl.y); ctx.lineTo(x, br.y); ctx.stroke();
  }
  for (let y = gy0; y <= br.y; y += step) {
    ctx.beginPath(); ctx.moveTo(tl.x, y); ctx.lineTo(br.x, y); ctx.stroke();
  }

  // Boxes
  for (const b of boxes) {
    if (b.kind === 'kill') {
      // Dashed red outline, transparent fill so you can see through it.
      ctx.fillStyle = 'rgba(255, 77, 79, 0.08)';
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = '#ff4d4f';
      ctx.lineWidth = ((b === selectedBox) ? 3 : 2) / view.scale;
      ctx.setLineDash([8 / view.scale, 6 / view.scale]);
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      ctx.setLineDash([]);

      // Label
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.scale(1 / view.scale, 1 / view.scale);
      const label = 'KILL';
      ctx.font = 'bold 13px -apple-system, sans-serif';
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(13,17,23,0.75)';
      ctx.fillRect(6, 6, tw + 10, 20);
      ctx.fillStyle = '#ff4d4f';
      ctx.fillText(label, 11, 21);
      ctx.restore();
    } else {
      ctx.fillStyle = colorForN(b.n);
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = strokeForN(b.n);
      ctx.lineWidth = ((b === selectedBox) ? 3 : 1.5) / view.scale;
      ctx.strokeRect(b.x, b.y, b.w, b.h);

      // Label — drawn in screen-pixel units so it stays legible at any zoom.
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.scale(1 / view.scale, 1 / view.scale);
      const label = 'n = ' + b.n.toFixed(2);
      ctx.font = 'bold 13px -apple-system, sans-serif';
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(13,17,23,0.75)';
      ctx.fillRect(6, 6, tw + 10, 20);
      ctx.fillStyle = '#e6edf3';
      ctx.fillText(label, 11, 21);
      ctx.restore();
    }

    if (b === selectedBox) {
      // Resize handle — drawn at constant screen size.
      ctx.fillStyle = (b.kind === 'kill') ? '#ff4d4f' : '#1f6feb';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2 / view.scale;
      ctx.beginPath();
      ctx.arc(b.x + b.w, b.y + b.h, (HANDLE_R_PX * 0.6) / view.scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  // Ray
  const { segments, tirPoints, killPoints } = traceRay();
  ctx.strokeStyle = '#ffeb3b';
  ctx.lineWidth = 2 / view.scale;
  ctx.beginPath();
  for (const s of segments) {
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
  }
  ctx.stroke();

  for (const p of tirPoints) {
    ctx.fillStyle = '#ff4d4f';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2 / view.scale;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6 / view.scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Kill markers — red X
  for (const p of killPoints) {
    const r = 8 / view.scale;
    ctx.strokeStyle = '#ff4d4f';
    ctx.lineWidth = 3 / view.scale;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(p.x - r, p.y - r); ctx.lineTo(p.x + r, p.y + r);
    ctx.moveTo(p.x + r, p.y - r); ctx.lineTo(p.x - r, p.y + r);
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  // Ray origin handle
  ctx.fillStyle = '#ffeb3b';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2 / view.scale;
  ctx.beginPath();
  ctx.arc(ray.x, ray.y, (HANDLE_R_PX * 0.55) / view.scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Aim handle — 60 SCREEN pixels along the ray
  const aimWorldDist = 60 / view.scale;
  const aimX = ray.x + Math.cos(ray.angle) * aimWorldDist;
  const aimY = ray.y + Math.sin(ray.angle) * aimWorldDist;
  ctx.strokeStyle = '#ffeb3b';
  ctx.lineWidth = 2 / view.scale;
  ctx.beginPath();
  ctx.moveTo(ray.x, ray.y);
  ctx.lineTo(aimX, aimY);
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#ffeb3b';
  ctx.beginPath();
  ctx.arc(aimX, aimY, (HANDLE_R_PX * 0.5) / view.scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.restore();

  // Zoom badge (in screen space)
  zoomBadge.textContent = Math.round(view.scale * 100) + '%';
}

// ============================================================
// POINTER + GESTURE HANDLING
// ============================================================
function getPointers(evt) {
  const rect = canvas.getBoundingClientRect();
  if (evt.touches) {
    return Array.from(evt.touches).map(t => ({
      id: t.identifier,
      x: t.clientX - rect.left,
      y: t.clientY - rect.top,
    }));
  }
  return [{ id: 0, x: evt.clientX - rect.left, y: evt.clientY - rect.top }];
}

function dist(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return Math.sqrt(dx*dx + dy*dy); }

// Hit-test in WORLD space. Handle radius converted from screen px to world.
function pickHandle(worldP, screenP) {
  const hrW = handleRadiusWorld();

  // Aim handle (60 screen px from origin)
  const aimWorldDist = 60 / view.scale;
  const aimX = ray.x + Math.cos(ray.angle) * aimWorldDist;
  const aimY = ray.y + Math.sin(ray.angle) * aimWorldDist;
  if (dist(worldP.x, worldP.y, aimX, aimY) <= hrW) return { type: 'aim' };

  // Ray origin
  if (dist(worldP.x, worldP.y, ray.x, ray.y) <= hrW) {
    return { type: 'rayOrigin', offsetX: worldP.x - ray.x, offsetY: worldP.y - ray.y };
  }

  // Selected box resize handle
  if (selectedBox) {
    const hx = selectedBox.x + selectedBox.w;
    const hy = selectedBox.y + selectedBox.h;
    if (dist(worldP.x, worldP.y, hx, hy) <= hrW) {
      return { type: 'resize', box: selectedBox };
    }
  }

  // Move box (topmost first)
  for (let i = boxes.length - 1; i >= 0; i--) {
    const b = boxes[i];
    if (worldP.x >= b.x && worldP.x <= b.x + b.w && worldP.y >= b.y && worldP.y <= b.y + b.h) {
      return { type: 'moveBox', box: b, offsetX: worldP.x - b.x, offsetY: worldP.y - b.y };
    }
  }
  return null;
}

// Active interaction state
let active = null;
// active.kind = 'drag' | 'pan' | 'pinch'

function onPointerDown(evt) {
  evt.preventDefault();
  const ps = getPointers(evt);

  if (ps.length === 2) {
    // Start a pinch — cancel any drag/pan.
    const mid = { x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2 };
    active = {
      kind: 'pinch',
      startDist: dist(ps[0].x, ps[0].y, ps[1].x, ps[1].y),
      startScale: view.scale,
      startMid: mid,
      startOffset: { x: view.offsetX, y: view.offsetY },
      startWorldAtMid: screenToWorld(mid.x, mid.y),
    };
    return;
  }

  const p = ps[0];
  const worldP = screenToWorld(p.x, p.y);
  const pick = pickHandle(worldP, p);

  if (pick) {
    if (pick.type === 'moveBox') {
      selectedBox = pick.box;
      updateSelectionUI();
    }
    active = { kind: 'drag', drag: pick };
  } else {
    // Empty space → pan.
    active = { kind: 'pan', startScreen: p, startOffset: { x: view.offsetX, y: view.offsetY } };
    selectedBox = null;
    updateSelectionUI();
  }
  draw();
}

function onPointerMove(evt) {
  if (!active) return;
  evt.preventDefault();
  const ps = getPointers(evt);

  if (active.kind === 'pinch') {
    if (ps.length < 2) return;
    const newMid = { x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2 };
    const newDist = dist(ps[0].x, ps[0].y, ps[1].x, ps[1].y);
    if (active.startDist > 0) {
      let newScale = active.startScale * (newDist / active.startDist);
      newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
      // Keep the world point that was under the start midpoint at the new midpoint.
      view.scale = newScale;
      view.offsetX = newMid.x - active.startWorldAtMid.x * newScale;
      view.offsetY = newMid.y - active.startWorldAtMid.y * newScale;
    }
    draw();
    return;
  }

  if (active.kind === 'pan') {
    const p = ps[0];
    view.offsetX = active.startOffset.x + (p.x - active.startScreen.x);
    view.offsetY = active.startOffset.y + (p.y - active.startScreen.y);
    draw();
    return;
  }

  if (active.kind === 'drag') {
    const p = ps[0];
    const worldP = screenToWorld(p.x, p.y);
    const d = active.drag;
    switch (d.type) {
      case 'aim':
        ray.angle = Math.atan2(worldP.y - ray.y, worldP.x - ray.x);
        break;
      case 'rayOrigin':
        ray.x = worldP.x - d.offsetX;
        ray.y = worldP.y - d.offsetY;
        break;
      case 'moveBox':
        d.box.x = worldP.x - d.offsetX;
        d.box.y = worldP.y - d.offsetY;
        break;
      case 'resize':
        // Minimum box size of 20 SCREEN px so handles stay separable.
        const minWorld = 20 / view.scale;
        d.box.w = Math.max(minWorld, worldP.x - d.box.x);
        d.box.h = Math.max(minWorld, worldP.y - d.box.y);
        break;
    }
    draw();
  }
}

function onPointerUp(evt) {
  // If a pinch ends with one finger still down, hand off to pan from that finger.
  if (active && active.kind === 'pinch' && evt.touches && evt.touches.length === 1) {
    const rect = canvas.getBoundingClientRect();
    const t = evt.touches[0];
    const p = { x: t.clientX - rect.left, y: t.clientY - rect.top };
    active = { kind: 'pan', startScreen: p, startOffset: { x: view.offsetX, y: view.offsetY } };
    return;
  }
  active = null;
}

canvas.addEventListener('mousedown', onPointerDown);
canvas.addEventListener('mousemove', onPointerMove);
window.addEventListener('mouseup', onPointerUp);
canvas.addEventListener('touchstart', onPointerDown, { passive: false });
canvas.addEventListener('touchmove', onPointerMove, { passive: false });
window.addEventListener('touchend', onPointerUp);
window.addEventListener('touchcancel', onPointerUp);

// Mouse wheel for desktop / trackpad zoom
canvas.addEventListener('wheel', (evt) => {
  evt.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const sx = evt.clientX - rect.left, sy = evt.clientY - rect.top;
  const worldAt = screenToWorld(sx, sy);
  const factor = Math.exp(-evt.deltaY * 0.0015);
  let newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, view.scale * factor));
  view.scale = newScale;
  view.offsetX = sx - worldAt.x * newScale;
  view.offsetY = sy - worldAt.y * newScale;
  draw();
}, { passive: false });

// ============================================================
// TOOLBAR
// ============================================================
const btnAddBox    = document.getElementById('btnAddBox');
const btnAddKill   = document.getElementById('btnAddKill');
const btnDeleteBox = document.getElementById('btnDeleteBox');
const btnReset     = document.getElementById('btnReset');
const selPanel     = document.getElementById('selPanel');
const selN         = document.getElementById('selN');
const selNRange    = document.getElementById('selNRange');

function addBoxAtCenter(kind) {
  const W = canvas.clientWidth, H = canvas.clientHeight;
  const c = screenToWorld(W / 2, H / 2);
  const w = 160 / view.scale, h = 100 / view.scale;
  const b = (kind === 'kill')
    ? { kind: 'kill', x: c.x - w / 2, y: c.y - h / 2, w, h }
    : { kind: 'medium', x: c.x - w / 2, y: c.y - h / 2, w, h, n: 1.50 };
  boxes.push(b);
  selectedBox = b;
  updateSelectionUI();
  draw();
}

btnAddBox.addEventListener('click',  () => addBoxAtCenter('medium'));
btnAddKill.addEventListener('click', () => addBoxAtCenter('kill'));

btnDeleteBox.addEventListener('click', () => {
  if (!selectedBox) return;
  boxes = boxes.filter(b => b !== selectedBox);
  selectedBox = null;
  updateSelectionUI();
  draw();
});

btnReset.addEventListener('click', () => {
  defaultScene();
  fitToScene();
});

fitBtn.addEventListener('click', fitToScene);

function setSelectedN(v) {
  if (!selectedBox) return;
  v = Math.max(1.0, Math.min(4.0, parseFloat(v) || 1.0));
  selectedBox.n = v;
  selN.value = v.toFixed(2);
  selNRange.value = v;
  draw();
}
selN.addEventListener('input', () => setSelectedN(selN.value));
selNRange.addEventListener('input', () => setSelectedN(selNRange.value));

function updateSelectionUI() {
  if (selectedBox) {
    btnDeleteBox.disabled = false;
    if (selectedBox.kind === 'kill') {
      selPanel.hidden = true;
    } else {
      selPanel.hidden = false;
      selN.value = selectedBox.n.toFixed(2);
      selNRange.value = selectedBox.n;
    }
  } else {
    selPanel.hidden = true;
    btnDeleteBox.disabled = true;
  }
}

// ============================================================
// BOOT
// ============================================================
defaultScene();
resizeCanvas();
// Wait one frame so layout settles, then fit.
requestAnimationFrame(() => { fitToScene(); });
