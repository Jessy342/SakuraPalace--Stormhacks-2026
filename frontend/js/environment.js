// The living room behind the companion. Every room is drawn with canvas shapes (no image files).
// For speed, a room is painted ONCE into a hidden picture; each frame only re-draws that picture
// plus a few small moving effects (petals, rain, lamp glow, spotlights...), at 30 frames per second.

const TAU = Math.PI * 2;
export const FLOOR = 0.74; // where the floor starts, as a fraction of the screen height

// Repeatable random numbers, so a room looks the same every time it is painted
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ---------------- Painting helpers ----------------
function vgrad(g, y0, y1, stops) {
  const gr = g.createLinearGradient(0, y0, 0, y1);
  stops.forEach((c, i) => gr.addColorStop(stops.length === 1 ? 0 : i / (stops.length - 1), c));
  return gr;
}
function sky(g, w, h, stops) { g.fillStyle = vgrad(g, 0, h * FLOOR, stops); g.fillRect(0, 0, w, h); }
function glow(g, x, y, r, color, alpha = 1) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, color); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.globalAlpha = alpha; g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); g.globalAlpha = 1;
}
function disc(g, x, y, r, color) { g.fillStyle = color; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
function box(g, x, y, w, h, color, radius = 0) {
  g.fillStyle = color; g.beginPath();
  if (radius) g.roundRect(x, y, w, h, radius); else g.rect(x, y, w, h);
  g.fill();
}
function wall(g, w, h, top, bottom, trim = 'rgba(0,0,0,.25)') {
  g.fillStyle = vgrad(g, 0, h * FLOOR, [top, bottom]); g.fillRect(0, 0, w, h * FLOOR);
  box(g, 0, h * (FLOOR - 0.022), w, h * 0.022, trim);
}
function floor(g, w, h, c1, c2, style = 'wood', line = 'rgba(0,0,0,.18)') {
  const y = h * FLOOR, cx = w / 2;
  g.fillStyle = vgrad(g, y, h, [c1, c2]); g.fillRect(0, y, w, h - y);
  g.strokeStyle = line; g.lineWidth = 1;
  if (style !== 'plain') {
    g.beginPath();
    for (let i = -18; i <= 18; i++) { g.moveTo(cx + i * w * 0.034, y); g.lineTo(cx + i * w * 0.125, h); }
    g.stroke();
  }
  if (style === 'tile' || style === 'grid') {
    g.beginPath();
    for (let k = 1; k < 7; k++) { const yy = y + (h - y) * Math.pow(k / 7, 1.8); g.moveTo(0, yy); g.lineTo(w, yy); }
    g.stroke();
  }
}
function stars(g, R, w, h, n, maxY = 0.7, color = '#fff') {
  g.fillStyle = color;
  for (let i = 0; i < n; i++) { g.globalAlpha = 0.3 + R() * 0.7; g.beginPath(); g.arc(R() * w, R() * h * maxY, 0.4 + R() * 1.3, 0, TAU); g.fill(); }
  g.globalAlpha = 1;
}
function skyline(g, R, x0, x1, base, minH, maxH, body, lit, unit) {
  let x = x0 - unit * 4;
  while (x < x1) {
    const bw = unit * (7 + R() * 12), bh = minH + R() * (maxH - minH);
    box(g, x, base - bh, bw, bh + 2, body);
    if (lit) {
      g.fillStyle = lit;
      for (let yy = base - bh + unit * 2; yy < base - unit * 2; yy += unit * 2.6)
        for (let xx = x + unit; xx < x + bw - unit; xx += unit * 2.2) if (R() < 0.42) g.fillRect(xx, yy, unit, unit * 1.4);
    }
    x += bw + R() * unit * 2;
  }
}
function hills(g, w, h, baseY, amp, color, seed) {
  g.fillStyle = color; g.beginPath(); g.moveTo(0, h);
  for (let x = 0; x <= w + 20; x += 20) g.lineTo(x, baseY + Math.sin(x / w * 6 + seed) * amp + Math.sin(x / w * 17 + seed * 3) * amp * 0.4);
  g.lineTo(w, h); g.fill();
}
/** A window: paints the view through it, then the frame and bars. */
function windowPane(g, x, y, ww, hh, frame, view, cols = 2, rows = 2) {
  g.save(); g.beginPath(); g.rect(x, y, ww, hh); g.clip(); view(x, y, ww, hh); g.restore();
  g.strokeStyle = frame; g.lineWidth = Math.max(4, ww * 0.03); g.strokeRect(x, y, ww, hh);
  g.lineWidth *= 0.5; g.beginPath();
  for (let i = 1; i < cols; i++) { g.moveTo(x + ww * i / cols, y); g.lineTo(x + ww * i / cols, y + hh); }
  for (let j = 1; j < rows; j++) { g.moveTo(x, y + hh * j / rows); g.lineTo(x + ww, y + hh * j / rows); }
  g.stroke();
  box(g, x - ww * 0.04, y + hh, ww * 1.08, Math.max(5, hh * 0.035), frame);
}
const viewSunset = (g, R) => (x, y, ww, hh) => {
  g.fillStyle = vgrad(g, y, y + hh, ['#7c6fd0', '#ff9db0', '#ffc88a']); g.fillRect(x, y, ww, hh);
  glow(g, x + ww * 0.62, y + hh * 0.7, hh * 0.6, 'rgba(255,244,200,.95)');
  skyline(g, R, x, x + ww, y + hh, hh * 0.12, hh * 0.38, 'rgba(84,52,110,.9)', 'rgba(255,225,150,.8)', ww * 0.012);
};
const viewNight = (g, R) => (x, y, ww, hh) => {
  g.fillStyle = vgrad(g, y, y + hh, ['#0b1030', '#2a2466', '#7a3d8a']); g.fillRect(x, y, ww, hh);
  for (let i = 0; i < 40; i++) disc(g, x + R() * ww, y + R() * hh * 0.6, 0.5 + R(), 'rgba(255,255,255,.8)');
  disc(g, x + ww * 0.78, y + hh * 0.2, hh * 0.07, '#fff6dd');
  skyline(g, R, x, x + ww, y + hh, hh * 0.15, hh * 0.5, 'rgba(14,12,40,.96)', 'rgba(255,214,120,.85)', ww * 0.012);
};
const viewDay = (g) => (x, y, ww, hh) => {
  g.fillStyle = vgrad(g, y, y + hh, ['#8fd0ff', '#ffe9c4']); g.fillRect(x, y, ww, hh);
  g.fillStyle = 'rgba(255,255,255,.7)';
  for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(x + ww * (0.2 + i * 0.3), y + hh * (0.25 + (i % 2) * 0.2), ww * 0.14, hh * 0.05, 0, 0, TAU); g.fill(); }
};
function curtain(g, x, y, ww, hh, color) {
  g.fillStyle = color; g.beginPath(); g.moveTo(x, y); g.lineTo(x + ww, y);
  for (let i = 0; i <= 8; i++) g.lineTo(x + ww + Math.sin(i * 1.3) * ww * 0.14, y + hh * i / 8);
  g.lineTo(x, y + hh); g.fill();
  g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 1;
  for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(x + ww * k / 4, y); g.lineTo(x + ww * k / 4, y + hh); g.stroke(); }
}
const BOOKS = ['#c94f4f', '#4f7cc9', '#e0b04a', '#5aa77a', '#8b5fbf', '#d9d2c0', '#c9743f', '#3f5873'];
function shelf(g, R, x, y, ww, hh, wood = '#5a3b2a', rows = 4) {
  box(g, x, y, ww, hh, wood);
  const pad = Math.max(3, ww * 0.04), rh = (hh - pad) / rows;
  for (let r = 0; r < rows; r++) {
    const yy = y + pad + r * rh;
    box(g, x + pad, yy, ww - pad * 2, rh - pad, 'rgba(0,0,0,.45)');
    let bx = x + pad + 1;
    while (bx < x + ww - pad - 4) {
      const bw = Math.max(3, ww * (0.03 + R() * 0.035)), bh = (rh - pad) * (0.6 + R() * 0.38);
      if (R() > 0.12) box(g, bx, yy + rh - pad - bh, Math.min(bw, x + ww - pad - bx), bh, BOOKS[Math.floor(R() * BOOKS.length)]);
      bx += bw + 1;
    }
  }
}
function tree(g, R, x, y, s, leaf = ['#ffc1dd', '#ff9ec9', '#ffd9ea', '#f582b4']) {
  g.strokeStyle = '#5b3a35'; g.lineCap = 'round'; g.lineWidth = s * 0.09; g.beginPath();
  g.moveTo(x, y); g.quadraticCurveTo(x + s * 0.05, y - s * 0.4, x - s * 0.03, y - s * 0.7);
  g.moveTo(x, y - s * 0.45); g.quadraticCurveTo(x + s * 0.2, y - s * 0.6, x + s * 0.3, y - s * 0.8);
  g.moveTo(x, y - s * 0.5); g.quadraticCurveTo(x - s * 0.2, y - s * 0.65, x - s * 0.32, y - s * 0.78);
  g.stroke(); g.lineCap = 'butt';
  for (let i = 0; i < 70; i++) {
    const a = R() * TAU, d = Math.sqrt(R()) * s * 0.58;
    g.globalAlpha = 0.88;
    disc(g, x + Math.cos(a) * d, y - s * 0.92 + Math.sin(a) * d * 0.62, s * (0.08 + R() * 0.1), leaf[Math.floor(R() * leaf.length)]);
  }
  g.globalAlpha = 1;
}
function lantern(g, x, y, s, color = '#ff5a3c') {
  glow(g, x, y, s * 3.2, 'rgba(255,170,80,.55)');
  box(g, x - s * 0.5, y - s * 0.7, s, s * 1.4, color, s * 0.4);
  box(g, x - s * 0.3, y - s * 0.85, s * 0.6, s * 0.18, '#2a1a1a'); box(g, x - s * 0.3, y + s * 0.68, s * 0.6, s * 0.18, '#2a1a1a');
}
function frameArt(g, x, y, ww, hh, c1, c2, frame = '#3a2a2a') {
  box(g, x, y, ww, hh, frame); g.fillStyle = vgrad(g, y, y + hh, [c1, c2]); g.fillRect(x + ww * 0.08, y + hh * 0.08, ww * 0.84, hh * 0.84);
}
function plant(g, x, y, s) {
  box(g, x - s * 0.22, y - s * 0.35, s * 0.44, s * 0.35, '#c98a5a', s * 0.05);
  g.fillStyle = '#4c9b6a';
  for (let i = -3; i <= 3; i++) { g.beginPath(); g.ellipse(x + i * s * 0.1, y - s * 0.72, s * 0.09, s * 0.42, i * 0.28, 0, TAU); g.fill(); }
}

// ---------------- Rooms ----------------
// Each room: paint(g, w, h, R) draws the still picture; fx lists the moving effects; lights are glows that flicker.
const BEDROOMS = {
  bedroom: { wall: ['#ffd9ea', '#f4b6d2'], trim: '#fff7fb', floor: ['#d9a37c', '#9a6a4c'], accent: '#ff8fb8', wood: '#f3e3d3', bed: '#ff9fc6', night: false },
  bedroom_modern: { wall: ['#e9edf3', '#c9d2de'], trim: '#ffffff', floor: ['#b9a58f', '#7b6a5a'], accent: '#7f95b8', wood: '#3a4252', bed: '#8fa3c4', night: false, modern: true },
  bedroom_gamer: { wall: ['#1b1838', '#241c4a'], trim: '#0d0b20', floor: ['#2a2444', '#12101f'], accent: '#7a3cff', wood: '#15132b', bed: '#3b2f7a', night: true, gamer: true },
  bedroom_study: { wall: ['#f2e2c4', '#e0c79c'], trim: '#6a4a32', floor: ['#a8744a', '#6b4528'], accent: '#b5533c', wood: '#6a4a32', bed: '#c98a5a', night: false, study: true },
  bedroom_penthouse: { wall: ['#15182e', '#232846'], trim: '#c9a45c', floor: ['#3a3550', '#191626'], accent: '#c9a45c', wood: '#2a2d44', bed: '#e8e0d0', night: true, penthouse: true },
};
function bedroom(v) {
  return (g, w, h, R) => {
    const F = h * FLOOR;
    wall(g, w, h, v.wall[0], v.wall[1], v.trim);
    const view = v.night ? viewNight(g, R) : viewSunset(g, R);
    if (v.penthouse) { // a whole wall of glass
      for (let i = 0; i < 4; i++) windowPane(g, w * (0.02 + i * 0.245), h * 0.06, w * 0.225, F - h * 0.09, v.trim, view, 1, 1);
    } else {
      windowPane(g, w * 0.1, h * 0.13, w * 0.22, h * 0.36, v.trim, view);
      curtain(g, w * 0.072, h * 0.1, w * 0.045, h * 0.44, v.accent); curtain(g, w * 0.305, h * 0.1, w * 0.045, h * 0.44, v.accent);
    }
    floor(g, w, h, v.floor[0], v.floor[1], v.penthouse ? 'tile' : 'wood');
    // rug
    g.fillStyle = v.accent; g.globalAlpha = 0.45; g.beginPath(); g.ellipse(w * 0.5, h * 0.9, w * 0.2, h * 0.07, 0, 0, TAU); g.fill(); g.globalAlpha = 1;
    // shelves on the right wall
    if (!v.penthouse) {
      shelf(g, R, w * 0.68, h * 0.14, w * 0.2, v.study ? h * 0.5 : h * 0.17, v.wood, v.study ? 5 : 2);
      if (v.study) shelf(g, R, w * 0.36, h * 0.14, w * 0.1, h * 0.5, v.wood, 5);
      if (v.modern) { frameArt(g, w * 0.4, h * 0.16, w * 0.09, h * 0.2, '#f6c6a8', '#8fa3c4', '#222'); plant(g, w * 0.62, F, h * 0.2); }
    }
    // bed (right)
    const bx = w * 0.66, by = F - h * 0.13;
    box(g, bx + w * 0.26, by - h * 0.13, w * 0.03, h * 0.3, v.wood, 6);            // headboard
    box(g, bx, by + h * 0.06, w * 0.28, h * 0.11, v.wood, 6);                      // frame
    box(g, bx, by, w * 0.28, h * 0.09, '#fffaf5', 10);                             // mattress
    box(g, bx, by + h * 0.015, w * 0.19, h * 0.085, v.bed, 10);                    // blanket
    box(g, bx + w * 0.2, by - h * 0.035, w * 0.06, h * 0.06, '#ffffff', 12);       // pillow
    if (!v.modern && !v.penthouse && !v.gamer) { disc(g, bx + w * 0.16, by - h * 0.02, h * 0.035, '#fff0c9'); disc(g, bx + w * 0.148, by - h * 0.048, h * 0.014, '#fff0c9'); disc(g, bx + w * 0.172, by - h * 0.048, h * 0.014, '#fff0c9'); } // plush
    // desk (left) with a laptop or monitors, and books
    const dx = w * 0.06, dy = F - h * 0.15;
    box(g, dx, dy, w * 0.24, h * 0.022, v.wood); box(g, dx + w * 0.01, dy, w * 0.012, h * 0.2, v.wood); box(g, dx + w * 0.218, dy, w * 0.012, h * 0.2, v.wood);
    if (v.gamer) {
      for (const m of [0.02, 0.105]) { box(g, dx + w * m, dy - h * 0.12, w * 0.08, h * 0.1, '#0a0a14', 4); box(g, dx + w * (m + 0.005), dy - h * 0.112, w * 0.07, h * 0.084, m < 0.1 ? '#3cf0ff' : '#ff4fd8', 3); }
      box(g, 0, h * 0.04, w, h * 0.008, '#ff4fd8'); glow(g, w * 0.5, h * 0.04, w * 0.5, 'rgba(255,79,216,.25)');
      box(g, w * 0.42, h * 0.2, w * 0.1, h * 0.012, '#3cf0ff'); box(g, w * 0.42, h * 0.24, w * 0.07, h * 0.012, '#3cf0ff');
    } else {
      box(g, dx + w * 0.07, dy - h * 0.075, w * 0.07, h * 0.075, '#2a2d3a', 4); box(g, dx + w * 0.074, dy - h * 0.068, w * 0.062, h * 0.06, '#bfe6ff', 3);
    }
    for (let i = 0; i < 4; i++) box(g, dx + w * 0.17, dy - h * 0.014 * (i + 1), w * 0.05, h * 0.012, BOOKS[i]);
    // desk lamp
    box(g, dx + w * 0.03, dy - h * 0.09, w * 0.004, h * 0.09, '#444'); box(g, dx + w * 0.018, dy - h * 0.11, w * 0.03, h * 0.03, v.accent, 6);
    if (!v.gamer && !v.penthouse && !v.modern) { // string of fairy lights
      for (let i = 0; i < 16; i++) disc(g, w * (0.4 + i * 0.017), h * (0.09 + Math.sin(i * 0.7) * 0.012), 3, ['#fff3b0', '#ffb3d1', '#b3e5ff'][i % 3]);
    }
    if (v.penthouse) { box(g, w * 0.47, 0, w * 0.004, h * 0.12, v.trim); disc(g, w * 0.472, h * 0.13, h * 0.02, '#ffe9b0'); }
  };
}
const bedroomLights = v => [[0.105, FLOOR - 0.24, 0.16, v.gamer ? 'rgba(60,240,255,.35)' : 'rgba(255,220,150,.5)'],
  ...(v.gamer ? [[0.2, FLOOR - 0.2, 0.14, 'rgba(255,79,216,.3)']] : []), ...(v.penthouse ? [[0.472, 0.13, 0.22, 'rgba(255,233,176,.35)']] : [])];

const SCENES = {
  // 10. Minimal stylized showcase: gradient sky, simple horizon, petals, geometric floor
  sakura: {
    name: 'Sakura Horizon', fx: ['petals'],
    paint(g, w, h) {
      sky(g, w, h, ['#ffd1e8', '#ff9fc8', '#a66bb5']);
      glow(g, w * 0.78, h * 0.26, h * 0.45, 'rgba(255,244,214,.9)', 0.75); disc(g, w * 0.78, h * 0.26, h * 0.07, '#fff6df');
      hills(g, w, h, h * 0.6, 30, 'rgba(150,90,160,.45)', 1); hills(g, w, h, h * 0.67, 22, 'rgba(110,60,130,.6)', 4);
      floor(g, w, h, 'rgba(84,44,104,1)', 'rgba(30,14,48,1)', 'grid', 'rgba(255,255,255,.1)');
    },
  },
  // 1. Bedroom + variations
  bedroom: { name: 'Cozy Bedroom', fx: ['motes'], paint: bedroom(BEDROOMS.bedroom), lights: bedroomLights(BEDROOMS.bedroom) },
  bedroom_modern: { name: 'Modern Room', fx: ['motes'], paint: bedroom(BEDROOMS.bedroom_modern), lights: bedroomLights(BEDROOMS.bedroom_modern) },
  bedroom_study: { name: 'Study Room', fx: ['motes'], paint: bedroom(BEDROOMS.bedroom_study), lights: bedroomLights(BEDROOMS.bedroom_study) },
  bedroom_gamer: { name: 'Gamer Room', fx: ['motes'], paint: bedroom(BEDROOMS.bedroom_gamer), lights: bedroomLights(BEDROOMS.bedroom_gamer) },
  bedroom_penthouse: { name: 'Luxury Penthouse', fx: ['twinkle'], paint: bedroom(BEDROOMS.bedroom_penthouse), lights: bedroomLights(BEDROOMS.bedroom_penthouse) },
  // 2. Rooftop at sunset
  rooftop: {
    name: 'Rooftop at Sunset', fx: ['petals'],
    paint(g, w, h, R) {
      const F = h * FLOOR;
      sky(g, w, h, ['#5f6fd6', '#c58ad6', '#ff9fb0', '#ffc98a']);
      glow(g, w * 0.3, F - h * 0.06, h * 0.6, 'rgba(255,240,190,.95)'); disc(g, w * 0.3, F - h * 0.06, h * 0.06, '#fff6d8');
      g.fillStyle = 'rgba(255,255,255,.45)';
      for (let i = 0; i < 5; i++) { g.beginPath(); g.ellipse(w * (0.1 + i * 0.21), h * (0.14 + (i % 3) * 0.07), w * 0.09, h * 0.022, 0, 0, TAU); g.fill(); }
      skyline(g, R, 0, w, F, h * 0.06, h * 0.26, 'rgba(92,60,120,.85)', 'rgba(255,225,150,.7)', w * 0.004);
      floor(g, w, h, '#b9a9b6', '#6d6274', 'tile', 'rgba(0,0,0,.14)');
      // chain-link fence
      const top = F - h * 0.34;
      g.strokeStyle = 'rgba(60,50,80,.55)'; g.lineWidth = 1; g.beginPath();
      for (let x = -h; x < w + h; x += w * 0.014) { g.moveTo(x, F); g.lineTo(x + (F - top), top); g.moveTo(x, F); g.lineTo(x - (F - top), top); }
      g.stroke();
      g.strokeStyle = '#5a5068'; g.lineWidth = 5; g.beginPath(); g.moveTo(0, top); g.lineTo(w, top);
      for (let x = 0; x <= w; x += w / 8) { g.moveTo(x, top); g.lineTo(x, F); }
      g.stroke();
      // stairwell hut and a bench
      box(g, w * 0.8, F - h * 0.42, w * 0.2, h * 0.42, '#9d8fa0'); box(g, w * 0.8, F - h * 0.44, w * 0.2, h * 0.03, '#6f6478');
      box(g, w * 0.86, F - h * 0.26, w * 0.07, h * 0.26, '#5a5068'); disc(g, w * 0.92, F - h * 0.13, 4, '#ffd98f');
      box(g, w * 0.08, F - h * 0.07, w * 0.18, h * 0.018, '#7a5a46'); box(g, w * 0.08, F - h * 0.12, w * 0.18, h * 0.015, '#7a5a46');
      box(g, w * 0.095, F - h * 0.07, w * 0.008, h * 0.07, '#4a3a34'); box(g, w * 0.237, F - h * 0.07, w * 0.008, h * 0.07, '#4a3a34');
    },
  },
  // 3. Cherry blossom courtyard
  courtyard: {
    name: 'Cherry Blossom Courtyard', fx: ['petals'],
    paint(g, w, h, R) {
      const F = h * FLOOR;
      sky(g, w, h, ['#9fd6ff', '#d9efff', '#ffe6f0']);
      glow(g, w * 0.5, h * 0.2, h * 0.6, 'rgba(255,250,220,.7)');
      // school building with a clock
      box(g, w * 0.26, F - h * 0.44, w * 0.48, h * 0.44, '#f3ead8'); box(g, w * 0.24, F - h * 0.46, w * 0.52, h * 0.035, '#b8544a');
      box(g, w * 0.46, F - h * 0.56, w * 0.08, h * 0.12, '#f3ead8'); disc(g, w * 0.5, F - h * 0.5, h * 0.03, '#fff'); g.strokeStyle = '#333'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(w * 0.5, F - h * 0.5); g.lineTo(w * 0.5, F - h * 0.522); g.moveTo(w * 0.5, F - h * 0.5); g.lineTo(w * 0.508, F - h * 0.5); g.stroke();
      for (let r = 0; r < 3; r++) for (let c = 0; c < 9; c++) box(g, w * (0.285 + c * 0.05), F - h * (0.4 - r * 0.12), w * 0.03, h * 0.07, 'rgba(120,170,210,.75)');
      box(g, w * 0.475, F - h * 0.13, w * 0.05, h * 0.13, '#7a5a46');
      floor(g, w, h, '#b9d49a', '#7fa868', 'plain');
      g.fillStyle = '#e6dccb'; g.beginPath(); g.moveTo(w * 0.46, F); g.lineTo(w * 0.54, F); g.lineTo(w * 0.8, h); g.lineTo(w * 0.2, h); g.fill(); // path
      tree(g, R, w * 0.13, F + h * 0.03, h * 0.62); tree(g, R, w * 0.87, F + h * 0.03, h * 0.62);
      tree(g, R, w * 0.3, F, h * 0.36); tree(g, R, w * 0.7, F, h * 0.36);
    },
  },
  // 4. After-school classroom
  classroom: {
    name: 'After-School Classroom', fx: ['motes'],
    paint(g, w, h, R) {
      const F = h * FLOOR;
      wall(g, w, h, '#f6e7c8', '#e9cf9f', '#8a6444');
      for (let i = 0; i < 2; i++) windowPane(g, w * (0.04 + i * 0.17), h * 0.1, w * 0.14, h * 0.46, '#8a6444', viewSunset(g, R), 2, 3);
      // chalkboard with scribbles
      box(g, w * 0.4, h * 0.14, w * 0.4, h * 0.34, '#8a6444'); box(g, w * 0.408, h * 0.152, w * 0.384, h * 0.316, '#2f5a4a');
      g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 2;
      for (let i = 0; i < 5; i++) { g.beginPath(); let x = w * (0.43 + R() * 0.05); const y = h * (0.2 + i * 0.05); g.moveTo(x, y); for (let k = 0; k < 9; k++) { x += w * 0.012 + R() * w * 0.014; g.lineTo(x, y + (R() - 0.5) * h * 0.016); } g.stroke(); }
      box(g, w * 0.4, h * 0.48, w * 0.4, h * 0.012, '#6b4a30');
      disc(g, w * 0.88, h * 0.16, h * 0.04, '#fff'); g.strokeStyle = '#333'; g.beginPath(); g.moveTo(w * 0.88, h * 0.16); g.lineTo(w * 0.88, h * 0.13); g.moveTo(w * 0.88, h * 0.16); g.lineTo(w * 0.895, h * 0.17); g.stroke();
      floor(g, w, h, '#c79a6c', '#7d5636', 'wood', 'rgba(60,35,20,.3)');
      // light shafts from the windows
      g.fillStyle = 'rgba(255,225,150,.16)';
      for (let i = 0; i < 2; i++) { const x = w * (0.04 + i * 0.17); g.beginPath(); g.moveTo(x, h * 0.1); g.lineTo(x + w * 0.14, h * 0.1); g.lineTo(x + w * 0.5, h); g.lineTo(x + w * 0.2, h); g.fill(); }
      // desks in the front corners
      for (const [x, y, s] of [[0.02, 0.86, 1], [0.8, 0.86, 1], [0.16, 0.8, 0.8], [0.7, 0.8, 0.8]]) {
        box(g, w * x, h * y, w * 0.16 * s, h * 0.022 * s, '#d9b07c'); box(g, w * (x + 0.01), h * y, w * 0.008, h * 0.2, '#777'); box(g, w * (x + 0.14 * s), h * y, w * 0.008, h * 0.2, '#777');
      }
    },
  },
  // 5. Library / fantasy study hall
  library: {
    name: 'Celestial Library', fx: ['embers', 'twinkle'], lights: [[0.24, 0.2, 0.2, 'rgba(255,200,110,.5)'], [0.76, 0.2, 0.2, 'rgba(255,200,110,.5)']],
    paint(g, w, h, R) {
      const F = h * FLOOR;
      wall(g, w, h, '#151233', '#2a1f4a', '#c9a45c');
      // arched window with a moon and constellations
      g.save(); g.beginPath(); g.moveTo(w * 0.4, F - h * 0.03); g.lineTo(w * 0.4, h * 0.3); g.arc(w * 0.5, h * 0.3, w * 0.1, Math.PI, 0); g.lineTo(w * 0.6, F - h * 0.03); g.clip();
      g.fillStyle = vgrad(g, h * 0.05, F, ['#1b2a7a', '#5a3fa8', '#c77dd8']); g.fillRect(w * 0.38, 0, w * 0.24, F);
      stars(g, R, w, h, 300, 0.7); disc(g, w * 0.53, h * 0.22, h * 0.05, '#fff3d0'); glow(g, w * 0.53, h * 0.22, h * 0.2, 'rgba(255,243,208,.5)'); g.restore();
      g.strokeStyle = '#c9a45c'; g.lineWidth = 5; g.beginPath(); g.moveTo(w * 0.4, F - h * 0.03); g.lineTo(w * 0.4, h * 0.3); g.arc(w * 0.5, h * 0.3, w * 0.1, Math.PI, 0); g.lineTo(w * 0.6, F - h * 0.03);
      g.moveTo(w * 0.5, h * 0.3 - w * 0.1); g.lineTo(w * 0.5, F - h * 0.03); g.stroke();
      // towering shelves on both sides
      shelf(g, R, w * 0.02, h * 0.03, w * 0.16, F - h * 0.05, '#3a2616', 7); shelf(g, R, w * 0.19, h * 0.1, w * 0.17, F - h * 0.12, '#46301c', 6);
      shelf(g, R, w * 0.82, h * 0.03, w * 0.16, F - h * 0.05, '#3a2616', 7); shelf(g, R, w * 0.64, h * 0.1, w * 0.17, F - h * 0.12, '#46301c', 6);
      for (const x of [0.24, 0.76]) { box(g, w * x - 1, 0, 2, h * 0.17, '#c9a45c'); disc(g, w * x, h * 0.2, h * 0.025, '#ffe2a0'); }
      floor(g, w, h, '#4a3560', '#1a1230', 'tile', 'rgba(201,164,92,.25)');
      g.fillStyle = 'rgba(160,60,90,.55)'; g.beginPath(); g.ellipse(w * 0.5, h * 0.9, w * 0.24, h * 0.08, 0, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(201,164,92,.7)'; g.lineWidth = 2; g.beginPath(); g.ellipse(w * 0.5, h * 0.9, w * 0.22, h * 0.07, 0, 0, TAU); g.stroke();
    },
  },
  // 6. Cafe / dessert shop
  cafe: {
    name: 'Rainy Day Cafe', fx: ['rainwindow', 'steam'], lights: [[0.2, 0.17, 0.16, 'rgba(255,200,120,.5)'], [0.5, 0.17, 0.16, 'rgba(255,200,120,.5)'], [0.8, 0.17, 0.16, 'rgba(255,200,120,.5)']],
    paint(g, w, h, R) {
      const F = h * FLOOR;
      wall(g, w, h, '#6b4636', '#8a5c44', '#3d261c');
      windowPane(g, w * 0.05, h * 0.12, w * 0.4, h * 0.44, '#3d261c', viewNight(g, R), 3, 1);
      // menu board
      box(g, w * 0.56, h * 0.12, w * 0.16, h * 0.24, '#3d261c'); box(g, w * 0.567, h * 0.132, w * 0.146, h * 0.216, '#23302b');
      g.fillStyle = 'rgba(255,255,255,.75)'; for (let i = 0; i < 6; i++) g.fillRect(w * 0.58, h * (0.155 + i * 0.03), w * (0.05 + R() * 0.06), 2);
      shelf(g, R, w * 0.76, h * 0.12, w * 0.2, h * 0.24, '#3d261c', 2);
      // counter with a pastry case
      box(g, w * 0.54, F - h * 0.2, w * 0.46, h * 0.2, '#4a2e22'); box(g, w * 0.53, F - h * 0.215, w * 0.47, h * 0.025, '#e9d6b8');
      box(g, w * 0.58, F - h * 0.33, w * 0.22, h * 0.115, 'rgba(210,235,255,.35)', 6);
      for (let i = 0; i < 6; i++) { box(g, w * (0.595 + i * 0.033), F - h * 0.255, w * 0.024, h * 0.03, ['#ffd9e6', '#f6e2b3', '#c98a5a'][i % 3], 4); disc(g, w * (0.607 + i * 0.033), F - h * 0.262, 3, '#e5484d'); }
      box(g, w * 0.86, F - h * 0.32, w * 0.06, h * 0.105, '#2a2a2e', 4); // coffee machine
      for (const x of [0.2, 0.5, 0.8]) { box(g, w * x - 1, 0, 2, h * 0.14, '#222'); g.fillStyle = '#e9b65a'; g.beginPath(); g.moveTo(w * x - h * 0.035, h * 0.18); g.lineTo(w * x + h * 0.035, h * 0.18); g.lineTo(w * x + h * 0.015, h * 0.14); g.lineTo(w * x - h * 0.015, h * 0.14); g.fill(); }
      floor(g, w, h, '#7a5a46', '#3d2a20', 'tile', 'rgba(0,0,0,.25)');
      // a table by the window with two cups
      box(g, w * 0.1, F - h * 0.1, w * 0.2, h * 0.02, '#e9d6b8', 6); box(g, w * 0.195, F - h * 0.08, w * 0.012, h * 0.14, '#3d261c');
      box(g, w * 0.15, F - h * 0.125, w * 0.018, h * 0.025, '#fff', 3); box(g, w * 0.23, F - h * 0.125, w * 0.018, h * 0.025, '#fff', 3);
      plant(g, w * 0.48, F, h * 0.2);
    },
  },
  // 7. Idol stage
  stage: {
    name: 'Idol Stage', fx: ['spots', 'sparkles'],
    paint(g, w, h, R) {
      const F = h * FLOOR;
      sky(g, w, h, ['#0d0620', '#2a0f4a', '#5a1f6a']);
      // LED wall of stars
      for (let i = 0; i < 26; i++) { const x = w * (0.18 + R() * 0.64), y = h * (0.08 + R() * 0.5), s = h * (0.01 + R() * 0.025); g.fillStyle = ['#ff7ad9', '#7ae0ff', '#ffe27a'][i % 3]; g.globalAlpha = 0.5; g.beginPath(); for (let k = 0; k < 8; k++) { const a = k * TAU / 8, r = k % 2 ? s * 0.4 : s; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } g.fill(); }
      g.globalAlpha = 1;
      box(g, 0, h * 0.03, w, h * 0.03, '#1a1a22'); for (let i = 0; i < 9; i++) { box(g, w * (0.08 + i * 0.105), h * 0.05, w * 0.02, h * 0.035, '#33333f', 3); disc(g, w * (0.09 + i * 0.105), h * 0.085, h * 0.01, '#fff6c9'); }
      curtain(g, 0, 0, w * 0.1, F, '#a3123a'); g.save(); g.translate(w, 0); g.scale(-1, 1); curtain(g, 0, 0, w * 0.1, F, '#a3123a'); g.restore();
      floor(g, w, h, '#3a1f5a', '#0d0620', 'wood', 'rgba(255,122,217,.14)');
      glow(g, w * 0.5, h * 0.9, w * 0.3, 'rgba(255,160,230,.35)');
      // glow sticks in the crowd
      for (let i = 0; i < 40; i++) { const x = R() * w, y = h * (0.94 + R() * 0.06); g.strokeStyle = ['#ff7ad9', '#7ae0ff', '#ffe27a'][i % 3]; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (R() - 0.5) * 14, y - h * 0.04); g.stroke(); }
    },
  },
  // 8. Moonlit balcony
  balcony: {
    name: 'Moonlit Balcony', fx: ['twinkle', 'shooting'], lights: [[0.12, FLOOR - 0.2, 0.12, 'rgba(255,190,110,.5)'], [0.88, FLOOR - 0.2, 0.12, 'rgba(255,190,110,.5)']],
    paint(g, w, h, R) {
      const F = h * FLOOR;
      sky(g, w, h, ['#070b26', '#1c2260', '#4a3a8a', '#8a5aa6']);
      stars(g, R, w, h, 160, 0.6);
      glow(g, w * 0.72, h * 0.2, h * 0.5, 'rgba(210,220,255,.6)'); disc(g, w * 0.72, h * 0.2, h * 0.09, '#f4f6ff'); disc(g, w * 0.7, h * 0.18, h * 0.015, 'rgba(180,190,230,.6)'); disc(g, w * 0.74, h * 0.23, h * 0.02, 'rgba(180,190,230,.5)');
      skyline(g, R, 0, w, F, h * 0.05, h * 0.24, 'rgba(12,12,40,.95)', 'rgba(255,214,120,.8)', w * 0.004);
      floor(g, w, h, '#4a4470', '#1a1730', 'tile', 'rgba(255,255,255,.1)');
      // stone railing
      const top = F - h * 0.2;
      box(g, 0, top, w, h * 0.03, '#cfc8e0'); box(g, 0, F - h * 0.025, w, h * 0.03, '#b8b0cc');
      for (let x = w * 0.012; x < w; x += w * 0.03) { g.fillStyle = '#ded8ee'; g.beginPath(); g.ellipse(x, F - h * 0.1, w * 0.006, h * 0.075, 0, 0, TAU); g.fill(); }
      for (const x of [0.12, 0.88]) { box(g, w * x - w * 0.012, top - h * 0.02, w * 0.024, h * 0.23, '#cfc8e0'); lantern(g, w * x, top - h * 0.05, h * 0.03, '#ffd98f'); }
      plant(g, w * 0.04, F + h * 0.04, h * 0.2); plant(g, w * 0.96, F + h * 0.04, h * 0.2);
    },
  },
  // 9. Shrine / festival street
  festival: {
    name: 'Festival Night', fx: ['fireworks', 'embers'], lights: [[0.5, 0.3, 0.3, 'rgba(255,150,80,.25)']],
    paint(g, w, h, R) {
      const F = h * FLOOR;
      sky(g, w, h, ['#090c2a', '#1f1c52', '#5a2f6a']);
      stars(g, R, w, h, 120, 0.5);
      hills(g, w, h, F - h * 0.12, 26, 'rgba(20,16,50,.9)', 2);
      // torii gate
      const tx = w * 0.5, ty = F;
      for (const s of [-1, 1]) box(g, tx + s * w * 0.11 - w * 0.008, ty - h * 0.42, w * 0.016, h * 0.42, '#d6402f');
      box(g, tx - w * 0.15, ty - h * 0.46, w * 0.3, h * 0.035, '#d6402f'); box(g, tx - w * 0.16, ty - h * 0.49, w * 0.32, h * 0.03, '#2a1a1a'); box(g, tx - w * 0.125, ty - h * 0.38, w * 0.25, h * 0.022, '#d6402f');
      floor(g, w, h, '#57506a', '#1f1b2e', 'tile', 'rgba(255,255,255,.08)');
      // stalls with striped awnings
      for (const [x, c] of [[0.02, '#e5484d'], [0.2, '#f0a43a'], [0.64, '#4ea8ff'], [0.82, '#e5484d']]) {
        box(g, w * x, F - h * 0.2, w * 0.16, h * 0.2, '#3a2a24'); box(g, w * x, F - h * 0.1, w * 0.16, h * 0.02, '#e9d6b8');
        for (let i = 0; i < 8; i++) box(g, w * (x - 0.005 + i * 0.0215), F - h * 0.27, w * 0.0215, h * 0.07, i % 2 ? '#fff' : c);
        glow(g, w * (x + 0.08), F - h * 0.15, h * 0.16, 'rgba(255,200,120,.5)');
      }
      // strings of lanterns
      for (const [x0, x1, y] of [[0.02, 0.48, 0.2], [0.52, 0.98, 0.2]]) {
        g.strokeStyle = '#222'; g.lineWidth = 1.5; g.beginPath();
        for (let i = 0; i <= 10; i++) { const x = w * (x0 + (x1 - x0) * i / 10), yy = h * (y + Math.sin(i / 10 * Math.PI) * 0.05); i ? g.lineTo(x, yy) : g.moveTo(x, yy); }
        g.stroke();
        for (let i = 1; i < 10; i++) lantern(g, w * (x0 + (x1 - x0) * i / 10), h * (y + Math.sin(i / 10 * Math.PI) * 0.05) + h * 0.03, h * 0.022, i % 2 ? '#ff5a3c' : '#ffcf5a');
      }
    },
  },
  night_city: {
    name: 'Neon Night', fx: ['rain', 'twinkle'],
    paint(g, w, h, R) {
      const F = h * FLOOR;
      sky(g, w, h, ['#0f0c29', '#302b63', '#b02e7a']);
      stars(g, R, w, h, 120, 0.5);
      glow(g, w * 0.5, F, h * 0.7, 'rgba(255,46,136,.5)');
      skyline(g, R, 0, w, F, h * 0.12, h * 0.36, 'rgba(34,26,78,.92)', 'rgba(255,214,120,.6)', w * 0.004);
      skyline(g, R, 0, w, F, h * 0.2, h * 0.5, 'rgba(14,10,40,.97)', 'rgba(255,120,210,.75)', w * 0.005);
      floor(g, w, h, '#1a1238', '#06040f', 'grid', 'rgba(255,46,136,.2)');
    },
  },
  beach: {
    name: 'Sunset Beach', fx: ['waves'],
    paint(g, w, h) {
      const F = h * FLOOR, hor = h * 0.56;
      sky(g, w, h, ['#ff9a8b', '#ff6a88', '#ffb88a']);
      glow(g, w * 0.5, hor, h * 0.6, 'rgba(255,236,170,.95)'); g.fillStyle = '#fff3c4'; g.beginPath(); g.arc(w * 0.5, hor, h * 0.085, Math.PI, TAU); g.fill();
      g.fillStyle = vgrad(g, hor, F, ['#ffa37f', '#3a6ea5']); g.fillRect(0, hor, w, F - hor);
      floor(g, w, h, '#f1cf98', '#b48a5c', 'plain');
      // palm tree
      g.strokeStyle = '#6b4a30'; g.lineWidth = w * 0.012; g.lineCap = 'round'; g.beginPath(); g.moveTo(w * 0.1, h * 0.9); g.quadraticCurveTo(w * 0.12, h * 0.5, w * 0.16, h * 0.28); g.stroke(); g.lineCap = 'butt';
      g.fillStyle = '#2f7a5a'; for (let i = 0; i < 7; i++) { g.save(); g.translate(w * 0.16, h * 0.28); g.rotate(-2.6 + i * 0.75); g.beginPath(); g.ellipse(w * 0.06, 0, w * 0.07, h * 0.022, 0, 0, TAU); g.fill(); g.restore(); }
    },
  },
  galaxy: {
    name: 'Galaxy Dream', fx: ['twinkle', 'shooting'],
    paint(g, w, h, R) {
      sky(g, w, h, ['#05030f', '#1a1a40', '#3a1f6a']);
      glow(g, w * 0.28, h * 0.3, h * 0.6, 'rgba(160,80,255,.55)'); glow(g, w * 0.75, h * 0.5, h * 0.5, 'rgba(60,160,255,.4)');
      stars(g, R, w, h, 320, 0.76);
      floor(g, w, h, '#2a1a5a', '#07051a', 'grid', 'rgba(160,140,255,.22)');
    },
  },

};

export const sceneName = id => SCENES[id]?.name || id;

export class Environment {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.buf = document.createElement('canvas'); // the room, painted once
    this.scene = 'sakura';
    this.low = false;      // performance mode: fewer effects, lower resolution
    this.paused = false;
    this.mx = 0; this.my = 0; this.tx = 0; this.ty = 0;
    this.thumbs = {};
    this.build();
    addEventListener('resize', () => this.build());
    addEventListener('pointermove', e => { this.tx = e.clientX / innerWidth * 2 - 1; this.ty = e.clientY / innerHeight * 2 - 1; });
    let last = 0;
    const loop = now => {
      requestAnimationFrame(loop);
      if (this.paused || document.hidden || now - last < (this.low ? 66 : 33)) return; // 30 frames per second is plenty for a backdrop
      last = now;
      this.draw(now / 1000);
    };
    requestAnimationFrame(loop);
  }

  set(scene) {
    if (!SCENES[scene]) scene = 'sakura';
    if (scene === this.scene) return;
    this.scene = scene;
    this.build();
  }

  setQuality(low) { this.low = low; this.build(); }

  /** Picture of a room at any size: small for the dressing room tiles, large as the backdrop of a summon reveal. */
  thumb(id, w = 240, h = 150) {
    if (!SCENES[id]) return '';
    const key = `${id}@${w}x${h}`;
    if (!this.thumbs[key]) {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      SCENES[id].paint(c.getContext('2d'), w, h, rng(7));
      this.thumbs[key] = c.toDataURL('image/jpeg', 0.85);
    }
    return this.thumbs[key];
  }

  /** Paints the current room into the hidden picture and prepares its moving effects. */
  build() {
    const scale = Math.min(1, (this.low ? 960 : 1440) / innerWidth); // big screens don't need a pixel-perfect backdrop
    const w = this.w = this.canvas.width = this.buf.width = Math.round(innerWidth * scale);
    const h = this.h = this.canvas.height = this.buf.height = Math.round(innerHeight * scale);
    const sc = SCENES[this.scene];
    sc.paint(this.buf.getContext('2d'), w, h, rng(7));
    const many = (n, f) => Array.from({ length: this.low ? Math.ceil(n / 3) : n }, f);
    const r = Math.random;
    const fx = this.fx = {};
    for (const name of sc.fx || []) {
      if (name === 'petals') fx.petals = many(46, () => ({ x: r() * w, y: r() * h, r: 3 + r() * 5, s: 25 + r() * 45, a: r() * TAU, sp: 1 + r() * 2, d: 0.4 + r() * 0.6 }));
      if (name === 'motes' || name === 'embers') fx[name] = many(34, () => ({ x: r() * w, y: r() * h, r: 1 + r() * 1.8, s: 4 + r() * 12, p: r() * TAU }));
      if (name === 'rain' || name === 'rainwindow') fx[name] = many(110, () => ({ x: r() * w * 1.2, y: r() * h, l: 10 + r() * 16, s: 600 + r() * 500 }));
      if (name === 'twinkle' || name === 'sparkles') fx[name] = many(40, () => ({ x: r() * w, y: r() * h * (name === 'twinkle' ? 0.6 : 1), p: r() * TAU, r: 0.8 + r() * 1.6 }));
      if (name === 'spots') fx.spots = [0.2, 0.4, 0.6, 0.8].map((x, i) => ({ x, p: i * 1.7, c: ['255,122,217', '122,224,255', '255,226,122', '190,140,255'][i] }));
      if (['waves', 'steam', 'shooting', 'fireworks'].includes(name)) fx[name] = { list: [] };
    }
    this.draw(performance.now() / 1000);
  }

  draw(t) {
    const { ctx: g, w, h, fx } = this;
    this.mx += (this.tx - this.mx) * 0.08; this.my += (this.ty - this.my) * 0.08;
    // the painted room, slightly oversized so it can slide a little with the mouse (depth)
    const m = w * 0.012;
    g.drawImage(this.buf, -m - this.mx * m, -m * h / w - this.my * m * 0.5, w + m * 2, h + m * 2 * h / w);
    const sc = SCENES[this.scene];
    for (const [x, y, rad, color] of sc.lights || []) glow(g, w * x, h * y, h * rad, color, 0.75 + 0.25 * Math.sin(t * 2.3 + x * 9)); // lamps breathe

    if (fx.petals) for (const p of fx.petals) {
      const y = (p.y + t * p.s) % (h + 40) - 20, x = (p.x + Math.sin(t * 0.7 + p.a) * 40 + t * 18 * p.d) % (w + 40) - 20;
      g.save(); g.translate(x, y); g.rotate(p.a + t * p.sp); g.globalAlpha = 0.55 + 0.4 * p.d; g.fillStyle = p.d > 0.7 ? '#fff0f6' : '#ffc4dc';
      g.beginPath(); g.ellipse(0, 0, p.r, p.r * 0.5 * Math.abs(Math.cos(t * p.sp + p.a)) + 1, 0, 0, TAU); g.fill(); g.restore();
    }
    for (const name of ['motes', 'embers']) if (fx[name]) for (const p of fx[name]) {
      g.globalAlpha = 0.25 + 0.5 * Math.abs(Math.sin(t * 0.7 + p.p)); g.fillStyle = name === 'embers' ? '#ffd98f' : '#fff3c9';
      g.beginPath(); g.arc(p.x + Math.sin(t * 0.3 + p.p) * 30, (p.y - t * p.s * (name === 'embers' ? 2 : 1) + h * 1000) % h, p.r, 0, TAU); g.fill();
    }
    if (fx.rain || fx.rainwindow) {
      const list = fx.rain || fx.rainwindow;
      g.save();
      if (fx.rainwindow) { g.beginPath(); g.rect(w * 0.05, h * 0.12, w * 0.4, h * 0.44); g.clip(); } // only outside the cafe window
      g.globalAlpha = 1; g.strokeStyle = 'rgba(190,210,255,.4)'; g.lineWidth = 1.2; g.beginPath();
      for (const p of list) { const y = (p.y + t * p.s) % (h + 40) - 20, x = (p.x - t * p.s * 0.18 + w * 100) % (w * 1.2); g.moveTo(x, y); g.lineTo(x - p.l * 0.18, y + p.l); }
      g.stroke(); g.restore();
    }
    for (const name of ['twinkle', 'sparkles']) if (fx[name]) for (const p of fx[name]) {
      const a = Math.max(0, Math.sin(t * 1.6 + p.p));
      g.globalAlpha = a; g.fillStyle = '#fff';
      if (name === 'sparkles') { const s = p.r * 3 * a; g.fillRect(p.x - s, p.y - 0.6, s * 2, 1.2); g.fillRect(p.x - 0.6, p.y - s, 1.2, s * 2); }
      else { g.beginPath(); g.arc(p.x, p.y, p.r, 0, TAU); g.fill(); }
    }
    g.globalAlpha = 1;
    if (fx.spots) { // stage spotlights sweeping from the rig
      g.globalCompositeOperation = 'lighter';
      for (const s of fx.spots) {
        const x0 = w * s.x, x1 = x0 + Math.sin(t * 0.8 + s.p) * w * 0.22, spread = w * 0.07;
        const gr = g.createLinearGradient(0, h * 0.08, 0, h * 0.95); gr.addColorStop(0, `rgba(${s.c},.42)`); gr.addColorStop(1, `rgba(${s.c},0)`);
        g.fillStyle = gr; g.beginPath(); g.moveTo(x0 - 6, h * 0.08); g.lineTo(x0 + 6, h * 0.08); g.lineTo(x1 + spread, h * 0.95); g.lineTo(x1 - spread, h * 0.95); g.fill();
      }
      g.globalCompositeOperation = 'source-over';
    }
    if (fx.waves) { // foam sliding up the sand and sun glitter on the sea
      const foam = h * FLOOR + Math.sin(t * 0.8) * 6;
      g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 4; g.beginPath();
      for (let x = 0; x <= w; x += 24) g.lineTo(x, foam + Math.sin(x * 0.02 + t * 1.4) * 4);
      g.stroke();
      for (let i = 0; i < 12; i++) { const y = h * 0.57 + i * i * 0.9, len = 30 + i * 14, x = w * 0.5 + Math.sin(t * 0.9 + i * 1.7) * (10 + i * 5); g.strokeStyle = `rgba(255,244,210,${0.5 - i * 0.03})`; g.lineWidth = 1 + i * 0.15; g.beginPath(); g.moveTo(x - len / 2, y); g.lineTo(x + len / 2, y); g.stroke(); }
    }
    if (fx.steam) for (const [cx, cy] of [[0.159, FLOOR - 0.13], [0.239, FLOOR - 0.13]]) { // coffee steam
      g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2; g.beginPath();
      for (let k = 0; k <= 8; k++) g.lineTo(w * cx + Math.sin(t * 1.5 + k * 0.8 + cx * 40) * 5, h * cy - k * h * 0.008);
      g.stroke();
    }
    if (fx.shooting) {
      const s = fx.shooting;
      if (!s.star && Math.random() < 0.006) s.star = { x: (0.3 + Math.random() * 0.7) * w, y: Math.random() * 0.25 * h, life: 1 };
      if (s.star) {
        const p = s.star; p.x -= 16; p.y += 7; p.life -= 0.035;
        const gr = g.createLinearGradient(p.x, p.y, p.x + 150, p.y - 64); gr.addColorStop(0, `rgba(255,255,255,${Math.max(0, p.life)})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.strokeStyle = gr; g.lineWidth = 2; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x + 150, p.y - 64); g.stroke();
        if (p.life <= 0) s.star = null;
      }
    }
    if (fx.fireworks) {
      const f = fx.fireworks;
      if (f.list.length < 2 && Math.random() < 0.02) f.list.push({ x: (0.15 + Math.random() * 0.7) * w, y: (0.1 + Math.random() * 0.25) * h, t0: t, hue: Math.random() * 360 });
      f.list = f.list.filter(b => t - b.t0 < 1.8);
      for (const b of f.list) {
        const age = (t - b.t0) / 1.8, rad = h * 0.16 * (1 - Math.pow(1 - age, 3));
        g.globalAlpha = 1 - age; g.fillStyle = `hsl(${b.hue},95%,70%)`;
        for (let i = 0; i < 28; i++) { const a = i * TAU / 28; g.beginPath(); g.arc(b.x + Math.cos(a) * rad, b.y + Math.sin(a) * rad + age * age * 30, 2.2, 0, TAU); g.fill(); }
      }
      g.globalAlpha = 1;
    }
  }
}
