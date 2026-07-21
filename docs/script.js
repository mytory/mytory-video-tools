/* ============================================
   Mytory Video Tools — GitHub Pages Script
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {

    /* --- Mobile Nav Toggle --- */
    const toggle = document.querySelector('.navbar__toggle');
    const navLinks = document.querySelector('.navbar__links');

    if (toggle && navLinks) {
        toggle.addEventListener('click', () => {
            navLinks.classList.toggle('navbar__links--open');
        });

        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                navLinks.classList.remove('navbar__links--open');
            });
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.navbar')) {
                navLinks.classList.remove('navbar__links--open');
            }
        });
    }

    /* --- Scroll Reveal --- */
    const itemsToReveal = [
        '.features__header',
        '.hwaccel__content',
        '.hwaccel__visual',
        '.languages__header',
        '.concept__header',
        '.concept__body',
        '.concept__tags',
        '.languages__list',
        '.languages__screenshot',
        '.download__header',
        '.oss__content',
        '.trusted',
    ];

    if ('IntersectionObserver' in window) {
        itemsToReveal.forEach(sel => {
            document.querySelectorAll(sel).forEach(el => el.classList.add('reveal'));
        });

        document.querySelectorAll('.feature-card').forEach((card, i) => {
            card.classList.add('reveal');
            card.style.transitionDelay = `${i * 0.05}s`;
        });

        document.querySelectorAll('.platform-card').forEach((card, i) => {
            card.classList.add('reveal');
            card.style.transitionDelay = `${i * 0.08}s`;
        });

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('reveal--visible');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

        document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
    } else {
        document.querySelectorAll('.reveal').forEach(el => el.classList.add('reveal--visible'));
    }

    /* --- Navbar on Scroll --- */
    const navbar = document.getElementById('navbar');
    if (navbar) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 20) {
                navbar.style.background = 'rgba(250, 250, 249, 0.92)';
                navbar.style.borderBottomColor = 'rgba(228, 228, 231, 0.9)';
            } else {
                navbar.style.background = 'rgba(250, 250, 249, 0.8)';
                navbar.style.borderBottomColor = 'var(--color-border)';
            }
        }, { passive: true });
    }

    /* --- Smooth scroll for anchor links --- */
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', (e) => {
            const href = anchor.getAttribute('href');
            if (href === '#') return;
            const target = document.querySelector(href);
            if (target) {
                e.preventDefault();
                const top = target.getBoundingClientRect().top + window.scrollY - 64;
                window.scrollTo({ top, behavior: 'smooth' });
            }
        });
    });

    /* --- Language suggestion banner --- */
    (function() {
        // Show only on the root English page
        if (/\/ko\/|\/ja\/|\/zh-cn\/|\/es\/|\/pt\/|\/fr\/|\/id\/|\/hi\//.test(window.location.pathname)) return;

        const supportedLocales = ['ko', 'ja', 'zh-cn', 'es', 'pt', 'fr', 'id', 'hi'];

        function detectLocale() {
            var raw = (navigator.language || '').toLowerCase();
            if (supportedLocales.indexOf(raw) !== -1) return raw;
            var base = raw.split('-')[0];
            if (base === 'zh') return 'zh-cn';
            if (supportedLocales.indexOf(base) !== -1) return base;
            return null;
        }

        var detected = detectLocale();
        if (!detected) return;

        if (localStorage.getItem('mytory-video-tools-lang-suggest-dismissed') === 'true') return;

        var messages = {
            ko: { question: '\uD83C\uDF10 \uC774 \uD398\uC774\uC9C0\uB97C \uD55C\uAD6D\uC5B4\uB85C \uBCF4\uC2DC\uACA0\uC2B5\uB2C8\uAE4C?', yes: '\uC608, \uD55C\uAD6D\uC5B4\uB85C \uBCF4\uAE30', no: '\uC544\uB2C8\uC694, \uC601\uC5B4\uB85C \uBCFC\uAE4C\uC694' },
            ja: { question: '\uD83C\uDF10 \u3053\u306E\u30DA\u30FC\u30B8\u3092\u65E5\u672C\u8A9E\u3067\u8868\u793A\u3057\u307E\u3059\u304B?', yes: '\u306F\u3044\u3001\u65E5\u672C\u8A9E\u3067\u8868\u793A', no: '\u3044\u3044\u3048\u3001\u82F1\u8A9E\u3067\u8868\u793A' },
            'zh-cn': { question: '\uD83C\uDF10 \u662F\u5426\u4EE5\u7B80\u4F53\u4E2D\u6587\u663E\u793A\u6B64\u9875\u9762?', yes: '\u662F\uFF0C\u4EE5\u7B80\u4F53\u4E2D\u6587\u663E\u793A', no: '\u5426\uFF0C\u4EE5\u82F1\u6587\u663E\u793A' },
            es: { question: '\uD83C\uDF10 \u00BFVer esta p\u00E1gina en espa\u00F1ol?', yes: 'S\u00ED, en espa\u00F1ol', no: 'No, en ingl\u00E9s' },
            pt: { question: '\uD83C\uDF10 Ver esta p\u00E1gina em portugu\u00EAs?', yes: 'Sim, em portugu\u00EAs', no: 'N\u00E3o, em ingl\u00EAs' },
            fr: { question: '\uD83C\uDF10 Voir cette page en fran\u00E7ais ?', yes: 'Oui, en fran\u00E7ais', no: 'Non, en anglais' },
            id: { question: '\uD83C\uDF10 Lihat halaman ini dalam bahasa Indonesia?', yes: 'Ya, bahasa Indonesia', no: 'Tidak, bahasa Inggris' },
            hi: { question: '\uD83C\uDF10 \u0915\u094D\u092F\u093E \u0906\u092A \u092F\u0939 \u092A\u0943\u0937\u094D\u0920 \u0939\u093F\u0928\u094D\u0926\u0940 \u092E\u0947\u0902 \u0926\u0947\u0916\u0928\u093E \u091A\u093E\u0939\u0947\u0902\u0917\u0947?', yes: '\u0939\u093E\u0902, \u0939\u093F\u0928\u094D\u0926\u0940 \u092E\u0947\u0902 \u0926\u0947\u0916\u0947\u0902', no: '\u0928\u0939\u0940\u0902, \u0905\u0902\u0917\u094D\u0930\u0947\u091C\u093C\u0940 \u092E\u0947\u0902 \u0926\u0947\u0916\u0947\u0902' },
        };

        var msg = messages[detected];
        if (!msg) return;

        // Build banner
        var banner = document.createElement('div');
        banner.className = 'lang-suggest';
        banner.innerHTML = '<div class="lang-suggest__inner">'
            + '<span class="lang-suggest__text">' + msg.question + '</span>'
            + '<div class="lang-suggest__actions">'
            + '<button class="lang-suggest__btn lang-suggest__btn--yes" data-action="yes">' + msg.yes + '</button>'
            + '<button class="lang-suggest__btn lang-suggest__btn--no" data-action="no">' + msg.no + '</button>'
            + '</div></div>';

        // Inject styles
        var style = document.createElement('style');
        style.textContent = '.lang-suggest{position:fixed;top:0;left:0;right:0;z-index:10000;background:#18181b;color:#fafaf9;font-family:"Inter",-apple-system,BlinkMacSystemFont,sans-serif;font-size:14px;line-height:1.5;box-shadow:0 2px 16px rgba(0,0,0,0.15);transform:translateY(-100%);transition:transform 0.35s cubic-bezier(0.16,1,0.3,1)}'
            + '.lang-suggest--visible{transform:translateY(0)}'
            + '.lang-suggest__inner{display:flex;align-items:center;justify-content:center;gap:16px;padding:10px 20px;max-width:960px;margin:0 auto;flex-wrap:wrap}'
            + '.lang-suggest__text{white-space:nowrap}'
            + '.lang-suggest__actions{display:flex;gap:8px}'
            + '.lang-suggest__btn{padding:5px 14px;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:500;font-family:inherit;transition:opacity 0.15s}'
            + '.lang-suggest__btn:hover{opacity:0.85}'
            + '.lang-suggest__btn--yes{background:#fafaf9;color:#18181b}'
            + '.lang-suggest__btn--no{background:rgba(255,255,255,0.1);color:#fafaf9}'
            + '@media(max-width:600px){.lang-suggest__inner{flex-direction:column;gap:8px;padding:12px 16px}.lang-suggest__text{white-space:normal;text-align:center}}';

        document.head.appendChild(style);
        document.body.appendChild(banner);

        // Animate in
        requestAnimationFrame(function() {
            banner.classList.add('lang-suggest--visible');
        });

        // Handle buttons
        banner.addEventListener('click', function(e) {
            var btn = e.target.closest('[data-action]');
            if (!btn) return;
            if (btn.getAttribute('data-action') === 'yes') {
                window.location.href = detected + '/';
            } else {
                localStorage.setItem('mytory-video-tools-lang-suggest-dismissed', 'true');
                banner.classList.remove('lang-suggest--visible');
                setTimeout(function() { banner.remove(); }, 400);
            }
        });
    })();
});
