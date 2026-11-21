/* Slybrick scene: the three.js shape behind the site.

   Four forms, built from the same grammar (nodes, edges, rings):

     home     marigold  pentagonal bipyramid — the whole brick, every edge joined
     pentest  red       the breach: the ring opened, a spike driven through, the brick knocked out of line
     defense  blue      the shield: an outer crest, an inner layer, radial struts, a guard ring
     bughunt  yellow    the wall under the lens: a curved course of bricks, one loose, a lens floating over it

   The change between forms is DataNode Labs' 'flow' particle transition, which this site's design came
   from, ported from their CPU 2D loop to the vertex shader so it survives ~90k particles:

     mdur  = transition * 0.7
     delay = transition * 0.28 * (0.6 * order + 0.4 * jitter)
     e3    = smootherstep                        t*t*t*(t*(6t-15)+10)
     arc   = sin(PI * e3)
     bend  = (seed - 0.5) * 0.16 * arc           perpendicular to the travel
     drift = arc * (3 + 9 * seed) px             along a flow field
     lift  = arc * 4 px                          up
     alpha = (1 - 0.12 * arc)

   One change to theirs: the delay key is the TARGET particle's angle, not a random seed, so the new shape
   reforms in order — a sweep round the shape rather than a fizz.

   Scrolling turns the shape (TURNS full turns over the page). Dragging turns it too.
   site.js calls SlyScene.setForm('pentest' | 'defense' | 'bughunt' | 'home'). */
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
  var REST = 0.3;        // rest-pose yaw (rad)
  var TRANS = 1.6;       // DataNode's `transition`, shortened: a scroll can change lane every second
  var MDUR  = TRANS * 0.7;
  var DELAY = TRANS * 0.28;
  var PPU0  = 590;       // reference px-per-unit, so their pixel constants land in model units

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
  function smoother(t) { return t * t * t * (t * (t * 6 - 15) + 10); }

  /* ───────────────────────── layout ───────────────────────── */
  function colWidth(w) { return clamp(w * 0.44, 420, 600); }
  function stacked(w, h) { return w < 900 || w / h <= 0.9; }
  function layout(w, h) {
    if (stacked(w, h)) return { s: Math.min(w * 0.8, h * 0.45), cx: w * 0.5, cy: h * 0.32 };
    var pad = clamp(w * 0.036, 20, 52);
    var colLeft = w - pad - Math.min(colWidth(w), w - 2 * pad);
    var left = 30, aw = Math.max(200, colLeft - 36 - left);
    return { s: Math.min(h * 0.74, aw * 0.78), cx: left + aw / 2, cy: h * 0.5 };
  }
  var dens = DENSITY * clamp(Math.pow(layout(window.innerWidth, window.innerHeight).s * 1.05 / PPU0, 2), 0.35, 2.2);

  /* ═════════════════════════ the four forms ═════════════════════════
     Each builder returns { nodes, edges, rings }. A node is a small ball; an edge is a tube between
     two nodes; a ring is a thin torus. `accent` marks the parts that wear the lane colour — the sly
     brick and whatever that lane's story hangs on. Everything else is white. */

  function pent(R, z, rot) {
    var out = [];
    for (var i = 0; i < 5; i++) { var a = Math.PI / 2 + (rot || 0) + i * PI2 / 5; out.push([R * Math.cos(a), R * Math.sin(a), z || 0]); }
    return out;
  }
  function E(a, b, r, w, al) { return { a: a, b: b, r: r == null ? 0.0048 : r, w: w == null ? 1.7 : w, al: al == null ? 0.9 : al }; }
  function AC(e) { e.ac = true; return e; }      // this edge wears the lane colour, not white

  /* home — the whole brick: pentagon, its star, both apexes, every one of the 21 edges */
  function buildHome() {
    var ring = pent(RING, 0), apexF = [0, 0, APEX], apexB = [0, 0, -APEX], core = [0, 0, 0];
    var nodes = [], edges = [], i;
    ring.forEach(function (p) { nodes.push({ c: p, r: 0.06 }); });
    nodes.push({ c: apexF, r: 0.046 }, { c: apexB, r: 0.046 }, { c: core, r: 0.052, accent: true });
    for (i = 0; i < 5; i++) {
      edges.push(E(ring[i], ring[(i + 1) % 5], 0.0065, 2.2, 0.95));
      edges.push(E(ring[i], ring[(i + 2) % 5]));
      edges.push(E(ring[i], apexF));
      edges.push(E(ring[i], apexB));
    }
    edges.push(E(apexF, apexB));
    return { nodes: nodes, edges: edges, rings: [{ c: core, ax: [0, 0, 1], R: 0.1, r: 0.003, accent: true }] };
  }

  /* pentest — the breach. One vertex is forced out of the wall, the edge beside it is gone, a spike is
     driven through the gap to the core, and the core itself is off its seat. */
  function buildPentest() {
    var ring = pent(RING, 0), i;
    ring[0] = [ring[0][0] * 1.46, ring[0][1] * 1.46, 0.17];          // the forced vertex
    var apexF = [0, 0, 0.30], apexB = [0, 0, -0.30];
    var core = [0.11, 0.07, 0.03];                                   // knocked out of line
    var tip  = [0.18, 0.44, 0.25];                                   // the point of entry, just outside the shape
    var nodes = [], edges = [];
    ring.forEach(function (p, k) { nodes.push({ c: p, r: k === 0 ? 0.05 : 0.058 }); });
    nodes.push({ c: apexF, r: 0.042 }, { c: apexB, r: 0.042 });
    nodes.push({ c: core, r: 0.052, accent: true });
    nodes.push({ c: tip, r: 0.036, accent: true });
    for (i = 0; i < 5; i++) {
      if (i !== 0 && i !== 4) edges.push(E(ring[i], ring[(i + 1) % 5], 0.0065, 2.2, 0.95));   // 0-1 and 4-0 are the gap
      edges.push(E(ring[i], ring[(i + 2) % 5], 0.0042, 1.4, 0.7));
      if (i !== 0) { edges.push(E(ring[i], apexF)); edges.push(E(ring[i], apexB)); }
    }
    edges.push(E(apexF, apexB, 0.0042, 1.4, 0.6));
    edges.push(AC(E(tip, core, 0.0082, 2.8, 1)));                    // the spike, all the way in
    edges.push(AC(E(tip, ring[0], 0.0052, 1.8, 0.9)));               // and the vertex it forced
    edges.push(E(tip, ring[1], 0.0038, 1.2, 0.6));
    edges.push(E(tip, ring[4], 0.0038, 1.2, 0.6));
    edges.push(AC(E(core, [0, 0, 0], 0.0032, 1.1, 0.5)));            // the seat it came out of
    return {
      nodes: nodes, edges: edges,
      rings: [
        { c: core, ax: norm3([tip[0] - core[0], tip[1] - core[1], tip[2] - core[2]]), R: 0.1, r: 0.003, accent: true },
        { c: tip,  ax: norm3([tip[0] - core[0], tip[1] - core[1], tip[2] - core[2]]), R: 0.07, r: 0.0025, accent: true }
      ]
    };
  }

  /* defense — the shield. A point-down crest, a raised inner layer, struts between the layers, the core
     behind both, and a guard ring round the whole thing. Depth in depth. */
  function buildDefense() {
    var OUT = pent(0.40, 0, Math.PI),                                // point-down: a shield crest
        IN  = pent(0.21, 0.13, Math.PI + Math.PI / 5),               // inner layer, raised toward the viewer
        core = [0, 0, -0.04];
    var nodes = [], edges = [], i;
    OUT.forEach(function (p) { nodes.push({ c: p, r: 0.054 }); });
    IN.forEach(function (p) { nodes.push({ c: p, r: 0.04 }); });
    nodes.push({ c: core, r: 0.052, accent: true });
    for (i = 0; i < 5; i++) {
      edges.push(AC(E(OUT[i], OUT[(i + 1) % 5], 0.0068, 2.3, 1)));   // the crest
      edges.push(AC(E(IN[i], IN[(i + 1) % 5], 0.0055, 2.0, 0.95)));  // the inner layer
      edges.push(E(OUT[i], IN[i], 0.0048, 1.7, 0.85));               // struts, both ways
      edges.push(E(OUT[i], IN[(i + 4) % 5], 0.0042, 1.4, 0.75));
      edges.push(E(IN[i], core, 0.004, 1.3, 0.7));                   // everything reports to the core
    }
    return {
      nodes: nodes, edges: edges,
      rings: [
        { c: [0, 0, 0], ax: [0, 0, 1], R: 0.455, r: 0.0035, accent: true },     // the guard ring
        { c: [0, 0, 0.13], ax: [0, 0, 1], R: 0.30, r: 0.0022, accent: true },   // the inner perimeter
        { c: core, ax: [0, 0, 1], R: 0.1, r: 0.003, accent: true }
      ]
    };
  }

  /* bughunt — the wall under the lens. A curved course of bricks, one of them loose and pushed out,
     and a lens floating in front of it on a handle. The thing the whole company is named after. */
  function buildBughunt() {
    var nodes = [], edges = [], grid = [], r, c;
    var COLS = 4, ROWS = 3, SX = 0.235, SY = 0.20;
    for (r = 0; r < ROWS; r++) {
      var row = [], off = (r % 2 ? SX / 2 : 0);
      for (c = 0; c < COLS; c++) {
        var x = -((COLS - 1) * SX) / 2 + c * SX + off * 0.5;
        var y = ((ROWS - 1) * SY) / 2 - r * SY;
        row.push([x, y, -0.85 * x * x - 0.25 * y * y]);              // a shallow barrel, so the wall has depth
      }
      grid.push(row);
    }
    var loose = grid[1][2];
    loose = [loose[0] + 0.05, loose[1] - 0.02, loose[2] + 0.23];     // the one brick that behaves differently
    grid[1][2] = loose;
    for (r = 0; r < ROWS; r++) for (c = 0; c < COLS; c++) {
      var isLoose = (r === 1 && c === 2);
      nodes.push({ c: grid[r][c], r: isLoose ? 0.055 : 0.042, accent: isLoose });
      if (c + 1 < COLS) edges.push(E(grid[r][c], grid[r][c + 1], isLoose || (r === 1 && c === 1) ? 0.0038 : 0.0058, 2, 0.9));
      if (r + 1 < ROWS) edges.push(E(grid[r][c], grid[r + 1][c], 0.0038, 1.2, 0.6));   // mortar, the quiet direction
    }
    var LC = [loose[0], loose[1], loose[2] + 0.15], LAX = norm3([0.16, 0.2, 1]);
    var e2 = perp(LAX), LR = 0.205;
    var grip = [LC[0] + LR * 1.5 * (0.70 * e2[0][0] - 0.70 * e2[1][0]),
                LC[1] + LR * 1.5 * (0.70 * e2[0][1] - 0.70 * e2[1][1]),
                LC[2] + LR * 1.5 * (0.70 * e2[0][2] - 0.70 * e2[1][2]) - 0.05];
    var rim  = [LC[0] + LR * (0.70 * e2[0][0] - 0.70 * e2[1][0]),
                LC[1] + LR * (0.70 * e2[0][1] - 0.70 * e2[1][1]),
                LC[2] + LR * (0.70 * e2[0][2] - 0.70 * e2[1][2])];
    nodes.push({ c: grip, r: 0.03, accent: true });
    edges.push(AC(E(rim, grip, 0.0068, 2.4, 1)));                     // the handle
    edges.push(AC(E(LC, loose, 0.0032, 1.1, 0.55)));                  // the lens looks at the loose brick
    return {
      nodes: nodes, edges: edges,
      rings: [
        { c: LC, ax: LAX, R: LR, r: 0.0062, accent: true },           // the lens
        { c: LC, ax: LAX, R: LR * 0.86, r: 0.002, accent: true },
        { c: loose, ax: LAX, R: 0.095, r: 0.003, accent: true }
      ]
    };
  }

  var FORMS = {
    home:    { build: buildHome,    tint: '#ffb627' },
    pentest: { build: buildPentest, tint: '#ff4d4f' },
    defense: { build: buildDefense, tint: '#5b9bff' },
    bughunt: { build: buildBughunt, tint: '#ffb627' }
  };
  var ORDER = ['home', 'pentest', 'defense', 'bughunt'];

  /* ─────────── grammar → particle parts (surface share = area x weight) ─────────── */
  var FILL = 0.5, LINE = 2.4;
  function sphereP(c, r, alb, w) { return { k: 0, c: c, r: r, alb: alb, mat: 0, share: 4 * Math.PI * r * r * w * FILL }; }
  function tubeP(a, b, r, alb, w) {
    var d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(d[0], d[1], d[2]) || 1e-5;
    return { k: 1, a: a, d: d, e: perp(norm3(d)), r: r, alb: alb, mat: 4, share: PI2 * r * L * w * LINE };
  }
  function ringP(c, axis, R0, r, alb, w) {
    var ax = norm3(axis);
    return { k: 2, c: c, ax: ax, e: perp(ax), R: R0, r: r, alb: alb, mat: 4, share: 4 * Math.PI * Math.PI * R0 * r * w * LINE };
  }
  function partsOf(F) {
    var G = [[], []];
    F.nodes.forEach(function (n) {
      var g = n.accent ? 1 : 0;
      G[g].push(sphereP(n.c, n.r, 0.95, 3.2));
      G[g].push(ringP(n.c, [0.25, 1, 0.15], n.r * 1.01, Math.max(0.0018, n.r * 0.03), 1, 3));   // seam round each node
    });
    (F.rings || []).forEach(function (R0) { G[R0.accent ? 1 : 0].push(ringP(R0.c, R0.ax, R0.R, R0.r, 1, 3)); });
    F.edges.forEach(function (e) { G[e.ac ? 1 : 0].push(tubeP(e.a, e.b, e.r, e.al, e.w)); });
    return G;
  }
  function share(list) { var s = 0; list.forEach(function (p) { s += p.share; }); return s; }

  /* sample exactly N particles out of a parts list. dat = [albedo, material, seed, order].
     order is the particle's angle round the view axis, normalised — the key the reform sweeps on. */
  function sampleParts(list, N) {
    var sum = share(list) || 1, pos = new Float32Array(N * 3), nor = new Float32Array(N * 3), dat = new Float32Array(N * 4);
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
        dat[k * 4 + 3] = (Math.atan2(P[1], P[0]) + Math.PI) / PI2;              // order: a sweep round the shape
      }
    });
    while (k < N) { dat[k * 4 + 2] = Math.random(); k++; }                      // rounding slack, invisible (albedo 0)
    return { pos: pos, nor: nor, dat: dat, n: N };
  }

  /* beads: two travelling balls per edge slot. Every form fills the same MAXE slots, cycling its own
     edges if it has fewer, so the bead buffers never change length. */
  var MAXE = 0;
  ORDER.forEach(function (nm) { MAXE = Math.max(MAXE, FORMS[nm].build().edges.length); });
  var BEAD_PER = 2, BEAD_M = small ? 70 : 140, NBEAD = MAXE * BEAD_PER * BEAD_M, BR = 0.012;

  function beadEnds(F) {
    var A = new Float32Array(NBEAD * 3), B = new Float32Array(NBEAD * 3), k = 0;
    for (var s = 0; s < MAXE; s++) {
      var e = F.edges[s % F.edges.length];
      for (var b = 0; b < BEAD_PER; b++) for (var m = 0; m < BEAD_M; m++, k++) {
        A[k * 3] = e.a[0]; A[k * 3 + 1] = e.a[1]; A[k * 3 + 2] = e.a[2];
        B[k * 3] = e.b[0]; B[k * 3 + 1] = e.b[1]; B[k * 3 + 2] = e.b[2];
      }
    }
    return { A: A, B: B };
  }
  function beadStatic() {
    var off = new Float32Array(NBEAD * 3), nor = new Float32Array(NBEAD * 3), dat = new Float32Array(NBEAD * 4), ph = new Float32Array(NBEAD * 2), k = 0;
    for (var s = 0; s < MAXE; s++) for (var b = 0; b < BEAD_PER; b++) {
      var phase = (b / BEAD_PER + (s % 7) * 0.09 + Math.random() * 0.04) % 1;
      var speed = (0.08 + 0.07 * Math.random()) * (Math.random() < 0.5 ? 1 : -1);
      for (var m = 0; m < BEAD_M; m++, k++) {
        var u = unit();
        off[k * 3] = u[0] * BR; off[k * 3 + 1] = u[1] * BR; off[k * 3 + 2] = u[2] * BR;
        nor[k * 3] = u[0]; nor[k * 3 + 1] = u[1]; nor[k * 3 + 2] = u[2];
        ph[k * 2] = phase; ph[k * 2 + 1] = speed;
        dat[k * 4] = 1; dat[k * 4 + 1] = 0; dat[k * 4 + 2] = Math.random();
        dat[k * 4 + 3] = s / MAXE;                                              // order: slot by slot round the shape
      }
    }
    return { off: off, nor: nor, dat: dat, ph: ph };
  }

  /* build every form once, at the same particle counts */
  var BUILT = {}, N0, N1;
  (function () {
    var built = {}, s0 = 0, s1 = 0;
    ORDER.forEach(function (nm) {
      var F = FORMS[nm].build(), G = partsOf(F);
      built[nm] = { F: F, G: G };
      s0 = Math.max(s0, share(G[0])); s1 = Math.max(s1, share(G[1]));   // the busiest form sets the count
    });
    N0 = Math.max(1, Math.round(s0 * dens));
    N1 = Math.max(1, Math.round(s1 * dens));
    ORDER.forEach(function (nm) {
      var F = built[nm].F, G = built[nm].G;
      BUILT[nm] = {
        g0: sampleParts(G[0], N0),
        g1: sampleParts(G[1], N1),
        bead: beadEnds(F),
        nodes: F.nodes,
        tint: hexVec(FORMS[nm].tint)
      };
    });
  })();
  var MAXN = 0;
  ORDER.forEach(function (nm) { MAXN = Math.max(MAXN, BUILT[nm].nodes.length); });

  /* ───────────────────────── shaders ─────────────────────────
     Lighting: Lambert + rim + facing fade + hatch bands, light fixed to the camera.
     Morph: DataNode's 'flow' transition, per particle, in the vertex stage. */
  var MORPH_GLSL = `
    uniform float uMT; uniform float uMDur; uniform float uDelay; uniform float uTime;
    float sm5(float t) { return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }
    float flowAngle(float x, float y, float t) {
      return (sin(x * 1.7 + t) + sin(y * 1.3 - t * 0.8) + sin((x + y) * 0.9 + t * 0.5)) * 1.6;
    }
    float morphT(float order, float jitter) {
      float del = uDelay * (0.6 * order + 0.4 * jitter);
      return sm5(clamp((uMT - del) / uMDur, 0.0, 1.0));
    }`;

  var VERT = `
    attribute vec4 aData;                        // albedo, material (0 sphere, 4 tube/ring), seed, order
    attribute vec3 aTo; attribute vec3 aNTo; attribute vec4 aDTo;
    #ifdef BEAD
    attribute vec3 aA; attribute vec3 aB; attribute vec3 aA2; attribute vec3 aB2; attribute vec2 aPh;
    #endif
    uniform float uPR; uniform float uGlow; uniform float uGain; uniform float uCamD; uniform vec3 uLight;
    ${MORPH_GLSL}
    varying float vA;
    float sm(float x) { x = clamp(x, 0.0, 1.0); return x * x * (3.0 - 2.0 * x); }
    void main() {
      float e3 = morphT(aDTo.w, aData.z);
      float arc = sin(3.14159265 * e3);
      float alb = mix(aData.x, aDTo.x, e3);
      float mat = e3 < 0.5 ? aData.y : aDTo.y;
      float seed = aData.z;
      vec3 nrm = normalize(mix(normal, aNTo, e3) + 1e-6);
      float env = 1.0 - 0.12 * arc;
      vec3 P;
    #ifdef BEAD
      vec3 eA = mix(aA, aA2, morphT(aData.w, aData.z));
      vec3 eB = mix(aB, aB2, morphT(aData.w, aData.z));
      float t = fract(aPh.x + uTime * aPh.y);
      P = mix(eA, eB, mix(0.12, 0.88, t)) + position;
      env *= sin(3.14159265 * t) * smoothstep(0.0, 0.05, length(eB - eA));
    #else
      vec3 Pf = position, Pt = aTo, d = Pt - Pf;
      float bend = (seed - 0.5) * 0.16 * arc;
      float fa = flowAngle(Pf.x * 2.4, Pf.y * 2.4, uTime * 0.2);
      float drift = arc * (0.0051 + 0.0153 * seed);                 // their 3..12 px at 590 px per unit
      P = mix(Pf, Pt, e3) + vec3(-d.y, d.x, 0.0) * bend
        + vec3(cos(fa), sin(fa), 0.0) * drift - vec3(0.0, arc * 0.0068, 0.0);
    #endif
      vec4 mv = modelViewMatrix * vec4(P, 1.0);
      vec3 nV = normalize(normalMatrix * nrm);
      float face = dot(nV, normalize(-mv.xyz));
      float lam = dot(nV, uLight);
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
      b *= mix(0.55, 1.0, clamp((uCamD + mv.z) / 0.8 + 0.5, 0.0, 1.0));
      b *= env;
      float a = min(1.0, pow(max(b, 0.0), 1.25) * 1.25) * uGain;
      vA = a;
      gl_Position = projectionMatrix * mv;
      float sz = seed < 0.1 ? 1.1 : 0.85;
      gl_PointSize = max(1.0, sz * uPR);
      if (uGlow > 0.5) {
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

  var cur = 'home', c0 = BUILT.home.tint;
  var tint = new T3.Vector3(1, 1, 1), tintTo = new T3.Vector3(1, 1, 1);               // the white mass, lightly laned
  var accent = new T3.Vector3(c0[0], c0[1], c0[2]), accentTo = accent.clone();        // the sly brick, full lane colour
  var dustCol = new T3.Vector3(1, 1, 1), dustTo = new T3.Vector3(1, 1, 1);
  function laneTargets(hex) {
    var c = hexVec(hex);
    tintTo.set(1 + (c[0] - 1) * 0.7, 1 + (c[1] - 1) * 0.7, 1 + (c[2] - 1) * 0.7);
    accentTo.set(c[0], c[1], c[2]);
    dustTo.set(1 + (c[0] - 1) * 0.3, 1 + (c[1] - 1) * 0.3, 1 + (c[2] - 1) * 0.3);
  }

  var U = {
    uPR: { value: 1 }, uGain: { value: 1.9 }, uCamD: { value: 3 }, uTime: { value: 0 },
    uMT: { value: 999 }, uMDur: { value: MDUR }, uDelay: { value: DELAY },
    uLight: { value: new T3.Vector3(-0.45, 0.65, 0.62).normalize() },
    uCol: { value: new T3.Vector3(1, 1, 1) }
  };
  function additive(o) {
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

  /* a morphing group: `position/normal/aData` is where it comes from, `aTo/aNTo/aDTo` where it goes.
     At rest the morph is complete, so both sides read the same form. */
  function group(src, col) {
    var g = {
      pos: src.pos.slice(), nor: src.nor.slice(), dat: src.dat.slice(),
      to: src.pos.slice(), nto: src.nor.slice(), dto: src.dat.slice(),
      n: src.n, geo: new T3.BufferGeometry()
    };
    g.geo.setAttribute('position', new T3.BufferAttribute(g.pos, 3).setUsage(T3.DynamicDrawUsage));
    g.geo.setAttribute('normal', new T3.BufferAttribute(g.nor, 3).setUsage(T3.DynamicDrawUsage));
    g.geo.setAttribute('aData', new T3.BufferAttribute(g.dat, 4).setUsage(T3.DynamicDrawUsage));
    g.geo.setAttribute('aTo', new T3.BufferAttribute(g.to, 3).setUsage(T3.DynamicDrawUsage));
    g.geo.setAttribute('aNTo', new T3.BufferAttribute(g.nto, 3).setUsage(T3.DynamicDrawUsage));
    g.geo.setAttribute('aDTo', new T3.BufferAttribute(g.dto, 4).setUsage(T3.DynamicDrawUsage));
    obj.add(points(g.geo, mkMat(false, false, col)), points(g.geo, mkMat(true, false, col)));
    return g;
  }
  var GW = group(BUILT.home.g0, tint);        // the white mass
  var GA = group(BUILT.home.g1, accent);      // the sly brick and whatever the lane hangs on

  var BS = beadStatic(), BG = {
    A: BUILT.home.bead.A.slice(), B: BUILT.home.bead.B.slice(),
    A2: BUILT.home.bead.A.slice(), B2: BUILT.home.bead.B.slice(), geo: new T3.BufferGeometry()
  };
  BG.geo.setAttribute('position', new T3.BufferAttribute(BS.off, 3));
  BG.geo.setAttribute('normal', new T3.BufferAttribute(BS.nor, 3));
  BG.geo.setAttribute('aData', new T3.BufferAttribute(BS.dat, 4));
  BG.geo.setAttribute('aPh', new T3.BufferAttribute(BS.ph, 2));
  BG.geo.setAttribute('aA', new T3.BufferAttribute(BG.A, 3).setUsage(T3.DynamicDrawUsage));
  BG.geo.setAttribute('aB', new T3.BufferAttribute(BG.B, 3).setUsage(T3.DynamicDrawUsage));
  BG.geo.setAttribute('aA2', new T3.BufferAttribute(BG.A2, 3).setUsage(T3.DynamicDrawUsage));
  BG.geo.setAttribute('aB2', new T3.BufferAttribute(BG.B2, 3).setUsage(T3.DynamicDrawUsage));
  // beads carry no aTo of their own; the attributes exist so one shader serves both kinds
  BG.geo.setAttribute('aTo', new T3.BufferAttribute(BS.off, 3));
  BG.geo.setAttribute('aNTo', new T3.BufferAttribute(BS.nor, 3));
  BG.geo.setAttribute('aDTo', new T3.BufferAttribute(BS.dat, 4));
  obj.add(points(BG.geo, mkMat(false, true, tint)), points(BG.geo, mkMat(true, true, tint)));

  /* depth-only spheres at the nodes: the structure reads as solid rather than as a cloud */
  var occMat = new T3.MeshBasicMaterial({ colorWrite: false }), occ = [];
  for (var oi = 0; oi < MAXN; oi++) {
    var om = new T3.Mesh(new T3.SphereGeometry(1, 16, 12), occMat);
    om.visible = false; obj.add(om); occ.push(om);
  }
  function nodeAt(form, i) { var ns = BUILT[form].nodes; return ns[i % ns.length]; }
  var occCur = [];                                   // what the occluders are drawing right now
  for (var oq = 0; oq < MAXN; oq++) { var nq = nodeAt('home', oq); occCur.push({ c: nq.c.slice(), r: nq.r }); }
  function placeOcc(e, bake) {
    for (var i = 0; i < MAXN; i++) {
      var a = occCur[i], b = nodeAt(nextForm || cur, i);
      var x = a.c[0] + (b.c[0] - a.c[0]) * e, y = a.c[1] + (b.c[1] - a.c[1]) * e, z = a.c[2] + (b.c[2] - a.c[2]) * e;
      var r = a.r + (b.r - a.r) * e;
      if (bake) { a.c[0] = x; a.c[1] = y; a.c[2] = z; a.r = r; }
      occ[i].position.set(x, y, z);
      occ[i].scale.setScalar(r * 0.96);
      occ[i].visible = r > 0.004;
    }
  }

  /* rising dust above the figure */
  var NB = small ? 2600 : 8700, emitters = [];
  function reseedEmitters(arr, dat, n) {
    emitters.length = 0;
    var guard = 0;
    while (emitters.length < 1500 * 3 && guard++ < 400000) {
      var ei = (Math.random() * n) | 0;
      if (dat[ei * 4] > 0.9) emitters.push(arr[ei * 3], arr[ei * 3 + 1], arr[ei * 3 + 2]);
    }
    if (!emitters.length) emitters.push(0, 0, 0);
  }
  reseedEmitters(BUILT.home.g0.pos, BUILT.home.g0.dat, N0);

  var bpx = new Float32Array(NB), bpy = new Float32Array(NB), blife = new Float32Array(NB), bspan = new Float32Array(NB),
      brise = new Float32Array(NB), bamp = new Float32Array(NB), bseed = new Float32Array(NB),
      bpos = new Float32Array(NB * 3), bal = new Float32Array(NB), tmp = new T3.Vector3(), ppu = PPU0;
  var dgeo = new T3.BufferGeometry();
  dgeo.setAttribute('position', new T3.BufferAttribute(bpos, 3).setUsage(T3.DynamicDrawUsage));
  dgeo.setAttribute('aAlpha', new T3.BufferAttribute(bal, 1).setUsage(T3.DynamicDrawUsage));
  dgeo.setAttribute('aSeed', new T3.BufferAttribute(bseed, 1));
  var dust = points(dgeo, new T3.ShaderMaterial(additive({
    uniforms: { uPR: U.uPR, uGain: U.uGain, uTime: U.uTime, uCol: { value: dustCol }, uGlow: { value: 0 } },
    vertexShader: BEAM_VERT, fragmentShader: FRAG, depthTest: false
  })));
  scene.add(dust);

  function spawn(k) {
    var tries = 0;
    do {
      var e = ((Math.random() * emitters.length / 3) | 0) * 3;
      tmp.set(emitters[e], emitters[e + 1], emitters[e + 2]).applyMatrix4(obj.matrixWorld);
    } while (tmp.y < 0.1 && ++tries < 14);
    bpx[k] = tmp.x * ppu + (Math.random() - 0.5) * 8;
    bpy[k] = tmp.y * ppu;
    blife[k] = 0; bspan[k] = 7 + Math.random() * 9; brise[k] = 10 + Math.random() * 28; bamp[k] = 0.1 + Math.random() * 0.3;
  }
  function stepDust(dt, T0) {
    for (var k = 0; k < NB; k++) {
      if ((blife[k] += dt / bspan[k]) >= 1) spawn(k);
      bpx[k] += Math.cos(flow(bpx[k] * 0.004, bpy[k] * 0.004, T0 * 0.25 + bseed[k] * 6)) * 18 * dt;
      bpy[k] += brise[k] * dt;
      bpos[k * 3] = bpx[k] / ppu; bpos[k * 3 + 1] = bpy[k] / ppu;
      bal[k] = Math.sin(Math.PI * blife[k]) * bamp[k];
    }
    dgeo.attributes.position.needsUpdate = true; dgeo.attributes.aAlpha.needsUpdate = true;
  }

  /* ───────────────────────── backdrop ───────────────────────── */
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
    if (!force && lastW && w === lastW && Math.abs(h - lastH) < 280) return;
    lastW = w; lastH = h;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    [bgc, glc].forEach(function (c) { c.style.width = w + 'px'; c.style.height = h + 'px'; });
    renderer.setPixelRatio(dpr); renderer.setSize(w, h, false);
    drawBg(w, h, dpr);
    var L = layout(w, h); ppu = L.s * 1.05;
    var D = h / (2 * ppu * Math.tan(FOV * Math.PI / 360));
    camera.fov = FOV; camera.aspect = w / h; camera.near = Math.max(0.05, D - 1.9); camera.far = D + 1.9;
    camera.position.set(0, 0, D);
    camera.setViewOffset(w, h, -(L.cx - w / 2), -((L.cy + 0.0345 * ppu) - h / 2), w, h);
    camera.updateProjectionMatrix();
    U.uPR.value = dpr; U.uCamD.value = D;
  }

  /* ═════════════════════════ the morph ═════════════════════════ */
  var nextForm = null, mt = 999;

  /* bake the in-flight morph into the `from` side, so a lane change mid-flight starts from what is on
     screen rather than snapping. Same maths as the vertex stage. */
  function bakeGroup(g, T0) {
    var n = g.n, i;
    for (i = 0; i < n; i++) {
      var del = DELAY * (0.6 * g.dto[i * 4 + 3] + 0.4 * g.dat[i * 4 + 2]);
      var lt = clamp((mt - del) / MDUR, 0, 1), e3 = smoother(lt), arc = Math.sin(Math.PI * e3), seed = g.dat[i * 4 + 2];
      var fx = g.pos[i * 3], fy = g.pos[i * 3 + 1], fz = g.pos[i * 3 + 2];
      var dx = g.to[i * 3] - fx, dy = g.to[i * 3 + 1] - fy, dz = g.to[i * 3 + 2] - fz;
      var bend = (seed - 0.5) * 0.16 * arc;
      var fa = flow(fx * 2.4, fy * 2.4, T0 * 0.2), drift = arc * (0.0051 + 0.0153 * seed);
      g.pos[i * 3]     = fx + dx * e3 - dy * bend + Math.cos(fa) * drift;
      g.pos[i * 3 + 1] = fy + dy * e3 + dx * bend + Math.sin(fa) * drift - arc * 0.0068;
      g.pos[i * 3 + 2] = fz + dz * e3;
      var nx = g.nor[i * 3] + (g.nto[i * 3] - g.nor[i * 3]) * e3,
          ny = g.nor[i * 3 + 1] + (g.nto[i * 3 + 1] - g.nor[i * 3 + 1]) * e3,
          nz = g.nor[i * 3 + 2] + (g.nto[i * 3 + 2] - g.nor[i * 3 + 2]) * e3,
          nl = Math.hypot(nx, ny, nz) || 1;
      g.nor[i * 3] = nx / nl; g.nor[i * 3 + 1] = ny / nl; g.nor[i * 3 + 2] = nz / nl;
      g.dat[i * 4] = g.dat[i * 4] + (g.dto[i * 4] - g.dat[i * 4]) * e3;
      g.dat[i * 4 + 1] = e3 < 0.5 ? g.dat[i * 4 + 1] : g.dto[i * 4 + 1];
    }
    g.geo.attributes.position.needsUpdate = true;
    g.geo.attributes.normal.needsUpdate = true;
    g.geo.attributes.aData.needsUpdate = true;
  }
  function bakeBeads() {
    var i, n = NBEAD;
    for (i = 0; i < n; i++) {
      var del = DELAY * (0.6 * BS.dat[i * 4 + 3] + 0.4 * BS.dat[i * 4 + 2]);
      var e3 = smoother(clamp((mt - del) / MDUR, 0, 1));
      BG.A[i * 3] += (BG.A2[i * 3] - BG.A[i * 3]) * e3; BG.A[i * 3 + 1] += (BG.A2[i * 3 + 1] - BG.A[i * 3 + 1]) * e3; BG.A[i * 3 + 2] += (BG.A2[i * 3 + 2] - BG.A[i * 3 + 2]) * e3;
      BG.B[i * 3] += (BG.B2[i * 3] - BG.B[i * 3]) * e3; BG.B[i * 3 + 1] += (BG.B2[i * 3 + 1] - BG.B[i * 3 + 1]) * e3; BG.B[i * 3 + 2] += (BG.B2[i * 3 + 2] - BG.B[i * 3 + 2]) * e3;
    }
    BG.geo.attributes.aA.needsUpdate = true; BG.geo.attributes.aB.needsUpdate = true;
  }
  function setTo(g, src) {
    g.to.set(src.pos); g.nto.set(src.nor); g.dto.set(src.dat);
    g.geo.attributes.aTo.needsUpdate = true; g.geo.attributes.aNTo.needsUpdate = true; g.geo.attributes.aDTo.needsUpdate = true;
  }

  function setForm(name, T0) {
    if (!BUILT[name]) return;
    var from = nextForm || cur;
    if (name === from && mt >= TRANS) return;
    if (name === from) return;
    if (mt < TRANS) {                                      // interrupting: start from what is on screen
      bakeGroup(GW, T0); bakeGroup(GA, T0); bakeBeads();
      placeOcc(smoother(clamp(mt / TRANS, 0, 1)), true);
    }
    cur = from;
    nextForm = name;
    setTo(GW, BUILT[name].g0); setTo(GA, BUILT[name].g1);
    BG.A2.set(BUILT[name].bead.A); BG.B2.set(BUILT[name].bead.B);
    BG.geo.attributes.aA2.needsUpdate = true; BG.geo.attributes.aB2.needsUpdate = true;
    mt = 0;
    laneTargets(FORMS[name].tint);
    reseedEmitters(BUILT[name].g0.pos, BUILT[name].g0.dat, N0);
    if (reduced) { mt = TRANS + 1; settle(); }
    schedule();
  }
  function settle() {
    if (!nextForm) return;
    GW.pos.set(GW.to); GW.nor.set(GW.nto); GW.dat.set(GW.dto);
    GA.pos.set(GA.to); GA.nor.set(GA.nto); GA.dat.set(GA.dto);
    BG.A.set(BG.A2); BG.B.set(BG.B2);
    ['position', 'normal', 'aData'].forEach(function (k) { GW.geo.attributes[k].needsUpdate = true; GA.geo.attributes[k].needsUpdate = true; });
    BG.geo.attributes.aA.needsUpdate = true; BG.geo.attributes.aB.needsUpdate = true;
    placeOcc(1, true);
    cur = nextForm; nextForm = null;
    U.uMT.value = 999; mt = 999;
  }

  /* ───────────────────────── motion ───────────────────────── */
  var T = 0, last = performance.now(), pose = { yaw: 0, pitch: 0.2 };
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
    if (nextForm) {
      mt += reduced ? TRANS + 1 : dt;
      U.uMT.value = mt;
      placeOcc(smoother(clamp(mt / TRANS, 0, 1)));
      if (mt >= TRANS) settle();
    }
    var tg = target(progress());
    if (!reduced) { tg.yaw += 0.18 * Math.sin(T * 0.25); tg.pitch += 0.04 * Math.sin(T * 0.31); }
    var k = reduced ? 1 : 1 - Math.exp(-dt * 7);
    pose.yaw += (tg.yaw - pose.yaw) * k; pose.pitch += (tg.pitch - pose.pitch) * k;
    var ck = reduced ? 1 : 1 - Math.exp(-dt * 3.2);
    tint.lerp(tintTo, ck); accent.lerp(accentTo, ck); dustCol.lerp(dustTo, ck);
    if (!dragging && !reduced) {
      dyaw += vyaw * dt; dpitch += vpitch * dt;
      var f = Math.exp(-dt * 2.5); vyaw *= f; vpitch *= f;
      dpitch *= Math.exp(-dt * 0.8);
    }
    obj.rotation.set(pose.pitch + dpitch, pose.yaw + dyaw, 0);
    obj.updateMatrixWorld(true);
    U.uTime.value = T;
    stepDust(reduced ? 0 : dt, T);
    if (!reduced) grainEl.style.backgroundPosition = ((Math.random() * 160) | 0) + 'px ' + ((Math.random() * 160) | 0) + 'px';
    renderer.render(scene, camera);
    if (!reduced) { queued = true; requestAnimationFrame(frame); }
  }
  function schedule() { if (reduced && !queued) { queued = true; requestAnimationFrame(frame); } }

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

  /* what site.js may ask for */
  window.SlyScene = {
    setForm: function (name) { setForm(name, T); },
    setAccent: function (hex) { laneTargets(hex); schedule(); },     // kept: any caller that only wants a colour
    forms: ORDER.slice(),
    color: function (name) { return (FORMS[name] || FORMS.home).tint; }
  };

  /* ───────────────────────── go ───────────────────────── */
  applySize(true);
  laneTargets(FORMS.home.tint);
  tint.copy(tintTo); accent.copy(accentTo); dustCol.copy(dustTo);
  var t0 = target(progress()); pose.yaw = t0.yaw; pose.pitch = t0.pitch;
  obj.rotation.set(pose.pitch, pose.yaw, 0); obj.updateMatrixWorld(true);
  placeOcc(0);
  for (var k0 = 0; k0 < NB; k0++) {
    bseed[k0] = Math.random(); spawn(k0);
    blife[k0] = Math.random(); bpy[k0] += brise[k0] * bspan[k0] * blife[k0];
  }
  dgeo.attributes.aSeed.needsUpdate = true;
  for (var j0 = 0; j0 < 60; j0++) stepDust(0.15, j0 * 0.15);
  queued = true; requestAnimationFrame(frame);
})();
