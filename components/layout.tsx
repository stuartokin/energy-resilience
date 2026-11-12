// Screen-size layout and saved panel layout.
//   desktop (>= 1024px): floating panels you can move, resize and zoom
//   tablet  (640-1023px, e.g. an unfolded Galaxy Fold): floating panels, smaller defaults
//   phone   (< 640px, e.g. a folded Fold): full-screen map, panels open as a bottom sheet from a tab bar
import React, { createContext, useContext, useEffect, useState } from 'react';

export type LayoutMode = 'desktop' | 'tablet' | 'phone';

const modeFor = (w: number): LayoutMode => (w < 640 ? 'phone' : w < 1024 ? 'tablet' : 'desktop');

interface LayoutCtx {
    mode: LayoutMode;
    activeSheet: string | null;
    setActiveSheet: (id: string | null) => void;
}

const Ctx = createContext<LayoutCtx>({ mode: 'desktop', activeSheet: null, setActiveSheet: () => {} });

export const LayoutProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [mode, setMode] = useState<LayoutMode>(() => modeFor(window.innerWidth));
    const [activeSheet, setActiveSheet] = useState<string | null>(null);
    useEffect(() => {
        const onResize = () => setMode(modeFor(window.innerWidth));
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);
    useEffect(() => { if (mode !== 'phone') setActiveSheet(null); }, [mode]);
    return <Ctx.Provider value={{ mode, activeSheet, setActiveSheet }}>{children}</Ctx.Provider>;
};

export const useLayout = () => useContext(Ctx);

// ---------- Saved layout (this browser only) ----------
export interface PanelLayout { x?: number; y?: number; w?: number; h?: number; zoom?: number; }
const KEY = 'energy_resilience_layout_v1';

const readAll = (): Record<string, PanelLayout> => {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
};
export const loadPanelLayout = (id: string): PanelLayout => readAll()[id] || {};
export const savePanelLayout = (id: string, patch: PanelLayout) => {
    try {
        const all = readAll();
        all[id] = { ...all[id], ...patch };
        localStorage.setItem(KEY, JSON.stringify(all));
    } catch { /* storage blocked: layout just isn't remembered */ }
};
export const clearSavedLayout = () => { try { localStorage.removeItem(KEY); } catch { /* ignore */ } };

// ---------- Global text size ----------
const FONT_KEY = 'energy_resilience_font_px';
export const FONT_SIZES = [13, 14, 15, 16, 17, 18, 20, 22];
export const getFontSize = () => {
    try { const v = parseInt(localStorage.getItem(FONT_KEY) || '', 10); if (FONT_SIZES.includes(v)) return v; } catch { /* ignore */ }
    // Defaults: slightly smaller on phones, larger on big monitors
    const w = window.innerWidth;
    return w < 640 ? 15 : w >= 2200 ? 18 : 16;
};
export const applyFontSize = (px: number, remember = true) => {
    document.documentElement.style.setProperty('--ui-font-size', `${px}px`);
    if (remember) { try { localStorage.setItem(FONT_KEY, String(px)); } catch { /* ignore */ } }
};
