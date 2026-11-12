// Live system feeds (all free, no keys):
//   - Interconnector flows       Elexon FUELINST dataset (signed: + import, - export)
//   - Regional carbon & mix      NESO Carbon Intensity API (by DNO region)
//   - Flood warnings             Environment Agency (England)
//   - Gas system                 National Gas, via the site's Cloudflare Worker
//   - Weather warnings           Met Office, via the site's Cloudflare Worker
import { OUTAGE_WORKER_URL } from '../config';

const fetchJson = async (url: string, ms = 10000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), ms);
    try {
        const r = await fetch(url, { signal: controller.signal });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return await r.json();
    } finally {
        clearTimeout(id);
    }
};

// ---------- Interconnector flows ----------
export interface InterconnectorFlow { code: string; name: string; country: string; mw: number; capacityMW: number; lat: number; lng: number; }

// GB landing points (approximate) and nominal capacities.
const INTERCONNECTORS: Record<string, { name: string, country: string, capacityMW: number, lat: number, lng: number }> = {
    INTFR:   { name: 'IFA', country: 'France', capacityMW: 2000, lat: 51.106, lng: 0.975 },
    INTIFA2: { name: 'IFA2', country: 'France', capacityMW: 1000, lat: 50.845, lng: -1.265 },
    INTELEC: { name: 'ElecLink', country: 'France', capacityMW: 1000, lat: 51.094, lng: 1.144 },
    INTNED:  { name: 'BritNed', country: 'Netherlands', capacityMW: 1000, lat: 51.444, lng: 0.709 },
    INTNEM:  { name: 'Nemo Link', country: 'Belgium', capacityMW: 1000, lat: 51.305, lng: 1.348 },
    INTNSL:  { name: 'North Sea Link', country: 'Norway', capacityMW: 1400, lat: 55.139, lng: -1.519 },
    INTVKL:  { name: 'Viking Link', country: 'Denmark', capacityMW: 1400, lat: 52.931, lng: -0.188 },
    INTIRL:  { name: 'Moyle', country: 'Northern Ireland', capacityMW: 500, lat: 55.072, lng: -4.975 },
    INTEW:   { name: 'East West', country: 'Ireland', capacityMW: 500, lat: 53.226, lng: -3.072 },
    INTGRNL: { name: 'Greenlink', country: 'Ireland', capacityMW: 500, lat: 51.683, lng: -4.992 },
};

// Elexon FUELINST: instantaneous output by fuel type every 5 minutes. Interconnector values are signed
// (positive = import into GB, negative = export). The "generation/outturn/current" summary is not used
// because it shows exports as zero.
export const fetchInterconnectorFlows = async (): Promise<InterconnectorFlow[]> => {
    const to = new Date(), from = new Date(to.getTime() - 40 * 60000);
    const json = await fetchJson(`https://data.elexon.co.uk/bmrs/api/v1/datasets/FUELINST?publishDateTimeFrom=${from.toISOString()}&publishDateTimeTo=${to.toISOString()}&format=json`);
    const latest: Record<string, { t: string, mw: number }> = {};
    for (const r of (json.data || json || [])) {
        if (!INTERCONNECTORS[r.fuelType]) continue;
        const t = r.startTime || r.publishTime || '';
        if (!latest[r.fuelType] || t >= latest[r.fuelType].t) latest[r.fuelType] = { t, mw: Math.round(r.generation || 0) };
    }
    return Object.keys(INTERCONNECTORS).filter(k => latest[k]).map(k => ({ code: k, ...INTERCONNECTORS[k], mw: latest[k].mw }));
};

// ---------- Regional carbon intensity & generation mix (by DNO region) ----------
export interface RegionalCarbon { regionId: number; name: string; intensity: number; index: string; mix: { fuel: string, perc: number }[]; }

// NESO Carbon Intensity region id -> NESO DNO licence-area name used on the map
export const CI_REGION_TO_DNO_AREA: Record<number, string> = {
    1: 'North Scotland', 2: 'South and Central Scotland', 3: 'North West England', 4: 'North East England',
    5: 'Yorkshire', 6: 'North Wales, Merseyside and Cheshire', 7: 'South Wales', 8: 'West Midlands',
    9: 'East Midlands', 10: 'East England', 11: 'South West England', 12: 'Southern England',
    13: 'London', 14: 'South East England',
};

export const fetchRegionalCarbon = async (): Promise<Record<string, RegionalCarbon>> => {
    const json = await fetchJson('https://api.carbonintensity.org.uk/regional');
    const out: Record<string, RegionalCarbon> = {};
    (json.data?.[0]?.regions || []).forEach((r: any) => {
        const area = CI_REGION_TO_DNO_AREA[r.regionid];
        if (!area) return;
        out[area] = {
            regionId: r.regionid,
            name: r.shortname,
            intensity: r.intensity?.forecast ?? 0,
            index: r.intensity?.index || '',
            mix: (r.generationmix || []).filter((m: any) => m.perc > 0).sort((a: any, b: any) => b.perc - a.perc),
        };
    });
    return out;
};

// ---------- Environment Agency flood warnings (England) ----------
export interface FloodWarning { id: string; severity: string; level: number; area: string; county: string; message: string; raised: string; lat?: number; lng?: number; }

const floodAreaCache = new Map<string, { lat: number, lng: number }>();

export const fetchFloodWarnings = async (): Promise<{ warnings: FloodWarning[], alerts: number }> => {
    const json = await fetchJson('https://environment.data.gov.uk/flood-monitoring/id/floods');
    const items = (json.items || []).filter((f: any) => f.severityLevel && f.severityLevel <= 3);
    const alerts = items.filter((f: any) => f.severityLevel === 3).length;
    // Map only Flood Warnings (2) and Severe Flood Warnings (1); alerts are counted.
    const serious = items.filter((f: any) => f.severityLevel <= 2).slice(0, 80);
    await Promise.all(serious.map(async (f: any) => {
        const code = f.floodAreaID || f.floodArea?.notation;
        if (!code || floodAreaCache.has(code)) return;
        try {
            const a = await fetchJson(`https://environment.data.gov.uk/flood-monitoring/id/floodAreas/${encodeURIComponent(code)}`, 8000);
            const it = Array.isArray(a.items) ? a.items[0] : a.items;
            if (typeof it?.lat === 'number' && typeof it?.long === 'number') floodAreaCache.set(code, { lat: it.lat, lng: it.long });
        } catch { /* skip */ }
    }));
    return {
        alerts,
        warnings: serious.map((f: any) => {
            const code = f.floodAreaID || f.floodArea?.notation;
            const loc = floodAreaCache.get(code);
            return {
                id: code,
                severity: f.severity || (f.severityLevel === 1 ? 'Severe Flood Warning' : 'Flood Warning'),
                level: f.severityLevel,
                area: f.description || f.eaAreaName || code,
                county: f.floodArea?.county || '',
                message: String(f.message || '').slice(0, 300),
                raised: f.timeRaised || '',
                lat: loc?.lat,
                lng: loc?.lng,
            };
        }),
    };
};

// ---------- Gas system (via Worker) ----------
export interface GasSnapshot {
    asAt: string | null; ntsDemand: number | null; totalSupply: number | null; linepack: number | null; ldzDemand: number | null;
    powerStations: number | null; industrial: number | null; storageInjection: number | null; exports: number | null;
    // From Worker v3 (National Gas "latest gas flows"): mcm/d by entry point, terminal and export point
    entryPoints?: Record<string, number>; terminals?: Record<string, number>; exportsBy?: Record<string, number | null>;
}

export const fetchGasSnapshot = async (): Promise<GasSnapshot | null> => {
    if (!OUTAGE_WORKER_URL) return null;
    const json = await fetchJson(OUTAGE_WORKER_URL.replace(/\/$/, '') + '/gas', 15000);
    return json.error ? null : json;
};

// ---------- Met Office weather warnings (via Worker) ----------
export interface WeatherWarning { title: string; level: string; type: string; region: string; description: string; link: string; lat?: number; lng?: number; }

// Approximate centres of Met Office warning regions, for map markers.
const MET_REGIONS: Record<string, [number, number]> = {
    'orkney & shetland': [59.6, -2.2], 'highlands & eilean siar': [57.6, -5.2], 'grampian': [57.2, -2.6],
    'strathclyde': [55.8, -4.7], 'central, tayside & fife': [56.4, -3.6], 'sw scotland, lothian borders': [55.5, -3.2],
    'northern ireland': [54.6, -6.7], 'wales': [52.3, -3.7], 'north west england': [54.1, -2.7],
    'north east england': [54.9, -1.7], 'yorkshire & humber': [53.9, -1.3], 'west midlands': [52.5, -2.2],
    'east midlands': [52.9, -0.9], 'east of england': [52.3, 0.6], 'south west england': [50.8, -3.8],
    'london & south east england': [51.3, -0.3],
};

export const fetchWeatherWarnings = async (): Promise<WeatherWarning[]> => {
    if (!OUTAGE_WORKER_URL) return [];
    const json = await fetchJson(OUTAGE_WORKER_URL.replace(/\/$/, '') + '/warnings', 15000);
    return (json.warnings || []).map((w: any) => {
        const key = Object.keys(MET_REGIONS).find(k => String(w.region || '').toLowerCase().includes(k));
        return { ...w, lat: key ? MET_REGIONS[key][0] : undefined, lng: key ? MET_REGIONS[key][1] : undefined };
    });
};

// ---------- NESO system warnings (Elexon SYSWARN) ----------
export interface SystemWarning { type: string; text: string; published: string; }

// Notices that matter for security of supply. Routine trading notices (e.g. SO-SO trades) are left out.
const SIGNIFICANT = /MARGIN|CAPACITY MARKET|DEMAND CONTROL|DEMAND REDUCTION|NRAPM|EMERGENCY|SYSTEM WARNING|HIGH RISK|ELECTRICITY MARGIN|BLACK START|DEFICIT/i;

export const fetchSystemWarnings = async (): Promise<SystemWarning[]> => {
    const now = new Date();
    const from = new Date(now.getTime() - 48 * 3600000).toISOString();
    const json = await fetchJson(`https://data.elexon.co.uk/bmrs/api/v1/datasets/SYSWARN?publishDateTimeFrom=${from}&publishDateTimeTo=${now.toISOString()}&format=json`);
    return (json.data || [])
        .filter((w: any) => SIGNIFICANT.test(`${w.warningType} ${w.warningText}`))
        .map((w: any) => ({
            type: w.warningType || 'System warning',
            text: String(w.warningText || '').replace(/\\r\\n|\r\n|\\n/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400),
            published: w.publishTime,
        }))
        .sort((a: SystemWarning, b: SystemWarning) => b.published.localeCompare(a.published));
};
