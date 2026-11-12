// Who connects to what: generator / battery connection data from public registers
// (built into public/data/connections.json by scripts/build-connections.mjs).
//   ECR rows: DNO Embedded Capacity Registers, sites of 1 MW and above, with their
//             Primary -> Bulk Supply Point -> Grid Supply Point connection chain.
//   TEC rows: NESO TEC and Embedded Registers, the transmission connection site of large projects.
// Matching a map substation to a register entry is done by name, so it can miss or (rarely)
// mis-match where names differ. Every popup that uses this says so.
import { markOk, markFail } from './health';

export interface EcrSite { site: string; lat: number; lng: number; gsp: string; bsp: string; primary: string; kV: number | null; fuel: string; technology: string; mw: number; connected: boolean; dno: string; }
export interface TecProject { project: string; site: string; mwConnected: number; mwTotal: number; plantType: string; status: string; hostTO: string; effectiveFrom: string; register: 'T' | 'E'; }
export interface RepdSite { site: string; lat: number; lng: number; fuel: string; technology: string; mw: number; status: 'O' | 'C' | 'A'; operator: string; repdId: string; }
export const REPD_STATUS: Record<string, string> = { O: 'Operational', C: 'Under construction', A: 'Planning granted, awaiting construction' };
export const REPD_SOURCE = 'DESNZ Renewable Energy Planning Database (Open Government Licence)';
export interface ConnectionSource { id: string; name: string; licence?: string; records?: number; ok: boolean; note?: string; }
export interface ConnectionsData { built: string; sources: ConnectionSource[]; ecr: EcrSite[]; tec: TecProject[]; repd: RepdSite[]; byName: Map<string, { ecr: { site: EcrSite; level: 'GSP' | 'BSP' | 'Primary' }[]; tec: TecProject[] }>; }

export const ECR_SOURCE_LABEL: Record<string, string> = {
    npg: 'Northern Powergrid Embedded Capacity Register (NPg Open Data Licence)',
    spen: 'SP Energy Networks Embedded Capacity Register (CC BY 4.0)',
    ukpn: 'UK Power Networks Embedded Capacity Register (CC BY 4.0)',
};

// "BRORA 132/33KV GRID SUPPLY POINT SUBSTATION" -> "brora"; "Berkswell GSP" -> "berkswell"
export const normaliseSubName = (s: string) => String(s || '').toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/\d+(\.\d+)?(\s*[\/ ]\s*\d+(\.\d+)?)*\s*kv/g, ' ')
    .replace(/\b(grid supply point|bulk supply point|supply point|primary|substation|sub station|s ?stn|gsp|bsp|grid|direct|switching station|converter station|connection node|node|power station|tee|kv)\b/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ').trim()
    .replace(/(\s\d+)+$/, ''); // "Keadby 3", "Osgodby 1 2" -> the site name

// A "primary" named after the site itself is the site's own private substation, not a network one
export const sameAsSite = (name: string, site: string) => {
    const a = normaliseSubName(name), b = normaliseSubName(site);
    return !!a && !!b && (a === b || b.startsWith(a + ' ') || a.startsWith(b + ' '));
};

let cache: Promise<ConnectionsData | null> | null = null;

export const loadConnections = (): Promise<ConnectionsData | null> => {
    if (cache) return cache;
    cache = (async () => {
        try {
            const res = await fetch(`${import.meta.env.BASE_URL}data/connections.json`);
            if (!res.ok || (res.headers.get('content-type') || '').includes('text/html')) throw new Error('not built yet');
            const j = await res.json();
            const ecr: EcrSite[] = (j.ecr || []).map((r: any[]) => ({ site: r[0], lat: r[1], lng: r[2], gsp: r[3], bsp: r[4], primary: r[5], kV: r[6], fuel: r[7], technology: r[8], mw: r[9], connected: r[10] === 'C', dno: r[11] }));
            const tec: TecProject[] = (j.tec || []).map((r: any[]) => ({ project: r[0], site: r[1], mwConnected: r[2], mwTotal: r[3], plantType: r[4], status: r[5], hostTO: r[6], effectiveFrom: r[7], register: r[8] }));
            const repd: RepdSite[] = (j.repd || []).map((r: any[]) => ({ site: r[0], lat: r[1], lng: r[2], fuel: r[3], technology: r[4], mw: r[5], status: r[6], operator: r[7], repdId: r[8] }));
            const byName: ConnectionsData['byName'] = new Map();
            const slot = (name: string) => {
                const k = normaliseSubName(name);
                if (!k) return null;
                if (!byName.has(k)) byName.set(k, { ecr: [], tec: [] });
                return byName.get(k)!;
            };
            for (const s of ecr) {
                // A site whose "primary" is its own name (a direct connection) is not a separate substation
                const seen = new Set<string>();
                for (const [name, level] of [[s.primary, 'Primary'], [s.bsp, 'BSP'], [s.gsp, 'GSP']] as const) {
                    const k = normaliseSubName(name);
                    if (!k || seen.has(k) || sameAsSite(name, s.site)) continue;
                    seen.add(k);
                    slot(name)?.ecr.push({ site: s, level });
                }
            }
            for (const t of tec) slot(t.site)?.tec.push(t);
            markOk('connections');
            return { built: j.built, sources: j.sources || [], ecr, tec, repd, byName };
        } catch (e: any) {
            markFail('connections', e?.message || 'unavailable');
            return null;
        }
    })();
    return cache;
};

const isBuilt = (t: TecProject) => /built/i.test(t.status) || t.mwConnected > 0;

// What the registers say connects at a substation with this name
export const connectionsAt = (data: ConnectionsData | null, name: string) => {
    if (!data || !name) return null;
    const hit = data.byName.get(normaliseSubName(name));
    if (!hit) return null;
    const connected = hit.ecr.filter(e => e.site.connected);
    const accepted = hit.ecr.filter(e => !e.site.connected);
    // A large DNO-connected station can appear in both the ECR and the NESO register: count it once
    const tecBuilt = hit.tec.filter(t => t.mwConnected > 0 && !connected.some(e => sameAsSite(t.project, e.site.site)));
    const tecQueue = hit.tec.filter(t => !/built/i.test(t.status) && t.mwTotal > t.mwConnected);
    const byFuel: Record<string, number> = {};
    connected.forEach(e => { byFuel[e.site.fuel] = (byFuel[e.site.fuel] || 0) + e.site.mw; });
    tecBuilt.forEach(t => { const f = fuelOfPlantType(t.plantType); byFuel[f] = (byFuel[f] || 0) + t.mwConnected; });
    return {
        connected, accepted, tecBuilt, tecQueue, byFuel,
        connectedMW: connected.reduce((a, e) => a + e.site.mw, 0) + tecBuilt.reduce((a, t) => a + t.mwConnected, 0),
        queueMW: accepted.reduce((a, e) => a + e.site.mw, 0) + tecQueue.reduce((a, t) => a + Math.max(0, t.mwTotal - t.mwConnected), 0),
        sources: Array.from(new Set([...hit.ecr.map(e => ECR_SOURCE_LABEL[e.site.dno] || e.site.dno), ...(hit.tec.length ? ['NESO TEC / Embedded Register (NESO Open Data Licence)'] : [])])),
    };
};

// The transmission connection site of a power station, by project-name match
export const tecForStation = (data: ConnectionsData | null, stationName: string) => {
    if (!data || !stationName) return null;
    const k = normaliseSubName(stationName).replace(/\b(wind farm|windfarm|offshore|solar farm|solar park|battery|bess|energy storage|ccgt|ocgt)\b/g, ' ').replace(/\s+/g, ' ').trim();
    if (k.length < 4) return null;
    const matches = data.tec.filter(t => {
        const p = normaliseSubName(t.project).replace(/\b(wind farm|windfarm|offshore|solar farm|solar park|battery|bess|energy storage|ccgt|ocgt)\b/g, ' ').replace(/\s+/g, ' ').trim();
        return p === k || (p.startsWith(k + ' ') && isBuilt(t));
    });
    return matches.sort((a, b) => Number(isBuilt(b)) - Number(isBuilt(a)) || b.mwTotal - a.mwTotal)[0] || null;
};

export const fuelOfPlantType = (s: string) => {
    const t = String(s || '').toLowerCase();
    if (/storage|battery/.test(t)) return 'storage';
    if (/pv|solar/.test(t)) return 'solar';
    if (/offshore/.test(t)) return 'wind_offshore';
    if (/wind/.test(t)) return 'wind';
    if (/nuclear/.test(t)) return 'nuclear';
    if (/hydro|pump|tidal|wave/.test(t)) return 'hydro';
    if (/biomass/.test(t)) return 'biomass';
    if (/ccgt|ocgt|gas|chp|reciprocating/.test(t)) return 'gas';
    if (/demand/.test(t)) return 'demand';
    return 'other';
};

export const FUEL_LABEL: Record<string, string> = {
    storage: 'Battery / storage', solar: 'Solar', wind: 'Onshore wind', wind_offshore: 'Offshore wind', hydro: 'Hydro / marine',
    biomass: 'Bioenergy', waste: 'Energy from waste', gas: 'Gas', oil: 'Oil / diesel', nuclear: 'Nuclear', demand: 'Demand', other: 'Other',
};
export const FUEL_COLOUR: Record<string, string> = {
    storage: '#a3e635', solar: '#facc15', wind: '#10b981', wind_offshore: '#14b8a6', hydro: '#60a5fa', biomass: '#84cc16',
    waste: '#a8a29e', gas: '#f97316', oil: '#ef4444', nuclear: '#a855f7', demand: '#e879f9', other: '#94a3b8',
};

// ---------- Inferred connections (where no register publishes one) ----------
// Rule of thumb, an assumption: larger sites connect at higher voltage. Typical GB distribution
// connection voltages are 11 kV, 33 kV, 66 kV (some areas) and 132 kV. Used only to choose the most
// plausible nearby substation; the result is always labelled as inferred.
export const minVoltageForMW = (mw: number) => (mw < 1 ? 0 : mw < 10 ? 11000 : mw < 30 ? 33000 : mw < 100 ? 66000 : 132000);
export const searchRadiusKm = (mw: number) => (mw < 10 ? 10 : mw < 100 ? 25 : 50);
export const INFERENCE_NOTE = 'Inferred from OpenStreetMap: the nearest mapped substation with a voltage suited to the site\'s size. Not published by the network operator, so it may be wrong.';
