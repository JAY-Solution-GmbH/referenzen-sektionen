(function () {
    'use strict';

    var STAGGER_MS = 180;

    /* =================================================================
     *  KONKURRENZ-EXAKT: iframe-Management
     *
     *  Reverse-engineered von digitalisierungshilfe.at/fallstudien
     *
     *  Kernmechaniken:
     *  1. Globale Semaphore: max. 3 gleichzeitige Loads
     *  2. Warteschlange für überschüssige Load-Anfragen
     *  3. Zweistufiges Laden: direkt → Fallback offscreen
     *  4. touchAction: "pan-x pan-y" auf Mobile (verhindert Scroll-Freeze)
     *  5. Continuous blur() während der ersten 600ms (verhindert Focus-Stealing)
     *  6. iframe startet mit opacity:0, wird nach load auf opacity:1 gesetzt
     *  7. Scroll-Position-Korrektur nach iframe-Insertion
     * ================================================================= */

    var MAX_CONCURRENT = 3;
    var activeCount = 0;
    var waitQueue = [];

    var isMobile = !window.matchMedia('(min-width: 1024px)').matches;

    /**
     * Semaphore: Wartet bis ein Slot frei ist
     */
    function acquireSlot(callback) {
        if (activeCount < MAX_CONCURRENT) {
            activeCount++;
            callback();
        } else {
            waitQueue.push(function () {
                activeCount++;
                callback();
            });
        }
    }

    /**
     * Slot freigeben und nächsten aus der Queue starten
     */
    function releaseSlot() {
        activeCount = Math.max(0, activeCount - 1);
        var next = waitQueue.shift();
        if (next) next();
    }

    /**
     * Offscreen-Container (nur als Fallback)
     */
    var offscreenRoot = null;
    function getOffscreenRoot() {
        if (offscreenRoot && document.body.contains(offscreenRoot)) return offscreenRoot;
        var el = document.createElement('div');
        el.id = 'offscreen-iframe-root';
        el.style.cssText = 'position:fixed;top:-10000px;left:-10000px;width:1px;height:1px;overflow:hidden;';
        document.body.appendChild(el);
        offscreenRoot = el;
        return el;
    }

    /**
     * Verhindert Focus-Stealing: blur() den iframe für 600ms
     */
    function keepBlurred(iframe) {
        var start = performance.now();
        function step() {
            try { iframe.blur(); } catch (e) {}
            if (performance.now() - start < 600) {
                requestAnimationFrame(step);
            }
        }
        requestAnimationFrame(step);
    }

    /**
     * Styling des iframes je nach Modus (Mobile/Desktop)
     */
    function applyIframeStyle(iframe, container) {
        if (isMobile) {
            // Mobile: Kein Transform, native Größe, touch-action erlaubt scrollen
            iframe.style.transform = '';
            iframe.style.transformOrigin = '';
            iframe.style.width = '100%';
            iframe.style.height = '100%';
            iframe.style.touchAction = 'pan-x pan-y';
        } else {
            // Desktop: Skalierung auf Container-Breite
            var baseW = 1280;
            var baseH = 800;
            var containerW = container.clientWidth || baseW;
            var scale = Math.min(1, containerW / baseW);
            iframe.style.width = baseW + 'px';
            iframe.style.height = baseH + 'px';
            iframe.style.transform = 'scale(' + scale + ')';
            iframe.style.transformOrigin = 'top left';
            iframe.style.touchAction = '';
        }
    }

    /**
     * Haupt-Ladefunktion für einen Container
     */
    function loadContainer(container) {
        if (container._done) return;
        container._done = true;

        var mount = container.querySelector('.cs-iframe-mount');
        var placeholder = container.querySelector('.cs-iframe-placeholder');
        var src = mount.getAttribute('data-src');
        var title = mount.getAttribute('data-title') || '';
        var slotReleased = false;

        function doRelease() {
            if (!slotReleased) {
                slotReleased = true;
                releaseSlot();
            }
        }

        acquireSlot(function () {
            // Scroll-Position merken
            var topBefore = null;
            try {
                topBefore = container.getBoundingClientRect().top;
            } catch (e) {}

            // ── Stufe 1: Direkt im Container laden ──

            var iframe = document.createElement('iframe');
            iframe.setAttribute('title', title);
            iframe.setAttribute('loading', 'eager');
            iframe.setAttribute('fetchpriority', 'high');
            iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts allow-forms allow-popups');
            iframe.setAttribute('allow', 'fullscreen; autoplay; encrypted-media');
            iframe.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
            iframe.tabIndex = -1;

            // Startzustand: unsichtbar
            iframe.style.cssText = 'position:absolute;inset:0;border:0;display:block;opacity:0;pointer-events:none;will-change:opacity;background:transparent;width:100%;height:100%;';

            keepBlurred(iframe);

            var succeeded = false;
            var fallbackTimer = null;

            // Korrektur der Scroll-Position
            function correctScroll() {
                try {
                    if (topBefore !== null) {
                        var topAfter = container.getBoundingClientRect().top;
                        var drift = topAfter - topBefore;
                        if (Math.abs(drift) > 1) {
                            window.scrollTo({
                                top: window.scrollY + drift,
                                left: window.scrollX,
                                behavior: 'auto'
                            });
                        }
                    }
                } catch (e) {}
            }

            // Erfolg: iframe sichtbar machen
            function onSuccess(iframeEl) {
                if (succeeded) return;
                succeeded = true;
                if (fallbackTimer) clearTimeout(fallbackTimer);

                applyIframeStyle(iframeEl, container);
                iframeEl.style.opacity = '1';
                iframeEl.style.pointerEvents = 'auto';

                if (placeholder) placeholder.classList.add('is-loaded');

                correctScroll();
                doRelease();
            }

            // Fallback: Offscreen-Container versuchen
            function onFallback() {
                if (succeeded) return;

                var root = getOffscreenRoot();
                var fb = document.createElement('iframe');
                fb.setAttribute('title', title);
                fb.setAttribute('loading', 'eager');
                fb.setAttribute('fetchpriority', 'high');
                fb.setAttribute('sandbox', 'allow-same-origin allow-scripts allow-forms allow-popups');
                fb.setAttribute('allow', 'fullscreen; autoplay; encrypted-media');
                fb.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
                fb.tabIndex = -1;
                fb.style.border = '0';
                fb.style.display = 'block';
                fb.style.pointerEvents = 'none';

                keepBlurred(fb);

                fb.addEventListener('load', function () {
                    if (succeeded) return;
                    succeeded = true;

                    // Offscreen-iframe in den sichtbaren Container verschieben
                    fb.style.pointerEvents = 'auto';
                    mount.innerHTML = '';
                    mount.appendChild(fb);
                    fb.style.cssText = 'position:absolute;inset:0;border:0;display:block;width:100%;height:100%;';
                    applyIframeStyle(fb, container);

                    if (placeholder) placeholder.classList.add('is-loaded');
                    correctScroll();
                    doRelease();
                }, { once: true });

                fb.addEventListener('error', function () {
                    // Beide Versuche gescheitert
                    if (placeholder) placeholder.classList.add('is-loaded');
                    doRelease();
                }, { once: true });

                root.appendChild(fb);
                fb.src = src;

                // Ultimativer Fallback
                setTimeout(function () {
                    if (!succeeded) {
                        if (placeholder) placeholder.classList.add('is-loaded');
                        doRelease();
                    }
                }, 15000);
            }

            // ── Load-Events ──

            iframe.addEventListener('load', function () {
                onSuccess(iframe);
            }, { once: true });

            iframe.addEventListener('error', function () {
                onFallback();
            }, { once: true });

            // iframe in den Mount einfügen + Laden starten
            mount.appendChild(iframe);
            applyIframeStyle(iframe, container);
            iframe.src = src;

            // Stufe-1-Timeout: nach 9s auf Fallback wechseln
            fallbackTimer = setTimeout(function () {
                if (!succeeded) onFallback();
            }, 9000);
        });
    }

    /**
     * IntersectionObserver
     */
    function initIframes() {
        var containers = document.querySelectorAll('.cs-preview-full');
        if (!containers.length) return;

        if (!('IntersectionObserver' in window)) {
            loadContainer(containers[0]);
            return;
        }

        containers.forEach(function (container) {
            var obs = new IntersectionObserver(function (entries) {
                for (var i = 0; i < entries.length; i++) {
                    if (entries[i].isIntersecting) {
                        loadContainer(container);
                        obs.disconnect();
                        break;
                    }
                }
            }, {
                threshold: 0,
                rootMargin: '400px 0px'
            });
            obs.observe(container);
        });

        // Fallback: auch scroll-basiert prüfen (wie der Konkurrent)
        function checkScroll() {
            var vh = window.innerHeight;
            containers.forEach(function (container) {
                if (container._done) return;
                var rect = container.getBoundingClientRect();
                if (rect.top < vh + 400 && rect.bottom > -400) {
                    loadContainer(container);
                }
            });
        }
        window.addEventListener('scroll', checkScroll, { passive: true });
        window.addEventListener('resize', checkScroll);
        window.addEventListener('orientationchange', checkScroll);
        requestAnimationFrame(checkScroll);
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
     *  RESPONSIVE: iframe bei Resize neu skalieren
     * ================================================================= */

    function initResize() {
        var containers = document.querySelectorAll('.cs-preview-full');
        function resizeAll() {
            containers.forEach(function (container) {
                var mount = container.querySelector('.cs-iframe-mount');
                if (!mount) return;
                var iframe = mount.querySelector('iframe');
                if (iframe) applyIframeStyle(iframe, container);
            });
        }
        window.addEventListener('resize', resizeAll);
        window.addEventListener('orientationchange', resizeAll);
    }


    /* =================================================================
     *  INIT
     * ================================================================= */

    function init() {
        initAnimations();
        initIframes();
        initResize();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
