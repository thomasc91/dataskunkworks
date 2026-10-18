// Shared behaviour for every page.
(function () {
  // The top bar's edge shows only once content is scrolled under it.
  var bar = document.querySelector('.top');
  if (bar) {
    var ticking = false;
    var update = function () { bar.classList.toggle('under', window.scrollY > 2); ticking = false; };
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    update();
  }

  // Piece pages. The start button is a plain link to the piece full screen, which is what phones and
  // touch screens get: an embedded map or scroller would trap the page's own scrolling under a finger.
  // With a mouse and room to spare, it loads the piece in place instead, fading it in over its poster.
  var stage = document.querySelector('.stage[data-src]');
  var start = stage && stage.querySelector('.start');
  if (!start) return;
  var roomy = window.matchMedia('(min-width: 56rem) and (hover: hover) and (pointer: fine)');

  start.addEventListener('click', function (e) {
    if (!roomy.matches) return;
    e.preventDefault();
    if (stage.querySelector('iframe')) return;
    stage.classList.add('loading');
    var frame = document.createElement('iframe');
    frame.title = stage.getAttribute('data-title') || 'Interactive piece';
    frame.setAttribute('allow', 'fullscreen; autoplay');
    frame.addEventListener('load', function () {
      stage.classList.remove('loading');
      stage.classList.add('live');
      try { frame.focus(); } catch (err) { /* keyboard focus is a nicety */ }
    }, { once: true });
    frame.src = stage.getAttribute('data-src');
    stage.appendChild(frame);
  });
})();
