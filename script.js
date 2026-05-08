(function () {
    'use strict';

    var STAGGER_MS = 180;

    /* =================================================================
     *  IFRAME-MANAGEMENT
     *  - Desktop:  Automatisch laden wenn sichtbar, entladen wenn nicht
     *  - Mobile:   Nur per Tap laden, max. 1 gleichzeitig aktiv
     * ================================================================= */

    var isMobile = window.matchMedia('(max-width: 900px)').matches
                || ('ontouchstart' in window);

    // Referenz auf den aktuell geladenen iframe-Container (Mobile: max. 1)
    var activeIframeContainer = null;

    /**
     * Erstellt den iframe im Container und entfernt den Placeholder
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

        var iframe = document.createElement('iframe');
        iframe.setAttribute('src', src);
        iframe.setAttribute('title', title);
        iframe.setAttribute('loading', 'lazy');
        iframe.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');

        // Wenn iframe fertig geladen: Placeholder entfernen
        iframe.addEventListener('load', function () {
            if (placeholder.parentNode) {
                placeholder.parentNode.removeChild(placeholder);
            }
        });

        // Timeout-Fallback: nach 8 Sek. Placeholder entfernen auch wenn load-Event nicht feuert
        setTimeout(function () {
            if (placeholder.parentNode) {
                placeholder.parentNode.removeChild(placeholder);
            }
        }, 8000);

        container.appendChild(iframe);
    }

    /**
     * Entfernt den iframe und stellt den Placeholder wieder her
     */
    function unloadIframe(container) {
        var iframe = container.querySelector('iframe');
        if (!iframe) return;

        var src   = iframe.getAttribute('src');
        var title = iframe.getAttribute('title') || '';

        // iframe aus DOM entfernen → Browser gibt Speicher frei
        iframe.parentNode.removeChild(iframe);

        // Placeholder neu aufbauen (falls nicht mehr vorhanden)
        if (!container.querySelector('.cs-iframe-placeholder')) {
            var placeholder = document.createElement('div');
            placeholder.className = 'cs-iframe-placeholder';
            placeholder.setAttribute('data-src', src);
            placeholder.setAttribute('data-title', title);
            placeholder.innerHTML =
                '<div class="cs-placeholder-content">' +
                    '<svg class="cs-placeholder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
                        '<rect x="2" y="3" width="20" height="14" rx="2"/>' +
                        '<line x1="8" y1="21" x2="16" y2="21"/>' +
                        '<line x1="12" y1="17" x2="12" y2="21"/>' +
                    '</svg>' +
                    '<span class="cs-placeholder-text">Vorschau laden</span>' +
                '</div>';

            // Tap-Handler erneut anhängen (Mobile)
            if (isMobile) {
                placeholder.addEventListener('click', function () {
                    handleMobileTap(container);
                });
            }

            container.appendChild(placeholder);
        }
    }

    /**
     * Mobile: Tap auf Placeholder → alten iframe entladen, neuen laden
     */
    function handleMobileTap(container) {
        // Vorherigen aktiven iframe entladen
        if (activeIframeContainer && activeIframeContainer !== container) {
            unloadIframe(activeIframeContainer);
        }
        activeIframeContainer = container;
        loadIframe(container);
    }

    /**
     * Initialisiert das Iframe-Management für alle Vorschau-Container
     */
    function initIframes() {
        var containers = document.querySelectorAll('.cs-preview-full');
        if (!containers.length) return;

        if (isMobile) {
            // ── Mobile: Nur per Tap laden ──
            containers.forEach(function (container) {
                var placeholder = container.querySelector('.cs-iframe-placeholder');
                if (placeholder) {
                    placeholder.addEventListener('click', function () {
                        handleMobileTap(container);
                    });
                }
            });

        } else {
            // ── Desktop: Automatisch via IntersectionObserver ──
            // Nur den sichtbaren iframe laden, Rest entladen
            if (!('IntersectionObserver' in window)) {
                // Fallback: Ersten iframe laden
                loadIframe(containers[0]);
                return;
            }

            var desktopObs = new IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                    if (entry.isIntersecting) {
                        loadIframe(entry.target);
                    } else {
                        // Nur entladen wenn er komplett aus dem Viewport ist
                        unloadIframe(entry.target);
                    }
                });
            }, {
                threshold: 0,
                rootMargin: '200px 0px 200px 0px' // Etwas früher laden für sanften Übergang
            });

            containers.forEach(function (container) {
                desktopObs.observe(container);
            });
        }
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
