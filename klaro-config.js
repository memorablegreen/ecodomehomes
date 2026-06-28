// Consent model (updated for Consent Mode v2):
// Google Analytics and Microsoft Clarity now load UNGATED in a cookieless /
// denied state set in the page <head>, so they collect modeled, cookie-free
// data for 100% of visitors with no PII. Klaro no longer injects or blocks
// those scripts; instead each service emits a consent SIGNAL that js/consent-
// mode.js translates into gtag('consent','update', ...) and clarity('consentv2',
// ...). The per-service callbacks below are a redundant trigger for that same
// idempotent bridge. The cookies arrays remain so Klaro can clear cookies on
// decline. The leadconnector-chatbot service stays script-gated (functional
// consent is correct for live chat).
var klaroConfig = {
    acceptAll: true,
    hideDeclineAll: false,
    hideLearnMore: false,
    noticeAsModal: false,
    storageMethod: 'cookie',
    storageName: 'klaro',
    cookieExpiresAfterDays: 365,
    privacyPolicy: '/privacy.html',
    default: false,
    mustConsent: false,
    translations: {
        en: {
            consentModal: {
                title: 'Cookie preferences',
                description: 'We use cookies for analytics and session recording to improve your experience. You can choose which services to allow below. For more details, see our {privacyPolicy}.',
            },
            consentNotice: {
                description: 'We use cookies for analytics and session recording. You can {learn_more} or accept/decline below.',
                learnMore: 'customize',
                changeDescription: 'Our cookie policy has changed since your last visit. Please update your preferences.',
            },
            acceptAll: 'Accept all',
            declineAll: 'Decline all',
            ok: 'Accept selected',
            save: 'Save',
            close: 'Close',
            privacyPolicy: {
                name: 'privacy policy',
                text: 'Read our {0}.',
            },
            'google-analytics': {
                title: 'Google Analytics',
                description: 'Anonymous page-view and traffic analytics powered by Google Analytics 4.',
            },
            'microsoft-clarity': {
                title: 'Microsoft Clarity',
                description: 'Session recordings and heatmaps to understand how visitors use the site.',
            },
            'leadconnector-chatbot': {
                title: 'Chat Widget',
                description: 'Allows you to chat with our team in real time. Stores a session cookie and may track your conversation.',
            },
            purposes: {
                analytics: { title: 'Analytics', description: 'Services that help us understand how visitors use the site.' },
                functional: { title: 'Functional', description: 'Tools that add features like live chat.' },
            },
        },
    },
    services: [
        {
            name: 'google-analytics',
            title: 'Google Analytics',
            purposes: ['analytics'],
            cookies: [
                [/^_ga/, '/', '.ecodomehomes.com'],
                [/^_gid/, '/', '.ecodomehomes.com'],
                [/^_gat/, '/', '.ecodomehomes.com'],
            ],
            required: false,
            default: false,
            optOut: false,
            onlyOnce: true,
            callback: function () {
                if (window.edhConsentRefresh) window.edhConsentRefresh();
            },
        },
        {
            name: 'microsoft-clarity',
            title: 'Microsoft Clarity',
            purposes: ['analytics'],
            cookies: [
                [/^_clck/, '/', '.ecodomehomes.com'],
                [/^_clsk/, '/', '.ecodomehomes.com'],
                [/^CLID/, '/', '.ecodomehomes.com'],
                [/^ANONCHK/, '/', '.ecodomehomes.com'],
                [/^MR/, '/', '.ecodomehomes.com'],
                [/^MUID/, '/', '.ecodomehomes.com'],
                [/^SM/, '/', '.ecodomehomes.com'],
            ],
            required: false,
            default: false,
            optOut: false,
            onlyOnce: true,
            callback: function () {
                if (window.edhConsentRefresh) window.edhConsentRefresh();
            },
        },
        {
            name: 'leadconnector-chatbot',
            title: 'Chat Widget',
            purposes: ['functional'],
            cookies: [
                [/^_lc/, '/', '.ecodomehomes.com'],
                [/^leadconnector/, '/', '.ecodomehomes.com'],
            ],
            required: false,
            default: false,
            optOut: false,
            onlyOnce: true,
        },
    ],
};
