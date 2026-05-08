(function () {
    'use strict';

    var STAGGER_MS = 180;

    /* =================================================================
     *  OFFSCREEN-IFRAME-PRERENDERING
     *
     *  Exakt der Ansatz des Konkurrenten (digitalisierungshilfe.at):
     *
     *  1. Ein versteckter Container (#offscreen-iframe-root) wird
     *     am body angehängt (fixed, top: -10000px).
     *
     *  2. Wenn eine Sektion in den Viewport scrollt, wird der iframe
     *     ZUERST in diesem unsichtbaren Container erstellt und geladen.
     *     → Der Browser rendert die externe Website komplett off-screen,
     *       OHNE den Main-Thread oder das sichtbare Layout zu belasten.
     *
     *  3. Erst wenn der iframe sein load-Event feuert (= fertig),
     *     wird er aus dem offscreen-Container in den sichtbaren
     *     Mount-Punkt verschoben. → Kein Ruckeln, kein Freeze.
     *
     *  4. Beim Wegscollen wird der iframe komplett entfernt.
     *
     *  5. Max 1 iframe auf Mobile, max 2 auf Desktop gleichzeitig.
     * ================================================================= */

    var isMobile = window.matchMedia('(max-width: 900px)').matches;
    var MAX_ACTIVE = isMobile ? 1 : 2;
    var activeSlots = []; // { container, iframe }
    var offscreenRoot = null;

    /**
     * Gibt den offscreen-Container zurück (erstellt ihn beim ersten Aufruf)
     */
    function getOffscreenRoot() {
        if (offscreenRoot && document.body.contains(offscreenRoot)) {
            return offscreenRoot;
        }
        var el = document.createElement('div');
        el.id = 'offscreen-iframe-root';
        el.style.position = 'fixed';
        el.style.top = '-10000px';
        el.style.left = '-10000px';
        el.style.width = '1px';
        el.style.height = '1px';
        el.style.overflow = 'hidden';
        document.body.appendChild(el);
        offscreenRoot = el;
        return el;
    }

    /**
     * Lädt einen iframe: erst offscreen, dann nach load in den sichtbaren Container
     */
    function loadIframe(container) {
        var mount = container.querySelector('.cs-iframe-mount');
        if (!mount || mount.querySelector('iframe') || container._loading) return;

        var src = mount.getAttribute('data-src');
        var title = mount.getAttribute('data-title') || '';
        if (!src) return;

        container._loading = true;

        // Scroll-Position merken (für Korrektur nach DOM-Verschiebung)
        var scrollBefore = container.getBoundingClientRect().top;

        // Ältesten entladen wenn Limit erreicht
        while (activeSlots.length >= MAX_ACTIVE) {
            var oldest = activeSlots.shift();
            unloadIframe(oldest.container);
        }

        // iframe erstellen
        var iframe = document.createElement('iframe');
        iframe.setAttribute('title', title);
        iframe.setAttribute('loading', 'eager');
        iframe.setAttribute('fetchpriority', 'high');
        iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts allow-forms allow-popups');
        iframe.setAttribute('allow', 'fullscreen');
        iframe.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');

        // Zuerst in den offscreen-Container einfügen
        var root = getOffscreenRoot();
        root.appendChild(iframe);

        // load-Handler: iframe vom offscreen-Container in den sichtbaren Mount verschieben
        var moved = false;
        function moveToVisible() {
            if (moved) return;
            moved = true;
            container._loading = false;

            // Aus offscreen entfernen und in den sichtbaren Mount einfügen
            if (iframe.parentNode === root) {
                root.removeChild(iframe);
            }
            mount.appendChild(iframe);

            // Placeholder ausblenden
            var placeholder = container.querySelector('.cs-iframe-placeholder');
            if (placeholder) {
                placeholder.classList.add('is-loaded');
            }

            // Scroll-Position korrigieren (verhindert Jump)
            var scrollAfter = container.getBoundingClientRect().top;
            var drift = scrollAfter - scrollBefore;
            if (Math.abs(drift) > 1) {
                window.scrollTo({
                    top: window.scrollY + drift,
                    left: window.scrollX
                });
            }

            activeSlots.push({ container: container, iframe: iframe });
        }

        iframe.addEventListener('load', moveToVisible);

        // Fallback: nach 15s trotzdem verschieben
        setTimeout(moveToVisible, 15000);

        // src setzen → Laden startet
        iframe.src = src;
    }

    /**
     * Entfernt iframe komplett aus dem DOM
     */
    function unloadIframe(container) {
        var mount = container.querySelector('.cs-iframe-mount');
        if (!mount) return;

        var iframe = mount.querySelector('iframe');
        if (iframe) {
            iframe.src = 'about:blank';
            mount.removeChild(iframe);
        }

        // Auch aus offscreen entfernen falls noch dort
        if (offscreenRoot) {
            var offscreenFrames = offscreenRoot.querySelectorAll('iframe');
            offscreenFrames.forEach(function (f) { f.remove(); });
        }

        container._loading = false;

        // Placeholder wieder einblenden
        var placeholder = container.querySelector('.cs-iframe-placeholder');
        if (placeholder) {
            placeholder.classList.remove('is-loaded');
        }

        // Aus activeSlots entfernen
        activeSlots = activeSlots.filter(function (s) {
            return s.container !== container;
        });
    }

    /**
     * IntersectionObserver für automatisches Laden/Entladen
     */
    function initIframes() {
        var containers = document.querySelectorAll('.cs-preview-full');
        if (!containers.length) return;

        if (!('IntersectionObserver' in window)) {
            loadIframe(containers[0]);
            return;
        }

        var margin = isMobile ? '100px 0px 100px 0px' : '300px 0px 300px 0px';

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
            rootMargin: margin
        });

        containers.forEach(function (c) {
            observer.observe(c);
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
