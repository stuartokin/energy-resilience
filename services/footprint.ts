// Where a running scenario's power cuts fall on the map.
// The map is divided into Grid Supply Point (GSP) areas (NESO open boundaries; about 300 across GB),
// falling back to network-operator areas if the GSP file hasn't been built.
// Each scenario's footprint picks the areas it affects; at each moment the model says what share of
// customers are off, and that share of the footprint's areas is drawn dark ("lights out"), with a red
// haze over the rest of the footprint and over areas just about to go dark.
// Each area is treated as an equal share of GB customers (30 million / number of areas loaded); real
// areas vary a lot in size. Which areas go dark is illustrative, not a forecast.
import { RiskScenario, DNORegion, Footprint } from '../types';
import { customersOffAt, profileOf, peakOf } from './impactModel';
import { FlowLink } from './flows';

export interface Unit { id: string; area: string; c: [number, number]; rings: [number, number][][] } // [lng, lat]
import { ASSUMPTIONS } from '../content/assumptions';
export const perUnit = (n: number) => ASSUMPTIONS.gbCustomers.value / Math.max(1, n);
export const FOOTPRINT_NOTE = 'Shaded areas are Grid Supply Point areas (NESO open boundaries), or network-operator areas if those are not available. Each area is treated as an equal share of GB customers (30 million ÷ number of areas), so the share of areas shown dark matches the modelled number of customers off. Real areas vary in size, and which areas go dark is illustrative, not a forecast.';

let gspCache: Promise<Unit[]> | null = null;
export const loadGspUnits = (): Promise<Unit[]> => {
    if (gspCache) return gspCache;
    gspCache = fetch(`${import.meta.env.BASE_URL}data/gsp-areas.json`)
        .then(r => (r.ok && !(r.headers.get('content-type') || '').includes('text/html') ? r.json() : { units: [] }))
        .then(j => (j.units || []) as Unit[])
        .catch(() => []);
    return gspCache;
};

// Fallback units: network-operator areas
export const unitsFromDno = (regions: DNORegion[]): Unit[] => regions.filter(r => r.polygons?.length || r.path?.length > 2).map(r => {
    const rings = r.polygons?.length ? r.polygons.map(ring => ring.map(([lat, lng]) => [lng, lat] as [number, number])) : [r.path.map(p => [p.lng, p.lat] as [number, number])];
    const big = rings.reduce((a, b) => (b.length > a.length ? b : a));
    return { id: r.name, area: r.name, c: [big.reduce((s, p) => s + p[0], 0) / big.length, big.reduce((s, p) => s + p[1], 0) / big.length], rings };
});

// Deterministic 0..1 hash so the same scenario always draws the same pattern
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 100000) / 100000; };
const km = (a: [number, number], b: [number, number]) => Math.hypot((a[0] - b[0]) * 111.32 * Math.cos(((a[1] + b[1]) / 2) * Math.PI / 180), (a[1] - b[1]) * 111.32);

export const footprintOf = (s: RiskScenario): Footprint => s.footprint || (s.coordinates?.lat
    ? { areas: { point: { lat: s.coordinates.lat, lng: s.coordinates.lng, label: s.name } }, pattern: 'spread' }
    : { areas: 'national', pattern: 'scatter' });

export interface ScenarioUnits { scenario: RiskScenario; units: Unit[]; order: Map<string, number>; centre: [number, number] | null; label: string; perUnit: number; }

// Which units a scenario affects, and the order they go dark in (higher = earlier and longer)
export const resolveFootprint = (s: RiskScenario, all: Unit[]): ScenarioUnits => {
    const fp = footprintOf(s);
    const peak = peakOf(profileOf(s));
    let units: Unit[] = [], centre: [number, number] | null = null, label = '';
    const a = fp.areas;
    const per = perUnit(all.length);
    // No customer cuts modelled: only local footprints are shaded (as an "area at risk" haze)
    if (a === 'none' || !all.length || (peak <= 0 && (a === 'national' || a === 'placeable'))) return { scenario: s, units: [], order: new Map(), centre: null, label: '', perUnit: per };
    if (a === 'national' || a === 'placeable') { units = all; label = a === 'placeable' ? 'Location not set: shown spread across GB. Use "Place it" to choose where.' : 'All of Great Britain'; }
    else if ('regions' in a) {
        const want = new Set(a.regions.map(r => r.toLowerCase()));
        // Names can differ slightly between sources ("North Wales" vs "North Wales, Merseyside and Cheshire")
        const hit = (area: string) => { const x = area.toLowerCase(); return x && [...want].some(w => x === w || x.includes(w) || w.includes(x)); };
        units = all.filter(u => hit(u.area));
        label = a.regions.join(', ');
    } else if ('point' in a) {
        centre = [a.point.lng, a.point.lat];
        const k = Math.max(1, Math.min(60, Math.ceil(peak / per)));
        units = [...all].sort((x, y) => km(x.c, centre!) - km(y.c, centre!)).slice(0, k);
        label = a.point.label;
    }
    if (!units.length) return { scenario: s, units: [], order: new Map(), centre, label, perUnit: per };
    if (!centre) centre = [units.reduce((t, u) => t + u.c[0], 0) / units.length, units.reduce((t, u) => t + u.c[1], 0) / units.length];
    const pattern = fp.pattern || ('point' in (a as any) || 'regions' in (a as any) ? 'spread' : 'scatter');
    const dMax = Math.max(1, ...units.map(u => km(u.c, centre!)));
    const order = new Map<string, number>();
    units.forEach(u => {
        const h = hash(`${s.id}|${u.id}`);
        let o = h;
        if (pattern === 'spread') o = 0.8 * (1 - km(u.c, centre!) / dMax) + 0.2 * h;
        if (pattern === 'patches') o = 0.65 * hash(`${s.id}|${u.area}`) + 0.35 * h;
        order.set(u.id, o);
    });
    return { scenario: s, units, order, centre, label, perUnit: per };
};

export type UnitState = 'off' | 'edge' | 'haze';
// State of every affected unit at time t (hours). 'edge' = about to go dark or just restored (strong red haze).
export const unitStates = (resolved: ScenarioUnits[], hours: number): Map<string, { state: UnitState; scenario: number }> => {
    const out = new Map<string, { state: UnitState; scenario: number }>();
    const rank: Record<UnitState, number> = { haze: 1, edge: 2, off: 3 };
    resolved.forEach((r, si) => {
        if (!r.units.length) return;
        const p = profileOf(r.scenario);
        const off = customersOffAt(p, hours);
        if (off <= 0) return;
        const fp = footprintOf(r.scenario);
        const capacity = r.units.length * r.perUnit;
        const share = Math.min(1, off / capacity);
        const block = fp.pattern === 'rota' ? Math.floor(hours / 3) : 0;
        r.units.forEach(u => {
            let o = r.order.get(u.id) || 0;
            if (fp.pattern === 'rota') o = (o + block * 0.37) % 1;
            const threshold = 1 - share;
            const state: UnitState = o > threshold ? 'off' : o > threshold - 0.12 ? 'edge' : 'haze';
            const prev = out.get(u.id);
            if (!prev || rank[state] > rank[prev.state]) out.set(u.id, { state, scenario: si });
        });
    });
    return out;
};

export const SCENARIO_COLOURS = ['#ef4444', '#f97316', '#e879f9', '#facc15', '#22d3ee'];

// Captions as the scenario plays: the scenario's own events plus milestones from the model
export const captionsFor = (scenarios: RiskScenario[], timeline: { hours?: number; consumersOffline: number; label?: string }[]): { atHours: number; text: string }[] => {
    const caps: { atHours: number; text: string }[] = [];
    scenarios.forEach(s => (s.events || []).forEach(e => caps.push({ atHours: e.atHours, text: e.text })));
    if (timeline.length > 1 && !scenarios.some(s => s.category === 'Growth')) {
        const peak = Math.max(...timeline.map(t => t.consumersOffline));
        if (peak > 0) {
            const iPeak = timeline.findIndex(t => t.consumersOffline === peak);
            const at = (i: number) => timeline[i].hours ?? i;
            if (!caps.some(c => c.atHours === 0)) caps.push({ atHours: 0, text: scenarios.length > 1 ? 'Events begin' : `${scenarios[0].name}: event begins` });
            caps.push({ atHours: at(iPeak), text: `Peak: ${peak.toLocaleString()} customers off supply` });
            const half = timeline.findIndex((t, i) => i > iPeak && t.consumersOffline <= peak * 0.5);
            if (half > 0) caps.push({ atHours: at(half), text: `Half of affected customers restored (${timeline[half].label})` });
            const ninety = timeline.findIndex((t, i) => i > iPeak && t.consumersOffline <= peak * 0.1);
            if (ninety > 0 && ninety !== half) caps.push({ atHours: at(ninety), text: `90% restored (${timeline[ninety].label})` });
            const done = timeline.findIndex((t, i) => i > iPeak && t.consumersOffline === 0);
            if (done > 0) caps.push({ atHours: at(done), text: `All customers back on supply (${timeline[done].label})` });
        } else caps.push({ atHours: 0, text: 'No customer power cuts in the base case. See the scenario\'s reasoning for what is at risk.' });
    }
    // A scenario's own (sourced) event text wins over an automatic milestone at about the same time
    const own = new Set(scenarios.flatMap(s => (s.events || []).map(e => e.text)));
    const kept = caps.filter(c => own.has(c.text) || !caps.some(o => own.has(o.text) && Math.abs(o.atHours - c.atHours) < 0.5));
    return kept.sort((a, b) => a.atHours - b.atHours);
};

// Energy routes a scenario cuts, resolved against the live flows (so "largest gas route" means the largest right now)
export interface CutRoute { id: string; name: string; kind: 'electricity' | 'gas'; gw: number; why: string }
export const resolveRoutes = (scenarios: RiskScenario[], links: FlowLink[]): CutRoute[] => {
    const out = new Map<string, CutRoute>();
    const add = (l: FlowLink | undefined, why: string) => { if (l && !out.has(l.id)) out.set(l.id, { id: l.id, name: l.name, kind: l.kind, gw: l.gw, why }); };
    const biggest = (kind: 'electricity' | 'gas', not: Set<string>) => links.filter(l => l.kind === kind && l.gw > 0 && !not.has(l.id)).sort((a, b) => b.gw - a.gw)[0];
    scenarios.forEach(s => (footprintOf(s).routes || []).forEach(r => {
        const taken = new Set(out.keys());
        if (r === 'largestGas') add(biggest('gas', taken), 'Largest gas import route at the moment (live)');
        else if (r === 'largestElec') add(biggest('electricity', taken), 'Largest electricity import at the moment (live)');
        else if (r === 'norway') add(links.find(l => l.id === 'g_langeled'), 'Norwegian pipeline gas (Langeled route)');
        else if (r === 'lng') ['g_grain', 'g_milford'].forEach(id => add(links.find(l => l.id === id), 'LNG import terminal'));
        else add(links.find(l => l.id === r), 'Named in the scenario');
    }));
    return [...out.values()];
};
export const fleetOf = (scenarios: RiskScenario[]) => [...new Set(scenarios.flatMap(s => footprintOf(s).fleet || []))];
