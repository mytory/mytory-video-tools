(function (global) {
    "use strict";

    const PAYPAL_URL = "https://www.paypal.com/ncp/payment/SWKQD7USX8J5U";
    const KOREAN_SUPPORT_URL = "https://fairy.hada.io/@mytory-video-tools";
    let instance = null;

    function getLanguage() {
        const language = global.MytoryI18n?.getLanguage?.()
            || global.__MYTORY_LANG__
            || global.document.documentElement.lang
            || "en";
        const normalized = String(language).toLowerCase();
        return optionsLanguage(normalized);
    }

    function optionsLanguage(language) {
        const supported = ["en", "ko", "ja", "zh-cn", "es", "pt", "fr", "id", "hi"];
        if (supported.includes(language)) return language;
        const base = language.split("-")[0];
        return supported.includes(base) ? base : "en";
    }

    function createElement(tagName, className, text) {
        const element = global.document.createElement(tagName);
        if (className) element.className = className;
        if (text) element.textContent = text;
        return element;
    }

    function create(options) {
        if (!options || !options.en || !options.ko) {
            throw new TypeError("영어와 한국어 제목 및 본문이 필요합니다.");
        }

        if (instance) {
            instance.destroy();
        }

        const toast = createElement("div", "mytory-donation-toast");
        toast.setAttribute("role", "status");
        toast.setAttribute("aria-live", "polite");
        toast.setAttribute("aria-atomic", "true");
        toast.hidden = true;

        const layout = createElement("div", "mytory-donation-toast__layout");
        const icon = createElement("span", "mytory-donation-toast__icon", "☕");
        icon.setAttribute("aria-hidden", "true");

        const content = createElement("div");
        const title = createElement("p", "mytory-donation-toast__title");
        const message = createElement("p", "mytory-donation-toast__message");
        const supportLink = createElement("a", "mytory-donation-toast__cta");
        supportLink.target = "_blank";
        supportLink.rel = "noopener noreferrer";

        const closeButton = createElement("button", "mytory-donation-toast__close", "×");
        closeButton.type = "button";

        const arrow = createElement("span", "", "↗");
        arrow.setAttribute("aria-hidden", "true");
        supportLink.append(arrow);
        content.append(title, message, supportLink);
        layout.append(icon, content);
        toast.append(layout, closeButton);
        global.document.body.append(toast);

        let animationFrame = 0;

        function renderLanguage() {
            const language = getLanguage();
            const strings = options[language] || options.en;
            title.textContent = strings.title;
            message.textContent = strings.message;
            closeButton.setAttribute("aria-label", strings.close || "Dismiss donation message");
            supportLink.href = language === "ko" ? KOREAN_SUPPORT_URL : PAYPAL_URL;
            supportLink.textContent = strings.cta || "Support via PayPal";
            supportLink.append(arrow);
        }

        function show() {
            renderLanguage();
            toast.hidden = false;
            global.cancelAnimationFrame(animationFrame);
            animationFrame = global.requestAnimationFrame(() => toast.classList.add("is-visible"));
        }

        function hide() {
            global.cancelAnimationFrame(animationFrame);
            toast.classList.remove("is-visible");
            toast.hidden = true;
        }

        function handleLanguageChange() {
            renderLanguage();
        }

        closeButton.addEventListener("click", hide);
        global.addEventListener("hashchange", handleLanguageChange);
        global.addEventListener("popstate", handleLanguageChange);

        const languageObserver = new MutationObserver(handleLanguageChange);
        languageObserver.observe(global.document.documentElement, {
            attributes: true,
            attributeFilter: ["lang"]
        });

        instance = {
            show,
            hide,
            destroy() {
                hide();
                closeButton.removeEventListener("click", hide);
                global.removeEventListener("hashchange", handleLanguageChange);
                global.removeEventListener("popstate", handleLanguageChange);
                languageObserver.disconnect();
                toast.remove();
            }
        };

        renderLanguage();
        return instance;
    }

    global.MytoryDonationToast = { create };
})(window);
