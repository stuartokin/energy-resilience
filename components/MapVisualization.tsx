// The map (MapLibre GL).
//   Background: Esri dark grey raster tiles (free, no key).
//   Energy infrastructure: vector tiles built weekly from OpenStreetMap (public/tiles/energy.pmtiles,
//     see scripts/energy-tiles.yml). If the tiles aren't there yet, the weekly OSM snapshot is shown instead.
//   Live layers (power cuts, generator outages, flows, warnings) are HTML markers on top.
// Click a substation to highlight the lines that connect to it, and see which generators and
// batteries the public connection registers say connect there (services/connections.ts).
import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Protocol } from 'pmtiles';
import { InfrastructureAsset, RegionConfig, RiskScenario, OutageEvent, DNORegion, GeneratorOutage } from '../types';
import { ASSET_TYPES } from '../constants';
import { InterconnectorFlow, RegionalCarbon, FloodWarning, WeatherWarning } from '../services/liveSystems';
import { markOk, markFail } from '../services/health';
import { iconSvg, dotSvg, powerCutSvg, voltageColour, ASSET_ICON } from './icons';
import { FlowLink, fmtGW, fmtNative } from '../services/flows';
import { loadConnections, connectionsAt, tecForStation, normaliseSubName, sameAsSite, ConnectionsData, FUEL_LABEL, FUEL_COLOUR, ECR_SOURCE_LABEL, REPD_STATUS, REPD_SOURCE, minVoltageForMW, searchRadiusKm, INFERENCE_NOTE } from '../services/connections';
import { PlusIcon, MinusIcon } from '@heroicons/react/24/solid';
import { loadGspUnits, unitsFromDno, resolveFootprint, unitStates, Unit, ScenarioUnits, SCENARIO_COLOURS, footprintOf } from '../services/footprint';

interface MapProps {
    region: RegionConfig;
    assets: InfrastructureAsset[];
    outages: OutageEvent[];
    historicalOutages?: OutageEvent[];
    activeScenarios: RiskScenario[];
    dnoRegions?: DNORegion[];
    day: number;
    filters: Set<string>;
    onAssetSelect: (asset: InfrastructureAsset) => void;
    onViewChange?: (center: { lat: number, lng: number, zoom: number }) => void;
    currentImpact?: number;
    peakImpact?: number;
    viewOverride?: { lat: number, lng: number, zoom: number } | null;
    isScenarioComplete?: boolean;
    generatorOutages?: GeneratorOutage[];
    interconnectorFlows?: InterconnectorFlow[];
    energyFlows?: FlowLink[];
    regionalCarbon?: Record<string, RegionalCarbon>;
    floodWarnings?: FloodWarning[];
    weatherWarnings?: WeatherWarning[];
    stepHours?: number;                 // hours since the scenario started at the current timeline step
    cutRoutes?: Set<string>;            // flow link ids cut by the running scenarios
    fleet?: string[];                   // fuel types hit by a common-mode scenario (highlighted)
    placing?: boolean;                  // "Place it" mode: next map click chooses the location
    onPlace?: (p: { lat: number; lng: number; label: string }) => void;
    showCoverage?: boolean;             // hatch areas with no live power-cut data
    onFootprint?: (info: { units: number; source: 'gsp' | 'dno' | 'none' }) => void;
}

// Areas with no open live power-cut feed, and areas where only inferred connection data exist
const NO_FEED_RX = /north west/i;

// PMTiles protocol (registered once)
const pmtilesProtocol = new Protocol();
maplibregl.addProtocol('pmtiles', pmtilesProtocol.tile);
const TILES_URL = new URL('tiles/energy.pmtiles', document.baseURI).href;
const DNO_LINES_URL = new URL('network/dno-lines.pmtiles', document.baseURI).href;

const ESRI_BASE = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}';
const ESRI_LABELS = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}';
const ATTRIBUTION = 'Basemap © <a href="https://www.esri.com">Esri</a>, HERE, Garmin · © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · Radar © <a href="https://www.rainviewer.com">RainViewer</a>';

// Escape text that may come from AI or external feeds before putting it in a popup.
const esc = (v: any) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

// OSM plant/generator source -> our icon type id
const SOURCE_TYPE: Record<string, string> = {
    nuclear: 'nuclear', wind: 'wind_onshore', solar: 'solar', gas: 'gas', coal: 'coal', oil: 'gas', diesel: 'gas',
    biomass: 'biomass', biogas: 'biomass', waste: 'biomass', biofuel: 'biomass', hydro: 'hydro', battery: 'storage', tidal: 'hydro', wave: 'hydro',
};
const TYPE_COLOUR: Record<string, string> = {
    nuclear: '#a855f7', wind_onshore: '#10b981', wind_offshore: '#22d3ee', solar: '#facc15', gas: '#f97316', coal: '#78716c',
    biomass: '#84cc16', hydro: '#60a5fa', storage: '#a3e635', pumped_storage: '#3b82f6', substation: '#eab308', compressor: '#a8a29e',
    datacentre: '#e879f9', interconnector: '#ec4899', gas_terminal: '#fb923c',
};
const colourFor = (typeId: string) => ASSET_TYPES.find(t => t.id === typeId)?.color || TYPE_COLOUR[typeId] || '#94a3b8';

// MapLibre expression: first voltage in an OSM "voltage" tag ("400000;132000" -> 400000)
const VOLT = ['let', 'vs', ['coalesce', ['get', 'voltage'], '0'],
    ['to-number', ['case', ['>=', ['index-of', ';', ['var', 'vs']], 0], ['slice', ['var', 'vs'], 0, ['index-of', ';', ['var', 'vs']]], ['var', 'vs']], 0]] as any;
const VOLT_COLOUR = ['step', VOLT, '#f59e0b', 25000, '#16a34a', 100000, '#0ea5e9', 220000, '#ec4899', 380000, '#a855f7'] as any;
const SRC = (key: string) => ['coalesce', ['get', key], ''] as any;

// Turn an SVG string into an image MapLibre can use
const loadSvg = (svg: string, size: number) => new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image(size, size);
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
});

// A circle (metres) as a GeoJSON polygon
const circlePolygon = (lat: number, lng: number, radiusM: number) => {
    const pts: [number, number][] = [];
    for (let i = 0; i <= 64; i++) {
        const a = (i / 64) * Math.PI * 2;
        const dLat = (radiusM / 111320) * Math.cos(a);
        const dLng = (radiusM / (111320 * Math.cos(lat * Math.PI / 180))) * Math.sin(a);
        pts.push([lng + dLng, lat + dLat]);
    }
    return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [pts] } };
};

// Fit the UK between the open panels (left: Regional Network / Outages; right: Live Systems on large screens)
const UK_BOUNDS: [[number, number], [number, number]] = [[-8.2, 49.9], [1.8, 60.8]];
const ukPadding = () => {
    const w = window.innerWidth;
    // The map now sits between the tool rail and the side panel, so only a small margin is needed
    if (w < 640) return { top: 20, bottom: 30, left: 10, right: 10 };
    return { top: 30, bottom: 30, left: 30, right: 30 };
};

const emptyFC = { type: 'FeatureCollection', features: [] as any[] };

const popupHtml = (title: string, rows: [string, any][], source: string) =>
    `<div style="padding:10px 12px;min-width:200px;max-width:280px"><div style="font-weight:bold;margin-bottom:4px">${esc(title)}</div>` +
    rows.filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `<div style="font-size:11px"><span style="color:#94a3b8">${esc(k)}:</span> ${esc(v)}</div>`).join('') +
    `<div style="color:#64748b;font-size:9px;margin-top:6px">${source}</div></div>`;

const fmtVoltage = (v: any) => String(v || '').split(';').map(x => { const n = parseInt(x, 10); return isNaN(n) ? '' : n >= 1000 ? `${n / 1000} kV` : `${n} V`; }).filter(Boolean).join(' / ');

const mwFmt = (n: number) => n >= 100 ? `${Math.round(n).toLocaleString()} MW` : `${Math.round(n * 10) / 10} MW`;
const CONN_NOTE = 'Matched to this substation by name, so may be incomplete where names differ.';

// "What connects here" section for a substation popup
const connectionsHtml = (data: ConnectionsData | null, name: string) => {
    if (!name) return '';
    const c = connectionsAt(data, name);
    if (!c) return data ? `<div style="font-size:10px;margin-top:6px;color:#64748b">No generators found for this name in the public connection registers.</div>` : '';
    const fuels = Object.entries(c.byFuel).filter(([, mw]) => mw > 0).sort((a, b) => b[1] - a[1]);
    const top = [...c.connected.map(e => ({ n: e.site.site, mw: e.site.mw, f: e.site.fuel, via: e.level })), ...c.tecBuilt.map(t => ({ n: t.project, mw: t.mwConnected, f: '', via: 'Transmission' }))]
        .sort((a, b) => b.mw - a.mw).slice(0, 6);
    return `<div style="margin-top:6px;border-top:1px solid #334155;padding-top:6px;font-size:11px">` +
        `<div style="font-weight:bold">Connected generation and storage: ${mwFmt(c.connectedMW)}</div>` +
        (fuels.length ? `<div style="display:flex;flex-wrap:wrap;gap:2px 8px;margin:2px 0">${fuels.map(([f, mw]) => `<span><span style="color:${FUEL_COLOUR[f] || '#94a3b8'}">●</span> ${esc(FUEL_LABEL[f] || f)} ${mwFmt(mw)}</span>`).join('')}</div>` : '') +
        top.map(t => `<div style="color:#cbd5e1">· ${esc(t.n)} <span style="color:#94a3b8">${mwFmt(t.mw)}${t.via !== 'Transmission' ? ` (via ${t.via})` : ''}</span></div>`).join('') +
        (c.queueMW > 0 ? `<div style="margin-top:3px;color:#fbbf24">In the connection queue: ${mwFmt(c.queueMW)} (${c.accepted.length + c.tecQueue.length} projects)</div>` : '') +
        `<div style="color:#64748b;font-size:9px;margin-top:4px">Source: ${c.sources.map(esc).join('; ')}. ${CONN_NOTE}</div></div>`;
};

const flowPopup = (l: FlowLink) => {
    const into = l.value > 0, out = l.value < 0;
    return `<div style="padding:10px 12px;max-width:280px"><b>${esc(l.name)}</b> <span style="color:#94a3b8">${l.kind === 'electricity' ? 'electricity interconnector' : 'gas'}</span>` +
        `<div style="font-size:11px;color:#cbd5e1">${esc(l.from)}${l.landing ? ` &rarr; ${esc(l.landing)}` : ''}</div>` +
        `<div style="margin-top:4px">${into ? 'Flowing into GB' : out ? 'Flowing out of GB' : 'No flow'}: <b>${fmtNative(l)}</b> (${fmtGW(l.gw)})${l.capacity ? ` of ${l.capacity.toLocaleString()} MW capacity` : ''}</div>` +
        (l.note ? `<div style="font-size:10px;color:#94a3b8;margin-top:4px">${esc(l.note)}</div>` : '') +
        `<div style="color:#64748b;font-size:9px;margin-top:4px">Source: ${l.kind === 'electricity' ? 'Elexon FUELINST (live, 5-minute)' : 'National Gas instantaneous flows (live, 2-minute); GW is converted at an assumed 39.5 MJ/m³'}. Route drawn is indicative.</div></div>`;
};

const OSM_LAYERS = ['osm-plants-icon', 'osm-plants-fill', 'osm-substations-icon', 'osm-substations-fill', 'osm-generators', 'osm-generators-fill', 'osm-lines', 'osm-cables', 'osm-gas', 'osm-gas-sites', 'osm-demand'];

const MapVisualization: React.FC<MapProps> = ({
    region, assets, outages, historicalOutages = [], activeScenarios, dnoRegions = [], day, filters,
    onAssetSelect, onViewChange, currentImpact = 0, peakImpact = 1, viewOverride, isScenarioComplete, generatorOutages = [],
    interconnectorFlows = [], energyFlows = [], regionalCarbon = {}, floodWarnings = [], weatherWarnings = [],
    stepHours = 0, cutRoutes, fleet = [], placing = false, onPlace, showCoverage = true, onFootprint
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<maplibregl.Map | null>(null);
    const [ready, setReady] = useState(false);
    const [tilesAvailable, setTilesAvailable] = useState(false);
    const [dnoLinesOn, setDnoLinesOn] = useState(false);
    const markersRef = useRef<Record<string, maplibregl.Marker[]>>({});
    const popupRef = useRef<maplibregl.Popup | null>(null);
    const lastScenarioId = useRef<string | null>(null);
    const connRef = useRef<ConnectionsData | null>(null);
    const flowsRef = useRef<FlowLink[]>([]);

    // Latest props for event handlers
    const propsRef = useRef({ assets, onAssetSelect, onViewChange, regionalCarbon, placing, onPlace });
    propsRef.current = { assets, onAssetSelect, onViewChange, regionalCarbon, placing, onPlace };
    const [units, setUnits] = useState<{ list: Unit[]; source: 'gsp' | 'dno' | 'none' }>({ list: [], source: 'none' });
    const resolvedRef = useRef<ScenarioUnits[]>([]);
    const unitStateRef = useRef<Map<string, number>>(new Map());
    const darkenTimers = useRef<Map<string, any>>(new Map());

    const isGrowthScenario = activeScenarios.some(s => s.category === 'Growth');
    const growthYear = isGrowthScenario ? 2015 + Math.floor(day / 6) : null;

    const showPopup = (lngLat: maplibregl.LngLatLike, html: string) => {
        popupRef.current?.remove();
        if (!mapRef.current) return;
        popupRef.current = new maplibregl.Popup({ maxWidth: '300px', className: 'er-popup' }).setLngLat(lngLat).setHTML(html).addTo(mapRef.current);
    };

    // Highlight the lines that touch a substation (within ~120 m of where you clicked)
    const highlightConnected = (lngLat: maplibregl.LngLat) => {
        const map = mapRef.current!;
        const pt = map.project(lngLat);
        const metresPerPx = 40075016 * Math.cos(lngLat.lat * Math.PI / 180) / (512 * Math.pow(2, map.getZoom()));
        const r = Math.max(6, Math.min(60, 120 / metresPerPx));
        const layers = ['osm-lines', 'osm-cables'].filter(l => map.getLayer(l));
        const feats = layers.length ? map.queryRenderedFeatures([[pt.x - r, pt.y - r], [pt.x + r, pt.y + r]], { layers }) : [];
        (map.getSource('highlight') as maplibregl.GeoJSONSource)?.setData({ type: 'FeatureCollection', features: feats.map(f => ({ type: 'Feature', properties: {}, geometry: (f as any).geometry })) } as any);
        return feats.length;
    };

    // Draw thin lines from a substation to the register sites that connect to it
    const drawFeeders = (name: string, at: maplibregl.LngLat) => {
        const map = mapRef.current!;
        const c = connectionsAt(connRef.current, name);
        const src = map.getSource('conn-lines') as maplibregl.GeoJSONSource | undefined;
        if (!src) return;
        const sites = c ? c.connected.concat(c.accepted).map(e => e.site) : [];
        src.setData({ type: 'FeatureCollection', features: sites.map(s => ({ type: 'Feature', properties: { color: FUEL_COLOUR[s.fuel] || '#94a3b8', connected: s.connected }, geometry: { type: 'LineString', coordinates: [[at.lng, at.lat], [s.lng, s.lat]] } })) } as any);
    };

    // Find a substation on the map by name (from loaded tiles), nearest to a point
    const findSubstation = (name: string, near: [number, number]): [number, number] | null => {
        const map = mapRef.current!;
        if (!map.getSource('energy') || !name) return null;
        const k = normaliseSubName(name);
        let best: [number, number] | null = null, bestD = 0.6; // ~40-60 km in degrees
        for (const f of map.querySourceFeatures('energy', { sourceLayer: 'substations' }) as any[]) {
            if (!f.properties?.name || normaliseSubName(f.properties.name) !== k) continue;
            const g = f.geometry;
            const pt = g.type === 'Point' ? g.coordinates : g.type === 'Polygon' ? g.coordinates[0][0] : g.type === 'MultiPolygon' ? g.coordinates[0][0][0] : null;
            if (!pt) continue;
            const d = Math.hypot(pt[0] - near[0], (pt[1] - near[1]) * 1.6);
            if (d < bestD) { bestD = d; best = [pt[0], pt[1]]; }
        }
        return best;
    };

    // Most plausible substation for a site with no published connection (labelled as inferred)
    const inferConnection = (lng: number, lat: number, mw: number): { name: string, kv: string, km: number, at: [number, number] } | { reason: string } => {
        const map = mapRef.current!;
        if (!map.getSource('energy')) return { reason: 'Map tiles not loaded, so no connection can be inferred.' };
        if (map.getZoom() < 8) return { reason: 'Zoom in (to about level 9 or closer) to infer the likely connecting substation from OpenStreetMap.' };
        const minV = minVoltageForMW(mw), maxKm = searchRadiusKm(mw);
        const seen = new Set<string>();
        let best: any = null, bestUnknown: any = null;
        for (const f of map.querySourceFeatures('energy', { sourceLayer: 'substations' }) as any[]) {
            const p = f.properties || {};
            if (/minor_distribution|traction|industrial/.test(p.substation || '') && mw >= 1) continue;
            const g = f.geometry;
            let pt: number[] | null = null;
            if (g.type === 'Point') pt = g.coordinates;
            else if (g.type === 'Polygon') { const r = g.coordinates[0]; pt = [r.reduce((a: number, c: number[]) => a + c[0], 0) / r.length, r.reduce((a: number, c: number[]) => a + c[1], 0) / r.length]; }
            else if (g.type === 'MultiPolygon') pt = g.coordinates[0][0][0];
            if (!pt) continue;
            const key = `${p.name || ''}|${pt[0].toFixed(3)},${pt[1].toFixed(3)}`;
            if (seen.has(key)) continue; seen.add(key);
            const d = Math.hypot((pt[1] - lat) * 111.32, (pt[0] - lng) * 111.32 * Math.cos(lat * Math.PI / 180));
            if (d > maxKm) continue;
            const volts = String(p.voltage || '').split(';').map((x: string) => parseInt(x, 10)).filter((x: number) => !isNaN(x));
            const v = volts.length ? Math.max(...volts) : null;
            const cand = { name: p.name || (p.ref ? `Substation ${p.ref}` : 'Unnamed substation'), kv: v ? fmtVoltage(volts.join(';')) : 'voltage not mapped', km: d, at: [pt[0], pt[1]] as [number, number] };
            if (v !== null && v >= minV) { if (!best || d < best.km) best = cand; }
            else if (v === null) { if (!bestUnknown || d < bestUnknown.km) bestUnknown = cand; }
        }
        const pick = best || bestUnknown;
        return pick || { reason: `No suitable substation is mapped in OpenStreetMap within ${maxKm} km (or it is outside the area currently loaded).` };
    };

    const inferredHtml = (lng: number, lat: number, mw: number) => {
        const r = inferConnection(lng, lat, mw);
        const src = mapRef.current!.getSource('conn-lines') as maplibregl.GeoJSONSource | undefined;
        if ('reason' in r) {
            src?.setData(emptyFC as any);
            return `<div style="margin-top:6px;border-top:1px solid #334155;padding-top:6px;font-size:11px;color:#94a3b8">Connection not published. ${esc(r.reason)}</div>`;
        }
        src?.setData({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { color: '#cbd5e1', connected: false }, geometry: { type: 'LineString', coordinates: [[lng, lat], r.at] } }] } as any);
        return `<div style="margin-top:6px;border-top:1px solid #334155;padding-top:6px;font-size:11px"><div>Probably connects to: <b>${esc(r.name)}</b> <span style="color:#94a3b8">(${esc(r.kv)}, ${r.km.toFixed(1)} km)</span></div><div style="color:#fbbf24;font-size:9px;margin-top:2px">${esc(INFERENCE_NOTE)}</div></div>`;
    };

    const repdPopup = (e: any) => {
        const p = e.features?.[0]?.properties;
        if (!p) return;
        const rows: [string, any][] = [
            ['Type', `${FUEL_LABEL[p.fuel] || p.fuel}${p.technology ? ` (${p.technology})` : ''}`],
            ['Capacity', mwFmt(+p.mw)],
            ['Status', REPD_STATUS[p.status] || p.status],
            ['Operator / applicant', p.operator],
            ['REPD reference', p.repdId],
        ];
        const html = popupHtml(p.site, rows, `Source: ${esc(REPD_SOURCE)}.`).replace('</div></div>', `${inferredHtml(e.lngLat.lng, e.lngLat.lat, +p.mw)}</div></div>`);
        showPopup(e.lngLat, html);
    };

    const ecrPopup = (e: any) => {
        const p = e.features?.[0]?.properties;
        if (!p) return;
        const here: [number, number] = [e.lngLat.lng, e.lngLat.lat];
        const seen = new Set<string>();
        const chain = [['Primary', p.primary], ['Bulk supply point', p.bsp], ['Grid supply point', p.gsp]].filter(([, v]) => {
            const k = normaliseSubName(v);
            if (!k || seen.has(k) || sameAsSite(v, p.site)) return false;
            seen.add(k); return true;
        });
        const feats: any[] = [];
        let from = here;
        const found: string[] = [];
        for (const [level, name] of chain) {
            const at = findSubstation(name, from);
            if (at) { feats.push({ type: 'Feature', properties: { color: '#ffffff', connected: true }, geometry: { type: 'LineString', coordinates: [from, at] } }); from = at; found.push(level); }
        }
        (mapRef.current!.getSource('conn-lines') as maplibregl.GeoJSONSource)?.setData({ type: 'FeatureCollection', features: feats } as any);
        const rows: [string, any][] = [
            ['Type', `${FUEL_LABEL[p.fuel] || p.fuel}${p.technology && !/^data/i.test(p.technology) ? ` (${p.technology})` : ''}`],
            ['Capacity', mwFmt(+p.mw)],
            ['Status', p.connected ? 'Connected' : 'Accepted to connect (not yet built)'],
            ['Connection voltage', p.kV ? `${p.kV} kV` : ''],
            ...chain.map(([l, n]) => [`Connects via ${l}`, n] as [string, any]),
        ];
        const note = chain.length ? (found.length ? `Route to ${found.join(' → ')} drawn where the substation is on the map (matched by name).` : 'Zoom in near the substations to draw the route.') : '';
        showPopup(e.lngLat, popupHtml(p.site, rows, `Source: ${esc(ECR_SOURCE_LABEL[p.dno] || p.dno)}. ${note}`));
    };

    // ---------- Vector tile layers (all OSM energy infrastructure) ----------
    const addEnergyTiles = (map: maplibregl.Map) => {
        map.addSource('energy', { type: 'vector', url: `pmtiles://${TILES_URL}` });
        const add = (layer: any) => map.addLayer(layer, 'asset-lines');
        add({ id: 'osm-plants-fill', type: 'fill', source: 'energy', 'source-layer': 'plants', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#f59e0b', 'fill-opacity': 0.12 } });
        add({ id: 'osm-substations-fill', type: 'fill', source: 'energy', 'source-layer': 'substations', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#eab308', 'fill-opacity': 0.25, 'fill-outline-color': '#eab308' } });
        add({ id: 'osm-demand', type: 'fill', source: 'energy', 'source-layer': 'demand', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#e879f9', 'fill-opacity': 0.3, 'fill-outline-color': '#e879f9' } });
        add({ id: 'osm-generators-fill', type: 'fill', source: 'energy', 'source-layer': 'generators', minzoom: 12, filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': ['match', SRC('generator:source'), 'solar', '#facc15', 'wind', '#10b981', 'battery', '#a3e635', '#94a3b8'], 'fill-opacity': 0.35 } });
        add({ id: 'osm-gas', type: 'line', source: 'energy', 'source-layer': 'gas', filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': '#a8a29e', 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.8, 14, 2.5], 'line-dasharray': [1, 2] } });
        add({ id: 'osm-lines', type: 'line', source: 'energy', 'source-layer': 'power_lines', filter: ['!=', ['get', 'power'], 'cable'],
            paint: { 'line-color': ['case', ['==', ['get', 'power'], 'minor_line'], '#f59e0b', VOLT_COLOUR],
                     'line-width': ['interpolate', ['linear'], ['zoom'], 5, ['case', ['>=', VOLT, 220000], 1.3, 0.5], 10, ['case', ['>=', VOLT, 220000], 2.4, 1.2], 15, ['case', ['>=', VOLT, 220000], 4, 2]],
                     'line-opacity': 0.85 } });
        add({ id: 'osm-cables', type: 'line', source: 'energy', 'source-layer': 'power_lines', filter: ['==', ['get', 'power'], 'cable'],
            paint: { 'line-color': VOLT_COLOUR, 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 1, 14, 2.5], 'line-dasharray': [3, 2], 'line-opacity': 0.85 } });
        add({ id: 'osm-generators', type: 'circle', source: 'energy', 'source-layer': 'generators', filter: ['==', ['geometry-type'], 'Point'],
            paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 2, 15, 4], 'circle-color': ['match', SRC('generator:source'), 'wind', '#10b981', 'solar', '#facc15', 'battery', '#a3e635', 'gas', '#f97316', 'hydro', '#60a5fa', 'nuclear', '#a855f7', '#94a3b8'], 'circle-stroke-color': '#0b1120', 'circle-stroke-width': 1 } });
        add({ id: 'osm-substations-icon', type: 'symbol', source: 'energy', 'source-layer': 'substations', minzoom: 11,
            layout: { 'icon-image': ['step', ['zoom'], 'dot-substation', 13, ['case', ['==', ['get', 'power'], 'converter'], 'icon-interconnector', 'icon-substation']], 'icon-allow-overlap': true, 'icon-size': 0.8 } });
        add({ id: 'osm-gas-sites', type: 'symbol', source: 'energy', 'source-layer': 'gas', minzoom: 9, filter: ['!=', ['geometry-type'], 'LineString'], layout: { 'icon-image': 'icon-compressor', 'icon-allow-overlap': true, 'icon-size': 0.7 } });
        const plantIcon = ['match', SRC('plant:source'),
            'nuclear', 'nuclear', 'wind', 'wind_onshore', 'solar', 'solar', 'gas', 'gas', 'oil', 'gas', 'diesel', 'gas', 'coal', 'coal',
            'biomass', 'biomass', 'biogas', 'biomass', 'waste', 'biomass', 'hydro', 'hydro', 'battery', 'storage', 'tidal', 'hydro', 'gas'];
        add({ id: 'osm-plants-icon', type: 'symbol', source: 'energy', 'source-layer': 'plants',
            layout: { 'icon-image': ['step', ['zoom'], ['concat', 'dot-', plantIcon], 9, ['concat', 'icon-', plantIcon]], 'icon-allow-overlap': ['step', ['zoom'], false, 9, true], 'icon-size': ['interpolate', ['linear'], ['zoom'], 5, 0.7, 12, 1] } });

        const tilePopup = (e: any) => {
            const f = e.features?.[0];
            if (!f) return;
            const p = f.properties || {};
            const layer = f.layer.id;
            let title = p.name || '';
            let rows: [string, any][] = [];
            let extra = '';
            if (layer.startsWith('osm-plants')) {
                title = title || `${p['plant:source'] || ''} power station`;
                rows = [['Fuel / source', p['plant:source']], ['Capacity', p['plant:output:electricity']], ['Operator', p.operator], ['Opened', p.start_date], ['Method', p['plant:method']]];
                const t = tecForStation(connRef.current, p.name);
                if (!t) { const mw = parseFloat(String(p['plant:output:electricity'] || '').replace(/[^0-9.]/g, '')) * (/kw/i.test(String(p['plant:output:electricity'])) ? 0.001 : /gw/i.test(String(p['plant:output:electricity'])) ? 1000 : 1); extra = inferredHtml(e.lngLat.lng, e.lngLat.lat, isFinite(mw) && mw > 0 ? mw : 5); }
                if (t) extra = `<div style="margin-top:6px;border-top:1px solid #334155;padding-top:6px;font-size:11px"><div>Grid connection: <b>${esc(t.site)}</b></div><div style="color:#94a3b8">${esc(t.plantType)} · ${mwFmt(t.mwConnected || t.mwTotal)} · ${esc(t.status)}${t.hostTO ? ` · ${esc(t.hostTO)}` : ''}</div><div style="color:#64748b;font-size:9px;margin-top:2px">Source: NESO ${t.register === 'T' ? 'TEC' : 'Embedded'} Register, project "${esc(t.project)}" (matched by name)</div></div>`;
            } else if (layer.startsWith('osm-substations')) {
                title = title || (p.power === 'converter' ? 'HVDC converter station' : 'Substation');
                rows = [['Type', p.substation || p.power], ['Voltage', fmtVoltage(p.voltage)], ['Operator', p.operator], ['Reference', p.ref]];
                const n = highlightConnected(e.lngLat);
                extra = `<div style="font-size:11px;margin-top:4px;color:#e2e8f0">${n ? `${n} connected line section${n === 1 ? '' : 's'} highlighted` : 'Zoom in further to see connecting lines'}</div>` + connectionsHtml(connRef.current, p.name);
                drawFeeders(p.name, e.lngLat);
            } else if (layer.startsWith('osm-generators')) {
                title = title || `${p['generator:source'] || ''} generator`;
                rows = [['Source', p['generator:source']], ['Type', p['generator:type'] || p['generator:method']], ['Output', p['generator:output:electricity']], ['Operator', p.operator]];
                const out = String(p['generator:output:electricity'] || '');
                const mw = parseFloat(out.replace(/[^0-9.]/g, '')) * (/kw/i.test(out) ? 0.001 : /gw/i.test(out) ? 1000 : 1);
                if (isFinite(mw) && mw >= 1) extra = inferredHtml(e.lngLat.lng, e.lngLat.lat, mw);
            } else if (layer === 'osm-lines' || layer === 'osm-cables') {
                title = title || (p.power === 'cable' ? 'Power cable' : p.power === 'minor_line' ? 'Distribution line' : 'Power line');
                rows = [['Voltage', fmtVoltage(p.voltage)], ['Circuits', p.circuits], ['Operator', p.operator], ['Reference', p.ref], ['Location', p.location]];
            } else if (layer.startsWith('osm-gas')) {
                title = title || (p.man_made === 'pipeline' ? 'Gas pipeline' : 'Gas site');
                rows = [['Substance', p.substance], ['Operator', p.operator], ['Pressure', p.pressure], ['Diameter', p.diameter], ['Location', p.location]];
            } else if (layer === 'osm-demand') {
                title = title || 'Data centre';
                rows = [['Operator', p.operator]];
            }
            showPopup(e.lngLat, popupHtml(title, rows, 'Source: OpenStreetMap (volunteer-mapped; may be incomplete)').replace('</div></div>', `${extra}</div></div>`));
        };
        OSM_LAYERS.forEach(l => map.on('click', l, (e: any) => {
            if (e.originalEvent.__erHandled) return;
            e.originalEvent.__erHandled = true;
            tilePopup(e);
        }));
    };

    // ---------- Create the map ----------
    useEffect(() => {
        if (!containerRef.current || mapRef.current) return;
        const map = new maplibregl.Map({
            container: containerRef.current,
            attributionControl: false,
            style: {
                version: 8,
                sources: {
                    base: { type: 'raster', tiles: [ESRI_BASE], tileSize: 256, maxzoom: 16, attribution: ATTRIBUTION },
                    labels: { type: 'raster', tiles: [ESRI_LABELS], tileSize: 256, maxzoom: 16 },
                },
                layers: [
                    { id: 'bg', type: 'background', paint: { 'background-color': '#0b1120' } },
                    { id: 'base', type: 'raster', source: 'base', paint: { 'raster-brightness-max': 0.55, 'raster-contrast': 0.1 } },
                ],
            },
            center: [region.lng, region.lat],
            zoom: region.zoom,
            maxZoom: 18,
            preserveDrawingBuffer: true, // lets the report builder capture a map snapshot
            dragRotate: false,
            pitchWithRotate: false,
        });
        map.touchZoomRotate.disableRotation();
        map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
        mapRef.current = map;
        (window as any).__energyMap = map; // handy for debugging in the browser console
        if (region.id === 'UK') map.fitBounds(UK_BOUNDS, { padding: ukPadding(), duration: 0 });

        map.on('error', (e: any) => { console.warn('Map:', e?.error?.message || e); if (String(e?.error?.message || e?.error?.url || '').includes('arcgisonline')) markFail('basemap', 'tiles failed'); });
        map.on('sourcedata', (e: any) => { if (e.sourceId === 'base' && e.isSourceLoaded) markOk('basemap'); });

        map.on('load', async () => {
            // Icon images for every asset type: small shape (dot-*), full symbol (icon-*), and affected (hit-*)
            const types = Array.from(new Set([...Object.keys(ASSET_ICON), ...Object.values(SOURCE_TYPE)]));
            await Promise.all(types.flatMap(t => [
                loadSvg(iconSvg(t, colourFor(t), 60), 60).then(img => { if (!map.hasImage(`icon-${t}`)) map.addImage(`icon-${t}`, img, { pixelRatio: 2 }); }),
                loadSvg(dotSvg(t, colourFor(t), 24), 24).then(img => { if (!map.hasImage(`dot-${t}`)) map.addImage(`dot-${t}`, img, { pixelRatio: 2 }); }),
                loadSvg(iconSvg(t, colourFor(t), 60, '#ef4444'), 60).then(img => { if (!map.hasImage(`hit-${t}`)) map.addImage(`hit-${t}`, img, { pixelRatio: 2 }); }),
            ].map(p => p.catch(() => {}))));

            map.addSource('dno', { type: 'geojson', data: emptyFC as any });
            map.addLayer({ id: 'dno-fill', type: 'fill', source: 'dno', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.1 } });
            map.addLayer({ id: 'dno-line', type: 'line', source: 'dno', paint: { 'line-color': ['get', 'color'], 'line-width': 1.4, 'line-opacity': 0.8 } });

            // Data coverage: hatched where no open live power-cut feed exists
            const hatch = document.createElement('canvas'); hatch.width = hatch.height = 16;
            const hx = hatch.getContext('2d');
            if (hx) { hx.strokeStyle = 'rgba(251,191,36,0.55)'; hx.lineWidth = 2; hx.beginPath(); hx.moveTo(0, 16); hx.lineTo(16, 0); hx.moveTo(-4, 4); hx.lineTo(4, -4); hx.moveTo(12, 20); hx.lineTo(20, 12); hx.stroke();
                const img = hx.getImageData(0, 0, 16, 16); if (!map.hasImage('hatch')) map.addImage('hatch', { width: 16, height: 16, data: new Uint8Array(img.data.buffer) }); }
            map.addSource('coverage', { type: 'geojson', data: emptyFC as any });
            map.addLayer({ id: 'coverage-hatch', type: 'fill', source: 'coverage', paint: { 'fill-pattern': 'hatch', 'fill-opacity': 0.8 } });
            map.addLayer({ id: 'coverage-line', type: 'line', source: 'coverage', paint: { 'line-color': '#fbbf24', 'line-width': 1.2, 'line-dasharray': [2, 2], 'line-opacity': 0.8 } });

            // Fallback impact circles (only when no area boundaries are available)
            map.addSource('impact', { type: 'geojson', data: emptyFC as any });
            map.addLayer({ id: 'impact-fill', type: 'fill', source: 'impact', paint: { 'fill-color': '#ef4444', 'fill-opacity': ['get', 'opacity'] } });
            // Scenario footprint on Grid Supply Point areas: red haze, then lights out.
            // State per area (feature-state 's'): 1 = in footprint (faint red haze), 2 = red haze (about to go dark / just restored), 3 = lights out
            map.addSource('impact-areas', { type: 'geojson', data: emptyFC as any, promoteId: 'id' });
            const S: any = ['coalesce', ['feature-state', 's'], 0];
            const COL: any = ['coalesce', ['feature-state', 'col'], '#ef4444'];
            map.addLayer({ id: 'impact-areas-fill', type: 'fill', source: 'impact-areas', paint: {
                'fill-color': ['case', ['==', S, 3], '#020409', COL],
                'fill-opacity': ['match', S, 3, 0.84, 2, 0.5, 1, 0.13, 0],
                'fill-color-transition': { duration: 600 }, 'fill-opacity-transition': { duration: 600 } } as any });
            map.addLayer({ id: 'impact-areas-line', type: 'line', source: 'impact-areas', paint: {
                'line-color': COL, 'line-width': ['match', S, 3, 1.1, 2, 1.4, 0.6],
                'line-opacity': ['match', S, 3, 0.75, 2, 0.95, 1, 0.35, 0] } as any });

            map.addSource('asset-lines', { type: 'geojson', data: emptyFC as any });
            map.addLayer({ id: 'asset-lines', type: 'line', source: 'asset-lines', filter: ['!', ['to-boolean', ['get', 'dashed']]], paint: { 'line-color': ['get', 'color'], 'line-width': ['case', ['to-boolean', ['get', 'affected']], 4, 2], 'line-opacity': 0.75 } });
            map.addLayer({ id: 'asset-lines-dashed', type: 'line', source: 'asset-lines', filter: ['to-boolean', ['get', 'dashed']], paint: { 'line-color': ['get', 'color'], 'line-width': ['case', ['to-boolean', ['get', 'affected']], 4, 2], 'line-opacity': 0.75, 'line-dasharray': [3, 2] } });

            // National view: interconnectors, subsea / offshore cables and gas pipelines from the snapshot,
            // so links out to sea and to other countries show at low zoom (the tiles take over from zoom 7).
            map.addSource('national-links', { type: 'geojson', data: emptyFC as any });
            map.addLayer({ id: 'national-links', type: 'line', source: 'national-links', maxzoom: 7, filter: ['!', ['to-boolean', ['get', 'dashed']]], paint: { 'line-color': ['get', 'color'], 'line-width': 1.6, 'line-opacity': 0.8 } });
            map.addLayer({ id: 'national-links-dashed', type: 'line', source: 'national-links', maxzoom: 7, filter: ['to-boolean', ['get', 'dashed']], paint: { 'line-color': ['get', 'color'], 'line-width': 1.6, 'line-opacity': 0.85, 'line-dasharray': [3, 2] } });

            map.addSource('highlight', { type: 'geojson', data: emptyFC as any });
            map.addLayer({ id: 'highlight', type: 'line', source: 'highlight', paint: { 'line-color': '#ffffff', 'line-width': 5, 'line-opacity': 0.55, 'line-blur': 1 } });

            // Connection registers: DNO-connected generators / batteries (1 MW+) and the lines to their substations
            map.addSource('conn-lines', { type: 'geojson', data: emptyFC as any });
            map.addLayer({ id: 'conn-lines', type: 'line', source: 'conn-lines', paint: { 'line-color': ['get', 'color'], 'line-width': 1.5, 'line-opacity': ['case', ['to-boolean', ['get', 'connected']], 0.85, 0.45], 'line-dasharray': [2, 2] } });
            // Energy flows into / out of GB: a faint route plus dashes that move in the direction of flow
            map.addSource('energy-flows', { type: 'geojson', data: emptyFC as any });
            const FLOW_WIDTH: any = ['interpolate', ['linear'], ['get', 'agw'], 0, 1, 0.5, 2, 2, 3.5, 10, 6.5, 40, 12];
            map.addLayer({ id: 'energy-flows-base', type: 'line', source: 'energy-flows', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': FLOW_WIDTH, 'line-opacity': ['case', ['>', ['get', 'agw'], 0.01], 0.28, 0.12] } });
            map.addLayer({ id: 'energy-flows-dash', type: 'line', source: 'energy-flows', filter: ['all', ['>', ['get', 'agw'], 0.01], ['!', ['to-boolean', ['get', 'cut']]]], layout: { 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': FLOW_WIDTH, 'line-opacity': 0.95, 'line-dasharray': [0, 4, 3] } });
            map.addLayer({ id: 'energy-flows-cut', type: 'line', source: 'energy-flows', filter: ['to-boolean', ['get', 'cut']], layout: { 'line-cap': 'butt' }, paint: { 'line-color': '#ef4444', 'line-width': 3, 'line-opacity': 0.95, 'line-dasharray': [1, 1.2] } });
            map.on('click', 'energy-flows-base', (e: any) => {
                if (e.originalEvent.__erHandled) return;
                e.originalEvent.__erHandled = true;
                const l = flowsRef.current.find(f => f.id === e.features?.[0]?.properties?.id);
                if (l) showPopup(e.lngLat, flowPopup(l));
            });

            // Renewable Energy Planning Database sites not already in a DNO register (fills NGED, ENWL, SSEN areas)
            map.addSource('repd', { type: 'geojson', data: emptyFC as any });
            map.addLayer({ id: 'repd', type: 'circle', source: 'repd', minzoom: 7,
                paint: {
                    'circle-radius': ['interpolate', ['linear'], ['zoom'], 7, ['interpolate', ['linear'], ['get', 'mw'], 1, 1.5, 50, 3.5, 300, 6], 13, ['interpolate', ['linear'], ['get', 'mw'], 1, 4, 50, 8, 300, 12]],
                    'circle-color': ['case', ['==', ['get', 'status'], 'O'], ['get', 'color'], 'rgba(0,0,0,0)'],
                    'circle-opacity': 0.55,
                    'circle-stroke-color': '#e2e8f0', 'circle-stroke-width': ['case', ['==', ['get', 'status'], 'O'], 0.8, 1.2], 'circle-stroke-opacity': 0.7,
                } });
            map.on('click', 'repd', (e: any) => {
                if (e.originalEvent.__erHandled) return;
                e.originalEvent.__erHandled = true;
                repdPopup(e);
            });

            map.addSource('ecr', { type: 'geojson', data: emptyFC as any });
            map.addLayer({ id: 'ecr', type: 'circle', source: 'ecr', minzoom: 7,
                paint: {
                    'circle-radius': ['interpolate', ['linear'], ['zoom'], 7, ['interpolate', ['linear'], ['get', 'mw'], 1, 1.5, 50, 3.5, 300, 6], 13, ['interpolate', ['linear'], ['get', 'mw'], 1, 4, 50, 8, 300, 12]],
                    'circle-color': ['case', ['to-boolean', ['get', 'connected']], ['get', 'color'], 'rgba(0,0,0,0)'],
                    'circle-stroke-color': ['get', 'color'], 'circle-stroke-width': ['case', ['to-boolean', ['get', 'connected']], 0.6, 1.4],
                    'circle-opacity': 0.8,
                } });
            loadConnections().then(data => {
                connRef.current = data;
                if (!data) return;
                (map.getSource('repd') as maplibregl.GeoJSONSource)?.setData({ type: 'FeatureCollection', features: data.repd.map(s => ({
                    type: 'Feature', geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
                    properties: { ...s, color: FUEL_COLOUR[s.fuel] || '#94a3b8' },
                })) } as any);
                (map.getSource('ecr') as maplibregl.GeoJSONSource)?.setData({ type: 'FeatureCollection', features: data.ecr.map(s => ({
                    type: 'Feature', geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
                    properties: { ...s, color: FUEL_COLOUR[s.fuel] || '#94a3b8' },
                })) } as any);
            });
            map.on('click', 'ecr', (e: any) => {
                if (e.originalEvent.__erHandled) return;
                e.originalEvent.__erHandled = true;
                ecrPopup(e);
            });

            map.addSource('assets', { type: 'geojson', data: emptyFC as any });
            map.addLayer({
                id: 'assets', type: 'symbol', source: 'assets',
                layout: {
                    // zoom must be the top-level step: small shapes below zoom 10, full symbols above; red-ringed if affected
                    'icon-image': ['step', ['zoom'],
                        ['case', ['to-boolean', ['get', 'affected']], ['concat', 'hit-', ['get', 'typeId']], ['concat', 'dot-', ['get', 'typeId']]], 10,
                        ['case', ['to-boolean', ['get', 'affected']], ['concat', 'hit-', ['get', 'typeId']], ['concat', 'icon-', ['get', 'typeId']]]],
                    'icon-allow-overlap': true,
                    'symbol-sort-key': ['case', ['to-boolean', ['get', 'affected']], 1, 0],
                },
            });

            // Place labels (raster) above everything except our markers
            map.addLayer({ id: 'labels', type: 'raster', source: 'labels', paint: { 'raster-opacity': 0.7 } });

            // Vector tiles of all OSM energy infrastructure, if built
            try {
                const head = await fetch(TILES_URL, { method: 'HEAD' });
                const isTiles = head.ok && !(head.headers.get('content-type') || '').includes('text/html');
                if (isTiles) { addEnergyTiles(map); setTilesAvailable(true); markOk('tiles'); }
                else markFail('tiles', 'not built yet');
            } catch { markFail('tiles', 'not built yet'); }

            // Network operators' own 33 kV+ line data (open-licence datasets only), built weekly; fills gaps in OpenStreetMap
            try {
                const head = await fetch(DNO_LINES_URL, { method: 'HEAD' });
                if (head.ok && !(head.headers.get('content-type') || '').includes('text/html')) {
                    map.addSource('dnolines', { type: 'vector', url: `pmtiles://${DNO_LINES_URL}` });
                    const KV: any = ['to-number', ['get', 'kv'], 0];
                    const colour: any = ['step', KV, '#16a34a', 100, '#0ea5e9'];
                    const before = map.getLayer('labels') ? 'labels' : undefined;
                    map.addLayer({ id: 'dno-lines-oh', type: 'line', source: 'dnolines', 'source-layer': 'dno_lines', minzoom: 8, filter: ['!', ['to-boolean', ['get', 'ug']]], paint: { 'line-color': colour, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.6, 14, 2], 'line-opacity': 0.55 } }, before);
                    map.addLayer({ id: 'dno-lines-ug', type: 'line', source: 'dnolines', 'source-layer': 'dno_lines', minzoom: 9, filter: ['to-boolean', ['get', 'ug']], paint: { 'line-color': colour, 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.5, 14, 1.6], 'line-opacity': 0.5, 'line-dasharray': [2, 1.5] } }, before);
                    ['dno-lines-oh', 'dno-lines-ug'].forEach(l => map.on('click', l, (e: any) => {
                        if (e.originalEvent.__erHandled) return;
                        e.originalEvent.__erHandled = true;
                        const p: any = e.features?.[0]?.properties || {};
                        showPopup(e.lngLat, `<div style="padding:10px 12px;max-width:260px"><b>${p.kv ? `${esc(p.kv)} kV ` : ''}${p.ug ? 'underground cable' : 'overhead line'}</b><div style="font-size:11px;color:#94a3b8;margin-top:3px">From ${esc(p.op)}'s open data (network operator records), used where OpenStreetMap may be incomplete. Route shown as published; may be simplified.</div></div>`);
                    }));
                    markOk('dnolines');
                    setDnoLinesOn(true);
                } else markFail('dnolines', 'not built yet');
            } catch { markFail('dnolines', 'not built yet'); }

            // Clicks on our own layers
            const selectAsset = (e: any) => {
                if (e.originalEvent.__erHandled) return;
                e.originalEvent.__erHandled = true;
                const id = e.features?.[0]?.properties?.id;
                const asset = propsRef.current.assets.find(a => a.id === id);
                if (asset) propsRef.current.onAssetSelect(asset);
            };
            ['assets', 'asset-lines', 'asset-lines-dashed'].forEach(l => map.on('click', l, selectAsset));
            map.on('click', (e: any) => {
                if (propsRef.current.placing && propsRef.current.onPlace) {
                    e.originalEvent.__erHandled = true;
                    const { lng, lat } = e.lngLat;
                    // Name it after the nearest substation we know of (within 25 km), otherwise by coordinates
                    let best: { name: string; d: number } | null = null;
                    const subs = map.getLayer('osm-substations-fill') ? map.queryRenderedFeatures([[e.point.x - 40, e.point.y - 40], [e.point.x + 40, e.point.y + 40]], { layers: ['osm-substations-fill', 'osm-substations-icon'].filter(l => map.getLayer(l)) }) : [];
                    subs.forEach((f: any) => { const n = f.properties?.name; if (n && !best) best = { name: n, d: 0 }; });
                    if (!best) propsRef.current.assets.forEach(a => {
                        if (!/substation/.test(a.typeId) || !a.name) return;
                        const d = Math.hypot((a.lng - lng) * 111 * Math.cos(lat * Math.PI / 180), (a.lat - lat) * 111);
                        if (d < 25 && (!best || d < best.d)) best = { name: a.name, d };
                    });
                    const b = best as { name: string; d: number } | null;
                    propsRef.current.onPlace({ lat, lng, label: b ? `near ${b.name}` : `at ${lat.toFixed(2)}, ${lng.toFixed(2)}` });
                    return;
                }
                if (e.originalEvent.__erHandled) return;
                (map.getSource('highlight') as maplibregl.GeoJSONSource)?.setData(emptyFC as any);
                (map.getSource('conn-lines') as maplibregl.GeoJSONSource)?.setData(emptyFC as any);
                const dno = map.queryRenderedFeatures(e.point, { layers: ['dno-fill'] })[0];
                if (!dno || map.getLayoutProperty('dno-fill', 'visibility') === 'none') return;
                const p: any = dno.properties || {};
                const ci = propsRef.current.regionalCarbon[p.name];
                const ciHtml = ci ? `<div style="margin-top:6px;border-top:1px solid #334155;padding-top:6px"><div>Carbon intensity: <b>${ci.intensity} gCO2/kWh</b> (${esc(ci.index)})</div><div style="color:#94a3b8;font-size:11px">Local mix: ${ci.mix.slice(0, 4).map(m => `${esc(m.fuel)} ${m.perc}%`).join(', ')}</div><div style="color:#64748b;font-size:9px;margin-top:2px">Source: NESO Carbon Intensity API (live forecast)</div></div>` : '';
                const noFeed = /north west/i.test(String(p.name)) ? `<div style="margin-top:6px;border-top:1px solid #334155;padding-top:6px;font-size:11px;color:#fbbf24">No open live power-cut feed for this area: Electricity North West publishes it under a restricted licence. Check <a href="https://www.enwl.co.uk" target="_blank" rel="noopener" style="color:#67e8f9">enwl.co.uk</a> or call 105.</div>` : '';
                showPopup(e.lngLat, `<div style="padding:10px 12px;min-width:220px"><b>${esc(p.name)}</b><br><span style="color:#94a3b8">${esc(p.operator)}</span>${ciHtml}${noFeed}</div>`);
            });
            ['assets', 'asset-lines', 'asset-lines-dashed', 'ecr', 'repd', 'energy-flows-base', ...OSM_LAYERS].forEach(l => {
                if (!map.getLayer(l)) return;
                map.on('mouseenter', l, () => { map.getCanvas().style.cursor = 'pointer'; });
                map.on('mouseleave', l, () => { map.getCanvas().style.cursor = ''; });
            });

            setReady(true);
        });

        map.on('moveend', () => {
            const c = map.getCenter();
            propsRef.current.onViewChange?.({ lat: c.lat, lng: c.lng, zoom: map.getZoom() });
        });

        const ro = new ResizeObserver(() => map.resize());
        ro.observe(containerRef.current);
        return () => { ro.disconnect(); map.remove(); mapRef.current = null; };
    }, []);

    // ---------- Layer visibility from the filter panel ----------
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !ready) return;
        const vis = (layer: string, on: boolean) => { if (map.getLayer(layer)) map.setLayoutProperty(layer, 'visibility', on ? 'visible' : 'none'); };
        const gen = filters.has('Generation'), tx = filters.has('Transmission'), dx = filters.has('Distribution');
        ['osm-plants-fill', 'osm-plants-icon', 'osm-generators', 'osm-generators-fill', 'ecr', 'repd'].forEach(l => vis(l, gen));
        vis('osm-lines', tx || dx);
        if (map.getLayer('osm-lines')) {
            const parts: any[] = [];
            if (tx) parts.push(['>=', VOLT, 100000]);
            if (dx) parts.push(['<', VOLT, 100000]);
            map.setFilter('osm-lines', ['all', ['!=', ['get', 'power'], 'cable'], ['any', ...parts, false]]);
        }
        vis('osm-cables', filters.has('Interconnector') || tx);
        vis('osm-substations-fill', tx || dx);
        vis('osm-substations-icon', tx || dx);
        vis('osm-gas', tx);
        vis('national-links', tx || filters.has('Interconnector'));
        vis('national-links-dashed', tx || filters.has('Interconnector'));
        vis('osm-gas-sites', tx);
        vis('osm-demand', filters.has('Retail'));
        if (map.getLayer('dno-lines-oh')) { const f: any = ['all', ...(tx ? [] : [['<', ['to-number', ['get', 'kv'], 0], 100]]), ...(dx ? [] : [['>=', ['to-number', ['get', 'kv'], 0], 100]])]; ['dno-lines-oh', 'dno-lines-ug'].forEach(l => { vis(l, tx || dx); map.setFilter(l, ['all', l === 'dno-lines-ug' ? ['to-boolean', ['get', 'ug']] : ['!', ['to-boolean', ['get', 'ug']]], f]); }); }
        vis('dno-fill', filters.has('DNO Regions'));
        vis('dno-line', filters.has('DNO Regions'));
    }, [filters, ready, tilesAvailable, dnoLinesOn]);

    // ---------- Our assets (built-in, snapshot, local search) and scenario state ----------
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !ready) return;
        const affectedIds = new Set(day > 0 ? activeScenarios.flatMap(s => s.affectedAssets) : []);
        const timelineYear = isGrowthScenario ? (growthYear || 9999) : 9999;
        const points: any[] = [];
        const lines: any[] = [];
        const nationalLinks: any[] = [];
        assets.forEach(a => {
            if (typeof a.lat !== 'number' || typeof a.lng !== 'number' || isNaN(a.lat) || isNaN(a.lng)) return;
            const typeDef = ASSET_TYPES.find(t => t.id === a.typeId);
            if (!typeDef || !filters.has(typeDef.category)) return;
            if (isGrowthScenario && a.commissionYear && a.commissionYear > timelineYear) return;
            const affected = affectedIds.has(a.id);
            const tags = (a as any).rawTags || {};
            // When the vector tiles are available they already show the OSM snapshot assets - except that
            // national-scale links (subsea cables, interconnectors, pipelines) are kept for the zoomed-out view.
            if (tilesAvailable && a.id.startsWith('op_') && !affected) {
                const isLink = (a.path || a.endLat) && (a.typeId === 'interconnector' || a.typeId === 'pipeline_gas' || tags.location === 'underwater' || tags.power === 'cable');
                if (isLink) {
                    const path = a.path || [{ lat: a.lat, lng: a.lng }, { lat: a.endLat!, lng: a.endLng! }];
                    nationalLinks.push({ type: 'Feature', properties: { color: a.typeId === 'pipeline_gas' ? '#a8a29e' : (voltageColour(tags.voltage) || '#ec4899'), dashed: true }, geometry: { type: 'LineString', coordinates: path.map(p => [p.lng, p.lat]) } });
                }
                return;
            }
            if (a.path || (a.endLat && a.endLng)) {
                const path = a.path || [{ lat: a.lat, lng: a.lng }, { lat: a.endLat!, lng: a.endLng! }];
                const colour = affected ? '#ef4444' : (voltageColour(tags.voltage) || typeDef.color);
                const dashed = a.typeId === 'pipeline_gas' || tags.power === 'cable' || ['underground', 'underwater'].includes(tags.location) || a.typeId === 'interconnector';
                lines.push({ type: 'Feature', properties: { id: a.id, color: colour, dashed, affected }, geometry: { type: 'LineString', coordinates: path.map(p => [p.lng, p.lat]) } });
            } else {
                const typeId = ASSET_ICON[a.typeId] ? a.typeId : 'substation';
                points.push({ type: 'Feature', properties: { id: a.id, typeId, affected }, geometry: { type: 'Point', coordinates: [a.lng, a.lat] } });
            }
        });
        (map.getSource('assets') as maplibregl.GeoJSONSource)?.setData({ type: 'FeatureCollection', features: points } as any);
        (map.getSource('asset-lines') as maplibregl.GeoJSONSource)?.setData({ type: 'FeatureCollection', features: lines } as any);
        (map.getSource('national-links') as maplibregl.GeoJSONSource)?.setData({ type: 'FeatureCollection', features: nationalLinks } as any);
    }, [assets, filters, ready, tilesAvailable, day, activeScenarios, growthYear, isGrowthScenario]);

    // ---------- DNO areas ----------
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !ready) return;
        const features = (dnoRegions || []).map(d => ({
            type: 'Feature',
            properties: { name: d.name, operator: d.operator, color: d.color },
            geometry: d.polygons && d.polygons.length
                ? { type: 'MultiPolygon', coordinates: d.polygons.map(ring => [ring.map(([lat, lng]) => [lng, lat])]) }
                : { type: 'Polygon', coordinates: [d.path.map(p => [p.lng, p.lat])] },
        }));
        (map.getSource('dno') as maplibregl.GeoJSONSource)?.setData({ type: 'FeatureCollection', features } as any);
    }, [dnoRegions, ready]);

    // ---------- Data coverage (areas with no open live power-cut feed) ----------
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !ready) return;
        const gaps = (dnoRegions || []).filter(d => NO_FEED_RX.test(d.name) || d.id === 'nie_networks');
        const features = !showCoverage ? [] : gaps.map(d => ({
            type: 'Feature', properties: { name: d.name },
            geometry: d.polygons && d.polygons.length
                ? { type: 'MultiPolygon', coordinates: d.polygons.map(ring => [ring.map(([lat, lng]) => [lng, lat])]) }
                : { type: 'Polygon', coordinates: [d.path.map(p => [p.lng, p.lat])] },
        }));
        (map.getSource('coverage') as maplibregl.GeoJSONSource)?.setData({ type: 'FeatureCollection', features } as any);
        setMarkers('coverage', !showCoverage ? [] : gaps.map(d => {
            const pts = d.polygons && d.polygons.length ? d.polygons.reduce((x, y) => (y.length > x.length ? y : x)).map(([lat, lng]) => [lng, lat]) : d.path.map(p => [p.lng, p.lat]);
            const at: [number, number] = [pts.reduce((t, q) => t + q[0], 0) / pts.length, pts.reduce((t, q) => t + q[1], 0) / pts.length];
            return {
                lngLat: at, z: 1,
                html: `<div style="white-space:nowrap;background:rgba(15,23,42,0.85);border:1px dashed #fbbf24;color:#fde68a;font:600 10px/1.3 system-ui,sans-serif;padding:2px 6px;border-radius:4px">No live power-cut data</div>`,
                popup: `<div style="padding:10px 12px;max-width:260px"><b>${esc(d.name)}</b><div style="font-size:11px;margin-top:4px;color:#fde68a">No open live power-cut feed is connected for this area, so power cuts here will not appear on the map.</div><div style="font-size:11px;margin-top:4px;color:#94a3b8">${NO_FEED_RX.test(d.name) ? 'Electricity North West publishes its feed under a restricted ("Shared") licence, which this app does not use.' : 'NIE Networks has no open live feed connected.'} Check the operator's website or call 105.</div></div>`,
            };
        }));
    }, [dnoRegions, showCoverage, ready]);

    // ---------- Scenario footprints: areas (GSP areas, or network-operator areas as a fallback) ----------
    useEffect(() => {
        let gone = false;
        loadGspUnits().then(gsp => {
            if (gone) return;
            if (gsp.length) { setUnits({ list: gsp, source: 'gsp' }); markOk('gsp', `${gsp.length} areas`); }
            else {
                markFail('gsp', 'not built yet');
                const dno = unitsFromDno(dnoRegions || []);
                setUnits({ list: dno, source: dno.length ? 'dno' : 'none' });
            }
        });
        return () => { gone = true; };
    }, [dnoRegions]);

    // Which areas each running scenario affects (recomputed when the scenarios change)
    const scenarioKey = activeScenarios.map(s => `${s.id}|${s.footprint?.placedAt || ''}`).join(',');
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !ready) return;
        darkenTimers.current.forEach(t => clearTimeout(t)); darkenTimers.current.clear();
        const src = map.getSource('impact-areas') as maplibregl.GeoJSONSource;
        const prev = unitStateRef.current;
        prev.forEach((_, id) => map.removeFeatureState({ source: 'impact-areas', id }));
        unitStateRef.current = new Map();
        resolvedRef.current = isGrowthScenario ? [] : activeScenarios.map(s => resolveFootprint(s, units.list));
        const seen = new Set<string>();
        const feats: any[] = [];
        resolvedRef.current.forEach(r => r.units.forEach(u => {
            if (seen.has(u.id)) return; seen.add(u.id);
            feats.push({ type: 'Feature', id: u.id, properties: { id: u.id, area: u.area }, geometry: { type: 'MultiPolygon', coordinates: u.rings.map(ring => [ring]) } });
        }));
        src?.setData({ type: 'FeatureCollection', features: feats } as any);
        onFootprint?.({ units: seen.size, source: units.source });
        // Camera: fit to the footprint
        if (feats.length && activeScenarios.length) {
            const nat = activeScenarios.some(s => { const a = footprintOf(s).areas; return a === 'national' || a === 'placeable'; });
            if (nat) map.fitBounds(UK_BOUNDS, { padding: ukPadding(), duration: 1200 });
            else {
                let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
                resolvedRef.current.forEach(r => r.units.forEach(u => u.rings.forEach(ring => ring.forEach(([x, y]) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }))));
                if (x1 > x0) map.fitBounds([[x0, y0], [x1, y1]], { padding: ukPadding(), maxZoom: 8, duration: 1200 });
            }
        }
    }, [scenarioKey, units, ready, isGrowthScenario]);

    // State of each area at the current moment: newly affected areas glow red first, then go dark
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !ready || !map.getSource('impact-areas')) return;
        const multi = activeScenarios.length > 1;
        const next = activeScenarios.length ? unitStates(resolvedRef.current, stepHours) : new Map();
        const before = unitStateRef.current;
        const set = (id: string, st: number, col: string) => { try { map.setFeatureState({ source: 'impact-areas', id }, { s: st, col }); } catch { /* not loaded yet */ } };
        const after = new Map<string, number>();
        resolvedRef.current.forEach((r, si) => r.units.forEach(u => { if (!after.has(u.id)) after.set(u.id, 1); }));
        next.forEach((v, id) => after.set(id, v.state === 'off' ? 3 : v.state === 'edge' ? 2 : 1));
        after.forEach((st, id) => {
            const si = next.get(id)?.scenario ?? 0;
            const col = multi ? SCENARIO_COLOURS[si % SCENARIO_COLOURS.length] : '#ef4444';
            const was = before.get(id) || 0;
            if (st === 3 && was < 3) {
                // red haze before the lights go out
                set(id, 2, col);
                if (!darkenTimers.current.has(id)) darkenTimers.current.set(id, setTimeout(() => { darkenTimers.current.delete(id); if (unitStateRef.current.get(id) === 3) set(id, 3, col); }, 650));
            } else {
                if (st < 3 && darkenTimers.current.has(id)) { clearTimeout(darkenTimers.current.get(id)); darkenTimers.current.delete(id); }
                set(id, st, col);
            }
        });
        unitStateRef.current = after;
    }, [stepHours, scenarioKey, units, ready]);
    useEffect(() => () => { darkenTimers.current.forEach(t => clearTimeout(t)); }, []);

    // Fallback circles if no area boundaries are available at all
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !ready) return;
        const src = map.getSource('impact') as maplibregl.GeoJSONSource;
        const hasAreas = resolvedRef.current.some(r => r.units.length);
        if (hasAreas || isScenarioComplete || activeScenarios.length === 0 || isGrowthScenario || !(currentImpact > 0)) { src?.setData(emptyFC as any); return; }
        const centre = region.id === 'UK' ? { lat: 52.4862, lng: -1.8904 } : { lat: region.lat, lng: region.lng };
        const sc = activeScenarios[0];
        const t = activeScenarios.length === 1 && sc.coordinates?.lat ? { ...sc.coordinates, radius: Math.sqrt(currentImpact) * 40 } : { ...centre, radius: Math.sqrt(currentImpact) * 100 };
        const opacity = 0.15 + (peakImpact > 0 ? currentImpact / peakImpact : 0) * 0.25;
        src?.setData({ type: 'FeatureCollection', features: [{ ...circlePolygon(t.lat, t.lng, t.radius), properties: { opacity } }] } as any);
    }, [currentImpact, peakImpact, activeScenarios, isScenarioComplete, isGrowthScenario, region, ready, units]);

    // Common-mode scenarios: highlight the affected fleet (e.g. all gas plants)
    useEffect(() => {
        if (!ready) return;
        if (!fleet.length || !activeScenarios.length) { setMarkers('fleet', []); return; }
        const want = new Set(fleet);
        const list = assets.filter(a => want.has(a.typeId) && typeof a.lat === 'number' && (a.capacityMW || 0) >= 50)
            .sort((x, y) => (y.capacityMW || 0) - (x.capacityMW || 0)).slice(0, 150);
        setMarkers('fleet', list.map(a => ({
            lngLat: [a.lng, a.lat] as [number, number], z: 3,
            html: `<div class="fleet-pulse" style="width:${Math.max(10, Math.min(26, 6 + Math.sqrt(a.capacityMW || 0) / 3))}px;height:${Math.max(10, Math.min(26, 6 + Math.sqrt(a.capacityMW || 0) / 3))}px"></div>`,
            popup: `<div style="padding:10px 12px;max-width:240px"><b>${esc(a.name)}</b><div style="font-size:11px;color:#fca5a5;margin-top:3px">In the fleet affected by this scenario (${esc(a.typeId)}). Illustrative: the scenario does not say which plants are affected.</div><div style="font-size:11px;color:#94a3b8">${a.capacityMW ? `${Math.round(a.capacityMW)} MW` : ''}</div></div>`,
        })));
    }, [fleet.join(','), activeScenarios.length, assets, ready]);

    // Placement mode cursor
    useEffect(() => {
        const map = mapRef.current;
        if (map) map.getCanvas().style.cursor = placing ? 'crosshair' : '';
    }, [placing]);

    // ---------- Weather radar ----------
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !ready) return;
        const on = filters.has('Weather Radar');
        if (!on) { if (map.getLayer('radar')) map.setLayoutProperty('radar', 'visibility', 'none'); return; }
        if (map.getLayer('radar')) { map.setLayoutProperty('radar', 'visibility', 'visible'); return; }
        fetch('https://api.rainviewer.com/public/weather-maps.json').then(r => r.json()).then(data => {
            const last = data.radar?.past?.[data.radar.past.length - 1];
            if (!last || map.getLayer('radar')) return;
            const host = data.host || 'https://tilecache.rainviewer.com';
            map.addSource('radar', { type: 'raster', tiles: [`${host}${last.path}/256/{z}/{x}/{y}/2/1_1.png`], tileSize: 256, maxzoom: 7 });
            map.addLayer({ id: 'radar', type: 'raster', source: 'radar', paint: { 'raster-opacity': 0.6 } }, 'dno-fill');
            markOk('radar');
        }).catch(() => markFail('radar', 'unavailable'));
    }, [filters, ready]);

    // ---------- HTML markers for live layers ----------
    const setMarkers = (group: string, items: { lngLat: [number, number], html: string, popup?: string, z?: number, anchor?: maplibregl.PositionAnchor }[]) => {
        const map = mapRef.current;
        (markersRef.current[group] || []).forEach(m => m.remove());
        markersRef.current[group] = [];
        if (!map) return;
        markersRef.current[group] = items.map(it => {
            const el = document.createElement('div');
            el.innerHTML = it.html;
            el.style.cursor = 'pointer';
            if (it.z) el.style.zIndex = String(it.z);
            const m = new maplibregl.Marker({ element: el, anchor: it.anchor || 'center' }).setLngLat(it.lngLat).addTo(map);
            el.addEventListener('click', ev => {
                // In "Place it" mode a click on a marker still places the scenario where you clicked
                if (propsRef.current.placing) {
                    ev.stopPropagation();
                    const r = map.getCanvas().getBoundingClientRect();
                    const point = new maplibregl.Point(ev.clientX - r.left, ev.clientY - r.top);
                    map.fire('click', { lngLat: map.unproject(point), point, originalEvent: ev });
                    return;
                }
                if (it.popup) { ev.stopPropagation(); showPopup(it.lngLat, it.popup!); }
            });
            return m;
        });
    };

    // Power cuts
    useEffect(() => {
        if (!ready) return;
        const all = [...outages, ...(historicalOutages || [])].filter(o => typeof o.lat === 'number' && typeof o.lng === 'number' && !isNaN(o.lat));
        setMarkers('outages', all.map(o => {
            const planned = /^planned/i.test(String(o.description || ''));
            return {
                lngLat: [o.lng, o.lat] as [number, number],
                z: planned ? 3 : 4,
                html: planned ? `<div style="opacity:0.7">${powerCutSvg(15)}</div>` : `<div class="powercut-pulse">${powerCutSvg(22)}</div>`,
                popup: `<div style="min-width:200px;padding:10px 12px"><div style="font-weight:bold;margin-bottom:4px;color:#f87171">&#9888; ${esc(o.locationName)}</div><div style="font-size:12px">${esc(o.description)}</div><div style="font-size:12px;font-weight:bold;margin-top:4px">Customers affected: ${o.consumersAffected ? Number(o.consumersAffected).toLocaleString() : 'not published'}</div><div style="font-size:10px;color:#94a3b8">Status: ${esc(o.status)}</div><div style="font-size:10px;color:#94a3b8">Source: ${esc(o.source)}</div>${o.estRestoration && o.estRestoration !== 'TBC' ? `<div style="font-size:10px;color:#94a3b8">Est. restoration: ${esc(o.estRestoration)}</div>` : ''}</div>`,
            };
        }));
    }, [outages, historicalOutages, ready]);

    // Generator outages (Elexon REMIT), grouped by site
    useEffect(() => {
        if (!ready) return;
        if (!filters.has('Generator Outages')) { setMarkers('gen', []); return; }
        const bySite = new Map<string, GeneratorOutage[]>();
        generatorOutages.forEach(g => { if (typeof g.lat === 'number' && typeof g.lng === 'number') { const k = `${g.lat},${g.lng}`; bySite.set(k, [...(bySite.get(k) || []), g]); } });
        setMarkers('gen', Array.from(bySite.values()).map(list => {
            const unplanned = list.some(g => !g.planned);
            const mw = list.reduce((a, g) => a + g.unavailableMW, 0);
            const fs = Math.max(9, Math.min(13, 8 + Math.sqrt(mw) / 6));
            const colour = unplanned ? '#f59e0b' : '#64748b';
            const rows = list.map(g => `<div style="border-top:1px solid #334155;padding-top:4px;margin-top:4px"><b>${esc(g.unit)}</b> <span style="color:${g.planned ? '#94a3b8' : '#fbbf24'}">${g.planned ? 'Planned' : 'Unplanned'}</span><br>${esc(g.fuelType)} &middot; ${Math.round(g.unavailableMW)} MW out of ${Math.round(g.normalMW)} MW unavailable<br><span style="color:#94a3b8">Cause: ${esc(g.cause)} &middot; until ${esc(g.end ? new Date(g.end).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : 'TBC')}</span></div>`).join('');
            return {
                lngLat: [list[0].lng!, list[0].lat!] as [number, number], z: 5,
                html: `<div style="display:inline-flex;align-items:center;white-space:nowrap;background:${unplanned ? 'rgba(120,53,15,0.92)' : 'rgba(30,41,59,0.92)'};border:1.5px solid ${colour};color:${unplanned ? '#fde68a' : '#cbd5e1'};font:700 ${fs}px/1.2 system-ui,sans-serif;padding:1px 5px;border-radius:4px;box-shadow:0 1px 4px #000">&#9660;${Math.round(mw)} MW</div>`,
                popup: `<div style="min-width:240px;max-height:260px;overflow:auto;padding:10px 12px;font-size:11px"><div style="font-weight:bold;font-size:13px">${esc(list[0].siteName || list[0].unit)}</div><div style="color:#fbbf24;font-weight:bold">${Math.round(mw)} MW unavailable</div>${rows}<div style="font-size:9px;color:#64748b;margin-top:6px">Source: Elexon REMIT (live). Location approximate.</div></div>`,
            };
        }));
    }, [generatorOutages, filters, ready]);

    // Interconnector flows, floods, weather warnings
    useEffect(() => {
        if (!ready) return;
        setMarkers('floods', !filters.has('Flood Warnings') ? [] : floodWarnings.filter(w => typeof w.lat === 'number').map(w => {
            const severe = w.level === 1;
            return {
                lngLat: [w.lng!, w.lat!] as [number, number], z: 6,
                html: `<div style="width:14px;height:14px;background:${severe ? '#dc2626' : '#2563eb'};border:2px solid #fff;border-radius:2px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:9px;font-weight:bold">~</div>`,
                popup: `<div style="padding:10px 12px;max-width:260px"><b style="color:${severe ? '#f87171' : '#93c5fd'}">${esc(w.severity)}</b><br><b>${esc(w.area)}</b>${w.county ? `<br><span style="color:#94a3b8">${esc(w.county)}</span>` : ''}<div style="font-size:11px;margin-top:4px">${esc(w.message)}</div><div style="color:#64748b;font-size:9px;margin-top:4px">Source: Environment Agency (live)</div></div>`,
            };
        }));
        const colours: Record<string, string> = { Red: '#dc2626', Amber: '#f59e0b', Yellow: '#facc15' };
        setMarkers('weather', !filters.has('Weather Warnings') ? [] : weatherWarnings.filter(w => typeof w.lat === 'number').map((w, i) => ({
            lngLat: [w.lng! + (i % 3) * 0.15, w.lat! + (i % 3) * 0.15] as [number, number], z: 7,
            html: `<div style="position:relative;width:22px;height:19px"><div style="width:0;height:0;border-left:11px solid transparent;border-right:11px solid transparent;border-bottom:19px solid ${colours[w.level] || '#facc15'};filter:drop-shadow(0 0 3px #000)"></div><div style="position:absolute;top:5px;left:9px;font-size:11px;font-weight:bold;color:#000">!</div></div>`,
            popup: `<div style="padding:10px 12px;max-width:280px"><b>${esc(w.title)}</b><div style="font-size:11px;margin-top:4px">${esc(w.description)}</div>${w.link ? `<a href="${esc(w.link)}" target="_blank" rel="noopener" style="color:#67e8f9;font-size:11px">Met Office details</a>` : ''}<div style="color:#64748b;font-size:9px;margin-top:4px">Source: Met Office. Marker shows the region, not the exact area.</div></div>`,
        })));
    }, [floodWarnings, weatherWarnings, filters, ready]);

    // ---------- Energy flows (electricity interconnectors and gas) ----------
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !ready) return;
        flowsRef.current = energyFlows;
        const on = filters.has('Interconnector Flows');
        const feats = on ? energyFlows.map(l => {
            // Geometry runs in the direction of flow, so the moving dashes show which way energy is going
            const coords = l.gw < 0 ? [...l.path].reverse() : l.path;
            return { type: 'Feature', properties: { id: l.id, agw: Math.abs(l.gw), cut: !!cutRoutes?.has(l.id), color: l.kind === 'electricity' ? '#22d3ee' : '#f59e0b' }, geometry: { type: 'LineString', coordinates: coords } };
        }) : [];
        (map.getSource('energy-flows') as maplibregl.GeoJSONSource)?.setData({ type: 'FeatureCollection', features: feats } as any);
        // Labels about a third of the way in from the far end
        setMarkers('flows', !on ? [] : energyFlows.filter(l => Math.abs(l.gw) > 0.01 || cutRoutes?.has(l.id)).map(l => {
            const cut = !!cutRoutes?.has(l.id);
            const p = l.path[Math.min(l.path.length - 2, Math.max(0, Math.floor((l.path.length - 1) / 3)))];
            const q = l.path[Math.min(l.path.length - 1, Math.max(1, Math.floor((l.path.length - 1) / 3) + 1))];
            const at: [number, number] = [p[0] + (q[0] - p[0]) * 0.5, p[1] + (q[1] - p[1]) * 0.5];
            const colour = l.kind === 'electricity' ? '#22d3ee' : '#f59e0b';
            const into = l.gw > 0;
            return {
                lngLat: at, z: 2,
                html: cut
                    ? `<div style="white-space:nowrap;background:rgba(69,10,10,0.92);border:1.5px solid #ef4444;color:#fecaca;font:700 10px/1.25 system-ui,sans-serif;padding:1px 5px;border-radius:4px">&#10005; ${esc(l.name)} cut in scenario (was ${fmtGW(l.gw)})</div>`
                    : `<div style="white-space:nowrap;background:rgba(15,23,42,0.88);border:1px ${into ? 'solid' : 'dashed'} ${colour};color:${colour};font:700 10px/1.25 system-ui,sans-serif;padding:1px 5px;border-radius:4px;opacity:${into ? 1 : 0.8}">${esc(l.name)} ${into ? '&#9654; in' : '&#9664; out'} ${fmtGW(l.gw)}</div>`,
                popup: flowPopup(l),
            };
        }));
    }, [energyFlows, filters, ready, cutRoutes]);

    // Move the dashes (only while flows are shown and the page is visible)
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !ready || !filters.has('Interconnector Flows')) return;
        const seq = [[0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0], [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5]];
        let i = 0;
        const id = setInterval(() => {
            if (document.hidden || !map.getLayer('energy-flows-dash')) return;
            i = (i + 1) % seq.length;
            map.setPaintProperty('energy-flows-dash', 'line-dasharray', seq[i]);
        }, 70);
        return () => clearInterval(id);
    }, [filters, ready]);

    // ---------- Camera ----------
    useEffect(() => {
        if (viewOverride && mapRef.current) mapRef.current.flyTo({ center: [viewOverride.lng, viewOverride.lat], zoom: viewOverride.zoom, speed: 1.6 });
    }, [viewOverride]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || activeScenarios.length > 0 || viewOverride) return;
        if (region.id === 'UK') map.fitBounds(UK_BOUNDS, { padding: ukPadding() });
        else map.flyTo({ center: [region.lng, region.lat], zoom: region.zoom });
    }, [region]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;
        if (activeScenarios.length > 0 && !viewOverride) {
            const sc = activeScenarios[0];
            if (sc.id !== lastScenarioId.current) {
                lastScenarioId.current = sc.id;
                if (units.list.length) return; // the footprint effect fits the camera
                if (activeScenarios.length === 1 && sc.coordinates?.lat) map.flyTo({ center: [sc.coordinates.lng, sc.coordinates.lat], zoom: 8 });
                else if (activeScenarios.length === 1 && sc.locations?.length) map.flyTo({ center: [sc.locations[0].lng, sc.locations[0].lat], zoom: 8 });
            }
        } else if (activeScenarios.length === 0) lastScenarioId.current = null;
    }, [activeScenarios, viewOverride]);

    return (
        <div className="relative w-full h-full z-0">
            <div ref={containerRef} className="w-full h-full bg-[#0b1120]" />

            {isGrowthScenario && growthYear && (
                <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[50] flex flex-col items-center pointer-events-none">
                    <div className="bg-slate-900/90 border border-green-500/50 px-8 py-4 rounded-2xl shadow-2xl backdrop-blur flex flex-col items-center gap-1">
                        <span className="text-[10px] text-green-400 uppercase font-bold tracking-[0.2em]">Timeline Sequence</span>
                        <span className="text-5xl font-black text-white tabular-nums tracking-tighter leading-none">{growthYear}</span>
                    </div>
                </div>
            )}

            {!tilesAvailable && ready && (
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-[40] text-[10px] text-slate-500 bg-slate-950/70 px-2 py-0.5 rounded pointer-events-none hidden sm:block">
                    Detailed infrastructure tiles appear after the next weekly build; showing the national snapshot.
                </div>
            )}

            <div className="absolute bottom-20 sm:bottom-8 right-3 sm:right-8 z-[50] flex flex-col gap-2">
                <button onClick={() => mapRef.current?.zoomIn()} aria-label="Zoom in" className="w-10 h-10 bg-slate-900/90 border border-slate-700 rounded-lg text-white flex items-center justify-center hover:bg-slate-800 shadow-xl"><PlusIcon className="w-6 h-6" /></button>
                <button onClick={() => mapRef.current?.zoomOut()} aria-label="Zoom out" className="w-10 h-10 bg-slate-900/90 border border-slate-700 rounded-lg text-white flex items-center justify-center hover:bg-slate-800 shadow-xl"><MinusIcon className="w-6 h-6" /></button>
            </div>
        </div>
    );
};

export default React.memo(MapVisualization);
