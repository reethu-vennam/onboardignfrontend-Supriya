import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { LanguageCode, languages, translations } from './translations';

const STORAGE_KEY = 'sabbpe_language';
const CACHE_PREFIX = 'sabbpe_i18n_';

interface I18nContextValue {
    language: LanguageCode;
    setLanguage: (language: LanguageCode) => void;
    t: (key: string, values?: Record<string, string | number | boolean>) => string;
    translating: boolean;
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

const isLanguageCode = (value: string | null): value is LanguageCode =>
    Boolean(value && languages.some(language => language.code === value));

const readPath = (source: unknown, path: string): string | undefined => {
    const value = path.split('.').reduce<unknown>((current, part) => {
        if (!current || typeof current !== 'object') return undefined;
        return (current as Record<string, unknown>)[part];
    }, source);
    return typeof value === 'string' ? value : undefined;
};

const interpolate = (
    text: string,
    values?: Record<string, string | number | boolean>
) => {
    if (!values) return text;
    return Object.entries(values).reduce(
        (result, [key, value]) => result.split(`{{${key}}}`).join(String(value)),
        text
    );
};

const cacheKey = (lang: string, key: string) => `${CACHE_PREFIX}${lang}_${key}`;

const loadCache = (): Record<string, string> => {
    const cache: Record<string, string> = {};
    const toDelete: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith(CACHE_PREFIX)) {
            const v = localStorage.getItem(k) ?? '';
            if (v.includes('MYMEMORY WARNING')) {
                toDelete.push(k);
            } else {
                cache[k] = v;
            }
        }
    }
    toDelete.forEach(k => localStorage.removeItem(k));
    return cache;
};

const GOOGLE_TRANSLATE_LANGS = new Set([
  'af','sq','am','ar','hy','az','eu','be','bn','bs','bg','ca','ceb','zh-CN','zh-TW',
  'co','hr','cs','da','nl','en','eo','et','fi','fr','fy','gl','ka','de','el','gu',
  'ht','ha','haw','he','iw','hi','hmn','hu','is','ig','id','ga','it','ja','jv','kn',
  'kk','km','rw','ko','ku','ky','lo','lv','lt','lb','mk','mg','ms','ml','mt','mi',
  'mr','mn','my','ne','no','ny','or','ps','fa','pl','pt','pa','ro','ru','sm','gd',
  'sr','st','sn','sd','si','sk','sl','so','es','su','sw','sv','tl','tg','ta','tt',
  'te','th','tr','tk','uk','ur','ug','uz','vi','cy','xh','yi','yo','zu'
]);

const translateViaApi = async (text: string, targetLang: string): Promise<string | null> => {
    if (!GOOGLE_TRANSLATE_LANGS.has(targetLang)) return null;
    try {
        const res = await fetch(
            `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`
        );
        const data = await res.json();
        const result = data?.[0]?.map((s: any) => s[0]).join('') ?? null;
        if (result) return result;
    } catch {}
    return null;
};

const collectKeys = (obj: Record<string, unknown>, prefix = ''): string[] => {
    const keys: string[] = [];
    for (const [k, v] of Object.entries(obj)) {
        const path = prefix ? `${prefix}.${k}` : k;
        if (typeof v === 'string') {
            keys.push(path);
        } else if (typeof v === 'object' && v !== null) {
            keys.push(...collectKeys(v as Record<string, unknown>, path));
        }
    }
    return keys;
};

const hasKey = (obj: Record<string, unknown>, path: string): boolean => {
    return readPath(obj, path) !== undefined;
};

const CONCURRENCY = 5;

const translateBatch = async (
    items: { key: string; text: string }[],
    targetLang: string,
    existingCache: Record<string, string>
): Promise<Record<string, string>> => {
    const results: Record<string, string> = {};
    const queue = [...items];
    const running: Promise<void>[] = [];

    const next = async () => {
        while (queue.length > 0) {
            const item = queue.shift()!;
            const ck = cacheKey(targetLang, item.key);
            if (existingCache[ck]) continue;
            const translated = await translateViaApi(item.text, targetLang);
            localStorage.setItem(ck, translated ?? item.text);
            results[ck] = translated ?? item.text;
        }
    };

    for (let i = 0; i < CONCURRENCY; i++) {
        running.push(next());
    }
    await Promise.allSettled(running);
    return results;
};

const findMissingEnglishKeys = (targetLang: LanguageCode): { key: string; text: string }[] => {
    const enKeys = collectKeys(translations.en as unknown as Record<string, unknown>);
    const existingCache = loadCache();
    const missing: { key: string; text: string }[] = [];

    for (const key of enKeys) {
        if (hasKey(translations[targetLang] as unknown as Record<string, unknown>, key)) continue;
        const ck = cacheKey(targetLang, key);
        if (existingCache[ck]) continue;
        const text = readPath(translations.en, key);
        if (text) missing.push({ key, text });
    }
    return missing;
};

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [language, setLanguageState] = useState<LanguageCode>(() => {
        if (typeof window === 'undefined') return 'en';
        const saved = window.localStorage.getItem(STORAGE_KEY);
        return isLanguageCode(saved) ? saved : 'en';
    });

    const [autoCache, setAutoCache] = useState<Record<string, string>>(loadCache);
    const [translating, setTranslating] = useState(false);

    useEffect(() => {
        document.documentElement.lang = language;
        window.localStorage.setItem(STORAGE_KEY, language);
    }, [language]);

    const setLanguage = useCallback(async (lang: LanguageCode) => {
        if (lang === 'en') {
            setLanguageState('en');
            return;
        }

        const missing = findMissingEnglishKeys(lang);
        if (missing.length === 0) {
            setLanguageState(lang);
            return;
        }

        setTranslating(true);
        const newCache = await translateBatch(missing, lang, autoCache);
        setAutoCache(prev => ({ ...prev, ...newCache }));
        setLanguageState(lang);
        setTranslating(false);
    }, [autoCache]);

    const t = useCallback<I18nContextValue['t']>((key, values) => {
        const targetText = readPath(translations[language], key);
        if (targetText) return interpolate(targetText, values);

        const englishText = readPath(translations.en, key);
        if (!englishText) return key;

        if (language === 'en') return interpolate(englishText, values);

        const ck = cacheKey(language, key);
        const cached = autoCache[ck];
        if (cached) return interpolate(cached, values);

        return interpolate(englishText, values);
    }, [language, autoCache]);

    const value = useMemo<I18nContextValue>(() => ({
        language,
        setLanguage,
        t,
        translating,
    }), [language, setLanguage, t, translating]);

    return (
        <I18nContext.Provider value={value}>
            {children}
        </I18nContext.Provider>
    );
};

const I18nLoadingOverlay: React.FC = () => {
    const { translating } = useI18n();
    if (!translating) return null;
    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            backgroundColor: 'rgba(255,255,255,0.95)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: '16px', fontFamily: 'system-ui, sans-serif',
        }}>
            <div style={{
                width: 40, height: 40, border: '3px solid #e5e7eb',
                borderTopColor: '#6366f1', borderRadius: '50%',
                animation: 'sabbpe-spin 0.8s linear infinite',
            }} />
            <style>{`@keyframes sabbpe-spin { to { transform: rotate(360deg) } }`}</style>
            <p style={{ color: '#374151', fontSize: 16, margin: 0 }}>Translating...</p>
        </div>
    );
};

export { I18nLoadingOverlay };

const textCacheKey = (text: string) => text.toLowerCase().trim().replace(/\s+/g, '_');

const translateText = async (text: string, targetLang: string): Promise<string | null> => {
    const ck = cacheKey(targetLang, `__text__${textCacheKey(text)}`);
    const cached = localStorage.getItem(ck);
    if (cached) return cached;
    const result = await translateViaApi(text, targetLang);
    if (result && result !== text) {
        localStorage.setItem(ck, result);
    }
    return result;
};

export const T: React.FC<{ children: string; values?: Record<string, string | number | boolean> }> = ({ children, values }) => {
    const { language } = useI18n();
    const [translated, setTranslated] = useState<string | null>(null);
    const text = values ? interpolate(children, values) : children;

    useEffect(() => {
        if (language === 'en') {
            setTranslated(null);
            return;
        }
        const ck = cacheKey(language, `__text__${textCacheKey(children)}`);
        const cached = localStorage.getItem(ck);
        if (cached) {
            setTranslated(cached);
            return;
        }
        // Check if manual translation exists for this text as key
        const manualKey = textCacheKey(children);
        const manual = readPath(translations[language], manualKey) ?? readPath(translations.en, manualKey);
        if (manual) {
            localStorage.setItem(ck, manual);
            setTranslated(manual);
            return;
        }
        translateText(children, language).then(result => {
            if (result) setTranslated(result);
        });
    }, [children, language]);

    if (language === 'en') return <>{text}</>;
    if (translated) return <>{translated}</>;
    return <>{text}</>;
};

export const useI18n = () => {
    const context = useContext(I18nContext);
    if (!context) {
        throw new Error('useI18n must be used within I18nProvider');
    }
    return context;
};

