(function () {
    'use strict';

    var STAGGER_MS = 180;

    /* =================================================================
     *  PERFORMANCE-ERKENNUNG
     * ================================================================= */

    var isMobile = window.matchMedia('(max-width: 900px)').matches;
    var isTouch  = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    var isMobileDevice = isMobile || isTouch;

    /* =================================================================
     *  IFRAME-MANAGEMENT
     *
     *  Kernprinzip: Niemals den Main-Thread während des Scrollens blockieren.
     *
     *  1. Iframes laden automatisch via IntersectionObserver
     *  2. Laden/Entladen wird via requestIdleCallback / setTimeout
     *     vom Scroll-Event entkoppelt (non-blocking)
     *  3. Mobile: Strikt max. 1 iframe im DOM
     *  4. Desktop: Max. 2 iframes im DOM
     *  5. content-visibility: auto auf den Containern (CSS) reduziert
     *     Rendering-Last für off-screen Sektionen
     * ================================================================= */

    var MAX_ACTIVE = isMobileDevice ? 1 : 2;

    // Aktuell aktive (geladene) Container – FIFO
    var activeContainers = [];

    // requestIdleCallback Polyfill für Safari
    var scheduleIdle = window.requestIdleCallback || function (cb) {
        return setTimeout(cb, 1);
    };

    /**
     * Erstellt den iframe – wird NICHT direkt im IO-Callback aufgerufen,
     * sondern via scheduleIdle, damit der Main-Thread frei bleibt.
     */
    function loadIframe(container) {
        // Bereits geladen oder gerade am Laden?
        if (container._iframeLoading || container.querySelector('iframe')) return;
        container._iframeLoading = true;

        var placeholder = container.querySelector('.cs-iframe-placeholder');
        if (!placeholder) { container._iframeLoading = false; return; }

        var src   = placeholder.getAttribute('data-src');
        var title = placeholder.getAttribute('data-title') || '';

        // Lade-Spinner anzeigen
        placeholder.classList.add('is-loading');

        // Wenn wir das Limit überschreiten: ältesten entladen
        while (activeContainers.length >= MAX_ACTIVE) {
            var oldest = activeContainers.shift();
            if (oldest !== container) {
                unloadIframeSync(oldest);
            }
        }

        var iframe = document.createElement('iframe');
        iframe.setAttribute('title', title);
        iframe.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
        // sandbox: erlaubt Skripte & Same-Origin, aber blockiert
        // Popups, Downloads, Top-Navigation → weniger Main-Thread-Belastung
        iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
        // Wichtig: loading="lazy" als zusätzliche Browser-Hilfe
        iframe.setAttribute('loading', 'lazy');

        // Event: iframe fertig geladen → Placeholder ausblenden
        iframe.addEventListener('load', function () {
            container._iframeLoading = false;
            placeholder.classList.remove('is-loading');
            placeholder.classList.add('is-loaded');
        });

        // Erst in DOM einfügen, DANN src setzen (vermeidet synchrones Laden)
        container.appendChild(iframe);

        // src in eigenem Microtask setzen → Main Thread bleibt frei
        requestAnimationFrame(function () {
            iframe.setAttribute('src', src);
        });

        activeContainers.push(container);

        // Timeout-Fallback: nach 12 Sek. Placeholder ausblenden
        setTimeout(function () {
            container._iframeLoading = false;
            if (placeholder.parentNode) {
                placeholder.classList.remove('is-loading');
                placeholder.classList.add('is-loaded');
            }
        }, 12000);
    }

    /**
     * Entfernt iframe synchron (für FIFO-Eviction)
     */
    function unloadIframeSync(container) {
        var iframe = container.querySelector('iframe');
        if (!iframe) return;

        // src leeren bevor wir entfernen → stoppt laufende Netzwerk-Requests
        iframe.removeAttribute('src');
        iframe.parentNode.removeChild(iframe);

        container._iframeLoading = false;

        // Placeholder zurücksetzen
        var placeholder = container.querySelector('.cs-iframe-placeholder');
        if (placeholder) {
            placeholder.classList.remove('is-loading', 'is-loaded');
        }

        // Aus aktiv-Liste entfernen
        var idx = activeContainers.indexOf(container);
        if (idx > -1) activeContainers.splice(idx, 1);
    }

    /**
     * Entfernt iframe non-blocking (für IO-Callback)
     */
    function unloadIframe(container) {
        scheduleIdle(function () {
            unloadIframeSync(container);
        });
    }

    /**
     * Initialisiert das Iframe-Management
     */
    function initIframes() {
        var allContainers = document.querySelectorAll('.cs-preview-full');
        if (!allContainers.length) return;

        if (!('IntersectionObserver' in window)) {
            loadIframe(allContainers[0]);
            return;
        }

        // Mobile: rootMargin 0 → erst laden wenn wirklich sichtbar
        // Desktop: 200px Vorlauf für sanfteren Übergang
        var margin = isMobileDevice ? '0px 0px 0px 0px' : '200px 0px 200px 0px';

        var observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                var container = entry.target;

                if (entry.isIntersecting) {
                    // Non-blocking laden: im nächsten Idle-Frame
                    scheduleIdle(function () {
                        loadIframe(container);
                    });
                } else {
                    // Non-blocking entladen
                    unloadIframe(container);
                }
            });
        }, {
            threshold: 0,
            rootMargin: margin
        });

        allContainers.forEach(function (container) {
            observer.observe(container);
        });
    }


    /* =================================================================
     *  SCROLL-ANIMATIONEN
     *  Optimiert: Ein einziger IntersectionObserver für alle Elemente
     * ================================================================= */

    function initAnimations() {
        var elements = document.querySelectorAll('.cs-animate');
        if (!elements.length) return;

        // js-ready auf alle setzen (Startzustand)
        elements.forEach(function(el) {
            el.classList.add('js-ready');
        });

        if (!('IntersectionObserver' in window)) {
            elements.forEach(function(el) {
                el.classList.remove('js-ready');
                el.classList.add('is-visible');
            });
            return;
        }

        // EIN einziger Observer für alle Elemente (statt n Observers)
        var animObs = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if (!entry.isIntersecting) return;

                var el = entry.target;
                var index = parseInt(el.dataset.index, 10) || 0;

                // Animation im nächsten Frame schedulen (nicht im IO-Callback)
                requestAnimationFrame(function () {
                    setTimeout(function() {
                        el.classList.remove('js-ready');
                        el.classList.add('is-visible');
                    }, index * STAGGER_MS);
                });

                animObs.unobserve(el);
            });
        }, {
            threshold: 0.05,
            rootMargin: '0px 0px -60px 0px'
        });

        elements.forEach(function(el) {
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
