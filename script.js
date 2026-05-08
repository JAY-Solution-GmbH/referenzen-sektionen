(function () {
    'use strict';

    var STAGGER_MS = 180;

    /* =================================================================
     *  IFRAME-MANAGEMENT – SEQUENTIELLE WARTESCHLANGE
     *
     *  Das Problem: Wenn mehrere iframes gleichzeitig laden,
     *  wird der Mobile-Browser überfordert → Freeze.
     *
     *  Lösung: Iframes werden in einer FIFO-Queue nacheinander
     *  geladen. Nur EINER lädt gleichzeitig. Erst wenn er fertig
     *  ist (load-Event), startet der nächste.
     *
     *  Einmal geladen bleiben iframes im DOM – contain: layout paint
     *  in CSS sorgt dafür, dass off-screen iframes kein Rendering
     *  verursachen.
     * ================================================================= */

    var offscreenRoot = null;
    var loadQueue = [];       // Warteschlange: [container, container, ...]
    var isLoading = false;    // Lädt gerade ein iframe?

    function getOffscreenRoot() {
        if (offscreenRoot && document.body.contains(offscreenRoot)) {
            return offscreenRoot;
        }
        var el = document.createElement('div');
        el.id = 'offscreen-iframe-root';
        el.style.cssText = 'position:fixed;top:-10000px;left:-10000px;width:1px;height:1px;overflow:hidden;';
        document.body.appendChild(el);
        offscreenRoot = el;
        return el;
    }

    /**
     * Fügt einen Container in die Warteschlange ein
     */
    function enqueueIframe(container) {
        if (container._iframeDone || container._iframeQueued) return;
        container._iframeQueued = true;
        loadQueue.push(container);
        processQueue();
    }

    /**
     * Verarbeitet die Warteschlange – lädt den nächsten iframe
     * (nur wenn gerade keiner lädt)
     */
    function processQueue() {
        if (isLoading || loadQueue.length === 0) return;

        var container = loadQueue.shift();

        // Falls schon geladen (z.B. durch doppelten Trigger), weiter
        if (container._iframeDone) {
            processQueue();
            return;
        }

        isLoading = true;
        container._iframeDone = true;

        var mount = container.querySelector('.cs-iframe-mount');
        var src = mount.getAttribute('data-src');
        var title = mount.getAttribute('data-title') || '';
        var placeholder = container.querySelector('.cs-iframe-placeholder');

        // iframe erstellen
        var iframe = document.createElement('iframe');
        iframe.setAttribute('title', title);
        iframe.setAttribute('loading', 'eager');
        iframe.setAttribute('fetchpriority', 'high');
        iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts allow-forms allow-popups');
        iframe.setAttribute('allow', 'fullscreen');
        iframe.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');

        // Offscreen einhängen
        var root = getOffscreenRoot();
        root.appendChild(iframe);

        var done = false;
        function onReady() {
            if (done) return;
            done = true;

            // Scroll-Position merken
            var scrollY = window.scrollY;
            var topBefore = container.getBoundingClientRect().top;

            // In den sichtbaren Mount verschieben
            if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
            mount.appendChild(iframe);

            // Placeholder ausblenden
            if (placeholder) placeholder.classList.add('is-loaded');

            // Scroll-Korrektur
            var topAfter = container.getBoundingClientRect().top;
            var drift = topAfter - topBefore;
            if (Math.abs(drift) > 2) {
                window.scrollTo(window.scrollX, scrollY + drift);
            }

            // Queue weiter verarbeiten – mit kurzer Verzögerung
            // damit der Browser zwischen zwei Loads kurz atmen kann
            isLoading = false;
            setTimeout(processQueue, 300);
        }

        iframe.addEventListener('load', onReady);
        setTimeout(onReady, 15000); // Fallback

        // Laden starten
        iframe.src = src;
    }

    /**
     * IntersectionObserver – reiht sichtbare Container in die Queue ein
     */
    function initIframes() {
        var containers = document.querySelectorAll('.cs-preview-full');
        if (!containers.length) return;

        if (!('IntersectionObserver' in window)) {
            enqueueIframe(containers[0]);
            return;
        }

        containers.forEach(function (container) {
            var obs = new IntersectionObserver(function (entries) {
                for (var i = 0; i < entries.length; i++) {
                    if (entries[i].isIntersecting) {
                        enqueueIframe(container);
                        obs.disconnect();
                        break;
                    }
                }
            }, {
                threshold: 0,
                rootMargin: '200px 0px 200px 0px'
            });
            obs.observe(container);
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

        var animObs = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                var el = entry.target;
                var index = parseInt(el.dataset.index, 10) || 0;
                setTimeout(function () {
                    el.classList.remove('js-ready');
                    el.classList.add('is-visible');
                }, index * STAGGER_MS);
                animObs.unobserve(el);
            });
        }, {
            threshold: 0.05,
            rootMargin: '0px 0px -60px 0px'
        });

        elements.forEach(function (el) {
            animObs.observe(el);
        });
    }


    /* =================================================================
     *  INIT
     * ================================================================= */

    function init() {
        initAnimations();
        initIframes();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
