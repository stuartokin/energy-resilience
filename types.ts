
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
    status?: 'New' | 'Updated' | 'User' | 'Standard';
    sources?: string[];
}

export interface TimelineStep {
    day: number;
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
