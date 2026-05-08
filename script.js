(function () {
    'use strict';

    var STAGGER_MS = 180;

    /* =================================================================
     *  RENDERING-PERFORMANCE
     *
     *  Problem: 4 Webflow-Websites laufen in iframes gleichzeitig –
     *  jede mit eigenem JS, CSS-Animationen, Cookie-Banners etc.
     *  Das überfordert die GPU und den Main Thread.
     *
     *  Lösung:
     *  1. VIEWPORT-FREEZE: Off-screen iframes → display:none
     *     (stoppt Rendering, JS-rAF, CSS-Animationen komplett)
     *  2. SCROLL-FREEZE: Während Scroll → pointer-events:none
     *     (verhindert Touch-Event-Verarbeitung in iframes)
     *  3. Iframes laden erst per IO wenn sie in Viewport-Nähe kommen
     * ================================================================= */

    var loadedIframes = new Set();  // Tracking welche iframes fertig geladen sind

    /* ─── Scroll-Freeze ─── */

    var scrollTimer = null;

    function initScrollFreeze() {
        var root = document.documentElement;

        function onScroll() {
            root.classList.add('is-scrolling');
            clearTimeout(scrollTimer);
            scrollTimer = setTimeout(function () {
                root.classList.remove('is-scrolling');
            }, 150);
        }

        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('touchmove', onScroll, { passive: true });
    }

    /* ─── Iframe Loading (sequential + IO-triggered) ─── */

    var loadQueue = [];
    var isLoading = false;

    function enqueue(container) {
        if (container._queued) return;
        container._queued = true;
        loadQueue.push(container);
        processQueue();
    }

    function processQueue() {
        if (isLoading || loadQueue.length === 0) return;
        isLoading = true;

        var container = loadQueue.shift();
        var iframe = container.querySelector('iframe');
        if (!iframe) { isLoading = false; processQueue(); return; }

        var src = iframe.getAttribute('data-src');
        if (!src) { isLoading = false; processQueue(); return; }

        // Load-Event: markiere als geladen, starte nächsten
        iframe.addEventListener('load', function () {
            loadedIframes.add(iframe);
            isLoading = false;
            // Kurze Pause damit der Browser atmen kann
            setTimeout(processQueue, 500);
        }, { once: true });

        // Fallback nach 20s
        setTimeout(function () {
            if (isLoading) {
                loadedIframes.add(iframe);
                isLoading = false;
                processQueue();
            }
        }, 20000);

        // src setzen → Laden beginnt
        iframe.src = src;
    }

    function initIframeLoading() {
        var containers = document.querySelectorAll('.cs-preview-wrap');
        if (!containers.length || !('IntersectionObserver' in window)) return;

        containers.forEach(function (container) {
            var obs = new IntersectionObserver(function (entries) {
                if (entries[0].isIntersecting) {
                    enqueue(container);
                    obs.disconnect();
                }
            }, {
                threshold: 0,
                rootMargin: '300px 0px 300px 0px'
            });
            obs.observe(container);
        });
    }

    /* ─── Viewport-Freeze ─── */

    function initViewportFreeze() {
        var containers = document.querySelectorAll('.cs-preview-wrap');
        if (!containers.length || !('IntersectionObserver' in window)) return;

        var obs = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                var iframe = entry.target.querySelector('iframe');
                if (!iframe) return;

                if (entry.isIntersecting) {
                    // Container in der Nähe → iframe aufwecken
                    iframe.classList.remove('is-frozen');
                } else {
                    // Container weit weg → iframe einfrieren
                    // Nur wenn bereits geladen (Set-basiert, kein contentDocument)
                    if (loadedIframes.has(iframe)) {
                        iframe.classList.add('is-frozen');
                    }
                }
            });
        }, {
            threshold: 0,
            rootMargin: '600px 0px 600px 0px'
        });

        containers.forEach(function (c) {
            obs.observe(c);
        });
    }

    /* ─── Scroll-Animationen ─── */

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

    /* ─── Init ─── */

    function init() {
        initAnimations();
        initScrollFreeze();
        initIframeLoading();
        // Viewport-Freeze nach 3s starten (damit initiales Laden nicht blockiert wird)
        setTimeout(initViewportFreeze, 3000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
