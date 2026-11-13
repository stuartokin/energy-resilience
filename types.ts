
export interface AssetType {
    id: string;
    label: string;
    category: 'Generation' | 'Transmission' | 'Distribution' | 'Retail' | 'Interconnector';
    color: string;
    icon?: string;
}

export interface InfrastructureAsset {
    id: string;
    name: string;
    typeId: string; // References AssetType.id
    lat: number;
    lng: number;
    capacityMW?: number;
    status: 'Operational' | 'Compromised' | 'Offline' | 'Maintenance';
    affectedRadiusKm?: number; // Visual ripple effect
    // For linear assets (lines, pipes)
    endLat?: number;
    endLng?: number;
    path?: {lat: number, lng: number}[]; 
    commissionYear?: number; // For historical visualization
    
    // Live Data Properties
    liveStatus?: 'generating' | 'standby' | 'offline'; // 'generating' = Active/Blinking
    liveOutputDesc?: string; // e.g., "Active (Base Load)"
    
    // Extra Details
    voltageKV?: number;
    rawTags?: any;
}

export interface DNORegion {
    id: string;
    name: string;
    operator: string;
    color: string;
    households: number;
    industryCount: number;
    path: {lat: number, lng: number}[]; // rough outline (fallback)
    polygons?: [number, number][][];    // real boundary rings [lat, lng] from NESO, when available
}

export interface OutageEvent {
    id: string;
    locationName: string;
    lat: number;
    lng: number;
    consumersAffected: number;
    description: string;
    startTime: string;
    estRestoration?: string;
    source: string; // DNO name or News source
    status: 'Active' | 'Investigating' | 'Restoring' | 'Resolved';
    isSimulated?: boolean;
}

// Elexon REMIT notice: a power station, interconnector or storage unit that is (partly) unavailable.
export interface GeneratorOutage {
    id: string;             // REMIT mRID
    unit: string;           // BM unit, e.g. KLYN-A-1
    siteName?: string;      // e.g. Kings Lynn (from the BM unit lookup)
    lat?: number;
    lng?: number;
    fuelType: string;
    eventType: string;      // Production / Consumption / Transmission unavailability
    planned: boolean;
    normalMW: number;
    availableMW: number;
    unavailableMW: number;
    cause: string;
    start: string;
    end: string;
    participant: string;
}

export interface GenerationMixItem {
    fuel: string;
    perc: number;
}

export interface GenerationMix {
    from: string;
    to: string;
    generation: GenerationMixItem[];
    renewablesPerc: number;
    fossilPerc: number;
    lowCarbonPerc: number;
}

export interface ScenarioLocation {
    name: string;
    lat: number;
    lng: number;
}

export interface RiskScenario {
    id: string;
    name: string;
    category: 'Storm' | 'Cyber' | 'Asset Failure' | 'Supply Chain' | 'Geopolitical' | 'Growth' | string;
    description: string;
    probability: string; // Low, Medium, High
    impactLevel: string; // Minor, Major, Critical
    
    // Simulation Data
    durationDays: number;
    peakConsumersAffected: number;
    affectedAssets: string[]; // IDs of assets
    affectedDistricts?: string[]; // Specific towns or districts
    coordinates?: { lat: number, lng: number }; // Primary center
    locations?: ScenarioLocation[]; // Multiple impact locations
    region: string;
    
    // Narrative for reports
    narrative: string;
    
    // Metadata
    isUserCreated?: boolean;
    isNew?: boolean;
    lastUpdated?: number;
    status?: 'New' | 'Updated' | 'User' | 'Standard' | 'Proposal';
    suggestedPattern?: string; // AI proposals: which library pattern the AI suggests modelling it on (the user decides)
    basedOn?: string;          // id of the library scenario whose sourced numbers this one uses
    sources?: string[];

    // Phase 4: transparent impact model (services/impactModel.ts). Library scenarios have these.
    model?: ImpactProfile;
    rationale?: string;          // why these numbers: the reasoning, labelled where it is an assumption
    references?: string[];       // ids of REFERENCE_EVENTS this scenario is calibrated against or compares with
    supplyLost?: { mw: number; label: string }; // supply or capacity lost (informational)
    customersBasis?: 'sourced' | 'scaled' | 'assumption';
    footprint?: Footprint;       // where on the map the impact is drawn (services/footprint.ts)
    events?: { atHours: number; text: string }[]; // captions shown on the map as the scenario plays
}

// Where a scenario's impact falls. Areas are Grid Supply Point areas (NESO boundaries).
//   areas:   'national' (all GB), regions (network-operator areas by name), a point (nearest areas),
//            'placeable' (you choose the place with "Place it"; until then shown spread across GB),
//            or 'none' (no customer cuts drawn)
//   pattern: spread   - outward from the centre; the centre stays dark longest (storms, local events)
//            scatter  - scattered across the footprint (automatic low-frequency disconnection)
//            patches  - whole regions return in patches (black start restoration)
//            rota     - blocks switch off and on in rotation (rota disconnections)
//   routes:  energy-flow routes to show as cut (ids from services/flows.ts, or 'largestGas',
//            'largestElec', 'lng', 'norway')
//   fleet:   generator fuel types to flag on the map (common-mode failures)
export interface Footprint {
    areas: 'national' | 'placeable' | 'none' | { regions: string[] } | { point: { lat: number; lng: number; label: string } };
    pattern?: 'spread' | 'scatter' | 'patches' | 'rota';
    routes?: string[];
    fleet?: string[];
    placedAt?: string;           // label of the place chosen with "Place it"
}

// How customers lose and regain supply over time. All times in hours from the start of the event.
export type ImpactProfile =
    | { type: 'instant'; peak: number; offHours: number; restoreHours: number }
    | { type: 'storm'; peak: number; buildHours: number; pctRestored24h: number; pctStillOff7d: number }
    | { type: 'restoration'; peak: number; delayHours: number; pct24h: number; fullHours: number }
    | { type: 'rota'; shareOff: number; days: number }
    | { type: 'none'; days: number }
    | { type: 'growth'; mwAdded: number; years: number };

export interface TimelineStep {
    day: number;                // step index (kept as "day" for compatibility)
    hours?: number;             // hours since the event started
    label?: string;             // "Hour 6", "Day 2.5" or "2019"
    energyUnservedMWh?: number; // cumulative
    consumersOffline: number; // The primary metric (or Capacity Added for Growth scenarios)
    costMillions: number; // Financial impact (or Investment for Growth scenarios)
    restorationPct: number;
    activeAlerts: string[];
    description: string;
}

export interface SimulationData {
    scenarioId: string;
    timeline: TimelineStep[];
    totalCostMillions: number;
}

export interface RegionConfig {
    id: string;
    name: string;
    lat: number;
    lng: number;
    zoom: number;
}

export interface ChatMessage {
    role: 'user' | 'model';
    text: string;
    timestamp: number;
}

export interface SaveData {
    version: string;
    timestamp: number;
    scenarios: RiskScenario[];
    cachedAssets: InfrastructureAsset[];
    cachedOutages?: OutageEvent[];
}

export interface SupplyChainInsight {
    supplier: string;
    techDomain: 'SCADA' | 'DCS' | 'Industrial Automation' | 'OT Security';
    operatorConnection: string;
    potentialAssets: string[];
    evidence: string;
    probability: 'High' | 'Medium' | 'Low';
    sources: string[];
}

export interface LogEntry {
    timestamp: number;
    message: string;
    details?: string;
    type: 'error' | 'warning' | 'info';
}

export enum PlaybackState {
    IDLE,
    PLAYING,
    PAUSED,
    COMPLETED
}
