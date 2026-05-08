(function () {
    'use strict';

    var STAGGER_MS = 180;

    /* =================================================================
     *  GERÄTE-ERKENNUNG
     *  Prüft ob die Mobile-CSS-Regeln aktiv sind (display des Link-Buttons)
     * ================================================================= */

    function isMobileView() {
        // Primär: CSS-Breakpoint
        if (window.matchMedia('(max-width: 900px)').matches) return true;
        // Sekundär: Prüfe ob der erste Mobile-Link sichtbar ist (CSS display: flex)
        var link = document.querySelector('.cs-mobile-link');
        if (link && getComputedStyle(link).display !== 'none') return true;
        return false;
    }

    /* =================================================================
     *  IFRAME-MANAGEMENT (nur Desktop)
     *
     *  Auf Mobile werden keine iframes geladen – stattdessen zeigt
     *  CSS einen Link-Button an. Das eliminiert ALLE Performance-
     *  Probleme auf Mobilgeräten.
     *
     *  Auf Desktop: IntersectionObserver lädt/entlädt iframes
     *  automatisch, max. 2 gleichzeitig aktiv.
     * ================================================================= */

    var MAX_ACTIVE = 2;
    var activeContainers = [];

    function loadIframe(container) {
        if (container.querySelector('iframe')) return;

        var placeholder = container.querySelector('.cs-iframe-placeholder');
        if (!placeholder) return;

        var src   = placeholder.getAttribute('data-src');
        var title = placeholder.getAttribute('data-title') || '';

        placeholder.classList.add('is-loading');

        // Ältesten entladen wenn Limit erreicht
        while (activeContainers.length >= MAX_ACTIVE) {
            var oldest = activeContainers.shift();
            if (oldest !== container) {
                unloadIframe(oldest);
            }
        }

        var iframe = document.createElement('iframe');
        iframe.setAttribute('title', title);
        iframe.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
        iframe.setAttribute('loading', 'lazy');

        iframe.addEventListener('load', function () {
            placeholder.classList.remove('is-loading');
            placeholder.classList.add('is-loaded');
        });

        container.appendChild(iframe);

        // src separat setzen
        requestAnimationFrame(function () {
            iframe.setAttribute('src', src);
        });

        activeContainers.push(container);

        // Fallback-Timeout
        setTimeout(function () {
            if (placeholder.parentNode) {
                placeholder.classList.remove('is-loading');
                placeholder.classList.add('is-loaded');
            }
        }, 12000);
    }

    function unloadIframe(container) {
        var iframe = container.querySelector('iframe');
        if (!iframe) return;

        iframe.removeAttribute('src');
        iframe.parentNode.removeChild(iframe);

        var placeholder = container.querySelector('.cs-iframe-placeholder');
        if (placeholder) {
            placeholder.classList.remove('is-loading', 'is-loaded');
        }

        var idx = activeContainers.indexOf(container);
        if (idx > -1) activeContainers.splice(idx, 1);
    }

    function initIframes() {
        // Auf Mobile: NICHTS tun – CSS zeigt Link-Buttons statt iframes
        if (isMobileView()) return;

        var allContainers = document.querySelectorAll('.cs-preview-full');
        if (!allContainers.length) return;

        if (!('IntersectionObserver' in window)) {
            loadIframe(allContainers[0]);
            return;
        }

        var observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    loadIframe(entry.target);
                } else {
                    unloadIframe(entry.target);
                }
            });
        }, {
            threshold: 0,
            rootMargin: '200px 0px 200px 0px'
        });

        allContainers.forEach(function (container) {
            observer.observe(container);
        });
    }


    /* =================================================================
     *  SCROLL-ANIMATIONEN
     * ================================================================= */

    function initAnimations() {
        var elements = document.querySelectorAll('.cs-animate');
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

        var animObs = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if (!entry.isIntersecting) return;

                var el = entry.target;
                var index = parseInt(el.dataset.index, 10) || 0;

                setTimeout(function() {
                    el.classList.remove('js-ready');
                    el.classList.add('is-visible');
                }, index * STAGGER_MS);

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
