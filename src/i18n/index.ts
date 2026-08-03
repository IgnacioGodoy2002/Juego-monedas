import i18next from 'i18next';
import es from './es.json';
import pt from './pt.json';
import en from './en.json';

export type SupportedLanguage = 'es' | 'pt' | 'en';

const LANGUAGE_STORAGE_KEY = 'language';

// ISO 3166-1 alpha-2 codes for Spanish-speaking countries. Brazil is
// handled separately (-> pt); every other country falls through to 'en'.
const SPANISH_SPEAKING_COUNTRY_CODES = new Set([
    'ES',
    'AR',
    'MX',
    'CL',
    'CO',
    'PE',
    'UY',
    'VE',
    'EC',
    'BO',
    'PY',
    'CR',
    'PA',
    'GT',
    'HN',
    'SV',
    'NI',
    'DO',
    'CU',
    'GQ', // Equatorial Guinea — the one Spanish-speaking country outside the Americas/Spain
]);

function countryCodeToLanguage(countryCode: string): SupportedLanguage {
    const normalized = countryCode.toUpperCase();
    if (normalized === 'BR') {
        return 'pt';
    }
    if (SPANISH_SPEAKING_COUNTRY_CODES.has(normalized)) {
        return 'es';
    }
    return 'en';
}

function getStoredLanguage(): SupportedLanguage | null {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored === 'es' || stored === 'pt' || stored === 'en') {
        return stored;
    }
    return null;
}

function storeLanguage(language: SupportedLanguage): void {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
}

// ipapi.co is the primary lookup; ipwho.is is a same-shaped fallback (both
// return a top-level ISO country code field, just under a different key)
// in case the first one is down, rate-limited, or blocked by the user's
// network. Either failing — or both — falls through to 'es', same as any
// other detection failure (offline, CORS, timeout).
async function fetchCountryCode(): Promise<string | null> {
    try {
        const response = await fetch('https://ipapi.co/json/');
        if (response.ok) {
            const data = await response.json();
            if (data && data.country_code) {
                return String(data.country_code);
            }
        }
    } catch (e) {
        console.error('ipapi.co lookup failed:', e);
    }

    try {
        const response = await fetch('https://ipwho.is/');
        if (response.ok) {
            const data = await response.json();
            if (data && data.success !== false && data.country_code) {
                return String(data.country_code);
            }
        }
    } catch (e) {
        console.error('ipwho.is lookup failed:', e);
    }

    return null;
}

async function detectLanguageByIP(): Promise<SupportedLanguage> {
    const countryCode = await fetchCountryCode();
    if (!countryCode) {
        // Both services failed (offline, CORS, both down/rate-limited) —
        // 'es' is the project's primary language, same fallback as any
        // other detection failure.
        return 'es';
    }
    return countryCodeToLanguage(countryCode);
}

// Resolves as soon as i18next itself is ready to translate (synchronous —
// resources are bundled JSON, no network fetch involved), NOT once IP
// detection finishes. A first-time visitor's menu renders immediately
// with the 'es' interim default below; if IP detection later resolves to
// a different language, the 'languageChanged' event (see
// onLanguageChanged) updates everything already on screen in place. A
// returning visitor with a language already in localStorage skips
// detection entirely — this only ever runs once per browser.
export async function initI18n(): Promise<void> {
    const storedLanguage = getStoredLanguage();
    const initialLanguage = storedLanguage ?? 'es';

    await i18next.init({
        lng: initialLanguage,
        fallbackLng: 'es',
        resources: {
            es: { translation: es },
            pt: { translation: pt },
            en: { translation: en },
        },
        interpolation: { escapeValue: false },
    });

    if (storedLanguage === null) {
        void detectLanguageByIP().then((detected) => {
            storeLanguage(detected);
            return i18next.changeLanguage(detected);
        });
    }
}

// Manual pick from the Settings language selector — persists immediately
// and always wins over IP detection: since getStoredLanguage() above
// returns non-null the moment *anything* (manual or previously
// auto-detected) is stored, detectLanguageByIP() never runs again after
// this, on this browser.
export function setLanguage(language: SupportedLanguage): void {
    storeLanguage(language);
    void i18next.changeLanguage(language);
}

export function getCurrentLanguage(): SupportedLanguage {
    return i18next.language as SupportedLanguage;
}

export function onLanguageChanged(callback: () => void): void {
    i18next.on('languageChanged', callback);
}

export function offLanguageChanged(callback: () => void): void {
    i18next.off('languageChanged', callback);
}

export function t(key: string, options?: Record<string, unknown>): string {
    return i18next.t(key, options) as string;
}

// Sweeps `root` for the two static-HTML i18n hooks and fills them in from
// the current language — used once at boot for the whole document (the
// settings pane, the landscape-orientation overlay) and again per-fragment
// right after cloning a <template> (see page.ts's
// createDialogContentFromTemplate), since template content is inert and
// never touched by a document-wide sweep until it's cloned into the live
// DOM.
//   data-i18n="key"              -> element.textContent = t(key)
//   data-i18n-attr="attr:key"    -> element.setAttribute(attr, t(key))
export function translateDom(root: ParentNode = document): void {
    root.querySelectorAll('[data-i18n]').forEach((el) => {
        const key = el.getAttribute('data-i18n');
        if (key) {
            el.textContent = t(key);
        }
    });
    root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
        const spec = el.getAttribute('data-i18n-attr');
        if (!spec) {
            return;
        }
        const [attr, key] = spec.split(':');
        if (attr && key) {
            el.setAttribute(attr, t(key));
        }
    });
}
