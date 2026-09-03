(function () {
  'use strict';

  var video = document.getElementById('heroVideo');
  var heroSection = document.getElementById('heroSection');
  var loader = document.getElementById('loader');
  var loaderFill = document.getElementById('loaderFill');
  var scrollLineFill = document.getElementById('scrollLineFill');
  var scrollHintLabel = document.getElementById('scrollHintLabel');
  var scrollArrow = document.querySelector('.scroll-arrow');
  var canvas = document.getElementById('shatterCanvas');
  var ctx = canvas ? canvas.getContext('2d') : null;

  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function smoothstep(edge0, edge1, x) {
    var t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  /* ---------- Loading screen ---------- */
  var loaderDone = false;
  var loaderProgress = 0;

  function hideLoader() {
    if (loaderDone) return;
    loaderDone = true;
    loaderFill.style.width = '100%';
    setTimeout(function () {
      loader.classList.add('is-hidden');
    }, 150);
  }

  function tickLoaderProgress() {
    if (loaderDone) return;
    loaderProgress = Math.min(loaderProgress + Math.random() * 18, 92);
    loaderFill.style.width = loaderProgress + '%';
    if (!loaderDone) setTimeout(tickLoaderProgress, 180);
  }
  tickLoaderProgress();

  video.addEventListener('canplaythrough', hideLoader, { once: true });
  // Fallback: never block the site for more than 6s.
  setTimeout(hideLoader, 6000);

  /* ---------- Glass-shard shatter overlay ---------- */
  var SHARD_COLORS = ['#19e6d1', '#f2a93b', '#8b6bf2', '#f4f3f0'];
  var shards = [];
  var canvasW = 0, canvasH = 0;

  function makeShards(count) {
    var arr = [];
    for (var i = 0; i < count; i++) {
      var angle = Math.random() * Math.PI * 2;
      arr.push({
        angle: angle,
        maxDist: 0.16 + Math.random() * 0.42, // fraction of canvas min-dimension
        len: 10 + Math.random() * 22,
        wid: 1.5 + Math.random() * 3,
        rotBase: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 4,
        delay: 0.35 + Math.random() * 0.45,
        color: SHARD_COLORS[i % SHARD_COLORS.length],
        wobble: Math.random() * Math.PI * 2
      });
    }
    return arr;
  }
  shards = makeShards(52);

  function resizeCanvas() {
    if (!canvas) return;
    var dpr = window.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    canvasW = rect.width;
    canvasH = rect.height;
    canvas.width = Math.max(1, Math.round(canvasW * dpr));
    canvas.height = Math.max(1, Math.round(canvasH * dpr));
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawShatter(progress) {
    if (!ctx || !canvasW || !canvasH) return;
    ctx.clearRect(0, 0, canvasW, canvasH);

    var shatterT = smoothstep(0.45, 1.0, progress);
    if (shatterT <= 0) return;

    var originX = canvasW * 0.5;
    var originY = canvasH * 0.54;
    var minDim = Math.min(canvasW, canvasH);

    // Soft light burst at the origin as the prism catches the beam.
    var burst = smoothstep(0.0, 0.35, shatterT) * (1 - smoothstep(0.7, 1.0, shatterT));
    if (burst > 0.01) {
      var grad = ctx.createRadialGradient(originX, originY, 0, originX, originY, minDim * 0.28 * burst + 4);
      grad.addColorStop(0, 'rgba(244,243,240,' + (0.5 * burst) + ')');
      grad.addColorStop(1, 'rgba(244,243,240,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvasW, canvasH);
    }

    ctx.globalCompositeOperation = 'lighter';

    for (var i = 0; i < shards.length; i++) {
      var s = shards[i];
      var localT = clamp((shatterT - s.delay) / (1 - s.delay), 0, 1);
      if (localT <= 0) continue;
      var eased = easeOutCubic(localT);

      // Fade in fast, then hold at full brightness through the end of the
      // scroll — the shatter should climax as the journey completes, not
      // fizzle out before the visitor gets there.
      var opacity = clamp(localT / 0.12, 0, 1);
      if (opacity <= 0.01) continue;

      var dist = s.maxDist * minDim * eased;
      var wob = Math.sin(shatterT * 6 + s.wobble) * 4 * (1 - eased);
      var x = originX + Math.cos(s.angle) * dist;
      var y = originY + Math.sin(s.angle) * dist + wob;
      var rot = s.rotBase + eased * s.spin;
      var len = s.len * (0.6 + 0.4 * eased);

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.beginPath();
      ctx.moveTo(-len / 2, 0);
      ctx.lineTo(0, -s.wid);
      ctx.lineTo(len / 2, 0);
      ctx.lineTo(0, s.wid);
      ctx.closePath();
      ctx.fillStyle = s.color;
      ctx.globalAlpha = opacity;
      ctx.shadowColor = s.color;
      ctx.shadowBlur = 6;
      ctx.fill();
      ctx.restore();
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ---------- Scroll-bound playback ---------- */
  var duration = 0;
  var videoReady = false;
  var pendingProgress = null;

  function primeVideo() {
    // Some mobile browsers (notably iOS Safari) won't render a seeked
    // frame until the video has actually started playing once. Priming
    // it with a muted play()+pause() unlocks currentTime scrubbing.
    var playPromise = video.play();
    if (playPromise && typeof playPromise.then === 'function') {
      playPromise.then(function () {
        video.pause();
      }).catch(function () {
        // Autoplay blocked — scrubbing via currentTime still works on
        // most desktop browsers without priming, so just continue.
      });
    }
  }

  function markVideoReady() {
    if (videoReady) return;
    // Belt-and-braces: some environments fire loadedmetadata before this
    // listener attaches (fast local servers), leaving duration stuck at
    // 0 forever if we only trust the event. Read readyState directly too.
    if (video.readyState < 1 || !video.duration || Number.isNaN(video.duration)) return;
    videoReady = true;
    duration = video.duration;
    primeVideo();
    if (pendingProgress !== null) {
      applyProgress(pendingProgress);
      pendingProgress = null;
    }
  }

  video.addEventListener('loadedmetadata', markVideoReady);
  video.addEventListener('canplay', markVideoReady);
  video.addEventListener('loadeddata', markVideoReady);
  // In case metadata was already available by the time we got here.
  markVideoReady();
  video.load();

  function applyProgress(progress) {
    if (!videoReady || duration <= 0) {
      pendingProgress = progress;
      return;
    }
    var t = progress * duration;
    if (Number.isFinite(t)) {
      try { video.currentTime = t; } catch (e) { /* ignore seek errors */ }
    }
  }

  function updateFromScroll() {
    var rect = heroSection.getBoundingClientRect();
    var total = rect.height - window.innerHeight;
    var scrolled = clamp(-rect.top, 0, total);
    var progress = total > 0 ? scrolled / total : 0;

    applyProgress(progress);
    drawShatter(progress);

    var pct = Math.round(progress * 100);
    scrollLineFill.style.width = pct + '%';
    if (scrollHintLabel) {
      scrollHintLabel.style.opacity = progress > 0.08 ? '0' : '1';
    }
    if (scrollArrow) {
      scrollArrow.style.opacity = progress > 0.08 ? '0' : '1';
    }
  }

  var ticking = false;
  function onScroll() {
    // Embedded preview panels sometimes stop delivering
    // requestAnimationFrame while the tab/pane is hidden — apply the
    // update directly rather than silently doing nothing.
    if (document.hidden) {
      updateFromScroll();
      return;
    }
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      updateFromScroll();
      ticking = false;
    });
  }

  if (prefersReducedMotion) {
    // Respect the user's preference: play the clip normally, don't
    // bind it to scroll, and never collapse the hero's height.
    video.loop = true;
    video.autoplay = true;
    video.play().catch(function () {});
    scrollLineFill.style.width = '100%';
    if (scrollHintLabel) scrollHintLabel.style.display = 'none';
    if (scrollArrow) scrollArrow.style.display = 'none';
  } else {
    resizeCanvas();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', function () {
      resizeCanvas();
      onScroll();
    });
    updateFromScroll();
  }

  /* ---------- CTA placeholders ---------- */
  document.querySelectorAll('.cta').forEach(function (el) {
    el.addEventListener('click', function (e) {
      var target = document.querySelector(el.getAttribute('href'));
      if (!target) {
        e.preventDefault();
        // Sections not built yet in this stage of the project.
        console.log('[hub] destino ainda não publicado:', el.dataset.cta);
      }
    });
  });

  /* ---------- Estúdio IA: hover-to-play on video cards ---------- */
  // Only wires up cards where a real <video> was used instead of <img> —
  // harmless no-op on the placeholder image cards.
  document.querySelectorAll('.studio-card').forEach(function (card) {
    var media = card.querySelector('video.studio-media');
    if (!media) return;
    card.addEventListener('mouseenter', function () {
      var p = media.play();
      if (p && typeof p.catch === 'function') p.catch(function () {});
    });
    card.addEventListener('mouseleave', function () {
      media.pause();
      try { media.currentTime = 0; } catch (e) {}
    });
    // Basic touch support: tap toggles play/pause instead of relying on hover.
    card.addEventListener('touchstart', function () {
      if (media.paused) {
        var p2 = media.play();
        if (p2 && typeof p2.catch === 'function') p2.catch(function () {});
      } else {
        media.pause();
      }
    }, { passive: true });
  });

  /* ---------- Estúdio IA: filtro por categoria ---------- */
  var filterBar = document.getElementById('studioFilters');
  if (filterBar) {
    var filterButtons = filterBar.querySelectorAll('.studio-filter-btn');
    var studioCards = document.querySelectorAll('#studioGrid .studio-card');
    filterButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        filterButtons.forEach(function (b) { b.classList.remove('is-active'); });
        btn.classList.add('is-active');
        var filter = btn.getAttribute('data-filter');
        studioCards.forEach(function (card) {
          var cat = card.getAttribute('data-cat');
          if (filter === 'todos' || cat === filter) {
            card.classList.remove('is-hidden');
          } else {
            card.classList.add('is-hidden');
          }
        });
      });
    });
  }
})();
