
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
    RegionConfig, InfrastructureAsset, RiskScenario, TimelineStep, OutageEvent, GenerationMix, DNORegion, GeneratorOutage 
} from './types';
import { 
    REGIONS, UK_ASSETS_SEED, ASSET_TYPES, INITIAL_SCENARIOS, UK_DNO_REGIONS
} from './constants';
import { 
    fetchEnergyInfrastructure, generateRiskScenarios, 
    generateVideoReportScript, generateNarratedAudio, generateSlideshowImages, fetchRealTimeOutages,
    getApiSystemStatus, fetchNESOPowerData, fetchGenerationMix,
    searchInfrastructureAssets, loadDnoBoundaries, fetchGeneratorOutages, outageCoverageNow
} from './services/geminiService';
import MapVisualization from './components/MapVisualization';
import ChatPanel from './components/ChatPanel';
import AssetDetails from './components/AssetDetails';
import ScenarioManager from './components/ScenarioManager';
import TimelineControl from './components/TimelineControl';
import TourGuide from './components/TourGuide';
import OutageListModal from './components/OutageListModal';
import HelpModal from './components/HelpModal';
import ReportModal from './components/ReportModal';
import { useLayout, clearSavedLayout, applyFontSize, getFontSize, FONT_SIZES } from './components/layout';
import { statusOf } from './services/health';
import GridHistoryModal from './components/GridHistoryModal';
import AiKeyModal from './components/AiKeyModal';
import LiveSystemsPanel from './components/LiveSystemsPanel';
import EnergyFlowsPanel from './components/EnergyFlowsPanel';
import ReportBuilder from './components/ReportBuilder';
import { useWindows, AppMode, WinDef, FloatingWindow, SidePanel, MinimisedTray, ToolRail, PhoneSheet, PhoneTabs } from './components/shell/windows';
import { OverviewPanel, ElectricityPanel, OutagesPanel } from './components/panels/LivePanels';
import { ScenarioLibraryPanel, ResultsPanel, ScenarioModelPanel } from './components/panels/ScenarioPanels';
import { buildFlows, GW_PER_MCMD } from './services/flows';
import { adoptProposal } from './content/scenarios';
import { HistorySettings, DEFAULT_HISTORY } from './components/panels/HistoryPanel';
import { SavedView, listViews, saveNamedView, deleteNamedView, downloadView, readViewFile, viewLink, viewFromHash } from './services/views';
const HistoryPanel = React.lazy(() => import('./components/panels/HistoryPanel'));
const ConcentrationPanel = React.lazy(() => import('./components/panels/ConcentrationPanel'));
const HowItsBuilt = React.lazy(() => import('./components/HowItsBuilt'));
import { captionsFor, resolveRoutes, fleetOf, CutRoute, footprintOf } from './services/footprint';
import { buildTimeline } from './services/impactModel';
import { fetchInterconnectorFlows, fetchRegionalCarbon, fetchFloodWarnings, fetchGasSnapshot, fetchWeatherWarnings, fetchSystemWarnings, InterconnectorFlow, RegionalCarbon, FloodWarning, GasSnapshot, WeatherWarning, SystemWarning } from './services/liveSystems';
import { hasAiKey, onAiKeyChange, onAiKeyRequired } from './services/aiKey';

import { 
    BoltIcon, ExclamationTriangleIcon, 
    ArrowPathIcon, InformationCircleIcon, VideoCameraIcon, DocumentTextIcon,
    FunnelIcon, 
    QuestionMarkCircleIcon, PrinterIcon, SignalIcon, 
    
    ListBulletIcon, ChatBubbleLeftRightIcon, WrenchScrewdriverIcon, 
    ChartBarIcon, MapIcon, 
    MagnifyingGlassIcon, StopIcon, CloudIcon, SparklesIcon, ArrowsRightLeftIcon
    , ClockIcon, ScaleIcon, PresentationChartLineIcon, CubeTransparentIcon
} from '@heroicons/react/24/solid';

type ChartMode = 'normal' | 'minimal' | 'hidden';

const LOADING_QUIPS = [
    "Greasing the turbines...",
    "Convincing electrons to move faster...",
    "Polishing solar panels...",
    "Syncing 50Hz hum...",
    "Deploying backup hamsters...",
    "Searching for loose cables...",
    "Consulting the Grid Code...",
    "Diverting power to forward shields...",
    "Optimizing voltage sag...",
    "Calibrating flux capacitors...",
    "Rerouting interconnector traffic...",
    "Waking up the control room...",
    "Counting the coal...",
    "Asking the wind to blow harder..."
];

// Isolated Timer Component to prevent App re-renders
const UpdateTimer = React.memo(({ onTrigger, isPaused, intervalMinutes }: { onTrigger: () => void, isPaused: boolean, intervalMinutes: number }) => {
    const [seconds, setSeconds] = useState(intervalMinutes * 60);

    // Reset when interval changes
    useEffect(() => {
        setSeconds(intervalMinutes * 60);
    }, [intervalMinutes]);

    useEffect(() => {
        if (isPaused) return;
        const interval = setInterval(() => {
            setSeconds(prev => {
                if (prev <= 1) {
                    onTrigger();
                    return intervalMinutes * 60;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(interval);
    }, [isPaused, onTrigger, intervalMinutes]);

    useEffect(() => {
        if (!isPaused) setSeconds(intervalMinutes * 60);
    }, [isPaused, intervalMinutes]);

    const display = seconds > 60 ? `${Math.ceil(seconds / 60)}m` : `${seconds}s`;

    return (
        <div className="flex flex-col items-start leading-none">
            <span className="text-xs font-bold text-cyan-400">Data Sync</span>
            <span className="text-[10px] text-slate-400 font-mono">Next: {display}</span>
        </div>
    );
});

// Panel Configuration for Pinning
export const App: React.FC = () => {
    const { mode: layoutMode, activeSheet, setActiveSheet } = useLayout();
    const [fontPx, setFontPx] = useState<number>(getFontSize());
    // Saved views, presentation mode, history chart settings, How it's built
    const [historySettings, setHistorySettings] = useState<HistorySettings>(() => { try { return { ...DEFAULT_HISTORY, ...JSON.parse(localStorage.getItem('energy_resilience_history_v1') || '{}') }; } catch { return DEFAULT_HISTORY; } });
    useEffect(() => { try { localStorage.setItem('energy_resilience_history_v1', JSON.stringify(historySettings)); } catch { /* not remembered */ } }, [historySettings]);
    const [presenting, setPresenting] = useState(false);
    const [showBuilt, setShowBuilt] = useState(false);
    const [views, setViews] = useState<SavedView[]>(listViews);
    const [viewName, setViewName] = useState('');
    const [viewMsg, setViewMsg] = useState('');
    const lastMapView = useRef<{ lat: number; lng: number; zoom: number } | null>(null);
    const changeFont = (dir: 1 | -1) => {
        const i = FONT_SIZES.indexOf(fontPx);
        const next = FONT_SIZES[Math.min(FONT_SIZES.length - 1, Math.max(0, (i < 0 ? 3 : i) + dir))];
        setFontPx(next);
        applyFontSize(next);
    };
    // --- STATE ---
    const [activeRegion, setActiveRegion] = useState<RegionConfig>(REGIONS[0]); // Default UK
    const [assets, setAssets] = useState<InfrastructureAsset[]>(UK_ASSETS_SEED);
    const [scenarios, setScenarios] = useState<RiskScenario[]>(INITIAL_SCENARIOS);
    const [liveOutages, setLiveOutages] = useState<OutageEvent[]>([]);
    // Live system feeds (interconnectors, regional carbon, floods, gas, weather), refreshed every 5 minutes
    const [icFlows, setIcFlows] = useState<InterconnectorFlow[]>([]);
    const [regionalCarbon, setRegionalCarbon] = useState<Record<string, RegionalCarbon>>({});
    const [floods, setFloods] = useState<{ warnings: FloodWarning[], alerts: number } | null>(null);
    const [gas, setGas] = useState<GasSnapshot | null>(null);
    const [weatherWarnings, setWeatherWarnings] = useState<WeatherWarning[]>([]);
    const [systemWarnings, setSystemWarnings] = useState<SystemWarning[]>([]);
    const [liveSystemsUpdated, setLiveSystemsUpdated] = useState<Date | null>(null);
    const energyFlows = useMemo(() => buildFlows(icFlows, gas), [icFlows, gas]);
    // Scenario map extras: routes cut (frozen when the run starts, so "largest route" doesn't move mid-run),
    // fleet highlight, "Place it" mode, and the footprint size reported back by the map
    const [cutRoutes, setCutRoutes] = useState<CutRoute[]>([]);
    const [placing, setPlacing] = useState<RiskScenario | null>(null);
    const [footprintInfo, setFootprintInfo] = useState<{ units: number; source: 'gsp' | 'dno' | 'none' }>({ units: 0, source: 'none' });
    useEffect(() => {
        const load = async () => {
            await Promise.allSettled([
                fetchInterconnectorFlows().then(setIcFlows),
                fetchRegionalCarbon().then(setRegionalCarbon),
                fetchFloodWarnings().then(setFloods),
                fetchGasSnapshot().then(setGas),
                fetchWeatherWarnings().then(setWeatherWarnings),
                fetchSystemWarnings().then(setSystemWarnings),
                fetchGenerationMix().then(m => { if (m) setGenerationMix(m); }),
            ]);
            setLiveSystemsUpdated(new Date());
        };
        load();
        const id = setInterval(load, 300000);
        return () => clearInterval(id);
    }, []);

    // Power station / interconnector outages from Elexon REMIT, refreshed every 5 minutes
    const [generatorOutages, setGeneratorOutages] = useState<GeneratorOutage[]>([]);
    useEffect(() => {
        const load = () => fetchGeneratorOutages().then(setGeneratorOutages).catch(() => {});
        load();
        const id = setInterval(load, 300000);
        return () => clearInterval(id);
    }, []);
    const [historicalOutages, setHistoricalOutages] = useState<OutageEvent[]>([]);
    const [showHistorical, setShowHistorical] = useState(false);
    const [nesoData, setNesoData] = useState<{ demand: number, frequency: number, carbonIntensity: number, estimated?: boolean }>({ demand: 0, frequency: 50.0, carbonIntensity: 0 });
    const [generationMix, setGenerationMix] = useState<GenerationMix | null>(null);
    const [lastOutageCheck, setLastOutageCheck] = useState<Date>(new Date());
    const [isOutageRefreshing, setIsOutageRefreshing] = useState(false);
    
    // Background Task Status
    const [backgroundTask, setBackgroundTask] = useState<string | null>(null);
    const [allowBackgroundUpdates, setAllowBackgroundUpdates] = useState(true);
    const [updateInterval, setUpdateInterval] = useState(1);
    
    // Deep Update State
    const [deepUpdateStatus, setDeepUpdateStatus] = useState<string | null>(null);
    const cancelDeepUpdateRef = useRef<boolean>(false);

    // Cache Refs for Quick Reset
    const lastLoadedRegionIdRef = useRef<string | null>(null);
    const lastZoomLevelRef = useRef<number>(6);
    
    // Simulation State
    const [activeScenarios, setActiveScenarios] = useState<RiskScenario[]>([]);
    const [timeline, setTimeline] = useState<TimelineStep[]>([]);
    const [currentDay, setCurrentDay] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [playbackSpeed, setPlaybackSpeed] = useState(1);
    const [chartMode, setChartMode] = useState<ChartMode>('normal');
    
    // UI Interactions
    const [selectedAsset, setSelectedAsset] = useState<InfrastructureAsset | null>(null);
    const [visibleLayers, setVisibleLayers] = useState<Set<string>>(new Set(['Generation', 'Transmission', 'Interconnector', 'Distribution', 'Retail', 'DNO Regions', 'Power Cuts', 'Generator Outages', 'Flood Warnings', 'Weather Warnings', 'Interconnector Flows', 'Data coverage']));
    const [mapCenterOverride, setMapCenterOverride] = useState<{lat: number, lng: number, zoom: number} | null>(null);
    const [customAssetQuery, setCustomAssetQuery] = useState("");
    const [isSearchingAssets, setIsSearchingAssets] = useState(false);
    
    // Modals & Panels
    const [showScenarioManager, setShowScenarioManager] = useState(false);
    const [showOutageList, setShowOutageList] = useState(false);
    const [historyModalMetric, setHistoryModalMetric] = useState<'demand' | 'frequency' | null>(null);
    
    // Pinning & Window Management State
    
    const [showHelp, setShowHelp] = useState(false);

    // Visitor-supplied Gemini key (stored only in their browser)
    const [aiEnabled, setAiEnabled] = useState<boolean>(hasAiKey());
    const [showAiKey, setShowAiKey] = useState(false);
    useEffect(() => {
        const offChange = onAiKeyChange(() => setAiEnabled(hasAiKey()));
        const offReq = onAiKeyRequired(() => setShowAiKey(true));
        return () => { offChange(); offReq(); };
    }, []);
    const requireAi = () => {
        if (hasAiKey()) return true;
        setShowAiKey(true);
        return false;
    };
    const [helpInitialTab, setHelpInitialTab] = useState<'guide' | 'status' | 'logs'>('guide');
    
    // Loading State
    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState<string>("");
    const [loadingQuip, setLoadingQuip] = useState<string>("");
    const [loadingProgress, setLoadingProgress] = useState<number>(0);
    const abortControllerRef = useRef<AbortController | null>(null);
    const reportAbortRef = useRef<boolean>(false);
    
    const [isTourActive, setIsTourActive] = useState(false);
    const [showStartupToast, setShowStartupToast] = useState(false);

    // Reporting
    const [showReportModal, setShowReportModal] = useState(false);
    const [showPrintPreview, setShowPrintPreview] = useState(false);
    const [generatedScript, setGeneratedScript] = useState("");
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [reportImages, setReportImages] = useState<string[]>([]);


    // Specific Reporting Progress
    const [isGeneratingReport, setIsGeneratingReport] = useState(false);
    const [reportGenerationStep, setReportGenerationStep] = useState(0); // 0: Idle, 1: Script, 2: Audio, 3: Visuals, 4: Done

    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const currentDayRef = useRef(0);
    currentDayRef.current = currentDay;
    const mapDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastFetchCenterRef = useRef<{lat: number, lng: number} | null>(null);
    const lastActiveScenarioId = useRef<string | null>(null);
    const lastInteractionTime = useRef<number>(Date.now());

    // --- HELPER: System Health ---
    const getSystemHealthColor = () => {
        if (!navigator.onLine) return 'red';
        const statuses = getApiSystemStatus();
        const checked = statuses.filter(s => s.status === 'Operational' || s.status === 'Unavailable');
        const down = checked.filter(s => s.status === 'Unavailable').length;
        const hasDegraded = down > 0 || statuses.some(s => s.status === 'Degraded' || s.status === 'No coverage'); // any area without live data keeps the dot amber
        const hasDown = checked.length > 0 && down >= Math.ceil(checked.length / 2);
        
        if (hasDown) return 'red';
        if (hasDegraded) return 'amber';
        return 'green';
    };
    
    // Force re-render of health status periodically or when data fetches
    const [systemHealth, setSystemHealth] = useState<'green' | 'amber' | 'red'>('green');
    
    useEffect(() => {
        setSystemHealth(getSystemHealthColor());
    }, [liveOutages, assets, lastOutageCheck, liveSystemsUpdated, nesoData]); // re-check when any feed updates

    // --- LOGIC: Asset Live Status ---
    const calculateAssetStatus = (mix: GenerationMix, currentAssets: InfrastructureAsset[]): InfrastructureAsset[] => {
        const getFuelPerc = (fuel: string) => mix.generation.find(g => g.fuel === fuel)?.perc || 0;
        
        const fuelMap: Record<string, string[]> = {
            'nuclear': ['nuclear'],
            'wind': ['wind_onshore', 'wind_offshore'],
            'solar': ['solar'],
            'gas': ['gas'],
            'hydro': ['hydro'],
            'coal': ['coal'],
            'biomass': ['biomass']
        };

        return currentAssets.map(asset => {
            // No unit-level availability feed is wired in, so never invent maintenance outages.
            const maintenanceOverride = false;

            const genType = Object.keys(fuelMap).find(key => fuelMap[key].includes(asset.typeId));
            
            let status: 'generating' | 'standby' | 'offline' = 'standby';
            let operationalStatus = asset.status;

            if (maintenanceOverride) {
                operationalStatus = 'Maintenance';
                status = 'offline';
            } else if (genType) {
                const perc = getFuelPerc(genType);
                
                if (genType === 'nuclear') status = 'generating'; 
                else if (perc > 10) status = 'generating';
                else if (perc > 0) status = 'generating';
                else status = 'standby';
            }

            return {
                ...asset,
                status: operationalStatus,
                liveStatus: status,
                liveOutputDesc: status === 'generating' 
                    ? `Fuel type supplying ${getFuelPerc(genType || '')}% of GB mix (estimate)` 
                    : status === 'standby' ? 'Available (Standby)' : 'Unavailable (Maintenance)'
            };
        });
    };

    const assetsRef = useRef(assets);
    useEffect(() => { assetsRef.current = assets; }, [assets]);

    const performUnifiedUpdate = useCallback(async () => {

        // Routine refresh runs silently (no banner).
        
        try {
            const neso = await fetchNESOPowerData();
            setNesoData(neso);
            
            const mix = await fetchGenerationMix();
            if (mix) setGenerationMix(mix);
            
            const outages = await fetchRealTimeOutages(activeRegion.name);
            setLiveOutages(outages);
            setLastOutageCheck(new Date());

            // Local infrastructure is loaded only when someone zooms in (see handleViewChange),
            // never on this timer, so we don't keep hitting the free OpenStreetMap servers.
            let updatedAssets = assetsRef.current;

            if (mix) {
                updatedAssets = calculateAssetStatus(mix, updatedAssets);
            }

            if (updatedAssets !== assetsRef.current) {
                setAssets(updatedAssets);
            }
            
            setBackgroundTask(null);

        } catch (e: any) {
            console.warn("Unified update silent fail", e);
            setBackgroundTask(null);
        }
    }, [activeRegion]); 

    // --- EFFECTS ---

    useEffect(() => {
        // Funny Loading Quips
        if (isLoading) {
            setLoadingQuip(LOADING_QUIPS[Math.floor(Math.random() * LOADING_QUIPS.length)]);
            const interval = setInterval(() => {
                setLoadingQuip(LOADING_QUIPS[Math.floor(Math.random() * LOADING_QUIPS.length)]);
            }, 3500);
            return () => clearInterval(interval);
        }
    }, [isLoading]);

    useEffect(() => {
        // Startup Notification
        setTimeout(() => {
            setShowStartupToast(true);
            setTimeout(() => setShowStartupToast(false), 8000);
        }, 1500);

        const saved = localStorage.getItem('custom_scenarios');
        if (saved) {
            try {
                // Older AI drafts carried AI-supplied numbers: turn them back into proposals that need a sourced pattern
                const parsed = (JSON.parse(saved) as RiskScenario[]).map(s => (!s.model && /^AI draft/.test(s.rationale || '')
                    ? { ...s, status: 'Proposal' as const, peakConsumersAffected: 0, durationDays: 0, coordinates: undefined, locations: [], rationale: s.rationale!.replace(/^AI draft \(not checked\):/, 'AI proposal (not checked):').replace(/ Impact over time uses the simple default shape\.$/, '') }
                    : s));
                setScenarios(prev => {
                    const existingIds = new Set(prev.map(s => s.id));
                    const uniqueSaved = parsed.filter((s: RiskScenario) => !existingIds.has(s.id));
                    return [...prev, ...uniqueSaved];
                });
            } catch(e: any) { console.error("Failed to load scenarios", e); }
        }
    }, []);

    useEffect(() => {
        const userScenarios = scenarios.filter(s => s.status === 'User' || s.status === 'Proposal' || s.isUserCreated);
        if (userScenarios.length > 0) {
            localStorage.setItem('custom_scenarios', JSON.stringify(userScenarios));
        }
    }, [scenarios]);

    useEffect(() => {
        const pollInitialData = async () => {
            const neso = await fetchNESOPowerData();
            setNesoData(neso);
            const mix = await fetchGenerationMix();
            setGenerationMix(mix);
            if (mix) {
                 // Functional update so we never overwrite assets loaded in the meantime
                 setAssets(prev => prev.length > 0 ? calculateAssetStatus(mix, prev) : prev);
            }
        };
        pollInitialData();
    }, []);

    useEffect(() => {
        loadDataForRegion();
    }, [activeRegion]);

    // MAP AUTO-ZOOM LOGIC
    useEffect(() => {
        if (activeScenarios.length > 0 && !mapCenterOverride) {
            const sc = activeScenarios[0];
            if (sc.id !== lastActiveScenarioId.current) {
                const hasCoords = sc.coordinates && sc.coordinates.lat !== 0;
                const isGenericLocation = hasCoords && (
                    Math.abs(sc.coordinates!.lat - activeRegion.lat) < 0.01 && 
                    Math.abs(sc.coordinates!.lng - activeRegion.lng) < 0.01
                );

                // The map fits the camera to the scenario's footprint (MapVisualization); only fly here if it can't
                if (hasCoords && !isGenericLocation && !sc.footprint) {
                    setMapCenterOverride({ lat: sc.coordinates!.lat, lng: sc.coordinates!.lng, zoom: 9 });
                }
                lastActiveScenarioId.current = sc.id;
            }
        } else if (activeScenarios.length === 0) {
            lastActiveScenarioId.current = null;
        }
    }, [activeScenarios, activeRegion, mapCenterOverride]);

    useEffect(() => {
        if (isPlaying && activeScenarios.length > 0) {
            // Playback dwells where things change: steps where customers go off or come back, and steps with a
            // caption, get more time, so the red haze and lights going out can be seen. About 22 s in total at 1x.
            const peak = Math.max(1, ...timeline.map(t => t.consumersOffline));
            const capSteps = new Set(captionsFor(activeScenarios, timeline).map(c => timeline.findIndex(t => (t.hours ?? t.day) >= c.atHours - 1e-6)));
            const w = timeline.map((t, i) => 1 + (i > 0 ? 8 * Math.abs(t.consumersOffline - timeline[i - 1].consumersOffline) / peak : 0) + (capSteps.has(i) ? 4 : 0));
            const base = 22000 / Math.max(1, w.reduce((a, x) => a + x, 0));
            const tick = () => {
                const i = currentDayRef.current; // follows seeks made while playing
                if (i >= timeline.length - 1) { setIsPlaying(false); setChartMode('normal'); return; }
                timerRef.current = setTimeout(() => {
                    const next = Math.min(timeline.length - 1, currentDayRef.current + 1);
                    currentDayRef.current = next;
                    setCurrentDay(next);
                    tick();
                }, Math.max(120, (base * (w[i + 1] ?? 1)) / playbackSpeed));
            };
            tick();
        } else if (timerRef.current) {
            clearTimeout(timerRef.current);
        }
        return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }, [isPlaying, activeScenarios, timeline, playbackSpeed]);

    const cancelDeepUpdate = () => {
        cancelDeepUpdateRef.current = true;
        setDeepUpdateStatus(null);
    };

    const loadDataForRegion = async () => {
        if (activeRegion.id === lastLoadedRegionIdRef.current && assets.length > 0) {
             return;
        }
        lastLoadedRegionIdRef.current = activeRegion.id;
        const regionId = activeRegion.id;

        // 1. Show the map straight away with the built-in assets and scenarios.
        const seedAssets = activeRegion.id === 'UK' ? UK_ASSETS_SEED : [];
        setAssets(generationMix ? calculateAssetStatus(generationMix, seedAssets) : seedAssets);
        setScenarios(prev => {
            const existingUser = prev.filter(s => s.status === 'User' || s.status === 'Proposal' || s.isUserCreated);
            const seed = activeRegion.id === 'UK' ? INITIAL_SCENARIOS : [];
            const unique = new Map();
            [...seed, ...existingUser].forEach(s => unique.set(s.id, s));
            return Array.from(unique.values());
        });

        // 2. Live grid data (fast, open data).
        fetchNESOPowerData().then(setNesoData).catch(() => {});
        const mixPromise = fetchGenerationMix().then(mix => { setGenerationMix(mix); return mix; }).catch(() => null);

        // 3. Fuller infrastructure from OpenStreetMap in the background (can be slow).
        setBackgroundTask(`Loading infrastructure from OpenStreetMap...`);
        try {
            const enriched = await fetchEnergyInfrastructure(activeRegion.name, seedAssets, undefined, activeRegion.lat, activeRegion.lng, 'all');
            if (lastLoadedRegionIdRef.current !== regionId) return; // region changed meanwhile
            const mix = await mixPromise;
            setAssets(mix ? calculateAssetStatus(mix, enriched) : enriched);
        } catch (e: any) {
            console.warn("Infrastructure load failed", e);
        }
        setBackgroundTask(null);

        // 4. Live power cuts (UKPN open data; plus AI web search if a key is set).
        if (lastLoadedRegionIdRef.current !== regionId) return;
        try {
            const outages = await fetchRealTimeOutages(activeRegion.name);
            setLiveOutages(outages);
            setLastOutageCheck(new Date());
        } catch (e) { console.warn("Outage load failed", e); }

        // AI scenarios are no longer generated automatically: visitors ask for proposals in the Library.
    };

    const loadedAreasRef = useRef<{ lat: number, lng: number }[]>([]);
    const handleViewChange = useCallback((center: { lat: number, lng: number, zoom: number }) => {
        lastMapView.current = center;
        setMapCenterOverride(null); 
        lastInteractionTime.current = Date.now();
        lastFetchCenterRef.current = { lat: center.lat, lng: center.lng };
        
        // Auto-fetch details on stable zoom in
        // Load local detail once per area (areas already loaded are skipped).
        const alreadyLoaded = loadedAreasRef.current.some(a => Math.abs(a.lat - center.lat) < 0.15 && Math.abs(a.lng - center.lng) < 0.25);
        // Not needed when the weekly map tiles are available - they already contain all local infrastructure
        const tilesLoaded = statusOf('tiles').status === 'Operational';
        if (center.zoom >= 11 && allowBackgroundUpdates && !alreadyLoaded && !tilesLoaded) {
            if (mapDebounceRef.current) clearTimeout(mapDebounceRef.current);
            mapDebounceRef.current = setTimeout(async () => {
                loadedAreasRef.current.push({ lat: center.lat, lng: center.lng });
                setBackgroundTask("Loading local infrastructure from OpenStreetMap...");
                try {
                    const localAssets = await fetchEnergyInfrastructure(
                        activeRegion.name,
                        assetsRef.current,
                        undefined,
                        center.lat,
                        center.lng,
                        'local_only'
                    );
                    if (localAssets.length > assetsRef.current.length) {
                        const final = generationMix ? calculateAssetStatus(generationMix, localAssets) : localAssets;
                        setAssets(final);
                    }
                    // Fetch outages for this view
                    const viewOutages = await fetchRealTimeOutages(activeRegion.name);
                    setLiveOutages(viewOutages); 
                } catch(e: any) {}
                setBackgroundTask(null);
            }, 1000);
        }
        lastZoomLevelRef.current = center.zoom;

    }, [activeRegion.name, allowBackgroundUpdates, generationMix]);

    const handleQuickOutageRefresh = async (e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        setIsOutageRefreshing(true);
        const outages = await fetchRealTimeOutages(activeRegion.name);
        setLiveOutages(outages);
        setLastOutageCheck(new Date());
        setIsOutageRefreshing(false);
    };

    const handleCustomAssetSearch = async () => {
        if (!requireAi()) return;
        if (!customAssetQuery.trim()) return;
        setIsSearchingAssets(true);
        setBackgroundTask(`Searching for "${customAssetQuery}"...`);
        
        // Use map center if available, else region center
        const lat = lastFetchCenterRef.current?.lat || activeRegion.lat;
        const lng = lastFetchCenterRef.current?.lng || activeRegion.lng;

        const newAssets = await searchInfrastructureAssets(customAssetQuery, lat, lng);
        
        if (newAssets.length > 0) {
            // Merge assets
            setAssets(prev => {
                const combined = [...prev];
                // Avoid duplicates by ID
                const existingIds = new Set(prev.map(a => a.id));
                newAssets.forEach(a => {
                    if (!existingIds.has(a.id)) combined.push(a);
                });
                return combined;
            });
            // Ensure Custom is visible
            setVisibleLayers(prev => new Set(prev).add('Custom'));
            setCustomAssetQuery("");
        }
        
        setBackgroundTask(null);
        setIsSearchingAssets(false);
    };

    const handleUpdateData = async () => {
        setIsLoading(true);
        setLoadingProgress(0);
        setLoadingMessage("Manual Deep Search Initiated: Querying High Voltage Grid...");
        
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        try {
            await new Promise(r => setTimeout(r, 500));
            if (signal.aborted) return;
            setLoadingProgress(10);

            let enriched = await fetchEnergyInfrastructure(
                activeRegion.name, 
                assets, 
                (status) => {
                    setLoadingMessage(status);
                    setLoadingProgress(prev => Math.min(prev + 5, 60));
                },
                activeRegion.lat,
                activeRegion.lng,
                'all',
                signal
            );
            
            if (generationMix) {
                enriched = calculateAssetStatus(generationMix, enriched);
            }
            setAssets(enriched);
            setLoadingProgress(70);

            if (signal.aborted) return;

            setLoadingMessage("Updating Live Incident & NESO Data...");
            const outages = await fetchRealTimeOutages(activeRegion.name);
            setLiveOutages(outages);
            setLastOutageCheck(new Date());
            
            const neso = await fetchNESOPowerData();
            setNesoData(neso);
            const mix = await fetchGenerationMix();
            setGenerationMix(mix);

            setLoadingProgress(90);
            setLoadingMessage("Visualization Refreshed.");
            setLoadingProgress(100);
            setTimeout(() => setIsLoading(false), 500);
        } catch (e: any) {
            if (e.name === 'AbortError') {
                console.log("Update cancelled");
            } else {
                console.error(e);
                setIsLoading(false);
            }
        } finally {
            abortControllerRef.current = null;
        }
    };

    const handleCancelUpdate = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        setIsLoading(false);
    };

    const handleHomeView = () => {
        setActiveRegion(prev => ({...prev}));
        setMapCenterOverride({ lat: activeRegion.lat, lng: activeRegion.lng, zoom: activeRegion.zoom });
    };

    const handleResetSystem = async () => {
        setActiveScenarios([]);
        setIsPlaying(false);
        setTimeline([]);
        setChartMode('normal');
        setVisibleLayers(new Set(['Generation', 'Transmission', 'Interconnector', 'Distribution', 'Retail', 'DNO Regions', 'Power Cuts', 'Generator Outages', 'Flood Warnings', 'Weather Warnings', 'Interconnector Flows', 'Data coverage']));
        setActiveRegion(prev => ({...prev}));
        setMapCenterOverride({ lat: activeRegion.lat, lng: activeRegion.lng, zoom: activeRegion.zoom });
        
        // Reset Layout to Defaults (including sizes and zoom saved in this browser)
        clearSavedLayout();
    };

    const handleGenerateMoreScenarios = useCallback(async () => {
        if (!requireAi()) return;
        setIsLoading(true);
        setLoadingProgress(20);
        setLoadingMessage("AI: looking for scenario ideas (proposals only)...");
        try {
            const newScenarios = await generateRiskScenarios(activeRegion.name, assets);
            setLoadingProgress(80);
            setScenarios(prev => [...prev, ...newScenarios]);
        } catch (e: any) {
             console.error("Failed to generate scenarios", e);
        }
        setLoadingProgress(100);
        setTimeout(() => setIsLoading(false), 200);
    }, [activeRegion.name, assets]);

    const handleRunSimulation = useCallback(async (selected: RiskScenario[], startMinimized: boolean) => {
        if (selected.length === 0) return;
        setIsLoading(true);
        setLoadingProgress(0);
        setLoadingMessage("Calculating Impact...");
        // Transparent impact model (services/impactModel.ts): no AI, no random numbers
        const mergedTimeline = buildTimeline(selected);
        setLoadingProgress(50);

        setTimeline(mergedTimeline);
        setActiveScenarios(selected);
        setCurrentDay(0);
        setChartMode(startMinimized ? 'minimal' : 'normal');

        setLoadingProgress(100);
        setTimeout(() => {
            setIsLoading(false);
            setShowScenarioManager(false);
            setIsPlaying(true);
        }, 300);
    }, []);

    const handleGenerateReport = async () => {
        if (!requireAi()) return;
        if (activeScenarios.length === 0) return;
        setIsGeneratingReport(true);
        setReportGenerationStep(1); 
        reportAbortRef.current = false;
        
        const primaryScenario = activeScenarios[0]; 
        
        // Step 1
        const script = await generateVideoReportScript(primaryScenario); 
        if (reportAbortRef.current) { setIsGeneratingReport(false); return; }
        setGeneratedScript(script);
        setReportGenerationStep(2); 
        
        // Step 2
        const audio = await generateNarratedAudio(script);
        if (reportAbortRef.current) { setIsGeneratingReport(false); return; }
        setAudioUrl(audio);
        setReportGenerationStep(3); 
        
        // Step 3
        const imgs = await generateSlideshowImages(primaryScenario.name);
        if (reportAbortRef.current) { setIsGeneratingReport(false); return; }
        setReportImages(imgs);
        setReportGenerationStep(4); 
        
        setTimeout(() => {
            if (!reportAbortRef.current) {
                setIsGeneratingReport(false);
                setShowReportModal(true);
                setReportGenerationStep(0);
            }
        }, 800);
    };

    const handleCancelReportGeneration = () => {
        reportAbortRef.current = true;
        setIsGeneratingReport(false);
        setReportGenerationStep(0);
    };


    const handleQuickExport = () => {
        if (activeScenarios.length === 0) return;
        const data = {
            scenarios: activeScenarios,
            timeline: timeline,
            generatedAt: new Date().toISOString()
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `simulation_data_${Date.now()}.json`;
        a.click();
    };

    const toggleLayer = (category: string) => {
        const next = new Set(visibleLayers);
        if (next.has(category)) next.delete(category);
        else next.add(category);
        setVisibleLayers(next);
    };

    const handleMapAction = useCallback((lat: number, lng: number, zoom: number) => {
        setMapCenterOverride({ lat, lng, zoom });
    }, []);

    // Real DNO licence-area boundaries (NESO open data, built at deploy time); rough outlines as fallback.
    const [ukDnoRegions, setUkDnoRegions] = useState<DNORegion[]>(UK_DNO_REGIONS);
    useEffect(() => {
        loadDnoBoundaries().then(regions => { if (regions.length) setUkDnoRegions(regions); });
    }, []);
    const memoizedDnoRegions = useMemo(() => activeRegion.id === 'UK' ? ukDnoRegions : [], [activeRegion.id, ukDnoRegions]);

    const cleanedScriptForPrint = useMemo(() => {
        return generatedScript
            .replace(/\*\*/g, '')
            .replace(/EXECUTIVE SUMMARY:|SCENARIO ANALYSIS:|CREDIBILITY & SOURCES:|PROJECTED IMPACT:|\[.*?\]/g, '')
            .trim();
    }, [generatedScript]);

    // Use currentDay data if available, otherwise use last available data (for total cost)
    const isScenarioComplete = useMemo(() => {
        if (timeline.length === 0) return false;
        // Consider complete if we hit end of timeline
        return currentDay >= timeline.length - 1;
    }, [currentDay, timeline]);

    // Tour: each step opens the part of the app it describes (components/TourGuide.tsx)
    const handleTourStep = (step: string) => {
        setShowScenarioManager(false);
        setShowHelp(false);
        setShowReport(false);
        setSelectedAsset(null);
        switch (step) {
            case 'intro': switchMode('live'); break;
            case 'live': switchMode('live'); openWin('overview', 'live'); break;
            case 'map': switchMode('live'); openWin('layers', 'live'); break;
            case 'flows': openWin('flows', 'live'); break;
            case 'history': switchMode('live'); openWin('concentration', 'live'); break;
            case 'library': switchMode('scenarios'); openWin('library', 'scenarios'); break;
            case 'run': {
                switchMode('scenarios');
                const demo = scenarios.find(s => s.id === 'st_windstorm_north');
                if (!activeScenarios.length && demo) runScenarios([demo]);
                else openWin('results', 'scenarios');
                break;
            }
            case 'results': switchMode('scenarios'); openWin('results', 'scenarios'); break;
            case 'ai': openWin('analyst'); break;
            case 'report': if (layoutMode === 'phone') setActiveSheet(null); break;
            case 'help': setHelpInitialTab('guide'); setShowHelp(true); break;
        }
    };

    // --- Z-INDEX & PINNING LOGIC ---
    
    const maintenanceAssets = useMemo(() => {
        return assets.filter(a => a.status === 'Maintenance');
    }, [assets]);

    const standbyAssets = useMemo(() => {
        return assets.filter(a => a.liveStatus === 'standby');
    }, [assets]);

    // ================= Layout: modes and windows (v4) =================
    const [appMode, setAppMode] = useState<AppMode>('live');
    const win = useWindows();
    const [showReport, setShowReport] = useState(false);
    const [overlayPanel, setOverlayPanel] = useState<string | null>(null); // tablet: side panel slides over the map
    const mapAreaRef = useRef<HTMLDivElement>(null);

    // Open a window wherever it lives on this screen size
    const openWin = (id: string, mode: AppMode = appMode) => {
        if (mode !== appMode) setAppMode(mode);
        if (layoutMode === 'phone') { setActiveSheet(id); return; }
        win.open(id, mode);
        if (layoutMode === 'tablet' && win.stateOf(id) !== 'floating') setOverlayPanel(id);
    };
    const switchMode = (m: AppMode) => {
        setAppMode(m);
        setActiveSheet(null);
        setOverlayPanel(null);
        if (m === 'scenarios' && layoutMode !== 'phone') win.setActive('scenarios', activeScenarios.length ? 'results' : 'library');
    };
    // While a scenario runs, live clutter is hidden so more of GB can be seen (Layers puts any of it back)
    const SCENARIO_HIDES = ['Power Cuts', 'Generator Outages', 'Retail', 'Data coverage'];
    const hiddenForScenario = useRef<string[] | null>(null);
    const runScenarios = (all: RiskScenario[]) => {
        // AI proposals can't run until a sourced pattern has been chosen for their numbers
        const sel = all.filter(s => !(s.status === 'Proposal' && !s.model));
        if (!sel.length) { openWin('library'); return; }
        if (hiddenForScenario.current === null) {
            const hid = SCENARIO_HIDES.filter(l => visibleLayers.has(l));
            hiddenForScenario.current = hid;
            if (hid.length) setVisibleLayers(prev => { const n = new Set(prev); hid.forEach(l => n.delete(l)); return n; });
        }
        handleRunSimulation(sel, false);
        setAppMode('scenarios');
        if (layoutMode === 'phone') setActiveSheet('results');
        else { win.open('results', 'scenarios'); if (layoutMode === 'tablet') setOverlayPanel('results'); }
    };
    const handleStopSimulation = () => {
        setActiveScenarios([]);
        setIsPlaying(false);
        setTimeline([]);
        setCurrentDay(0);
        setCutRoutes([]);
        setPlacing(null);
        const hid = hiddenForScenario.current;
        hiddenForScenario.current = null;
        if (hid?.length) setVisibleLayers(prev => { const n = new Set(prev); hid.forEach(l => n.add(l)); return n; });
    };
    const scenarioKey = activeScenarios.map(s => s.id).join(',');
    useEffect(() => {
        if (!activeScenarios.length) { setCutRoutes([]); return; }
        if (cutRoutes.length && cutRoutes.every(r => energyFlows.links.some(l => l.id === r.id))) return;
        setCutRoutes(resolveRoutes(activeScenarios, energyFlows.links));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scenarioKey, energyFlows.links.length > 0]);
    const cutSet = useMemo(() => new Set(cutRoutes.map(r => r.id)), [cutRoutes]);
    const fleet = useMemo(() => fleetOf(activeScenarios), [scenarioKey]);
    const stepHours = timeline[currentDay]?.hours ?? currentDay;
    const captions = useMemo(() => captionsFor(activeScenarios, timeline), [scenarioKey, timeline]);
    const caption = [...captions].reverse().find(c => c.atHours <= stepHours + 1e-6);
    // "Place it": the next map click sets where a local scenario happens
    const startPlacing = (sc: RiskScenario) => {
        setPlacing(sc);
        if (layoutMode === 'phone') setActiveSheet(null);
        if (layoutMode === 'tablet') setOverlayPanel(null);
    };
    const adopt = (id: string, patternId: string) => setScenarios(prev => prev.map(s => (s.id === id ? (adoptProposal(s, patternId) || s) : s)));
    const discard = (id: string) => setScenarios(prev => {
        const next = prev.filter(s => s.id !== id);
        try { localStorage.setItem('custom_scenarios', JSON.stringify(next.filter(s => s.status === 'User' || s.status === 'Proposal' || s.isUserCreated))); } catch { /* storage unavailable */ }
        return next;
    });
    const handlePlace = (p: { lat: number; lng: number; label: string }) => {
        const sc = placing;
        if (!sc) return;
        setPlacing(null);
        const fp = footprintOf(sc);
        const placed: RiskScenario = {
            ...sc, id: `${sc.id}__placed`, name: `${sc.name} (${p.label})`,
            coordinates: { lat: p.lat, lng: p.lng },
            events: undefined, // real-event captions don't apply to a location you chose
            footprint: { ...fp, areas: { point: { lat: p.lat, lng: p.lng, label: `Placed by you ${p.label}` } }, pattern: fp.pattern === 'scatter' ? 'spread' : (fp.pattern || 'spread'), placedAt: p.label },
        };
        runScenarios([placed]);
    };
    const handleVideoBriefing = () => {
        if (!activeScenarios.length) { openWin('library', 'scenarios'); return; }
        handleGenerateReport();
    };
    const resetLayout = () => { win.reset(); clearSavedLayout(); setOverlayPanel(null); };

    // ---------- Saved views ----------
    const currentView = (name: string): SavedView => ({
        app: 'energy-resilience', kind: 'view', version: 1, name: name || 'My view', savedAt: new Date().toISOString(),
        mode: appMode, windows: win.snapshot(), layers: [...visibleLayers], map: lastMapView.current || undefined, fontPx, history: historySettings, presenting,
    });
    const applyView = (v: SavedView) => {
        win.restore(v.windows);
        if (v.mode !== appMode) setAppMode(v.mode);
        setVisibleLayers(new Set(v.layers));
        if (v.map) setMapCenterOverride(v.map);
        if (v.fontPx) { setFontPx(v.fontPx); applyFontSize(v.fontPx); }
        if (v.history) setHistorySettings(v.history);
        setPresenting(!!v.presenting);
        setViewMsg(`Loaded "${v.name}"`);
    };
    useEffect(() => {
        const v = viewFromHash();
        if (v) { applyView(v); history.replaceState(null, '', location.pathname + location.search); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const fileInput = useRef<HTMLInputElement>(null);

    // ---------- Presentation mode: map only, big captions, keyboard control ----------
    useEffect(() => {
        if (!presenting) return;
        const onKey = (e: KeyboardEvent) => {
            if ((e.target as HTMLElement)?.closest?.('input, textarea, select')) return;
            if (e.key === 'Escape') { setPresenting(false); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); }
            if (!timeline.length) return;
            if (e.key === ' ') { e.preventDefault(); setIsPlaying(p => !p); }
            if (e.key === 'ArrowRight') setCurrentDay(d => Math.min(timeline.length - 1, d + 1));
            if (e.key === 'ArrowLeft') setCurrentDay(d => Math.max(0, d - 1));
            if (e.key === 'Home') setCurrentDay(0);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [presenting, timeline.length]);
    const startPresenting = () => {
        setPresenting(true);
        setSelectedAsset(null);
        document.documentElement.requestFullscreen?.().catch(() => {});
    };

    const coverageNow = outageCoverageNow();
    const feedsLive = `${coverageNow.filter(c => c.ok).length} of ${coverageNow.length} networks live · no data: ${coverageNow.filter(c => !c.ok).map(c => c.area.split(',')[0]).join(', ')}`;
    const chatPanel = (
        <ChatPanel embedded
            isOpen={true}
            activeScenarios={activeScenarios}
            assetCount={assets.length}
            regionName={activeRegion.name}
            nesoData={nesoData}
            outages={[...liveOutages, ...(showHistorical ? historicalOutages : [])]}
            onMapAction={handleMapAction}
            generationMix={generationMix}
            systemWarningsSummary={systemWarnings.length ? systemWarnings.slice(0, 5).map(w => `${w.type} (${w.published}): ${w.text.slice(0, 200)}`).join(' | ') : ''}
            liveSystemsSummary={[
                icFlows.length ? `Interconnector flows (MW, +import/-export): ${icFlows.map(f => `${f.name} ${f.mw}`).join(', ')}` : '',
                gas ? `Gas NTS: demand ${gas.ntsDemand} mcm/d, supply ${gas.totalSupply} mcm/d, linepack ${gas.linepack} mcm, to power stations ${gas.powerStations} mcm/d` : '',
                energyFlows.hasGasDetail ? `Gas by route (mcm/d, +into GB/-out): ${energyFlows.links.filter(l => l.kind === 'gas').map(l => `${l.name} [${l.group}] ${l.value}`).join(', ')}. Imports (Norway pipeline + LNG + continent) ≈ ${energyFlows.gasImportShare !== null ? Math.round(energyFlows.gasImportShare * 100) : '?'}% of supply; St Fergus is mixed UK/Norway. Energy equivalents: electricity in ${energyFlows.elecImportGW.toFixed(1)} GW / out ${energyFlows.elecExportGW.toFixed(1)} GW; gas imported ${energyFlows.gasImportGW.toFixed(0)} GW (at 39.5 MJ/m3)` : '',
                `Met Office warnings: ${weatherWarnings.length ? weatherWarnings.map(w => `${w.level} ${w.type} - ${w.region}`).join('; ') : 'none'}`,
                floods ? `EA flood warnings (England): ${floods.warnings.length} warnings (${floods.warnings.filter(w => w.level === 1).length} severe), ${floods.alerts} alerts${floods.warnings.length ? ': ' + floods.warnings.slice(0, 8).map(w => w.area).join('; ') : ''}` : '',
                Object.keys(regionalCarbon).length ? `Regional carbon intensity (gCO2/kWh): ${Object.entries(regionalCarbon).map(([k, v]) => `${k} ${v.intensity}`).join(', ')}` : '',
            ].filter(Boolean).join('\n- ')}
            generatorOutagesSummary={generatorOutages.length ? `${generatorOutages.length} active notices, ${Math.round(generatorOutages.reduce((a, g) => a + g.unavailableMW, 0))} MW unavailable in total (${Math.round(generatorOutages.filter(g => !g.planned).reduce((a, g) => a + g.unavailableMW, 0))} MW unplanned). Largest: ${generatorOutages.slice(0, 8).map(g => `${g.siteName || g.unit} ${g.unit} ${g.fuelType} ${Math.round(g.unavailableMW)}MW ${g.planned ? 'planned' : 'UNPLANNED'} (${g.cause})`).join('; ')}` : ''}
            timelineNow={activeScenarios.length > 0 && timeline[currentDay] ? `${timeline[currentDay].label || 'step ' + currentDay}: ${timeline[currentDay].consumersOffline.toLocaleString()} customers off supply, ${timeline[currentDay].restorationPct}% restored, cost so far £${timeline[currentDay].costMillions}m` : ''}
        />
    );

    const layerButton = (cat: string, label: React.ReactNode, swatch: React.ReactNode, title?: string) => (
        <button key={cat} type="button" onClick={() => toggleLayer(cat)} aria-pressed={visibleLayers.has(cat)} title={title}
            className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-semibold border ${visibleLayers.has(cat) ? 'bg-slate-800 text-white border-slate-700' : 'text-slate-500 border-transparent hover:text-slate-300'}`}>
            {swatch}{label}
        </button>
    );
    const layersContent = (
        <div className="space-y-3">
            <label className="flex lg:hidden items-center gap-2 bg-slate-900 border border-slate-700 rounded-lg px-2.5 h-9">
                <MagnifyingGlassIcon className="w-4 h-4 text-slate-500" />
                <span className="sr-only">Search assets</span>
                <input value={customAssetQuery} onChange={e => setCustomAssetQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleCustomAssetSearch()} placeholder="Search assets (e.g. airports)" className="flex-1 bg-transparent text-xs text-white outline-none" />
            </label>
            <div>
                <div className="text-[10px] font-bold text-slate-400 tracking-wider mb-1">INFRASTRUCTURE</div>
                {['Generation', 'Transmission', 'Distribution', 'Interconnector', 'Retail'].map(cat => layerButton(cat, cat === 'Retail' ? 'Data centres' : cat, <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ASSET_TYPES.find(t => t.category === cat)?.color || '#fff' }} />))}
                {visibleLayers.has('Custom') && layerButton('Custom', 'Search results', <span className="w-2.5 h-2.5 bg-rose-500" />)}
                {layerButton('DNO Regions', 'Network operator areas', <span className="w-2.5 h-2.5 rounded-full border border-slate-400" />)}
                {layerButton('Data coverage', 'Data gaps (no live power-cut feed)', <span className="w-2.5 h-2.5 border border-amber-400" style={{ background: 'repeating-linear-gradient(135deg, rgba(251,191,36,0.7) 0 2px, transparent 2px 4px)' }} />, 'Hatched areas have no open live power-cut feed, so cuts there will not appear on the map.')}
            </div>
            <div>
                <div className="text-[10px] font-bold text-slate-400 tracking-wider mb-1">LIVE LAYERS</div>
                {layerButton('Interconnector Flows', 'Energy flows (power and gas)', <span className="w-2.5 h-2.5 rounded-full bg-gradient-to-r from-cyan-400 to-amber-500" />)}
                {layerButton('Power Cuts', 'Power cuts', <span className="w-2.5 h-2.5 rounded-full bg-red-500" />, 'Live power cuts from the network operators')}
                {layerButton('Generator Outages', 'Generator outages', <span className="text-[8px] px-1 rounded border border-amber-500 bg-amber-900 text-amber-200 leading-tight">MW</span>, 'Elexon REMIT. Amber = unplanned.')}
                {layerButton('Flood Warnings', 'Flood warnings', <span className="w-2.5 h-2.5 bg-blue-500" />)}
                {layerButton('Weather Warnings', 'Weather warnings', <span className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-b-[9px] border-b-yellow-400" />)}
                {layerButton('Weather Radar', 'Weather radar', <CloudIcon className="w-3.5 h-3.5 text-cyan-400" />)}
            </div>
            <p className="text-[10px] text-slate-500">Zoom in to see local substations, lines, solar farms and batteries. Map legend: Help → Map legend.</p>
        </div>
    );

    const toolsContent = (
        <div className="space-y-3 text-xs">
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-2">
                <b>Views</b>
                <p className="text-[11px] text-slate-400">Save the whole set-up: windows and where they are, mode, map layers and position, text size and History chart settings.</p>
                <div className="flex gap-2">
                    <label className="flex-1"><span className="sr-only">View name</span>
                        <input value={viewName} onChange={e => setViewName(e.target.value)} placeholder="Name (e.g. Morning check)" className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-[11px] text-white outline-none" /></label>
                    <button type="button" onClick={() => { const v = currentView(viewName.trim() || `View ${views.length + 1}`); saveNamedView(v); setViews(listViews()); setViewMsg(`Saved "${v.name}" in this browser`); setViewName(''); }}
                        className="px-3 py-1.5 rounded-lg bg-cyan-700 hover:bg-cyan-600 text-white font-semibold">Save</button>
                </div>
                {views.length > 0 && (
                    <ul className="space-y-1">
                        {views.map(v => (
                            <li key={v.name} className="flex items-center gap-2 bg-slate-950/60 rounded px-2 py-1">
                                <button type="button" onClick={() => applyView(v)} className="flex-1 text-left truncate text-slate-200 hover:text-white" title={`Saved ${v.savedAt.slice(0, 16).replace('T', ' ')}`}>{v.name}</button>
                                <button type="button" onClick={() => downloadView(v)} className="text-[10px] text-slate-400 hover:text-white">File</button>
                                <button type="button" onClick={() => { navigator.clipboard?.writeText(viewLink(v)).then(() => setViewMsg('Link copied')).catch(() => setViewMsg('Could not copy the link')); }} className="text-[10px] text-slate-400 hover:text-white">Link</button>
                                <button type="button" onClick={() => { deleteNamedView(v.name); setViews(listViews()); }} aria-label={`Delete ${v.name}`} className="text-[10px] text-slate-500 hover:text-red-300">✕</button>
                            </li>
                        ))}
                    </ul>
                )}
                <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => downloadView(currentView(viewName.trim() || 'My view'))} className="py-1.5 rounded-lg border border-slate-700 hover:border-slate-500">Save to file</button>
                    <button type="button" onClick={() => fileInput.current?.click()} className="py-1.5 rounded-lg border border-slate-700 hover:border-slate-500">Load from file</button>
                    <button type="button" onClick={() => { navigator.clipboard?.writeText(viewLink(currentView(viewName.trim() || 'Shared view'))).then(() => setViewMsg('Link copied: it opens this exact view')).catch(() => setViewMsg('Could not copy the link')); }} className="py-1.5 rounded-lg border border-slate-700 hover:border-slate-500">Copy link</button>
                    <button type="button" onClick={startPresenting} className="py-1.5 rounded-lg border border-red-800 text-red-200 hover:border-red-600">Present</button>
                </div>
                <input ref={fileInput} type="file" accept="application/json,.json" className="hidden" onChange={async e => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; const v = await readViewFile(f); if (v) applyView(v); else setViewMsg('That file is not a saved view from this app'); }} />
                {viewMsg && <p className="text-[11px] text-cyan-300" role="status">{viewMsg}</p>}
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-2">
                <div className="flex justify-between items-center"><b>Data refresh</b>
                    <button type="button" onClick={() => setAllowBackgroundUpdates(!allowBackgroundUpdates)} className={`text-[11px] font-bold px-2 py-1 rounded border ${allowBackgroundUpdates ? 'bg-green-900/30 text-green-400 border-green-800' : 'bg-red-900/30 text-red-400 border-red-800'}`}>{allowBackgroundUpdates ? 'LIVE' : 'PAUSED'}</button>
                </div>
                <label className="block text-[11px] text-slate-400">Every {updateInterval} min
                    <input type="range" min="1" max="60" step="1" value={updateInterval} onChange={e => setUpdateInterval(Number(e.target.value))} disabled={!allowBackgroundUpdates} className="w-full accent-cyan-500" />
                </label>
                <button type="button" onClick={handleUpdateData} className="w-full flex items-center justify-center gap-2 bg-cyan-900/30 hover:bg-cyan-900/50 text-cyan-200 border border-cyan-500/30 py-2 rounded-lg font-semibold"><ArrowPathIcon className="w-3.5 h-3.5" /> Refresh everything now</button>
            </div>
            {maintenanceAssets.length > 0 && <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
                <b>Engineering work</b>
                {maintenanceAssets.map(a => <button key={a.id} type="button" onClick={() => { setSelectedAsset(a); setMapCenterOverride({ lat: a.lat, lng: a.lng, zoom: 14 }); }} className="w-full text-left text-[11px] px-1.5 py-1 rounded hover:bg-slate-800 truncate">{a.name}</button>)}
            </div>}
            {standbyAssets.length > 0 && <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
                <b>Standby capacity</b>
                <div className="max-h-32 overflow-y-auto custom-scrollbar">
                    {standbyAssets.map(a => <button key={a.id} type="button" onClick={() => { setSelectedAsset(a); setMapCenterOverride({ lat: a.lat, lng: a.lng, zoom: 14 }); }} className="w-full flex justify-between text-[11px] px-1.5 py-1 rounded hover:bg-slate-800"><span className="truncate">{a.name}</span><span className="text-slate-500 font-mono">{a.capacityMW} MW</span></button>)}
                </div>
            </div>}
            <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setIsTourActive(true)} className="py-2 rounded-lg border border-slate-700 hover:border-slate-500">Take the tour</button>
                <button type="button" onClick={() => { setHelpInitialTab('guide'); setShowHelp(true); }} className="py-2 rounded-lg border border-slate-700 hover:border-slate-500">Help and sources</button>
                <button type="button" onClick={resetLayout} className="py-2 rounded-lg border border-slate-700 hover:border-slate-500">Reset window layout</button>
                <button type="button" onClick={async () => { await handleResetSystem(); resetLayout(); setAppMode('live'); }} className="py-2 rounded-lg border border-red-900 text-red-300 hover:text-white">Reset everything</button>
            </div>
        </div>
    );

    const windowDefs: WinDef[] = [
        { id: 'overview', title: 'Live system', short: 'Overview', colour: '#22c55e', icon: SignalIcon, modes: ['live'], width: 420,
          content: <OverviewPanel neso={nesoData} mix={generationMix} flows={energyFlows} gas={gas} outages={liveOutages} generatorOutages={generatorOutages} warnings={systemWarnings} feedsLive={feedsLive} onHistory={setHistoryModalMetric} onOpen={id => openWin(id)} /> },
        { id: 'electricity', title: 'Electricity', short: 'Power', colour: '#eab308', icon: BoltIcon, modes: ['live'], width: 420,
          content: <ElectricityPanel mix={generationMix} neso={nesoData} carbon={regionalCarbon} assets={assets} onHistory={setHistoryModalMetric} onSelect={a => { setSelectedAsset(a); setMapCenterOverride({ lat: a.lat, lng: a.lng, zoom: 12 }); }} /> },
        { id: 'flows', title: 'Energy flows in and out of GB', short: 'Flows', colour: '#f59e0b', icon: ArrowsRightLeftIcon, modes: ['live', 'scenarios'], width: 420,
          content: <EnergyFlowsPanel flows={energyFlows} updated={liveSystemsUpdated} /> },
        { id: 'outages', title: 'Outages', short: 'Outages', colour: '#ef4444', icon: ExclamationTriangleIcon, modes: ['live'], width: 420,
          content: <OutagesPanel outages={liveOutages} generatorOutages={generatorOutages} onFullList={() => setShowOutageList(true)} onGoTo={(lat, lng) => setMapCenterOverride({ lat, lng, zoom: 11 })} /> },
        { id: 'systems', title: 'Notices, gas and weather', short: 'Systems', colour: '#06b6d4', icon: CloudIcon, modes: ['live'], width: 320,
          content: <LiveSystemsPanel flows={icFlows} gas={gas} weather={weatherWarnings} floods={floods} generatorOutages={generatorOutages} systemWarnings={systemWarnings} updated={liveSystemsUpdated} /> },
        { id: 'history', title: 'History (data lake)', short: 'History', colour: '#38bdf8', icon: ClockIcon, modes: ['live'], width: 560,
          content: <React.Suspense fallback={<div className="text-xs text-slate-400">Loading…</div>}><HistoryPanel settings={historySettings} onChange={setHistorySettings} /></React.Suspense> },
        { id: 'concentration', title: 'System concentration', short: 'Concentration', colour: '#a78bfa', icon: ScaleIcon, modes: ['live'], width: 420,
          content: <React.Suspense fallback={<div className="text-xs text-slate-400">Loading…</div>}><ConcentrationPanel flows={energyFlows} mix={generationMix} demandMW={nesoData.demand} onTest={id => { const sc = scenarios.find(x => x.id === id); if (sc) runScenarios([sc]); }} /></React.Suspense> },
        { id: 'library', title: 'Scenario library', short: 'Library', colour: '#ef4444', icon: ListBulletIcon, modes: ['scenarios'], width: 420,
          content: <ScenarioLibraryPanel scenarios={scenarios} running={activeScenarios} onRun={runScenarios} onManage={() => setShowScenarioManager(true)} onPlace={startPlacing} onClear={handleStopSimulation} onAdopt={adopt} onDiscard={discard} onAskAi={handleGenerateMoreScenarios} aiOn={aiEnabled} /> },
        { id: 'results', title: activeScenarios.length > 1 ? 'Results: composite event' : 'Results', short: 'Results', colour: '#dc2626', icon: ChartBarIcon, modes: ['scenarios'], width: 440,
          content: <ResultsPanel active={activeScenarios} timeline={timeline} step={currentDay} onVideo={handleVideoBriefing} onReport={() => setShowReport(true)} onExport={handleQuickExport} onStop={handleStopSimulation} onLibrary={() => openWin('library')} cutRoutes={cutRoutes} footprint={footprintInfo} demandMW={nesoData.demand} gasSupplyGW={energyFlows.gasSupplyMcmd ? energyFlows.gasSupplyMcmd * GW_PER_MCMD : 0} /> },
        { id: 'model', title: 'Scenario model: values and sources', short: 'Model', colour: '#a855f7', icon: InformationCircleIcon, modes: ['scenarios'], width: 460,
          content: <ScenarioModelPanel /> },
        { id: 'layers', title: 'Map layers', short: 'Layers', colour: '#64748b', icon: FunnelIcon, modes: ['live', 'scenarios'], width: 320, content: layersContent },
        { id: 'analyst', title: 'Analyst AI', short: 'Analyst', colour: '#22d3ee', icon: ChatBubbleLeftRightIcon, modes: ['live', 'scenarios'], width: 400, fill: true, content: chatPanel },
        { id: 'tools', title: 'Tools', short: 'Tools', colour: '#94a3b8', icon: WrenchScrewdriverIcon, modes: ['live', 'scenarios'], width: 340, content: toolsContent },
    ];

    return (
        <div className="flex flex-col h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans relative">
            {/* Startup Notification */}
            {showStartupToast && (
                <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[30] bg-slate-900/95 border border-amber-500/50 text-amber-100 px-4 py-3 rounded-xl shadow-2xl animate-slideDown max-w-sm pointer-events-none">
                    <div className="flex items-center gap-3">
                        <ExclamationTriangleIcon className="w-6 h-6 text-amber-500 shrink-0" />
                        <div>
                            <h3 className="font-bold text-sm">Getting started</h3>
                            <p className="text-xs text-amber-200/80 mt-1">
                                National infrastructure and live grid data load automatically. 
                                Zoom in to see local substations and lines; choose layers under <span className="font-bold text-white">Layers</span>. Switch to <span className="font-bold text-white">Scenarios</span> to run risks.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Background Status Bar */}
            {backgroundTask && (
                <div className="absolute top-14 left-0 right-0 z-[60] bg-cyan-900/95 backdrop-blur-sm border-b border-cyan-500/30 px-4 py-1.5 flex items-center justify-center gap-3 animate-slideDown shadow-lg">
                    <ArrowPathIcon className="w-4 h-4 text-cyan-400 animate-spin" />
                    <span className="text-xs font-bold text-white tracking-wide uppercase">{backgroundTask}</span>
                </div>
            )}
            
            {/* Deep Update Notification Bar */}
            {deepUpdateStatus && (
                <div className="absolute top-14 left-0 right-0 z-[65] bg-indigo-900/95 backdrop-blur-sm border-b border-indigo-500/30 px-4 py-1.5 flex items-center justify-center gap-4 animate-slideDown shadow-lg">
                    <div className="flex items-center gap-2">
                        <MagnifyingGlassIcon className="w-4 h-4 text-indigo-300 animate-pulse" />
                        <span className="text-xs font-bold text-white tracking-wide uppercase">{deepUpdateStatus}</span>
                    </div>
                    <button 
                        onClick={cancelDeepUpdate}
                        className="flex items-center gap-1 text-[10px] bg-red-900/50 hover:bg-red-800 text-red-200 px-2 py-0.5 rounded border border-red-500/50 transition-colors pointer-events-auto"
                    >
                        <StopIcon className="w-3 h-3" /> Cancel Scan
                    </button>
                </div>
            )}
            

            {/* Print Preview Overlay */}
            {showPrintPreview && (
                <div className="fixed inset-0 z-[500] bg-white text-black overflow-y-auto">
                     <div className="fixed top-4 right-4 flex gap-4 print:hidden z-50">
                        <button onClick={() => window.print()} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded shadow-lg font-bold flex items-center gap-2">
                            <PrinterIcon className="w-5 h-5" /> Print
                        </button>
                        <button onClick={() => setShowPrintPreview(false)} className="bg-gray-800 hover:bg-gray-700 text-white px-6 py-2 rounded shadow-lg font-bold">
                            Close
                        </button>
                    </div>
                    <div className="p-10 max-w-4xl mx-auto print:p-0 print:max-w-none">
                        <div className="mb-6 pb-6 border-b border-gray-300">
                            <h1 className="text-3xl font-bold mb-2">Energy Resilience Report</h1>
                            <p className="text-gray-500 text-sm">Generated by Energy Resilience Platform • {new Date().toLocaleDateString()}</p>
                        </div>
                        
                        {activeScenarios.length > 0 ? (
                            <>
                                {reportImages.length > 0 && (
                                    <div className="mb-6">
                                        <img src={reportImages[0]} alt="Impact Visualization" className="w-full h-64 object-cover rounded-lg shadow-sm border border-gray-200" />
                                    </div>
                                )}
                                <h2 className="text-xl font-bold mb-4">Briefing Transcript & Summary</h2>
                                <p className="text-gray-800 leading-relaxed text-lg whitespace-pre-wrap font-serif border-l-4 border-red-600 pl-4">
                                    {cleanedScriptForPrint || "No specific script generated. Refer to impact metrics below."}
                                </p>
                                
                                <div className="mt-12 pt-6 border-t border-gray-300 grid grid-cols-2 gap-8 text-sm text-gray-600">
                                    <div>
                                        <h3 className="font-bold text-black uppercase mb-2">Scenario Scope</h3>
                                        <ul className="list-disc pl-4 space-y-1">
                                            {activeScenarios.map(s => <li key={s.id}>{s.name} ({s.category})</li>)}
                                        </ul>
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-black uppercase mb-2">Impact Summary</h3>
                                        <p>Peak Consumers: {Math.max(...timeline.map(t => t.consumersOffline)).toLocaleString()}</p>
                                        <p>Est. Cost: ${timeline.length > 0 ? timeline[timeline.length - 1].costMillions : 0}M</p>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="text-center py-10">
                                <h2 className="text-xl font-bold text-black mb-4">System Status Report</h2>
                                <p className="text-gray-600 mb-6">Current Grid Status: Nominal. No active risk simulations in progress.</p>
                                <div className="grid grid-cols-2 gap-4 text-left max-w-md mx-auto bg-gray-100 p-4 rounded">
                                    <div><strong>Grid Demand:</strong> {(nesoData.demand / 1000).toFixed(2)} GW</div>
                                    <div><strong>Frequency:</strong> {nesoData.frequency.toFixed(3)} Hz</div>
                                    <div><strong>Active Assets:</strong> {assets.length}</div>
                                    <div><strong>Region:</strong> {activeRegion.name}</div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Report Generation Progress Modal */}
            {isGeneratingReport && (
                <div className="fixed inset-0 z-[500] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
                    <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full p-8 shadow-2xl flex flex-col items-center">
                        <div className="w-16 h-16 bg-cyan-900/30 rounded-full flex items-center justify-center mb-6 relative">
                            <DocumentTextIcon className="w-8 h-8 text-cyan-400 absolute" />
                            <div className="w-full h-full rounded-full border-4 border-cyan-500/30 border-t-cyan-400 animate-spin"></div>
                        </div>
                        <h2 className="text-xl font-bold text-white mb-2">Generating Special Report</h2>
                        <p className="text-sm text-slate-400 mb-6 text-center">AI is compiling incident data into a comprehensive briefing.</p>
                        
                        <div className="w-full space-y-3 mb-6">
                            <div className={`flex items-center gap-3 transition-colors ${reportGenerationStep >= 1 ? 'text-green-400' : 'text-slate-600'}`}>
                                <div className={`w-2 h-2 rounded-full ${reportGenerationStep >= 1 ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.5)]' : 'bg-slate-700'}`}></div>
                                <span className="text-sm font-bold">Drafting Narrative Script</span>
                            </div>
                            <div className={`flex items-center gap-3 transition-colors ${reportGenerationStep >= 2 ? 'text-green-400' : 'text-slate-600'}`}>
                                <div className={`w-2 h-2 rounded-full ${reportGenerationStep >= 2 ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.5)]' : 'bg-slate-700'}`}></div>
                                <span className="text-sm font-bold">Synthesizing Audio Briefing</span>
                            </div>
                            <div className={`flex items-center gap-3 transition-colors ${reportGenerationStep >= 3 ? 'text-green-400' : 'text-slate-600'}`}>
                                <div className={`w-2 h-2 rounded-full ${reportGenerationStep >= 3 ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.5)]' : 'bg-slate-700'}`}></div>
                                <span className="text-sm font-bold">Generating Visual Assets</span>
                            </div>
                        </div>
                        
                        <button 
                            onClick={handleCancelReportGeneration}
                            className="text-red-400 hover:text-red-300 text-sm font-bold underline underline-offset-2"
                        >
                            Cancel Generation
                        </button>
                    </div>
                </div>
            )}

            <div className="print:hidden flex flex-col h-full">
                {/* The data refresh timer always runs (its controls are in Tools) */}
                <div className="hidden"><UpdateTimer onTrigger={performUnifiedUpdate} isPaused={!allowBackgroundUpdates || isPlaying} intervalMinutes={updateInterval} /></div>

                {/* ---------- Top bar ---------- */}
                {!presenting && <header className="flex-none h-14 bg-slate-950 border-b border-slate-800 flex items-center gap-2 lg:gap-3 px-2 lg:px-4 z-50">
                    <div className="flex items-center gap-2 shrink-0">
                        <BoltIcon className="w-6 h-6 text-yellow-500 shrink-0" />
                        <div className="hidden xl:block">
                            <h1 className="text-sm font-bold tracking-wide leading-tight">ENERGY RESILIENCE</h1>
                            <p className="text-[10px] text-slate-500">GB energy system, live and what-if</p>
                        </div>
                    </div>
                    <div role="tablist" aria-label="Mode" className="flex bg-slate-900 border border-slate-800 rounded-lg p-0.5 shrink-0">
                        <button role="tab" type="button" aria-selected={appMode === 'live'} onClick={() => switchMode('live')} className={`px-3 lg:px-4 py-1.5 rounded-md text-xs font-semibold ${appMode === 'live' ? 'bg-cyan-700 text-white' : 'text-slate-400 hover:text-white'}`}>Live</button>
                        <button role="tab" type="button" aria-selected={appMode === 'scenarios'} onClick={() => switchMode('scenarios')} className={`px-3 lg:px-4 py-1.5 rounded-md text-xs font-semibold ${appMode === 'scenarios' ? 'bg-red-700 text-white' : 'text-slate-400 hover:text-white'}`}>Scenarios{activeScenarios.length > 0 && appMode !== 'scenarios' ? ' ●' : ''}</button>
                    </div>
                    {activeScenarios.length > 0 && (
                        <span className="flex items-center gap-1 pl-2 pr-1 py-1 rounded-lg bg-red-950/60 border border-red-800 text-red-200 text-[11px] font-semibold shrink-0 max-w-[40vw]">
                            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
                            <button type="button" onClick={() => { if (appMode !== 'scenarios') switchMode('scenarios'); openWin('results'); }} className="truncate hover:text-white" title={activeScenarios.map(s => s.name).join(', ')}>
                                <span className="hidden md:inline">{activeScenarios.length > 1 ? `${activeScenarios.length} scenarios running` : 'Scenario running'}</span><span className="md:hidden">Running</span>
                            </button>
                            <button type="button" onClick={handleStopSimulation} aria-label="Clear scenario and timeline" title="Clear scenario and timeline" className="px-1.5 rounded hover:bg-red-900 text-red-300 hover:text-white">✕</button>
                        </span>
                    )}
                    {appMode === 'scenarios' && (
                        <ol aria-label="Steps" className="hidden 2xl:flex gap-1 text-[11px] shrink-0">
                            {[['Choose', 'library', true], ['Run', 'results', activeScenarios.length > 0], ['Results', 'results', activeScenarios.length > 0], ['Report', 'report', false]].map(([label, target, done]: any, i) => (
                                <li key={label}><button type="button" onClick={() => target === 'report' ? setShowReport(true) : openWin(target)} className={`px-2.5 py-1 rounded-full ${done ? 'bg-slate-800 text-slate-300' : 'border border-slate-700 text-slate-400'} hover:text-white`}>{i + 1} {label}{done ? ' ✓' : ''}</button></li>
                            ))}
                        </ol>
                    )}
                    <label className="hidden lg:flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-2.5 h-9 w-56 xl:w-64">
                        <MagnifyingGlassIcon className="w-4 h-4 text-slate-500 shrink-0" />
                        <span className="sr-only">Search places and assets</span>
                        <input value={customAssetQuery} onChange={e => setCustomAssetQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleCustomAssetSearch()} placeholder="Search assets (e.g. airports)" className="flex-1 min-w-0 bg-transparent text-xs text-white outline-none" />
                        {isSearchingAssets && <ArrowPathIcon className="w-3.5 h-3.5 animate-spin text-cyan-400" />}
                    </label>
                    <div className="flex-1" />
                    <button type="button" onClick={() => { setHelpInitialTab('status'); setShowHelp(true); }} title="System status" className="hidden md:flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 shrink-0">
                        <span className={`w-2.5 h-2.5 rounded-full ${systemHealth === 'green' ? 'bg-green-500' : systemHealth === 'amber' ? 'bg-amber-500' : 'bg-red-500'}`} />
                        <span className="text-xs font-semibold text-slate-200">{activeRegion.name}</span>
                    </button>
                    <button type="button" onClick={() => openWin('analyst')} className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-cyan-900 bg-cyan-950/50 text-cyan-200 text-xs font-semibold hover:bg-cyan-900/50 shrink-0"><ChatBubbleLeftRightIcon className="w-4 h-4" /><span className="hidden lg:inline">Analyst AI</span></button>
                    <button type="button" onClick={handleVideoBriefing} disabled={activeScenarios.length === 0} title={activeScenarios.length ? 'Video briefing on the running scenario' : 'Run a scenario first to make a video briefing'} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-800 bg-slate-900 text-slate-200 text-xs font-semibold hover:bg-slate-800 disabled:opacity-40 shrink-0"><VideoCameraIcon className="w-4 h-4" /><span className="hidden lg:inline">Video briefing</span></button>
                    <button type="button" onClick={() => setShowReport(true)} className="flex items-center gap-1.5 px-2.5 lg:px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold shrink-0"><DocumentTextIcon className="w-4 h-4" /><span className="hidden sm:inline">Create report</span></button>
                    <button type="button" onClick={() => setShowAiKey(true)} title={aiEnabled ? 'AI features on (your Gemini key). Click to manage.' : 'Add your free Gemini key to turn on AI features'}
                        className={`flex items-center gap-1 px-2 py-1.5 rounded-lg border text-xs font-bold shrink-0 ${aiEnabled ? 'border-cyan-900 bg-cyan-950/40 text-cyan-300' : 'border-amber-700 bg-amber-950/40 text-amber-300 animate-pulse'}`}>
                        <SparklesIcon className="w-4 h-4" /><span className="hidden md:inline">{aiEnabled ? 'AI: On' : 'AI: Off'}</span>
                    </button>
                    <div className="hidden md:flex items-center border border-slate-800 rounded-lg overflow-hidden text-xs font-bold text-slate-400 shrink-0" title="Text size for the whole app">
                        <button type="button" onClick={() => changeFont(-1)} className="px-2 py-1.5 hover:bg-slate-800 hover:text-white" aria-label="Smaller text">A−</button>
                        <button type="button" onClick={() => changeFont(1)} className="px-2 py-1.5 hover:bg-slate-800 hover:text-white border-l border-slate-800" aria-label="Larger text">A+</button>
                    </div>
                    <button type="button" onClick={startPresenting} title="Present: map only, big captions (Esc to leave)" aria-label="Present" className="hidden md:flex text-slate-400 hover:text-white shrink-0 p-1"><PresentationChartLineIcon className="w-6 h-6" /></button>
                    <button type="button" onClick={() => setShowBuilt(true)} title="How it's built" aria-label="How it's built" className="hidden md:flex text-slate-400 hover:text-white shrink-0 p-1"><CubeTransparentIcon className="w-6 h-6" /></button>
                    <button type="button" onClick={() => { setHelpInitialTab('guide'); setShowHelp(true); }} aria-label="Help" className="text-slate-400 hover:text-white shrink-0 p-1"><QuestionMarkCircleIcon className="w-6 h-6" /></button>
                </header>}

                {/* ---------- Body: rail | map (+ timeline) | side panel ---------- */}
                <div className={`flex-1 flex min-h-0 relative ${layoutMode === 'phone' && !presenting ? 'pb-14' : ''}`}>
                    {layoutMode !== 'phone' && !presenting && (
                        <ToolRail defs={windowDefs} mode={appMode} win={win} onReset={resetLayout}
                            overlayPanel={layoutMode === 'tablet'} overlayOpen={overlayPanel} onOpenOverlay={id => { win.setActive(appMode, id); setOverlayPanel(overlayPanel === id ? null : id); }} />
                    )}
                    <div className="flex-1 flex flex-col min-w-0">
                        <div ref={mapAreaRef} className="flex-1 relative min-h-0 overflow-hidden">
                            <div className="absolute inset-0 z-0">
                                <MapVisualization
                                    region={activeRegion}
                                    assets={assets}
                                    outages={liveOutages}
                                    historicalOutages={showHistorical ? historicalOutages : []}
                                    activeScenarios={activeScenarios}
                                    dnoRegions={memoizedDnoRegions}
                                    day={currentDay}
                                    filters={visibleLayers}
                                    onAssetSelect={setSelectedAsset}
                                    onViewChange={handleViewChange}
                                    currentImpact={timeline[currentDay]?.consumersOffline || 0}
                                    peakImpact={Math.max(...timeline.map(t => t.consumersOffline)) || 1}
                                    viewOverride={mapCenterOverride}
                                    isScenarioComplete={isScenarioComplete}
                                    generatorOutages={generatorOutages}
                                    interconnectorFlows={icFlows}
                                    energyFlows={energyFlows.links}
                                    regionalCarbon={regionalCarbon}
                                    floodWarnings={floods?.warnings || []}
                                    weatherWarnings={weatherWarnings}
                                    stepHours={stepHours}
                                    cutRoutes={cutSet}
                                    fleet={fleet}
                                    placing={!!placing}
                                    onPlace={handlePlace}
                                    showCoverage={visibleLayers.has('Data coverage')}
                                    onFootprint={setFootprintInfo}
                                />
                            </div>
                            {!presenting && <button type="button" onClick={handleHomeView} title="Reset map view" aria-label="Reset map view"
                                className="absolute top-3 left-3 z-10 bg-slate-950/90 border border-slate-700 w-10 h-10 rounded-lg shadow-xl hover:bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center">
                                <MapIcon className="w-5 h-5" />
                            </button>}
                            {presenting && (
                                <div className="absolute top-3 right-3 z-30 flex gap-2">
                                    {appMode === 'live' && <span className="bg-slate-950/85 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono">{nesoData.demand ? `${(nesoData.demand / 1000).toFixed(1)} GW` : '–'} · {nesoData.demand ? `${nesoData.frequency.toFixed(2)} Hz` : '–'} · {liveOutages.filter(o => !/^planned/i.test(o.description || '')).reduce((a, o) => a + (o.consumersAffected || 0), 0).toLocaleString()} off now</span>}
                                    <button type="button" onClick={() => { setPresenting(false); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); }} className="bg-slate-950/85 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 hover:text-white" title="Leave presentation (Esc). Space: play or pause; arrows: step">Exit presentation</button>
                                </div>
                            )}
                            {placing && (
                                <div role="status" className="absolute top-3 left-1/2 -translate-x-1/2 z-30 max-w-[92%] bg-amber-950/95 border border-amber-500 text-amber-100 rounded-xl shadow-2xl px-4 py-2.5 text-xs flex items-center gap-3">
                                    <span><b>Click the map</b> to choose where “{placing.name}” happens. The location is yours to choose and is illustrative.</span>
                                    <button type="button" onClick={() => setPlacing(null)} className="shrink-0 px-2.5 py-1 rounded-lg border border-amber-600 hover:bg-amber-900 font-semibold">Cancel</button>
                                </div>
                            )}
                            {!placing && appMode === 'scenarios' && activeScenarios.length > 0 && timeline.length > 0 && (
                                <div className={`absolute top-3 left-1/2 -translate-x-1/2 z-[15] ${presenting ? 'w-[min(900px,calc(100%-14rem))]' : 'w-[min(640px,calc(100%-7rem))]'} pointer-events-none flex flex-col items-center gap-1`}>
                                    <div key={caption?.text || 'none'} className="er-caption w-full bg-slate-950/90 border border-red-900/70 rounded-xl shadow-2xl px-4 py-2 text-center">
                                        <div className={`${presenting ? 'text-sm' : 'text-[10px]'} font-bold tracking-wider text-red-300`}>{timeline[currentDay]?.label || ''} · {(timeline[currentDay]?.consumersOffline || 0).toLocaleString()} customers off</div>
                                        {caption && <div className={`${presenting ? 'text-lg sm:text-2xl' : 'text-xs sm:text-sm'} text-slate-100 leading-snug`}>{caption.text}</div>}
                                    </div>
                                    <div className="text-[10px] text-slate-400 bg-slate-950/80 rounded px-2 py-0.5 text-center">Modelled and illustrative: shaded areas are not a forecast of where cuts would fall</div>
                                    {!!hiddenForScenario.current?.length && hiddenForScenario.current.some(l => !visibleLayers.has(l)) && (
                                        <div className="text-[10px] text-slate-400 bg-slate-950/80 rounded px-2 py-0.5 pointer-events-auto">Live power cuts, generator outages and data centres are hidden while this runs. <button type="button" onClick={() => setVisibleLayers(prev => { const n = new Set(prev); hiddenForScenario.current!.forEach(l => n.add(l)); return n; })} className="text-cyan-300 underline">Show them</button></div>
                                    )}
                                </div>
                            )}
                            {selectedAsset && (
                                <AssetDetails asset={selectedAsset} regionName={activeRegion.name} onClose={() => setSelectedAsset(null)} />
                            )}
                            {/* Popped-out windows float over the map only, never over the top bar or timeline */}
                            {layoutMode !== 'phone' && !presenting && (
                                <div className="absolute inset-0 pointer-events-none z-20">
                                    {windowDefs.filter(d => d.modes.includes(appMode) && win.stateOf(d.id) === 'floating').map(d => (
                                        <FloatingWindow key={`${d.id}_${win.version}`} def={d} win={win} container={mapAreaRef} />
                                    ))}
                                </div>
                            )}
                            {layoutMode !== 'phone' && !presenting && <MinimisedTray defs={windowDefs} mode={appMode} win={win} />}
                            {layoutMode === 'tablet' && overlayPanel && !presenting && (
                                <SidePanel defs={windowDefs} mode={appMode} win={win} overlay onClose={() => setOverlayPanel(null)} />
                            )}
                        </div>
                        {appMode === 'scenarios' && activeScenarios.length > 0 && timeline.length > 0 && (
                            <div className="flex-none border-t border-slate-800">
                                <TimelineControl
                                    currentDay={currentDay}
                                    totalDays={timeline.length - 1}
                                    labels={timeline.map(t => t.label || `Day ${t.day}`)}
                                    isPlaying={isPlaying}
                                    playbackSpeed={playbackSpeed}
                                    onPlayPause={() => setIsPlaying(!isPlaying)}
                                    onSeek={setCurrentDay}
                                    onSpeedChange={setPlaybackSpeed}
                                    marks={captions.map(c => ({ step: Math.max(0, timeline.findIndex(t => (t.hours ?? t.day) >= c.atHours - 1e-6)), text: c.text }))}
                                    onClear={handleStopSimulation}
                                />
                            </div>
                        )}
                    </div>
                    {layoutMode === 'desktop' && !presenting && <SidePanel defs={windowDefs} mode={appMode} win={win} />}
                </div>

                {layoutMode === 'phone' && !presenting && (
                    <>
                        <PhoneSheet def={windowDefs.find(d => d.id === activeSheet && d.modes.includes(appMode)) || null} onClose={() => setActiveSheet(null)} />
                        <PhoneTabs defs={windowDefs} mode={appMode} active={activeSheet} onPick={setActiveSheet} />
                    </>
                )}

                {/* Modals and Overlays */}
                {historyModalMetric && (
                    <GridHistoryModal
                        metric={historyModalMetric}
                        onClose={() => setHistoryModalMetric(null)}
                    />
                )}
            </div>

            {/* Modals and Overlays */}
            {showBuilt && <React.Suspense fallback={null}><HowItsBuilt onClose={() => setShowBuilt(false)} /></React.Suspense>}
            {isTourActive && <TourGuide onClose={() => setIsTourActive(false)} onStepChange={handleTourStep} />}
            {showScenarioManager && (
                <ScenarioManager 
                    scenarios={scenarios}
                    onRunSimulation={(sel) => runScenarios(sel)}
                    onUpdateScenarios={setScenarios}
                    onClose={() => setShowScenarioManager(false)}
                    onGenerateMore={handleGenerateMoreScenarios}
                    onMapAction={handleMapAction}
                    activeRegion={activeRegion}
                />
            )}
            {showOutageList && (
                <OutageListModal 
                    outages={liveOutages} 
                    onClose={() => setShowOutageList(false)}
                    onRefresh={handleQuickOutageRefresh}
                />
            )}
            
            
            {/* New Report Modal */}
            {showReportModal && (
                <ReportModal
                    onClose={() => setShowReportModal(false)}
                    script={generatedScript}
                    audioUrl={audioUrl}
                    images={reportImages}
                    scenarioName={`${activeScenarios.length > 0 ? (activeScenarios[0].name || "Report") : "Report"}`}
                />
            )}

            {showAiKey && <AiKeyModal onClose={() => setShowAiKey(false)} />}

            {showReport && (
                <ReportBuilder
                    initialKind={appMode === 'scenarios' && activeScenarios.length ? 'scenario' : 'live'}
                    onClose={() => setShowReport(false)}
                    onVideo={() => { setShowReport(false); handleVideoBriefing(); }}
                    aiEnabled={aiEnabled}
                    onNeedAi={() => setShowAiKey(true)}
                    neso={nesoData} mix={generationMix} flows={energyFlows} gas={gas}
                    outages={liveOutages} generatorOutages={generatorOutages} warnings={systemWarnings} weather={weatherWarnings}
                    scenarios={activeScenarios} timeline={timeline} step={currentDay}
                />
            )}

            {/* Consolidated Help Modal (Restores Missing Data) */}
            {showHelp && (
                <HelpModal 
                    onClose={() => setShowHelp(false)} 
                    onLaunchTour={() => { setShowHelp(false); setIsTourActive(true); }}
                    initialTab={helpInitialTab}
                />
            )}

            {isLoading && (
                <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm animate-fadeIn">
                    <div className="max-w-md w-full text-center">
                        <h2 className="text-xl font-bold text-white mb-2">{loadingMessage}</h2>
                        <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden mb-4">
                            <div className="bg-cyan-500 h-full transition-all duration-300 ease-out" style={{ width: `${loadingProgress}%` }}></div>
                        </div>
                        {loadingQuip && (
                            <p className="text-cyan-400 text-sm mt-2 italic font-mono animate-pulse">"{loadingQuip}"</p>
                        )}
                        {abortControllerRef.current && (
                            <button onClick={handleCancelUpdate} className="px-6 py-2 bg-red-900/50 hover:bg-red-800 text-red-300 border border-red-800 rounded-lg text-sm font-bold mt-4">Cancel</button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
