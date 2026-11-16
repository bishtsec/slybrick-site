/* Slybrick scene: the three.js shape behind the site.

   A pentagonal bipyramid: a pentagon, its star, one apex in front and one behind, all 21 edges,
   a core between the apexes, and beads travelling along every edge. Particles, lighting, grain and the
   rising dust sit on a grained graphite ground.

   Scrolling the page turns the shape (TURNS full turns over the whole page). Dragging it turns it too.
   site.js calls SlyScene.setAccent('#rrggbb') so the core, the one sly brick, wears the colour of the
   card you are reading about. */
(function () {
  'use strict';
  var T3 = window.THREE;
  if (!T3) { console.error('three.min.js must load before scene.js'); return; }

  /* ───────────────────────── knobs ───────────────────────── */
  var TURNS   = 2;       // full turns the shape makes over the whole page
  var FOV     = 32;      // perspective strength
  var DENSITY = 44400;   // particles per unit of surface share
  var RING = 0.36;       // pentagon radius
  var APEX = 0.36;       // height of the two apex nodes above / below the pentagon's plane
  var REST = 0.3;        // rest-pose yaw (rad): turned a little so the depth shows before anyone touches it
  var ACCENT0 = '#ffb627';   // marigold, the sly brick on a dark ground

  var PI2 = Math.PI * 2;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var small = window.matchMedia('(max-width: 700px)').matches;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function norm3(v) { var l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function cross3(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function perp(ax) { var t = Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], e = norm3(cross3(ax, t)); return [e, cross3(ax, e)]; }
  function unit() { var u = Math.random() * 2 - 1, t = Math.random() * PI2, s = Math.sqrt(1 - u * u); return [s * Math.cos(t), u, s * Math.sin(t)]; }
  function flow(x, y, t) { return (Math.sin(x * 1.7 + t) + Math.sin(y * 1.3 - t * 0.8) + Math.sin((x + y) * 0.9 + t * 0.5)) * 1.6; }
  function hexVec(h) { var n = parseInt(String(h).replace('#', ''), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }

  /* ───────────────────────── layout ─────────────────────────
     Wide screens: the shape on the left, the text column (site.css --col) on the right.
     Phones and portrait tablets: the shape on top, the text below.                                  */
  function colWidth(w) { return clamp(w * 0.44, 420, 600); }              // same numbers as --col in site.css
  function stacked(w, h) { return w < 900 || w / h <= 0.9; }              // same breakpoint as site.css
  function layout(w, h) {
    if (stacked(w, h)) return { s: Math.min(w * 0.8, h * 0.45), cx: w * 0.5, cy: h * 0.32 };
    var pad = clamp(w * 0.036, 20, 52);                                    // same as --pad
    var colLeft = w - pad - Math.min(colWidth(w), w - 2 * pad);
    var left = 30, aw = Math.max(200, colLeft - 36 - left);
    return { s: Math.min(h * 0.74, aw * 0.78), cx: left + aw / 2, cy: h * 0.5 };
  }
  // keep particles per screen pixel constant: density follows the shape's on-screen size at load (1440x900 = 1x)
  var dens = DENSITY * clamp(Math.pow(layout(window.innerWidth, window.innerHeight).s * 1.05 / 590, 2), 0.35, 2.2);

  /* ──────────── model: pentagonal bipyramid, every node joined to every other ────────────
     5 pentagon nodes in a plane, 1 apex node in front, 1 behind, a core between the apexes.
     Edges: the pentagon, its 5 diagonals (the star), each pentagon node to both apexes, and the
     axis apex-to-apex through the core. All 7 outer nodes are joined pairwise (21 edges).          */
  var ring = [], nodes = [], edges = [], i;
  for (i = 0; i < 5; i++) {
    var a0 = Math.PI / 2 + i * PI2 / 5;                       // point-up
    ring.push([RING * Math.cos(a0), RING * Math.sin(a0), 0]);
  }
  var apexF = [0, 0, APEX], apexB = [0, 0, -APEX], core = [0, 0, 0];
  ring.forEach(function (p) { nodes.push({ c: p, r: 0.06 }); });
  nodes.push({ c: apexF, r: 0.046 }, { c: apexB, r: 0.046 }, { c: core, r: 0.052, accent: true });
  for (i = 0; i < 5; i++) {
    edges.push({ a: ring[i], b: ring[(i + 1) % 5], r: 0.0065, w: 2.2, al: 0.95 });   // pentagon
    edges.push({ a: ring[i], b: ring[(i + 2) % 5], r: 0.0048, w: 1.7, al: 0.9 });    // star diagonals
    edges.push({ a: ring[i], b: apexF, r: 0.0048, w: 1.7, al: 0.9 });
    edges.push({ a: ring[i], b: apexB, r: 0.0048, w: 1.7, al: 0.9 });
  }
  edges.push({ a: apexF, b: apexB, r: 0.0048, w: 1.7, al: 0.9 });                     // axis, through the core

  /* ──────────── particle sampling: spheres, tubes, rings (surface share = area x weight) ────────────
     Two groups: 0 = white (everything), 1 = accent (the core and the ring round it).                   */
  var FILL = 0.5, LINE = 2.4, G = [[], []];
  function addSphere(g, c, r, alb, w) { G[g].push({ k: 0, c: c, r: r, alb: alb, mat: 0, share: 4 * Math.PI * r * r * w * FILL }); }
  function addTube(g, a, b, r, alb, w) {
    var d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(d[0], d[1], d[2]);
    G[g].push({ k: 1, a: a, d: d, e: perp(norm3(d)), r: r, alb: alb, mat: 4, share: PI2 * r * L * w * LINE });
  }
  function addRing(g, c, axis, R0, r, alb, w) {
    var ax = norm3(axis);
    G[g].push({ k: 2, c: c, ax: ax, e: perp(ax), R: R0, r: r, alb: alb, mat: 4, share: 4 * Math.PI * Math.PI * R0 * r * w * LINE });
  }
  nodes.forEach(function (n) {
    var g = n.accent ? 1 : 0;
    addSphere(g, n.c, n.r, 0.95, 3.2);
    addRing(g, n.c, [0.25, 1, 0.15], n.r * 1.01, Math.max(0.0018, n.r * 0.03), 1, 3);   // seam round each node
  });
  addRing(1, core, [0, 0, 1], 0.1, 0.003, 1, 3);                                          // ring round the core
  edges.forEach(function (e) { addTube(0, e.a, e.b, e.r, e.al, e.w); });

  function sampleParts(list) {
    var sum = 0; list.forEach(function (p) { sum += p.share; });
    var N = Math.round(sum * dens), pos = new Float32Array(N * 3), nor = new Float32Array(N * 3), dat = new Float32Array(N * 4);
    var k = 0, rem = N;
    list.forEach(function (p, idx) {
      var cnt = idx === list.length - 1 ? rem : Math.min(rem, Math.round(N * p.share / sum));
      rem -= cnt;
      for (var q = 0; q < cnt; q++, k++) {
        var P, Nn;
        if (p.k === 0) {
          Nn = unit();
          P = [p.c[0] + p.r * Nn[0], p.c[1] + p.r * Nn[1], p.c[2] + p.r * Nn[2]];
        } else if (p.k === 1) {
          var t = Math.random(), th = Math.random() * PI2, ct = Math.cos(th), st = Math.sin(th);
          Nn = [ct * p.e[0][0] + st * p.e[1][0], ct * p.e[0][1] + st * p.e[1][1], ct * p.e[0][2] + st * p.e[1][2]];
          P = [p.a[0] + p.d[0] * t + p.r * Nn[0], p.a[1] + p.d[1] * t + p.r * Nn[1], p.a[2] + p.d[2] * t + p.r * Nn[2]];
        } else {
          var u = Math.random() * PI2, v;
          do { v = Math.random() * PI2; } while (Math.random() * (p.R + p.r) > p.R + p.r * Math.cos(v));
          var cu = Math.cos(u), su = Math.sin(u), cv = Math.cos(v), sv = Math.sin(v), rr = p.R + p.r * cv;
          var rad = [cu * p.e[0][0] + su * p.e[1][0], cu * p.e[0][1] + su * p.e[1][1], cu * p.e[0][2] + su * p.e[1][2]];
          Nn = [cv * rad[0] + sv * p.ax[0], cv * rad[1] + sv * p.ax[1], cv * rad[2] + sv * p.ax[2]];
          P = [p.c[0] + rr * rad[0] + p.r * sv * p.ax[0], p.c[1] + rr * rad[1] + p.r * sv * p.ax[1], p.c[2] + rr * rad[2] + p.r * sv * p.ax[2]];
        }
        pos[k * 3] = P[0]; pos[k * 3 + 1] = P[1]; pos[k * 3 + 2] = P[2];
        nor[k * 3] = Nn[0]; nor[k * 3 + 1] = Nn[1]; nor[k * 3 + 2] = Nn[2];
        dat[k * 4] = p.alb; dat[k * 4 + 1] = p.mat; dat[k * 4 + 2] = Math.random();
      }
    });
    return { pos: pos, nor: nor, dat: dat, n: N };
  }

  /* beads: two small particle balls travelling along every edge (the "in between") */
  function sampleBeads() {
    var per = 2, M = small ? 70 : 140, BR = 0.012, N = edges.length * per * M;
    var off = new Float32Array(N * 3), nor = new Float32Array(N * 3), dat = new Float32Array(N * 4);
    var A = new Float32Array(N * 3), B = new Float32Array(N * 3), ph = new Float32Array(N * 2), k = 0;
    edges.forEach(function (e, ei) {
      for (var b = 0; b < per; b++) {
        var phase = (b / per + (ei % 7) * 0.09 + Math.random() * 0.04) % 1;
        var speed = (0.08 + 0.07 * Math.random()) * (Math.random() < 0.5 ? 1 : -1);
        for (var m = 0; m < M; m++, k++) {
          var u = unit();
          off[k * 3] = u[0] * BR; off[k * 3 + 1] = u[1] * BR; off[k * 3 + 2] = u[2] * BR;
          nor[k * 3] = u[0]; nor[k * 3 + 1] = u[1]; nor[k * 3 + 2] = u[2];
          A[k * 3] = e.a[0]; A[k * 3 + 1] = e.a[1]; A[k * 3 + 2] = e.a[2];
          B[k * 3] = e.b[0]; B[k * 3 + 1] = e.b[1]; B[k * 3 + 2] = e.b[2];
          ph[k * 2] = phase; ph[k * 2 + 1] = speed;
          dat[k * 4] = 1; dat[k * 4 + 1] = 0; dat[k * 4 + 2] = Math.random();
        }
      }
    });
    return { off: off, nor: nor, dat: dat, A: A, B: B, ph: ph };
  }

  /* ───────────────────────── shaders ─────────────────────────
     Lighting: Lambert + rim + facing fade + hatch bands, light fixed to the camera. */
  var VERT = `
    attribute vec4 aData;                       // albedo, material (0 sphere, 4 tube/ring), seed
    #ifdef BEAD
    attribute vec3 aA; attribute vec3 aB; attribute vec2 aPh;   // edge ends, phase + speed
    uniform float uTime;
    #endif
    uniform float uPR; uniform float uGlow; uniform float uGain; uniform float uCamD; uniform vec3 uLight;
    varying float vA;
    float sm(float x) { x = clamp(x, 0.0, 1.0); return x * x * (3.0 - 2.0 * x); }
    void main() {
      vec3 P = position;
      float env = 1.0;
    #ifdef BEAD
      float t = fract(aPh.x + uTime * aPh.y);
      P = mix(aA, aB, mix(0.12, 0.88, t)) + position;
      env = sin(3.14159265 * t);
    #endif
      vec4 mv = modelViewMatrix * vec4(P, 1.0);
      vec3 nV = normalize(normalMatrix * normal);
      float face = dot(nV, normalize(-mv.xyz));
      float lam = dot(nV, uLight);
      float alb = aData.x, mat = aData.y, seed = aData.z;
      float rm = 1.0 - abs(face), rm2 = rm * rm;
      float b = alb * (0.3 + 0.72 * max(0.0, lam)) + 1.25 * rm2 * rm2 * min(1.0, alb * 1.4);
      b *= sm((face + 0.1) / 0.25);
      if (mat > 3.5) {
        b = max(b, alb * 0.75 * sm((face + 0.25) / 0.3));
      } else {
        float hv = 0.5 + 0.5 * cos((P.y + 0.45 * P.x - 0.2 * P.z) * 340.0);
        float mid = 0.35 * sm(b / 0.12) * (1.0 - sm((b - 0.55) / 0.3));
        b = b * (1.0 - mid) + mid * min(1.0, b * hv * hv * hv * 3.2);
      }
      b *= mix(0.55, 1.0, clamp((uCamD + mv.z) / 0.8 + 0.5, 0.0, 1.0));   // far side a little dimmer
      b *= env;
      float a = min(1.0, pow(max(b, 0.0), 1.25) * 1.25) * uGain;
      vA = a;
      gl_Position = projectionMatrix * mv;
      float sz = seed < 0.1 ? 1.1 : 0.85;
      gl_PointSize = max(1.0, sz * uPR);
      if (uGlow > 0.5) {                                                   // bloom pass: every 4th bright particle, big faint sprite
        if (mod(floor(seed * 4096.0), 4.0) > 0.5 || a < 0.8) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        gl_PointSize = max(1.0, sz * uPR * 6.0);
      }
    }`;
  var FRAG = `
    uniform vec3 uCol; uniform float uGlow;
    varying float vA;
    void main() {
      vec2 c = gl_PointCoord - 0.5;
      float d = dot(c, c) * 4.0;
      float f = uGlow > 0.5 ? exp(-d * 5.0) * 0.03 : 1.0 - smoothstep(0.75, 1.0, d);
      float v = min(vA * f, 1.0);
      gl_FragColor = vec4(uCol * v, v);
    }`;
  var BEAM_VERT = `
    attribute float aAlpha; attribute float aSeed;
    uniform float uTime; uniform float uPR; uniform float uGain;
    varying float vA;
    void main() {
      vA = aAlpha * (0.8 + 0.2 * sin(uTime * (1.5 + aSeed * 3.0) + aSeed * 40.0)) * uGain;
      gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
      gl_PointSize = max(1.0, 0.85 * uPR);
    }`;

  /* ───────────────────────── scene ───────────────────────── */
  var glc = document.getElementById('gl'), bgc = document.getElementById('bg'), grainEl = document.getElementById('grain');
  var renderer = new T3.WebGLRenderer({ canvas: glc, antialias: false, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  var scene = new T3.Scene(), camera = new T3.PerspectiveCamera(FOV, 1, 0.1, 10), obj = new T3.Group();
  scene.add(obj);

  var c0 = hexVec(ACCENT0), accent = new T3.Vector3(c0[0], c0[1], c0[2]), accentTo = accent.clone();
  var U = {
    uPR: { value: 1 }, uGain: { value: 1.9 }, uCamD: { value: 3 }, uTime: { value: 0 },
    uLight: { value: new T3.Vector3(-0.45, 0.65, 0.62).normalize() },
    uCol: { value: new T3.Vector3(1, 1, 1) }
  };
  function additive(o) {                         // premultiplied additive: colour*v, alpha v
    o.transparent = true; o.depthWrite = false; o.blending = T3.CustomBlending; o.blendEquation = T3.AddEquation;
    o.blendSrc = o.blendDst = o.blendSrcAlpha = o.blendDstAlpha = T3.OneFactor;
    return o;
  }
  function mkMat(glow, bead, col) {
    return new T3.ShaderMaterial(additive({
      uniforms: Object.assign({}, U, { uGlow: { value: glow ? 1 : 0 }, uCol: { value: col || U.uCol.value } }),
      vertexShader: VERT, fragmentShader: FRAG, defines: bead ? { BEAD: 1 } : {}, depthTest: true
    }));
  }
  function points(geo, mat) { var p = new T3.Points(geo, mat); p.frustumCulled = false; return p; }
  function shape(list, col) {
    var S = sampleParts(list), geo = new T3.BufferGeometry();
    geo.setAttribute('position', new T3.BufferAttribute(S.pos, 3));
    geo.setAttribute('normal', new T3.BufferAttribute(S.nor, 3));
    geo.setAttribute('aData', new T3.BufferAttribute(S.dat, 4));
    obj.add(points(geo, mkMat(false, false, col)), points(geo, mkMat(true, false, col)));
    return S;
  }
  var S = shape(G[0], null);                     // white
  shape(G[1], accent);                           // accent: shares the `accent` vector, so one lerp recolours it

  var BD = sampleBeads(), bgeo = new T3.BufferGeometry();
  bgeo.setAttribute('position', new T3.BufferAttribute(BD.off, 3));
  bgeo.setAttribute('normal', new T3.BufferAttribute(BD.nor, 3));
  bgeo.setAttribute('aData', new T3.BufferAttribute(BD.dat, 4));
  bgeo.setAttribute('aA', new T3.BufferAttribute(BD.A, 3));
  bgeo.setAttribute('aB', new T3.BufferAttribute(BD.B, 3));
  bgeo.setAttribute('aPh', new T3.BufferAttribute(BD.ph, 2));
  obj.add(points(bgeo, mkMat(false, true, null)), points(bgeo, mkMat(true, true, null)));

  // invisible depth-only spheres: nodes hide whatever is behind them, so the structure reads as solid
  var occMat = new T3.MeshBasicMaterial({ colorWrite: false });
  nodes.forEach(function (n) {
    var m = new T3.Mesh(new T3.SphereGeometry(n.r * 0.96, 20, 14), occMat);
    m.position.set(n.c[0], n.c[1], n.c[2]);
    obj.add(m);
  });

  /* rising dust above the figure */
  var NB = small ? 2600 : 8700, emitters = [];
  while (emitters.length < 1500 * 3) {
    var ei = (Math.random() * S.n) | 0;
    if (S.dat[ei * 4] > 0.9) emitters.push(S.pos[ei * 3], S.pos[ei * 3 + 1], S.pos[ei * 3 + 2]);
  }
  var bpx = new Float32Array(NB), bpy = new Float32Array(NB), blife = new Float32Array(NB), bspan = new Float32Array(NB),
      brise = new Float32Array(NB), bamp = new Float32Array(NB), bseed = new Float32Array(NB),
      bpos = new Float32Array(NB * 3), bal = new Float32Array(NB), tmp = new T3.Vector3(), ppu = 500;
  var dgeo = new T3.BufferGeometry();
  dgeo.setAttribute('position', new T3.BufferAttribute(bpos, 3).setUsage(T3.DynamicDrawUsage));
  dgeo.setAttribute('aAlpha', new T3.BufferAttribute(bal, 1).setUsage(T3.DynamicDrawUsage));
  dgeo.setAttribute('aSeed', new T3.BufferAttribute(bseed, 1));
  var dust = points(dgeo, new T3.ShaderMaterial(additive({
    uniforms: { uPR: U.uPR, uGain: U.uGain, uTime: U.uTime, uCol: U.uCol, uGlow: { value: 0 } },
    vertexShader: BEAM_VERT, fragmentShader: FRAG, depthTest: false
  })));
  scene.add(dust);

  function spawn(k) {
    var tries = 0;
    do {
      var e = ((Math.random() * emitters.length / 3) | 0) * 3;
      tmp.set(emitters[e], emitters[e + 1], emitters[e + 2]).applyMatrix4(obj.matrixWorld);
    } while (tmp.y < 0.1 && ++tries < 14);          // prefer the upper part of the shape
    bpx[k] = tmp.x * ppu + (Math.random() - 0.5) * 8;
    bpy[k] = tmp.y * ppu;
    blife[k] = 0; bspan[k] = 7 + Math.random() * 9; brise[k] = 10 + Math.random() * 28; bamp[k] = 0.1 + Math.random() * 0.3;
  }
  function stepDust(dt, T) {
    for (var k = 0; k < NB; k++) {
      if ((blife[k] += dt / bspan[k]) >= 1) spawn(k);
      bpx[k] += Math.cos(flow(bpx[k] * 0.004, bpy[k] * 0.004, T * 0.25 + bseed[k] * 6)) * 18 * dt;
      bpy[k] += brise[k] * dt;
      bpos[k * 3] = bpx[k] / ppu; bpos[k * 3 + 1] = bpy[k] / ppu;
      bal[k] = Math.sin(Math.PI * blife[k]) * bamp[k];
    }
    dgeo.attributes.position.needsUpdate = true; dgeo.attributes.aAlpha.needsUpdate = true;
  }

  /* ───────────────────────── backdrop: graphite gradient + static grain + moving grain ───────────────────────── */
  (function () {
    var gc = document.createElement('canvas'); gc.width = gc.height = 160;
    var g = gc.getContext('2d'), im = g.createImageData(160, 160);
    for (var q = 0; q < im.data.length; q += 4) { var v = Math.random() * 255; im.data[q] = im.data[q + 1] = im.data[q + 2] = v; im.data[q + 3] = 255; }
    g.putImageData(im, 0, 0);
    grainEl.style.backgroundImage = 'url(' + gc.toDataURL() + ')';
  })();
  function drawBg(w, h, dpr) {
    bgc.width = Math.round(w * dpr); bgc.height = Math.round(h * dpr);
    var g = bgc.getContext('2d', { willReadFrequently: true }), lin = g.createLinearGradient(0, 0, 0, bgc.height);
    lin.addColorStop(0, '#202125'); lin.addColorStop(1, '#26272b');
    g.fillStyle = lin; g.fillRect(0, 0, bgc.width, bgc.height);
    var im = g.getImageData(0, 0, bgc.width, bgc.height), d = im.data;
    for (var q = 0; q < d.length; q += 4) { var nz = (Math.random() - 0.5) * 12; d[q] += nz; d[q + 1] += nz; d[q + 2] += nz; }
    g.putImageData(im, 0, 0);
  }

  /* ───────────────────────── camera ───────────────────────── */
  var lastW = 0, lastH = 0;
  function applySize(force) {
    var w = window.innerWidth, h = window.innerHeight;
    if (!force && lastW && w === lastW && Math.abs(h - lastH) < 280) return;     // mobile URL-bar jiggle: keep the layout
    lastW = w; lastH = h;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    [bgc, glc].forEach(function (c) { c.style.width = w + 'px'; c.style.height = h + 'px'; });
    renderer.setPixelRatio(dpr); renderer.setSize(w, h, false);
    drawBg(w, h, dpr);
    var L = layout(w, h); ppu = L.s * 1.05;                                      // px per model unit at the pivot
    var D = h / (2 * ppu * Math.tan(FOV * Math.PI / 360));                       // camera distance that gives that scale
    camera.fov = FOV; camera.aspect = w / h; camera.near = Math.max(0.05, D - 1.6); camera.far = D + 1.6;
    camera.position.set(0, 0, D);
    // lens shift puts the pivot at (cx, cy) without moving the camera off-axis; 0.0345 centres the pentagon's bounding box
    camera.setViewOffset(w, h, -(L.cx - w / 2), -((L.cy + 0.0345 * ppu) - h / 2), w, h);
    camera.updateProjectionMatrix();
    U.uPR.value = dpr; U.uCamD.value = D;
  }

  /* ───────────────────────── motion: scroll + drag turn the shape ───────────────────────── */
  var T = 0, last = performance.now(), cur = { yaw: 0, pitch: 0.2 };
  var dyaw = 0, dpitch = 0, vyaw = 0, vpitch = 0, dragging = false, queued = false;
  function progress() {
    var m = document.documentElement.scrollHeight - window.innerHeight;
    return m > 0 ? clamp(window.scrollY / m, 0, 1) : 0;
  }
  function target(p) { return { yaw: REST + p * TURNS * PI2, pitch: 0.2 + 0.32 * Math.sin(p * PI2 * 1.5) }; }

  function frame(now) {
    queued = false;
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!reduced) T += dt;
    var tg = target(progress());
    if (!reduced) { tg.yaw += 0.18 * Math.sin(T * 0.25); tg.pitch += 0.04 * Math.sin(T * 0.31); }   // idle sway
    var k = reduced ? 1 : 1 - Math.exp(-dt * 7);
    cur.yaw += (tg.yaw - cur.yaw) * k; cur.pitch += (tg.pitch - cur.pitch) * k;
    accent.lerp(accentTo, reduced ? 1 : 1 - Math.exp(-dt * 4));                                     // the sly brick changes colour
    if (!dragging && !reduced) {                                                                   // throw + settle after a drag
      dyaw += vyaw * dt; dpitch += vpitch * dt;
      var f = Math.exp(-dt * 2.5); vyaw *= f; vpitch *= f;
      dpitch *= Math.exp(-dt * 0.8);
    }
    obj.rotation.set(cur.pitch + dpitch, cur.yaw + dyaw, 0);
    obj.updateMatrixWorld(true);
    U.uTime.value = T;
    stepDust(reduced ? 0 : dt, T);
    if (!reduced) grainEl.style.backgroundPosition = ((Math.random() * 160) | 0) + 'px ' + ((Math.random() * 160) | 0) + 'px';
    renderer.render(scene, camera);
    if (!reduced) { queued = true; requestAnimationFrame(frame); }
  }
  function schedule() { if (reduced && !queued) { queued = true; requestAnimationFrame(frame); } }

  // drag (mouse / touch / pen) turns the shape directly
  var lx = 0, ly = 0, lt = 0;
  glc.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    dragging = true; lx = e.clientX; ly = e.clientY; lt = performance.now(); vyaw = vpitch = 0;
    glc.classList.add('drag');
    try { glc.setPointerCapture(e.pointerId); } catch (err) { }
  });
  glc.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    var now = performance.now(), dt = Math.max(1, now - lt) / 1000, ay = (e.clientX - lx) * 0.008, ap = (e.clientY - ly) * 0.006;
    lx = e.clientX; ly = e.clientY; lt = now;
    dyaw += ay; dpitch = clamp(dpitch + ap, -1.1, 1.1);
    vyaw = clamp(0.6 * vyaw + 0.4 * ay / dt, -12, 12); vpitch = clamp(0.6 * vpitch + 0.4 * ap / dt, -8, 8);
    schedule();
  });
  function endDrag() { if (!dragging) return; dragging = false; glc.classList.remove('drag'); }
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (n) { glc.addEventListener(n, endDrag); });

  window.addEventListener('scroll', schedule, { passive: true });
  var rto;
  window.addEventListener('resize', function () { clearTimeout(rto); rto = setTimeout(function () { applySize(false); schedule(); }, 120); });

  /* the one thing site.js may ask for */
  window.SlyScene = {
    setAccent: function (hex) { var c = hexVec(hex); accentTo.set(c[0], c[1], c[2]); schedule(); }
  };

  /* ───────────────────────── go ───────────────────────── */
  applySize(true);
  var t0 = target(progress()); cur.yaw = t0.yaw; cur.pitch = t0.pitch;     // reloads mid-scroll start at the right angle
  obj.rotation.set(cur.pitch, cur.yaw, 0); obj.updateMatrixWorld(true);
  for (var k0 = 0; k0 < NB; k0++) {                                        // pre-evolve the dust so the cloud exists on frame 1
    bseed[k0] = Math.random(); spawn(k0);
    blife[k0] = Math.random(); bpy[k0] += brise[k0] * bspan[k0] * blife[k0];
  }
  dgeo.attributes.aSeed.needsUpdate = true;
  for (var j0 = 0; j0 < 60; j0++) stepDust(0.15, j0 * 0.15);               // ~9 s of drift up front, so frame 1 is a haze, not columns
  queued = true; requestAnimationFrame(frame);
})();
