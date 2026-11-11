
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
    RegionConfig, InfrastructureAsset, RiskScenario, TimelineStep, AssetType, SaveData, OutageEvent, GenerationMix, SupplyChainInsight 
} from './types';
import { 
    REGIONS, UK_ASSETS_SEED, ASSET_TYPES, INITIAL_SCENARIOS, UK_DNO_REGIONS,
    APP_VERSION, BUILD_DATE
} from './constants';
import { 
    fetchEnergyInfrastructure, generateRiskScenarios, calculateScenarioImpact,
    generateVideoReportScript, generateNarratedAudio, generateSlideshowImages, fetchRealTimeOutages,
    TOUR_SCRIPTS, getApiSystemStatus, fetchNESOPowerData, fetchHistoricalOutages, fetchGenerationMix,
    generateSupplyChainAnalysis, searchInfrastructureAssets
} from './services/geminiService';
import MapVisualization from './components/MapVisualization';
import ChatPanel from './components/ChatPanel';
import { ImpactChart } from './components/Charts';
import AssetDetails from './components/AssetDetails';
import ScenarioManager from './components/ScenarioManager';
import TimelineControl from './components/TimelineControl';
import TourGuide from './components/TourGuide';
import OutageListModal from './components/OutageListModal';
import HelpModal from './components/HelpModal';
import ReportModal from './components/ReportModal';
import SupplyChainModal from './components/SupplyChainModal';
import DraggablePanel from './components/DraggablePanel';
import GenerationListPanel from './components/GenerationListPanel';
import GridHistoryModal from './components/GridHistoryModal';

import { 
    GlobeAmericasIcon, BoltIcon, ExclamationTriangleIcon, PlayIcon, PauseIcon, 
    ArrowPathIcon, InformationCircleIcon, VideoCameraIcon, DocumentTextIcon,
    SpeakerWaveIcon, XMarkIcon, FunnelIcon, ChevronDownIcon, ArrowDownTrayIcon, 
    QuestionMarkCircleIcon, PrinterIcon, HomeIcon, SignalIcon, SignalSlashIcon, 
    ArrowsPointingOutIcon, ArrowsPointingInIcon, ShieldCheckIcon,
    ChevronUpIcon, MinusIcon, ListBulletIcon, ChatBubbleLeftRightIcon, WrenchScrewdriverIcon, PauseCircleIcon,
    ClockIcon, ChartBarIcon, ArrowPathRoundedSquareIcon, MapIcon, TruckIcon, PowerIcon, MapPinIcon,
    StopCircleIcon, MagnifyingGlassIcon, StopIcon, CloudIcon
} from '@heroicons/react/24/solid';

const getAIStudio = () => (window as any).aistudio;

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
const PANEL_CONFIG: Record<string, { title: string, abbr: string, icon: any }> = {
    'infra': { title: 'Infrastructure', abbr: 'Infra', icon: FunnelIcon },
    'data_sync': { title: 'Data Sync', abbr: 'Sync', icon: ArrowPathIcon },
    'scenarios_pane': { title: 'Scenarios', abbr: 'Risks', icon: PlayIcon },
    'grid_status': { title: 'Grid Status', abbr: 'Grid', icon: ShieldCheckIcon },
    'system_monitor': { title: 'System Monitor', abbr: 'System', icon: ShieldCheckIcon },
    'standby_list': { title: 'Standby Capacity', abbr: 'Standby', icon: PauseCircleIcon },
    'engineering_work': { title: 'Engineering Work', abbr: 'Eng.', icon: WrenchScrewdriverIcon },
    'scenario_stats': { title: 'Scenario Stats', abbr: 'Stats', icon: VideoCameraIcon },
    'chat': { title: 'Analyst AI', abbr: 'Analyst', icon: ChatBubbleLeftRightIcon },
    'supply_chain': { title: 'Supply Chain', abbr: 'Supply', icon: TruckIcon },
    'reporting': { title: 'Reporting', abbr: 'Report', icon: PrinterIcon },
    'reset_view': { title: 'View Control', abbr: 'View', icon: StopCircleIcon }
};

const PinnedItem = ({ id, onUnpin }: { id: string, onUnpin: (id: string, x?: number, y?: number) => void }) => {
    const config = PANEL_CONFIG[id];
    if (!config) return null;

    const handleDragEnd = (e: React.DragEvent) => {
        // If dropped significantly below header (approx 60px), consider it unpinned
        if (e.clientY > 80) {
            onUnpin(id, e.clientX - 100, e.clientY);
        }
    };

    return (
        <div 
            draggable
            onDragEnd={handleDragEnd}
            onClick={() => onUnpin(id)}
            className="flex items-center gap-2 px-3 py-1 bg-slate-800/80 border border-slate-700/50 rounded-full cursor-grab active:cursor-grabbing hover:bg-slate-700 transition-all group select-none shadow-sm hover:shadow-cyan-500/20 hover:border-cyan-500/30 active:scale-95"
            title={`${config.title} (Pinned). Drag down or Click to restore.`}
        >
            <config.icon className="w-3 h-3 text-cyan-500 group-hover:text-cyan-300" />
            <span className="text-[10px] font-bold text-slate-400 group-hover:text-white uppercase tracking-wider">{config.abbr}</span>
        </div>
    );
};

export const App: React.FC = () => {
    // --- STATE ---
    const [activeRegion, setActiveRegion] = useState<RegionConfig>(REGIONS[0]); // Default UK
    const [assets, setAssets] = useState<InfrastructureAsset[]>(UK_ASSETS_SEED);
    const [scenarios, setScenarios] = useState<RiskScenario[]>(INITIAL_SCENARIOS);
    const [liveOutages, setLiveOutages] = useState<OutageEvent[]>([]);
    const [historicalOutages, setHistoricalOutages] = useState<OutageEvent[]>([]);
    const [showHistorical, setShowHistorical] = useState(false);
    const [nesoData, setNesoData] = useState({ demand: 0, frequency: 50.0, carbonIntensity: 0 });
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
    const [visibleLayers, setVisibleLayers] = useState<Set<string>>(new Set(['Generation', 'Transmission', 'Interconnector', 'Distribution', 'Retail', 'DNO Regions']));
    const [selectedPointInfo, setSelectedPointInfo] = useState<TimelineStep | null>(null);
    const [mapCenterOverride, setMapCenterOverride] = useState<{lat: number, lng: number, zoom: number} | null>(null);
    const [customAssetQuery, setCustomAssetQuery] = useState("");
    const [isSearchingAssets, setIsSearchingAssets] = useState(false);
    
    // Modals & Panels
    const [showScenarioManager, setShowScenarioManager] = useState(false);
    const [showOutageList, setShowOutageList] = useState(false);
    const [historyModalMetric, setHistoryModalMetric] = useState<'demand' | 'frequency' | null>(null);
    
    // Pinning & Window Management State
    const [pinnedPanels, setPinnedPanels] = useState<Set<string>>(new Set([])); // Init Empty
    const [panelPositions, setPanelPositions] = useState<Record<string, {x: number, y: number}>>({});
    const [panelStack, setPanelStack] = useState<string[]>([]); // For Z-Index Management
    const [layoutKey, setLayoutKey] = useState(0);

    // Panels that start minimized (Data Sync removed)
    const INITIAL_MINIMIZED = new Set(['infra', 'engineering_work', 'standby_list', 'chat', 'supply_chain', 'reporting', 'reset_view', 'scenarios_pane']);
    const [minimizedPanels, setMinimizedPanels] = useState<Set<string>>(new Set(INITIAL_MINIMIZED));
    
    const [showChat, setShowChat] = useState(true); // Always true, managed by minimization
    const [showHelp, setShowHelp] = useState(false);
    const [helpInitialTab, setHelpInitialTab] = useState<'guide' | 'status' | 'logs'>('guide');
    const [isInfraCollapsed, setIsInfraCollapsed] = useState(false);
    const [showGenList, setShowGenList] = useState<string | null>(null);
    
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

    // Supply Chain Report
    const [showSupplyChainModal, setShowSupplyChainModal] = useState(false);
    const [supplyChainInsights, setSupplyChainInsights] = useState<SupplyChainInsight[]>([]);
    const [isSupplyChainLoading, setIsSupplyChainLoading] = useState(false);
    const [supplyChainProgress, setSupplyChainProgress] = useState(0);

    // Specific Reporting Progress
    const [isGeneratingReport, setIsGeneratingReport] = useState(false);
    const [reportGenerationStep, setReportGenerationStep] = useState(0); // 0: Idle, 1: Script, 2: Audio, 3: Visuals, 4: Done

    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const mapDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastFetchCenterRef = useRef<{lat: number, lng: number} | null>(null);
    const lastActiveScenarioId = useRef<string | null>(null);
    const lastInteractionTime = useRef<number>(Date.now());

    // --- HELPER: System Health ---
    const getSystemHealthColor = () => {
        if (!navigator.onLine) return 'red';
        const statuses = getApiSystemStatus();
        const hasDegraded = statuses.some(s => s.status === 'Degraded' || s.status === 'Quota Limit');
        const hasDown = statuses.some(s => s.status === 'Down');
        
        if (hasDown) return 'red';
        if (hasDegraded) return 'amber';
        return 'green';
    };
    
    // Force re-render of health status periodically or when data fetches
    const [systemHealth, setSystemHealth] = useState<'green' | 'amber' | 'red'>('green');
    
    useEffect(() => {
        setSystemHealth(getSystemHealthColor());
    }, [liveOutages, assets, lastOutageCheck]); // Dependencies to trigger update

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
            // Apply a random chance of engineering maintenance if it's a generator
            let maintenanceOverride = false;
            // Only simulate maintenance on major generation assets
            if (['nuclear', 'gas', 'coal', 'biomass'].includes(asset.typeId) && Math.random() < 0.05) { // 5% chance
                maintenanceOverride = true;
            }

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
                else if (perc > 0 && Math.random() > 0.5) status = 'generating';
                else status = 'standby';
            }

            return {
                ...asset,
                status: operationalStatus,
                liveStatus: status,
                liveOutputDesc: status === 'generating' 
                    ? `Generating (${getFuelPerc(genType || '')}% of Grid Mix)` 
                    : status === 'standby' ? 'Available (Standby)' : 'Unavailable (Maintenance)'
            };
        });
    };

    const assetsRef = useRef(assets);
    useEffect(() => { assetsRef.current = assets; }, [assets]);

    const performUnifiedUpdate = useCallback(async () => {
        const timeSinceInteraction = Date.now() - lastInteractionTime.current;
        const skipHeavyTasks = timeSinceInteraction < 3000;

        setBackgroundTask("AUTO-UPDATE: Syncing Grid Data...");
        
        try {
            const neso = await fetchNESOPowerData();
            setNesoData(neso);
            
            const mix = await fetchGenerationMix();
            setGenerationMix(mix);
            
            const outages = await fetchRealTimeOutages(activeRegion.name);
            setLiveOutages(outages);
            setLastOutageCheck(new Date());

            let updatedAssets = assetsRef.current;
            
            if (!skipHeavyTasks) {
                const centerLat = lastFetchCenterRef.current?.lat || activeRegion.lat;
                const centerLng = lastFetchCenterRef.current?.lng || activeRegion.lng;

                const enriched = await fetchEnergyInfrastructure(
                    activeRegion.name, 
                    assetsRef.current, 
                    undefined,
                    centerLat,
                    centerLng,
                    'local_only'
                );
                
                if (enriched.length > assetsRef.current.length) {
                    updatedAssets = enriched;
                    setBackgroundTask(`Background Update: ${enriched.length} assets`);
                }
            }

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
                const parsed = JSON.parse(saved);
                setScenarios(prev => {
                    const existingIds = new Set(prev.map(s => s.id));
                    const uniqueSaved = parsed.filter((s: RiskScenario) => !existingIds.has(s.id));
                    return [...prev, ...uniqueSaved];
                });
            } catch(e: any) { console.error("Failed to load scenarios", e); }
        }
    }, []);

    useEffect(() => {
        const userScenarios = scenarios.filter(s => s.status === 'User' || s.isUserCreated);
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
            if (mix && assets.length > 0) {
                 const updated = calculateAssetStatus(mix, assets);
                 setAssets(updated);
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

                if (hasCoords && !isGenericLocation) {
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
            // Target duration: 10 seconds (10000ms) by default
            const targetDurationMs = 10000;
            const totalSteps = Math.max(timeline.length, 1);
            const baseInterval = targetDurationMs / totalSteps;
            const intervalTime = baseInterval / playbackSpeed;

            timerRef.current = setInterval(() => {
                setCurrentDay(prev => {
                    const next = prev + 1;
                    if (next >= (timeline.length - 1)) {
                        setIsPlaying(false);
                        setChartMode('normal');
                        return next;
                    }
                    return next;
                });
            }, intervalTime); 
        } else if (timerRef.current) {
            clearInterval(timerRef.current);
        }
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [isPlaying, activeScenarios, timeline, playbackSpeed]);

    const performDeepUpdate = async () => {
        setDeepUpdateStatus("Initializing Deep Update...");
        cancelDeepUpdateRef.current = false;
        
        const deepSearchTargets = [
            "Hyperscale Data Centers",
            "Major Hospitals",
            "Industrial Aluminium Smelters",
            "Gas Compressor Stations",
            "Strategic Grid Supply Points"
        ];

        for (const query of deepSearchTargets) {
            if (cancelDeepUpdateRef.current) break;
            
            setDeepUpdateStatus(`Deep Update: Locating ${query}...`);
            
            try {
                // Use existing APIs via the search function
                const newAssets = await searchInfrastructureAssets(
                    query, 
                    activeRegion.lat, 
                    activeRegion.lng
                );

                if (newAssets.length > 0 && !cancelDeepUpdateRef.current) {
                    setAssets(prev => {
                        const combined = [...prev];
                        const existingIds = new Set(prev.map(a => a.id));
                        newAssets.forEach(a => {
                            if (!existingIds.has(a.id)) combined.push(a);
                        });
                        return combined;
                    });
                    setVisibleLayers(prev => new Set(prev).add('Custom'));
                }
                
                // Small delay for UI update
                await new Promise(r => setTimeout(r, 1000));
            } catch (e: any) {
                console.warn(`Deep update failed for ${query}`, e);
            }
        }
        
        setDeepUpdateStatus(null);
    };

    const cancelDeepUpdate = () => {
        cancelDeepUpdateRef.current = true;
        setDeepUpdateStatus(null);
    };

    const loadDataForRegion = async () => {
        if (activeRegion.id === lastLoadedRegionIdRef.current && assets.length > 0) {
             return;
        }
        lastLoadedRegionIdRef.current = activeRegion.id;

        setIsLoading(true);
        setLoadingProgress(0);
        setLoadingMessage(`System Initialization: Conducting Deep Asset Discovery for ${activeRegion.name}...`);
        
        try {
            const enriched = await fetchEnergyInfrastructure(
                activeRegion.name, 
                activeRegion.id === 'UK' ? UK_ASSETS_SEED : [], 
                (status) => {
                    setLoadingMessage(status);
                    setLoadingProgress(prev => Math.min(prev + 10, 50));
                },
                activeRegion.lat,
                activeRegion.lng,
                'all'
            );
            
            const finalAssets = generationMix ? calculateAssetStatus(generationMix, enriched) : enriched;
            setAssets(finalAssets);
            
            setLoadingProgress(60);
            setLoadingMessage(`Cross-referencing DNO Feeds & NESO Data...`);
            const outages = await fetchRealTimeOutages(activeRegion.name);
            setLiveOutages(outages);
            setLastOutageCheck(new Date());
            
            const neso = await fetchNESOPowerData();
            setNesoData(neso);
            const mix = await fetchGenerationMix();
            setGenerationMix(mix);
            
            if (mix && !generationMix) {
                 setAssets(calculateAssetStatus(mix, finalAssets));
            }

            setLoadingProgress(80);
            setLoadingMessage(`Analyzing Risk Profile via Gemini AI...`);
            
            const newScenarios = await generateRiskScenarios(activeRegion.name, enriched);
            setScenarios(prev => {
                const existingUser = prev.filter(s => s.status === 'User' || s.isUserCreated);
                const seed = activeRegion.id === 'UK' ? INITIAL_SCENARIOS : [];
                const all = [...seed, ...existingUser, ...newScenarios];
                const unique = new Map();
                all.forEach(s => unique.set(s.id, s));
                return Array.from(unique.values());
            });
        } catch (e: any) {
            console.error("AI Scenario Gen Failed", e);
        }
        
        setLoadingProgress(100);
        setTimeout(() => {
            setIsLoading(false);
            // Trigger additional deep update after main load
            performDeepUpdate();
        }, 500);
    };

    const handleViewChange = useCallback((center: { lat: number, lng: number, zoom: number }) => {
        setMapCenterOverride(null); 
        lastInteractionTime.current = Date.now();
        lastFetchCenterRef.current = { lat: center.lat, lng: center.lng };
        
        // Auto-fetch details on stable zoom in
        if (center.zoom > 10 && center.zoom > lastZoomLevelRef.current && allowBackgroundUpdates) {
            if (mapDebounceRef.current) clearTimeout(mapDebounceRef.current);
            mapDebounceRef.current = setTimeout(async () => {
                setBackgroundTask("Zoom Trigger: Detailed Local Scan...");
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
        setVisibleLayers(new Set(['Generation', 'Transmission', 'Interconnector', 'Distribution', 'Retail', 'DNO Regions']));
        setActiveRegion(prev => ({...prev}));
        setMapCenterOverride({ lat: activeRegion.lat, lng: activeRegion.lng, zoom: activeRegion.zoom });
        setMinimizedPanels(new Set(INITIAL_MINIMIZED));
        
        // Reset Layout to Defaults
        setLayoutKey(prev => prev + 1);
        setPanelPositions({});
        setPinnedPanels(new Set([]));
        setPanelStack([]);
    };

    const handleGenerateMoreScenarios = useCallback(async () => {
        setIsLoading(true);
        setLoadingProgress(20);
        setLoadingMessage("AI Generating New Risk Scenarios...");
        try {
            const newScenarios = await generateRiskScenarios(activeRegion.name, assets);
            setLoadingProgress(80);
            setScenarios((prev: RiskScenario[]) => {
                const existingMap = new Map<string, RiskScenario>(prev.map((s: RiskScenario) => [s.id, s]));
                const merged = [...prev];
                newScenarios.forEach((newItem: RiskScenario) => {
                    if (existingMap.has(newItem.id)) {
                        const existing = existingMap.get(newItem.id)!;
                        if (existing.status !== 'User') {
                            const index = merged.findIndex(s => s.id === newItem.id);
                            if (index !== -1) merged[index] = { ...newItem, status: 'Updated' };
                        }
                    } else {
                        merged.push({ ...newItem, status: 'New' });
                    }
                });
                return merged;
            });
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
        const individualTimelines = await Promise.all(selected.map(s => calculateScenarioImpact(s)));
        setLoadingProgress(50);
        
        const maxDuration = Math.max(...individualTimelines.map(t => t.length));
        const mergedTimeline: TimelineStep[] = [];
        let runningCumulativeCost = 0; 
        for (let i = 0; i < maxDuration; i++) {
            let totalConsumers = 0; let dailyTotalCost = 0;
            individualTimelines.forEach(t => {
                if (t[i]) {
                    totalConsumers += t[i].consumersOffline;
                    dailyTotalCost += t[i].costMillions; 
                }
            });
            runningCumulativeCost += dailyTotalCost;
            mergedTimeline.push({
                day: i, consumersOffline: totalConsumers, costMillions: parseFloat(runningCumulativeCost.toFixed(2)),
                restorationPct: 100, activeAlerts: [], description: `Day ${i}`
            });
        }

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

    const handleRunSupplyChainAnalysis = async () => {
        setIsSupplyChainLoading(true);
        setShowSupplyChainModal(true);
        setSupplyChainProgress(10);
        
        // Simulate progressive loading
        const timer = setInterval(() => {
            setSupplyChainProgress(prev => Math.min(prev + 5, 80));
        }, 500);

        const results = await generateSupplyChainAnalysis(activeRegion.name);
        
        clearInterval(timer);
        setSupplyChainProgress(100);
        setSupplyChainInsights(results);
        setIsSupplyChainLoading(false);
    };

    const handleExportReport = () => {
        const reportData = {
            title: `Incident Report: ${activeScenarios.length > 1 ? 'Composite Event' : activeScenarios[0].name}`,
            date: new Date().toISOString(),
            region: activeRegion.name,
            scenariosIncluded: activeScenarios.map(s => s.name),
            impact: {
                peakConsumers: Math.max(...timeline.map(t => t.consumersOffline)),
                totalCostMillions: timeline.length > 0 ? timeline[timeline.length - 1].costMillions : 0
            },
            narrative: generatedScript
        };
        const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `incident_report_${Date.now()}.json`;
        a.click();
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

    const handlePrintReport = async () => {
        if (!generatedScript && activeScenarios.length > 0) {
            setIsLoading(true);
            setLoadingMessage("Preparing Executive Summary for Print...");
            const script = await generateVideoReportScript(activeScenarios[0]);
            setGeneratedScript(script);
            setIsLoading(false);
        }
        setShowPrintPreview(true);
    };

    const toggleLayer = (category: string) => {
        const next = new Set(visibleLayers);
        if (next.has(category)) next.delete(category);
        else next.add(category);
        setVisibleLayers(next);
    };

    const isGrowthMode = activeScenarios.some(s => s.category === 'Growth');
    const metricLabel = isGrowthMode ? "Capacity Added" : "Total Offline";
    const costLabel = isGrowthMode ? "Investment" : "Cumul. Cost";
    const statusLabel = isGrowthMode ? "Historical Playback" : "SIMULATING";

    const cycleChartMode = () => {
        if (chartMode === 'normal') setChartMode('minimal');
        else if (chartMode === 'minimal') setChartMode('hidden');
        else setChartMode('normal');
    };

    const handleMapAction = useCallback((lat: number, lng: number, zoom: number) => {
        setMapCenterOverride({ lat, lng, zoom });
    }, []);

    const memoizedDnoRegions = useMemo(() => activeRegion.id === 'UK' ? UK_DNO_REGIONS : [], [activeRegion.id]);

    const cleanedScriptForPrint = useMemo(() => {
        return generatedScript
            .replace(/\*\*/g, '')
            .replace(/EXECUTIVE SUMMARY:|SCENARIO ANALYSIS:|CREDIBILITY & SOURCES:|PROJECTED IMPACT:|\[.*?\]/g, '')
            .trim();
    }, [generatedScript]);

    // Use currentDay data if available, otherwise use last available data (for total cost)
    const currentStats = useMemo(() => {
        if (timeline.length === 0) return { consumers: 0, cost: 0 };
        const index = Math.min(currentDay, timeline.length - 1);
        return {
            consumers: timeline[index].consumersOffline,
            cost: timeline[index].costMillions
        };
    }, [timeline, currentDay]);

    const isScenarioComplete = useMemo(() => {
        if (timeline.length === 0) return false;
        // Consider complete if we hit end of timeline
        return currentDay >= timeline.length - 1;
    }, [currentDay, timeline]);

    // Tour Step Handler
    const handleTourStep = (step: string) => {
        // Reset/Close specific panels to focus user attention
        setShowScenarioManager(false);
        setShowSupplyChainModal(false);
        setShowHelp(false);
        setSelectedAsset(null);
        if (step !== 'analyst') setShowChat(false);

        switch (step) {
            case 'asset_info':
                if (assets.length > 0) setSelectedAsset(assets[0]);
                break;
            case 'scenarios':
                setShowScenarioManager(true);
                break;
            case 'analyst':
                setShowChat(true);
                break;
            case 'supply_chain':
                if (supplyChainInsights.length === 0 && !isSupplyChainLoading) {
                    handleRunSupplyChainAnalysis();
                }
                setShowSupplyChainModal(true);
                break;
            case 'help':
                setShowHelp(true);
                break;
        }
    };

    // --- Z-INDEX & PINNING LOGIC ---
    
    const bringToFront = (id: string) => {
        setPanelStack(prev => {
            if (prev[prev.length - 1] === id) return prev; // Already on top
            const newStack = prev.filter(p => p !== id);
            return [...newStack, id];
        });
    };

    const getZIndex = (id: string) => {
        const index = panelStack.indexOf(id);
        // Base z-index 30, stack adds on top
        return index === -1 ? 30 : 30 + index;
    };

    const pinPanel = (id: string) => {
        // Space limitation logic
        const max = window.innerWidth < 768 ? 2 : window.innerWidth < 1280 ? 4 : 8;
        if (pinnedPanels.size >= max) return; // Prevent if full

        const next = new Set(pinnedPanels);
        next.add(id);
        setPinnedPanels(next);
        
        // Remove from minimized if present
        if (minimizedPanels.has(id)) {
            const min = new Set(minimizedPanels);
            min.delete(id);
            setMinimizedPanels(min);
        }
    };

    const unpinPanel = (id: string, x?: number, y?: number) => {
        const next = new Set(pinnedPanels);
        next.delete(id);
        setPinnedPanels(next);
        
        let finalX = x;
        let finalY = y;
        
        // Find free space heuristic if no explicit position provided (clicked)
        if (finalX === undefined || finalY === undefined) {
             if (id === 'reset_view') {
                 // Center prominent
                 const w = 250;
                 const h = 150;
                 finalX = (window.innerWidth - w) / 2;
                 finalY = (window.innerHeight - h) / 2;
             } else {
                 // Cascade strategy
                 const offset = (panelStack.length % 10) * 30;
                 finalX = 100 + offset;
                 finalY = 150 + offset;
             }
        }

        setPanelPositions(prev => ({ ...prev, [id]: { x: finalX!, y: finalY! } }));
        bringToFront(id); // Ensure restored panel is on top
    };

    const toggleMinimize = (id: string) => {
        const next = new Set(minimizedPanels);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setMinimizedPanels(next);
        
        // Also handle legacy state toggles where appropriate
        if (id === 'chat') setShowChat(false); 
        // For supply chain, we don't have a specific boolean, the ID controls the panel
        if (id === 'outage_list') setShowOutageList(false);
    };

    const restorePanel = (id: string) => {
        const next = new Set(minimizedPanels);
        next.delete(id);
        setMinimizedPanels(next);
        if (id === 'chat') setShowChat(true);
        if (id === 'scenario_stats') {
            setChartMode('normal');
            setCurrentDay(0);
            setIsPlaying(false);
        }
        
        // Special centering logic for reset_view
        if (id === 'reset_view') {
            const w = 250;
            const h = 150;
            const x = (window.innerWidth - w) / 2;
            const y = (window.innerHeight - h) / 2;
            setPanelPositions(prev => ({ ...prev, [id]: { x, y } }));
        }
        
        bringToFront(id);
    };

    const generationListAssets = useMemo<InfrastructureAsset[]>(() => {
        if (!showGenList) return [];
        const isRenewable = showGenList === 'Renewables';
        const targetTypes = isRenewable 
            ? ['wind_onshore', 'wind_offshore', 'solar', 'hydro', 'biomass']
            : ['gas', 'coal', 'nuclear'];
        return assets.filter(a => targetTypes.includes(a.typeId));
    }, [showGenList, assets]);

    const maintenanceAssets = useMemo(() => {
        return assets.filter(a => a.status === 'Maintenance');
    }, [assets]);

    const standbyAssets = useMemo(() => {
        return assets.filter(a => a.liveStatus === 'standby');
    }, [assets]);

    return (
        <div className="flex flex-col h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans relative">
            {/* Startup Notification */}
            {showStartupToast && (
                <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[70] bg-slate-900 border border-amber-500/50 text-amber-100 px-6 py-4 rounded-xl shadow-2xl animate-slideDown max-w-md pointer-events-none">
                    <div className="flex items-center gap-3">
                        <ExclamationTriangleIcon className="w-6 h-6 text-amber-500 shrink-0" />
                        <div>
                            <h3 className="font-bold text-sm">System Initialization Notice</h3>
                            <p className="text-xs text-amber-200/80 mt-1">
                                Complete asset data may not be immediately visible. 
                                Perform a <span className="font-bold text-white">Force Deep Update</span> or zoom into specific regions to sync granular infrastructure data.
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
            
            {/* Ensure Timer runs even if Data Sync panel is pinned (and thus unmounted from view) */}
            {pinnedPanels.has('data_sync') && (
                <div className="hidden">
                    <UpdateTimer onTrigger={performUnifiedUpdate} isPaused={!allowBackgroundUpdates || isPlaying} intervalMinutes={updateInterval} />
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
                <div className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
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
                {/* Header */}
                <header className="flex-none h-14 bg-slate-950 border-b border-slate-800 flex items-center justify-between px-4 z-50">
                    <div className="flex items-center gap-3 min-w-0">
                        <BoltIcon className="w-6 h-6 text-yellow-500 shrink-0" />
                        <div className="hidden sm:block">
                            <h1 className="text-sm font-bold tracking-wide">ENERGY RESILIENCE</h1>
                            <p className="text-[10px] text-slate-500">Risk Impact Sim</p>
                        </div>
                    </div>

                    {/* PINNED ITEMS DOCK */}
                    <div className="flex-1 flex items-center justify-center gap-2 px-4 overflow-hidden">
                        {Array.from(pinnedPanels).map(id => (
                            <PinnedItem key={id} id={id} onUnpin={unpinPanel} />
                        ))}
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                        <div 
                            onClick={() => { setHelpInitialTab('status'); setShowHelp(true); }}
                            className="flex items-center gap-2 px-3 py-1.5 rounded border border-slate-800 bg-slate-900/50 cursor-pointer hover:bg-slate-800 transition-colors group"
                            title="Click to view System Status"
                        >
                            <div 
                                className={`w-2.5 h-2.5 rounded-full shadow-[0_0_8px] transition-all duration-500 ${
                                    systemHealth === 'green' ? 'bg-green-500 shadow-green-500/50' : 
                                    systemHealth === 'amber' ? 'bg-amber-500 shadow-amber-500/50' : 'bg-red-500 shadow-red-500/50'
                                }`} 
                            />
                            <div className="h-4 w-px bg-slate-700 mx-1"></div>
                            <GlobeAmericasIcon className="w-4 h-4 text-slate-400 group-hover:text-white transition-colors" />
                            <span className="text-xs font-bold text-slate-200">{activeRegion.name}</span>
                        </div>
                        
                        <div className="h-6 w-px bg-slate-800 mx-2"></div>
                        <button onClick={handleQuickExport} disabled={activeScenarios.length === 0} className="hidden md:block text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed group relative">
                            <ArrowDownTrayIcon className="w-5 h-5" />
                        </button>
                        
                        <div className="h-6 w-px bg-slate-800 mx-2"></div>
                        <button onClick={() => { setHelpInitialTab('guide'); setShowHelp(true); }} className="text-slate-400 hover:text-white shrink-0"><QuestionMarkCircleIcon className="w-5 h-5" /></button>
                    </div>
                </header>

                <main className="flex-1 flex overflow-hidden relative">
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
                        />
                    </div>
                    
                    {/* Standalone Map Home Button */}
                    <button 
                        onClick={handleHomeView} 
                        className="absolute bottom-24 left-8 z-10 bg-slate-900 border border-slate-700 p-3 rounded-full shadow-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-all hover:scale-110 active:scale-95 group"
                        title="Reset Map View"
                    >
                        <MapIcon className="w-6 h-6 group-hover:text-cyan-400" />
                    </button>

                    {selectedAsset && (
                        <AssetDetails 
                            asset={selectedAsset} 
                            regionName={activeRegion.name}
                            onClose={() => setSelectedAsset(null)}
                        />
                    )}

                    {/* Filter Panel (Left - Independent) */}
                    {!minimizedPanels.has('infra') && !pinnedPanels.has('infra') && (
                        <DraggablePanel 
                            key={`infra_${layoutKey}`} 
                            initialX={panelPositions['infra']?.x ?? 16} 
                            initialY={panelPositions['infra']?.y ?? 600} 
                            className="w-48"
                            zIndex={getZIndex('infra')}
                            onInteract={() => bringToFront('infra')}
                        >
                            <div className="bg-slate-900/90 backdrop-blur border border-slate-700 p-3 rounded-lg shadow-xl relative group pointer-events-auto">
                                <div className="absolute top-2 right-2 flex gap-1">
                                    <button onClick={() => pinPanel('infra')} className="text-slate-500 hover:text-cyan-400" title="Pin to top"><MapPinIcon className="w-3.5 h-3.5" /></button>
                                    <button onClick={() => toggleMinimize('infra')} className="text-slate-500 hover:text-white"><MinusIcon className="w-4 h-4" /></button>
                                </div>
                                <div className="flex justify-between items-center mb-2 cursor-pointer pr-10" onClick={() => setIsInfraCollapsed(!isInfraCollapsed)}>
                                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                                        <FunnelIcon className="w-3 h-3" /> Infrastructure
                                    </h3>
                                    <button className="text-slate-500 hover:text-white">
                                        <ChevronUpIcon className={`w-3 h-3 transition-transform ${isInfraCollapsed ? 'rotate-180' : ''}`} />
                                    </button>
                                </div>
                                
                                {!isInfraCollapsed && (
                                    <div className="space-y-1.5 animate-slideDown">
                                        {/* Search Box */}
                                        <div className="relative mb-2">
                                            <input 
                                                type="text" 
                                                placeholder="Search Assets (e.g. Airports)..." 
                                                value={customAssetQuery}
                                                onChange={(e) => setCustomAssetQuery(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && handleCustomAssetSearch()}
                                                className="w-full bg-slate-950 border border-slate-600 rounded text-[10px] text-white px-2 py-1 pr-6 focus:border-cyan-500 outline-none"
                                            />
                                            <button 
                                                onClick={handleCustomAssetSearch}
                                                className="absolute right-1 top-1 text-slate-400 hover:text-cyan-400"
                                                disabled={isSearchingAssets}
                                            >
                                                {isSearchingAssets ? <ArrowPathIcon className="w-3 h-3 animate-spin" /> : <MagnifyingGlassIcon className="w-3 h-3" />}
                                            </button>
                                        </div>

                                        {['Generation', 'Transmission', 'Distribution', 'Interconnector', 'Retail'].map(cat => (
                                            <button 
                                                key={cat}
                                                onClick={(e) => { e.stopPropagation(); toggleLayer(cat); }}
                                                className={`w-full flex items-center gap-2 px-2 py-1 rounded text-[10px] font-bold transition-all ${visibleLayers.has(cat) ? 'bg-slate-800 text-white' : 'text-slate-500 opacity-50'}`}
                                            >
                                                <div className={`w-2 h-2 rounded-full`} style={{backgroundColor: ASSET_TYPES.find(t => t.category === cat)?.color || '#fff'}}></div>
                                                {cat === 'Retail' ? 'Data / Retail' : cat}
                                            </button>
                                        ))}
                                        {/* Custom Category Button (Visible if active) */}
                                        {visibleLayers.has('Custom') && (
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); toggleLayer('Custom'); }}
                                                className={`w-full flex items-center gap-2 px-2 py-1 rounded text-[10px] font-bold transition-all ${visibleLayers.has('Custom') ? 'bg-slate-800 text-white' : 'text-slate-500 opacity-50'}`}
                                            >
                                                <div className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[8px] border-b-rose-500"></div>
                                                Custom Results
                                            </button>
                                        )}
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); toggleLayer('DNO Regions'); }}
                                            className={`w-full flex items-center gap-2 px-2 py-1 rounded text-[10px] font-bold transition-all ${visibleLayers.has('DNO Regions') ? 'bg-slate-800 text-white' : 'text-slate-500 opacity-50'}`}
                                        >
                                            <div className="w-2 h-2 rounded-full border border-slate-400"></div>
                                            DNO Zones
                                        </button>
                                        
                                        {/* Weather Radar Toggle */}
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); toggleLayer('Weather Radar'); }}
                                            className={`w-full flex items-center gap-2 px-2 py-1 rounded text-[10px] font-bold transition-all ${visibleLayers.has('Weather Radar') ? 'bg-slate-800 text-white' : 'text-slate-500 opacity-50'}`}
                                        >
                                            <CloudIcon className={`w-3 h-3 ${visibleLayers.has('Weather Radar') ? 'text-cyan-400' : ''}`} />
                                            Weather Radar
                                        </button>
                                    </div>
                                )}
                            </div>
                        </DraggablePanel>
                    )}

                    {/* Data Sync Panel */}
                    {!minimizedPanels.has('data_sync') && !pinnedPanels.has('data_sync') && (
                        <DraggablePanel 
                            key={`data_sync_${layoutKey}`} 
                            initialX={panelPositions['data_sync']?.x ?? 16} 
                            initialY={panelPositions['data_sync']?.y ?? 430} 
                            className="w-auto pointer-events-auto"
                            zIndex={getZIndex('data_sync')}
                            onInteract={() => bringToFront('data_sync')}
                        >
                            <div className="bg-slate-900/90 backdrop-blur border border-slate-700 p-3 rounded-lg shadow-xl w-64">
                                <div className="flex justify-between items-center mb-3 border-b border-slate-800 pb-2">
                                    <h3 className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest flex items-center gap-1">
                                        <ArrowPathIcon className="w-3 h-3" /> Data Sync
                                    </h3>
                                    <div className="flex gap-1">
                                        <button onClick={() => pinPanel('data_sync')} className="text-slate-500 hover:text-cyan-400" title="Pin to top"><MapPinIcon className="w-3.5 h-3.5" /></button>
                                        <button onClick={() => toggleMinimize('data_sync')}><MinusIcon className="w-3.5 h-3.5 text-slate-500 hover:text-white" /></button>
                                    </div>
                                </div>
                                
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center bg-slate-800/50 p-2 rounded">
                                        <div className="flex items-center gap-2">
                                            <UpdateTimer onTrigger={performUnifiedUpdate} isPaused={!allowBackgroundUpdates || isPlaying} intervalMinutes={updateInterval} />
                                        </div>
                                        <button 
                                            onClick={() => setAllowBackgroundUpdates(!allowBackgroundUpdates)}
                                            className={`text-xs font-bold px-2 py-1 rounded border transition-colors ${allowBackgroundUpdates ? 'bg-green-900/30 text-green-400 border-green-800' : 'bg-red-900/30 text-red-400 border-red-800'}`}
                                        >
                                            {allowBackgroundUpdates ? 'LIVE' : 'PAUSED'}
                                        </button>
                                    </div>

                                    <div className="px-1">
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-[9px] text-slate-400 uppercase font-bold">Update Interval</span>
                                            <span className="text--[9px] font-mono text-white">{updateInterval}m</span>
                                        </div>
                                        <input 
                                            type="range" min="1" max="60" step="1" 
                                            value={updateInterval} 
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUpdateInterval(Number(e.target.value))}
                                            disabled={!allowBackgroundUpdates}
                                            className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                                        />
                                    </div>

                                    <button 
                                        onClick={handleUpdateData}
                                        className="w-full flex items-center justify-center gap-2 bg-cyan-900/30 hover:bg-cyan-900/50 text-cyan-200 border border-cyan-500/30 py-2 rounded text-xs font-bold transition-colors"
                                    >
                                        <ArrowPathIcon className="w-3 h-3" /> Force Deep Update
                                    </button>
                                </div>
                            </div>
                        </DraggablePanel>
                    )}

                    {/* Scenarios Panel */}
                    {!minimizedPanels.has('scenarios_pane') && !pinnedPanels.has('scenarios_pane') && (
                        <DraggablePanel 
                            key={`scenarios_pane_${layoutKey}`} 
                            initialX={panelPositions['scenarios_pane']?.x ?? 16} 
                            initialY={panelPositions['scenarios_pane']?.y ?? 760} 
                            className="w-auto pointer-events-auto"
                            zIndex={getZIndex('scenarios_pane')}
                            onInteract={() => bringToFront('scenarios_pane')}
                        >
                            <div className="bg-slate-900/90 backdrop-blur border border-red-500/30 p-3 rounded-lg shadow-xl w-56 group">
                                <div className="flex justify-between items-center mb-3">
                                    <h3 className="text-[10px] font-bold text-red-400 uppercase tracking-widest flex items-center gap-1">
                                        <PlayIcon className="w-3 h-3" /> Scenarios
                                    </h3>
                                    <div className="flex gap-1">
                                        <button onClick={() => pinPanel('scenarios_pane')} className="text-slate-500 hover:text-cyan-400" title="Pin to top"><MapPinIcon className="w-3.5 h-3.5" /></button>
                                        <button onClick={() => toggleMinimize('scenarios_pane')}><MinusIcon className="w-3.5 h-3.5 text-slate-500 hover:text-white" /></button>
                                    </div>
                                </div>
                                <div className="text-xs text-slate-300 mb-3 bg-slate-800/50 p-2 rounded border border-slate-700/50">
                                    {activeScenarios.length > 0 ? (
                                        <span className="text-red-300 font-bold">{activeScenarios.length} Active Events</span>
                                    ) : (
                                        "No active simulations."
                                    )}
                                </div>
                                <button 
                                    onClick={() => setShowScenarioManager(true)} 
                                    className="w-full bg-red-600 hover:bg-red-500 text-white rounded py-2 text-xs font-bold transition-colors flex items-center justify-center gap-2 shadow-lg shadow-red-900/20"
                                >
                                    <ExclamationTriangleIcon className="w-4 h-4" /> Manage Scenarios
                                </button>
                            </div>
                        </DraggablePanel>
                    )}

                    {/* Reset View Panel */}
                    {!minimizedPanels.has('reset_view') && !pinnedPanels.has('reset_view') && (
                        <DraggablePanel 
                            key={`reset_view_${layoutKey}`} 
                            initialX={panelPositions['reset_view']?.x ?? 16} 
                            initialY={panelPositions['reset_view']?.y ?? (window.innerHeight - 140)} 
                            className="w-auto pointer-events-auto"
                            zIndex={getZIndex('reset_view')}
                            onInteract={() => bringToFront('reset_view')}
                        >
                            <div className="bg-slate-900/95 backdrop-blur border border-red-500/50 shadow-red-500/20 p-4 rounded-lg shadow-2xl w-72">
                                <div className="flex justify-between items-center mb-3">
                                    <h3 className="text-[10px] font-bold text-red-500 uppercase tracking-widest flex items-center gap-1">
                                        <StopCircleIcon className="w-3 h-3" /> View Control
                                    </h3>
                                    <div className="flex gap-1">
                                        <button onClick={() => pinPanel('reset_view')} className="text-slate-500 hover:text-cyan-400" title="Pin to top"><MapPinIcon className="w-3.5 h-3.5" /></button>
                                        <button onClick={() => toggleMinimize('reset_view')}><MinusIcon className="w-3 h-3 text-slate-500 hover:text-white" /></button>
                                    </div>
                                </div>
                                <button 
                                    onClick={handleResetSystem} 
                                    className="w-full bg-cyan-600 hover:bg-cyan-500 text-white rounded py-2 text-xs font-bold transition-colors flex items-center justify-center gap-2 shadow-lg"
                                >
                                    <ArrowPathIcon className="w-4 h-4" /> Reset System to Default
                                </button>
                            </div>
                        </DraggablePanel>
                    )}

                    {/* 2. System Status Card (Regional Network) (Moved to Top Left) */}
                    {!minimizedPanels.has('system_monitor') && !pinnedPanels.has('system_monitor') && (
                        <DraggablePanel 
                            key={`system_monitor_${layoutKey}`} 
                            initialX={panelPositions['system_monitor']?.x ?? 16} 
                            initialY={panelPositions['system_monitor']?.y ?? 70} 
                            className="w-auto pointer-events-auto"
                            zIndex={getZIndex('system_monitor')}
                            onInteract={() => bringToFront('system_monitor')}
                        >
                            <div className="bg-slate-900/90 backdrop-blur border border-slate-700 p-4 rounded-lg shadow-xl pointer-events-auto w-64 relative">
                                <div className="absolute top-2 right-2 flex gap-1">
                                    <button onClick={() => pinPanel('system_monitor')} className="text-slate-500 hover:text-cyan-400" title="Pin to top"><MapPinIcon className="w-3.5 h-3.5" /></button>
                                    <button onClick={() => toggleMinimize('system_monitor')} className="text-slate-500 hover:text-white"><MinusIcon className="w-4 h-4" /></button>
                                </div>
                                <div className="flex items-center gap-2 text-green-400 mb-2">
                                    <ShieldCheckIcon className="w-5 h-5" /> <span className="text-sm font-bold uppercase">Regional Network</span>
                                </div>
                                <p className="text-xs text-slate-400 mb-3">Monitoring {assets.length} assets across {activeRegion.name}.</p>
                                
                                <div className="border-t border-slate-700 pt-3 grid grid-cols-2 gap-y-3 gap-x-2 text-[10px]">
                                    <div 
                                        className="p-1 rounded cursor-pointer hover:bg-slate-800 transition-colors"
                                        onClick={() => setHistoryModalMetric('demand')}
                                        title="View Demand History"
                                    >
                                        <span className="block text-slate-500 font-bold uppercase flex items-center gap-1">
                                            Grid Demand <ChartBarIcon className="w-3 h-3" />
                                        </span>
                                        <span className="text-white font-mono text-base">{(nesoData.demand / 1000).toFixed(2)} GW</span>
                                    </div>
                                    <div 
                                        className="p-1 rounded cursor-pointer hover:bg-slate-800 transition-colors"
                                        onClick={() => setHistoryModalMetric('frequency')}
                                        title="View Frequency History"
                                    >
                                        <span className="block text-slate-500 font-bold uppercase flex items-center gap-1">
                                            Frequency <ChartBarIcon className="w-3 h-3" />
                                        </span>
                                        <span className={`font-mono text-base ${nesoData.frequency < 49.8 || nesoData.frequency > 50.2 ? 'text-red-400' : 'text-green-400'}`}>
                                            {nesoData.frequency.toFixed(3)} Hz
                                        </span>
                                    </div>
                                    {generationMix && (
                                        <>
                                            <div className="group cursor-pointer" onClick={() => setShowGenList('Renewables')}>
                                                <span className="text-green-500 font-bold uppercase flex items-center gap-1">Renewables <ListBulletIcon className="w-3 h-3 text-slate-500 group-hover:text-green-400" /></span>
                                                <span className="text-white font-mono text-sm group-hover:underline">{generationMix.renewablesPerc}%</span>
                                            </div>
                                            <div className="group cursor-pointer" onClick={() => setShowGenList('Fossil')}>
                                                <span className="text-orange-500 font-bold uppercase flex items-center gap-1">Fossil Fuel <ListBulletIcon className="w-3 h-3 text-slate-500 group-hover:text-orange-400" /></span>
                                                <span className="text-white font-mono text-sm group-hover:underline">{generationMix.fossilPerc}%</span>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        </DraggablePanel>
                    )}

                    {/* Grid Status Panel / Live Outages (Moved Underneath System Monitor) */}
                    {!isGrowthMode && !minimizedPanels.has('grid_status') && !pinnedPanels.has('grid_status') && (
                        <DraggablePanel 
                            key={`grid_status_${layoutKey}`} 
                            initialX={panelPositions['grid_status']?.x ?? 16} 
                            initialY={panelPositions['grid_status']?.y ?? 280} 
                            className="w-48"
                            zIndex={getZIndex('grid_status')}
                            onInteract={() => bringToFront('grid_status')}
                        >
                             <div className="relative group pointer-events-auto">
                                <div className="absolute top-1 right-1 z-20 flex gap-1">
                                    <button onClick={() => pinPanel('grid_status')} className="p-1 bg-slate-900/50 rounded hover:bg-slate-800 text-slate-400 hover:text-cyan-400" title="Pin"><MapPinIcon className="w-3 h-3" /></button>
                                    <button onClick={() => toggleMinimize('grid_status')} className="p-1 bg-slate-900/50 rounded hover:bg-slate-800 text-slate-400 hover:text-white"><MinusIcon className="w-3 h-3" /></button>
                                </div>
                                <div 
                                    onClick={() => setShowOutageList(true)}
                                    className={`bg-slate-900/90 ${liveOutages.length > 0 ? 'bg-red-900/90 border-red-500/50 hover:bg-red-900' : 'bg-emerald-900/90 border-emerald-500/50 hover:bg-emerald-900'} backdrop-blur border p-3 rounded-lg shadow-xl animate-fadeIn text-left transition-all w-full cursor-pointer hover:scale-105 relative overflow-hidden`}
                                >
                                    <div className="flex justify-between items-start">
                                        <h3 className={`text-[10px] font-bold ${liveOutages.length > 0 ? 'text-red-200' : 'text-emerald-200'} uppercase tracking-widest mb-1 flex items-center gap-1`}>
                                            {liveOutages.length > 0 ? <ExclamationTriangleIcon className="w-3 h-3 animate-pulse" /> : <ShieldCheckIcon className="w-3 h-3" />} 
                                            {liveOutages.length > 0 ? 'Live Outages' : 'Grid Status'}
                                        </h3>
                                        <div className="w-10 h-4"></div> {/* Spacer for buttons */}
                                    </div>
                                    <p className="text-xs text-white font-bold group-hover:underline underline-offset-2 mb-1">
                                        {liveOutages.length > 0 ? `${liveOutages.length} Active Incidents` : 'System Nominal'}
                                    </p>
                                    <p className="text-[9px] text-slate-400 font-mono text-right">
                                        Last Updated: {lastOutageCheck.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                    </p>
                                </div>
                            </div>
                        </DraggablePanel>
                    )}

                    {/* Engineering Work Panel (Right - Independent) */}
                    {!minimizedPanels.has('engineering_work') && !pinnedPanels.has('engineering_work') && maintenanceAssets.length > 0 && (
                        <DraggablePanel 
                            key={`engineering_work_${layoutKey}`} 
                            initialX={panelPositions['engineering_work']?.x ?? (window.innerWidth - 380)} 
                            initialY={panelPositions['engineering_work']?.y ?? (activeScenarios.length > 0 ? 730 : 400)} 
                            className="w-auto pointer-events-auto"
                            zIndex={getZIndex('engineering_work')}
                            onInteract={() => bringToFront('engineering_work')}
                        >
                            <div className="bg-slate-900/90 backdrop-blur border border-amber-500/30 p-3 rounded-lg shadow-xl relative group pointer-events-auto w-80">
                                <div className="absolute top-1 right-1 z-20 flex gap-1">
                                    <button onClick={() => pinPanel('engineering_work')} className="p-1 bg-slate-900/50 rounded hover:bg-slate-800 text-slate-400 hover:text-cyan-400" title="Pin"><MapPinIcon className="w-3 h-3" /></button>
                                    <button onClick={() => toggleMinimize('engineering_work')} className="p-1 bg-slate-900/50 rounded hover:bg-slate-800 text-slate-400 hover:text-white"><MinusIcon className="w-3 h-3" /></button>
                                </div>
                                <h3 className="text-[10px] font-bold text-amber-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                                    <WrenchScrewdriverIcon className="w-3 h-3" /> Engineering Work
                                </h3>
                                
                                <div className="space-y-1 max-h-32 overflow-y-auto custom-scrollbar">
                                    {maintenanceAssets.map(asset => (
                                        <div key={asset.id} onClick={() => { setSelectedAsset(asset); setMapCenterOverride({ lat: asset.lat, lng: asset.lng, zoom: 14 }); }} className="flex justify-between items-center text-xs p-1 hover:bg-slate-800 rounded cursor-pointer">
                                            <span className="text-slate-300 truncate w-48">{asset.name}</span>
                                            <span className="text-amber-400 text-[9px] uppercase border border-amber-900 bg-amber-900/30 px-1 rounded">Maint.</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </DraggablePanel>
                    )}
                    
                    {/* NEW: Supply Chain Panel */}
                    {!minimizedPanels.has('supply_chain') && !pinnedPanels.has('supply_chain') && (
                        <DraggablePanel 
                            key={`supply_chain_${layoutKey}`} 
                            initialX={panelPositions['supply_chain']?.x ?? (window.innerWidth - 300)} 
                            initialY={panelPositions['supply_chain']?.y ?? 700} 
                            className="w-auto pointer-events-auto"
                            zIndex={getZIndex('supply_chain')}
                            onInteract={() => bringToFront('supply_chain')}
                        >
                            <div className="bg-slate-900/90 backdrop-blur border border-indigo-500/30 p-3 rounded-lg shadow-xl relative group pointer-events-auto w-64">
                                <div className="absolute top-1 right-1 z-20 flex gap-1">
                                    <button onClick={() => pinPanel('supply_chain')} className="p-1 bg-slate-900/50 rounded hover:bg-slate-800 text-slate-400 hover:text-cyan-400" title="Pin"><MapPinIcon className="w-3 h-3" /></button>
                                    <button onClick={() => toggleMinimize('supply_chain')} className="p-1 bg-slate-900/50 rounded hover:bg-slate-800 text-slate-400 hover:text-white"><MinusIcon className="w-3 h-3" /></button>
                                </div>
                                <h3 className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                                    <TruckIcon className="w-3 h-3 text-indigo-500" /> Supply Chain
                                </h3>
                                <div className="text-xs text-slate-300 mb-3">
                                    {supplyChainInsights.length > 0 ? `${supplyChainInsights.length} Risks Identified` : "No active analysis."}
                                </div>
                                <button 
                                    onClick={() => { setShowSupplyChainModal(true); if (supplyChainInsights.length === 0) handleRunSupplyChainAnalysis(); }} 
                                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-bold transition-colors flex items-center justify-center gap-2"
                                >
                                    {supplyChainInsights.length > 0 ? "View Details" : "Run Analysis"}
                                </button>
                            </div>
                        </DraggablePanel>
                    )}
                    
                    {/* NEW: Reporting Panel */}
                    {!minimizedPanels.has('reporting') && !pinnedPanels.has('reporting') && (
                        <DraggablePanel 
                            key={`reporting_${layoutKey}`} 
                            initialX={panelPositions['reporting']?.x ?? (window.innerWidth - 300)} 
                            initialY={panelPositions['reporting']?.y ?? 250} 
                            className="w-auto pointer-events-auto"
                            zIndex={getZIndex('reporting')}
                            onInteract={() => bringToFront('reporting')}
                        >
                            <div className="bg-slate-900/90 backdrop-blur border border-slate-700 p-3 rounded-lg shadow-xl relative group pointer-events-auto w-64">
                                <div className="absolute top-1 right-1 z-20 flex gap-1">
                                    <button onClick={() => pinPanel('reporting')} className="p-1 bg-slate-900/50 rounded hover:bg-slate-800 text-slate-400 hover:text-cyan-400" title="Pin"><MapPinIcon className="w-3 h-3" /></button>
                                    <button onClick={() => toggleMinimize('reporting')} className="p-1 bg-slate-900/50 rounded hover:bg-slate-800 text-slate-400 hover:text-white"><MinusIcon className="w-3 h-3" /></button>
                                </div>
                                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                                    <PrinterIcon className="w-3 h-3" /> Reporting Center
                                </h3>
                                
                                {activeScenarios.length === 0 ? (
                                    <div className="text-xs text-red-300 bg-red-900/20 border border-red-500/20 p-2 rounded text-center">
                                        <p className="font-bold">System Nominal</p>
                                        <p className="text-[10px] mt-1 opacity-70">No active incidents or scenarios to report on.</p>
                                    </div>
                                ) : (
                                    <div>
                                        <div className="text-xs text-slate-300 mb-2">
                                            {activeScenarios.length} active scenario(s) selected. 
                                            {generatedScript ? ' Report ready for print.' : ' Generate report to enable printing.'}
                                        </div>
                                        <button 
                                            onClick={handlePrintReport} 
                                            className="w-full py-2 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs font-bold transition-colors flex items-center justify-center gap-2"
                                        >
                                            <PrinterIcon className="w-4 h-4" />
                                            {generatedScript ? 'Print / Preview Report' : 'Generate & Print'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </DraggablePanel>
                    )}

                    {/* Right Panel Group (Separated Panels) */}
                    
                    {/* 1. Scenario Active Stats Panel (Only visible when running) */}
                    {activeScenarios.length > 0 && !minimizedPanels.has('scenario_stats') && !pinnedPanels.has('scenario_stats') && (
                        <DraggablePanel 
                            key={`scenario_stats_${layoutKey}`} 
                            initialX={panelPositions['scenario_stats']?.x ?? (window.innerWidth - 480)} 
                            initialY={panelPositions['scenario_stats']?.y ?? 16} 
                            className="w-auto pointer-events-auto"
                            zIndex={getZIndex('scenario_stats')}
                            onInteract={() => bringToFront('scenario_stats')}
                        >
                            <div className={`bg-slate-900/95 backdrop-blur border ${isGrowthMode ? 'border-green-500/50' : 'border-red-500/50'} p-4 rounded-lg shadow-xl animate-fadeIn transition-all duration-300 relative ${chartMode === 'minimal' ? 'w-64' : chartMode === 'hidden' ? 'w-80' : 'w-[450px]'}`}>
                                <div className="absolute top-2 right-2 flex gap-1">
                                    <button onClick={() => pinPanel('scenario_stats')} className="text-slate-500 hover:text-cyan-400" title="Pin to top"><MapPinIcon className="w-3.5 h-3.5" /></button>
                                    <button onClick={() => toggleMinimize('scenario_stats')} className="text-slate-500 hover:text-white"><MinusIcon className="w-4 h-4" /></button>
                                </div>
                                <div className="flex justify-between items-start mb-2 pr-12">
                                    <div className="flex items-center gap-2">
                                        <h2 className={`text-sm font-bold ${isGrowthMode ? 'text-green-400' : 'text-red-400'} uppercase tracking-widest animate-pulse truncate max-w-[120px]`}>
                                            {statusLabel}
                                        </h2>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        {/* Audio Report Button Restore */}
                                        <button 
                                            onClick={handleGenerateReport} 
                                            className="text-cyan-400 hover:text-white transition-colors"
                                            title="Generate Audio Briefing"
                                        >
                                            <SpeakerWaveIcon className="w-4 h-4" />
                                        </button>
                                        <div className="h-4 w-px bg-slate-700 mx-1"></div>
                                        <button onClick={cycleChartMode} className="text-slate-500 hover:text-white" title="Toggle View Mode">
                                            {chartMode === 'hidden' ? <ArrowsPointingOutIcon className="w-4 h-4" /> : 
                                             chartMode === 'minimal' ? <ArrowsPointingOutIcon className="w-4 h-4 rotate-45" /> : 
                                             <ArrowsPointingInIcon className="w-4 h-4" />}
                                        </button>
                                        <button onClick={handleResetSystem} className="text-slate-500 hover:text-white"><XMarkIcon className="w-4 h-4" /></button>
                                    </div>
                                </div>

                                {chartMode !== 'hidden' && (
                                    <>
                                        <h1 className={`font-bold text-white leading-tight mb-1 truncate ${chartMode === 'minimal' ? 'text-sm' : 'text-xl'}`}>
                                            {activeScenarios.length > 1 ? `Composite Event` : activeScenarios[0].name}
                                        </h1>
                                        {chartMode === 'normal' && (
                                            <p className="text-xs text-slate-400 mb-4 line-clamp-2">
                                                {activeScenarios.length > 1 ? activeScenarios.map(s => s.name).join(", ") : activeScenarios[0].description}
                                            </p>
                                        )}
                                        
                                        <div className={`grid gap-2 mb-2 ${chartMode === 'minimal' ? 'grid-cols-1' : 'grid-cols-2'}`}>
                                            <div className="bg-slate-800 p-2 rounded flex justify-between items-center">
                                                <div className="text-[10px] text-slate-500 uppercase">{metricLabel}</div>
                                                <div className="text-base font-mono font-bold text-white">
                                                    {(currentStats.consumers || 0).toLocaleString()}
                                                </div>
                                            </div>
                                            {(chartMode === 'normal' || chartMode === 'minimal') && (
                                                <div className="bg-slate-800 p-2 rounded flex justify-between items-center">
                                                    <div className="text-[10px] text-slate-500 uppercase">{costLabel}</div>
                                                    <div className={`text-base font-mono font-bold ${isGrowthMode ? 'text-green-400' : 'text-yellow-500'}`}>
                                                        ${(currentStats.cost || 0).toFixed(1)}M
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        
                                        {chartMode === 'normal' && (
                                            <div className="w-full relative mt-2 animate-slideDown h-48">
                                                <ImpactChart 
                                                    data={timeline} 
                                                    currentDay={currentDay} 
                                                    onPointClick={setSelectedPointInfo}
                                                />
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </DraggablePanel>
                    )}

                    {/* NEW: Standby Capacity Panel (Independent) */}
                    {!minimizedPanels.has('standby_list') && !pinnedPanels.has('standby_list') && (
                        <DraggablePanel 
                            key={`standby_list_${layoutKey}`} 
                            initialX={panelPositions['standby_list']?.x ?? (window.innerWidth - 300)} 
                            initialY={panelPositions['standby_list']?.y ?? 560} 
                            className="w-auto pointer-events-auto"
                            zIndex={getZIndex('standby_list')}
                            onInteract={() => bringToFront('standby_list')}
                        >
                             <div className="bg-slate-900/90 backdrop-blur border border-slate-700 p-3 rounded-lg shadow-xl relative group pointer-events-auto w-64">
                                <div className="absolute top-1 right-1 z-20 flex gap-1">
                                    <button onClick={() => pinPanel('standby_list')} className="p-1 bg-slate-900/50 rounded hover:bg-slate-800 text-slate-400 hover:text-cyan-400" title="Pin"><MapPinIcon className="w-3 h-3" /></button>
                                    <button onClick={() => toggleMinimize('standby_list')} className="p-1 bg-slate-900/50 rounded hover:bg-slate-800 text-slate-400 hover:text-white"><MinusIcon className="w-3 h-3" /></button>
                                </div>
                                <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                                    <PauseCircleIcon className="w-3 h-3" /> Standby Capacity
                                </h3>
                                <div className="max-h-32 overflow-y-auto custom-scrollbar space-y-1">
                                    {standbyAssets.length === 0 ? (
                                        <div className="text-[9px] text-slate-600 italic">No assets on standby.</div>
                                    ) : (
                                        standbyAssets.map(asset => (
                                            <div 
                                                key={asset.id} 
                                                onClick={() => { setSelectedAsset(asset); setMapCenterOverride({ lat: asset.lat, lng: asset.lng, zoom: 14 }); }}
                                                className="flex justify-between text-[10px] hover:bg-slate-800 rounded px-1 cursor-pointer group"
                                            >
                                                <span className="text-slate-300 truncate w-48 group-hover:text-white">{asset.name}</span>
                                                <span className="text-slate-500 font-mono">{asset.capacityMW}MW</span>
                                            </div>
                                        ))
                                    )}
                                </div>
                             </div>
                        </DraggablePanel>
                    )}

                    {/* 3. Chat Panel (Independent & Movable) */}
                    {showChat && !minimizedPanels.has('chat') && !pinnedPanels.has('chat') && (
                        <DraggablePanel 
                            key={`chat_${layoutKey}`} 
                            initialX={panelPositions['chat']?.x ?? (window.innerWidth - 420)} 
                            initialY={panelPositions['chat']?.y ?? (window.innerHeight - 600)} 
                            className="w-auto pointer-events-auto"
                            zIndex={getZIndex('chat')}
                            onInteract={() => bringToFront('chat')}
                        >
                            <div className="w-96 h-[500px] shadow-2xl rounded-2xl overflow-hidden backdrop-blur-md relative">
                                <div className="absolute top-4 right-4 z-50 flex gap-1">
                                    <button onClick={() => pinPanel('chat')} className="text-slate-400 hover:text-cyan-400" title="Pin to top"><MapPinIcon className="w-4 h-4" /></button>
                                    <button onClick={() => toggleMinimize('chat')} className="text-slate-400 hover:text-white"><MinusIcon className="w-5 h-5" /></button>
                                </div>
                                 <ChatPanel 
                                    isOpen={true} 
                                    activeScenarios={activeScenarios}
                                    assetCount={assets.length} 
                                    regionName={activeRegion.name}
                                    nesoData={nesoData}
                                    outages={[...liveOutages, ...(showHistorical ? historicalOutages : [])]}
                                    onMapAction={handleMapAction}
                                />
                            </div>
                        </DraggablePanel>
                    )}

                    {/* Generation List Modal - Draggable */}
                    {showGenList && (
                        <DraggablePanel 
                            key={'gen_list_' + layoutKey} 
                            initialX={window.innerWidth - 750} 
                            initialY={200} 
                            className="w-auto pointer-events-auto"
                            zIndex={getZIndex('gen_list')}
                            onInteract={() => bringToFront('gen_list')}
                        >
                            <GenerationListPanel 
                                title={showGenList === 'Renewables' ? 'Renewable Generators' : 'Fossil Fuel Generators'}
                                assets={generationListAssets}
                                onClose={() => setShowGenList(null)}
                                onSelectAsset={(a) => { setSelectedAsset(a); setMapCenterOverride({ lat: a.lat, lng: a.lng, zoom: 14 }); }}
                            />
                        </DraggablePanel>
                    )}

                    {/* Dock for Minimized Panels - REORGANIZED to grid 5 cols */}
                    {(minimizedPanels.size > 0 || (showChat && minimizedPanels.has('chat'))) && (
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[400] bg-slate-900/80 backdrop-blur border border-slate-700 p-2 rounded-xl animate-slideUp grid grid-cols-5 gap-2 shadow-2xl">
                            {/* Infrastructure */}
                            {minimizedPanels.has('infra') && (
                                <button onClick={() => restorePanel('infra')} className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-white" title="Infrastructure Filter">
                                    <FunnelIcon className="w-6 h-6" />
                                </button>
                            )}
                            {/* Data Sync (New) */}
                            {minimizedPanels.has('data_sync') && (
                                <button onClick={() => restorePanel('data_sync')} className="p-2 hover:bg-slate-800 rounded text-cyan-400 hover:text-white" title="Data Synchronization">
                                    <ArrowPathIcon className="w-6 h-6" />
                                </button>
                            )}
                            {/* Scenarios (New) */}
                            {minimizedPanels.has('scenarios_pane') && (
                                <button onClick={() => restorePanel('scenarios_pane')} className="p-2 hover:bg-slate-800 rounded text-red-400 hover:text-white" title="Scenarios">
                                    <PlayIcon className="w-6 h-6" />
                                </button>
                            )}
                             {minimizedPanels.has('grid_status') && (
                                <button onClick={() => restorePanel('grid_status')} className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-white" title="Grid Status">
                                    <ExclamationTriangleIcon className="w-6 h-6" />
                                </button>
                            )}
                             {minimizedPanels.has('system_monitor') && (
                                <button onClick={() => restorePanel('system_monitor')} className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-white" title="System Monitor">
                                    <ShieldCheckIcon className="w-6 h-6" />
                                </button>
                            )}
                            {minimizedPanels.has('standby_list') && (
                                <button onClick={() => restorePanel('standby_list')} className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-white" title="Standby Capacity">
                                    <PauseCircleIcon className="w-6 h-6" />
                                </button>
                            )}
                             {minimizedPanels.has('engineering_work') && maintenanceAssets.length > 0 && (
                                <button onClick={() => restorePanel('engineering_work')} className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-white" title="Engineering Work">
                                    <WrenchScrewdriverIcon className="w-6 h-6" />
                                </button>
                            )}
                             {activeScenarios.length > 0 && minimizedPanels.has('scenario_stats') && (
                                <button onClick={() => restorePanel('scenario_stats')} className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-white" title="Scenario Stats">
                                    <VideoCameraIcon className="w-6 h-6" />
                                </button>
                            )}
                             {minimizedPanels.has('chat') && (
                                <button onClick={() => restorePanel('chat')} className="p-2 hover:bg-slate-800 rounded text-cyan-400 hover:text-white" title="Analyst AI">
                                    <ChatBubbleLeftRightIcon className="w-6 h-6" />
                                </button>
                            )}
                            {minimizedPanels.has('supply_chain') && (
                                <button onClick={() => restorePanel('supply_chain')} className="p-2 hover:bg-slate-800 rounded text-indigo-400 hover:text-white" title="Supply Chain">
                                    <TruckIcon className="w-6 h-6" />
                                </button>
                            )}
                            {minimizedPanels.has('reporting') && (
                                <button onClick={() => restorePanel('reporting')} className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-white" title="Reporting Center">
                                    <PrinterIcon className="w-6 h-6" />
                                </button>
                            )}
                            {/* Reset (New) */}
                            {minimizedPanels.has('reset_view') && (
                                <button onClick={() => restorePanel('reset_view')} className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-white" title="Reset View">
                                    <StopCircleIcon className="w-6 h-6 text-red-600" />
                                </button>
                            )}
                        </div>
                    )}
                    
                </main>
                
                {/* Modals and Overlays */}
                {historyModalMetric && (
                    <GridHistoryModal 
                        metric={historyModalMetric} 
                        onClose={() => setHistoryModalMetric(null)} 
                    />
                )}

                {activeScenarios.length > 0 && chartMode !== 'hidden' && !minimizedPanels.has('scenario_stats') && !pinnedPanels.has('scenario_stats') && (
                    <div className="flex-none z-40 relative animate-slideUp">
                        <TimelineControl 
                            currentDay={currentDay} 
                            totalDays={timeline.length - 1} 
                            isPlaying={isPlaying} 
                            playbackSpeed={playbackSpeed}
                            onPlayPause={() => setIsPlaying(!isPlaying)} 
                            onSeek={setCurrentDay}
                            onSpeedChange={setPlaybackSpeed}
                        />
                    </div>
                )}
            </div>

            {/* Modals and Overlays */}
            {isTourActive && <TourGuide onClose={() => setIsTourActive(false)} onStepChange={handleTourStep} />}
            {showScenarioManager && (
                <ScenarioManager 
                    scenarios={scenarios}
                    onRunSimulation={handleRunSimulation}
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
            
            {showSupplyChainModal && (
                <SupplyChainModal
                    onClose={() => setShowSupplyChainModal(false)}
                    insights={supplyChainInsights}
                    isLoading={isSupplyChainLoading}
                    progress={supplyChainProgress}
                    regionName={`${activeRegion?.name || 'Region'}`}
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

            {/* Consolidated Help Modal (Restores Missing Data) */}
            {showHelp && (
                <HelpModal 
                    onClose={() => setShowHelp(false)} 
                    onLaunchTour={() => { setShowHelp(false); setIsTourActive(true); }}
                    initialTab={helpInitialTab}
                />
            )}

            {isLoading && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm animate-fadeIn">
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
