(() => {
  'use strict';

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canvas = document.getElementById('sky');
  const ctx = canvas.getContext('2d');
  const wipBox = document.getElementById('wip');
  const astro = document.getElementById('astronaut');
  const root = document.documentElement;

  // ---------- WIP bitmap: blocky letters, each cell rendered as SUB x SUB dots ----------
  const GLYPHS = {
    W: [
      'XX.........XX',
      'XX.........XX',
      'XX....X....XX',
      'XX...XXX...XX',
      'XX..XX.XX..XX',
      'XX.XX...XX.XX',
      'XXXX.....XXXX',
      'XXX.......XXX',
      'XX.........XX',
    ],
    I: [
      'XXXXXX',
      'XXXXXX',
      '..XX..',
      '..XX..',
      '..XX..',
      '..XX..',
      '..XX..',
      'XXXXXX',
      'XXXXXX',
    ],
    P: [
      'XXXXXXXX.',
      'XXXXXXXXX',
      'XX.....XX',
      'XX.....XX',
      'XXXXXXXXX',
      'XXXXXXXX.',
      'XX.......',
      'XX.......',
      'XX.......',
    ],
  };
  const WORD = 'WIP';
  const GAP = 2;
  const SUB = 2;
  const ROWS = GLYPHS.W.length;

  // Palette across the word: amber -> pink -> violet
  const STOPS = [[255, 174, 92], [255, 122, 168], [169, 139, 255]];
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const paletteAt = (t) => (t < 0.5 ? mix(STOPS[0], STOPS[1], t * 2) : mix(STOPS[1], STOPS[2], (t - 0.5) * 2));

  const dots = [];
  let cols = 0;
  for (const ch of WORD) {
    const glyph = GLYPHS[ch];
    glyph.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) {
        if (row[c] !== 'X') continue;
        for (let sy = 0; sy < SUB; sy++) {
          for (let sx = 0; sx < SUB; sx++) {
            dots.push({ gx: (cols + c) * SUB + sx, gy: r * SUB + sy });
          }
        }
      }
    });
    cols += glyph[0].length + GAP;
  }
  cols -= GAP;
  const GRID_W = cols * SUB;
  wipBox.style.aspectRatio = `${cols} / ${ROWS}`;

  for (const d of dots) {
    const [r, g, b] = paletteAt(d.gx / (GRID_W - 1));
    d.color = `rgb(${r},${g},${b})`;
    d.delay = reduceMotion ? 0 : 200 + Math.random() * 1400; // ms before it starts flying home
    d.x = d.y = d.vx = d.vy = 0;
    d.hx = d.hy = 0;
  }

  // ---------- stars ----------
  const STAR_MAX = 700;
  const stars = Array.from({ length: STAR_MAX }, () => {
    const warm = Math.random() < 0.12;
    return {
      x: Math.random(),
      y: Math.random(),
      z: 0.15 + Math.random() ** 2 * 0.85, // depth: most stars far away
      r: 0.3 + Math.random() * 1.1,
      phase: Math.random() * Math.PI * 2,
      speed: 0.0006 + Math.random() * 0.0018,
      color: warm ? '255,205,160' : '215,225,255',
    };
  });

  // ---------- state ----------
  let W = 0, H = 0, dpr = 1;
  let step = 0, dotR = 0;
  let starCount = 0;
  let pointer = null;               // {x, y} in client coords, null when absent
  let smoothPointer = { x: 0, y: 0 }; // for star parallax
  let laidOut = false;
  let shooting = null;
  let nextShooting = 4000 + Math.random() * 6000;

  const astroState = { x: 0, y: 0, vx: 0, vy: 0, size: 56 };

  function layout() {
    W = innerWidth;
    H = innerHeight;
    dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    starCount = Math.min(STAR_MAX, Math.max(160, Math.round((W * H) / 2600)));

    const rect = wipBox.getBoundingClientRect();
    step = rect.width / GRID_W;
    dotR = step * 0.34;
    const ox = rect.left + step / 2;
    const oy = rect.top + scrollY + step / 2; // document coords
    for (const d of dots) {
      d.hx = ox + d.gx * step;
      d.hy = oy + d.gy * step;
      if (!laidOut) {
        if (reduceMotion) {
          d.x = d.hx;
          d.y = d.hy;
        } else {
          d.x = Math.random() * W;
          d.y = scrollY + Math.random() * H;
        }
      }
    }

    if (!laidOut) {
      astroState.x = reduceMotion ? W * 0.8 : W * 0.85;
      astroState.y = reduceMotion ? H * 0.22 : H * 0.2;
    }
    laidOut = true;
  }

  // ---------- input ----------
  addEventListener('pointermove', (e) => { pointer = { x: e.clientX, y: e.clientY }; }, { passive: true });
  addEventListener('pointerdown', (e) => { pointer = { x: e.clientX, y: e.clientY }; }, { passive: true });
  addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') pointer = null; }, { passive: true });
  addEventListener('pointercancel', () => { pointer = null; }, { passive: true });
  document.addEventListener('pointerleave', () => { pointer = null; });
  addEventListener('blur', () => { pointer = null; });
  addEventListener('resize', layout);

  // ---------- drawing ----------
  function drawStars(t, f) {
    const sy = scrollY;
    smoothPointer.x += ((pointer ? pointer.x / W - 0.5 : 0) - smoothPointer.x) * 0.04 * f;
    smoothPointer.y += ((pointer ? pointer.y / H - 0.5 : 0) - smoothPointer.y) * 0.04 * f;

    for (let i = 0; i < starCount; i++) {
      const s = stars[i];
      if (!reduceMotion) s.x = (s.x + s.z * 0.000012 * f) % 1; // slow drift
      let x = s.x * W - smoothPointer.x * 30 * s.z;
      let y = s.y * H - sy * 0.25 * s.z - smoothPointer.y * 30 * s.z;
      x = ((x % W) + W) % W;
      y = ((y % H) + H) % H;
      const tw = reduceMotion ? 0.8 : 0.55 + 0.45 * Math.sin(t * s.speed + s.phase);
      ctx.fillStyle = `rgba(${s.color},${(0.25 + 0.75 * s.z) * tw})`;
      ctx.beginPath();
      ctx.arc(x, y, s.r * (0.6 + s.z * 0.7), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawShootingStar(t, f) {
    if (reduceMotion) return;
    if (!shooting && t > nextShooting) {
      const angle = Math.PI * (0.15 + Math.random() * 0.15);
      const speed = 9 + Math.random() * 6;
      shooting = {
        x: Math.random() * W * 0.7,
        y: Math.random() * H * 0.4,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
      };
      nextShooting = t + 6000 + Math.random() * 9000;
    }
    if (!shooting) return;
    const s = shooting;
    s.x += s.vx * f;
    s.y += s.vy * f;
    s.life -= 0.018 * f;
    if (s.life <= 0 || s.x > W + 50 || s.y > H + 50) { shooting = null; return; }
    const tail = 14;
    const g = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * tail, s.y - s.vy * tail);
    g.addColorStop(0, `rgba(255,236,210,${s.life})`);
    g.addColorStop(1, 'rgba(255,236,210,0)');
    ctx.strokeStyle = g;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x - s.vx * tail, s.y - s.vy * tail);
    ctx.stroke();
  }

  function drawDots(t, f) {
    const sy = scrollY;
    const heroFade = Math.max(0, 1 - sy / (H * 0.75));
    root.style.setProperty('--hero', heroFade.toFixed(3));
    if (heroFade <= 0) return;

    const repelR = step * 9;
    const repelR2 = repelR * repelR;
    const push = step * 1.6;
    const k = 0.045;
    const damp = Math.pow(0.84, f);

    for (const d of dots) {
      const active = t > d.delay;
      if (!reduceMotion) {
        if (active) {
          d.vx += (d.hx - d.x) * k * f;
          d.vy += (d.hy - d.y) * k * f;
        }
        if (pointer) {
          const dx = d.x - pointer.x;
          const dy = d.y - sy - pointer.y;
          const dist2 = dx * dx + dy * dy;
          if (dist2 < repelR2 && dist2 > 0.01) {
            const dist = Math.sqrt(dist2);
            const force = (1 - dist / repelR) ** 2 * push * f;
            d.vx += (dx / dist) * force;
            d.vy += (dy / dist) * force;
          }
        }
        d.vx *= damp;
        d.vy *= damp;
        d.x += d.vx * f;
        d.y += d.vy * f;
      }

      const x = d.x;
      const y = d.y - sy;
      if (y < -20 || y > H + 20) continue;

      // Gentle fuzz wave rippling through the grid
      const wave = reduceMotion ? 1 : 1 + 0.22 * Math.sin(t * 0.0022 - d.gx * 0.28 + d.gy * 0.18);
      const r = dotR * wave;
      const alpha = (active ? 1 : 0.35) * heroFade;

      ctx.fillStyle = d.color;
      ctx.globalAlpha = alpha * 0.12;
      ctx.beginPath();
      ctx.arc(x, y, r * 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function moveAstronaut(t, f) {
    const a = astroState;
    if (!reduceMotion) {
      let tx, ty;
      if (pointer) {
        // Lazily trail the cursor, keeping a respectful distance
        tx = pointer.x + 70;
        ty = pointer.y + 60;
      } else {
        // Wander a slow Lissajous orbit
        tx = W * (0.5 + 0.38 * Math.sin(t * 0.00011));
        ty = H * (0.5 + 0.34 * Math.sin(t * 0.00017 + 1.3));
      }
      // Keep him on screen even when the cursor sits at an edge
      const m = a.size;
      tx = Math.min(Math.max(tx, m), W - m);
      ty = Math.min(Math.max(ty, m), H - m);
      a.vx += (tx - a.x) * 0.0009 * f;
      a.vy += (ty - a.y) * 0.0009 * f;
      a.vx *= Math.pow(0.965, f);
      a.vy *= Math.pow(0.965, f);
      a.x += a.vx * f;
      a.y += a.vy * f;
    }
    const bob = reduceMotion ? 0 : Math.sin(t * 0.0012) * 6;
    const rot = reduceMotion ? -12 : Math.sin(t * 0.0004) * 20 + a.vx * 2.5;
    astro.style.transform =
      `translate3d(${(a.x - a.size / 2).toFixed(1)}px, ${(a.y - a.size / 2 + bob).toFixed(1)}px, 0) rotate(${rot.toFixed(1)}deg)`;
  }

  // ---------- loop ----------
  let last = performance.now();
  const start = last;
  function frame(now) {
    const f = Math.min((now - last) / 16.667, 3); // normalise to 60fps steps
    last = now;
    const t = now - start;
    ctx.clearRect(0, 0, W, H);
    drawStars(t, f);
    drawShootingStar(t, f);
    drawDots(t, f);
    moveAstronaut(t, f);
    requestAnimationFrame(frame);
  }

  // ---------- about card opens when scrolled into view ----------
  // Observe the section, not the card: the card's clip-path collapses its visible area to zero.
  const card = document.querySelector('.about-card');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        card.classList.add('open');
        io.disconnect();
      }
    }, { threshold: 0.3 });
    io.observe(card.parentElement);
  } else {
    card.classList.add('open');
  }

  layout();
  requestAnimationFrame(frame);
})();
