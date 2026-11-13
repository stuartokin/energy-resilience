// History ("data lake"): reads the daily records the Cloudflare Worker collects every 15 minutes
// (worker/outages-worker.js, snapshot()). One record per UTC day; columns line up with `t` (HH:MM UTC).
// Live power-cut feeds disappear once a cut is fixed, so for power cuts this is the only history kept.
import { OUTAGE_WORKER_URL } from '../config';
import { markOk, markFail } from './health';
import { GAS_ROUTES } from './flows';

export interface DayRecord {
    v: number; date: string; t: string[];
    demand: (number | null)[];
    freq: { last?: (number | null)[]; min?: (number | null)[]; max?: (number | null)[]; out?: (number | null)[] };
    fuel: Record<string, (number | null)[]>;
    gas: { supply: (number | null)[]; demand: (number | null)[]; linepack: (number | null)[]; entry: Record<string, (number | null)[]> };
    cuts: Record<string, { c: (number | null)[]; u: (number | null)[]; p: (number | null)[] }>;
    events: Record<string, { d: string; la: number; lo: number; c: number; p: number; f: string; l: string; s: string }>;
    warn: Record<string, { lvl: string; type: string; f: string; l: string }>;
    floods: { severe?: (number | null)[]; warning?: (number | null)[]; alert?: (number | null)[] };
}
export interface HistoryIndex { days: string[]; since?: string; error?: string }

export const DNO_NAMES: Record<string, string> = { ukpn: 'UK Power Networks', npg: 'Northern Powergrid', nged: 'NGED', ssen: 'SSEN', spen: 'SP Energy Networks' };
export const DNO_COLOURS: Record<string, string> = { ukpn: '#dc2626', npg: '#8b5cf6', nged: '#eab308', ssen: '#0ea5e9', spen: '#16a34a' };
export const IC_COUNTRY: Record<string, string> = {
    INTFR: 'France', INTIFA2: 'France', INTELEC: 'France', INTNED: 'Netherlands', INTNEM: 'Belgium', INTNSL: 'Norway',
    INTVKL: 'Denmark', INTIRL: 'Northern Ireland', INTEW: 'Ireland', INTGRNL: 'Ireland',
};
// Elexon fuel types grouped for charts (interconnectors are shown separately)
export const FUEL_GROUP: Record<string, string> = {
    CCGT: 'Gas', OCGT: 'Gas', NUCLEAR: 'Nuclear', WIND: 'Wind', BIOMASS: 'Biomass', NPSHYD: 'Hydro', PS: 'Pumped storage',
    COAL: 'Coal', OIL: 'Other', OTHER: 'Other',
};
export const FUEL_COLOURS: Record<string, string> = { Gas: '#f97316', Nuclear: '#a855f7', Wind: '#10b981', Biomass: '#84cc16', Hydro: '#38bdf8', 'Pumped storage': '#0ea5e9', Coal: '#78716c', Other: '#94a3b8', Imports: '#22d3ee' };

const cache = new Map<string, Promise<DayRecord | null>>();

export const loadIndex = async (): Promise<HistoryIndex> => {
    try {
        const r = await fetch(`${OUTAGE_WORKER_URL}/history`);
        if (r.status === 404) return { days: [], error: 'The Worker hasn\'t been updated with the history code yet.' };
        const j = await r.json();
        if (j.error) return { days: [], error: j.error }; // not set up yet: not counted as a fault
        markOk('history', `${(j.days || []).length} days`);
        return j;
    } catch (e: any) {
        markFail('history', 'unreachable');
        return { days: [], error: 'The history service could not be reached.' };
    }
};

export const loadDay = (d: string, today: boolean): Promise<DayRecord | null> => {
    if (!today && cache.has(d)) return cache.get(d)!;
    const p = fetch(`${OUTAGE_WORKER_URL}/history/day?d=${d}`).then(r => r.json()).then(j => (j && !j.error ? j as DayRecord : null)).catch(() => null);
    if (!today) cache.set(d, p);
    return p;
};

export const loadRange = async (days: string[]): Promise<DayRecord[]> => {
    const today = new Date().toISOString().slice(0, 10);
    const recs = await Promise.all(days.map(d => loadDay(d, d === today)));
    return recs.filter(Boolean) as DayRecord[];
};

// Flatten days into time-stamped rows for charts
export interface Row { ts: number; label: string; [k: string]: number | string | null }
const at = (date: string, t: string) => Date.parse(`${date}T${t}:00Z`);
const val = (a: (number | null)[] | undefined, i: number) => (a && typeof a[i] === 'number' ? (a[i] as number) : null);

export const rows = (recs: DayRecord[], pick: (r: DayRecord, i: number) => Record<string, number | null>): Row[] =>
    recs.flatMap(r => r.t.map((t, i) => ({ ts: at(r.date, t), label: `${r.date.slice(5)} ${t}`, ...pick(r, i) })));

export const cutRows = (recs: DayRecord[]) => rows(recs, (r, i) => Object.fromEntries(Object.keys(DNO_NAMES).map(k => [k, val(r.cuts[k]?.c, i)])));

export const mixRows = (recs: DayRecord[]) => rows(recs, (r, i) => {
    const o: Record<string, number> = {};
    for (const [f, a] of Object.entries(r.fuel)) {
        const v = val(a, i); if (v === null) continue;
        const g = f.startsWith('INT') ? 'Imports' : FUEL_GROUP[f] || 'Other';
        o[g] = (o[g] || 0) + (g === 'Imports' ? Math.max(0, v) : v) / 1000;
    }
    return o;
});

export const importRows = (recs: DayRecord[]) => rows(recs, (r, i) => {
    const o: Record<string, number> = {};
    for (const [f, a] of Object.entries(r.fuel)) {
        if (!IC_COUNTRY[f]) continue;
        const v = val(a, i); if (v === null) continue;
        o[IC_COUNTRY[f]] = (o[IC_COUNTRY[f]] || 0) + v / 1000;
    }
    return o;
});

// Daily summaries (one row per day)
export const dailySummary = (recs: DayRecord[]) => recs.map(r => {
    const n = r.t.length;
    let worstCustomers = 0, cutsSeen = Object.values(r.events).filter(e => !e.p).length;
    for (let i = 0; i < n; i++) worstCustomers = Math.max(worstCustomers, Object.values(r.cuts).reduce((a, c) => a + (val(c.c, i) || 0), 0));
    const out = (r.freq.out || []).reduce<number>((a, x) => a + (x || 0), 0);
    const mins = (r.freq.min || []).filter((x): x is number => typeof x === 'number');
    const maxs = (r.freq.max || []).filter((x): x is number => typeof x === 'number');
    const warnings = Object.values(r.warn);
    return {
        date: r.date, label: r.date.slice(5), snapshots: n,
        worstCustomers, cutsSeen,
        minutesOutside: Math.round(out / 60), fMin: mins.length ? Math.min(...mins) : null, fMax: maxs.length ? Math.max(...maxs) : null,
        amber: warnings.filter(w => /amber/i.test(w.lvl)).length, red: warnings.filter(w => /red/i.test(w.lvl)).length, yellow: warnings.filter(w => /yellow/i.test(w.lvl)).length,
        floodWarnings: Math.max(0, ...(r.floods.warning || []).map(x => x || 0)) + Math.max(0, ...(r.floods.severe || []).map(x => x || 0)),
    };
});

// Wind output by hour of day and day (GW) for the heatmap
export const windGrid = (recs: DayRecord[]) => recs.map(r => {
    const hours: (number | null)[] = Array(24).fill(null);
    const sums = Array(24).fill(0), counts = Array(24).fill(0);
    r.t.forEach((t, i) => { const v = val(r.fuel.WIND, i); if (v === null) return; const h = +t.slice(0, 2); sums[h] += v; counts[h]++; });
    for (let h = 0; h < 24; h++) if (counts[h]) hours[h] = sums[h] / counts[h] / 1000;
    return { date: r.date, hours };
});

// Concentration over time: largest gas entry point's share of supply; largest single interconnector import
export const concentrationRows = (recs: DayRecord[]) => rows(recs, (r, i) => {
    const supply = val(r.gas.supply, i);
    // Largest gas route (same routes as the Energy flows panel: entry points summed, terminal reading as a fallback)
    let topGas = 0;
    for (const route of GAS_ROUTES) {
        if (route.group === 'Export pipeline') continue;
        let v = (route.entries || []).reduce((t, e) => t + (val(r.gas.entry[e], i) || 0), 0);
        if (route.terminal) v = Math.max(v, val(r.gas.entry[route.terminal], i) || 0);
        topGas = Math.max(topGas, v);
    }
    let topIc = 0;
    for (const [f, a] of Object.entries(r.fuel)) if (IC_COUNTRY[f]) topIc = Math.max(topIc, val(a, i) || 0);
    return { gasTopShare: supply ? Math.round((topGas / supply) * 1000) / 10 : null, topImportMW: topIc || null };
});
