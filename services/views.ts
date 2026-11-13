// Saved views: the whole screen set-up (windows, mode, layers, map position, text size, chart settings)
// as one small JSON object. Save to a file, keep named views in this browser, or share as a link.
import type { Persisted } from '../components/shell/windows';
import type { HistorySettings } from '../components/panels/HistoryPanel';

export interface SavedView {
    app: 'energy-resilience';
    kind: 'view';
    version: 1;
    name: string;
    savedAt: string;
    mode: 'live' | 'scenarios';
    windows: Persisted;
    layers: string[];
    map?: { lat: number; lng: number; zoom: number };
    fontPx?: number;
    history?: HistorySettings;
    presenting?: boolean;
}

const KEY = 'energy_resilience_views_v1';
export const listViews = (): SavedView[] => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
const store = (v: SavedView[]) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* not remembered */ } };
export const saveNamedView = (v: SavedView) => store([...listViews().filter(x => x.name !== v.name), v].sort((a, b) => a.name.localeCompare(b.name)));
export const deleteNamedView = (name: string) => store(listViews().filter(x => x.name !== name));

// Check a view read from a file or link before using it (never trust its contents)
export const parseView = (raw: unknown): SavedView | null => {
    const v = raw as SavedView;
    if (!v || v.app !== 'energy-resilience' || v.kind !== 'view' || typeof v.windows !== 'object' || !Array.isArray(v.layers)) return null;
    const clean: SavedView = {
        app: 'energy-resilience', kind: 'view', version: 1,
        name: String(v.name || 'Imported view').slice(0, 60), savedAt: String(v.savedAt || ''),
        mode: v.mode === 'scenarios' ? 'scenarios' : 'live',
        windows: v.windows, layers: v.layers.filter(l => typeof l === 'string').slice(0, 40),
        fontPx: typeof v.fontPx === 'number' ? Math.max(12, Math.min(22, v.fontPx)) : undefined,
        presenting: !!v.presenting,
    };
    if (v.map && [v.map.lat, v.map.lng, v.map.zoom].every(n => typeof n === 'number' && isFinite(n))) clean.map = { lat: v.map.lat, lng: v.map.lng, zoom: v.map.zoom };
    if (v.history && typeof v.history.range === 'number' && Array.isArray(v.history.charts)) clean.history = { range: v.history.range, charts: v.history.charts.filter(c => typeof c === 'string') };
    return clean;
};

export const downloadView = (v: SavedView) => {
    const blob = new Blob([JSON.stringify(v, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `energy-view-${v.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'view'}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

export const readViewFile = (file: File): Promise<SavedView | null> =>
    file.text().then(t => parseView(JSON.parse(t))).catch(() => null);

// Share link: the view, compressed into the address after #view=
const b64u = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s: string) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));
export const viewLink = (v: SavedView) => `${location.origin}${location.pathname}#view=${b64u(JSON.stringify(v))}`;
export const viewFromHash = (): SavedView | null => {
    const m = location.hash.match(/view=([A-Za-z0-9_-]+)/);
    if (!m) return null;
    try { return parseView(JSON.parse(unb64u(m[1]))); } catch { return null; }
};
