// The living room behind the companion: an animated scene drawn on a canvas for each background
// (falling petals, rain on a neon skyline, light shafts in a classroom, waves, drifting stars).
// Layers shift slightly with the mouse so the room feels like it has depth.

const rand = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;

export class Environment {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.scene = 'sakura';
    this.mx = 0; this.my = 0; this.tx = 0; this.ty = 0;
    this.build();
    addEventListener('resize', () => this.build());
    addEventListener('pointermove', e => { this.tx = e.clientX / innerWidth * 2 - 1; this.ty = e.clientY / innerHeight * 2 - 1; });
    const loop = now => { this.draw(now / 1000); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  set(scene) {
    if (scene === this.scene) return;
    this.scene = scene;
    this.build();
  }

  /** (Re)creates the random bits of the current scene: particles, buildings, stars. */
  build() {
    const w = this.w = this.canvas.width = innerWidth;
    const h = this.h = this.canvas.height = innerHeight;
    const many = (n, f) => Array.from({ length: n }, f);
    this.petals = many(70, () => ({ x: rand(0, w), y: rand(-h, h), r: rand(4, 9), s: rand(25, 70), a: rand(0, TAU), sp: rand(1, 3), d: rand(0.4, 1) }));
    this.stars = many(220, () => ({ x: rand(0, 1), y: rand(0, 1), r: rand(0.3, 1.8), p: rand(0, TAU), d: rand(0.2, 1) }));
    this.rain = many(160, () => ({ x: rand(0, w * 1.2), y: rand(0, h), l: rand(10, 26), s: rand(700, 1200) }));
    this.motes = many(50, () => ({ x: rand(0, w), y: rand(0, h), r: rand(1, 2.6), s: rand(4, 14), p: rand(0, TAU) }));
    const skyline = (count, minH, maxH) => {
      const out = []; let x = -60;
      while (x < w + 60) {
        const bw = rand(50, 130), bh = rand(minH, maxH) * h;
        const wins = many(Math.floor(bw / 16) * Math.floor(bh / 22), () => ({ on: Math.random() < 0.45, p: rand(0, TAU), hue: Math.random() < 0.2 ? 320 : 45 }));
        out.push({ x, w: bw, h: bh, wins });
        x += bw + rand(2, 14);
      }
      return out;
    };
    this.far = skyline(0, 0.12, 0.3);
    this.near = skyline(0, 0.2, 0.46);
    this.shooting = null;
  }

  draw(t) {
    const { ctx, w, h } = this;
    this.mx += (this.tx - this.mx) * 0.05;
    this.my += (this.ty - this.my) * 0.05;
    ctx.clearRect(0, 0, w, h);
    (this[this.scene] || this.sakura).call(this, t);
  }

  // parallax offset for a layer (depth 0 = far away, 1 = close)
  px(depth) { return -this.mx * 26 * depth; }
  py(depth) { return -this.my * 12 * depth; }

  glow(x, y, r, color, alpha = 1) {
    const { ctx } = this;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color); g.addColorStop(1, 'transparent');
    ctx.globalAlpha = alpha; ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.globalAlpha = 1;
  }

  hills(baseY, amp, color, depth, seed) {
    const { ctx, w, h } = this;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(0, h);
    for (let x = -40; x <= w + 40; x += 20) {
      const xx = x + this.px(depth);
      ctx.lineTo(xx, baseY + this.py(depth) + Math.sin(x * 0.004 + seed) * amp + Math.sin(x * 0.011 + seed * 3) * amp * 0.4);
    }
    ctx.lineTo(w + 40, h); ctx.fill();
  }

  floor(top, colorTop, colorBottom, lines = 'rgba(255,255,255,.08)') {
    const { ctx, w, h } = this;
    const y = h * top + this.py(0.8);
    const g = ctx.createLinearGradient(0, y, 0, h);
    g.addColorStop(0, colorTop); g.addColorStop(1, colorBottom);
    ctx.fillStyle = g; ctx.fillRect(0, y, w, h - y);
    ctx.strokeStyle = lines; ctx.lineWidth = 1;
    const cx = w / 2 + this.px(0.8);
    for (let i = -14; i <= 14; i++) { ctx.beginPath(); ctx.moveTo(cx + i * 46, y); ctx.lineTo(cx + i * 190, h); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }

  drawStars(t, alpha = 1, color = '255,255,255') {
    const { ctx, w, h } = this;
    for (const s of this.stars) {
      ctx.globalAlpha = alpha * (0.35 + 0.65 * Math.abs(Math.sin(t * 0.8 + s.p)));
      ctx.fillStyle = `rgb(${color})`;
      ctx.beginPath(); ctx.arc(((s.x * w + t * 3 * s.d) % w) + this.px(s.d * 0.3), s.y * h * 0.8 + this.py(s.d * 0.3), s.r, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ---------------- Scenes ----------------
  sakura(t) {
    const { ctx, w, h } = this;
    this.glow(w * 0.76 + this.px(0.1), h * 0.26 + this.py(0.1), h * 0.45, 'rgba(255,244,214,.9)', 0.75);
    ctx.fillStyle = '#fff6df'; ctx.beginPath(); ctx.arc(w * 0.76 + this.px(0.1), h * 0.26 + this.py(0.1), h * 0.07, 0, TAU); ctx.fill();
    this.hills(h * 0.62, 34, 'rgba(150,90,160,.45)', 0.2, 1);
    this.hills(h * 0.68, 26, 'rgba(110,60,130,.6)', 0.4, 4);
    this.floor(0.8, 'rgba(70,35,90,.75)', 'rgba(30,14,48,.95)');
    for (const p of this.petals) { // petals drift down and sideways, tumbling
      const y = (p.y + t * p.s) % (h + 40) - 20;
      const x = (p.x + Math.sin(t * 0.7 + p.a) * 40 + t * 18 * p.d) % (w + 40) - 20;
      ctx.save(); ctx.translate(x + this.px(p.d), y + this.py(p.d)); ctx.rotate(p.a + t * p.sp);
      ctx.globalAlpha = 0.55 + 0.4 * p.d; ctx.fillStyle = p.d > 0.7 ? '#fff0f6' : '#ffc4dc';
      ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * 0.5 * Math.abs(Math.cos(t * p.sp + p.a)) + 1, 0, 0, TAU); ctx.fill(); ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  night_city(t) {
    const { ctx, w, h } = this;
    this.drawStars(t, 0.7);
    this.glow(w * 0.5, h * 0.78, h * 0.7, 'rgba(255,46,136,.5)', 0.8);
    const base = h * 0.8;
    const layer = (list, depth, body, lit) => {
      for (const b of list) {
        const x = b.x + this.px(depth), y = base - b.h + this.py(depth);
        ctx.fillStyle = body; ctx.fillRect(x, y, b.w, b.h + 40);
        const cols = Math.floor(b.w / 16);
        b.wins.forEach((wn, i) => {
          if (!wn.on || Math.sin(t * 0.4 + wn.p) < -0.92) return; // a few windows flicker off now and then
          ctx.fillStyle = `hsla(${wn.hue},90%,${lit}%,${0.5 + 0.3 * Math.sin(t + wn.p)})`;
          ctx.fillRect(x + 5 + (i % cols) * 16, y + 8 + Math.floor(i / cols) * 22, 7, 11);
        });
      }
    };
    layer(this.far, 0.25, 'rgba(34,26,78,.9)', 62);
    layer(this.near, 0.5, 'rgba(14,10,40,.96)', 70);
    this.floor(0.8, 'rgba(22,14,52,.96)', 'rgba(6,4,20,1)', 'rgba(255,46,136,.16)');
    ctx.strokeStyle = 'rgba(190,210,255,.35)'; ctx.lineWidth = 1.2; ctx.beginPath();
    for (const r of this.rain) {
      const y = (r.y + t * r.s) % (h + 40) - 20, x = (r.x - t * r.s * 0.18) % (w * 1.2);
      ctx.moveTo(x, y); ctx.lineTo(x - r.l * 0.18, y + r.l);
    }
    ctx.stroke();
  }

  classroom(t) {
    const { ctx, w, h } = this;
    const ox = this.px(0.3), oy = this.py(0.3);
    // a wall of tall windows with the afternoon sky behind them
    const top = h * 0.1 + oy, bottom = h * 0.72 + oy, n = 5, gap = w / n;
    for (let i = 0; i < n; i++) {
      const x = i * gap + gap * 0.1 + ox;
      const g = ctx.createLinearGradient(0, top, 0, bottom);
      g.addColorStop(0, 'rgba(160,215,255,.9)'); g.addColorStop(1, 'rgba(255,240,205,.9)');
      ctx.fillStyle = g; ctx.fillRect(x, top, gap * 0.8, bottom - top);
      ctx.strokeStyle = 'rgba(140,100,70,.9)'; ctx.lineWidth = 8; ctx.strokeRect(x, top, gap * 0.8, bottom - top);
      ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x + gap * 0.4, top); ctx.lineTo(x + gap * 0.4, bottom);
      ctx.moveTo(x, top + (bottom - top) * 0.4); ctx.lineTo(x + gap * 0.8, top + (bottom - top) * 0.4); ctx.stroke();
    }
    // clouds drifting past the windows
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    for (let i = 0; i < 4; i++) { const cx = ((i * 0.31 * w + t * 9) % (w + 300)) - 150; ctx.beginPath(); ctx.ellipse(cx + ox, top + 60 + i * 34, 110, 22, 0, 0, TAU); ctx.fill(); }
    this.floor(0.8, 'rgba(150,104,66,.95)', 'rgba(84,54,34,1)', 'rgba(60,35,20,.35)');
    // warm light shafts falling across the room
    for (let i = 0; i < n; i++) {
      const x = i * gap + gap * 0.1 + ox, sway = Math.sin(t * 0.2 + i) * 14;
      const g = ctx.createLinearGradient(0, top, 0, h);
      g.addColorStop(0, 'rgba(255,236,170,.22)'); g.addColorStop(1, 'rgba(255,236,170,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x + gap * 0.8, top);
      ctx.lineTo(x + gap * 0.8 - 260 + sway, h); ctx.lineTo(x - 320 + sway, h); ctx.fill();
    }
    // a curtain swaying at the left edge
    ctx.fillStyle = 'rgba(255,250,235,.85)'; ctx.beginPath(); ctx.moveTo(-20, 0);
    for (let y = 0; y <= h * 0.78; y += 20) ctx.lineTo(70 + Math.sin(t * 1.1 + y * 0.012) * (10 + y * 0.03) + this.px(0.9), y);
    ctx.lineTo(-20, h * 0.78); ctx.fill();
    for (const m of this.motes) { // dust in the light
      ctx.globalAlpha = 0.25 + 0.45 * Math.abs(Math.sin(t * 0.6 + m.p)); ctx.fillStyle = '#fff3c9';
      ctx.beginPath(); ctx.arc(m.x + Math.sin(t * 0.3 + m.p) * 30 + this.px(0.7), (m.y - t * m.s + h * 100) % h, m.r, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  beach(t) {
    const { ctx, w, h } = this;
    const hor = h * 0.6 + this.py(0.2), sx = w * 0.5 + this.px(0.1);
    this.glow(sx, hor, h * 0.6, 'rgba(255,230,160,.95)', 0.8);
    ctx.fillStyle = '#fff3c4'; ctx.beginPath(); ctx.arc(sx, hor - h * 0.03, h * 0.085, Math.PI, TAU); ctx.fill();
    const g = ctx.createLinearGradient(0, hor, 0, h * 0.82);
    g.addColorStop(0, 'rgba(255,170,130,.95)'); g.addColorStop(1, 'rgba(46,96,150,.98)');
    ctx.fillStyle = g; ctx.fillRect(0, hor, w, h);
    for (let i = 0; i < 26; i++) { // sun glitter and wave lines, wider toward the shore
      const y = hor + 6 + i * i * 0.34, len = 40 + i * 16;
      const x = sx + Math.sin(t * 0.9 + i * 1.7) * (14 + i * 5);
      ctx.strokeStyle = `rgba(255,244,210,${0.55 - i * 0.015})`; ctx.lineWidth = 1 + i * 0.12;
      ctx.beginPath(); ctx.moveTo(x - len / 2, y); ctx.lineTo(x + len / 2, y); ctx.stroke();
    }
    this.floor(0.8, 'rgba(240,206,150,.98)', 'rgba(176,132,88,1)', 'rgba(120,80,40,.12)');
    const foam = h * 0.8 + Math.sin(t * 0.8) * 8 + this.py(0.8); // foam sliding up the sand
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 5; ctx.beginPath();
    for (let x = 0; x <= w; x += 16) ctx.lineTo(x, foam + Math.sin(x * 0.02 + t * 1.4) * 5);
    ctx.stroke();
  }

  galaxy(t) {
    const { ctx, w, h } = this;
    this.glow(w * 0.28 + this.px(0.15), h * 0.3, h * 0.6, 'rgba(160,80,255,.55)', 0.8 + 0.2 * Math.sin(t * 0.3));
    this.glow(w * 0.75 + this.px(0.2), h * 0.55, h * 0.5, 'rgba(60,160,255,.4)', 0.8);
    this.drawStars(t, 1);
    this.drawStars(t * 0.5 + 40, 0.7, '200,170,255');
    if (!this.shooting && Math.random() < 0.004) this.shooting = { x: rand(0.2, 1) * w, y: rand(0, 0.3) * h, life: 1 };
    if (this.shooting) {
      const s = this.shooting; s.x -= 14; s.y += 6; s.life -= 0.02;
      const g = ctx.createLinearGradient(s.x, s.y, s.x + 160, s.y - 68);
      g.addColorStop(0, `rgba(255,255,255,${s.life})`); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = g; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x + 160, s.y - 68); ctx.stroke();
      if (s.life <= 0) this.shooting = null;
    }
    this.floor(0.8, 'rgba(40,24,90,.7)', 'rgba(8,6,26,.95)', 'rgba(160,140,255,.18)');
  }
}
