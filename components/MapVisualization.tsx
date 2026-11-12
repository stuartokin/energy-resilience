import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { InfrastructureAsset, RegionConfig, RiskScenario, OutageEvent, DNORegion, AssetType, GeneratorOutage } from '../types';
import { ASSET_TYPES } from '../constants';
import { InterconnectorFlow, RegionalCarbon, FloodWarning, WeatherWarning } from '../services/liveSystems';
import { markOk, markFail } from '../services/health';
import { iconSvg, dotSvg, powerCutSvg, voltageColour } from './icons';
import { PlusIcon, MinusIcon, ExclamationTriangleIcon } from '@heroicons/react/24/solid';

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

// Line colour by voltage (see components/icons.ts for the shared legend)
const getVoltageColor = (tags: any) => voltageColour(tags?.voltage);

// Dash pattern: underground / subsea cables dashed, gas pipelines dotted
const lineDash = (asset: InfrastructureAsset): string | undefined => {
    const t = (asset as any).rawTags || {};
    if (asset.typeId === 'pipeline_gas' || t.man_made === 'pipeline') return '2 5';
    if (t.power === 'cable' || t.location === 'underground' || t.location === 'underwater' || asset.typeId === 'interconnector') return '8 5';
    return undefined;
};

// Free basemap with no API key: Esri World Dark Gray Canvas (base + labels).
// (CARTO now requires an API key for sites other than localhost.)
const BASEMAP_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}';
const LABELS_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}';
const BASEMAP_ATTRIBUTION = 'Basemap &copy; <a href="https://www.esri.com">Esri</a>, HERE, Garmin, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | Radar &copy; <a href="https://www.rainviewer.com">RainViewer</a>';

// Escape text that may come from AI or external feeds before putting it in a popup.
const esc = (v: any) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

// Cache icons so simulation ticks don't rebuild identical DOM.
const iconCache = new Map<string, L.DivIcon>();

// High-contrast asset icons: a dot when zoomed out, a symbol in a black circle when zoomed in.
const getAssetIcon = (typeDef: AssetType | undefined, color: string, isZoomed: boolean, isAffected: boolean): L.DivIcon => {
    const id = typeDef?.id || 'substation';
    const key = `${id}|${color}|${isZoomed}|${isAffected}`;
    const cached = iconCache.get(key);
    if (cached) return cached;
    const highlight = isAffected ? '#ef4444' : undefined;
    const size = isZoomed ? 30 : (isAffected ? 15 : 11);
    const icon = L.divIcon({
        html: isZoomed ? iconSvg(id, color, size, highlight) : dotSvg(id, color, size, highlight),
        className: 'asset-icon',
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2]
    });
    iconCache.set(key, icon);
    return icon;
};

// Power cuts: unplanned ones pulse; planned work is shown smaller and dimmer.
const OUTAGE_ICON = L.divIcon({ html: `<div class="powercut-pulse">${powerCutSvg(22)}</div>`, className: 'asset-icon', iconSize: [22, 22], iconAnchor: [11, 11] });
const PLANNED_OUTAGE_ICON = L.divIcon({ html: `<div style="opacity:0.7">${powerCutSvg(15)}</div>`, className: 'asset-icon', iconSize: [15, 15], iconAnchor: [8, 8] });

const MapVisualization: React.FC<MapProps> = ({ 
    region, assets, outages, historicalOutages = [], activeScenarios, dnoRegions = [], day, filters, 
    onAssetSelect, onViewChange, currentImpact = 0, peakImpact = 1, viewOverride, isScenarioComplete, generatorOutages = [],
    interconnectorFlows = [], regionalCarbon = {}, floodWarnings = [], weatherWarnings = []
}) => {
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const [noLocationWarning, setNoLocationWarning] = useState(false);
    const [currentZoom, setCurrentZoom] = useState(region.zoom);
    const [isMapReady, setIsMapReady] = useState(false);
    const [weather, setWeather] = useState<{ host: string, path: string } | null>(null);

    const mapRef = useRef<L.Map | null>(null);
    const assetMarkersRef = useRef<Map<string, L.Marker>>(new Map());
    const assetLinesRef = useRef<Map<string, L.Polyline>>(new Map());
    const outageLayerRef = useRef<L.LayerGroup | null>(null);
    const genOutageLayerRef = useRef<L.LayerGroup | null>(null);
    const liveLayerRef = useRef<L.LayerGroup | null>(null);
    const dnoLayerRef = useRef<L.LayerGroup | null>(null);
    const weatherLayerRef = useRef<L.TileLayer | null>(null);
    const impactCirclesRef = useRef<L.Circle[]>([]);
    const lastActiveScenarioId = useRef<string | null>(null);

    // Keep latest callbacks without re-binding map events
    const onAssetSelectRef = useRef(onAssetSelect);
    const onViewChangeRef = useRef(onViewChange);
    onAssetSelectRef.current = onAssetSelect;
    onViewChangeRef.current = onViewChange;

    const isGrowthScenario = activeScenarios.some(s => s.category === 'Growth');
    const growthYear = isGrowthScenario ? 2015 + Math.floor(day / 6) : null;

    const setLayerVisible = (layer: L.Layer, visible: boolean) => {
        const map = mapRef.current;
        if (!map) return;
        if (visible && !map.hasLayer(layer)) layer.addTo(map);
        if (!visible && map.hasLayer(layer)) layer.remove();
    };

    // --- Weather radar frames (RainViewer, free) ---
    useEffect(() => {
        const fetchWeather = async () => {
            try {
                const res = await fetch('https://api.rainviewer.com/public/weather-maps.json');
                const data = await res.json();
                const frames = data.radar?.past || [];
                const last = frames[frames.length - 1];
                if (last) { setWeather({ host: data.host || 'https://tilecache.rainviewer.com', path: last.path || `/v2/radar/${last.time}` }); markOk('radar'); }
            } catch (e) {
                console.warn("Weather radar unavailable", e);
                markFail('radar', 'unavailable');
            }
        };
        fetchWeather();
    }, []);

    // --- Init map once ---
    useEffect(() => {
        if (!mapContainerRef.current || mapRef.current) return;
        const map = L.map(mapContainerRef.current, {
            center: [region.lat, region.lng],
            zoom: region.zoom,
            zoomControl: false,
            preferCanvas: true,
            worldCopyJump: true
        });
        // Fit Great Britain and Northern Ireland to the screen, whatever its size
        if (region.id === 'UK') map.fitBounds([[49.9, -8.2], [60.8, 1.8]], { padding: [20, 20] });
        L.tileLayer(BASEMAP_URL, { attribution: BASEMAP_ATTRIBUTION, maxNativeZoom: 16, maxZoom: 19, className: 'basemap-tiles' })
            .on('tileload', () => markOk('basemap'))
            .on('tileerror', () => markFail('basemap', 'tiles failed to load'))
            .addTo(map);
        // Place-name labels sit above the infrastructure so towns stay readable
        map.createPane('labels');
        const labelsPane = map.getPane('labels');
        if (labelsPane) { labelsPane.style.zIndex = '450'; labelsPane.style.pointerEvents = 'none'; }
        L.tileLayer(LABELS_URL, { pane: 'labels', maxNativeZoom: 16, maxZoom: 19, opacity: 0.7 }).addTo(map);
        outageLayerRef.current = L.layerGroup().addTo(map);
        genOutageLayerRef.current = L.layerGroup().addTo(map);
        liveLayerRef.current = L.layerGroup().addTo(map);
        dnoLayerRef.current = L.layerGroup().addTo(map);

        map.on('moveend', () => {
            const z = map.getZoom();
            const c = map.getCenter();
            setCurrentZoom(z);
            onViewChangeRef.current?.({ lat: c.lat, lng: c.lng, zoom: z });
        });

        mapRef.current = map;
        setIsMapReady(true);

        // Leaflet needs a nudge if the container size changes (panels, resizes)
        const ro = new ResizeObserver(() => map.invalidateSize());
        ro.observe(mapContainerRef.current);

        return () => {
            ro.disconnect();
            map.remove();
            mapRef.current = null;
            assetMarkersRef.current.clear();
            assetLinesRef.current.clear();
            impactCirclesRef.current = [];
            weatherLayerRef.current = null;
        };
    }, []);

    // --- View Handling ---
    useEffect(() => {
        if (viewOverride && mapRef.current) {
            mapRef.current.setView([viewOverride.lat, viewOverride.lng], viewOverride.zoom);
            setCurrentZoom(viewOverride.zoom);
        }
    }, [viewOverride]);

    useEffect(() => {
        if (activeScenarios.length > 0 || viewOverride || !mapRef.current) return;
        mapRef.current.setView([region.lat, region.lng], region.zoom);
        setCurrentZoom(region.zoom);
    }, [region]);

    useEffect(() => {
        const map = mapRef.current;
        if (activeScenarios.length > 0 && !viewOverride && map) {
            const sc = activeScenarios[0];
            if (sc.id !== lastActiveScenarioId.current) {
                if (activeScenarios.length > 1) {
                    map.setView([region.lat, region.lng], region.zoom);
                } else if (sc.coordinates && sc.coordinates.lat) {
                    map.setView([sc.coordinates.lat, sc.coordinates.lng], 8);
                } else if (sc.locations && sc.locations.length > 0) {
                    map.setView([sc.locations[0].lat, sc.locations[0].lng], 8);
                } else {
                    map.setView([region.lat, region.lng], region.zoom);
                }
                lastActiveScenarioId.current = sc.id;
            }
        } else if (activeScenarios.length === 0) {
            lastActiveScenarioId.current = null;
            setNoLocationWarning(false);
        }
    }, [activeScenarios, viewOverride, region]);

    // --- Weather Layer ---
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !weather) return;
        if (filters.has('Weather Radar')) {
            if (!weatherLayerRef.current) {
                weatherLayerRef.current = L.tileLayer(`${weather.host}${weather.path}/256/{z}/{x}/{y}/2/1_1.png`, {
                    opacity: 0.6,
                    maxNativeZoom: 7,
                    maxZoom: 19,
                    zIndex: 400
                });
            }
            setLayerVisible(weatherLayerRef.current, true);
        } else if (weatherLayerRef.current) {
            setLayerVisible(weatherLayerRef.current, false);
        }
    }, [filters, weather, isMapReady]);

    // --- STATIC ASSETS (when assets/filters change) ---
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !isMapReady) return;

        const currentAssetIds = new Set(assets.map(a => a.id));
        assetMarkersRef.current.forEach((marker, id) => {
            if (!currentAssetIds.has(id)) { marker.remove(); assetMarkersRef.current.delete(id); }
        });
        assetLinesRef.current.forEach((line, id) => {
            if (!currentAssetIds.has(id)) { line.remove(); assetLinesRef.current.delete(id); }
        });

        assets.forEach(asset => {
            if (typeof asset.lat !== 'number' || typeof asset.lng !== 'number' || isNaN(asset.lat) || isNaN(asset.lng)) return;

            const typeDef = ASSET_TYPES.find(t => t.id === asset.typeId);
            if (!typeDef || !filters.has(typeDef.category)) {
                assetMarkersRef.current.get(asset.id)?.remove();
                assetMarkersRef.current.delete(asset.id);
                assetLinesRef.current.get(asset.id)?.remove();
                assetLinesRef.current.delete(asset.id);
                return;
            }

            const color = getVoltageColor((asset as any).rawTags) || typeDef.color;

            if (asset.path || (asset.endLat && asset.endLng)) {
                if (!assetLinesRef.current.has(asset.id)) {
                    const path = asset.path || [{ lat: asset.lat, lng: asset.lng }, { lat: asset.endLat!, lng: asset.endLng! }];
                    const line = L.polyline(path.map(p => [p.lat, p.lng] as [number, number]), {
                        color, opacity: 0.7, weight: 2, dashArray: lineDash(asset)
                    }).addTo(map);
                    line.on('click', () => onAssetSelectRef.current(asset));
                    line.bindTooltip(esc(asset.name), { sticky: true });
                    assetLinesRef.current.set(asset.id, line);
                }
            } else if (!assetMarkersRef.current.has(asset.id)) {
                const marker = L.marker([asset.lat, asset.lng], {
                    icon: getAssetIcon(typeDef, color, currentZoom >= 10, false),
                    title: asset.name,
                    riseOnHover: true
                }).addTo(map);
                marker.on('click', () => onAssetSelectRef.current(asset));
                assetMarkersRef.current.set(asset.id, marker);
            }
        });

        // DNO licence areas
        const dnoLayer = dnoLayerRef.current;
        dnoLayer?.clearLayers();
        if (dnoLayer && filters.has('DNO Regions') && dnoRegions) {
            dnoRegions.forEach(dno => {
                const latlngs: any = dno.polygons && dno.polygons.length
                    ? dno.polygons.map(ring => [ring])          // multipolygon: real NESO boundary
                    : dno.path.map(p => [p.lat, p.lng] as [number, number]); // rough fallback outline
                const polygon = L.polygon(latlngs, {
                    color: dno.color, opacity: 0.8, weight: 1.5, fillColor: dno.color, fillOpacity: 0.12
                });
                const ci = regionalCarbon[dno.name];
                const ciHtml = ci ? `<div style="margin-top:6px;border-top:1px solid #334155;padding-top:6px">
                    <div>Carbon intensity: <b>${ci.intensity} gCO2/kWh</b> (${esc(ci.index)})</div>
                    <div style="color:#94a3b8;font-size:11px">Local mix: ${ci.mix.slice(0, 4).map(m => `${esc(m.fuel)} ${m.perc}%`).join(', ')}</div>
                    <div style="color:#64748b;font-size:9px;margin-top:2px">Source: NESO Carbon Intensity API (live forecast)</div></div>` : '';
                polygon.bindPopup(`<div style="padding:10px 12px;min-width:220px"><b>${esc(dno.name)}</b><br><span style="color:#94a3b8">${esc(dno.operator)}</span>${ciHtml}</div>`);
                polygon.addTo(dnoLayer);
                polygon.bringToBack();
            });
        }
    }, [assets, filters, dnoRegions, isMapReady, regionalCarbon]);

    // --- Swap dot/icon style when zoom crosses threshold ---
    useEffect(() => {
        if (!mapRef.current) return;
        const shouldUseIcons = currentZoom >= 10;
        assetMarkersRef.current.forEach((marker, id) => {
            const asset = assets.find(a => a.id === id);
            if (!asset) return;
            const typeDef = ASSET_TYPES.find(t => t.id === asset.typeId);
            const color = getVoltageColor((asset as any).rawTags) || typeDef?.color || '#fff';
            const isAffected = activeScenarios.some(s => s.affectedAssets.includes(id)) && day > 0;
            marker.setIcon(getAssetIcon(typeDef, color, shouldUseIcons, isAffected));
        });
    }, [currentZoom, assets]);

    // --- DYNAMIC UPDATES (simulation tick) ---
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;

        const affectedAssetIds = new Set(activeScenarios.flatMap(s => s.affectedAssets));
        const timelineYear = isGrowthScenario ? (growthYear || 9999) : 9999;
        const shouldUseIcons = currentZoom >= 10;

        const styleAsset = (id: string, marker?: L.Marker, line?: L.Polyline) => {
            const asset = assets.find(a => a.id === id);
            if (!asset) return;

            // Growth scenario: hide assets not yet commissioned
            const isVisible = !(isGrowthScenario && asset.commissionYear && asset.commissionYear > timelineYear);
            if (marker) setLayerVisible(marker, isVisible);
            if (line) setLayerVisible(line, isVisible);
            if (!isVisible) return;

            const isCritical = day > 0 && affectedAssetIds.has(id);
            const typeDef = ASSET_TYPES.find(t => t.id === asset.typeId);
            const baseColor = getVoltageColor((asset as any)?.rawTags) || typeDef?.color || '#fff';

            if (isGrowthScenario) {
                const growthColor = '#10b981';
                marker?.setIcon(getAssetIcon(typeDef, isCritical ? growthColor : baseColor, shouldUseIcons, false));
                line?.setStyle({ color: isCritical ? growthColor : baseColor, weight: isCritical ? 4 : 2 });
            } else {
                marker?.setIcon(getAssetIcon(typeDef, baseColor, shouldUseIcons, isCritical));
                marker?.setZIndexOffset(isCritical ? 1000 : 0);
                line?.setStyle({ color: isCritical ? '#ef4444' : baseColor, weight: isCritical ? 4 : 2, opacity: isCritical ? 0.9 : 0.6 });
            }
            if (isCritical) line?.bringToFront();
        };

        assetMarkersRef.current.forEach((marker, id) => styleAsset(id, marker, undefined));
        assetLinesRef.current.forEach((line, id) => styleAsset(id, undefined, line));

        // Impact circles: update in place to avoid flicker
        if (!isScenarioComplete && activeScenarios.length > 0 && !isGrowthScenario && (currentImpact || 0) > 0) {
            const targets: { lat: number, lng: number, radius: number }[] = [];
            const combinedImpact = currentImpact || 0;
            const regionCentre = region.id === 'UK' ? { lat: 52.4862, lng: -1.8904 } : { lat: region.lat, lng: region.lng };

            if (activeScenarios.length > 1) {
                targets.push({ ...regionCentre, radius: Math.sqrt(combinedImpact) * 100 });
            } else {
                const sc = activeScenarios[0];
                if (sc.locations && sc.locations.length > 0) {
                    const splitImpact = Math.max(combinedImpact / sc.locations.length, 100);
                    sc.locations.forEach(loc => targets.push({ lat: loc.lat, lng: loc.lng, radius: Math.sqrt(splitImpact) * 40 }));
                } else if (sc.coordinates && sc.coordinates.lat) {
                    targets.push({ ...sc.coordinates, radius: Math.sqrt(combinedImpact) * 40 });
                } else {
                    targets.push({ ...regionCentre, radius: Math.sqrt(combinedImpact) * 100 });
                }
            }

            const ratio = peakImpact > 0 ? (currentImpact || 0) / peakImpact : 0;
            const fillOpacity = 0.2 + (ratio * 0.3);

            while (impactCirclesRef.current.length < targets.length) {
                const t = targets[impactCirclesRef.current.length];
                impactCirclesRef.current.push(L.circle([t.lat, t.lng], {
                    radius: t.radius, color: '#ef4444', opacity: 0.3, weight: 1,
                    fillColor: '#ef4444', fillOpacity, interactive: false
                }).addTo(map));
            }
            while (impactCirclesRef.current.length > targets.length) {
                impactCirclesRef.current.pop()?.remove();
            }
            targets.forEach((t, i) => {
                const c = impactCirclesRef.current[i];
                c.setLatLng([t.lat, t.lng]);
                c.setRadius(t.radius);
                c.setStyle({ fillOpacity });
            });
        } else {
            impactCirclesRef.current.forEach(c => c.remove());
            impactCirclesRef.current = [];
        }
    }, [day, currentImpact, activeScenarios, assets, currentZoom, isScenarioComplete, growthYear, isGrowthScenario, region]);

    // --- OUTAGES ---
    useEffect(() => {
        const layer = outageLayerRef.current;
        if (!layer || !isMapReady) return;
        layer.clearLayers();

        [...outages, ...(historicalOutages || [])].forEach(outage => {
            if (typeof outage.lat !== 'number' || typeof outage.lng !== 'number' || isNaN(outage.lat) || isNaN(outage.lng)) return;
            const planned = /^planned/i.test(String(outage.description || ''));
            const marker = L.marker([outage.lat, outage.lng], {
                icon: planned ? PLANNED_OUTAGE_ICON : OUTAGE_ICON,
                title: `Outage: ${outage.locationName}`,
                zIndexOffset: 2000
            });
            marker.bindPopup(`
                <div style="min-width:200px;padding:10px 12px">
                    <div style="font-weight:bold;margin-bottom:4px;color:#f87171">&#9888; ${esc(outage.locationName)}</div>
                    <div style="font-size:12px">${esc(outage.description)}</div>
                    <div style="font-size:12px;font-weight:bold;margin-top:4px">Customers affected: ${outage.consumersAffected ? Number(outage.consumersAffected).toLocaleString() : 'not published'}</div>
                    <div style="font-size:10px;color:#94a3b8">Status: ${esc(outage.status)}</div>
                    <div style="font-size:10px;color:#94a3b8">Source: ${esc(outage.source)}</div>
                    ${outage.estRestoration && outage.estRestoration !== 'TBC' ? `<div style="font-size:10px;color:#94a3b8">Est. restoration: ${esc(outage.estRestoration)}</div>` : ''}
                </div>`);
            marker.addTo(layer);
        });
    }, [outages, historicalOutages, isMapReady]);

    // --- GENERATOR OUTAGES (Elexon REMIT) ---
    useEffect(() => {
        const layer = genOutageLayerRef.current;
        if (!layer || !isMapReady) return;
        layer.clearLayers();
        if (!filters.has('Generator Outages')) return;

        // Several units at one station: group into one marker per site.
        const bySite = new Map<string, GeneratorOutage[]>();
        generatorOutages.forEach(g => {
            if (typeof g.lat !== 'number' || typeof g.lng !== 'number') return;
            const k = `${g.lat},${g.lng}`;
            bySite.set(k, [...(bySite.get(k) || []), g]);
        });
        bySite.forEach(list => {
            const unplanned = list.some(g => !g.planned);
            const mw = list.reduce((a, g) => a + g.unavailableMW, 0);
            // A tag showing MW unavailable: amber = unplanned, grey = planned. Larger outages get larger text.
            const fs = Math.max(9, Math.min(13, 8 + Math.sqrt(mw) / 6));
            const colour = unplanned ? '#f59e0b' : '#64748b';
            const icon = L.divIcon({
                html: `<div style="transform:translate(-50%,-50%);display:inline-flex;align-items:center;gap:3px;white-space:nowrap;background:${unplanned ? 'rgba(120,53,15,0.92)' : 'rgba(30,41,59,0.92)'};border:1.5px solid ${colour};color:${unplanned ? '#fde68a' : '#cbd5e1'};font:700 ${fs}px/1.2 system-ui,sans-serif;padding:1px 5px;border-radius:4px;box-shadow:0 1px 4px #000">&#9660;${Math.round(mw)} MW</div>`,
                className: 'asset-icon',
                iconSize: [0, 0]
            });
            const rows = list.map(g => `
                <div style="border-top:1px solid #334155;padding-top:4px;margin-top:4px">
                    <b>${esc(g.unit)}</b> <span style="color:${g.planned ? '#94a3b8' : '#fbbf24'}">${g.planned ? 'Planned' : 'Unplanned'}</span><br>
                    ${esc(g.fuelType)} &middot; ${Math.round(g.unavailableMW)} MW out of ${Math.round(g.normalMW)} MW unavailable<br>
                    <span style="color:#94a3b8">Cause: ${esc(g.cause)} &middot; until ${esc(g.end ? new Date(g.end).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : 'TBC')}</span>
                </div>`).join('');
            L.marker([list[0].lat!, list[0].lng!], { icon, zIndexOffset: 1500, title: `${list[0].siteName}: ${Math.round(mw)} MW unavailable` })
                .bindPopup(`<div style="min-width:240px;max-height:260px;overflow:auto;padding:10px 12px;font-size:11px">
                    <div style="font-weight:bold;font-size:13px">${esc(list[0].siteName || list[0].unit)}</div>
                    <div style="color:#fbbf24;font-weight:bold">${Math.round(mw)} MW unavailable</div>${rows}
                    <div style="font-size:9px;color:#64748b;margin-top:6px">Source: Elexon REMIT (live). Location approximate.</div></div>`)
                .addTo(layer);
        });
    }, [generatorOutages, filters, isMapReady]);

    // --- LIVE SYSTEMS: interconnector flows, flood warnings, weather warnings ---
    useEffect(() => {
        const layer = liveLayerRef.current;
        if (!layer || !isMapReady) return;
        layer.clearLayers();

        if (filters.has('Interconnector Flows')) {
            interconnectorFlows.forEach(f => {
                const importing = f.mw > 0, exporting = f.mw < 0;
                const colour = importing ? '#4ade80' : exporting ? '#fb923c' : '#64748b';
                const label = `${f.name} ${importing ? '&darr;' : exporting ? '&uarr;' : ''}${Math.abs(f.mw)} MW`;
                L.marker([f.lat, f.lng], {
                    icon: L.divIcon({
                        html: `<div style="white-space:nowrap;background:rgba(15,23,42,0.85);border:1px solid ${colour};color:${colour};font-size:10px;font-weight:bold;padding:1px 5px;border-radius:4px;transform:translate(8px,-50%)">${label}</div>`,
                        className: 'asset-icon', iconSize: [0, 0]
                    }),
                    interactive: true, zIndexOffset: 1200
                }).bindPopup(`<div style="padding:10px 12px"><b>${esc(f.name)}</b> (to ${esc(f.country)})<br>${importing ? 'Importing' : exporting ? 'Exporting' : 'No flow'}: <b>${Math.abs(f.mw)} MW</b> of ${f.capacityMW} MW<div style="color:#64748b;font-size:9px;margin-top:4px">Source: Elexon (live, 5-minute)</div></div>`).addTo(layer);
            });
        }

        if (filters.has('Flood Warnings')) {
            floodWarnings.forEach(w => {
                if (typeof w.lat !== 'number' || typeof w.lng !== 'number') return;
                const severe = w.level === 1;
                L.marker([w.lat, w.lng], {
                    icon: L.divIcon({
                        html: `<div style="width:14px;height:14px;background:${severe ? '#dc2626' : '#2563eb'};border:2px solid #fff;border-radius:2px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:9px;font-weight:bold">~</div>`,
                        className: 'asset-icon', iconSize: [14, 14], iconAnchor: [7, 7]
                    }),
                    zIndexOffset: 1800, title: `${w.severity}: ${w.area}`
                }).bindPopup(`<div style="padding:10px 12px;max-width:260px"><b style="color:${severe ? '#f87171' : '#93c5fd'}">${esc(w.severity)}</b><br><b>${esc(w.area)}</b>${w.county ? `<br><span style="color:#94a3b8">${esc(w.county)}</span>` : ''}<div style="font-size:11px;margin-top:4px">${esc(w.message)}</div><div style="color:#64748b;font-size:9px;margin-top:4px">Source: Environment Agency (live)</div></div>`).addTo(layer);
            });
        }

        if (filters.has('Weather Warnings')) {
            const colours: Record<string, string> = { Red: '#dc2626', Amber: '#f59e0b', Yellow: '#facc15' };
            weatherWarnings.forEach((w, i) => {
                if (typeof w.lat !== 'number' || typeof w.lng !== 'number') return;
                const c = colours[w.level] || '#facc15';
                L.marker([w.lat + (i % 3) * 0.15, w.lng + (i % 3) * 0.15], {
                    icon: L.divIcon({
                        html: `<div style="width:0;height:0;border-left:11px solid transparent;border-right:11px solid transparent;border-bottom:19px solid ${c};filter:drop-shadow(0 0 3px #000)"></div><div style="position:absolute;top:5px;left:9px;font-size:11px;font-weight:bold;color:#000">!</div>`,
                        className: 'asset-icon', iconSize: [22, 19], iconAnchor: [11, 10]
                    }),
                    zIndexOffset: 1900, title: w.title
                }).bindPopup(`<div style="padding:10px 12px;max-width:280px"><b>${esc(w.title)}</b><div style="font-size:11px;margin-top:4px">${esc(w.description)}</div>${w.link ? `<a href="${esc(w.link)}" target="_blank" rel="noopener" style="color:#67e8f9;font-size:11px">Met Office details</a>` : ''}<div style="color:#64748b;font-size:9px;margin-top:4px">Source: Met Office. Marker shows the region, not the exact area.</div></div>`).addTo(layer);
            });
        }
    }, [interconnectorFlows, floodWarnings, weatherWarnings, filters, isMapReady]);

    const handleZoomIn = () => { mapRef.current?.zoomIn(); };
    const handleZoomOut = () => { mapRef.current?.zoomOut(); };

    return (
        <div className="relative w-full h-full z-0">
             <div ref={mapContainerRef} className="w-full h-full bg-[#0f172a] rounded-xl overflow-hidden z-0" />
             {noLocationWarning && (
                 <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-red-900/90 text-red-200 border border-red-500 px-6 py-3 rounded-lg shadow-2xl z-[60] animate-bounce flex items-center gap-3 pointer-events-none">
                     <ExclamationTriangleIcon className="w-6 h-6 text-red-400" />
                     <div className="text-center">
                         <div className="font-bold uppercase tracking-wide text-sm">Regional Impact</div>
                         <div className="text-xs text-red-300">Specific Location Unidentified</div>
                     </div>
                 </div>
             )}
             
             {isGrowthScenario && growthYear && (
                 <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[50] flex flex-col items-center animate-fadeIn pointer-events-none">
                    <div className="bg-slate-900/90 border border-green-500/50 px-8 py-4 rounded-2xl shadow-2xl backdrop-blur flex flex-col items-center gap-1">
                        <span className="text-[10px] text-green-400 uppercase font-bold tracking-[0.2em]">Timeline Sequence</span>
                        <span className="text-5xl font-black text-white tabular-nums tracking-tighter leading-none">
                            {growthYear}
                        </span>
                        <div className="w-full h-1 bg-slate-800 rounded-full mt-2 overflow-hidden">
                            <div className="h-full bg-green-500 transition-all duration-300" style={{ width: `${((day % 6) / 6) * 100}%` }}></div>
                        </div>
                    </div>
                 </div>
             )}

             <div className="absolute bottom-20 sm:bottom-8 right-3 sm:right-8 z-[50] flex flex-col gap-2">
                 <button onClick={handleZoomIn} className="w-10 h-10 bg-slate-900/90 border border-slate-700 rounded-lg text-white flex items-center justify-center hover:bg-slate-800 shadow-xl transition-all hover:scale-105 active:scale-95"><PlusIcon className="w-6 h-6" /></button>
                 <button onClick={handleZoomOut} className="w-10 h-10 bg-slate-900/90 border border-slate-700 rounded-lg text-white flex items-center justify-center hover:bg-slate-800 shadow-xl transition-all hover:scale-105 active:scale-95"><MinusIcon className="w-6 h-6" /></button>
             </div>
        </div>
    );
};

export default React.memo(MapVisualization);