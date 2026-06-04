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

        // Close on link click
        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                navLinks.classList.remove('navbar__links--open');
            });
        });

        // Close on outside click
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.navbar')) {
                navLinks.classList.remove('navbar__links--open');
            }
        });
    }

    /* --- Scroll Reveal with IntersectionObserver --- */
    const revealElements = document.querySelectorAll(
        '.feature-card, .platform-card, .hwaccel__content, .hwaccel__visual, .download__header, .oss__content, .trusted'
    );

    if (revealElements.length > 0 && 'IntersectionObserver' in window) {
        // Add reveal class only to sections
        revealElements.forEach(el => {
            // Don't add to individual cards — we stagger those
            if (!el.classList.contains('feature-card') && !el.classList.contains('platform-card')) {
                el.classList.add('reveal');
            }
        });

        // Wrap cards in stagger groups for sequential reveal
        const featureGrid = document.querySelector('.features__grid');
        if (featureGrid) {
            const cards = featureGrid.querySelectorAll('.feature-card');
            cards.forEach((card, i) => {
                card.classList.add('reveal');
                card.style.transitionDelay = `${i * 0.06}s`;
            });
        }

        const platformGrid = document.querySelector('.download__platforms');
        if (platformGrid) {
            const cards = platformGrid.querySelectorAll('.platform-card');
            cards.forEach((card, i) => {
                card.classList.add('reveal');
                card.style.transitionDelay = `${i * 0.08}s`;
            });
        }

        const revealObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('reveal--visible');
                    revealObserver.unobserve(entry.target);
                }
            });
        }, {
            threshold: 0.1,
            rootMargin: '0px 0px -40px 0px'
        });

        document.querySelectorAll('.reveal').forEach(el => {
            revealObserver.observe(el);
        });
    } else {
        // Fallback: show everything
        document.querySelectorAll('.reveal').forEach(el => {
            el.classList.add('reveal--visible');
        });
    }

    /* --- Navbar Background on Scroll --- */
    const navbar = document.getElementById('navbar');
    let lastScrollY = 0;

    if (navbar) {
        window.addEventListener('scroll', () => {
            const scrollY = window.scrollY;
            if (scrollY > 20) {
                navbar.style.background = 'rgba(9, 9, 11, 0.85)';
                navbar.style.borderBottomColor = 'rgba(31, 31, 35, 0.8)';
            } else {
                navbar.style.background = 'rgba(9, 9, 11, 0.75)';
                navbar.style.borderBottomColor = 'var(--color-border)';
            }
            lastScrollY = scrollY;
        }, { passive: true });
    }

    /* --- Smooth scroll for anchor links (fallback for older browsers) --- */
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', (e) => {
            const href = anchor.getAttribute('href');
            if (href === '#') return;
            const target = document.querySelector(href);
            if (target) {
                e.preventDefault();
                const navH = 64;
                const top = target.getBoundingClientRect().top + window.scrollY - navH;
                window.scrollTo({
                    top,
                    behavior: 'smooth'
                });
            }
        });
    });

    console.log('Mytory Video Tools — Site loaded');
});
