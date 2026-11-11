
import { GoogleGenAI, Modality, Type, FunctionDeclaration } from "@google/genai";
import { RiskScenario, InfrastructureAsset, TimelineStep, ChatMessage, OutageEvent, GenerationMix, SupplyChainInsight, LogEntry } from '../types';
import { ASSET_TYPES, DEEP_SEARCH_PROTOCOLS, REGIONS } from '../constants';
import { getAiKey, onAiKeyChange, requestAiKey } from './aiKey';

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
    return [
        {
            org: "Google Gemini (your key)",
            status: !hasKey ? "Not set" : isGenAIQuotaExceeded ? "Degraded" : "Operational",
            keyStatus: !hasKey ? "Add key to enable AI" : isGenAIQuotaExceeded ? "Quota Limit" : "Your key",
            type: "AI Analysis"
        },
        { org: "Elexon Insights (BMRS)", status: "Operational", keyStatus: "Open Data", type: "Frequency & Demand" },
        { org: "NESO Carbon Intensity", status: "Operational", keyStatus: "Open Data", type: "Generation Mix" },
        { org: "OpenStreetMap / Overpass", status: "Operational", keyStatus: "Open Data", type: "Infrastructure & Search" },
        { org: "CARTO Basemaps", status: "Operational", keyStatus: "Open Data", type: "Map Tiles" },
        { org: "RainViewer", status: "Operational", keyStatus: "Public", type: "Weather Radar" },
    ];
};

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

// Helper for Robust Fetching with Retry
const fetchOverpassWithRetry = async (query: string, signal?: AbortSignal, retries = 3, delay = 2000): Promise<any> => {
    for (let i = 0; i <= retries; i++) {
        try {
            const response = await fetch('https://overpass-api.de/api/interpreter', {
                method: 'POST',
                body: `data=${encodeURIComponent(query)}`,
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                signal
            });
            
            if (response.ok) {
                return await response.json();
            }
            
            // Retry on 429 (Rate Limit), 504 (Gateway Timeout), 502 (Bad Gateway), 500 (Internal Error)
            if ([429, 500, 502, 503, 504].includes(response.status)) {
                if (i < retries) {
                    const backoff = delay * (i + 1); // Linear backoff
                    console.warn(`Overpass API Retry ${i + 1}/${retries} (${response.status}) in ${backoff}ms`);
                    await new Promise(res => setTimeout(res, backoff)); 
                    continue;
                }
            }
            
            throw new Error(`Overpass API Error ${response.status}`);
        } catch (e: any) {
            if (e.name === 'AbortError') throw e;
            if (i === retries) throw e;
            const backoff = delay * (i + 1);
            console.warn(`Overpass Net Error Retry ${i + 1}/${retries}: ${e.message}`);
            await new Promise(res => setTimeout(res, backoff));
        }
    }
};

// --- Overpass API Integration ---
// Updated to split queries to ensure robust fetching of interconnectors and power lines
const fetchOverpassData = async (lat: number, lng: number, scope: 'national' | 'local', onProgress?: (msg: string) => void, signal?: AbortSignal): Promise<InfrastructureAsset[]> => {
    if (onProgress) onProgress(`Querying OSM (${scope.toUpperCase()} scope)...`);

    const delta = scope === 'national' ? 4.5 : 0.6;
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
            [out:json][timeout:180];
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
            [out:json][timeout:180];
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
        const results = await Promise.all(queries.map(q => fetchOverpassWithRetry(q, signal)));
        const elements = results.map(r => r.elements || []).flat();

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
                 
                 if (isCable && tags.location === 'underwater') typeId = 'interconnector';
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

            let cYear = undefined;
            if (isDc) {
                cYear = Math.floor(2015 + Math.random() * 11);
            }

            if (!lat || !lng) return null;

            return {
                id: `op_${el.id}`,
                name: tags.name || `${typeId.replace('_', ' ')} ${el.id}`,
                typeId: typeId,
                lat: lat,
                lng: lng,
                capacityMW: isDc ? Math.floor(Math.random() * 150 + 50) : undefined,
                status: 'Operational' as const,
                commissionYear: cYear,
                path: path,
                rawTags: tags 
            };
        }).filter((x: any) => x !== null);

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

// Live GB grid snapshot: Elexon (frequency, demand) + NESO Carbon Intensity.
export const fetchNESOPowerData = async (): Promise<{demand: number, frequency: number, carbonIntensity: number}> => {
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

    // Fallbacks (only used if the open data services are unreachable)
    if (demand === 0) {
        logSystemError("Live demand unavailable", "Using estimated demand profile", "warning");
        const hour = new Date().getHours();
        demand = Math.floor(22000 + ((hour > 7 && hour < 22) ? 15000 : 0) + Math.random() * 2000);
    }
    if (frequency === 0) frequency = 50.0 + ((Math.random() - 0.5) * 0.1);
    if (carbonIntensity === 0) carbonIntensity = 150;

    return { demand, frequency, carbonIntensity };
};

export const fetchGenerationMix = async (): Promise<GenerationMix | null> => {
    const generateFallback = () => {
         return {
            from: new Date().toISOString(),
            to: new Date().toISOString(),
            generation: [
                { fuel: 'gas', perc: 35 },
                { fuel: 'wind', perc: 28 },
                { fuel: 'nuclear', perc: 15 },
                { fuel: 'biomass', perc: 8 },
                { fuel: 'solar', perc: 6 },
                { fuel: 'imports', perc: 5 },
                { fuel: 'hydro', perc: 2 },
                { fuel: 'coal', perc: 1 }
            ],
            renewablesPerc: 44,
            fossilPerc: 36,
            lowCarbonPerc: 59
        };
    };

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const response = await fetch('https://api.carbonintensity.org.uk/generation', { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!response.ok) throw new Error("Failed to fetch generation mix");
        const data = await response.json();
        const genData = data.data; 
        if (!genData || !genData.generation) return generateFallback();
        const mix = genData.generation;
        const getPerc = (fuel: string) => mix.find((x: any) => x.fuel === fuel)?.perc || 0;
        const renewables = getPerc('wind') + getPerc('solar') + getPerc('hydro') + getPerc('biomass');
        const fossil = getPerc('gas') + getPerc('coal');
        const lowCarbon = renewables + getPerc('nuclear');
        return { from: genData.from, to: genData.to, generation: mix, renewablesPerc: renewables, fossilPerc: fossil, lowCarbonPerc: lowCarbon };
    } catch (e: any) {
        logSystemError("Gen Mix Fetch Failed", e.message, "warning");
        return generateFallback();
    }
};

export const fetchGridHistory = async (metric: 'demand' | 'frequency', range: '24h' | '7d' | '30d' | '1y'): Promise<{ timestamp: number, value: number }[]> => {
    const cacheKey = `${metric}_${range}`;
    if (historyCache.has(cacheKey)) return historyCache.get(cacheKey)!;

    let data: { timestamp: number, value: number }[] = [];
    const now = Date.now();
    let points = 48; // Default 24h (30 min)
    let intervalMs = 1800000;

    switch (range) {
        case '24h': points = 48; intervalMs = 1800000; break; 
        case '7d': points = 168; intervalMs = 3600000; break; // 1h
        case '30d': points = 120; intervalMs = 21600000; break; // 6h
        case '1y': points = 365; intervalMs = 86400000; break; // 1d
    }

    // 1. Fetch Live Anchor (Real-time Value)
    // We use this to anchor the end of the graph to reality, even if history needs simulation.
    let anchorValue = 0;
    try {
        const live = await fetchNESOPowerData();
        if (metric === 'demand') anchorValue = live.demand;
        if (metric === 'frequency') anchorValue = live.frequency;
    } catch (e) {
        console.warn("Failed to get anchor value");
    }

    // Default Anchors if live fetch completely fails
    if (!anchorValue || anchorValue === 0) {
        if (metric === 'demand') anchorValue = 32000; // Typical UK demand MW
        if (metric === 'frequency') anchorValue = 50.0;
    }

    // 2. Real history from Elexon for the last 24 hours
    let fetchedData: { timestamp: number, value: number }[] = [];
    if (range === '24h') {
        try {
            if (metric === 'demand') {
                const resp = await fetchWithTimeout(`${ELEXON_API}/demand/outturn/summary?format=json`, 8000);
                if (resp.ok) {
                    const rows = await resp.json();
                    const list = Array.isArray(rows) ? rows : rows.data || [];
                    const cutoff = now - 86400000;
                    list.forEach((r: any) => {
                        const t = new Date(r.startTime).getTime();
                        if (t >= cutoff && typeof r.demand === 'number') fetchedData.push({ timestamp: t, value: r.demand });
                    });
                }
            } else {
                const from = new Date(now - 86400000).toISOString();
                const to = new Date(now).toISOString();
                const resp = await fetchWithTimeout(`${ELEXON_API}/system/frequency?from=${from}&to=${to}&format=json`, 10000);
                if (resp.ok) {
                    const json = await resp.json();
                    const rows = json.data || [];
                    // 15-second data: keep one reading per 5 minutes for the chart
                    rows.forEach((r: any, i: number) => {
                        if (i % 20 === 0) fetchedData.push({ timestamp: new Date(r.measurementTime).getTime(), value: r.frequency });
                    });
                }
            }
        } catch (e) {
            console.warn("Elexon history fetch error", e);
        }
    }

    // 3. Construct Final Data (Real or Synthetic)
    if (fetchedData.length >= 24) {
        // Use real data if we have enough points (e.g. half a day)
        data = fetchedData.sort((a,b) => a.timestamp - b.timestamp);
    } else {
        // SYNTHETIC GENERATION
        // Backfill using anchorValue and profiles so charts are never empty
        for (let i = points; i >= 0; i--) {
            const ts = now - (i * intervalMs);
            const date = new Date(ts);
            const hour = date.getHours() + (date.getMinutes() / 60);
            
            let val = anchorValue;

            if (metric === 'demand') {
                // Generate a realistic curve relative to the anchor (current time)
                // Profile returns 0.65 (night) to 1.0 (peak)
                const getProfile = (h: number) => {
                    if (h < 5) return 0.65;
                    if (h < 9) return 0.65 + ((h-5)/4)*0.25; // Rise 0.65->0.9
                    if (h < 16) return 0.9;
                    if (h < 18) return 0.9 + ((h-16)/2)*0.1; // Rise 0.9->1.0
                    if (h < 20) return 1.0;
                    return 1.0 - ((h-20)/4)*0.35; // Fall
                };
                
                const currentHour = new Date().getHours() + (new Date().getMinutes()/60);
                const currentFactor = getProfile(currentHour);
                const historyFactor = getProfile(hour);
                
                // Adjust: val = anchor * (historical_profile / current_profile)
                val = anchorValue * (historyFactor / currentFactor) + ((Math.random()-0.5)*500);
            } else {
                // Frequency: Random walk returning to anchor
                // We assume frequency stays near 50.0
                const diff = 50.0 - anchorValue; 
                // interpolate from 50.0 (past assumption) to anchor (now)
                const progress = 1 - (i / points); // 0 (past) -> 1 (now)
                const base = 50.0 - (diff * progress); // Linear trend to target
                val = base + ((Math.random() - 0.5) * 0.05);
            }
            data.push({ timestamp: ts, value: val });
        }
    }

    historyCache.set(cacheKey, data);
    return data;
};

export const analyzeGridHistory = async (metric: string, range: string, data: { timestamp: number, value: number }[]) => {
    if (!aiClient) initGenAI();
    if (!aiClient) return "AI analysis needs a Gemini key. Click \"AI: Off\" in the top bar to add your free key.";

    // Sample data to reduce token count (take every nth point)
    const sampleRate = Math.ceil(data.length / 20);
    const sampled = data.filter((_, i) => i % sampleRate === 0).map(d => `${new Date(d.timestamp).toLocaleDateString()} ${new Date(d.timestamp).getHours()}:00 = ${d.value.toFixed(2)}`);

    const prompt = `
        Analyze the following historical ${metric} data for the UK Energy Grid over the last ${range}.
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
        const newAssets = await fetchOverpassData(centerLat, centerLng, overpassScope, onProgress, signal);
        
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

export const generateCustomScenario = async (userQuery: string, region: string): Promise<RiskScenario | null> => {
    if (!aiClient) initGenAI();
    if (!aiClient) { requestAiKey(); return null; }
    const isDeepSearch = !userQuery.trim();
    const promptText = isDeepSearch 
        ? `Conduct a DEEP SWEEP threat assessment for ${region}. Search across ALL risk categories (Storm, Cyber, Asset Failure, Geopolitical, Supply Chain) for the single most probable and high-impact scenario currently. Do not default to generic results.`
        : `Create a detailed Energy Risk Scenario for ${region} based on this specific query: "${userQuery}".`;
    const prompt = `
        ${promptText}
        Return a valid JSON object (NOT an Array) with this schema:
        {
            "name": "Creative Title",
            "category": "Storm" | "Cyber" | "Asset Failure" | "Supply Chain" | "Geopolitical" | "Growth",
            "description": "Short summary",
            "probability": "Low" | "Medium" | "High",
            "impactLevel": "Major" | "Critical",
            "durationDays": integer,
            "peakConsumersAffected": integer,
            "affectedDistricts": ["Town A", "City District B"],
            "locations": [{"name": "Site A", "lat": 51.5, "lng": -0.1}, {"name": "Site B", "lat": 52.0, "lng": -1.5}] (Optional, for specific impact points),
            "narrative": "Detailed narrative.",
            "sources": ["Source 1"]
        }
    `;
    try {
        const response = await aiClient.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{ parts: [{ text: prompt }] }],
            config: { tools: [{ googleSearch: {} }] }
        });
        const text = response.text || "";
        const json = JSON.parse(extractJSON(text));
        
        // Ensure coordinates exist if locations provided
        let coords = { lat: 0, lng: 0 };
        if (json.locations && json.locations.length > 0) {
            coords = { lat: json.locations[0].lat, lng: json.locations[0].lng };
        }
        
        return {
            id: `custom_${Date.now()}`,
            ...json,
            coordinates: coords,
            affectedAssets: [], region: region, lastUpdated: Date.now(), status: 'New'
        };
    } catch (e) { 
        handleApiError(e);
        return null; 
    }
};

export const fetchRealTimeOutages = async (regionName: string): Promise<OutageEvent[]> => {
    // Check Cache (5 minutes TTL)
    const key = regionName;
    const now = Date.now();
    if (outageCache.has(key)) {
        const cached = outageCache.get(key)!;
        if (now - cached.timestamp < 300000) {
            console.log("Using cached outages");
            return cached.data;
        }
    }

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
                         consumersAffected: r.consumersAffected || Math.floor(Math.random() * 500) + 50,
                         description: r.description || "Unplanned Circuit Fault",
                         startTime: r.startTime || new Date().toISOString(),
                         estRestoration: r.estRestoration || "TBC",
                         source: r.source || "Network Data",
                         status: r.status || "Active",
                         isSimulated: false // AI Retrieved Real Data (Likely)
                     }));
                     // Update Cache
                     outageCache.set(key, { timestamp: now, data: result });
                     return result;
                 } else if (Array.isArray(raw) && raw.length === 0) {
                     // Valid empty result, no fallback needed
                     outageCache.set(key, { timestamp: now, data: [] });
                     return [];
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

    // FALLBACK: Generate simulated outages if AI fails to return valid JSON
    // This ensures user sees *something* rather than an error if the AI just couldn't find real news.
    // We only fallback if we really want "demo" mode behavior. 
    // If we want real data only, we should return [].
    // Assuming user prefers Demo data over empty data for resilience test:
    logSystemError("Outage Fetch Failed", "Fallback to simulated data", "info");
    const region = REGIONS.find(r => r.name === regionName) || REGIONS[0];
    const fallbackOutages: OutageEvent[] = [];
    const count = 3 + Math.floor(Math.random() * 3);
    
    for(let i=0; i<count; i++) {
        fallbackOutages.push({
            id: `fb_outage_${Date.now()}_${i}`,
            locationName: `Simulated Incident ${i+1}`,
            lat: region.lat + (Math.random() - 0.5) * 1.5, // 1.5 degree spread
            lng: region.lng + (Math.random() - 0.5) * 2.5,
            consumersAffected: Math.floor(Math.random() * 5000) + 100,
            description: "Reported supply interruption (Live Simulation)",
            startTime: new Date(Date.now() - Math.random()*86400000).toISOString(),
            estRestoration: "TBC",
            source: "DNO Simulation Feed",
            status: 'Active',
            isSimulated: true // Explicitly marked as simulated
        });
    }
    
    outageCache.set(key, { timestamp: now, data: fallbackOutages });
    return fallbackOutages;
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
                 consumersAffected: r.consumersAffected || Math.floor(Math.random() * 5000) + 1000,
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

export const generateRiskScenarios = async (regionName: string, assets: InfrastructureAsset[] = []): Promise<RiskScenario[]> => {
    if (!aiClient) initGenAI();
    if (!aiClient) return [];
    const assetContext = assets.filter(a => ['nuclear', 'gas', 'substation', 'wind_offshore'].includes(a.typeId)).slice(0, 8).map(a => `ID:${a.id} Name:${a.name} Type:${a.typeId}`).join(", ");
    const prompt = `Generate 8 detailed energy risk scenarios for ${regionName}. Asset Context: ${assetContext}. REQUIRED: Cyber, Asset Failure, Storm, Supply Chain.
    Structure the response as a JSON Array.
    Ensure scenarios include a 'locations' array if they affect specific multiple sites (e.g. coordinated attacks). Format: locations: [{name, lat, lng}].`;
    try {
        const response = await aiClient.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{ parts: [{ text: prompt }] }],
            config: { tools: [{ googleSearch: {} }] }
        });
        if (response.text) {
            const raw = JSON.parse(extractJSON(response.text));
            return raw.map((r: any, i: number) => ({
                id: `risk_${Date.now()}_${i}`,
                name: r.name || `Scenario ${i+1}`,
                category: r.category || "Asset Failure",
                description: r.description || "Unforeseen grid disruption event.",
                probability: r.probability || "Medium",
                impactLevel: r.impactLevel || "Major",
                durationDays: r.duration || r.durationDays || 5,
                peakConsumersAffected: r.peakConsumersAffected || 50000,
                affectedAssets: r.affectedAssets || [],
                affectedDistricts: r.affectedDistricts || [],
                locations: r.locations || [],
                region: regionName,
                narrative: r.narrative || "No details provided.",
                lastUpdated: Date.now(),
                status: 'New',
                sources: r.sources || ["AI Analysis"]
            }));
        }
    } catch (e: any) { 
        handleApiError(e);
        return []; 
    }
    return [];
};

export const calculateScenarioImpact = async (scenario: RiskScenario): Promise<TimelineStep[]> => {
    if (!aiClient) initGenAI();
    const steps: TimelineStep[] = [];
    const peak = scenario.peakConsumersAffected;
    const duration = scenario.durationDays;
    
    if (scenario.category === 'Growth') {
        const totalSteps = 60; // 1 Minute at 1s/step (or 120 at 0.5s). Adjusted to 60 for 1 minute timeline at 1x speed.
        const startYear = 2015;
        for (let i = 0; i <= totalSteps; i++) {
            const progress = i / totalSteps;
            const year = Math.floor(startYear + (i / 6)); // Approx 6 steps per year for 10 years in 60 steps
            const curve = Math.pow(progress, 2.5); 
            const capacityAdded = Math.floor(peak * curve);
            const investment = (capacityAdded * 8); 
            steps.push({
                day: i,
                consumersOffline: capacityAdded, 
                costMillions: parseFloat(investment.toFixed(1)), 
                restorationPct: Math.floor(progress * 100),
                activeAlerts: i % 6 === 0 ? [`Year ${year}`] : [],
                description: `Year ${year}: Total Capacity ${capacityAdded}MW`
            });
        }
        return steps;
    }
    const costPerConsumerDay = 100; 
    for (let d = 0; d <= duration + 5; d++) {
        let consumers = 0;
        if (d < duration) {
            const progress = d / duration;
            if (progress < 0.2) consumers = peak * (d / (duration * 0.2));
            else consumers = peak * (1 - ((d - (duration * 0.2)) / (duration * 0.8)));
        }
        const dailyCost = (consumers * costPerConsumerDay) / 1000000;
        steps.push({
            day: d,
            consumersOffline: Math.max(0, Math.floor(consumers)),
            costMillions: parseFloat(dailyCost.toFixed(2)),
            restorationPct: Math.min(100, Math.floor((1 - (consumers / peak)) * 100)),
            activeAlerts: d === 0 ? ["Event Start"] : d === duration ? ["Restoration Complete"] : [],
            description: `Day ${d}: Operations stabilizing.`
        });
    }
    return steps;
};

export const analyzeAssetRisks = async (asset: InfrastructureAsset, region: string) => {
    // Check Cache
    const key = `${asset.id}_${region}`;
    if (analysisCache.has(key)) {
        return analysisCache.get(key);
    }

    if (!aiClient) initGenAI();
    if (!aiClient) return "AI analysis needs a Gemini key. Click \"AI: Off\" in the top bar to add your free key.";
    
    const prompt = `Analyze the strategic importance and risks for: Asset: ${asset.name} Type: ${asset.typeId} Region: ${region}. 
    Provide a concise 3 bullet point summary of: 
    1. Grid Criticality 
    2. Vulnerabilities 
    3. Economic Impact. 
    ADDITIONALLY, based on region and asset type, estimate the likely supplier(s) for its OT/SCADA/DCS systems (e.g. Siemens, GE, Schneider, ABB) with a probability (High/Med/Low).`;
    
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

export const generateSupplyChainAnalysis = async (region: string): Promise<SupplyChainInsight[]> => {
    if (!aiClient) initGenAI();
    if (!aiClient) return [];

    const prompt = `
        Conduct a supply chain analysis for the Energy Sector in ${region}.
        Search for associations between major Operational Technology (OT), SCADA, DCS, and Industrial Automation suppliers and local Energy Companies/DNOs.
        Target Suppliers: Siemens, Schneider Electric, GE Vernova, ABB, Honeywell, Dragos, Nozomi Networks, Claroty, Palo Alto Networks, IBM, Accenture, Transition Technologies MS.
        
        Return a valid JSON ARRAY of objects with this schema:
        {
            "supplier": "Supplier Name",
            "techDomain": "SCADA" | "DCS" | "Industrial Automation" | "OT Security",
            "operatorConnection": "Name of Energy Company/DNO using this tech",
            "potentialAssets": ["List of likely asset types or specific known sites"],
            "evidence": "Brief summary of the relationship (e.g. 'Signed 5yr partnership in 2023')",
            "probability": "High" | "Medium" | "Low",
            "sources": ["URL or Title"]
        }
        Limit to top 8 most significant relationships found.
    `;

    try {
        const response = await aiClient.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{ parts: [{ text: prompt }] }],
            config: { tools: [{ googleSearch: {} }] }
        });
        
        const text = response.text || "";
        const json = JSON.parse(extractJSON(text));
        
        if (Array.isArray(json)) {
            return json.map((item: any) => ({
                supplier: item.supplier || "Unknown",
                techDomain: item.techDomain || "OT",
                operatorConnection: item.operatorConnection || "Regional Grid",
                potentialAssets: item.potentialAssets || [],
                evidence: item.evidence || "Inferred from market share.",
                probability: item.probability || "Medium",
                sources: item.sources || []
            }));
        }
        return [];
    } catch (e) {
        handleApiError(e);
        console.error("Supply chain analysis failed", e);
        return [];
    }
};

// 5. Chat Analyst with Map Control Tools
export const chatWithAnalyst = async (history: ChatMessage[], context: any, newMessage: string) => {
    if (!aiClient) initGenAI();
    if (!aiClient) { requestAiKey(); return { text: "The AI analyst needs a Gemini key. Click \"AI: Off\" in the top bar to add your free key.", toolCall: null }; }
    
    const systemInstruction = `You are a Senior Energy Resilience Consultant.
    Context Region: ${context.region}
    Active Scenario: ${context.scenario?.name || "None"}
    Assets Count: ${context.assetCount}
    
    IMPORTANT TOOL USE:
    If the user asks to see, locate, pan to, or zoom into a specific place or asset, you MUST use the 'moveMap' tool. 
    Do not just say you are moving the map, you must actually call the function.
    
    Discuss grid stability, vulnerabilities (cyber/physical), and mitigation strategies.
    USE GOOGLE SEARCH for real-time info. CITE SOURCES.
    `;

    const moveMapTool: FunctionDeclaration = {
        name: "moveMap",
        description: "Moves the map view to a specific latitude, longitude and zoom level. Use this when the user asks to see a location.",
        parameters: {
            type: Type.OBJECT,
            properties: {
                lat: { type: Type.NUMBER, description: "Latitude of the location" },
                lng: { type: Type.NUMBER, description: "Longitude of the location" },
                zoom: { type: Type.NUMBER, description: "Zoom level (1-18). Use 12 for cities, 15 for specific assets, 9 for regions." }
            },
            required: ["lat", "lng", "zoom"]
        }
    };

    try {
         const chat = aiClient.chats.create({
            model: 'gemini-2.5-flash',
            config: { 
                systemInstruction,
                tools: [{ googleSearch: {} }, { functionDeclarations: [moveMapTool] }] 
            },
            history: history.map(h => ({ role: h.role, parts: [{ text: h.text }] }))
        });
        
        const result = await chat.sendMessage({ message: newMessage });
        let text = result.text || "";
        
        // Handle Tool Calls
        let toolCall = null;
        const functionCalls = result.functionCalls;
        if (functionCalls && functionCalls.length > 0) {
            const fc = functionCalls[0];
            if (fc.name === 'moveMap') {
                toolCall = fc;
                text += `\n[Navigating map to target location...]`;
            }
        }

        const groundingChunks = result.candidates?.[0]?.groundingMetadata?.groundingChunks;
        if (groundingChunks && groundingChunks.length > 0) {
            const sources = groundingChunks
                .map((c: any) => c.web?.uri ? `${c.web.title || 'Source'}: ${c.web.uri}` : null)
                .filter((s: string | null) => s)
                .slice(0, 3);
            if (sources.length > 0) text += "\n\n**Sources:**\n" + sources.join("\n");
        }

        return { text: cleanText(text), toolCall };
    } catch (e) { 
        handleApiError(e);
        return { text: "Service unavailable (Quota Limit or Network Issue).", toolCall: null }; 
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
        
        Details from System: ${scenario.narrative}.
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

export const TOUR_SCRIPTS: Record<string, string> = {
    intro: "Welcome to the Energy Sector Resilience Platform. This dashboard visualizes critical infrastructure and simulates risks. Explore the map, run scenarios, and analyze data.",
    asset_info: "Click on any asset marker (Power Plants, Substations) to view details. Use the 'AI Analysis' button in the details panel to get a deep-dive risk assessment.",
    scenarios: "Open the Scenario Manager (Warning Icon) to create or select risk events. You can generate custom scenarios using AI or pick standard ones.",
    timeline: "The timeline at the bottom tracks impact over time. You can play, pause, and speed up the simulation.",
    analyst: "The Analyst AI Assistant (bottom right) offers real-time insights. Ask it about the current simulation state or specific asset vulnerabilities.",
    reports: "Generate audio briefings and print-ready reports via the buttons in the top header or within the simulation stats panel.",
    supply_chain: "The Supply Chain tool analyzes OT vendor risks. Note: This is AI-generated based on public associations and may contain inaccuracies.",
    help: "Access data sources, restart this tour, or view system information from the help menu."
};
