// The map (MapLibre GL).
//   Background: Esri dark grey raster tiles (free, no key).
//   Energy infrastructure: vector tiles built weekly from OpenStreetMap (public/tiles/energy.pmtiles,
//     see scripts/energy-tiles.yml). If the tiles aren't there yet, the weekly OSM snapshot is shown instead.
//   Live layers (power cuts, generator outages, flows, warnings) are HTML markers on top.
// Click a substation to highlight the lines that connect to it.
import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Protocol } from 'pmtiles';
import { InfrastructureAsset, RegionConfig, RiskScenario, OutageEvent, DNORegion, GeneratorOutage } from '../types';
import { ASSET_TYPES } from '../constants';
import { InterconnectorFlow, RegionalCarbon, FloodWarning, WeatherWarning } from '../services/liveSystems';
import { markOk, markFail } from '../services/health';
import { iconSvg, dotSvg, powerCutSvg, voltageColour, ASSET_ICON } from './icons';
import { PlusIcon, MinusIcon } from '@heroicons/react/24/solid';

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
    regionalCarbon?: Record<string, RegionalCarbon>;
    floodWarnings?: FloodWarning[];
    weatherWarnings?: WeatherWarning[];
}

// PMTiles protocol (registered once)
const pmtilesProtocol = new Protocol();
maplibregl.addProtocol('pmtiles', pmtilesProtocol.tile);
const TILES_URL = new URL('tiles/energy.pmtiles', document.baseURI).href;

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

const emptyFC = { type: 'FeatureCollection', features: [] as any[] };

const popupHtml = (title: string, rows: [string, any][], source: string) =>
    `<div style="padding:10px 12px;min-width:200px;max-width:280px"><div style="font-weight:bold;margin-bottom:4px">${esc(title)}</div>` +
    rows.filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `<div style="font-size:11px"><span style="color:#94a3b8">${esc(k)}:</span> ${esc(v)}</div>`).join('') +
    `<div style="color:#64748b;font-size:9px;margin-top:6px">${source}</div></div>`;

const fmtVoltage = (v: any) => String(v || '').split(';').map(x => { const n = parseInt(x, 10); return isNaN(n) ? '' : n >= 1000 ? `${n / 1000} kV` : `${n} V`; }).filter(Boolean).join(' / ');

const OSM_LAYERS = ['osm-plants-icon', 'osm-plants-fill', 'osm-substations-icon', 'osm-substations-fill', 'osm-generators', 'osm-generators-fill', 'osm-lines', 'osm-cables', 'osm-gas', 'osm-gas-sites', 'osm-demand'];

const MapVisualization: React.FC<MapProps> = ({
    region, assets, outages, historicalOutages = [], activeScenarios, dnoRegions = [], day, filters,
    onAssetSelect, onViewChange, currentImpact = 0, peakImpact = 1, viewOverride, isScenarioComplete, generatorOutages = [],
    interconnectorFlows = [], regionalCarbon = {}, floodWarnings = [], weatherWarnings = []
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<maplibregl.Map | null>(null);
    const [ready, setReady] = useState(false);
    const [tilesAvailable, setTilesAvailable] = useState(false);
    const markersRef = useRef<Record<string, maplibregl.Marker[]>>({});
    const popupRef = useRef<maplibregl.Popup | null>(null);
    const lastScenarioId = useRef<string | null>(null);

    // Latest props for event handlers
    const propsRef = useRef({ assets, onAssetSelect, onViewChange, regionalCarbon });
    propsRef.current = { assets, onAssetSelect, onViewChange, regionalCarbon };

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
            } else if (layer.startsWith('osm-substations')) {
                title = title || (p.power === 'converter' ? 'HVDC converter station' : 'Substation');
                rows = [['Type', p.substation || p.power], ['Voltage', fmtVoltage(p.voltage)], ['Operator', p.operator], ['Reference', p.ref]];
                const n = highlightConnected(e.lngLat);
                extra = `<div style="font-size:11px;margin-top:4px;color:#e2e8f0">${n ? `${n} connected line section${n === 1 ? '' : 's'} highlighted` : 'Zoom in further to see connecting lines'}</div>`;
            } else if (layer.startsWith('osm-generators')) {
                title = title || `${p['generator:source'] || ''} generator`;
                rows = [['Source', p['generator:source']], ['Type', p['generator:type'] || p['generator:method']], ['Output', p['generator:output:electricity']], ['Operator', p.operator]];
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
            dragRotate: false,
            pitchWithRotate: false,
        });
        map.touchZoomRotate.disableRotation();
        map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
        mapRef.current = map;
        (window as any).__energyMap = map; // handy for debugging in the browser console
        if (region.id === 'UK') map.fitBounds([[-8.2, 49.9], [1.8, 60.8]], { padding: 20, duration: 0 });

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

            map.addSource('impact', { type: 'geojson', data: emptyFC as any });
            map.addLayer({ id: 'impact-fill', type: 'fill', source: 'impact', paint: { 'fill-color': '#ef4444', 'fill-opacity': ['get', 'opacity'] } });

            map.addSource('asset-lines', { type: 'geojson', data: emptyFC as any });
            map.addLayer({ id: 'asset-lines', type: 'line', source: 'asset-lines', filter: ['!', ['to-boolean', ['get', 'dashed']]], paint: { 'line-color': ['get', 'color'], 'line-width': ['case', ['to-boolean', ['get', 'affected']], 4, 2], 'line-opacity': 0.75 } });
            map.addLayer({ id: 'asset-lines-dashed', type: 'line', source: 'asset-lines', filter: ['to-boolean', ['get', 'dashed']], paint: { 'line-color': ['get', 'color'], 'line-width': ['case', ['to-boolean', ['get', 'affected']], 4, 2], 'line-opacity': 0.75, 'line-dasharray': [3, 2] } });

            map.addSource('highlight', { type: 'geojson', data: emptyFC as any });
            map.addLayer({ id: 'highlight', type: 'line', source: 'highlight', paint: { 'line-color': '#ffffff', 'line-width': 5, 'line-opacity': 0.55, 'line-blur': 1 } });

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
                if (e.originalEvent.__erHandled) return;
                (map.getSource('highlight') as maplibregl.GeoJSONSource)?.setData(emptyFC as any);
                const dno = map.queryRenderedFeatures(e.point, { layers: ['dno-fill'] })[0];
                if (!dno || map.getLayoutProperty('dno-fill', 'visibility') === 'none') return;
                const p: any = dno.properties || {};
                const ci = propsRef.current.regionalCarbon[p.name];
                const ciHtml = ci ? `<div style="margin-top:6px;border-top:1px solid #334155;padding-top:6px"><div>Carbon intensity: <b>${ci.intensity} gCO2/kWh</b> (${esc(ci.index)})</div><div style="color:#94a3b8;font-size:11px">Local mix: ${ci.mix.slice(0, 4).map(m => `${esc(m.fuel)} ${m.perc}%`).join(', ')}</div><div style="color:#64748b;font-size:9px;margin-top:2px">Source: NESO Carbon Intensity API (live forecast)</div></div>` : '';
                showPopup(e.lngLat, `<div style="padding:10px 12px;min-width:220px"><b>${esc(p.name)}</b><br><span style="color:#94a3b8">${esc(p.operator)}</span>${ciHtml}</div>`);
            });
            ['assets', 'asset-lines', 'asset-lines-dashed', ...OSM_LAYERS].forEach(l => {
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
        ['osm-plants-fill', 'osm-plants-icon', 'osm-generators', 'osm-generators-fill'].forEach(l => vis(l, gen));
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
        vis('osm-gas-sites', tx);
        vis('osm-demand', filters.has('Retail'));
        vis('dno-fill', filters.has('DNO Regions'));
        vis('dno-line', filters.has('DNO Regions'));
    }, [filters, ready, tilesAvailable]);

    // ---------- Our assets (built-in, snapshot, local search) and scenario state ----------
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !ready) return;
        const affectedIds = new Set(day > 0 ? activeScenarios.flatMap(s => s.affectedAssets) : []);
        const timelineYear = isGrowthScenario ? (growthYear || 9999) : 9999;
        const points: any[] = [];
        const lines: any[] = [];
        assets.forEach(a => {
            if (typeof a.lat !== 'number' || typeof a.lng !== 'number' || isNaN(a.lat) || isNaN(a.lng)) return;
            const typeDef = ASSET_TYPES.find(t => t.id === a.typeId);
            if (!typeDef || !filters.has(typeDef.category)) return;
            if (isGrowthScenario && a.commissionYear && a.commissionYear > timelineYear) return;
            const affected = affectedIds.has(a.id);
            // When the vector tiles are available they already show the OSM snapshot assets
            if (tilesAvailable && a.id.startsWith('op_') && !affected) return;
            const tags = (a as any).rawTags || {};
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

    // ---------- Scenario impact circles ----------
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !ready) return;
        const src = map.getSource('impact') as maplibregl.GeoJSONSource;
        if (isScenarioComplete || activeScenarios.length === 0 || isGrowthScenario || !(currentImpact > 0)) { src?.setData(emptyFC as any); return; }
        const centre = region.id === 'UK' ? { lat: 52.4862, lng: -1.8904 } : { lat: region.lat, lng: region.lng };
        const targets: { lat: number, lng: number, radius: number }[] = [];
        if (activeScenarios.length > 1) targets.push({ ...centre, radius: Math.sqrt(currentImpact) * 100 });
        else {
            const sc = activeScenarios[0];
            if (sc.locations?.length) {
                const split = Math.max(currentImpact / sc.locations.length, 100);
                sc.locations.forEach(l => targets.push({ lat: l.lat, lng: l.lng, radius: Math.sqrt(split) * 40 }));
            } else if (sc.coordinates?.lat) targets.push({ ...sc.coordinates, radius: Math.sqrt(currentImpact) * 40 });
            else targets.push({ ...centre, radius: Math.sqrt(currentImpact) * 100 });
        }
        const opacity = 0.15 + (peakImpact > 0 ? currentImpact / peakImpact : 0) * 0.25;
        src?.setData({ type: 'FeatureCollection', features: targets.map(t => ({ ...circlePolygon(t.lat, t.lng, t.radius), properties: { opacity } })) } as any);
    }, [currentImpact, peakImpact, activeScenarios, isScenarioComplete, isGrowthScenario, region, ready]);

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
            if (it.popup) el.addEventListener('click', ev => { ev.stopPropagation(); showPopup(it.lngLat, it.popup!); });
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
        setMarkers('flows', !filters.has('Interconnector Flows') ? [] : interconnectorFlows.map(f => {
            const importing = f.mw > 0, exporting = f.mw < 0;
            const colour = importing ? '#4ade80' : exporting ? '#fb923c' : '#64748b';
            return {
                lngLat: [f.lng, f.lat] as [number, number], anchor: 'left' as maplibregl.PositionAnchor, z: 2,
                html: `<div style="margin-left:6px;white-space:nowrap;background:rgba(15,23,42,0.85);border:1px solid ${colour};color:${colour};font-size:10px;font-weight:bold;padding:1px 5px;border-radius:4px">${esc(f.name)} ${importing ? '&darr;' : exporting ? '&uarr;' : ''}${Math.abs(f.mw)} MW</div>`,
                popup: `<div style="padding:10px 12px"><b>${esc(f.name)}</b> (to ${esc(f.country)})<br>${importing ? 'Importing' : exporting ? 'Exporting' : 'No flow'}: <b>${Math.abs(f.mw)} MW</b> of ${f.capacityMW} MW<div style="color:#64748b;font-size:9px;margin-top:4px">Source: Elexon (live, 5-minute)</div></div>`,
            };
        }));
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
    }, [interconnectorFlows, floodWarnings, weatherWarnings, filters, ready]);

    // ---------- Camera ----------
    useEffect(() => {
        if (viewOverride && mapRef.current) mapRef.current.flyTo({ center: [viewOverride.lng, viewOverride.lat], zoom: viewOverride.zoom, speed: 1.6 });
    }, [viewOverride]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || activeScenarios.length > 0 || viewOverride) return;
        if (region.id === 'UK') map.fitBounds([[-8.2, 49.9], [1.8, 60.8]], { padding: 20 });
        else map.flyTo({ center: [region.lng, region.lat], zoom: region.zoom });
    }, [region]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;
        if (activeScenarios.length > 0 && !viewOverride) {
            const sc = activeScenarios[0];
            if (sc.id !== lastScenarioId.current) {
                lastScenarioId.current = sc.id;
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
