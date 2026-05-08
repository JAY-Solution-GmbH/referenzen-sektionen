(function () {
    'use strict';

    var STAGGER_MS = 180;

    /* =================================================================
     *  IFRAME-MANAGEMENT
     *  - Automatisches Laden wenn sichtbar (Desktop + Mobile)
     *  - Mobile:  Max. 1 iframe gleichzeitig im DOM
     *  - Desktop: Max. 2 iframes gleichzeitig im DOM
     *  - Entladen sobald Container aus dem erweiterten Viewport scrollt
     * ================================================================= */

    var isMobile = window.matchMedia('(max-width: 900px)').matches
                || ('ontouchstart' in window);

    var MAX_ACTIVE = isMobile ? 1 : 2;

    // Alle Vorschau-Container in Reihenfolge
    var allContainers = [];
    // Aktuell aktive (geladene) Container – als Array für FIFO-Verwaltung
    var activeContainers = [];

    /**
     * Erstellt den iframe im Container
     */
    function loadIframe(container) {
        // Bereits geladen?
        if (container.querySelector('iframe')) return;

        var placeholder = container.querySelector('.cs-iframe-placeholder');
        if (!placeholder) return;

        var src   = placeholder.getAttribute('data-src');
        var title = placeholder.getAttribute('data-title') || '';

        // Lade-Spinner anzeigen
        placeholder.classList.add('is-loading');

        // Wenn wir das Limit überschreiten: ältesten iframe entladen
        while (activeContainers.length >= MAX_ACTIVE) {
            var oldest = activeContainers.shift();
            if (oldest !== container) {
                unloadIframe(oldest);
            }
        }

        var iframe = document.createElement('iframe');
        iframe.setAttribute('src', src);
        iframe.setAttribute('title', title);
        iframe.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');

        // sandbox: erlaubt Skripte und same-origin, blockiert aber Popups etc.
        iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');

        // Wenn iframe fertig geladen: Placeholder ausblenden (nicht entfernen – brauchen wir zum Wiederherstellen)
        iframe.addEventListener('load', function () {
            placeholder.classList.remove('is-loading');
            placeholder.classList.add('is-loaded');
        });

        // Timeout-Fallback: nach 10 Sek. auch ohne load-Event
        setTimeout(function () {
            placeholder.classList.remove('is-loading');
            placeholder.classList.add('is-loaded');
        }, 10000);

        container.appendChild(iframe);
        activeContainers.push(container);
    }

    /**
     * Entfernt den iframe und zeigt den Placeholder wieder
     */
    function unloadIframe(container) {
        var iframe = container.querySelector('iframe');
        if (!iframe) return;

        // iframe komplett aus DOM entfernen → Browser gibt Speicher + GPU frei
        container.removeChild(iframe);

        // Placeholder wieder sichtbar machen
        var placeholder = container.querySelector('.cs-iframe-placeholder');
        if (placeholder) {
            placeholder.classList.remove('is-loading', 'is-loaded');
        }

        // Aus aktiv-Liste entfernen
        var idx = activeContainers.indexOf(container);
        if (idx > -1) activeContainers.splice(idx, 1);
    }

    /**
     * Initialisiert das automatische Iframe-Management
     */
    function initIframes() {
        allContainers = Array.prototype.slice.call(
            document.querySelectorAll('.cs-preview-full')
        );
        if (!allContainers.length) return;

        if (!('IntersectionObserver' in window)) {
            // Fallback ohne IO: nur ersten laden
            loadIframe(allContainers[0]);
            return;
        }

        // rootMargin: auf Mobile enger (weniger pre-loading), auf Desktop etwas großzügiger
        var margin = isMobile ? '0px 0px 0px 0px' : '300px 0px 300px 0px';

        var observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    // Container kommt in den (erweiterten) Viewport → laden
                    loadIframe(entry.target);
                } else {
                    // Container verlässt den Viewport komplett → entladen
                    unloadIframe(entry.target);
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
     *  SCROLL-ANIMATIONEN (unveränderter Kern)
     * ================================================================= */

    function initSection(section) {
        var elements = section.querySelectorAll('.cs-animate');
        if (!elements.length) return;

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

        elements.forEach(function(el) {
            var index = parseInt(el.dataset.index, 10) || 0;
            var obs = new IntersectionObserver(function(entries) {
                entries.forEach(function(entry) {
                    if (!entry.isIntersecting) return;
                    setTimeout(function() {
                        el.classList.remove('js-ready');
                        el.classList.add('is-visible');
                    }, index * STAGGER_MS);
                    obs.unobserve(el);
                });
            }, {
                threshold: 0.05,
                rootMargin: '0px 0px -60px 0px'
            });
            obs.observe(el);
        });
    }

    function init() {
        // Scroll-Animationen
        var sections = document.querySelectorAll('.cs-section');
        if (sections.length) {
            sections.forEach(function(section) {
                initSection(section);
            });
        }

        // Iframe-Management
        initIframes();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
