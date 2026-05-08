(function () {
    'use strict';

    var STAGGER_MS = 180;

    // Wird für jede gefundene Sektion separat aufgerufen
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
        // querySelectorAll statt querySelector – findet ALLE Sektionen auf der Seite
        var sections = document.querySelectorAll('.cs-section');
        if (!sections.length) return;
        sections.forEach(function(section) {
            initSection(section);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
