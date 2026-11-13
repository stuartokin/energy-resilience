// Energy flowing into and out of Great Britain right now: electricity interconnectors and gas,
// on one scale (GW) so they can be compared.
//   Electricity: Elexon FUELINST, MW per interconnector (+ import, - export).
//   Gas: National Gas "latest gas flows" by entry point and export point, mcm/d (via the site's Worker).
// Converting gas to GW uses an assumed calorific value (GAS_CV_MJ_PER_M3, below) and is labelled as such.
// Map paths are drawn from the far end (country / field / LNG approach) to the GB landing point.
// They show the general route only, not the exact cable or pipeline route.
import { InterconnectorFlow, GasSnapshot } from './liveSystems';

export const GAS_CV_MJ_PER_M3 = 39.5;
// 1 mcm/d = 1e6 m3 x 39.5 MJ/m3 per 86,400 s = 457 MW
export const GW_PER_MCMD = (1e6 * GAS_CV_MJ_PER_M3 * 1e6) / 86400 / 1e9;
export const GAS_CV_NOTE = `Gas converted at ${GAS_CV_MJ_PER_M3} MJ/m³, a typical calorific value for GB transmission gas (National Gas publishes the actual daily values, usually 38-41 MJ/m³), so 1 mcm/d ≈ ${(GW_PER_MCMD * 1000).toFixed(0)} MW.`;

export type FlowGroup = 'Interconnector' | 'Norway pipeline' | 'LNG' | 'Continental pipeline' | 'UK & Norway (mixed)' | 'UK North Sea' | 'Storage' | 'Export pipeline';

export interface FlowLink {
    id: string;
    kind: 'electricity' | 'gas';
    name: string;          // e.g. "Langeled", "IFA"
    from: string;          // far end, e.g. "Norway (Nyhamna)", "France"
    landing: string;       // GB end
    group: FlowGroup;
    value: number;         // native units, signed: + into GB, - out of GB
    unit: 'MW' | 'mcm/d';
    gw: number;            // signed GW
    capacity?: number;     // native units, where known
    path: [number, number][]; // [lng, lat], far end first, GB landing last
    note?: string;
}

// ---------- Electricity: far-end points (approximate) for each interconnector ----------
const ELEC_PATHS: Record<string, { from: string, path: [number, number][] }> = {
    INTFR:   { from: 'France (Bonningues-lès-Calais)', path: [[1.80, 50.89], [1.40, 51.02], [0.975, 51.106]] },
    INTIFA2: { from: 'France (Tourbe, Normandy)', path: [[-0.27, 49.12], [-0.60, 49.75], [-1.10, 50.45], [-1.265, 50.845]] },
    INTELEC: { from: 'France (Coquelles, via the Channel Tunnel)', path: [[1.79, 50.92], [1.144, 51.094]] },
    INTNED:  { from: 'Netherlands (Maasvlakte)', path: [[4.05, 51.95], [2.40, 51.75], [0.709, 51.444]] },
    INTNEM:  { from: 'Belgium (Zeebrugge)', path: [[3.19, 51.31], [2.20, 51.33], [1.348, 51.305]] },
    INTNSL:  { from: 'Norway (Kvilldal)', path: [[6.60, 59.50], [4.80, 58.90], [1.50, 56.60], [-1.519, 55.139]] },
    INTVKL:  { from: 'Denmark (Revsing)', path: [[9.10, 55.50], [7.80, 55.40], [4.50, 54.40], [1.20, 53.30], [-0.188, 52.931]] },
    INTIRL:  { from: 'Northern Ireland (Ballycronan More)', path: [[-5.82, 54.86], [-5.40, 54.98], [-4.975, 55.072]] },
    INTEW:   { from: 'Ireland (Woodland, Co. Meath)', path: [[-6.48, 53.53], [-6.08, 53.53], [-4.60, 53.45], [-3.072, 53.226]] },
    INTGRNL: { from: 'Ireland (Great Island, Co. Wexford)', path: [[-6.95, 52.27], [-6.30, 52.00], [-4.992, 51.683]] },
};

// ---------- Gas: entry points grouped into routes ----------
interface GasRoute { id: string; name: string; from: string; landing: string; group: FlowGroup; entries?: string[]; terminal?: string; exportName?: string; path: [number, number][]; note?: string; }
export const GAS_ROUTES: GasRoute[] = [
    { id: 'langeled', name: 'Langeled', from: 'Norway (Nyhamna, via Sleipner)', landing: 'Easington', group: 'Norway pipeline', entries: ['EASINGTON LANGELED'],
      path: [[6.95, 62.85], [3.50, 60.50], [1.91, 58.37], [1.00, 55.50], [0.11, 53.66]] },
    { id: 'stfergus', name: 'St Fergus', from: 'Northern North Sea (UK and Norwegian fields)', landing: 'St Fergus', group: 'UK & Norway (mixed)', entries: ['ST FERGUS MOBIL', 'ST FERGUS NSMP', 'ST FERGUS SHELL'],
      path: [[2.20, 60.80], [0.80, 59.20], [-1.83, 57.58]], note: 'St Fergus receives gas from UK fields and, via the Vesterled and FLAGS/Tampen pipelines, from Norway. The terminal flow can\'t be split by country from this data.' },
    { id: 'teesside', name: 'Teesside (CATS)', from: 'Central North Sea', landing: 'Teesside', group: 'UK North Sea', entries: ['TEESSIDE CATS', 'TEESSIDE NSMP'],
      path: [[1.80, 57.00], [0.20, 55.40], [-1.13, 54.63]] },
    { id: 'bacton_ukcs', name: 'Bacton (UK fields)', from: 'Southern and central North Sea', landing: 'Bacton', group: 'UK North Sea', entries: ['BACTON PERENCO', 'BACTON SEAL', 'BACTON SHELL'],
      path: [[2.40, 53.40], [1.46, 52.86]] },
    { id: 'dimlington', name: 'Easington (Dimlington)', from: 'Southern North Sea', landing: 'Easington', group: 'UK North Sea', entries: ['EASINGTON DIMLINGTON'],
      path: [[1.30, 53.95], [0.11, 53.66]] },
    { id: 'barrow', name: 'Barrow', from: 'East Irish Sea (Morecambe Bay)', landing: 'Barrow', group: 'UK North Sea', terminal: 'BARROW TERMINAL',
      path: [[-3.60, 53.88], [-3.17, 54.09]] },
    { id: 'bbl', name: 'BBL', from: 'Netherlands (Balgzand)', landing: 'Bacton', group: 'Continental pipeline', entries: ['BACTON BBL'], exportName: 'Bacton BBL Export',
      path: [[4.77, 52.92], [3.00, 52.95], [1.46, 52.86]] },
    { id: 'iuk', name: 'Interconnector (IUK)', from: 'Belgium (Zeebrugge)', landing: 'Bacton', group: 'Continental pipeline', entries: ['BACTON IC'], exportName: 'Bacton INT Export',
      path: [[3.20, 51.33], [2.40, 52.10], [1.46, 52.86]] },
    { id: 'grain', name: 'Isle of Grain LNG', from: 'LNG tankers (Thames Estuary approach)', landing: 'Isle of Grain', group: 'LNG', terminal: 'ISLE OF GRAIN TERMINAL',
      path: [[1.90, 51.62], [1.20, 51.52], [0.72, 51.44]] },
    { id: 'milford', name: 'Milford Haven LNG', from: 'LNG tankers (Celtic Sea approach)', landing: 'Milford Haven (South Hook, Dragon)', group: 'LNG', entries: ['MILFORD HAVEN - DRAGON', 'MILFORD HAVEN - SOUTH HOOK'],
      path: [[-6.60, 51.25], [-5.60, 51.55], [-5.05, 51.70]] },
    { id: 'rough', name: 'Rough storage', from: 'Rough field (offshore storage)', landing: 'Easington', group: 'Storage', entries: ['EASINGTON ROUGH ST'],
      path: [[0.47, 53.83], [0.11, 53.66]] },
    { id: 'moffat', name: 'Moffat', from: 'Ireland and Northern Ireland (Scotland-Ireland pipelines)', landing: 'Moffat', group: 'Export pipeline', exportName: 'Moffat Export',
      path: [[-6.21, 53.64], [-5.20, 54.30], [-4.13, 54.78], [-3.44, 55.33]] },
];
// Onshore storage sites (withdrawals into the NTS); shown in the panel, not as arrows
export const GAS_ONSHORE_STORAGE = ['ALDBROUGH', 'HORNSEA', 'STUBLACH', 'HILLTOP', 'HOLE HOUSE FARM', 'HOLFORD'];

const sum = (o: Record<string, number> | undefined, keys: string[] = []) => keys.reduce((a, k) => a + (o?.[k] || 0), 0);

export interface FlowsSummary {
    links: FlowLink[];
    elecImportGW: number; elecExportGW: number;
    gasImportGW: number; gasExportGW: number; gasMixedGW: number; gasUkGW: number; gasStorageGW: number;
    gasSupplyMcmd: number | null; gasDemandMcmd: number | null;
    gasImportShare: number | null; // share of GB gas supply that is clearly imported (Norway pipeline, LNG, continent)
    hasGasDetail: boolean;
    asAt: { gas: string | null };
}

export const buildFlows = (elec: InterconnectorFlow[], gas: GasSnapshot | null): FlowsSummary => {
    const links: FlowLink[] = [];
    for (const f of elec) {
        const p = ELEC_PATHS[f.code];
        if (!p) continue;
        links.push({ id: `e_${f.code}`, kind: 'electricity', name: f.name, from: p.from, landing: '', group: 'Interconnector', value: f.mw, unit: 'MW', gw: f.mw / 1000, capacity: f.capacityMW, path: [...p.path] });
    }
    const hasGasDetail = !!gas?.entryPoints;
    if (gas && hasGasDetail) {
        for (const r of GAS_ROUTES) {
            let v = r.entries ? sum(gas.entryPoints, r.entries) : 0;
            if (r.terminal && gas.terminals?.[r.terminal] !== undefined) v = Math.max(v, gas.terminals[r.terminal]);
            if (r.exportName) v -= gas.exportsBy?.[r.exportName] || 0;
            links.push({ id: `g_${r.id}`, kind: 'gas', name: r.name, from: r.from, landing: r.landing, group: r.group, value: Math.round(v * 10) / 10, unit: 'mcm/d', gw: v * GW_PER_MCMD, path: [...r.path], note: r.note });
        }
    }
    const g = (grp: FlowGroup[]) => links.filter(l => l.kind === 'gas' && grp.includes(l.group));
    const pos = (ls: FlowLink[]) => ls.reduce((a, l) => a + Math.max(0, l.gw), 0);
    const neg = (ls: FlowLink[]) => ls.reduce((a, l) => a + Math.max(0, -l.gw), 0);
    const elecLinks = links.filter(l => l.kind === 'electricity');
    const onshoreStorage = sum(gas?.entryPoints, GAS_ONSHORE_STORAGE) * GW_PER_MCMD;
    const imports = pos(g(['Norway pipeline', 'LNG', 'Continental pipeline']));
    const supplyGW = gas?.totalSupply ? gas.totalSupply * GW_PER_MCMD : null;
    return {
        links,
        elecImportGW: pos(elecLinks), elecExportGW: neg(elecLinks),
        gasImportGW: imports,
        gasExportGW: neg(g(['Continental pipeline', 'Export pipeline'])),
        gasMixedGW: pos(g(['UK & Norway (mixed)'])),
        gasUkGW: pos(g(['UK North Sea'])),
        gasStorageGW: pos(g(['Storage'])) + onshoreStorage,
        gasSupplyMcmd: gas?.totalSupply ?? null,
        gasDemandMcmd: gas?.ntsDemand ?? null,
        gasImportShare: supplyGW ? imports / supplyGW : null,
        hasGasDetail,
        asAt: { gas: gas?.asAt || null },
    };
};

export const fmtGW = (gw: number) => Math.abs(gw) >= 10 ? `${Math.abs(gw).toFixed(0)} GW` : `${Math.abs(gw).toFixed(1)} GW`;
export const fmtNative = (l: FlowLink) => l.unit === 'MW' ? `${Math.abs(l.value).toLocaleString()} MW` : `${Math.abs(l.value).toFixed(1)} mcm/d`;
