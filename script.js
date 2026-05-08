(function () {
    'use strict';

    var STAGGER_MS = 180;

    /* =================================================================
     *  RENDERING-PERFORMANCE-MANAGEMENT
     *
     *  Das Problem war NIE das Laden – sondern das RENDERING.
     *  Auch nach dem Laden verursachen iframes laufend GPU-Compositing-
     *  Arbeit (CSS-Animationen, JS, Repaints in der geladenen Website).
     *
     *  Lösung: Zwei Mechanismen
     *
     *  1. SCROLL-FREEZE: Während der User scrollt, werden alle iframes
     *     auf pointer-events:none gesetzt. Das verhindert, dass
     *     Touch-Events in den iframes verarbeitet werden.
     *
     *  2. VIEWPORT-FREEZE: Iframes die weit vom Viewport entfernt sind,
     *     werden auf display:none gesetzt. Das STOPPT komplett:
     *     - Rendering/Compositing
     *     - CSS-Animationen
     *     - requestAnimationFrame
     *     OHNE den iframe aus dem DOM zu entfernen (= kein Reload nötig).
     *     Wenn der User zurückscrollt → display:block → sofort da.
     * ================================================================= */

    var body = document.body || document.documentElement;
    var allIframes = [];
    var scrollTimer = null;

    /**
     * Scroll-Freeze: pointer-events auf iframes deaktivieren
     * während des Scrollens
     */
    function initScrollFreeze() {
        function onScrollStart() {
            body.classList.add('is-scrolling');

            // Scroll-Ende erkennen (150ms ohne Scroll-Event)
            clearTimeout(scrollTimer);
            scrollTimer = setTimeout(function () {
                body.classList.remove('is-scrolling');
            }, 150);
        }

        window.addEventListener('scroll', onScrollStart, { passive: true });
        window.addEventListener('touchmove', onScrollStart, { passive: true });
    }

    /**
     * Viewport-Freeze: off-screen iframes auf display:none setzen
     */
    function initViewportFreeze() {
        allIframes = Array.prototype.slice.call(
            document.querySelectorAll('.cs-preview-wrap iframe')
        );
        if (!allIframes.length) return;

        if (!('IntersectionObserver' in window)) return;

        // Großzügiger Bereich: iframe wird erst frozen wenn er
        // 500px außerhalb des Viewports ist
        var obs = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                var iframe = entry.target;
                if (entry.isIntersecting) {
                    // In der Nähe des Viewports → aktivieren
                    iframe.classList.remove('is-frozen');
                } else {
                    // Weit weg → einfrieren (display:none)
                    iframe.classList.add('is-frozen');
                }
            });
        }, {
            threshold: 0,
            rootMargin: '500px 0px 500px 0px'
        });

        allIframes.forEach(function (iframe) {
            obs.observe(iframe);
        });
    }


    /* =================================================================
     *  SCROLL-ANIMATIONEN
     * ================================================================= */

    function initAnimations() {
        var elements = document.querySelectorAll('.cs-animate');
        if (!elements.length) return;

        elements.forEach(function (el) {
            el.classList.add('js-ready');
        });

        if (!('IntersectionObserver' in window)) {
            elements.forEach(function (el) {
                el.classList.remove('js-ready');
                el.classList.add('is-visible');
            });
            return;
        }

        var obs = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                var el = entry.target;
                var index = parseInt(el.dataset.index, 10) || 0;
                setTimeout(function () {
                    el.classList.remove('js-ready');
                    el.classList.add('is-visible');
                }, index * STAGGER_MS);
                obs.unobserve(el);
            });
        }, {
            threshold: 0.05,
            rootMargin: '0px 0px -60px 0px'
        });

        elements.forEach(function (el) {
            obs.observe(el);
        });
    }


    /* =================================================================
     *  INIT
     * ================================================================= */

    function init() {
        initAnimations();
        initScrollFreeze();

        // Viewport-Freeze leicht verzögert starten, damit iframes
        // die initial sichtbar sind nicht sofort frozen werden
        setTimeout(initViewportFreeze, 2000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
