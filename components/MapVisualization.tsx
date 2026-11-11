import React, { useEffect, useRef, useState, useMemo } from 'react';
import { InfrastructureAsset, RegionConfig, RiskScenario, OutageEvent, DNORegion, AssetType } from '../types';
import { ASSET_TYPES } from '../constants';
import { PlusIcon, MinusIcon, ExclamationTriangleIcon } from '@heroicons/react/24/solid';

declare global {
  namespace google.maps {
    class Map {
      constructor(mapDiv: Element | null, opts?: MapOptions);
      panTo(latLng: LatLngLiteral): void;
      setZoom(zoom: number): void;
      getCenter(): { lat: () => number; lng: () => number };
      getZoom(): number;
      fitBounds(bounds: LatLngBounds | LatLngBoundsLiteral): void;
      addListener(eventName: string, handler: Function): void;
      overlayMapTypes: MVCArray<any>;
    }
    class Marker {
      constructor(opts?: MarkerOptions);
      setMap(map: Map | null): void;
      addListener(eventName: string, handler: Function): void;
      setIcon(icon: any): void;
      getIcon(): any;
      setVisible(visible: boolean): void;
    }
    class Polyline {
      constructor(opts?: PolylineOptions);
      setMap(map: Map | null): void;
      addListener(eventName: string, handler: Function): void;
      setOptions(opts: PolylineOptions): void;
      setVisible(visible: boolean): void;
    }
    class Polygon {
      constructor(opts?: PolygonOptions);
      setMap(map: Map | null): void;
      addListener(eventName: string, handler: Function): void;
    }
    class Circle {
      constructor(opts?: CircleOptions);
      setMap(map: Map | null): void;
      setRadius(radius: number): void;
      setOptions(opts: CircleOptions): void;
      getCenter(): any;
      setCenter(center: LatLngLiteral): void;
    }
    class InfoWindow {
      constructor(opts?: InfoWindowOptions);
      open(map?: Map, anchor?: any): void;
      setContent(content: string): void;
      setPosition(position: LatLngLiteral): void;
      close(): void;
    }
    class LatLngBounds {
        constructor(sw?: LatLngLiteral, ne?: LatLngLiteral);
        extend(point: LatLngLiteral): LatLngBounds;
    }
    class Point {
        constructor(x: number, y: number);
        x: number;
        y: number;
        equals(other: Point): boolean;
        toString(): string;
    }
    class Size {
        constructor(width: number, height: number, widthUnit?: string, heightUnit?: string);
        width: number;
        height: number;
    }
    class MVCArray<T> {
        getArray(): T[];
        push(elem: T): number;
        removeAt(i: number): void;
        getLength(): number;
    }
    class ImageMapType {
        constructor(opts: ImageMapTypeOptions);
    }
    enum SymbolPath {
      CIRCLE = 0,
      BACKWARD_CLOSED_ARROW = 1
    }
    
    namespace event {
        function addListener(instance: any, eventName: string, handler: Function): any;
        function removeListener(listener: any): void;
    }

    interface MapOptions {
      center: LatLngLiteral;
      zoom: number;
      mapId?: string;
      styles?: any[];
      disableDefaultUI?: boolean;
      zoomControl?: boolean;
    }
    interface MarkerOptions {
      position: LatLngLiteral;
      map: Map;
      icon?: any;
      title?: string;
      zIndex?: number;
      visible?: boolean;
    }
    interface PolylineOptions {
      path?: LatLngLiteral[];
      geodesic?: boolean;
      strokeColor?: string;
      strokeOpacity?: number;
      strokeWeight?: number;
      map?: Map;
      zIndex?: number;
      visible?: boolean;
    }
    interface PolygonOptions {
      paths: LatLngLiteral[];
      strokeColor?: string;
      strokeOpacity?: number;
      strokeWeight?: number;
      fillColor?: string;
      fillOpacity?: number;
      map?: Map;
      zIndex?: number;
      clickable?: boolean;
    }
    interface CircleOptions {
      strokeColor?: string;
      strokeOpacity?: number;
      strokeWeight?: number;
      fillColor?: string;
      fillOpacity?: number;
      map?: Map;
      center?: LatLngLiteral;
      radius?: number;
      zIndex?: number;
      clickable?: boolean;
    }
    interface InfoWindowOptions {
      content: string;
    }
    interface LatLngLiteral {
      lat: number;
      lng: number;
    }
    interface LatLngBoundsLiteral {
        east: number;
        north: number;
        south: number;
        west: number;
    }
    interface Symbol {
        path: SymbolPath | string;
        anchor?: Point;
        fillColor?: string;
        fillOpacity?: number;
        labelOrigin?: Point;
        rotation?: number;
        scale?: number;
        strokeColor?: string;
        strokeOpacity?: number;
        strokeWeight?: number;
    }
    interface ImageMapTypeOptions {
        getTileUrl: (coord: Point, zoom: number) => string;
        tileSize: Size;
        opacity?: number;
        isPng?: boolean;
        name?: string;
        maxZoom?: number;
    }
  }
}

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

const GOOGLE_MAPS_API_KEY = "AIzaSyCA4adLS_8wPyt5ZsEamUOJrW-KmTGnuVY";

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

// Helper to generate high-contrast asset icons
const getAssetIcon = (typeDef: AssetType | undefined, color: string, isZoomed: boolean, isAffected: boolean) => {
    const finalColor = isAffected ? '#ef4444' : color;
    
    if (isZoomed && typeDef?.icon) {
        // High Zoom: Icon within Black Circle
        const strokeColor = isAffected ? '#ef4444' : '#ffffff';
        const strokeWidth = isAffected ? 3 : 1.5;
        
        // SVG String: Black Circle Background + Centered Icon
        const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="48" height="48">
            <circle cx="12" cy="12" r="11" fill="#000000" stroke="${strokeColor}" stroke-width="${strokeWidth}" />
            <g transform="translate(3.6, 3.6) scale(0.7)"> 
                <path d="${typeDef.icon}" fill="${finalColor}" />
            </g>
        </svg>`.trim();
        
        return {
            url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
            scaledSize: new google.maps.Size(32, 32),
            anchor: new google.maps.Point(16, 16),
            zIndex: isAffected ? 100 : 10
        };
    } else {
        // Low Zoom: Simple Dot
        return {
            path: google.maps.SymbolPath.CIRCLE,
            scale: isAffected ? 6 : 4,
            fillColor: finalColor,
            fillOpacity: 1,
            strokeColor: '#000000',
            strokeWeight: isAffected ? 2 : 1,
            zIndex: isAffected ? 100 : 1
        };
    }
};

const MapVisualization: React.FC<MapProps> = ({ 
    region, assets, outages, historicalOutages = [], activeScenarios, dnoRegions = [], day, filters, 
    onAssetSelect, onViewChange, currentImpact = 0, peakImpact = 1, viewOverride, isScenarioComplete
}) => {
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const [mapProvider, setMapProvider] = useState<'google' | 'leaflet' | 'loading'>('loading');
    const [noLocationWarning, setNoLocationWarning] = useState(false);
    const [currentZoom, setCurrentZoom] = useState(region.zoom);
    const [isMapReady, setIsMapReady] = useState(false);
    const [weatherTs, setWeatherTs] = useState<number | null>(null);
    
    // Refs for Map Objects (Store Map<ID, Object> for fast updates)
    const gMapRef = useRef<google.maps.Map | null>(null);
    const gAssetMarkersRef = useRef<Map<string, google.maps.Marker>>(new Map());
    const gAssetLinesRef = useRef<Map<string, google.maps.Polyline>>(new Map());
    const gOutageMarkersRef = useRef<Map<string, google.maps.Marker>>(new Map());
    const gDnoPolygonsRef = useRef<google.maps.Polygon[]>([]);
    const gWeatherLayerRef = useRef<google.maps.ImageMapType | null>(null);
    
    // Use an array to store circle references for smooth updates
    const gImpactCirclesRef = useRef<google.maps.Circle[]>([]);

    // Info Windows
    const gInfoWindowRef = useRef<google.maps.InfoWindow | null>(null);
    const gDnoInfoWindowRef = useRef<google.maps.InfoWindow | null>(null);

    const lastActiveScenarioId = useRef<string | null>(null);

    // Derived Scenario State
    const isGrowthScenario = activeScenarios.some(s => s.category === 'Growth');
    const growthYear = isGrowthScenario ? 2015 + Math.floor(day / 6) : null;

    // --- Weather Timestamp Init ---
    useEffect(() => {
        const fetchWeather = async () => {
            try {
                const res = await fetch('https://api.rainviewer.com/public/weather-maps.json');
                const data = await res.json();
                if (data.radar?.past?.length) {
                    setWeatherTs(data.radar.past[data.radar.past.length - 1].time);
                }
            } catch (e) {
                console.warn("Weather radar unavailable", e);
            }
        };
        fetchWeather();
    }, []);

    // --- Init ---
    useEffect(() => {
        if (mapProvider !== 'loading') return;
        (window as any).gm_authFailure = () => { console.error("GMaps Auth Fail"); setMapProvider('leaflet'); };
        const loadGoogleMaps = () => {
            if ((window as any).google?.maps?.Map) { setMapProvider('google'); return; }
            const script = document.createElement('script');
            script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places`;
            script.async = true; script.defer = true;
            script.onload = () => setMapProvider((window as any).google?.maps?.Map ? 'google' : 'leaflet');
            script.onerror = () => setMapProvider('leaflet');
            document.head.appendChild(script);
        };
        loadGoogleMaps();
        return () => { (window as any).gm_authFailure = undefined; };
    }, [mapProvider]);

    useEffect(() => {
        if (!mapContainerRef.current) return;
        if (mapProvider === 'google' && !gMapRef.current && (window as any).google?.maps?.Map) {
            initGoogleMap();
        } 
    }, [mapProvider]);

    // --- View Handling ---
    useEffect(() => {
        if (viewOverride && gMapRef.current) {
            gMapRef.current.panTo({ lat: viewOverride.lat, lng: viewOverride.lng });
            gMapRef.current.setZoom(viewOverride.zoom);
            setCurrentZoom(viewOverride.zoom);
        }
    }, [viewOverride]);

    useEffect(() => {
        if (activeScenarios.length > 0 || viewOverride || !gMapRef.current) return;
        gMapRef.current.panTo({ lat: region.lat, lng: region.lng });
        gMapRef.current.setZoom(region.zoom);
        setCurrentZoom(region.zoom);
    }, [region]);

    useEffect(() => {
        if (activeScenarios.length > 0 && !viewOverride && gMapRef.current) {
            const sc = activeScenarios[0];
            // If we have just started a new scenario, or it changed
            if (sc.id !== lastActiveScenarioId.current) {
                // If multiple scenarios or no location -> Zoom to Region
                if (activeScenarios.length > 1) {
                    gMapRef.current.panTo({ lat: region.lat, lng: region.lng });
                    gMapRef.current.setZoom(region.zoom);
                } else {
                    // Single scenario logic
                    if (sc.coordinates && sc.coordinates.lat) {
                        gMapRef.current.panTo({ lat: sc.coordinates.lat, lng: sc.coordinates.lng });
                        gMapRef.current.setZoom(8); // Auto-zoom to event
                    } else if (sc.locations && sc.locations.length > 0) {
                        // Center on first location
                        gMapRef.current.panTo({ lat: sc.locations[0].lat, lng: sc.locations[0].lng });
                        gMapRef.current.setZoom(8);
                    } else {
                        // Regional
                        gMapRef.current.panTo({ lat: region.lat, lng: region.lng });
                        gMapRef.current.setZoom(region.zoom);
                    }
                }
                lastActiveScenarioId.current = sc.id;
            }
        } else if (activeScenarios.length === 0) {
            lastActiveScenarioId.current = null;
            setNoLocationWarning(false);
        }
    }, [activeScenarios, viewOverride, region]);

    // --- Weather Layer Effect ---
    useEffect(() => {
        if (!gMapRef.current || !weatherTs || mapProvider !== 'google') return;
        
        const map = gMapRef.current;
        const hasWeather = filters.has('Weather Radar');

        if (hasWeather) {
            if (!gWeatherLayerRef.current) {
                gWeatherLayerRef.current = new google.maps.ImageMapType({
                    getTileUrl: (coord, zoom) => {
                        return `https://tile.cache.rainviewer.com/v2/radar/${weatherTs}/256/${zoom}/${coord.x}/${coord.y}/2/1_1.png`;
                    },
                    tileSize: new google.maps.Size(256, 256),
                    opacity: 0.6,
                    isPng: true,
                    name: 'RainViewer',
                    maxZoom: 18
                });
            }
            // Check if already added
            const arr = map.overlayMapTypes.getArray();
            if (!arr.includes(gWeatherLayerRef.current)) {
                map.overlayMapTypes.push(gWeatherLayerRef.current);
            }
        } else {
            if (gWeatherLayerRef.current) {
                const arr = map.overlayMapTypes.getArray();
                const idx = arr.indexOf(gWeatherLayerRef.current);
                if (idx > -1) {
                    map.overlayMapTypes.removeAt(idx);
                }
            }
        }
    }, [filters, weatherTs, mapProvider]);

    // --- STATIC ASSETS RENDERING (Run only when assets/filters change) ---
    useEffect(() => {
        if (mapProvider !== 'google' || !gMapRef.current || !isMapReady) return;
        
        // Clear existing static markers that are no longer in list or filtered out
        const map = gMapRef.current;
        const currentAssetIds = new Set(assets.map(a => a.id));
        
        // Remove old markers
        gAssetMarkersRef.current.forEach((marker, id) => {
            if (!currentAssetIds.has(id)) { marker.setMap(null); gAssetMarkersRef.current.delete(id); }
        });
        gAssetLinesRef.current.forEach((line, id) => {
            if (!currentAssetIds.has(id)) { line.setMap(null); gAssetLinesRef.current.delete(id); }
        });

        // Add/Update markers
        assets.forEach(asset => {
            if (typeof asset.lat !== 'number' || typeof asset.lng !== 'number' || isNaN(asset.lat) || isNaN(asset.lng)) return;

            const typeDef = ASSET_TYPES.find(t => t.id === asset.typeId);
            if (!typeDef || !filters.has(typeDef.category)) {
                // If filtered out but exists, remove
                if (gAssetMarkersRef.current.has(asset.id)) {
                    gAssetMarkersRef.current.get(asset.id)?.setMap(null);
                    gAssetMarkersRef.current.delete(asset.id);
                }
                if (gAssetLinesRef.current.has(asset.id)) {
                    gAssetLinesRef.current.get(asset.id)?.setMap(null);
                    gAssetLinesRef.current.delete(asset.id);
                }
                return;
            }

            // Handle Lines
            if (asset.path || (asset.endLat && asset.endLng)) {
                if (!gAssetLinesRef.current.has(asset.id)) {
                    const color = getVoltageColor((asset as any).rawTags) || typeDef.color;
                    const path = asset.path || [{lat: asset.lat, lng: asset.lng}, {lat: asset.endLat!, lng: asset.endLng!}];
                    const line = new google.maps.Polyline({
                        path: path,
                        geodesic: true,
                        strokeColor: color,
                        strokeOpacity: 0.6,
                        strokeWeight: 2,
                        map: map
                    });
                    line.addListener('click', () => onAssetSelect(asset));
                    gAssetLinesRef.current.set(asset.id, line);
                }
            } 
            // Handle Points
            else {
                if (!gAssetMarkersRef.current.has(asset.id)) {
                    const color = getVoltageColor((asset as any).rawTags) || typeDef.color;
                    const shouldUseIcons = currentZoom >= 10;
                    
                    const marker = new google.maps.Marker({
                        position: { lat: asset.lat, lng: asset.lng },
                        map: map,
                        title: asset.name,
                        icon: getAssetIcon(typeDef, color, shouldUseIcons, false)
                    });
                    marker.addListener('click', () => onAssetSelect(asset));
                    gAssetMarkersRef.current.set(asset.id, marker);
                }
            }
        });

        // DNO Regions (Simple redraw)
        gDnoPolygonsRef.current.forEach(p => p.setMap(null));
        gDnoPolygonsRef.current = [];
        if (filters.has('DNO Regions') && dnoRegions) {
            dnoRegions.forEach(dno => {
                const polygon = new google.maps.Polygon({
                    paths: dno.path,
                    strokeColor: dno.color,
                    strokeOpacity: 0.8,
                    strokeWeight: 2,
                    fillColor: dno.color,
                    fillOpacity: 0.15,
                    map: map,
                    zIndex: 1,
                    clickable: true
                });
                polygon.addListener('click', (e: any) => {
                    if (gDnoInfoWindowRef.current) {
                        gDnoInfoWindowRef.current.setContent(`<div style="color:black"><b>${dno.name}</b><br>${dno.operator}</div>`);
                        gDnoInfoWindowRef.current.setPosition(e.latLng);
                        gDnoInfoWindowRef.current.open(map);
                    }
                });
                gDnoPolygonsRef.current.push(polygon);
            });
        }

    }, [assets, filters, mapProvider, dnoRegions, isMapReady]); 

    // --- ZOOM LEVEL ICONS (Run when zoom changes) ---
    useEffect(() => {
        if (!gMapRef.current || mapProvider !== 'google') return;
        
        const shouldUseIcons = currentZoom >= 10;
        
        gAssetMarkersRef.current.forEach((marker, id) => {
            const asset = assets.find(a => a.id === id);
            if (!asset) return;
            const typeDef = ASSET_TYPES.find(t => t.id === asset.typeId);
            const color = getVoltageColor((asset as any).rawTags) || typeDef?.color || '#fff';
            
            const isAffected = activeScenarios.some(s => s.affectedAssets.includes(id)) && day > 0;
            
            marker.setIcon(getAssetIcon(typeDef, color, shouldUseIcons, isAffected));
        });
    }, [currentZoom, assets]); 

    // --- DYNAMIC UPDATES (Run on simulation tick) ---
    useEffect(() => {
        if (!gMapRef.current || mapProvider !== 'google') return;

        const affectedAssetIds = new Set(activeScenarios.flatMap(s => s.affectedAssets));
        const timelineYear = isGrowthScenario ? (growthYear || 9999) : 9999;
        
        // 1. Asset Visibility (Growth Timeline) & Style Updates
        gAssetMarkersRef.current.forEach((marker, id) => {
            const asset = assets.find(a => a.id === id);
            const line = gAssetLinesRef.current.get(id);
            if (!asset) return;

            // Visibility Logic: Hide future assets in Growth Scenario
            let isVisible = true;
            if (isGrowthScenario) {
                if (asset.commissionYear && asset.commissionYear > timelineYear) {
                    isVisible = false;
                }
            }
            marker.setVisible(isVisible);
            if (line) line.setVisible(isVisible);

            // Style Logic
            if (isVisible) {
                const isAffected = affectedAssetIds.has(id);
                const isCritical = day > 0 && isAffected;
                
                const typeDef = ASSET_TYPES.find(t => t.id === asset.typeId);
                const baseColor = getVoltageColor((asset as any)?.rawTags) || typeDef?.color || '#fff';
                const shouldUseIcons = currentZoom >= 10;

                if (isGrowthScenario) {
                    // Growth: Use Green for all (simulating active/good state)
                    const growthColor = '#10b981'; // Green-500
                    marker.setIcon(getAssetIcon(typeDef, isCritical ? growthColor : baseColor, shouldUseIcons, false));
                    if (line) {
                        line.setOptions({ strokeColor: isCritical ? growthColor : baseColor, strokeWeight: isCritical ? 4 : 2, zIndex: isCritical ? 10 : 1 });
                    }
                } else {
                    // Disaster: Use Red for affected
                    marker.setIcon(getAssetIcon(typeDef, baseColor, shouldUseIcons, isCritical));
                    if (line) {
                        line.setOptions({ strokeColor: isCritical ? '#ef4444' : baseColor, strokeWeight: isCritical ? 4 : 2, zIndex: isCritical ? 10 : 1 });
                    }
                }
            }
        });

        // 2. SMOOTH Impact Circle Update Logic
        // Instead of clearing circles, update existing ones to prevent flicker
        if (!isScenarioComplete && activeScenarios.length > 0 && !isGrowthScenario && (currentImpact || 0) > 0) {
            const targets: {lat: number, lng: number, radius: number}[] = [];
            const combinedImpact = currentImpact || 0;
            
            // Calculate targets
            if (activeScenarios.length > 1) {
                let center = { lat: region.lat, lng: region.lng };
                if (region.id === 'UK') center = { lat: 52.4862, lng: -1.8904 };
                targets.push({ ...center, radius: Math.sqrt(combinedImpact) * 100 }); 
            } else {
                const sc = activeScenarios[0];
                if (sc.locations && sc.locations.length > 0) {
                    const splitImpact = Math.max(combinedImpact / sc.locations.length, 100);
                    sc.locations.forEach(loc => {
                        targets.push({ lat: loc.lat, lng: loc.lng, radius: Math.sqrt(splitImpact) * 40 });
                    });
                } else if (sc.coordinates && sc.coordinates.lat) {
                    targets.push({ ...sc.coordinates, radius: Math.sqrt(combinedImpact) * 40 });
                } else {
                    let center = { lat: region.lat, lng: region.lng };
                    if (region.id === 'UK') center = { lat: 52.4862, lng: -1.8904 };
                    targets.push({ ...center, radius: Math.sqrt(combinedImpact) * 100 });
                }
            }

            const ratio = peakImpact > 0 ? (currentImpact || 0) / peakImpact : 0;
            const opacity = 0.2 + (ratio * 0.3);

            // Reconcile targets with existing circles
            // Ensure we have enough circles
            while (gImpactCirclesRef.current.length < targets.length) {
                const circle = new google.maps.Circle({
                    strokeColor: '#ef4444',
                    strokeOpacity: 0.3,
                    strokeWeight: 1,
                    fillColor: '#ef4444',
                    fillOpacity: opacity, 
                    map: gMapRef.current,
                    zIndex: 2,
                    clickable: false
                });
                gImpactCirclesRef.current.push(circle);
            }

            // Remove excess circles
            while (gImpactCirclesRef.current.length > targets.length) {
                const removed = gImpactCirclesRef.current.pop();
                if (removed) removed.setMap(null);
            }

            // Update existing circles
            targets.forEach((target, i) => {
                const circle = gImpactCirclesRef.current[i];
                if (circle) {
                    // Updating properties on existing instance is smooth
                    circle.setCenter({ lat: target.lat, lng: target.lng });
                    circle.setRadius(target.radius);
                    circle.setOptions({ fillOpacity: opacity });
                }
            });

        } else {
            // Cleanup if inactive
            gImpactCirclesRef.current.forEach(c => c.setMap(null));
            gImpactCirclesRef.current = [];
        }

    }, [day, currentImpact, activeScenarios, assets, currentZoom, isScenarioComplete, growthYear, isGrowthScenario, region]); 

    // --- OUTAGES (Separate Effect) ---
    useEffect(() => {
        if (!gMapRef.current || !isMapReady || mapProvider !== 'google') return;
        
        gOutageMarkersRef.current.forEach(m => m.setMap(null));
        gOutageMarkersRef.current.clear();

        const map = gMapRef.current;
        const allOutages = [...outages, ...(historicalOutages || [])];
        const OUTAGE_PATH = "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h-2l3-7v6h2l-3 7z"; 

        allOutages.forEach(outage => {
             if (typeof outage.lat !== 'number' || typeof outage.lng !== 'number' || isNaN(outage.lat) || isNaN(outage.lng)) return;

             const marker = new google.maps.Marker({
                position: { lat: outage.lat, lng: outage.lng },
                map: map,
                icon: {
                    path: OUTAGE_PATH,
                    scale: 1.5,
                    fillColor: '#ef4444',
                    fillOpacity: 1,
                    strokeWeight: 1,
                    strokeColor: '#ffffff',
                    anchor: new google.maps.Point(12, 12)
                },
                title: `Outage: ${outage.locationName}`,
                zIndex: 200
            });
            
            marker.addListener('click', () => {
                if (gInfoWindowRef.current) {
                    gInfoWindowRef.current.setContent(`
                        <div style="color:black; min-width: 200px;">
                            <h3 style="font-weight: bold; margin-bottom:4px; color:#b91c1c;">⚠️ ${outage.locationName}</h3>
                            <p style="font-size:12px; margin:0;">${outage.description}</p>
                            <p style="font-size:12px; font-weight:bold; margin-top:4px;">Affected: ${outage.consumersAffected.toLocaleString()}</p>
                            <p style="font-size:10px; color:#555;">Status: ${outage.status}</p>
                            <p style="font-size:10px; color:#555;">Source: ${outage.source}</p>
                        </div>
                    `);
                    gInfoWindowRef.current.setPosition({ lat: outage.lat, lng: outage.lng });
                    gInfoWindowRef.current.open(map);
                }
            });

            gOutageMarkersRef.current.set(outage.id, marker);
        });

    }, [outages, historicalOutages, isMapReady, mapProvider]);

    const initGoogleMap = () => {
        if (!(window as any).google?.maps?.Map) return;
        const { Map, InfoWindow } = (window as any).google.maps;
        gMapRef.current = new Map(mapContainerRef.current, {
            center: { lat: region.lat, lng: region.lng },
            zoom: region.zoom,
            mapId: 'DEMO_MAP_ID',
            styles: [
                { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
                { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
                { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
                { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] },
                { featureType: "water", elementType: "geometry", stylers: [{ color: "#17263c" }] },
            ],
            disableDefaultUI: true,
            zoomControl: false, 
        });
        gInfoWindowRef.current = new InfoWindow();
        gDnoInfoWindowRef.current = new InfoWindow();
        
        setIsMapReady(true); 

        gMapRef.current.addListener('idle', () => {
            if (gMapRef.current) {
                const z = gMapRef.current.getZoom();
                const c = gMapRef.current.getCenter();
                if (z !== currentZoom) setCurrentZoom(z);
                if (onViewChange && c) onViewChange({ lat: c.lat(), lng: c.lng(), zoom: z });
            }
        });
    };

    const handleZoomIn = () => { gMapRef.current?.setZoom(gMapRef.current.getZoom() + 1); };
    const handleZoomOut = () => { gMapRef.current?.setZoom(gMapRef.current.getZoom() - 1); };

    return (
        <div className="relative w-full h-full z-0">
             <div ref={mapContainerRef} className="w-full h-full bg-[#0f172a] rounded-xl overflow-hidden" />
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