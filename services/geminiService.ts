
import { GoogleGenAI, Modality, Type, FunctionDeclaration } from "@google/genai";
import { RiskScenario, InfrastructureAsset, TimelineStep, ChatMessage, OutageEvent, GenerationMix, LogEntry, DNORegion, GeneratorOutage } from '../types';
import { ASSET_TYPES, DEEP_SEARCH_PROTOCOLS, REGIONS, UK_DNO_REGIONS } from '../constants';
import { getAiKey, onAiKeyChange, requestAiKey } from './aiKey';
import { OUTAGE_WORKER_URL } from '../config';
import { markOk, markFail, statusOf } from './health';
import { buildTimeline, describeProfile, profileOf, methodNote } from './impactModel';
import { MODEL_PATTERNS } from '../content/scenarios';
import { loadConnections, ConnectionSource } from './connections';

// One System Status row per connection register, from the last build (shows whether the GitHub secrets work)
let connSources: ConnectionSource[] = [];
let connBuilt = '';
loadConnections().then(d => { if (d) { connSources = d.sources; connBuilt = d.built; } });
const connectionSourceRows = () => connSources.map(src => ({
    org: `  ↳ ${src.name}`,
    status: src.ok ? 'Operational' : 'Unavailable',
    keyStatus: src.ok ? `${(src.records ?? 0).toLocaleString()} records${src.note ? ` (${src.note})` : ''} · built ${connBuilt ? new Date(connBuilt).toLocaleDateString('en-GB') : '?'}` : (src.note || 'failed'),
    type: 'Connection data (build time)',
}));

let aiClient: GoogleGenAI | null = null;
let isAudioQuotaExceeded = false;
let isGenAIQuotaExceeded = false; // Track general API health

// Elexon Insights Solution API: free, open, no key required.
const ELEXON_API = 'https://data.elexon.co.uk/bmrs/api/v1';

// Simple In-Memory Cache
const analysisCache = new Map<string, string>();
const outageCache = new Map<string, { timestamp: number, data: OutageEvent[] }>();
const historyCache = new Map<string, any[]>();

// Logging System
const systemLogs: LogEntry[] = [];

export const logSystemError = (message: string, details?: any, type: 'error'|'warning'|'info' = 'error') => {
    systemLogs.push({
        timestamp: Date.now(),
        message,
        details: typeof details === 'object' ? JSON.stringify(details, null, 2) : String(details || ''),
        type
    });
    // Keep log size manageable
    if (systemLogs.length > 50) systemLogs.shift();
};

export const getSystemLogs = () => [...systemLogs].reverse();

// The Gemini key is supplied by each visitor and stored in their own browser.
export const initGenAI = () => {
    const key = getAiKey();
    if (key) {
        aiClient = new GoogleGenAI({ apiKey: key });
        isGenAIQuotaExceeded = false;
    } else {
        aiClient = null;
    }
};

// Rebuild the client whenever the visitor adds, changes or removes their key.
if (typeof window !== 'undefined') {
    onAiKeyChange(() => {
        aiClient = null;
        isAudioQuotaExceeded = false;
        initGenAI();
    });
}

const handleApiError = (e: any) => {
    // Detect Quota Limit (429) or Service Unavailable (503)
    if (e.status === 429 || (e.message && (e.message.includes('429') || e.message.includes('Quota') || e.message.includes('Resource exhausted')))) {
        isGenAIQuotaExceeded = true;
        logSystemError("GenAI Quota Exceeded", e.message, "warning");
    } else {
        logSystemError("API Error", e.message || e.toString(), "error");
    }
};

export const getApiSystemStatus = () => {
    const hasKey = !!getAiKey();
    const row = (org: string, source: string, type: string, keyStatus = 'Open Data') => {
        const h = statusOf(source);
        return { org, status: h.status, keyStatus: h.detail || keyStatus, type };
    };
    return [
        {
            org: "Google Gemini (your key)",
            status: !hasKey ? "Not set" : isGenAIQuotaExceeded ? "Degraded" : "Operational",
            keyStatus: !hasKey ? "Add key to enable AI" : isGenAIQuotaExceeded ? "Quota Limit" : "Your key",
            type: "AI Analysis"
        },
        row("UK Power Networks", 'ukpn', "Live Power Cuts"),
        row("Northern Powergrid", 'npg', "Live Power Cuts"),
        ...(OUTAGE_WORKER_URL
            ? (workerSourceStatus.length ? workerSourceStatus : [{ name: 'NGED / SSEN / SPEN', ok: false, error: 'Waiting for first update' } as any]).map(sr => ({
                org: sr.name, status: sr.ok ? "Operational" : "Not connected", keyStatus: sr.ok ? `${sr.count} live incidents` : (sr.error || 'Unavailable'), type: "Live Power Cuts"
            }))
            : [{ org: "NGED, SSEN, SPEN", status: "Not connected", keyStatus: "Needs Cloudflare Worker", type: "Live Power Cuts" }]),
        row("Elexon (frequency & demand)", 'elexon', "Frequency & Demand"),
        row("Elexon REMIT", 'remit', "Generator Outages"),
        row("Generation mix (NESO / Elexon)", 'mix', "Generation Mix"),
        row("Energy map tiles", 'tiles', "OpenStreetMap, built weekly"),
        row("Infrastructure snapshot", 'snapshot', "OpenStreetMap (built each publish)"),
        row("Connection registers", 'connections', "NESO TEC + DNO capacity registers (built each publish)"),
        ...connectionSourceRows(),
        ...noFeedRows(),
        overpassRow(),
        row("Network operator lines (33 kV and above)", 'dnolines', "Built weekly from DNO open data"),
        row("History (data lake)", 'history', "Snapshots every 15 minutes by the Worker; checked when History opens"),
        row("Grid Supply Point areas (scenario map)", 'gsp', "NESO open boundaries, built weekly; network-operator areas used until built"),
        row("Esri Dark Gray Canvas", 'basemap', "Map Tiles", 'Public'),
        radarRow(),
    ];
};

// Areas with no live power-cut feed: shown as "No coverage" so the status is never falsely all-green
const noFeedRows = () => OUTAGE_COVERAGE.filter(c => c.feed === 'none').map(c => ({
    org: `Live power cuts: ${c.area}`, status: 'No coverage', keyStatus: c.note, type: 'Live Power Cuts',
}));
// Overpass is only used when the weekly map tiles are missing, so "not checked" is expected
const overpassRow = () => {
    const h = statusOf('overpass');
    if (h.status === 'Not checked yet' && statusOf('tiles').status === 'Operational')
        return { org: 'OpenStreetMap live (Overpass)', status: 'Not needed', keyStatus: 'Map tiles loaded, so live queries are not used', type: 'Local detail when zoomed in' };
    return { org: 'OpenStreetMap live (Overpass)', status: h.status, keyStatus: h.detail || 'Open Data', type: 'Local detail when zoomed in' };
};
const radarRow = () => {
    const h = statusOf('radar');
    return { org: 'RainViewer', status: h.status === 'Not checked yet' ? 'Not needed' : h.status, keyStatus: h.status === 'Not checked yet' ? 'Checked when the weather radar layer is switched on' : (h.detail || 'Public'), type: 'Weather Radar' };
};

// ---------- Live power-cut coverage by network (shown on the map, in Overview and in System Status) ----------
export interface OutageCoverage { id: string; dno: string; area: string; regions: string[]; feed: 'live' | 'worker' | 'none'; note: string }
export const OUTAGE_COVERAGE: OutageCoverage[] = [
    { id: 'ukpn', dno: 'UK Power Networks', area: 'London, South East and East of England', regions: ['London', 'South East England', 'East England'], feed: 'live', note: '' },
    { id: 'npg', dno: 'Northern Powergrid', area: 'North East England and Yorkshire', regions: ['North East England', 'Yorkshire'], feed: 'live', note: '' },
    { id: 'nged', dno: 'National Grid Electricity Distribution', area: 'Midlands, South West and South Wales', regions: ['West Midlands', 'East Midlands', 'South Wales', 'South West England'], feed: 'worker', note: '' },
    { id: 'ssen', dno: 'Scottish and Southern Electricity Networks', area: 'North Scotland and Southern England', regions: ['North Scotland', 'Southern England'], feed: 'worker', note: '' },
    { id: 'spen', dno: 'SP Energy Networks', area: 'Central and South Scotland, Merseyside and North Wales', regions: ['South and Central Scotland', 'North Wales, Merseyside and Cheshire'], feed: 'worker', note: '' },
    { id: 'enwl', dno: 'Electricity North West', area: 'North West England', regions: ['North West England'], feed: 'none', note: 'Published under a restricted ("Shared") licence, so not shown. Check enwl.co.uk or call 105.' },
    { id: 'nie', dno: 'NIE Networks', area: 'Northern Ireland', regions: ['NIE Networks'], feed: 'none', note: 'No open live power-cut feed connected. Check nienetworks.co.uk or call 105.' },
];
// Which networks are actually reporting right now
export const outageCoverageNow = () => OUTAGE_COVERAGE.map(c => {
    let ok = false;
    if (c.feed === 'live') ok = statusOf(c.id).status === 'Operational';
    if (c.feed === 'worker') ok = !!workerSourceStatus.find(w => w.id === c.id && w.ok);
    return { ...c, ok };
});

const cleanText = (text: string): string => {
    if (!text) return "";
    return text.replace(/\*\*/g, '').trim();
};

const extractJSON = (text: string) => {
    try {
        const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        let jsonStr = match ? match[1] : text;
        jsonStr = jsonStr.replace(/\/\*[\s\S]*?\*\//g, "").replace(/([^:]|^)\/\/.*$/gm, "$1");
        
        const first = jsonStr.indexOf('{');
        const firstArr = jsonStr.indexOf('[');
        
        if (first === -1 && firstArr === -1) return "[]"; // No JSON found

        if (firstArr !== -1 && (first === -1 || firstArr < first)) {
             const lastArr = jsonStr.lastIndexOf(']');
             if (lastArr === -1) return "[]";
             return jsonStr.substring(firstArr, lastArr + 1);
        } else {
             const last = jsonStr.lastIndexOf('}');
             if (last === -1) return "{}";
             return jsonStr.substring(first, last + 1);
        }
    } catch (e) {
        return "[]";
    }
};

// Public Overpass servers (free). Busy servers often return 429/502/504, so try the next one.
const OVERPASS_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
];
let preferredOverpass = 0;

const fetchOverpassWithRetry = async (query: string, signal?: AbortSignal, perRequestMs = 45000): Promise<any> => {
    let lastErr: any = null;
    for (let k = 0; k < OVERPASS_ENDPOINTS.length; k++) {
        const idx = (preferredOverpass + k) % OVERPASS_ENDPOINTS.length;
        const url = OVERPASS_ENDPOINTS[idx];
        const controller = new AbortController();
        const onAbort = () => controller.abort();
        signal?.addEventListener('abort', onAbort);
        const timer = setTimeout(() => controller.abort(), perRequestMs);
        try {
            const response = await fetch(url, {
                method: 'POST',
                body: `data=${encodeURIComponent(query)}`,
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                signal: controller.signal
            });
            if (response.ok) {
                preferredOverpass = idx; // remember the server that worked
                markOk('overpass', new URL(url).host);
                return await response.json();
            }
            lastErr = new Error(`Overpass ${new URL(url).host} returned ${response.status}`);
        } catch (e: any) {
            if (signal?.aborted) throw e;
            lastErr = e;
        } finally {
            clearTimeout(timer);
            signal?.removeEventListener('abort', onAbort);
        }
        console.warn(`Overpass server failed, trying next: ${lastErr?.message}`);
    }
    markFail('overpass', 'all servers busy');
    throw lastErr || new Error('All Overpass servers failed');
};

// OSM output tags look like "1200 MW", "49.9 MW", "500 kW" or "yes". Returns MW, or undefined.
const parseOsmPowerMW = (v: any): number | undefined => {
    const m = String(v || '').trim().match(/^([\d.]+)\s*(GW|MW|kW|W)?$/i);
    if (!m) return undefined;
    const n = parseFloat(m[1]);
    const unit = (m[2] || 'MW').toUpperCase();
    const mw = unit === 'GW' ? n * 1000 : unit === 'KW' ? n / 1000 : unit === 'W' ? n / 1e6 : n;
    return isFinite(mw) && mw > 0 ? Math.round(mw * 100) / 100 : undefined;
};

// Convert OpenStreetMap (Overpass) elements into map assets.
export const osmElementsToAssets = (elements: any[]): InfrastructureAsset[] => {
    return elements.map((el: any) => {
            const tags = el.tags || {};
            const isDc = tags.telecom === 'data_center' || tags.building === 'data_center';
            const isSub = tags.power === 'substation';
            const isSolar = tags['generator:source'] === 'solar';
            const isBattery = tags['plant:source'] === 'battery';
            const isLine = tags.power === 'line' || tags.power === 'minor_line';
            const isPipe = tags.man_made === 'pipeline';
            const isCable = tags.power === 'cable';

            let typeId = 'substation'; 
            if (isDc) typeId = 'datacentre';
            else if (isSolar) typeId = 'solar';
            else if (isBattery) typeId = 'storage';
            else if (isLine) typeId = 'transmission_elec'; 
            else if (isPipe) typeId = 'pipeline_gas';
            else if (isCable) typeId = 'interconnector'; 
            else if (tags['plant:source'] === 'wind') typeId = tags['location'] === 'offshore' ? 'wind_offshore' : 'wind_onshore';
            else if (tags['plant:source'] === 'nuclear') typeId = 'nuclear';
            else if (tags['plant:source'] === 'hydro') typeId = 'hydro';
            else if (isSub) {
                const volt = parseInt(tags.voltage) || 0;
                if (volt >= 275000) typeId = 'ukpn_gsp'; 
                else if (volt >= 132000) typeId = 'ukpn_bsp'; 
                else typeId = 'ukpn_primary';
            }

            if (isLine || isCable) {
                 const voltStr = tags.voltage || "0";
                 const volt = parseInt(voltStr.replace(/\D/g,'')) || 0; // Strip non-digits
                 
                 // Reclassify based on voltage
                 if (volt >= 132000) typeId = 'transmission_elec';
                 else if (volt > 0) typeId = 'distribution_elec';
                 else typeId = 'distribution_elec'; // Default low voltage lines to distribution
                 
                 // Subsea cables: only true interconnectors count as 'interconnector'.
                 // Wind farm array/export cables are classed by voltage instead.
                 const nm = String(tags.name || '');
                 const isWindCable = /inter.?array|array string|export|wind|offshore substation|OFTO/i.test(nm) || /wind/i.test(String(tags.operator || ''));
                 if (isCable && tags.location === 'underwater' && !isWindCable) typeId = 'interconnector';
            }

            let lat, lng;
            let path = undefined;
            
            if (el.type === 'way') {
                if (el.geometry && Array.isArray(el.geometry)) {
                    path = el.geometry.map((p: any) => ({ lat: p.lat, lng: p.lon }));
                    const mid = Math.floor(path.length / 2);
                    lat = path[mid].lat;
                    lng = path[mid].lng;
                } else if (el.center) {
                    lat = el.center.lat;
                    lng = el.center.lon;
                } else if (el.bounds) {
                    lat = (el.bounds.minlat + el.bounds.maxlat) / 2;
                    lng = (el.bounds.minlon + el.bounds.maxlon) / 2;
                }
            } else if (el.type === 'node') {
                lat = el.lat;
                lng = el.lon;
            }

            // Commissioning year only if OpenStreetMap records one (start_date); never invented.
            const sd = parseInt(String(tags.start_date || '').slice(0, 4), 10);
            const cYear = sd > 1900 && sd < 2100 ? sd : undefined;

            if (!lat || !lng) return null;

            return {
                id: `op_${el.id}`,
                name: tags.name || `${typeId.replace('_', ' ')} ${el.id}`,
                typeId: typeId,
                lat: lat,
                lng: lng,
                capacityMW: parseOsmPowerMW(tags['plant:output:electricity'] || tags['generator:output:electricity']), // from OSM tags when recorded
                status: 'Operational' as const,
                commissionYear: cYear,
                path: path,
                rawTags: tags 
            };
    }).filter((x: any) => x !== null) as InfrastructureAsset[];
};

// --- Overpass API Integration ---
// Updated to split queries to ensure robust fetching of interconnectors and power lines
const fetchOverpassData = async (lat: number, lng: number, scope: 'national' | 'local', onProgress?: (msg: string) => void, signal?: AbortSignal): Promise<InfrastructureAsset[]> => {
    if (onProgress) onProgress(`Querying OSM (${scope.toUpperCase()} scope)...`);

    const delta = scope === 'national' ? 4.5 : 0.2; // local: roughly a 45 x 45 km area
    const limit = scope === 'national' ? 3000 : 1500;
    
    const s = lat - delta;
    const w = lng - (delta * 1.5);
    const n = lat + delta;
    const e = lng + (delta * 1.5);

    let queries: string[] = [];

    if (scope === 'national') {
        // Query 1: Generation & High Voltage Lines (National)
        // Increased timeout to 180 to prevent 504s on heavy loads
        queries.push(`
            [out:json][timeout:60];
            (
                node["power"="plant"]["plant:source"~"nuclear|wind|hydro"](${s},${w},${n},${e});
                way["power"="plant"]["plant:source"~"nuclear|wind|hydro"](${s},${w},${n},${e});
                
                way["power"="line"]["voltage"~"400000|275000|132000|320000"](${s},${w},${n},${e});
                way["power"="cable"]["voltage"~"400000|275000|132000|320000"](${s},${w},${n},${e});
            );
            out geom ${limit};
        `);

        // Query 2: Infrastructure Lines (Interconnectors, Pipelines) - Slower, heavier geometry
        queries.push(`
            [out:json][timeout:60];
            (
                node["power"="cable"]["location"="underwater"](${s},${w},${n},${e}); 
                way["power"="cable"]["location"="underwater"](${s},${w},${n},${e});
                node["man_made"="pipeline"]["substance"="gas"]["location"="underwater"](${s},${w},${n},${e});
                way["man_made"="pipeline"]["substance"="gas"]["location"="underwater"](${s},${w},${n},${e});
            );
            out geom 500;
        `);
    } else {
        // Query 3: Local/Distribution Assets (Substations, 33kV/11kV lines, Datacenters)
        queries.push(`
            [out:json][timeout:120];
            (
                node["power"="substation"](${s},${w},${n},${e});
                way["power"="substation"](${s},${w},${n},${e});
                
                node["telecom"="data_center"](${s},${w},${n},${e});
                way["building"="data_center"](${s},${w},${n},${e});
                
                node["power"="generator"]["generator:source"="solar"](${s},${w},${n},${e});
                way["power"="generator"]["generator:source"="solar"](${s},${w},${n},${e});
                node["power"="plant"]["plant:source"="battery"](${s},${w},${n},${e});
                way["power"="plant"]["plant:source"="battery"](${s},${w},${n},${e});
                
                way["power"="line"](${s},${w},${n},${e});
                way["power"="minor_line"](${s},${w},${n},${e});
                way["power"="cable"](${s},${w},${n},${e});
                
                way["man_made"="pipeline"]["substance"="gas"](${s},${w},${n},${e});
            );
            out geom ${limit};
        `);
    }

    try {
        // Keep whatever succeeds: one slow query shouldn't lose the others.
        const settled = await Promise.allSettled(queries.map(q => fetchOverpassWithRetry(q, signal)));
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        const ok = settled.filter(r => r.status === 'fulfilled') as PromiseFulfilledResult<any>[];
        settled.forEach(r => { if (r.status === 'rejected') logSystemError("OpenStreetMap query failed", r.reason?.message, "warning"); });
        if (ok.length === 0) throw new Error('OpenStreetMap servers busy - showing built-in assets only');
        const elements = ok.map(r => r.value.elements || []).flat();

        return osmElementsToAssets(elements);

    } catch (e: any) {
        if (e.name === 'AbortError') throw e;
        console.warn("Overpass fetch failed", e);
        // Log explicitly if all retries failed
        logSystemError("Overpass Fetch Failed", e.message);
        return [];
    }
};

export const searchInfrastructureAssets = async (
    query: string, 
    centerLat: number, 
    centerLng: number
): Promise<InfrastructureAsset[]> => {
    if (!aiClient) initGenAI();
    if (!aiClient) return [];

    try {
        // 1. Identify OSM Tags using Gemini
        const prompt = `Identify the single most appropriate OpenStreetMap tag key and value to locate "${query}". Return a valid JSON object with "key" and "value" properties. If the value can be variable (e.g. any hospital), set value to "*". Example for "airports": {"key": "aeroway", "value": "aerodrome"}. Return ONLY the JSON object.`;
        
        const response = await aiClient.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{ parts: [{ text: prompt }] }]
        });
        
        const jsonStr = extractJSON(response.text || "");
        const tagInfo = JSON.parse(jsonStr);
        
        if (!tagInfo.key || !tagInfo.value) return [];

        // 2. Construct Overpass Query
        const key = tagInfo.key;
        const val = tagInfo.value;
        // Search radius: 50km
        const radius = 50000; 
        
        let selector = "";
        if (val === "*") {
            selector = `["${key}"]`;
        } else {
            selector = `["${key}"="${val}"]`;
        }

        // Increased timeout to 90s to avoid 504 on complex searches
        const overpassQuery = `
            [out:json][timeout:90];
            (
              node${selector}(around:${radius},${centerLat},${centerLng});
              way${selector}(around:${radius},${centerLat},${centerLng});
              relation${selector}(around:${radius},${centerLat},${centerLng});
            );
            out center 50;
        `;

        // 3. Fetch Data with Retry
        const data = await fetchOverpassWithRetry(overpassQuery);
        
        // 4. Map to Assets
        return (data.elements || []).map((el: any) => {
            let lat, lng;
            if (el.type === 'node') {
                lat = el.lat; lng = el.lon;
            } else if (el.center) {
                lat = el.center.lat; lng = el.center.lon;
            } else if (el.bounds) {
                lat = (el.bounds.minlat + el.bounds.maxlat) / 2;
                lng = (el.bounds.minlon + el.bounds.maxlon) / 2;
            }

            if (!lat || !lng) return null;

            return {
                id: `custom_${el.id}`,
                name: el.tags?.name || `${query} ${el.id}`,
                typeId: 'custom_search',
                lat: lat,
                lng: lng,
                status: 'Operational',
                rawTags: el.tags
            };
        }).filter((a: any) => a !== null);

    } catch (e: any) {
        console.error("Asset search failed", e);
        handleApiError(e); // Ensure logs as an API error
        return [];
    }
};

const fetchWithTimeout = async (url: string, ms = 6000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), ms);
    try {
        return await fetch(url, { signal: controller.signal });
    } finally {
        clearTimeout(id);
    }
};

let lastGoodPower: { demand: number, frequency: number, carbonIntensity: number } | null = null;

// Live GB grid snapshot: Elexon (frequency, demand) + NESO Carbon Intensity.
export const fetchNESOPowerData = async (): Promise<{demand: number, frequency: number, carbonIntensity: number, estimated?: boolean}> => {
    let demand = 0;
    let frequency = 0;
    let carbonIntensity = 0;
    const now = new Date();
    const from = new Date(now.getTime() - 10 * 60 * 1000).toISOString();

    try {
        const [freqRes, demandRes, carbonRes] = await Promise.allSettled([
            fetchWithTimeout(`${ELEXON_API}/system/frequency?from=${from}&to=${now.toISOString()}&format=json`),
            fetchWithTimeout(`${ELEXON_API}/demand/outturn/summary?format=json`),
            fetchWithTimeout('https://api.carbonintensity.org.uk/intensity')
        ]);

        // 1. Frequency (15-second readings) - take the latest
        if (freqRes.status === 'fulfilled' && freqRes.value.ok) {
            const json = await freqRes.value.json();
            const rows = json.data || [];
            const latest = rows[rows.length - 1];
            if (latest?.frequency) frequency = latest.frequency;
        }

        // 2. Rolling system demand (5-minute) - take the latest
        if (demandRes.status === 'fulfilled' && demandRes.value.ok) {
            const rows = await demandRes.value.json();
            const list = Array.isArray(rows) ? rows : rows.data || [];
            const latest = list[list.length - 1];
            if (latest?.demand) demand = latest.demand;
        }

        // 3. Carbon intensity
        if (carbonRes.status === 'fulfilled' && carbonRes.value.ok) {
            const data = await carbonRes.value.json();
            carbonIntensity = data.data?.[0]?.intensity?.actual || data.data?.[0]?.intensity?.forecast || 0;
        }
    } catch (e: any) {
        console.warn("Real-time data fetch warning", e);
        logSystemError("Elexon / NESO fetch error", e.message, "warning");
    }

    // If a live value couldn't be fetched, reuse the last real value and flag it as estimated.
    // Nothing random is ever shown.
    const estimated = demand === 0 || frequency === 0;
    if (!estimated) { markOk('elexon'); lastGoodPower = { demand, frequency, carbonIntensity: carbonIntensity || lastGoodPower?.carbonIntensity || 0 }; }
    else markFail('elexon', 'live demand/frequency unavailable');
    if (demand === 0) demand = lastGoodPower?.demand || 0;
    if (frequency === 0) frequency = lastGoodPower?.frequency || 50.0;
    if (carbonIntensity === 0) carbonIntensity = lastGoodPower?.carbonIntensity || 0;

    return { demand, frequency, carbonIntensity, estimated };
};

// GB generation mix. Primary: NESO Carbon Intensity API. Backup: Elexon live generation by fuel.
// If both fail, returns null (the app hides the figures) - it never shows made-up numbers.
const summariseMix = (from: string, to: string, mix: { fuel: string, perc: number }[]): GenerationMix => {
    const getPerc = (fuel: string) => mix.find(x => x.fuel === fuel)?.perc || 0;
    const r1 = (v: number) => Math.round(v * 10) / 10;
    const renewables = getPerc('wind') + getPerc('solar') + getPerc('hydro') + getPerc('biomass');
    const fossil = getPerc('gas') + getPerc('coal') + getPerc('oil');
    return { from, to, generation: mix, renewablesPerc: r1(renewables), fossilPerc: r1(fossil), lowCarbonPerc: r1(renewables + getPerc('nuclear')) };
};

export const fetchGenerationMix = async (): Promise<GenerationMix | null> => {
    try {
        const response = await fetchWithTimeout('https://api.carbonintensity.org.uk/generation', 8000);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const genData = (await response.json()).data;
        if (genData?.generation?.length) { markOk('mix', 'NESO'); return summariseMix(genData.from, genData.to, genData.generation); }
        throw new Error('No generation data');
    } catch (e: any) {
        logSystemError("NESO generation mix unavailable - trying Elexon", e.message, "warning");
    }
    try {
        const resp = await fetchWithTimeout(`${ELEXON_API}/generation/outturn/current?format=json`, 8000);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const rows: any[] = await resp.json();
        const groups: Record<string, number> = {};
        const map: Record<string, string> = { CCGT: 'gas', OCGT: 'gas', COAL: 'coal', NUCLEAR: 'nuclear', WIND: 'wind', BIOMASS: 'biomass', NPSHYD: 'hydro', PS: 'storage', OIL: 'oil', OTHER: 'other' };
        rows.forEach(r => {
            const fuel = r.fuelType?.startsWith('INT') ? 'imports' : map[r.fuelType] || 'other';
            const mw = Math.max(0, r.currentUsage || 0);
            groups[fuel] = (groups[fuel] || 0) + mw;
        });
        const total = Object.values(groups).reduce((a, v) => a + v, 0);
        if (!total) throw new Error('No data');
        const mix = Object.entries(groups).map(([fuel, mw]) => ({ fuel, perc: Math.round((mw / total) * 1000) / 10 }));
        const now = new Date().toISOString();
        markOk('mix', 'Elexon backup');
        return summariseMix(now, now, mix);
    } catch (e: any) {
        markFail('mix', e.message);
        logSystemError("Generation mix unavailable", e.message, "warning");
        return null;
    }
};

// Real history only, from Elexon. Returns [] if it can't be loaded (the chart then says so).
//   Demand:    24h = 5-minute rolling demand; 7d/30d = half-hourly outturn; 1y = daily average.
//   Frequency: 24h = 1-minute averages of 15-second readings; 7d = 15-minute averages.
//              Longer frequency ranges aren't offered (tens of MB of data).
export const GRID_HISTORY_RANGES: Record<'demand' | 'frequency', ('24h' | '7d' | '30d' | '1y')[]> = {
    demand: ['24h', '7d', '30d', '1y'],
    frequency: ['24h', '7d'],
};

const bucketAverage = (points: { timestamp: number, value: number }[], bucketMs: number) => {
    const buckets = new Map<number, { sum: number, n: number }>();
    points.forEach(p => {
        const k = Math.floor(p.timestamp / bucketMs) * bucketMs;
        const b = buckets.get(k) || { sum: 0, n: 0 };
        b.sum += p.value; b.n++;
        buckets.set(k, b);
    });
    return Array.from(buckets.entries()).sort((x, y) => x[0] - y[0]).map(([t, b]) => ({ timestamp: t, value: b.sum / b.n }));
};

export const fetchGridHistory = async (metric: 'demand' | 'frequency', range: '24h' | '7d' | '30d' | '1y'): Promise<{ timestamp: number, value: number }[]> => {
    const cacheKey = `${metric}_${range}`;
    if (historyCache.has(cacheKey)) return historyCache.get(cacheKey)!;
    const now = Date.now();
    const day = (n: number) => new Date(now - n * 86400000).toISOString().slice(0, 10);
    let data: { timestamp: number, value: number }[] = [];
    try {
        if (metric === 'demand') {
            if (range === '24h') {
                const rows = await (await fetchWithTimeout(`${ELEXON_API}/demand/outturn/summary?format=json`, 10000)).json();
                data = (Array.isArray(rows) ? rows : rows.data || [])
                    .map((r: any) => ({ timestamp: Date.parse(r.startTime), value: r.demand }))
                    .filter((p: any) => p.timestamp >= now - 86400000);
            } else if (range === '7d' || range === '30d') {
                // The API allows up to 28 days per request.
                const spans = range === '7d' ? [[7, 0]] : [[30, 16], [15, 0]];
                for (const [from, to] of spans) {
                    const json = await (await fetchWithTimeout(`${ELEXON_API}/demand/outturn?settlementDateFrom=${day(from)}&settlementDateTo=${day(to)}&format=json`, 15000)).json();
                    (json.data || []).forEach((r: any) => data.push({ timestamp: Date.parse(r.startTime), value: r.initialDemandOutturn }));
                }
            } else {
                const json = await (await fetchWithTimeout(`${ELEXON_API}/demand/outturn/daily?settlementDateFrom=${day(365)}&settlementDateTo=${day(0)}&format=json`, 15000)).json();
                // Daily energy (MWh) -> average demand over the day (MW)
                data = (json.data || []).map((r: any) => ({ timestamp: Date.parse(r.settlementDate + 'T12:00:00Z'), value: r.demand / 24 }));
            }
        } else {
            if (!GRID_HISTORY_RANGES.frequency.includes(range)) return [];
            const span = range === '24h' ? 86400000 : 7 * 86400000;
            const json = await (await fetchWithTimeout(`${ELEXON_API}/system/frequency?from=${new Date(now - span).toISOString()}&to=${new Date(now).toISOString()}&format=json`, 20000)).json();
            const raw = (json.data || []).map((r: any) => ({ timestamp: Date.parse(r.measurementTime), value: r.frequency }));
            data = bucketAverage(raw, range === '24h' ? 60000 : 900000);
        }
        data = data.filter(p => isFinite(p.timestamp) && isFinite(p.value)).sort((x, y) => x.timestamp - y.timestamp);
        // De-duplicate timestamps (overlapping requests)
        data = data.filter((p, i) => i === 0 || p.timestamp !== data[i - 1].timestamp);
    } catch (e: any) {
        logSystemError(`Grid ${metric} history unavailable`, e.message, "warning");
        return [];
    }
    if (data.length) historyCache.set(cacheKey, data);
    return data;
};

export const analyzeGridHistory = async (metric: string, range: string, data: { timestamp: number, value: number }[]) => {
    if (!aiClient) initGenAI();
    if (!aiClient) return "AI analysis needs a Gemini key. Click \"AI: Off\" in the top bar to add your free key.";

    // Sample data to reduce token count (take every nth point)
    const sampleRate = Math.ceil(data.length / 20);
    const sampled = data.filter((_, i) => i % sampleRate === 0).map(d => `${new Date(d.timestamp).toLocaleDateString()} ${new Date(d.timestamp).getHours()}:00 = ${d.value.toFixed(2)}`);

    const prompt = `
        Analyze the following historical ${metric} data for the GB electricity system over the last ${range} (source: Elexon, real measured data; demand in MW, frequency in Hz).
        Only describe patterns visible in these numbers; if you suggest causes, say they are possible explanations, not established facts.
        Data Points (Sampled): ${sampled.join(", ")}.
        
        Identify:
        1. General Trends (Seasonality, daily cycles)
        2. Anomalies (Unexpected peaks or drops)
        3. Potential Causes (Weather, events, market shifts)
        
        Keep it concise, professional, and insightful.
    `;

    try {
        const response = await aiClient.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{ parts: [{ text: prompt }] }]
        });
        return cleanText(response.text || "");
    } catch (e) {
        handleApiError(e);
        return "AI Analysis failed.";
    }
};

// Place search: free OpenStreetMap Nominatim first, Gemini as a fallback if the visitor has a key.
export const getCoordinatesForLocation = async (location: string): Promise<{lat: number, lng: number} | null> => {
    try {
        const resp = await fetchWithTimeout(
            `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(location)}`, 6000
        );
        if (resp.ok) {
            const rows = await resp.json();
            if (rows?.[0]?.lat && rows?.[0]?.lon) return { lat: parseFloat(rows[0].lat), lng: parseFloat(rows[0].lon) };
        }
    } catch (e: any) {
        logSystemError("Place search (OpenStreetMap) failed", e.message, "warning");
    }

    if (!aiClient) initGenAI();
    if (!aiClient) return null;
    const prompt = `Return the Latitude and Longitude for: "${location}". Return ONLY a pure JSON object without markdown or comments: {"lat": 12.34, "lng": 56.78}.`;
    try {
        const response = await aiClient.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{ parts: [{ text: prompt }] }],
            config: { tools: [{ googleSearch: {} }] }
        });
        const json = JSON.parse(extractJSON(response.text || ""));
        if (json.lat && json.lng) return { lat: json.lat, lng: json.lng };
    } catch (e) { 
        handleApiError(e);
        return null; 
    }
    return null;
};

// ... (Rest of exports below) ...
// ---------- Elexon REMIT: live power station / interconnector outages ----------
// REMIT notices have no coordinates, so units are placed using a lookup built at deploy time
// (scripts/build-bmu-locations.mjs). Unmatched units are still returned, without a location.
let bmuLookup: { sites: { name: string, lat: number, lng: number }[], units: Record<string, number> } | null = null;
const loadBmuLookup = async () => {
    if (bmuLookup) return bmuLookup;
    try {
        const resp = await fetchWithTimeout(`${import.meta.env.BASE_URL}data/bmu-locations.json`, 10000);
        bmuLookup = resp.ok ? await resp.json() : { sites: [], units: {} };
    } catch { bmuLookup = { sites: [], units: {} }; }
    return bmuLookup!;
};

// Sites missing from the dictionary: GB interconnector landing points and a few newer large stations.
// Coordinates are approximate (site level).
const EXTRA_SITES: { match: RegExp, name: string, lat: number, lng: number }[] = [
    { match: /FRAN1|IFA1|IFA-1/, name: 'IFA interconnector (Sellindge)', lat: 51.106, lng: 0.975 },
    { match: /IFA2|FRAN2/, name: 'IFA2 interconnector (Chilling)', lat: 50.845, lng: -1.265 },
    { match: /ELEC|ELCL|ELKL/, name: 'ElecLink interconnector (Folkestone)', lat: 51.094, lng: 1.144 },
    { match: /BRTN|BRITN|NETH/, name: 'BritNed interconnector (Isle of Grain)', lat: 51.444, lng: 0.709 },
    { match: /NEMO|BELG/, name: 'Nemo Link interconnector (Richborough)', lat: 51.305, lng: 1.348 },
    { match: /NSL|NORW/, name: 'North Sea Link interconnector (Blyth)', lat: 55.139, lng: -1.519 },
    { match: /VKL|VIKN|DENM/, name: 'Viking Link interconnector (Bicker Fen)', lat: 52.931, lng: -0.188 },
    { match: /MOYL|NIRE/, name: 'Moyle interconnector (Auchencrosh)', lat: 55.072, lng: -4.975 },
    { match: /EWIC|EIRE/, name: 'East West interconnector (Deeside)', lat: 53.226, lng: -3.072 },
    { match: /GRNL|GREEN/, name: 'Greenlink interconnector (Pembroke)', lat: 51.683, lng: -4.992 },
    { match: /MOWWO/, name: 'Moray West Offshore Wind Farm', lat: 58.10, lng: -3.10 },
    { match: /SOFWO/, name: 'Sofia Offshore Wind Farm', lat: 54.97, lng: 2.10 },
    { match: /THUPG/, name: 'Thurrock Power', lat: 51.474, lng: 0.329 },
];

// Find a unit's site: exact ID first, then the same station under another unit number (e.g. HUMR-4 -> HUMR-1).
const locateUnit = (lookup: NonNullable<typeof bmuLookup>, ids: (string | undefined)[]) => {
    for (const id of ids) if (id && lookup.units[id] !== undefined) return lookup.sites[lookup.units[id]];
    const root = (id: string) => id.replace(/^[TEMC]_/, '').replace(/[-_]?\d+[A-Z]?$/, '').replace(/-[A-Z]$/, '');
    for (const id of ids) {
        if (!id || id === 'NO_ASSET') continue;
        const r = root(id);
        if (r.length < 4) continue;
        const key = Object.keys(lookup.units).find(k => root(k) === r);
        if (key) return lookup.sites[lookup.units[key]];
    }
    const joined = ids.filter(Boolean).join(' ');
    const extra = EXTRA_SITES.find(x => x.match.test(joined));
    return extra ? { name: extra.name, lat: extra.lat, lng: extra.lng } : undefined;
};

let remitCache: { t: number, data: GeneratorOutage[] } | null = null;
export const fetchGeneratorOutages = async (): Promise<GeneratorOutage[]> => {
    if (remitCache && Date.now() - remitCache.t < 300000) return remitCache.data;
    try {
        const now = new Date();
        const to = new Date(now.getTime() + 60000);
        const list = await (await fetchWithTimeout(`${ELEXON_API}/remit/list/by-event?from=${now.toISOString()}&to=${to.toISOString()}&format=json`, 10000)).json();
        const ids: number[] = (list.data || []).map((x: any) => x.id);
        const messages: any[] = [];
        for (let i = 0; i < ids.length; i += 50) {
            const q = ids.slice(i, i + 50).map(id => `messageId=${id}`).join('&');
            const r = await fetchWithTimeout(`${ELEXON_API}/remit?${q}&format=json`, 10000);
            if (r.ok) messages.push(...((await r.json()).data || []));
        }
        // Keep the latest revision of each notice, and only those still active.
        const latest = new Map<string, any>();
        messages.forEach(m => { const p = latest.get(m.mrid); if (!p || p.revisionNumber < m.revisionNumber) latest.set(m.mrid, m); });
        const lookup = await loadBmuLookup();
        const nowMs = now.getTime();
        const YEAR = 365 * 86400000;
        const active = Array.from(latest.values()).filter(m => {
            if (m.eventStatus !== 'Active' || m.assetId === 'NO_ASSET' || !(m.unavailableCapacity > 0)) return false;
            // Closed stations stay "unavailable" in REMIT for decades (e.g. Ratcliffe until 2050).
            // Treat anything lasting more than 2 years, or ending 3+ years from now, as a closure, not an outage.
            const start = Date.parse(m.eventStartTime), end = Date.parse(m.eventEndTime);
            if (isFinite(start) && isFinite(end) && end - start > 2 * YEAR) return false;
            if (isFinite(end) && end - nowMs > 3 * YEAR) return false;
            return true;
        });
        // One entry per physical unit: overlapping notices (e.g. a planned and an unplanned outage on the
        // same unit) are not added together; take the largest. Interconnector import/export units
        // (I_IEG-x / I_IED-x) are the same cable, so they count once.
        const unitKey = (m: any) => String(m.affectedUnit || m.assetId).replace(/^I_IE[GD]-/, 'I_IE-');
        const perUnit = new Map<string, any>();
        active.forEach(m => {
            const k = unitKey(m);
            const prev = perUnit.get(k);
            const anyUnplanned = m.unavailabilityType !== 'Planned' || (prev && prev._anyUnplanned);
            if (!prev || m.unavailableCapacity > prev.unavailableCapacity) perUnit.set(k, { ...m, _anyUnplanned: anyUnplanned });
            else prev._anyUnplanned = anyUnplanned;
        });
        const result: GeneratorOutage[] = Array.from(perUnit.values())
            .map(m => {
                const site = locateUnit(lookup, [m.affectedUnit, m.assetId, m.affectedUnitEIC]);
                return {
                    id: m.mrid,
                    unit: String(m.affectedUnit || m.assetId || 'Unknown unit').replace(/^I_IE[GD]-/, 'Interconnector '),
                    siteName: site?.name,
                    lat: site?.lat,
                    lng: site?.lng,
                    fuelType: m.fuelType || 'Not stated',
                    eventType: m.eventType || 'Unavailability',
                    planned: !m._anyUnplanned,
                    normalMW: m.normalCapacity || 0,
                    availableMW: m.availableCapacity || 0,
                    unavailableMW: m.unavailableCapacity || 0,
                    cause: m.cause || 'Not stated',
                    start: m.eventStartTime || '',
                    end: m.eventEndTime || '',
                    participant: m.participantId || '',
                };
            })
            .sort((a, b) => b.unavailableMW - a.unavailableMW);
        remitCache = { t: Date.now(), data: result };
        markOk('remit', `${result.length} active notices`);
        return result;
    } catch (e: any) {
        markFail('remit', e.message);
        logSystemError("Elexon REMIT (generator outages) unavailable", e.message, "warning");
        return remitCache?.data || [];
    }
};

// DNO licence areas: real boundaries from NESO (simplified at deploy time by scripts/build-dno-areas.mjs).
const DNO_COLOURS: Record<string, string> = {
    UKPN: '#dc2626', NGED: '#eab308', SSEN: '#0ea5e9', SPEN: '#16a34a', ENWL: '#f97316', NPG: '#8b5cf6'
};

export const loadDnoBoundaries = async (): Promise<DNORegion[]> => {
    try {
        const resp = await fetchWithTimeout(`${import.meta.env.BASE_URL}data/dno-areas.json`, 10000);
        if (!resp.ok) return [];
        const json = await resp.json();
        const areas = json.areas || [];
        if (areas.length === 0) return [];
        const gb: DNORegion[] = areas.map((a: any) => ({
            id: `dno_${String(a.area).toLowerCase().replace(/[^a-z]+/g, '_')}`,
            name: a.area,
            operator: a.dnoFull,
            color: DNO_COLOURS[a.dno] || '#64748b',
            households: 0,
            industryCount: 0,
            path: [],
            polygons: a.polygons
        }));
        // NESO's file covers Great Britain only; keep the Northern Ireland outline.
        const ni = UK_DNO_REGIONS.filter(r => r.id === 'nie_networks');
        return [...gb, ...ni];
    } catch (e: any) {
        logSystemError("DNO boundaries unavailable", e.message, "warning");
        return [];
    }
};

let ukSnapshotCache: InfrastructureAsset[] | null = null;
export let ukSnapshotDate: string | null = null;

const loadUkSnapshot = async (): Promise<InfrastructureAsset[]> => {
    if (ukSnapshotCache) return ukSnapshotCache;
    try {
        const resp = await fetchWithTimeout(`${import.meta.env.BASE_URL}data/osm-uk.json`, 15000);
        if (!resp.ok) return [];
        const json = await resp.json();
        const elements = json.elements || [];
        if (elements.length === 0) return [];
        ukSnapshotDate = json.generated || null;
        ukSnapshotCache = osmElementsToAssets(elements);
        markOk('snapshot', `${ukSnapshotCache.length} assets${ukSnapshotDate ? ', built ' + ukSnapshotDate.slice(0, 10) : ''}`);
        return ukSnapshotCache;
    } catch (e: any) {
        markFail('snapshot', e.message);
        logSystemError("Infrastructure snapshot unavailable", e.message, "warning");
        return [];
    }
};

export const fetchEnergyInfrastructure = async (
    regionName: string,
    currentAssets: InfrastructureAsset[],
    onProgress?: (msg: string) => void,
    lat?: number,
    lng?: number,
    scope: 'all' | 'local_only' | 'national' = 'all',
    signal?: AbortSignal
): Promise<InfrastructureAsset[]> => {
    
    const r = REGIONS.find(reg => reg.name === regionName);
    const centerLat = lat ?? (r ? r.lat : 54.5);
    const centerLng = lng ?? (r ? r.lng : -2.0);
    
    // Map 'all' -> 'national', 'local_only' -> 'local' for fetchOverpassData
    const overpassScope = scope === 'local_only' ? 'local' : 'national';

    try {
        let newAssets: InfrastructureAsset[] = [];
        // UK national view: use the pre-built OpenStreetMap snapshot (refreshed weekly by GitHub Actions).
        if (overpassScope === 'national' && (!r || r.id === 'UK')) {
            newAssets = await loadUkSnapshot();
        }
        if (newAssets.length === 0) {
            newAssets = await fetchOverpassData(centerLat, centerLng, overpassScope, onProgress, signal);
        }
        
        // Merge to prevent duplicates
        const assetMap = new Map<string, InfrastructureAsset>();
        currentAssets.forEach(a => assetMap.set(a.id, a));
        
        let added = 0;
        newAssets.forEach(a => {
            if (!assetMap.has(a.id)) {
                assetMap.set(a.id, a);
                added++;
            }
        });

        if (onProgress) onProgress(`Infrastructure sync complete. Added ${added} new assets.`);
        return Array.from(assetMap.values());
    } catch (e: any) {
        if (e.name !== 'AbortError') {
            console.warn("Infrastructure fetch warning", e);
            logSystemError("Infra Fetch Warning", e.message, "warning");
        }
        return currentAssets;
    }
};

// ---------- AI scenario proposals ----------
// AI may propose WHAT could happen (and cite sources for why it matters). It never supplies numbers or
// locations: before a proposal can run, the user picks which library scenario's sourced model it borrows
// (content/scenarios.ts MODEL_PATTERNS / adoptProposal).
const PROPOSAL_RULES = `
RULES:
- Do NOT give any numbers for customers affected, duration, cost or megawatts. The app models impact itself from sourced past events.
- Do NOT give coordinates, and do not name specific real sites, substations or companies as targets. Keep it generic.
- Do not name equipment suppliers.
- "pattern" must be ONE of: ${MODEL_PATTERNS.map(p => `"${p.id}" (${p.label})`).join('; ')}. Pick the closest real-event pattern.
- "sources": real, checkable sources you found ("Title - URL") for why this risk matters. If you have none, return [].`;
const PROPOSAL_FIELDS = `{ "name": "Plain title", "category": "Storm" | "Cyber" | "Asset Failure" | "Supply Chain" | "Geopolitical", "description": "One or two sentences", "narrative": "What happens, in plain English, without numbers", "pattern": "<pattern id>", "why": "Why this risk matters now, citing the sources", "sources": ["Title - URL"] }`;
const toProposal = (r: any, region: string, i: number): RiskScenario => ({
    id: `proposal_${Date.now()}_${i}`,
    name: String(r.name || `AI proposal ${i + 1}`).slice(0, 120),
    category: ['Storm', 'Cyber', 'Asset Failure', 'Supply Chain', 'Geopolitical'].includes(r.category) ? r.category : 'Asset Failure',
    description: String(r.description || '').slice(0, 400),
    narrative: String(r.narrative || '').slice(0, 1500),
    probability: 'Medium', impactLevel: 'Major',
    durationDays: 0, peakConsumersAffected: 0, affectedAssets: [], region,
    status: 'Proposal', lastUpdated: Date.now(),
    suggestedPattern: MODEL_PATTERNS.some(p => p.id === r.pattern) ? r.pattern : undefined,
    sources: Array.isArray(r.sources) ? r.sources.slice(0, 6).map(String) : [],
    rationale: `AI proposal (not checked): ${String(r.why || 'no reasoning given').slice(0, 600)}`,
});

export const generateCustomScenario = async (userQuery: string, region: string): Promise<RiskScenario | null> => {
    if (!aiClient) initGenAI();
    if (!aiClient) { requestAiKey(); return null; }
    const ask = userQuery.trim()
        ? `Propose one energy risk scenario for ${region} based on this request: "${userQuery}".`
        : `Propose the one energy risk scenario for ${region} that public sources suggest matters most right now.`;
    const prompt = `${ask}\nReturn a single JSON object (not an array): ${PROPOSAL_FIELDS}\n${PROPOSAL_RULES}`;
    try {
        const response = await aiClient.models.generateContent({ model: 'gemini-2.5-flash', contents: [{ parts: [{ text: prompt }] }], config: { tools: [{ googleSearch: {} }] } });
        const json = JSON.parse(extractJSON(response.text || ''));
        return toProposal(Array.isArray(json) ? json[0] : json, region, 0);
    } catch (e) {
        handleApiError(e);
        return null;
    }
};

// Live power cuts published by UK Power Networks (London, South East, East of England).
// Free open data, no key. Only includes incidents not yet restored.
const fetchUkpnLiveFaults = async (): Promise<OutageEvent[]> => {
    try {
        const url = 'https://ukpowernetworks.opendatasoft.com/api/explore/v2.1/catalog/datasets/ukpn-live-faults/records?limit=100';
        const resp = await fetchWithTimeout(url, 8000);
        if (!resp.ok) throw new Error(`UKPN ${resp.status}`);
        const json = await resp.json();
        markOk('ukpn');
        return (json.results || [])
            .filter((r: any) => !r.restoreddatetime && r.geopoint && r.powercuttype !== 'Restored')
            .map((r: any): OutageEvent => {
                const planned = r.powercuttype === 'Planned';
                const customers = r.nocustomeraffected || r.noplannedcustomers || 0;
                return {
                    id: `ukpn_${r.incidentreference}`,
                    locationName: `${(r.operatingzone || 'UKPN area').replace(/\b\w+/g, (w: string) => w[0] + w.slice(1).toLowerCase())}${r.postcodesaffected ? ` (${String(r.postcodesaffected).split(';').slice(0, 3).join(', ')})` : ''}`,
                    lat: r.geopoint.lat,
                    lng: r.geopoint.lon,
                    consumersAffected: customers,
                    description: planned ? 'Planned work' : (r.incidentcategorycustomerfriendlydescription || r.mainmessage || 'Unplanned power cut').slice(0, 220),
                    startTime: r.receiveddate || r.creationdatetime || '',
                    estRestoration: r.estimatedrestorationdate || 'TBC',
                    source: 'UK Power Networks (live)',
                    status: planned ? 'Active' : (r.statusid === 1 ? 'Investigating' : 'Restoring'),
                    isSimulated: false
                };
            });
    } catch (e: any) {
        markFail('ukpn', e.message);
        logSystemError("UKPN live faults unavailable", e.message, "warning");
        return [];
    }
};

// Live power cuts published by Northern Powergrid (North East, Yorkshire, northern Lincolnshire).
// Free open data, no key. One row per postcode, so rows are grouped by incident reference.
const NPG_STATUS: Record<number, OutageEvent['status']> = { 4: 'Investigating', 5: 'Restoring', 6: 'Resolved' };
const fetchNpgLiveFaults = async (): Promise<OutageEvent[]> => {
    try {
        const fields = 'reference,totalconfirmedpowercut,totalpredictedpowercut,powercutcategory,natureofoutage,estimatedtimetillresolution,loggedtime,incidentstatus,lat,lng,postcode,area,reason';
        const url = `https://northernpowergrid.opendatasoft.com/api/explore/v2.1/catalog/datasets/live-power-cuts-data/exports/json?select=${fields}&where=incidentstatus!%3D6`;
        const resp = await fetchWithTimeout(url, 10000);
        if (!resp.ok) throw new Error(`Northern Powergrid ${resp.status}`);
        const rows: any[] = await resp.json();
        markOk('npg');

        const groups = new Map<string, any[]>();
        rows.forEach(r => {
            if (r.incidentstatus === 6 || typeof r.lat !== 'number' || typeof r.lng !== 'number') return;
            const list = groups.get(r.reference) || [];
            list.push(r);
            groups.set(r.reference, list);
        });

        return Array.from(groups.entries()).map(([ref, list]): OutageEvent => {
            const r = list[0];
            const lat = list.reduce((a, x) => a + x.lat, 0) / list.length;
            const lng = list.reduce((a, x) => a + x.lng, 0) / list.length;
            const postcodes = Array.from(new Set(list.flatMap(x => x.postcode || []).map((p: string) => p.replace(/\s+/g, ' ').trim())));
            const planned = r.natureofoutage === 'Planned Work on System';
            return {
                id: `npg_${ref}`,
                locationName: `${r.area || 'Northern Powergrid'}${postcodes.length ? ` (${postcodes.slice(0, 3).join(', ')}${postcodes.length > 3 ? ` +${postcodes.length - 3}` : ''})` : ''}`,
                lat, lng,
                consumersAffected: r.totalconfirmedpowercut || r.totalpredictedpowercut || 0,
                description: `${planned ? 'Planned work' : r.natureofoutage || 'Power cut'}${r.reason ? ` - ${String(r.reason).slice(0, 180)}` : ''}`,
                startTime: r.loggedtime || '',
                estRestoration: r.estimatedtimetillresolution || 'TBC',
                source: 'Northern Powergrid (live)',
                status: planned ? 'Active' : (NPG_STATUS[r.incidentstatus] || 'Active'),
                isSimulated: false
            };
        });
    } catch (e: any) {
        markFail('npg', e.message);
        logSystemError("Northern Powergrid live faults unavailable", e.message, "warning");
        return [];
    }
};

// Live power cuts from NGED, SSEN and SPEN, collected by the site's Cloudflare Worker.
export let workerSourceStatus: { id: string, name: string, ok: boolean, count: number, error?: string }[] = [];
const fetchWorkerOutages = async (): Promise<OutageEvent[]> => {
    if (!OUTAGE_WORKER_URL) return [];
    try {
        const resp = await fetchWithTimeout(OUTAGE_WORKER_URL.replace(/\/$/, '') + '/outages', 20000);
        if (!resp.ok) throw new Error(`Worker HTTP ${resp.status}`);
        const json = await resp.json();
        workerSourceStatus = json.sources || [];
        workerSourceStatus.filter(sr => !sr.ok).forEach(sr => logSystemError(`${sr.name} live faults unavailable`, sr.error, "warning"));
        return (json.outages || []).filter((o: OutageEvent) => typeof o.lat === 'number' && typeof o.lng === 'number');
    } catch (e: any) {
        logSystemError("Power cut collector (Cloudflare Worker) unavailable", e.message, "warning");
        workerSourceStatus = [];
        return [];
    }
};

// Real outages only: UKPN's live feed for the UK, plus AI web search if the visitor has added a key.
// (Earlier versions invented "simulated" incidents when nothing was found - removed.)
export const fetchRealTimeOutages = async (regionName: string): Promise<OutageEvent[]> => {
    const key = regionName;
    const now = Date.now();
    if (outageCache.has(key)) {
        const cached = outageCache.get(key)!;
        if (now - cached.timestamp < 300000) return cached.data;
    }

    const isUK = (REGIONS.find(r => r.name === regionName)?.id || 'UK') === 'UK';
    const livePromise = isUK
        ? Promise.all([fetchUkpnLiveFaults(), fetchNpgLiveFaults(), fetchWorkerOutages()]).then(r => r.flat())
        : Promise.resolve([] as OutageEvent[]);

    let aiOutages: OutageEvent[] = [];
    if (!aiClient) initGenAI();
    
    if (aiClient) {
        const prompt = `Search for CURRENT, real-time power outages in ${regionName}. 
        Return a valid JSON ARRAY of objects. 
        Schema: [{ "locationName": "City", "lat": number, "lng": number, "consumersAffected": number, "description": "reason", "startTime": "YYYY-MM-DD HH:MM", "estRestoration": "YYYY-MM-DD HH:MM", "source": "DNO", "status": "Active" }]
        If no outages are found, return strictly []. Do not output markdown or text explanations.`;
        
        try {
            const response = await aiClient.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: [{ parts: [{ text: prompt }] }],
                config: { tools: [{ googleSearch: {} }] }
            });
            if (response.text) {
                 // Try to extract JSON, default to empty array if extraction returns weird text
                 const jsonText = extractJSON(response.text);
                 const raw = JSON.parse(jsonText);
                 
                 if (Array.isArray(raw) && raw.length > 0) {
                     const result = raw.map((r: any, i: number) => ({
                         id: `outage_${Date.now()}_${i}`,
                         locationName: r.locationName || "Unknown Location",
                         lat: r.lat,
                         lng: r.lng,
                         consumersAffected: Number(r.consumersAffected) || 0,
                         description: r.description || "Unplanned Circuit Fault",
                         startTime: r.startTime || new Date().toISOString(),
                         estRestoration: r.estRestoration || "TBC",
                         source: `AI web search (unverified)${r.source ? ` - ${r.source}` : ""}`,
                         status: r.status || "Active",
                         isSimulated: false // AI Retrieved Real Data (Likely)
                     }));
                     // Update Cache
                     aiOutages = result.filter((o: OutageEvent) => typeof o.lat === 'number' && typeof o.lng === 'number');
                 } else if (Array.isArray(raw) && raw.length === 0) {
                     // Valid empty result, no fallback needed
                     aiOutages = [];
                 }
            }
        } catch (e: any) { 
            // Silent fallback for JSON errors or API issues
            // Only log if it's a critical quota issue
            if (e.message && e.message.includes("429")) {
                handleApiError(e);
            } else {
                console.warn("Outage fetch had no results or failed JSON parse", e); 
            }
        }
    }


    const live = await livePromise;
    const result = [...live, ...aiOutages];
    outageCache.set(key, { timestamp: now, data: result });
    return result;
};

export const fetchHistoricalOutages = async (regionName: string, year: number = 2024): Promise<OutageEvent[]> => {
    if (!aiClient) initGenAI();
    if (!aiClient) return [];
    const prompt = `Search for significant historical power outages in ${regionName} in ${year}. Return a valid JSON ARRAY.`;
    try {
        const response = await aiClient.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{ parts: [{ text: prompt }] }],
            config: { tools: [{ googleSearch: {} }] }
        });
        if (response.text) {
             const raw = JSON.parse(extractJSON(response.text));
             return raw.map((r: any, i: number) => ({
                 id: `hist_outage_${year}_${i}`,
                 locationName: r.locationName || "Unknown Location",
                 lat: r.lat,
                 lng: r.lng,
                 consumersAffected: Number(r.consumersAffected) || 0,
                 description: r.description || "Historical Outage Event",
                 startTime: r.startTime || `${year}-01-01`,
                 source: r.source || "Historical Archive",
                 status: "Resolved"
             }));
        }
    } catch (e) { 
        handleApiError(e);
        console.warn("Historical Outage fetch failed", e); 
    }
    return [];
};

export const generateRiskScenarios = async (regionName: string, _assets: InfrastructureAsset[] = []): Promise<RiskScenario[]> => {
    if (!aiClient) initGenAI();
    if (!aiClient) return [];
    const prompt = `Propose 4 energy risk scenarios for ${regionName} that are not already obvious (we already cover storms like Arwen, 9 August 2019, North Hyde, black start, gas shortage, subsea cables, LNG, cyber attacks on control systems, smart devices and supply chain).
Return a JSON array of objects: ${PROPOSAL_FIELDS}
${PROPOSAL_RULES}`;
    try {
        const response = await aiClient.models.generateContent({ model: 'gemini-2.5-flash', contents: [{ parts: [{ text: prompt }] }], config: { tools: [{ googleSearch: {} }] } });
        const raw = JSON.parse(extractJSON(response.text || '[]'));
        return (Array.isArray(raw) ? raw : [raw]).slice(0, 6).map((r: any, i: number) => toProposal(r, regionName, i));
    } catch (e: any) {
        handleApiError(e);
        return [];
    }
};

// Kept for compatibility: the impact model now lives in services/impactModel.ts (no AI, no random numbers).
export const calculateScenarioImpact = async (scenario: RiskScenario): Promise<TimelineStep[]> => buildTimeline([scenario]);

export const analyzeAssetRisks = async (asset: InfrastructureAsset, region: string) => {
    // Check Cache
    const key = `${asset.id}_${region}`;
    if (analysisCache.has(key)) {
        return analysisCache.get(key);
    }

    if (!aiClient) initGenAI();
    if (!aiClient) return "AI analysis needs a Gemini key. Click \"AI: Off\" in the top bar to add your free key.";
    
    const prompt = `Analyze the strategic importance and risks for: Asset: ${asset.name} Type: ${asset.typeId} Region: ${region}. 
    Using publicly available sources only, provide a concise 3 bullet point summary of:
    1. Grid criticality (its role in the system, capacity, what depends on it)
    2. General vulnerabilities typical of this TYPE of asset (physical, weather, cyber) - do not speculate about this specific site's security, suppliers or control systems
    3. Economic and customer impact if it were unavailable
    Cite figures only if they come from a source you found, and name the source. If you are unsure, say so.`;
    
    try {
        const response = await aiClient.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{ parts: [{ text: prompt }] }],
            config: { tools: [{ googleSearch: {} }] }
        });
        const result = cleanText(response.text || "No analysis generated.");
        analysisCache.set(key, result);
        return result;
    } catch(e) { 
        handleApiError(e);
        return "Analysis failed or quota exceeded."; 
    }
};

// 5. Chat Analyst with Map Control Tools
// Turn a Gemini error into something a visitor can act on.
const describeAiError = (e: any): string => {
    const msg = String(e?.message || e || '');
    if (/API key not valid|API_KEY_INVALID|permission|PERMISSION_DENIED|401|403/i.test(msg)) return 'Your Gemini key was rejected. Check it in "AI: On" (top bar) - it may have been deleted or mistyped.';
    if (/429|quota|RESOURCE_EXHAUSTED|rate/i.test(msg)) return "Your Gemini key has hit Google's free-tier limit. Wait a minute (or until tomorrow for the daily limit) and try again.";
    if (/not found|404|is not supported|deprecated/i.test(msg)) return 'The Gemini model used by this app is unavailable for your key. Please let the site owner know.';
    if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'Could not reach Google. Check your internet connection and try again.';
    return `The AI request failed: ${msg.slice(0, 160)}`;
};

// Analyst chat. Gemini answers using (a) the live data currently shown in the app, passed in
// below, and (b) Google Search for anything else. It can also move the map.
// Note: Gemini 2.5 cannot combine Google Search with function calling in one request,
// so map moves are returned as a simple text tag instead of a function call.
export const chatWithAnalyst = async (history: ChatMessage[], context: any, newMessage: string) => {
    if (!aiClient) initGenAI();
    if (!aiClient) { requestAiKey(); return { text: "The AI analyst needs a Gemini key. Click \"AI: Off\" in the top bar to add your free key.", toolCall: null }; }

    const neso = context.nesoData;
    const scenarios = (context.scenarios || []) as RiskScenario[];
    const systemInstruction = `You are an energy-sector resilience analyst helping a user of a GB energy risk map.

LIVE DATA FROM THE APP (fetched in the last few minutes - treat as current):
- Region: ${context.region}
- GB demand: ${neso?.estimated ? 'unknown (live feed unavailable)' : neso?.demand ? Math.round(neso.demand) + ' MW' : 'unknown'}; frequency (single latest reading): ${neso?.estimated ? 'unknown' : neso?.frequency ? neso.frequency.toFixed(3) + ' Hz' : 'unknown'}; carbon intensity: ${neso?.carbonIntensity ? neso.carbonIntensity + ' gCO2/kWh' : 'unknown'}
- Official NESO system warnings (Elexon SYSWARN, last 48h): ${context.systemWarnings || 'none'}
- Generation mix: ${context.generationMix || 'unknown'}
- Assets on the map: ${context.assetCount}
- Power station / interconnector outages (Elexon REMIT, live): ${context.generatorOutages || 'none loaded'}
- ${context.liveSystems || 'Other live system data not loaded'}
- Live power cuts shown (${context.outageCount}): ${context.activeOutages || 'none'}
- Live power-cut sources connected: UK Power Networks, Northern Powergrid${OUTAGE_WORKER_URL ? ', plus ' + (workerSourceStatus.filter(x => x.ok).map(x => x.name).join(', ') || 'none of NGED/SSEN/SPEN yet') : ''}. North West England (Electricity North West) has no open live feed. Areas without a connected feed may still have power cuts.

SCENARIO BEING SIMULATED: ${scenarios.length === 0 ? 'none' : scenarios.map(sc =>
    `${sc.name} [${sc.category}] - ${sc.description} Model: ${describeProfile(profileOf(sc))} Why these numbers: ${sc.rationale || 'not stated (older or AI-drafted scenario)'} Sources: ${(sc.sources || []).join('; ') || 'none'}${sc.supplyLost ? ` Supply lost: ${sc.supplyLost.label}` : ''}`).join(' | ')}
SCENARIO METHOD: ${methodNote} Scenario figures are modelled, not forecasts; explain assumptions when asked.
${context.timelineNow ? `Simulation now at: ${context.timelineNow}` : ''}

RULES:
- Ground answers in the live data above where relevant, and say when you're using it.
- Use Google Search for facts not in the data above, and say what you found.
- Be clear about uncertainty. Never invent figures, incidents, suppliers or vulnerabilities. If you don't know, say so.
- When judging how "stretched" or "tight" the system is, give most weight to official NESO notices (Electricity Margin Notices, Capacity Market Notices, demand control warnings). Planned outages of several GW are normal, especially outside winter peaks. Frequency between 49.8 and 50.2 Hz is within normal operating limits, and one reading says little on its own. Don't overstate stress.
- Keep answers concise and practical (resilience, cyber and physical risk, mitigations, regulation).
- If the user asks to see, find, zoom to or show a place or asset, end your reply with one line exactly like:
  MAP: <latitude>, <longitude>, <zoom 5-16>`;

    try {
        const chat = aiClient.chats.create({
            model: 'gemini-2.5-flash',
            config: { systemInstruction, tools: [{ googleSearch: {} }] },
            history: history
                .filter(h => h.text && !h.text.startsWith('Hello!'))
                .map(h => ({ role: h.role, parts: [{ text: h.text }] }))
        });

        const result = await chat.sendMessage({ message: newMessage });
        let text = result.text || "";

        // Map move tag
        let toolCall: any = null;
        const m = text.match(/^\s*MAP:\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*$/mi);
        if (m) {
            toolCall = { name: 'moveMap', args: { lat: parseFloat(m[1]), lng: parseFloat(m[2]), zoom: Math.round(parseFloat(m[3])) } };
            text = text.replace(m[0], '').trim() + '\n[Moving the map...]';
        }

        const groundingChunks = result.candidates?.[0]?.groundingMetadata?.groundingChunks;
        if (groundingChunks && groundingChunks.length > 0) {
            const sources = groundingChunks
                .map((c: any) => c.web?.uri ? `${c.web.title || 'Source'}: ${c.web.uri}` : null)
                .filter((x: string | null) => x)
                .slice(0, 3);
            if (sources.length > 0) text += "\n\nSources (Google Search):\n" + sources.join("\n");
        }

        return { text: cleanText(text) || "No answer returned - please try rephrasing.", toolCall };
    } catch (e: any) {
        handleApiError(e);
        return { text: describeAiError(e), toolCall: null };
    }
};

// 6. Generate Audio Report (Scenario specific)
export const generateVideoReportScript = async (scenario: RiskScenario) => {
    if (!aiClient) initGenAI();
    if (!aiClient) return "Script unavailable.";
    
    const sourcesText = scenario.sources && scenario.sources.length > 0 
        ? scenario.sources.join(', ') 
        : "Standard Industry Risk Vectors (Cyber, Weather, Physical Infrastructure)";

    const prompt = `
        Generate a formal Risk Assessment Briefing for the hypothetical energy security scenario: "${scenario.name}" in ${scenario.region}.
        
        CRITICAL INSTRUCTIONS:
        1. TONE: Highly professional, analytical, and objective. Do NOT write this as a "Breaking News" script. Do NOT include stage directions (e.g. [Sound of alarm], **Camera pans**).
        2. PERSPECTIVE: Present this as a detailed simulation or projection of a potential risk, not a historical event that has already occurred. Use phrasing like "This scenario projects...", "Vulnerabilities indicate...", "Potential impact would be...".
        3. CONTENT:
           - Analyze the specific threat vector (${scenario.category}).
           - Cite credibility sources to validate why this scenario is plausible.
           - Detail the operational and economic consequences.
        
        STRUCTURE THE RESPONSE AS FOLLOWS:
        
        **EXECUTIVE SUMMARY**
        [A concise, 2-sentence executive overview of the risk.]
        
        **SCENARIO ANALYSIS**
        [A detailed narrative explaining how the risk would unfold, referencing specific vulnerabilities in the grid.]
        
        **CREDIBILITY & SOURCES**
        [Explanation of credibility based on: ${sourcesText}.]
        
        **PROJECTED IMPACT**
        [Quantitative summary: ${scenario.peakConsumersAffected} consumers offline, ${scenario.durationDays} days duration. Mention cascading effects.]
        
        Details from System: ${scenario.narrative}. ${scenario.rationale ? `How the figures were reached: ${scenario.rationale}` : ''}
        Do not invent statistics beyond those given here; if you mention other facts, say they are general context.
    `;
    
    try {
        const response = await aiClient.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{ parts: [{ text: prompt }] }]
        });
        return cleanText(response.text || "");
    } catch (e) { 
        handleApiError(e);
        return ""; 
    }
};

// Report text (Report builder). The model only rewrites the facts it is given; figures come from the app.
export const generateReportText = async (kind: 'summary' | 'mitigations', facts: string): Promise<string> => {
    if (!aiClient) initGenAI();
    if (!aiClient) return '';
    const task = kind === 'summary'
        ? 'Write an executive summary of 120-180 words in plain British English for a senior reader. Use ONLY the facts below; do not add any new numbers. Say clearly that scenario figures are modelled, not forecasts, where relevant.'
        : 'List 4-6 practical mitigations or preparedness actions, one short paragraph each, in plain British English. Keep them generic: do not name equipment suppliers or specific sites. Do not add numbers that are not in the facts. Start each with a short bold-free heading followed by a colon.';
    try {
        const response = await aiClient.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{ parts: [{ text: `${task}\n\nFACTS:\n${facts}` }] }],
        });
        return cleanText(response.text || '');
    } catch (e) { handleApiError(e); return ''; }
};

export const generateNarratedAudio = async (script: string) => {
    if (isAudioQuotaExceeded || !aiClient) return null;
    // Strip headers and formatting for TTS to ensure smooth reading
    const spokenText = script
        .replace(/\*\*.*?\*\*/g, '') // Remove bold headers
        .replace(/EXECUTIVE SUMMARY|SCENARIO ANALYSIS|CREDIBILITY & SOURCES|PROJECTED IMPACT/g, '') // Remove specific headers
        .replace(/\[.*?\]/g, '') // Remove anything in brackets
        .trim();
    
    try {
        const response = await aiClient.models.generateContent({
            model: 'gemini-2.5-flash-preview-tts',
            contents: [{ parts: [{ text: spokenText }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } }
            }
        });
        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (base64Audio) {
            const binaryString = atob(base64Audio);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
            const buffer = new ArrayBuffer(44 + bytes.length);
            const view = new DataView(buffer);
            const writeString = (view: DataView, offset: number, string: string) => {
                for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
            };
            writeString(view, 0, 'RIFF');
            view.setUint32(4, 36 + bytes.length, true);
            writeString(view, 8, 'WAVE');
            writeString(view, 12, 'fmt ');
            view.setUint32(16, 16, true);
            view.setUint16(20, 1, true);
            view.setUint16(22, 1, true);
            view.setUint32(24, 24000, true);
            view.setUint32(28, 24000 * 2, true);
            view.setUint16(32, 2, true);
            view.setUint16(34, 16, true);
            writeString(view, 36, 'data');
            view.setUint32(40, bytes.length, true);
            new Uint8Array(buffer, 44).set(bytes);
            
            const blob = new Blob([buffer], { type: 'audio/wav' });
            return URL.createObjectURL(blob);
        }
    } catch (e) {
        isAudioQuotaExceeded = true;
        handleApiError(e);
    }
    return null;
};

export const generateSlideshowImages = async (scenarioName: string) => {
    if (!aiClient) initGenAI();
    if (!aiClient) return [];
    try {
        const prompt = `Photorealistic images of energy infrastructure during ${scenarioName}: storm damaged power lines, cyber security operations center, repair crews in rain, control room screens.`;
         const response = await aiClient.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: [{ parts: [{ text: prompt }] }],
        });
        const imgs: string[] = [];
        for (const part of response.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData?.data) imgs.push(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
        }
        return imgs.length > 0 ? imgs : ["https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?auto=format&fit=crop&w=1600&q=80"];
    } catch(e) { 
        handleApiError(e);
        return ["https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?auto=format&fit=crop&w=1600&q=80"]; 
    }
};

export const generateIncidentVideo = async (scenario: RiskScenario) => {
    if (!aiClient) initGenAI();
    if (!aiClient) return null;
    try {
        const prompt = `Cinematic drone footage of ${scenario.name} affecting energy infrastructure in ${scenario.region}. ${scenario.category} weather conditions. Dark, dramatic lighting. High quality, 4k.`;
        let operation = await aiClient.models.generateVideos({
            model: 'veo-3.1-fast-generate-preview',
            prompt: prompt,
            config: {
                numberOfVideos: 1,
                resolution: '720p',
                aspectRatio: '16:9'
            }
        });
        while (!operation.done) {
            await new Promise(resolve => setTimeout(resolve, 5000));
            operation = await aiClient.operations.getVideosOperation({operation: operation});
        }
        const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
        if (videoUri) return `${videoUri}&key=${getAiKey()}`;
    } catch (e) { 
        console.error("Video gen failed", e);
        handleApiError(e); 
    }
    return null;
};

