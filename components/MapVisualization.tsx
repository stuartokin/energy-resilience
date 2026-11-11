import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { InfrastructureAsset, RegionConfig, RiskScenario, OutageEvent, DNORegion, AssetType } from '../types';
import { ASSET_TYPES } from '../constants';
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
}

const getVoltageColor = (tags: any) => {
    if (!tags || !tags.voltage) return null;
    const vStr = String(tags.voltage).replace(/[^0-9]/g, ''); 
    const v = parseInt(vStr);
    if (isNaN(v)) return null;

    if (v >= 380000 || (v >= 380 && v < 500)) return '#a855f7'; 
    if (v >= 300000 || (v >= 300 && v < 380)) return '#ec4899'; 
    if (v >= 270000 || (v >= 270 && v < 300)) return '#1e40af'; 
    if (v >= 130000 || (v >= 130 && v < 270)) return '#0ea5e9'; 
    if (v >= 30000 || (v >= 30 && v < 130)) return '#16a34a';   
    if (v >= 10000 || (v >= 10 && v < 30)) return '#f59e0b';    
    
    return '#64748b'; 
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
    const finalColor = isAffected ? '#ef4444' : color;
    const key = `${typeDef?.id}|${finalColor}|${isZoomed && !!typeDef?.icon}|${isAffected}`;
    const cached = iconCache.get(key);
    if (cached) return cached;

    let icon: L.DivIcon;
    if (isZoomed && typeDef?.icon) {
        const strokeColor = isAffected ? '#ef4444' : '#ffffff';
        const strokeWidth = isAffected ? 3 : 1.5;
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32">
            <circle cx="12" cy="12" r="11" fill="#000000" stroke="${strokeColor}" stroke-width="${strokeWidth}" />
            <g transform="translate(3.6, 3.6) scale(0.7)"><path d="${typeDef.icon}" fill="${finalColor}" /></g>
        </svg>`;
        icon = L.divIcon({ html: svg, className: 'asset-icon', iconSize: [32, 32], iconAnchor: [16, 16] });
    } else {
        const size = isAffected ? 12 : 8;
        const border = isAffected ? 2 : 1;
        icon = L.divIcon({
            html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${finalColor};border:${border}px solid #000;box-sizing:content-box"></div>`,
            className: 'asset-icon',
            iconSize: [size + border * 2, size + border * 2],
            iconAnchor: [(size + border * 2) / 2, (size + border * 2) / 2]
        });
    }
    iconCache.set(key, icon);
    return icon;
};

const OUTAGE_ICON = L.divIcon({
    html: '<div class="outage-dot"></div>',
    className: 'outage-icon',
    iconSize: [20, 20],
    iconAnchor: [10, 10]
});

const MapVisualization: React.FC<MapProps> = ({ 
    region, assets, outages, historicalOutages = [], activeScenarios, dnoRegions = [], day, filters, 
    onAssetSelect, onViewChange, currentImpact = 0, peakImpact = 1, viewOverride, isScenarioComplete
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
                if (last) setWeather({ host: data.host || 'https://tilecache.rainviewer.com', path: last.path || `/v2/radar/${last.time}` });
            } catch (e) {
                console.warn("Weather radar unavailable", e);
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
        L.tileLayer(BASEMAP_URL, { attribution: BASEMAP_ATTRIBUTION, maxNativeZoom: 16, maxZoom: 19, className: 'basemap-tiles' }).addTo(map);
        // Place-name labels sit above the infrastructure so towns stay readable
        map.createPane('labels');
        const labelsPane = map.getPane('labels');
        if (labelsPane) { labelsPane.style.zIndex = '450'; labelsPane.style.pointerEvents = 'none'; }
        L.tileLayer(LABELS_URL, { pane: 'labels', maxNativeZoom: 16, maxZoom: 19, opacity: 0.7 }).addTo(map);
        outageLayerRef.current = L.layerGroup().addTo(map);
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
                        color, opacity: 0.6, weight: 2
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
                polygon.bindPopup(`<div style="padding:10px 12px"><b>${esc(dno.name)}</b><br><span style="color:#94a3b8">${esc(dno.operator)}</span></div>`);
                polygon.addTo(dnoLayer);
                polygon.bringToBack();
            });
        }
    }, [assets, filters, dnoRegions, isMapReady]);

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
            const marker = L.marker([outage.lat, outage.lng], {
                icon: OUTAGE_ICON,
                title: `Outage: ${outage.locationName}`,
                zIndexOffset: 2000
            });
            marker.bindPopup(`
                <div style="min-width:200px;padding:10px 12px">
                    <div style="font-weight:bold;margin-bottom:4px;color:#f87171">&#9888; ${esc(outage.locationName)}</div>
                    <div style="font-size:12px">${esc(outage.description)}</div>
                    <div style="font-size:12px;font-weight:bold;margin-top:4px">Affected: ${Number(outage.consumersAffected || 0).toLocaleString()}</div>
                    <div style="font-size:10px;color:#94a3b8">Status: ${esc(outage.status)}</div>
                    <div style="font-size:10px;color:#94a3b8">Source: ${esc(outage.source)}</div>
                </div>`);
            marker.addTo(layer);
        });
    }, [outages, historicalOutages, isMapReady]);

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

             <div className="absolute bottom-8 right-8 z-[50] flex flex-col gap-2">
                 <button onClick={handleZoomIn} className="w-10 h-10 bg-slate-900/90 border border-slate-700 rounded-lg text-white flex items-center justify-center hover:bg-slate-800 shadow-xl transition-all hover:scale-105 active:scale-95"><PlusIcon className="w-6 h-6" /></button>
                 <button onClick={handleZoomOut} className="w-10 h-10 bg-slate-900/90 border border-slate-700 rounded-lg text-white flex items-center justify-center hover:bg-slate-800 shadow-xl transition-all hover:scale-105 active:scale-95"><MinusIcon className="w-6 h-6" /></button>
             </div>
        </div>
    );
};

export default React.memo(MapVisualization);