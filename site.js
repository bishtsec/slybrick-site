/* Slybrick site behaviour: reveal on scroll, current-section nav, the sly brick's colour, the footer wall.
   No network calls, no storage, no trackers. */
(function () {
  'use strict';

  var COLORS = { marigold: '#ffb627', coral: '#ff7a93', mint: '#4fd6a4', sky: '#6aa8ff' };
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ───────── reveal: fade, rise 14px, un-blur; siblings stagger via --d ───────── */
  var rev = [].slice.call(document.querySelectorAll('.reveal'));
  if ('IntersectionObserver' in window && !reduced) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('on');
        io.unobserve(e.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    rev.forEach(function (el) { io.observe(el); });
  } else {
    rev.forEach(function (el) { el.classList.add('on'); });
  }

  /* ───────── what is under the middle of the screen: nav highlight + the colour of the sly brick ───────── */
  var accentEls = [].slice.call(document.querySelectorAll('[data-accent]'));
  var navSecs = ['what-we-do', 'idea', 'contact'].map(function (id) { return document.getElementById(id); });
  var links = [].slice.call(document.querySelectorAll('.top nav a'));
  var lastAccent = '', ticking = false;

  function update() {
    ticking = false;
    var mid = window.innerHeight * 0.5, best = null, bestH = Infinity;
    accentEls.forEach(function (el) {                       // the smallest element that spans the middle line wins:
      var r = el.getBoundingClientRect();                   // a card beats the section that contains it
      if (r.top <= mid && r.bottom >= mid && r.height < bestH) { best = el; bestH = r.height; }
    });
    if (best) {
      var name = best.getAttribute('data-accent');
      if (name !== lastAccent) {
        lastAccent = name;
        if (window.SlyScene && COLORS[name]) window.SlyScene.setAccent(COLORS[name]);
      }
    }
    var cur = '';
    navSecs.forEach(function (s) { var r = s.getBoundingClientRect(); if (r.top <= mid && r.bottom > mid) cur = s.id; });
    links.forEach(function (a) {
      if (a.getAttribute('href') === '#' + cur) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
    });
  }
  function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  update();

  /* ───────── footer wall: bricks about twice as wide as tall, 8px mortar, courses offset by half a brick.
     One brick sits out of line, in marigold. Only one. ───────── */
  var strip = document.getElementById('strip');
  function drawStrip() {
    var W = Math.max(1, strip.clientWidth), BW = 48, BH = 24, M = 8, PX = BW + M, PY = BH + M, ROWS = 3, H = ROWS * PY;
    var slidRow = 1, slidCol = Math.max(2, Math.floor(W / PX * 0.62)), out = [], x, r, c;
    for (r = 0; r < ROWS; r++) {
      var off = r % 2 ? PX / 2 : 0;
      for (c = 0, x = off - PX; x < W; c++, x += PX) {
        if (r === slidRow && (c === slidCol || c === slidCol + 1)) continue;          // its slot and the next are left open
        out.push('<rect x="' + x + '" y="' + (r * PY) + '" width="' + BW + '" height="' + BH + '" fill="rgba(255,255,255,.07)"/>');
      }
    }
    var sx = (slidRow % 2 ? PX / 2 : 0) - PX + slidCol * PX + 24;                      // slid 3 units (24px) out of line
    out.push('<rect x="' + sx + '" y="' + (slidRow * PY) + '" width="' + BW + '" height="' + BH + '" fill="' + COLORS.marigold + '"/>');
    strip.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    strip.setAttribute('height', H);
    strip.innerHTML = out.join('');
  }
  var rto;
  window.addEventListener('resize', function () { clearTimeout(rto); rto = setTimeout(drawStrip, 120); });
  drawStrip();
})();
