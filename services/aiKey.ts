// Visitor-supplied Gemini API key.
// The key is kept only in the visitor's own browser (localStorage) and is sent
// only to Google's Gemini API. It is never committed, built into the site, or
// sent anywhere else. This means AI usage is billed to (or free-tier for) the
// visitor's own Google account, not the site owner's.

const STORAGE_KEY = 'energy_resilience_gemini_key';
const CHANGE_EVENT = 'ai-key-changed';

let memoryKey = ''; // fallback when localStorage is blocked (private mode etc.)

export const getAiKey = (): string => {
    try {
        return localStorage.getItem(STORAGE_KEY) || memoryKey;
    } catch {
        return memoryKey;
    }
};

export const hasAiKey = (): boolean => getAiKey().trim().length > 0;

export const setAiKey = (key: string) => {
    const clean = key.trim();
    memoryKey = clean;
    try {
        if (clean) localStorage.setItem(STORAGE_KEY, clean);
        else localStorage.removeItem(STORAGE_KEY);
    } catch {
        /* storage blocked: key lives in memory for this visit only */
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
};

export const clearAiKey = () => setAiKey('');

export const onAiKeyChange = (fn: () => void) => {
    window.addEventListener(CHANGE_EVENT, fn);
    return () => window.removeEventListener(CHANGE_EVENT, fn);
};

// Ask the app to open the "Add your Gemini key" panel.
export const requestAiKey = () => window.dispatchEvent(new Event('ai-key-required'));
export const onAiKeyRequired = (fn: () => void) => {
    window.addEventListener('ai-key-required', fn);
    return () => window.removeEventListener('ai-key-required', fn);
};
