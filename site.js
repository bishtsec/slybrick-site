/* Slybrick site behaviour: reveal on scroll, the lane you are in (nav + rail + the three.js form),
   and the footer wall. No network calls, no storage, no trackers. */
(function () {
  'use strict';

  var LANES = [
    { id: 'pentesting',  form: 'pentest', name: 'Pentesting' },
    { id: 'defense',     form: 'defense', name: 'Defense auditing' },
    { id: 'bug-hunting', form: 'bughunt', name: 'Bug hunting' }
  ];
  var COLORS = { marigold: '#ffb627', pentest: '#ff4d4f', defense: '#5b9bff', bughunt: '#ffb627' };
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

  /* ───────── the rail: one tick per lane, down the left edge ───────── */
  var rail = document.createElement('nav');
  rail.className = 'rail';
  rail.setAttribute('aria-label', 'Lanes');
  rail.innerHTML = LANES.map(function (L) {
    return '<a href="#' + L.id + '" data-lane="' + L.form + '"><span class="sr">' + L.name + '</span></a>';
  }).join('');
  document.body.appendChild(rail);
  var railLinks = [].slice.call(rail.querySelectorAll('a'));

  /* ───────── what is under the middle of the screen decides the lane ─────────
     The section wins, not the card: a lane is one theme, start to finish. Crossing into a lane
     asks scene.js for that lane's form, which reforms the particles in the lane's colour. */
  var formEls = [].slice.call(document.querySelectorAll('[data-form]'));
  var navLinks = [].slice.call(document.querySelectorAll('.top nav a'));
  var lastForm = '', lastId = '', ticking = false;

  function update() {
    ticking = false;
    var mid = window.innerHeight * 0.5, best = null;
    formEls.forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.top <= mid && r.bottom >= mid) best = el;            // sections are full-height and do not nest
    });
    if (!best) {                                                 // above the first or below the last
      best = window.scrollY < 10 ? formEls[0] : formEls[formEls.length - 1];
    }
    var form = best.getAttribute('data-form'), id = best.id;
    if (form !== lastForm) {
      lastForm = form;
      if (window.SlyScene && window.SlyScene.setForm) window.SlyScene.setForm(form);
      else if (window.SlyScene && COLORS[form]) window.SlyScene.setAccent(COLORS[form]);
    }
    if (id !== lastId) {
      lastId = id;
      navLinks.forEach(function (a) {
        if (a.getAttribute('href') === '#' + id) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
      });
      railLinks.forEach(function (a) {
        if (a.getAttribute('href') === '#' + id) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
      });
    }
  }
  function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  update();

  /* ───────── footer wall: bricks about twice as wide as tall, 8px mortar, courses offset by half a
     brick. One brick sits out of line, in marigold. Only one. ───────── */
  var strip = document.getElementById('strip');
  function drawStrip() {
    var W = Math.max(1, strip.clientWidth), BW = 48, BH = 24, M = 8, PX = BW + M, PY = BH + M, ROWS = 3, H = ROWS * PY;
    var slidRow = 1, slidCol = Math.max(2, Math.floor(W / PX * 0.62)), out = [], x, r, c;
    for (r = 0; r < ROWS; r++) {
      var off = r % 2 ? PX / 2 : 0;
      for (c = 0, x = off - PX; x < W; c++, x += PX) {
        if (r === slidRow && (c === slidCol || c === slidCol + 1)) continue;
        out.push('<rect x="' + x + '" y="' + (r * PY) + '" width="' + BW + '" height="' + BH + '" fill="rgba(255,255,255,.07)"/>');
      }
    }
    var sx = (slidRow % 2 ? PX / 2 : 0) - PX + slidCol * PX + 24;
    out.push('<rect x="' + sx + '" y="' + (slidRow * PY) + '" width="' + BW + '" height="' + BH + '" fill="' + COLORS.marigold + '"/>');
    strip.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    strip.setAttribute('height', H);
    strip.innerHTML = out.join('');
  }
  var rto;
  window.addEventListener('resize', function () { clearTimeout(rto); rto = setTimeout(drawStrip, 120); });
  drawStrip();
})();
