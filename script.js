(function () {
    'use strict';

    var STAGGER_MS = 180;

    /* =================================================================
     *  IFRAME-MANAGEMENT
     *
     *  Kernprinzip (von digitalisierungshilfe.at übernommen):
     *  → Jeder iframe wird EINMAL geladen und NIE WIEDER entladen.
     *  → contain: layout paint (CSS) sorgt dafür, dass off-screen
     *    iframes kein Rendering verursachen.
     *  → Das Entladen war der Fehler – jedes Neu-Laden verursacht
     *    den Freeze.
     *
     *  Ablauf:
     *  1. IntersectionObserver erkennt dass Container sichtbar wird
     *  2. iframe wird im unsichtbaren offscreen-Container erstellt
     *  3. Nach dem load-Event wird iframe in den sichtbaren Bereich
     *     verschoben → Placeholder blendet aus
     *  4. Observer wird für diesen Container disconnected → fertig
     * ================================================================= */

    var offscreenRoot = null;

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

    function loadIframe(container) {
        var mount = container.querySelector('.cs-iframe-mount');
        if (!mount || container._iframeDone) return;

        var src = mount.getAttribute('data-src');
        var title = mount.getAttribute('data-title') || '';
        if (!src) return;

        container._iframeDone = true; // Nur einmal laden – nie wieder

        var placeholder = container.querySelector('.cs-iframe-placeholder');

        // iframe erstellen
        var iframe = document.createElement('iframe');
        iframe.setAttribute('title', title);
        iframe.setAttribute('loading', 'eager');
        iframe.setAttribute('fetchpriority', 'high');
        iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts allow-forms allow-popups');
        iframe.setAttribute('allow', 'fullscreen');
        iframe.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');

        // Zuerst offscreen laden
        var root = getOffscreenRoot();
        root.appendChild(iframe);

        var moved = false;
        function moveToVisible() {
            if (moved) return;
            moved = true;

            // Scroll-Position VOR dem Verschieben merken
            var scrollY = window.scrollY;
            var topBefore = container.getBoundingClientRect().top;

            // iframe in den sichtbaren Mount verschieben
            if (iframe.parentNode) {
                iframe.parentNode.removeChild(iframe);
            }
            mount.appendChild(iframe);

            // Placeholder ausblenden
            if (placeholder) {
                placeholder.classList.add('is-loaded');
            }

            // Scroll-Korrektur falls sich die Position verändert hat
            var topAfter = container.getBoundingClientRect().top;
            var drift = topAfter - topBefore;
            if (Math.abs(drift) > 2) {
                window.scrollTo(window.scrollX, scrollY + drift);
            }
        }

        iframe.addEventListener('load', moveToVisible);

        // Fallback nach 15 Sekunden
        setTimeout(moveToVisible, 15000);

        // Laden starten
        iframe.src = src;
    }

    function initIframes() {
        var containers = document.querySelectorAll('.cs-preview-full');
        if (!containers.length) return;

        if (!('IntersectionObserver' in window)) {
            loadIframe(containers[0]);
            return;
        }

        containers.forEach(function (container) {
            // EIGENER Observer pro Container – wird nach erstem Trigger disconnected
            var obs = new IntersectionObserver(function (entries) {
                for (var i = 0; i < entries.length; i++) {
                    if (entries[i].isIntersecting) {
                        loadIframe(container);
                        obs.disconnect(); // Nie wieder beobachten
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
