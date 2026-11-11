import { AssetType, InfrastructureAsset, RegionConfig, RiskScenario, TimelineStep, DNORegion } from './types';

export const APP_VERSION = "3.0.0";
export const BUILD_DATE = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
export const AI_BUILD_ID = "Gemini 2.5 Flash (visitor key)";

// SVG Paths for Google Maps Symbols
const ICONS = {
    NUCLEAR: "M12 2L9 7H15L12 2M12 22L9 17H15L12 22M2 12L7 15V9L2 12M22 12L17 15V9L22 12M12 10A2 2 0 1 0 12 14A2 2 0 1 0 12 10",
    WIND: "M12,2L12,22 M12,2L8,8 M12,2L16,8",
    SOLAR: "M4 4H20V20H4V4M6 6V18H18V6H6M8 8V16H16V8H8",
    GAS: "M12,2Q16,8 16,14A4,4 0 0,1 12,18A4,4 0 0,1 8,14Q8,8 12,2",
    FACTORY: "M2 22H22V10L18 14L14 10L10 14L6 10V22",
    BATTERY: "M8 6H16V18H8V6M10 2V6H14V2H10",
    SERVER: "M4 4H20V8H4V4M4 10H20V14H4V10M4 16H20V20H4V16",
    GRID: "M4 12H20M12 4V20",
    CONNECTOR: "M4 12H20M20 12L17 9M20 12L17 15M4 12L7 9M4 12L7 15",
    TRIANGLE: "M12 2L22 22H2L12 2Z"
};

export const ASSET_TYPES: AssetType[] = [
    { id: 'nuclear', label: 'Nuclear Generation', category: 'Generation', color: '#a855f7', icon: ICONS.NUCLEAR }, // Purple
    { id: 'wind_offshore', label: 'Offshore Wind', category: 'Generation', color: '#22d3ee', icon: ICONS.WIND }, // Cyan
    { id: 'wind_onshore', label: 'Onshore Wind', category: 'Generation', color: '#10b981', icon: ICONS.WIND }, // Emerald
    { id: 'solar', label: 'Solar Farm', category: 'Generation', color: '#facc15', icon: ICONS.SOLAR }, // Yellow
    { id: 'gas', label: 'Gas Terminal/Gen', category: 'Generation', color: '#f97316', icon: ICONS.GAS }, // Orange
    { id: 'hydro', label: 'Hydro / Pumped Storage', category: 'Generation', color: '#3b82f6', icon: ICONS.GAS }, // Blue (Reuse Gas/Liquid shape)
    { id: 'storage', label: 'Battery Storage (BESS)', category: 'Generation', color: '#84cc16', icon: ICONS.BATTERY }, // Lime
    
    { id: 'substation', label: 'National Grid Substation', category: 'Transmission', color: '#eab308', icon: ICONS.GRID }, // Yellow
    { id: 'compressor', label: 'Gas Compressor Stn', category: 'Transmission', color: '#57534e', icon: ICONS.FACTORY }, // Stone
    { id: 'transmission_elec', label: 'HV Transmission Line', category: 'Transmission', color: '#60a5fa' }, // Blue-400
    { id: 'distribution_elec', label: 'Distribution Line', category: 'Distribution', color: '#f59e0b' }, // Amber
    { id: 'pipeline_gas', label: 'Gas Pipeline', category: 'Transmission', color: '#78716c' }, // Stone-500
    
    { id: 'interconnector', label: 'Interconnector', category: 'Interconnector', color: '#ec4899', icon: ICONS.CONNECTOR }, // Pink
    
    // UKPN Specific Assets
    { id: 'ukpn_gsp', label: 'UKPN Grid Supply Point', category: 'Distribution', color: '#dc2626', icon: ICONS.GRID }, // Red
    { id: 'ukpn_bsp', label: 'UKPN Bulk Supply Point', category: 'Distribution', color: '#16a34a', icon: ICONS.GRID }, // Green
    { id: 'ukpn_primary', label: 'UKPN Primary Substation', category: 'Distribution', color: '#d97706', icon: ICONS.GRID }, // Amber
    // SPEN Specific Assets
    { id: 'spen_gsp', label: 'SPEN Grid Supply Point', category: 'Distribution', color: '#0ea5e9', icon: ICONS.GRID }, // Sky Blue
    { id: 'spen_bsp', label: 'SPEN Bulk Supply Point', category: 'Distribution', color: '#8b5cf6', icon: ICONS.GRID }, // Violet
    { id: 'spen_primary', label: 'SPEN Primary Substation', category: 'Distribution', color: '#6366f1', icon: ICONS.GRID }, // Indigo

    // Consumers
    { id: 'datacentre', label: 'Major Datacentre', category: 'Retail', color: '#d946ef', icon: ICONS.SERVER }, // Fuchsia-500
    
    // Custom Search
    { id: 'custom_search', label: 'Custom Search Result', category: 'Custom' as any, color: '#f43f5e', icon: ICONS.TRIANGLE }, // Rose-500
];

export const REGIONS: RegionConfig[] = [
    { id: 'UK', name: 'UK', lat: 54.5, lng: -2.0, zoom: 6 },
    { id: 'US_TX', name: 'USA - Texas (ERCOT)', lat: 31.9686, lng: -99.9018, zoom: 6 },
    { id: 'EU_DE', name: 'Germany', lat: 51.1657, lng: 10.4515, zoom: 6 },
    { id: 'US_CA', name: 'USA - California (CAISO)', lat: 36.7783, lng: -119.4179, zoom: 6 },
];

export const UK_DNO_REGIONS: DNORegion[] = [
    {
        id: 'ukpn_lpn',
        name: 'London Power Networks (LPN)',
        operator: 'UK Power Networks',
        color: '#dc2626', // Red
        households: 2300000,
        industryCount: 185000,
        path: [{lat: 51.69, lng: -0.5}, {lat: 51.69, lng: 0.3}, {lat: 51.3, lng: 0.3}, {lat: 51.3, lng: -0.5}]
    },
    {
        id: 'ukpn_spn',
        name: 'South Eastern Power Networks (SPN)',
        operator: 'UK Power Networks',
        color: '#dc2626', // Red
        households: 2400000,
        industryCount: 140000,
        path: [{lat: 51.3, lng: -0.6}, {lat: 51.3, lng: 1.45}, {lat: 50.7, lng: 1.1}, {lat: 50.8, lng: -0.6}]
    },
    {
        id: 'ukpn_epn',
        name: 'Eastern Power Networks (EPN)',
        operator: 'UK Power Networks',
        color: '#dc2626', // Red
        households: 3600000,
        industryCount: 220000,
        path: [{lat: 52.9, lng: 0.5}, {lat: 52.9, lng: 1.8}, {lat: 51.69, lng: 1.45}, {lat: 51.69, lng: -0.6}, {lat: 52.0, lng: -0.9}]
    },
    {
        id: 'nged_sw',
        name: 'National Grid (South West)',
        operator: 'National Grid Distribution',
        color: '#eab308', // Yellow
        households: 1600000,
        industryCount: 95000,
        path: [{lat: 51.5, lng: -2.5}, {lat: 51.2, lng: -1.8}, {lat: 50.0, lng: -5.7}, {lat: 51.2, lng: -4.5}]
    },
    {
        id: 'nged_wales',
        name: 'National Grid (South Wales)',
        operator: 'National Grid Distribution',
        color: '#eab308', // Yellow
        households: 1100000,
        industryCount: 65000,
        path: [{lat: 52.2, lng: -3.0}, {lat: 52.2, lng: -4.5}, {lat: 51.4, lng: -5.3}, {lat: 51.4, lng: -2.6}]
    },
     {
        id: 'nged_mid',
        name: 'National Grid (Midlands)',
        operator: 'National Grid Distribution',
        color: '#eab308', // Yellow
        households: 5100000,
        industryCount: 350000,
        path: [{lat: 53.2, lng: -2.5}, {lat: 53.2, lng: -0.1}, {lat: 51.8, lng: -0.5}, {lat: 51.8, lng: -2.8}]
    },
    {
        id: 'ssen_south',
        name: 'Southern Electric Power Dist.',
        operator: 'SSEN',
        color: '#0ea5e9', // Sky Blue
        households: 3100000,
        industryCount: 205000,
        path: [{lat: 51.8, lng: -2.0}, {lat: 51.8, lng: -0.5}, {lat: 50.6, lng: -1.0}, {lat: 50.6, lng: -2.5}]
    },
    {
        id: 'ssen_north',
        name: 'Scottish Hydro Electric',
        operator: 'SSEN',
        color: '#0ea5e9', // Sky Blue
        households: 780000,
        industryCount: 60000,
        path: [{lat: 59.0, lng: -3.0}, {lat: 58.0, lng: -1.0}, {lat: 56.4, lng: -3.5}, {lat: 56.4, lng: -6.0}]
    },
    {
        id: 'spen_spd',
        name: 'SP Distribution',
        operator: 'SP Energy Networks',
        color: '#16a34a', // Green
        households: 2000000,
        industryCount: 150000,
        path: [{lat: 56.4, lng: -3.0}, {lat: 56.4, lng: -5.0}, {lat: 55.0, lng: -5.0}, {lat: 55.0, lng: -2.0}]
    },
    {
        id: 'spen_spm',
        name: 'SP Manweb',
        operator: 'SP Energy Networks',
        color: '#16a34a', // Green
        households: 1500000,
        industryCount: 110000,
        path: [{lat: 53.8, lng: -3.0}, {lat: 53.8, lng: -2.3}, {lat: 52.4, lng: -2.8}, {lat: 52.6, lng: -4.5}]
    },
    {
        id: 'enwl',
        name: 'Electricity North West',
        operator: 'ENWL',
        color: '#f97316', // Orange
        households: 2400000,
        industryCount: 160000,
        path: [{lat: 54.8, lng: -3.5}, {lat: 54.8, lng: -2.2}, {lat: 53.2, lng: -2.0}, {lat: 53.2, lng: -3.2}]
    },
    {
        id: 'npg_ne',
        name: 'Northern Powergrid (Northeast)',
        operator: 'Northern Powergrid',
        color: '#8b5cf6', // Violet
        households: 1600000,
        industryCount: 105000,
        path: [{lat: 55.8, lng: -2.0}, {lat: 55.8, lng: -1.4}, {lat: 53.8, lng: -0.5}, {lat: 53.8, lng: -1.8}]
    },
    {
        id: 'npg_york',
        name: 'Northern Powergrid (Yorkshire)',
        operator: 'Northern Powergrid',
        color: '#8b5cf6', // Violet
        households: 2300000,
        industryCount: 180000,
        path: [{lat: 54.6, lng: -2.0}, {lat: 54.6, lng: 0.1}, {lat: 53.2, lng: -0.1}, {lat: 53.2, lng: -1.8}]
    },
    {
        id: 'nie_networks',
        name: 'NIE Networks',
        operator: 'Northern Ireland Electricity Networks',
        color: '#10b981', // Emerald
        households: 910000,
        industryCount: 65000,
        path: [{lat: 55.25, lng: -6.0}, {lat: 55.25, lng: -5.8}, {lat: 54.0, lng: -5.8}, {lat: 54.0, lng: -8.2}, {lat: 55.0, lng: -8.0}]
    }
];

export const DEEP_SEARCH_PROTOCOLS = {
    "Transmission & Distribution (High Density)": [
        "Grid Supply Points (GSPs)",
        "Bulk Supply Points (BSPs)",
        "Major Substations (400kV, 275kV, 132kV, 33kV)",
        "HVDC Converter Stations"
    ],
    "High Demand Consumers": [
        "Hyperscale Datacentres",
        "Co-location Facilities",
        "Strategic Industrial Hubs"
    ],
    "Generation Assets": [
        "Nuclear Power Stations",
        "Major Gas Fired Power Stations (CCGT)",
        "Offshore Wind Farms (incl. landing points)",
        "Onshore Wind Farms (Major installations)",
        "Solar Farms (Utility scale)",
        "Hydroelectric & Pumped Storage",
        "Biomass / Energy from Waste"
    ],
    "Gas Network": [
        "Gas Reception Terminals",
        "Gas Compressor Stations (NTS)",
        "LNG Storage / Import Facilities"
    ],
    "International": [
        "International Interconnectors"
    ]
};

// Seed Data for UK to ensure the map isn't empty on load
export const UK_ASSETS_SEED: InfrastructureAsset[] = [
    // Nuclear
    { id: 'n1', name: 'Hinkley Point C', typeId: 'nuclear', lat: 51.2093, lng: -3.1264, capacityMW: 3260, status: 'Operational', commissionYear: 2029 },
    { id: 'n2', name: 'Sizewell B', typeId: 'nuclear', lat: 52.2130, lng: 1.6180, capacityMW: 1198, status: 'Operational', commissionYear: 1995 },
    { id: 'n3', name: 'Heysham', typeId: 'nuclear', lat: 54.0298, lng: -2.9006, capacityMW: 1190, status: 'Operational', commissionYear: 1983 },
    
    // Wind
    { id: 'w1', name: 'Hornsea Project', typeId: 'wind_offshore', lat: 53.88, lng: 1.88, capacityMW: 1200, status: 'Operational', commissionYear: 2020 },
    { id: 'w2', name: 'Dogger Bank', typeId: 'wind_offshore', lat: 54.77, lng: 2.25, capacityMW: 3600, status: 'Operational', commissionYear: 2023 },
    { id: 'w3', name: 'London Array', typeId: 'wind_offshore', lat: 51.64, lng: 1.55, capacityMW: 630, status: 'Operational', commissionYear: 2013 },
    { id: 'w4', name: 'Whitelee Windfarm', typeId: 'wind_onshore', lat: 55.68, lng: -4.27, capacityMW: 539, status: 'Operational', commissionYear: 2009 },

    // Gas Terminals / Storage
    { id: 'g1', name: 'Easington Terminal', typeId: 'gas', lat: 53.655, lng: 0.113, capacityMW: 0, status: 'Operational' },
    { id: 'g2', name: 'Milford Haven', typeId: 'gas', lat: 51.71, lng: -5.02, capacityMW: 0, status: 'Operational' },
    { id: 'g3', name: 'St Fergus', typeId: 'gas', lat: 57.58, lng: -1.84, capacityMW: 0, status: 'Operational' },
    { id: 'g_comp1', name: 'Peterborough Compressor', typeId: 'compressor', lat: 52.6, lng: -0.3, status: 'Operational' },

    // Hydro
    { id: 'h1', name: 'Dinorwig Power Station', typeId: 'hydro', lat: 53.11, lng: -4.11, capacityMW: 1728, status: 'Operational' },

    // Interconnectors
    { id: 'i1', name: 'IFA (France)', typeId: 'interconnector', lat: 51.09, lng: 1.13, status: 'Operational' },
    { id: 'i2', name: 'BritNed (Netherlands)', typeId: 'interconnector', lat: 51.44, lng: 0.70, status: 'Operational' },
    { id: 'i3', name: 'Nemo Link (Belgium)', typeId: 'interconnector', lat: 51.32, lng: 1.42, status: 'Operational' },

    // Datacenters (Seeds) - Specific years for timeline (2015-2025 Growth Timeline)
    { id: 'dc_slough_1', name: 'Slough Trading Estate DC', typeId: 'datacentre', lat: 51.51, lng: -0.62, capacityMW: 80, status: 'Operational', commissionYear: 2015 },
    { id: 'dc_london_dock', name: 'Telehouse Docklands', typeId: 'datacentre', lat: 51.50, lng: -0.01, capacityMW: 120, status: 'Operational', commissionYear: 2016 },
    { id: 'dc_dublin_link', name: 'Holyhead Landing Station', typeId: 'datacentre', lat: 53.30, lng: -4.63, capacityMW: 40, status: 'Operational', commissionYear: 2017 },
    { id: 'dc_manchester', name: 'Equinix MA5', typeId: 'datacentre', lat: 53.47, lng: -2.24, capacityMW: 60, status: 'Operational', commissionYear: 2018 },
    { id: 'dc_newport', name: 'Vantage Cardiff', typeId: 'datacentre', lat: 51.55, lng: -3.00, capacityMW: 150, status: 'Operational', commissionYear: 2019 },
    { id: 'dc_edinburgh', name: 'Pulsant South Gyle', typeId: 'datacentre', lat: 55.93, lng: -3.29, capacityMW: 30, status: 'Operational', commissionYear: 2019 },
    { id: 'dc_hemel', name: 'Gyron Hemel Hempstead', typeId: 'datacentre', lat: 51.76, lng: -0.45, capacityMW: 90, status: 'Operational', commissionYear: 2020 },
    { id: 'dc_slough_2', name: 'Virtus Slough', typeId: 'datacentre', lat: 51.52, lng: -0.63, capacityMW: 100, status: 'Operational', commissionYear: 2021 },
    { id: 'dc_london_north', name: 'Ark Data Centres Enfield', typeId: 'datacentre', lat: 51.65, lng: -0.05, capacityMW: 110, status: 'Operational', commissionYear: 2022 },
    { id: 'dc_newcastle', name: 'Stellium 1', typeId: 'datacentre', lat: 55.00, lng: -1.50, capacityMW: 80, status: 'Operational', commissionYear: 2023 },
    { id: 'dc_birmingham', name: 'Redditch Gateway', typeId: 'datacentre', lat: 52.30, lng: -1.90, capacityMW: 45, status: 'Operational', commissionYear: 2023 },
    { id: 'dc_scotland_wind', name: 'Green Data Hunterston', typeId: 'datacentre', lat: 55.70, lng: -4.80, capacityMW: 200, status: 'Operational', commissionYear: 2024 },
    { id: 'dc_london_west', name: 'Google Acton', typeId: 'datacentre', lat: 51.52, lng: -0.25, capacityMW: 180, status: 'Operational', commissionYear: 2024 },
    { id: 'dc_cumbria', name: 'Sellafield HPC', typeId: 'datacentre', lat: 54.40, lng: -3.50, capacityMW: 50, status: 'Operational', commissionYear: 2025 },


    // Mock Lines (Polylines) - Simplified National Grid Backbone
    { id: 'l1', name: 'Western Link', typeId: 'transmission_elec', lat: 55.5, lng: -4.8, endLat: 53.2, endLng: -3.0, status: 'Operational', 
      path: [{lat: 55.5, lng: -4.8}, {lat: 54.5, lng: -4.5}, {lat: 53.5, lng: -3.5}, {lat: 53.2, lng: -3.0}] },
    { id: 'l2', name: 'East Coast Backbone', typeId: 'transmission_elec', lat: 55.9, lng: -3.0, endLat: 51.5, endLng: -0.1, status: 'Operational',
      path: [{lat: 55.9, lng: -3.0}, {lat: 54.0, lng: -1.0}, {lat: 52.5, lng: -0.5}, {lat: 51.5, lng: -0.1}] }
];

export const INITIAL_SCENARIOS: RiskScenario[] = [
    {
        id: 's_growth_dc',
        name: 'Datacentre Expansion (2015-2025)',
        category: 'Growth',
        description: '10-Year timelapse of datacentre growth across the region (1 Minute Duration).',
        probability: 'High',
        impactLevel: 'Major',
        durationDays: 120,
        peakConsumersAffected: 2500, // MW Added
        affectedAssets: [
            'dc_slough_1', 'dc_london_dock', 'dc_dublin_link', 'dc_manchester', 
            'dc_newport', 'dc_edinburgh', 'dc_hemel', 'dc_slough_2', 
            'dc_london_north', 'dc_newcastle', 'dc_birmingham', 'dc_scotland_wind', 
            'dc_london_west', 'dc_cumbria'
        ],
        region: 'UK',
        narrative: 'Over the last decade, the demand for cloud computing and AI has driven a massive expansion in datacentre capacity. This timeline visualizes the commissioning of major facilities across the region, highlighting the increasing load on the grid.',
        lastUpdated: Date.now(),
        status: 'Standard',
        // coordinates removed: regional
    },
    {
        id: 's_storm_1',
        name: 'Storm Ciara II',
        category: 'Storm',
        description: 'Severe gale force winds impacting offshore wind & transmission lines in North Sea.',
        probability: 'High',
        impactLevel: 'Major',
        durationDays: 7,
        peakConsumersAffected: 450000,
        affectedAssets: ['w1', 'w2', 'l2'],
        region: 'UK',
        narrative: 'A rapidly deepening low-pressure system brings 90mph gusts to the East Coast, forcing turbine shutdowns and damaging overhead lines.',
        lastUpdated: Date.now(),
        status: 'Standard',
        coordinates: { lat: 54.5, lng: 1.5 }
    },
    {
        id: 's_cyber_1',
        name: 'Grid Control Ransomware',
        category: 'Cyber',
        description: 'Coordinated attack on DNO SCADA systems preventing remote re-switching.',
        probability: 'Low',
        impactLevel: 'Critical',
        durationDays: 14,
        peakConsumersAffected: 1200000,
        affectedAssets: ['substation', 'g1'],
        region: 'UK',
        narrative: 'Sophisticated actors infiltrate the OT network of a major Distribution Network Operator, locking control rooms.',
        lastUpdated: Date.now(),
        status: 'Standard',
        // coordinates removed: non-specific
    },
    {
        id: 's_geopol_1',
        name: 'Gas Pipeline Sabotage',
        category: 'Geopolitical',
        description: 'Physical disruption to key gas import infrastructure affecting thermal generation.',
        probability: 'Medium',
        impactLevel: 'Critical',
        durationDays: 30,
        peakConsumersAffected: 2500000,
        affectedAssets: ['g1', 'g2'],
        region: 'UK',
        narrative: 'A coordinated physical attack on gas terminal infrastructure at Easington reduces generation capacity by 4GW during peak winter demand.',
        lastUpdated: Date.now(),
        status: 'Standard',
        coordinates: { lat: 53.655, lng: 0.113 }
    },
    {
        id: 's_asset_fail_1',
        name: 'Interconnector Fault',
        category: 'Asset Failure',
        description: 'Unexpected trip of IFA and BritNed interconnectors during low wind period.',
        probability: 'Medium',
        impactLevel: 'Major',
        durationDays: 3,
        peakConsumersAffected: 600000,
        affectedAssets: ['i1', 'i2'],
        region: 'UK',
        narrative: 'Simultaneous tripping of two major interconnectors causes an immediate frequency drop, triggering Low Frequency Demand Disconnection.',
        lastUpdated: Date.now(),
        status: 'Standard',
        coordinates: { lat: 51.2, lng: 1.0 }
    },
    {
        id: 's_solar_flare',
        name: 'G5 Geomagnetic Storm',
        category: 'Storm',
        description: 'Carrington-class event inducing GICs in HV transformers.',
        probability: 'Low',
        impactLevel: 'Critical',
        durationDays: 2,
        peakConsumersAffected: 5000000,
        affectedAssets: ['l1', 'l2', 'n1', 'n2'],
        region: 'UK',
        narrative: 'A massive coronal mass ejection hits Earth, inducing currents that saturate transformer cores, leading to voltage collapse in the Scottish-English border transmission corridor.',
        lastUpdated: Date.now(),
        status: 'Standard',
        // coordinates removed: regional
    },
    {
        id: 's_datacentre_1',
        name: 'Hyperscale Capacity Crisis',
        category: 'Supply Chain',
        description: 'Grid instability caused by rapid addition of 5GW datacenter load over short period.',
        probability: 'Medium',
        impactLevel: 'Major',
        durationDays: 20,
        peakConsumersAffected: 850000,
        affectedAssets: ['dc_london_dock', 'dc_slough_1', 'substation'],
        region: 'UK',
        narrative: 'A decade of unmanaged datacenter growth culminates in a critical capacity shortfall during a winter peak.',
        lastUpdated: Date.now(),
        status: 'Standard',
        coordinates: { lat: 51.51, lng: -0.6 }
    },
    {
        id: 's_siemens_exploit',
        name: 'Siemens PLC Exploit',
        category: 'Supply Chain',
        description: 'Zero-day vulnerability in S7-1500 PLCs used in substation automation across the grid.',
        probability: 'Medium',
        impactLevel: 'Critical',
        durationDays: 14,
        peakConsumersAffected: 2100000,
        affectedAssets: ['substation'],
        region: 'UK',
        narrative: 'A sophisticated state-aligned actor utilizes a new zero-day vulnerability in widespread Siemens S7 series PLCs, causing cascading trips in major 400kV substations.',
        lastUpdated: Date.now(),
        status: 'Standard',
        // Regional impact
    },
    {
        id: 's_coordinated_physical',
        name: 'Coordinated Substation Attack',
        category: 'Geopolitical',
        description: 'Simultaneous physical breaches at three key London transmission substations.',
        probability: 'Low',
        impactLevel: 'Critical',
        durationDays: 45,
        peakConsumersAffected: 1500000,
        affectedAssets: ['ukpn_gsp'],
        region: 'UK',
        narrative: 'Coordinated physical sabotage targeting transformers at three geographically distinct GSPs feeding London, requiring long-lead time replacements.',
        lastUpdated: Date.now(),
        status: 'Standard',
        locations: [
            { name: "Brimsdown GSP", lat: 51.64, lng: -0.02 },
            { name: "West Ham GSP", lat: 51.52, lng: 0.01 },
            { name: "Wimbledon GSP", lat: 51.42, lng: -0.19 }
        ]
    }
];

export const ALL_SOURCES = [
    "Overpass API (OpenStreetMap)",
    "National Energy System Operator (NESO)",
    "Ofgem",
    "Department for Energy Security and Net Zero",
    "Met Office",
    "National Cyber Security Centre (NCSC)",
    "ENTSO-E",
    "Gas Infrastructure Europe",
    "UK Power Networks Open Data",
    "SP Energy Networks Open Data",
    "Data Center Map",
    "Cadent Gas Open Data",
    "wiki.openstreetmap.org",
    "data.gov.uk",
    "openinframap.org",
    "openstreetmap"
];