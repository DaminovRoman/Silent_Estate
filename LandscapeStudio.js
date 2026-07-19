/* ==========================================================================
   SILENT ESTATE — Interaction Layer
   Vanilla JS · Intersection Observer · requestAnimationFrame · CSS Variables
   No dependencies.
   ========================================================================== */

(() => {
  'use strict';

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasFinePointer = window.matchMedia('(pointer: fine)').matches;
  if (hasFinePointer) document.documentElement.classList.add('has-fine-pointer');

  /* ==================================================================
     PRELOADER
     Trigger: runs immediately on script parse (script tag sits at the
       end of body, so the DOM — including every <img> the markup
       declares — already exists by this point).
     Delay: none to start; the exit itself waits for the later of
       (a) window `load` (fonts + every image decoded) and
       (b) a 2.6s minimum stage, so the wordmark-reveal is never cut
       short on a fast cached load.
     Duration: see CSS — the wordmark/meter/percent track a single
       0→1 progress value continuously for the full minimum stage,
       then a .9s architectural exit.
     Easing: the progress value itself eases (fast start, long settle)
       via an easeOutCubic curve sampled every animation frame;
       ease-architectural governs the exit as elsewhere on the page.
     Purpose: gives the visitor something that visibly, continuously
       loads rather than a bar that silently jumps to 100% — the
       displayed value is the *larger* of (a) a smooth animated curve
       running for the full minimum stage and (b) real progress
       counted from actual image decode/error events, so the bar
       always reads as active motion, but still only reports 100% once
       the page has genuinely finished loading (real progress can pull
       the display ahead of the animated curve if assets are slow;
       the animated curve carries it forward when there's little or
       nothing to track, which is the common case while photo slots
       are still gradient placeholders — see hero__media comment).
  ================================================================== */
  (() => {
    const preloader = document.querySelector('[data-preloader]');
    if (!preloader) return;
    const mark = preloader.querySelector('.preloader__mark');
    const barFill = preloader.querySelector('[data-preloader-fill]');
    const percentLabel = preloader.querySelector('[data-preloader-percent]');

    // Matches the exit choreography below: the minimum stage is long
    // enough for the progress curve to feel like real motion rather
    // than a blip, even on an instant cached load.
    const MIN_STAGE_MS = prefersReducedMotion ? 200 : 2600;
    const startedAt = Date.now();
    let released = false;
    let pageReady = false;

    // Photo slots without a `src` attribute never fire load/error, so
    // only count the ones actually attempting to fetch something —
    // matches the same guard used by the scene-photo fade-in module
    // further down this file. Now that every slot has a real src
    // (see hero__media comment), `total` is commonly 35, and most of
    // those images resolve `img.complete === true` on the very first
    // frame — either served from cache, or just small/fast enough to
    // decode before the first requestAnimationFrame runs. Left
    // unguarded, that made realRatio jump to 1 immediately, and the
    // Math.max blend below would snap the visible bar straight to
    // 100% — the "no % nor bar left to see" bug. realRatio is still
    // tracked (a genuinely slow connection can legitimately delay
    // things and should surface that), but it's now capped at the
    // same 0.96 ceiling as the animated curve: real completion can
    // pull the *release* earlier via `ready()` below, but it can no
    // longer paint a number the eased curve hasn't visually earned
    // yet. The last 4% is reserved for release() alone, same as before.
    const trackedImages = Array.from(document.querySelectorAll('.gradient-scene__photo'))
      .filter((img) => img.getAttribute('src'));
    const total = trackedImages.length;
    let settled = 0;
    let realRatio = total === 0 ? null : 0;
    let rafId = null;

    function markOne() {
      settled += 1;
      realRatio = Math.min(0.96, settled / total);
    }
    trackedImages.forEach((img) => {
      if (img.complete) { markOne(); return; }
      img.addEventListener('load', markOne, { once: true });
      img.addEventListener('error', markOne, { once: true });
    });

    function applyProgress(ratio) {
      const clamped = Math.max(0, Math.min(1, ratio));
      if (mark) mark.style.setProperty('--p', clamped.toFixed(4));
      if (barFill) barFill.style.width = `${(clamped * 100).toFixed(1)}%`;
      if (percentLabel) percentLabel.textContent = `${Math.round(clamped * 100)}%`;
    }

    if (prefersReducedMotion) {
      // No motion to animate toward — jump straight to the honest
      // current value and let `release()` finish it at 100%.
      applyProgress(realRatio ?? 1);
    } else {
      if (mark) mark.classList.add('is-active');
      function tick() {
        const elapsed = Date.now() - startedAt;
        // easeOutCubic: fast initial motion that settles gently as it
        // approaches the minimum-stage boundary, rather than a linear
        // ramp — reads as a considered loading sequence rather than a
        // mechanical countdown.
        const t = Math.min(1, elapsed / MIN_STAGE_MS);
        const eased = 1 - Math.pow(1 - t, 3);
        // Animated curve caps at 96% on its own — the last few points
        // are reserved for the real `release()` call so the bar never
        // sits at a false 100% while the page is still technically
        // finishing up.
        const animated = eased * 0.96;
        // Blend real progress in as a *ceiling that rises with elapsed
        // time*, not a value that can jump ahead of the curve outright.
        // Multiplying realRatio by the same `t` used for the animated
        // curve means: even though images may finish loading (and
        // realRatio become 0.96) on the very first frame, its
        // contribution to the displayed number is scaled down by how
        // little time has actually elapsed — so it can only catch up
        // to and gently reinforce the eased curve as MIN_STAGE_MS
        // elapses, never leapfrog it. A slow real load (realRatio
        // still climbing near t=1) still shows through normally, since
        // by then t is close to 1 and barely scales it down at all.
        const display = realRatio === null ? animated : Math.max(animated, realRatio * t);
        applyProgress(display);
        if (!pageReady || t < 1) {
          rafId = requestAnimationFrame(tick);
        }
      }
      rafId = requestAnimationFrame(tick);
    }

    function release() {
      if (released) return;
      released = true;
      pageReady = true;
      if (rafId) cancelAnimationFrame(rafId);
      applyProgress(1);
      document.body.classList.remove('is-loading');
      // Small pause on the completed bar so 100% actually registers
      // before the curtain rises, rather than the two happening in
      // the same frame.
      setTimeout(() => {
        requestAnimationFrame(() => preloader.classList.add('is-hidden'));
      }, prefersReducedMotion ? 0 : 220);
      // .is-hidden animates two properties on different schedules —
      // opacity (0.1s delay + 0.6s = 0.7s) finishes before transform
      // (0.9s, no delay). A transitionend listener would fire on
      // whichever settles first and could set [hidden] — which flips
      // display:none instantly — while the slower transform is still
      // mid-motion, clipping the last fifth of the curtain-rise. Wait
      // out the longer of the two instead, plus a small margin.
      setTimeout(() => preloader.setAttribute('hidden', ''), prefersReducedMotion ? 350 : 1400);
    }

    function ready() {
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(0, MIN_STAGE_MS - elapsed);
      setTimeout(release, remaining);
    }

    if (document.readyState === 'complete') {
      ready();
    } else {
      window.addEventListener('load', ready, { once: true });
      // Safety net: if `load` is unusually slow (e.g. a slow webfont
      // fetch blocking it), don't hold the visitor on a loading screen
      // indefinitely — release after a generous ceiling regardless.
      setTimeout(release, 6000);
    }
  })();

  /* ------------------------------------------------------------------
     UTIL: throttle via rAF — collapses high-frequency events (scroll,
     mousemove) to one update per animation frame. Purpose: keep every
     scroll/pointer-driven animation on the compositor's cadence rather
     than the event's, which is what keeps parallax and cursor motion
     smooth on lower-powered devices.
  ------------------------------------------------------------------ */
  function rafThrottle(fn) {
    let scheduled = false;
    return (...args) => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        fn(...args);
        scheduled = false;
      });
    };
  }

  /* ==================================================================
     CUSTOM CURSOR — Premium Cursor Glow
     Trigger: pointermove, fine pointers only
     Delay: 0 (dot), ~120ms perceived lag (glow, via CSS transition)
     Duration: continuous / .6s opacity fade
     Easing: ease-soft
     GPU Optimization: transform-only positioning, translate3d avoided in
       favor of translate(-50%,-50%) since these are fixed 2D elements —
       no layout or paint triggered, only compositing.
     Purpose: a quiet, ambient trace of attention across the page that
       reinforces the "walking the grounds" feeling without demanding
       focus. Widens over interactive elements to suggest an invitation.
  ================================================================== */
  if (hasFinePointer && !prefersReducedMotion) {
    const dot = document.querySelector('.cursor-dot');
    const glow = document.querySelector('.cursor-glow');
    let gx = 0, gy = 0; // glow (lagging)
    let mx = 0, my = 0; // mouse (immediate)

    window.addEventListener('pointermove', (e) => {
      mx = e.clientX; my = e.clientY;
      dot.style.transform = `translate(${mx}px, ${my}px) translate(-50%, -50%)`;
    }, { passive: true });

    function animateGlow() {
      gx += (mx - gx) * 0.09;
      gy += (my - gy) * 0.09;
      glow.style.transform = `translate(${gx}px, ${gy}px) translate(-50%, -50%)`;
      requestAnimationFrame(animateGlow);
    }
    animateGlow();

    document.querySelectorAll('a, button, .magnetic').forEach((el) => {
      el.addEventListener('mouseenter', () => dot.classList.add('is-hovering'));
      el.addEventListener('mouseleave', () => dot.classList.remove('is-hovering'));
    });
  }

  /* ==================================================================
     ESTATE THREAD — signature scroll progress
     Trigger: scroll (document-wide)
     Delay: 0
     Duration: continuous, height transition .1s linear per tick
     Easing: linear (progress must track scroll 1:1, no easing lag)
     GPU Optimization: only `height` on a 1px-wide fixed element; cheap
       even though height is not a compositor-only property, because
       the element's paint area is a single pixel column.
     Purpose: the signature motif — a thin vertical "water line" that
       fills like a reflection rising, giving constant, ambient
       orientation without a numeric progress bar's utilitarian feel.
  ================================================================== */
  const threadFill = document.querySelector('.estate-thread__fill');
  function updateThread() {
    const scrollTop = window.scrollY;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const pct = max > 0 ? Math.min(100, (scrollTop / max) * 100) : 0;
    if (threadFill) threadFill.style.height = pct + '%';
  }
  window.addEventListener('scroll', rafThrottle(updateThread), { passive: true });
  updateThread();

  /* ==================================================================
     NAV — condense on scroll
     Trigger: scroll past 40px
     Duration: .4s (defined in CSS var --dur-fast)
     Easing: ease-soft
     Purpose: keeps the hero's full-height openness on load, then
     compresses to a utility bar once the person is navigating.
  ================================================================== */
  const nav = document.querySelector('[data-nav]');
  function updateNav() {
    if (window.scrollY > 40) nav.classList.add('is-scrolled');
    else nav.classList.remove('is-scrolled');
  }
  window.addEventListener('scroll', rafThrottle(updateNav), { passive: true });
  updateNav();

  /* ==================================================================
     NAV — measure real height, expose as --nav-h-live
     Trigger: on load, on resize/orientation change, and whenever the
       header's own box changes size (e.g. the subline collapsing on
       scroll, or the two-line phrase re-wrapping to one line on a
       wider viewport).
     Purpose: .nav is fixed and so takes no space in normal flow — the
       hero section that follows it has to reserve room for it itself.
       The header is now two rows (logo/menu row + subline) whose
       combined height is font- and viewport-dependent (clamp()-based
       sizes, text wrapping), so a guessed fixed pixel value would
       drift on some devices and let the hero title creep back up
       under the header, right where it was overlapping before. Reading
       the header's real rendered height and writing it into a CSS
       variable keeps the hero's top spacing exactly correct on every
       screen, in real time, with no magic numbers.
  ================================================================== */
  function updateNavHeightVar() {
    document.documentElement.style.setProperty('--nav-h-live', nav.offsetHeight + 'px');
  }
  if ('ResizeObserver' in window) {
    new ResizeObserver(updateNavHeightVar).observe(nav);
  } else {
    // Fallback for browsers without ResizeObserver: resize/orientation
    // covers viewport-driven changes; the scroll listener re-measures
    // after is-scrolled's own collapse transition finishes.
    window.addEventListener('resize', updateNavHeightVar);
    nav.addEventListener('transitionend', updateNavHeightVar);
  }
  updateNavHeightVar();

  /* ==================================================================
     MOBILE MENU
     Trigger: burger click (opens), close-button/link/Escape (closes)
     Delay: links stagger in at 60ms increments once the panel opens
     Duration: .5s panel fade, .6s per-link settle (ease-architectural)
     Purpose: opening the menu is treated as a small reveal moment like
       any other on the page — links arrive settling into place rather
       than the list appearing as one flat block, consistent with
       [data-reveal] elsewhere. Handled manually via classList rather
       than IntersectionObserver because this panel is visibility:hidden
       until opened, so it never crosses a scroll-based viewport
       threshold (same reasoning as .project-detail).
  ================================================================== */
  const burger = document.querySelector('[data-burger]');
  const mobileMenu = document.querySelector('[data-mobile-menu]');
  const mobileClose = document.querySelector('[data-mobile-close]');
  const menuLinks = mobileMenu.querySelectorAll('[data-menu-link]');

  function openMobileMenu() {
    mobileMenu.classList.add('is-open');
    burger.setAttribute('aria-expanded', 'true');
    menuLinks.forEach((a) => a.classList.remove('is-visible'));
    if (prefersReducedMotion) {
      menuLinks.forEach((a) => a.classList.add('is-visible'));
      return;
    }
    requestAnimationFrame(() => {
      menuLinks.forEach((a, i) => {
        setTimeout(() => a.classList.add('is-visible'), i * 60);
      });
    });
  }
  function closeMobileMenu() {
    mobileMenu.classList.remove('is-open');
    burger.setAttribute('aria-expanded', 'false');
  }
  burger.addEventListener('click', () => {
    if (mobileMenu.classList.contains('is-open')) closeMobileMenu();
    else openMobileMenu();
  });
  if (mobileClose) mobileClose.addEventListener('click', closeMobileMenu);
  menuLinks.forEach((a) => a.addEventListener('click', closeMobileMenu));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && mobileMenu.classList.contains('is-open')) closeMobileMenu();
  });

  /* ==================================================================
     ARCHITECTURAL REVEAL — Intersection Observer
     Trigger: element enters viewport at 15% visible
     Delay: 0–450ms, staggered via CSS nth-of-type where grouped
     Duration: 1.1s (--dur-mid-ish, defined inline in CSS: 1.1s)
     Easing: ease-architectural (cubic-bezier(0.16,1,0.3,1)) — a
       pronounced deceleration curve that mimics a heavy object
       settling, appropriate for stone/architecture rather than a
       bouncy UI easing.
     GPU Optimization: only opacity + transform (translateY) animate,
       both compositor-only properties; will-change is intentionally
       NOT set globally on [data-reveal] to avoid promoting every
       section to its own layer at once — instead the transition
       itself is enough since these are short-lived, one-shot reveals.
     Purpose: each element arrives like a plane of an architectural
       drawing settling into place — the core "reveal" language used
       throughout the page for text, media, and structural elements.
       [data-reveal-media] photo panels share this same observer but
       carry their own CSS transition (scale-in + fade, see CSS) for a
       slower, more cinematic settle appropriate to a photograph.
  ================================================================== */
  const revealTargets = document.querySelectorAll('[data-reveal], [data-reveal-media]');
  if (prefersReducedMotion) {
    revealTargets.forEach((el) => el.classList.add('is-visible'));
  } else {
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.01, rootMargin: '0px 0px -2% 0px' });
    revealTargets.forEach((el) => revealObserver.observe(el));

    // Safety net: anything already within the viewport on first paint
    // (e.g. short pages, fast scrollIntoView jumps, or elements whose
    // own box only partially enters view) becomes visible immediately
    // rather than risking a stuck opacity:0 element.
    requestAnimationFrame(() => {
      const vh = window.innerHeight;
      revealTargets.forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.top < vh && rect.bottom > 0) {
          el.classList.add('is-visible');
        }
      });
    });
  }

  /* ==================================================================
     SCENE PHOTOGRAPHS — fade in once loaded, fall back to the tonal
     gradient silently on error (e.g. an empty/missing src while photo
     slots are still being filled in). Purpose: lets every gradient-scene
     block host a real <img> without ever risking a broken-image icon or
     a jarring pop — the swap from tone to photograph is always a fade.
  ================================================================== */
  document.querySelectorAll('.gradient-scene__photo').forEach((img) => {
    if (!img.getAttribute('src')) return; // no photo assigned yet — gradient stays visible
    if (img.complete && img.naturalWidth > 0) {
      img.classList.add('is-loaded');
    } else {
      img.addEventListener('load', () => img.classList.add('is-loaded'));
      img.addEventListener('error', () => img.removeAttribute('src'));
    }
  });

  /* ==================================================================
     SOFT PARALLAX — Light Through Trees / Water Reflection Motion
     Trigger: scroll, only for elements currently within viewport
       bounds (checked every tick to avoid transforming off-screen
       nodes)
     Delay: 0
     Duration: continuous, tied to scroll position
     Easing: linear mapping of scroll delta to translateY (the
       "smoothing" comes from the small multiplier, not eased time)
     GPU Optimization: transform: translate3d only, elements pre-marked
       will-change: transform in CSS; loop reads scroll position once
       per rAF tick via rafThrottle rather than per scroll event.
     Purpose: media panels drift at a slightly different rate than
       the page scroll — the same depth cue as looking through moving
       foreground branches at a still building behind them.
  ================================================================== */
  const parallaxEls = Array.from(document.querySelectorAll('[data-parallax]')).map((el) => ({
    el,
    factor: parseFloat(el.dataset.parallax) || 0.1
  }));

  function updateParallax() {
    if (prefersReducedMotion || parallaxEls.length === 0) return;
    const viewportH = window.innerHeight;
    parallaxEls.forEach(({ el, factor }) => {
      // Elements that also carry [data-reveal-media] own their own CSS
      // transition on `transform` (the scale(1.06) → scale(1) settle).
      // Writing an inline transform here while that's still mid-flight
      // would instantly override it every scroll tick — inline styles
      // always win the cascade over a class-driven transition — which
      // is what caused the jitter/pop on scroll. Wait until the reveal
      // has finished (.is-visible) before this element starts moving.
      if (el.hasAttribute('data-reveal-media') && !el.classList.contains('is-visible')) return;
      const rect = el.getBoundingClientRect();
      if (rect.bottom < -200 || rect.top > viewportH + 200) return; // skip off-screen
      const centerDelta = (rect.top + rect.height / 2) - viewportH / 2;
      const offset = centerDelta * factor * -1;
      el.style.transform = `translate3d(0, ${offset.toFixed(1)}px, 0) scale(1.001)`;
    });
  }
  window.addEventListener('scroll', rafThrottle(updateParallax), { passive: true });
  window.addEventListener('resize', rafThrottle(updateParallax));
  updateParallax();

  /* ==================================================================
     MAGNETIC BUTTONS
     Trigger: pointermove within a 1.6x-padded bounding box of the
       element (fine pointers only)
     Delay: 0
     Duration: .35s return-to-rest on pointerleave
     Easing: ease-soft
     GPU Optimization: transform: translate only, computed from cached
       getBoundingClientRect on enter (not re-read every move)
     Purpose: buttons feel weighted, like they respond to proximity —
       a small, restrained nod to premium product sites (Apple, Rivian)
       without becoming a gimmick; pull is capped low (max ~10px) to
       stay "ambient" rather than playful.
  ================================================================== */
  if (hasFinePointer && !prefersReducedMotion) {
    document.querySelectorAll('[data-magnetic]').forEach((el) => {
      let bounds = null;
      const strength = 0.28;
      const maxPull = 10;

      el.addEventListener('mouseenter', () => {
        bounds = el.getBoundingClientRect();
      });
      el.addEventListener('mousemove', (e) => {
        if (!bounds) bounds = el.getBoundingClientRect();
        const relX = e.clientX - (bounds.left + bounds.width / 2);
        const relY = e.clientY - (bounds.top + bounds.height / 2);
        const pullX = Math.max(-maxPull, Math.min(maxPull, relX * strength));
        const pullY = Math.max(-maxPull, Math.min(maxPull, relY * strength));
        el.style.transform = `translate(${pullX}px, ${pullY}px)`;
      });
      el.addEventListener('mouseleave', () => {
        el.style.transform = 'translate(0, 0)';
        bounds = null;
      });
    });
  }

  /* ==================================================================
     PROJECT DETAIL OVERLAY — Glass Morphing / Cinematic Fade
     Trigger: click on [data-open-project]
     Delay: 0
     Duration: .7s open/close (matches --dur-mid ~ .9s scaled slightly
       faster for perceived responsiveness on a full-viewport takeover)
     Easing: ease-architectural
     GPU Optimization: opacity + translateY only; visibility toggled
       after the transition via CSS transition-delay so the layer is
       removed from hit-testing without an abrupt cut.
     Purpose: opening a project feels like stepping through a threshold
       rather than navigating to a new page — reinforces "walking the
       grounds" rather than "browsing a site".
  ================================================================== */
  const projectData = {
    '1': {
      index: '01',
      title: 'Тихий периметр',
      location: 'Резиденция у соснового леса · 2.4 га',
      heroClass: 'gradient-scene--project-1',
      heroPhoto: 'img/4.png',
      heroAlt: 'Резиденция у соснового леса на закате',
      masterplanPhoto: 'img/7.png',
      materialsPhoto: 'img/8.png',
      lightingPhoto: 'img/9.png',
      finalPhoto: 'img/10.png',
      masterplan: 'Территория организована вокруг существующего леса: дом смещён к северной границе, оставляя южный склон полностью под сад и террасы, обращённые к закату.',
      materials: 'Известняк ручной тёски для дорожек, состаренный дуб для настилов террас, необработанный гранит для подпорных стен — материалы, которые темнеют и стареют вместе с домом.',
      lighting: 'Свет скрыт в самой архитектуре — под ступенями, в основании деревьев, вдоль кромки воды. К десяти вечера территория растворяется в свете без единого видимого источника.'
    },
    '2': {
      index: '02',
      title: 'Зеркало и камень',
      location: 'Дом у воды · 1.1 га',
      heroClass: 'gradient-scene--project-2',
      heroPhoto: 'img/5.png',
      heroAlt: 'Водное зеркало у дома на закате',
      masterplanPhoto: 'img/11.png',
      materialsPhoto: 'img/12.png',
      lightingPhoto: 'img/13.png',
      finalPhoto: 'img/14.png',
      masterplan: 'Водное зеркало длиной сорок метров продолжает линию главной террасы, а мастер-план подчинён одной оси — от порога дома до линии горизонта.',
      materials: 'Полированный травертин у кромки воды, грубый известняк на периферии участка — переход от гладкого к естественному по мере удаления от дома.',
      lighting: 'Скрытая подсветка вдоль ватерлинии заставляет бассейн светиться изнутри в сумерках, без единого надземного светильника в поле зрения.'
    },
    '3': {
      index: '03',
      title: 'Три двора',
      location: 'Семейная резиденция · 3.8 га',
      heroClass: 'gradient-scene--project-3',
      heroPhoto: 'img/6.png',
      heroAlt: 'Один из трёх дворов семейной резиденции',
      masterplanPhoto: 'img/15.png',
      materialsPhoto: 'img/16.png',
      lightingPhoto: 'img/17.png',
      finalPhoto: 'img/18.png',
      masterplan: 'Территория разделена на три двора с разным характером света: утренний — для завтрака, полуденный — для тени, вечерний — для тишины у костра.',
      materials: 'Тёплый песчаник для утреннего двора, серый сланец для полуденной тени, тёмный базальт для вечерней зоны — материал меняется вместе со сценарием двора.',
      lighting: 'Каждый двор получил собственную световую партитуру — тёплую и низкую вечером, почти невидимую утром, чтобы не спорить с рассветом.'
    }
  };

  const detailOverlay = document.querySelector('[data-project-detail]');
  const detailHero = document.querySelector('[data-project-hero]');
  const detailHeroPhoto = document.querySelector('[data-project-hero-photo]');
  const detailMasterplanPhoto = document.querySelector('[data-detail-masterplan-photo]');
  const detailMaterialsPhoto = document.querySelector('[data-detail-materials-photo]');
  const detailLightingPhoto = document.querySelector('[data-detail-lighting-photo]');
  const detailFinalPhoto = document.querySelector('[data-detail-final-photo]');
  let lastFocusedTrigger = null;

  // Swaps one gradient-scene__photo <img> to a new src, replaying its
  // fade-in per project. Mirrors the original heroPhoto swap logic so all
  // per-project photo slots (hero + the 4 detail-overlay shots) behave
  // identically: is-loaded is reset first, then the new src is set (or, if
  // the field is empty, the src is removed and the tonal gradient shows).
  function swapScenePhoto(imgEl, src, alt) {
    if (!imgEl) return;
    imgEl.classList.remove('is-loaded');
    if (src) {
      imgEl.src = src;
      imgEl.alt = alt || '';
      imgEl.onload = () => imgEl.classList.add('is-loaded');
      imgEl.onerror = () => imgEl.removeAttribute('src');
    } else {
      imgEl.removeAttribute('src');
    }
  }

  function openProject(id) {
    const data = projectData[id];
    if (!data || !detailOverlay) return;

    detailOverlay.querySelector('[data-project-index]').textContent = data.index;
    detailOverlay.querySelector('[data-project-title]').textContent = data.title;
    detailOverlay.querySelector('[data-project-location]').textContent = data.location;
    detailOverlay.querySelector('[data-project-text="masterplan"]').textContent = data.masterplan;
    detailOverlay.querySelector('[data-project-text="materials"]').textContent = data.materials;
    detailOverlay.querySelector('[data-project-text="lighting"]').textContent = data.lighting;

    detailHero.className = 'gradient-scene ' + data.heroClass;

    // Swap all five per-project photographs (hero + masterplan/materials/
    // lighting/final). Each replays its own fade-in via swapScenePhoto so
    // nothing stays visible from a previously opened project; an empty
    // field just leaves the tonal gradient showing, same as before.
    swapScenePhoto(detailHeroPhoto, data.heroPhoto, data.heroAlt);
    swapScenePhoto(detailMasterplanPhoto, data.masterplanPhoto, data.title + ' — мастер-план');
    swapScenePhoto(detailMaterialsPhoto, data.materialsPhoto, data.title + ' — материалы');
    swapScenePhoto(detailLightingPhoto, data.lightingPhoto, data.title + ' — освещение');
    swapScenePhoto(detailFinalPhoto, data.finalPhoto, data.title + ' — вид на закате');

    detailOverlay.classList.add('is-open');
    detailOverlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    detailOverlay.querySelector('.project-detail__scroll').scrollTop = 0;

    // The overlay sits at visibility:hidden until opened, so its
    // [data-reveal] / [data-reveal-media] children never crossed the
    // IntersectionObserver's viewport threshold on initial page load and
    // would otherwise stay stuck at opacity:0 forever. This is a
    // full-screen takeover, not a scrolled reveal, so show its content
    // immediately rather than waiting on scroll-triggered observation.
    detailOverlay.querySelectorAll('[data-reveal], [data-reveal-media]').forEach((el) => {
      el.classList.add('is-visible');
    });
  }

  function closeProject() {
    detailOverlay.classList.remove('is-open');
    detailOverlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (lastFocusedTrigger) lastFocusedTrigger.focus();
  }

  document.querySelectorAll('[data-open-project]').forEach((btn) => {
    btn.addEventListener('click', () => {
      lastFocusedTrigger = btn;
      openProject(btn.dataset.openProject);
    });
  });
  document.querySelectorAll('[data-close-project]').forEach((btn) => {
    btn.addEventListener('click', closeProject);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && detailOverlay.classList.contains('is-open')) closeProject();
  });

  /* ==================================================================
     FAQ — Glass Accordion
     Trigger: click on trigger button
     Delay: 0
     Duration: .6s (grid-template-rows transition, defined in CSS)
     Easing: ease-architectural
     GPU Optimization: grid-template-rows is not a compositor-only
       property (triggers layout), but the animated element is a
       single lightweight text block, so the layout cost per frame is
       negligible — chosen over max-height because it animates to an
       intrinsic "auto" height without needing a hardcoded cap.
     Purpose: only one panel open at a time keeps the list reading as
       a single considered document rather than a scattered FAQ widget.
  ================================================================== */
  document.querySelectorAll('[data-accordion]').forEach((item) => {
    const trigger = item.querySelector('[data-accordion-trigger]');
    trigger.addEventListener('click', () => {
      const isOpen = item.classList.contains('is-open');
      document.querySelectorAll('[data-accordion].is-open').forEach((openItem) => {
        openItem.classList.remove('is-open');
        openItem.querySelector('[data-accordion-trigger]').setAttribute('aria-expanded', 'false');
      });
      if (!isOpen) {
        item.classList.add('is-open');
        trigger.setAttribute('aria-expanded', 'true');
      }
    });
  });

  /* ==================================================================
     OWNER STORIES CAROUSEL
     Trigger: arrow click, dot click, or swipe (touch)
     Delay: 0
     Duration: .9s slide transition (defined in CSS)
     Easing: ease-architectural
     GPU Optimization: transform: translateX on a flex track — a
       single compositor-friendly property animates the whole track
       rather than animating each slide's opacity individually.
     Purpose: a slow, deliberate slide (rather than a fast carousel
       swipe) keeps pace with the rest of the page's unhurried motion.
  ================================================================== */
  const track = document.querySelector('[data-carousel-track]');
  const slides = document.querySelectorAll('[data-carousel-slide]');
  const dotsWrap = document.querySelector('[data-carousel-dots]');
  const prevBtn = document.querySelector('[data-carousel-prev]');
  const nextBtn = document.querySelector('[data-carousel-next]');
  let currentSlide = 0;

  if (track && slides.length) {
    slides.forEach((_, i) => {
      const dot = document.createElement('button');
      dot.setAttribute('aria-label', `Показать историю ${i + 1}`);
      if (i === 0) dot.classList.add('is-active');
      dot.addEventListener('click', () => goToSlide(i));
      dotsWrap.appendChild(dot);
    });

    function goToSlide(i) {
      currentSlide = (i + slides.length) % slides.length;
      track.style.transform = `translateX(-${currentSlide * 100}%)`;
      dotsWrap.querySelectorAll('button').forEach((d, di) => {
        d.classList.toggle('is-active', di === currentSlide);
      });
    }

    prevBtn.addEventListener('click', () => goToSlide(currentSlide - 1));
    nextBtn.addEventListener('click', () => goToSlide(currentSlide + 1));

    /* touch swipe */
    let touchStartX = 0;
    track.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
    track.addEventListener('touchend', (e) => {
      const delta = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(delta) > 50) goToSlide(currentSlide + (delta < 0 ? 1 : -1));
    }, { passive: true });
  }

  /* ==================================================================
     CONTACT FORM — front-end only (no backend wired in this deliverable)
  ================================================================== */
  const contactForm = document.querySelector('.contact__form');
  if (contactForm) {
    contactForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const btn = contactForm.querySelector('button[type="submit"] span');
      const original = btn.textContent;
      btn.textContent = 'Отправлено';
      contactForm.reset();
      setTimeout(() => { btn.textContent = original; }, 2600);
    });
  }

  /* ==================================================================
     SMOOTH ANCHOR SCROLL — Smooth Page Transition
     Trigger: click on in-page anchor link
     Duration: native smooth scroll (html { scroll-behavior: smooth })
     Purpose: keeps section jumps feeling like continuous movement
       through the site rather than an abrupt cut, consistent with the
       "walking the grounds" narrative; offset accounts for fixed nav.
  ================================================================== */
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (e) => {
      const id = link.getAttribute('href');
      if (id.length <= 1) return;
      const target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      const navH = document.querySelector('.nav').offsetHeight;
      const top = target.getBoundingClientRect().top + window.scrollY - navH + 1;
      window.scrollTo({ top, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
      closeMobileMenu();
    });
  });

})();
