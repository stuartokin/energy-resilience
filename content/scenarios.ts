// Scenario library: realistic, generic risks to the GB energy system, in every category.
//
// Rules (see CLAUDE.md):
//  - Generic: no named supplier and no specific site as a target. Real past events are used only as
//    reference points, with sources.
//  - Every number is either sourced or labelled as an assumption, and the reasoning is in `rationale`.
//  - Customers off supply over time come from `model` (services/impactModel.ts); cost is derived from it.
//  - Likelihood labels are qualitative judgements informed by the UK National Risk Register, not forecasts.
// To add a scenario, copy one below and change it. The weekly research agent proposes new ones for review.
import { RiskScenario, ImpactProfile, Footprint } from '../types';
import { peakOf, horizonHours } from '../services/impactModel';

const S = {
    nrr: 'UK National Risk Register 2025 — https://www.gov.uk/government/publications/national-risk-register-2025',
    arwen: 'Ofgem (2022) review into the networks\' response to Storm Arwen — https://www.ofgem.gov.uk/publications/ofgem-publishes-full-report-following-six-month-review-networks-response-storm-arwen',
    aug2019: 'Ofgem (2020) 9 August 2019 power outage report — https://www.ofgem.gov.uk/system/files/docs/2020/01/9_august_2019_power_outage_report.pdf',
    esrs: 'NESO: Electricity System Restoration Standard — https://www.neso.energy/industry-information/balancing-services/electricity-system-restoration-standard',
    northHyde: 'NESO (2025) North Hyde substation outage review — https://www.neso.energy/national-energy-system-operator-publishes-final-report-review-north-hyde-substation-outage',
    iberia: 'POWER (2026) on the ENTSO-E final report into the Iberian blackout — https://www.powermag.com/anatomy-of-a-blackout-findings-from-the-spain-portugal-grid-collapse-final-report/',
    ukraine: 'E-ISAC / SANS ICS (2016) Analysis of the cyber attack on the Ukrainian power grid — https://nsarchive.gwu.edu/sites/default/files/documents/3891751/SANS-and-Electricity-Information-Sharing-and.pdf',
    colonial: 'CISA: The attack on Colonial Pipeline — https://www.cisa.gov/news-events/news/attack-colonial-pipeline-what-weve-learned-what-weve-done-over-past-two-years',
    moore: 'Wikipedia: 2022 Moore County substation attack — https://en.wikipedia.org/wiki/2022_Moore_County_substation_attack',
    estlink: 'Fingrid (Dec 2024) Estlink 2 failure — https://www.fingrid.fi/en/news/news/2024/estlink-2-electricity-transmission-link-between-finland-and-estonia-has-failed-investigation-continues2/',
    raeng: 'Royal Academy of Engineering (2013) Extreme space weather: impacts on engineered systems — https://raeng.org.uk/publications/reports/space-weather-full-report',
    iea: 'IEA (2025) Building the future transmission grid — https://www.iea.org/reports/building-the-future-transmission-grid/executive-summary',
    esec: 'DESNZ: Electricity Supply Emergency Code — https://www.gov.uk/government/publications/electricity-supply-emergency-code',
    lancaster: 'Lancaster University (2016) Living without electricity (Storm Desmond) — https://wp.lancs.ac.uk/floodarchive/files/2019/09/Accessible-LU-2016-Living-without-electricity.pdf',
    winter: 'NESO Winter Outlook — https://www.neso.energy/publications/winter-outlook',
    gasData: 'National Gas Data Portal (live entry flows; see the Energy Flows panel) — https://data.nationalgas.com',
    voll: 'DECC (2013) Value of Lost Load used for the reliability standard — https://assets.publishing.service.gov.uk/media/5a7c4a16ed915d338141dd0a/Annex_C_-_reliability_standard_methodology.pdf',
};

interface Def {
    id: string; name: string; category: string; description: string; narrative: string;
    probability: 'Low' | 'Medium' | 'High'; impactLevel: 'Minor' | 'Major' | 'Critical';
    model: ImpactProfile; rationale: string; sources: string[]; customersBasis: 'sourced' | 'scaled' | 'assumption';
    coordinates?: { lat: number; lng: number }; affectedAssets?: string[]; supplyLost?: { mw: number; label: string }; region?: string;
}

const make = (d: Def): RiskScenario => ({
    id: d.id, name: d.name, category: d.category, description: d.description, narrative: d.narrative,
    probability: d.probability, impactLevel: d.impactLevel,
    durationDays: Math.max(1, Math.ceil(horizonHours(d.model) / 24)),
    peakConsumersAffected: d.model.type === 'growth' ? d.model.mwAdded : peakOf(d.model),
    affectedAssets: d.affectedAssets || [], region: d.region || 'UK', coordinates: d.coordinates,
    model: d.model, rationale: d.rationale, sources: d.sources, customersBasis: d.customersBasis, supplyLost: d.supplyLost,
    status: 'Standard', lastUpdated: Date.UTC(2026, 10, 12),
});

// Where each scenario shows on the map (services/footprint.ts). Areas are illustrative, not forecasts.
//  national  = anywhere in GB; placeable = a local event with no fixed location (use "Place it");
//  regions   = network-operator areas (NESO names); point = an illustrative location based on a real past event.
//  pattern   = how the dark areas are arranged: spread (from the centre outwards), scatter (demand disconnection
//              is spread across the country), patches (whole groups of areas), rota (rotating 3-hour blocks).
//  routes    = energy flows shown as cut (flow ids, or largestGas / largestElec / lng / norway, resolved from live data).
//  fleet     = asset types highlighted for common-mode scenarios.
const NORTH = ['North Scotland', 'South and Central Scotland', 'North East England'];
const FOOTPRINTS: Record<string, Footprint> = {
    st_windstorm_north: { areas: { regions: NORTH }, pattern: 'spread' },
    st_substation_flood: { areas: { point: { lat: 54.05, lng: -2.8, label: 'Illustrative location (based on Lancaster, Storm Desmond 2015)' } }, pattern: 'spread' },
    st_snow_ice: { areas: { regions: ['North West England', 'South and Central Scotland', 'North East England'] }, pattern: 'patches' },
    st_space_weather: { areas: 'national', pattern: 'patches' },
    st_cold_still: { areas: 'national', pattern: 'rota' },
    cy_dno_breakers: { areas: 'placeable', pattern: 'patches' },
    cy_dno_ransomware: { areas: 'placeable', pattern: 'patches' },
    cy_neso_failover: { areas: 'national', pattern: 'scatter' },
    cy_neso_national: { areas: 'national', pattern: 'patches' },
    cy_common_supplier: { areas: 'national', pattern: 'scatter', fleet: ['gas', 'nuclear', 'biomass'] },
    cy_mass_devices: { areas: 'national', pattern: 'scatter' },
    cy_flex_fleet: { areas: 'national', pattern: 'scatter' },
    cy_gas_terminal: { areas: 'none', routes: ['largestGas'] },
    af_aug2019: { areas: 'national', pattern: 'scatter' },
    af_three_units: { areas: 'national', pattern: 'scatter' },
    af_largest_ic: { areas: 'none', routes: ['largestElec'] },
    af_substation_fire: { areas: { point: { lat: 51.5, lng: -0.42, label: 'Illustrative location (based on North Hyde, March 2025)' } }, pattern: 'spread' },
    af_voltage_collapse: { areas: 'national', pattern: 'patches' },
    sc_transformer_spare: { areas: 'placeable', pattern: 'spread' },
    sc_type_fault: { areas: 'national', pattern: 'scatter' },
    sc_storm_staffing: { areas: { regions: NORTH }, pattern: 'spread' },
    sc_export_controls: { areas: 'none' },
    gp_subsea: { areas: 'none', routes: ['largestElec', 'largestGas'] },
    gp_gas_winter: { areas: 'national', pattern: 'rota', routes: ['norway'] },
    gp_substation_attack: { areas: 'placeable', pattern: 'patches' },
    gp_lng: { areas: 'none', routes: ['lng'] },
    s_growth_dc: { areas: 'none' },
    gr_cold_electrified: { areas: 'national', pattern: 'rota' },
    gr_dc_gsp: { areas: 'placeable', pattern: 'spread' },
};

// Captions shown on the map as a scenario plays. Only for scenarios based on a real event, and only what the
// cited source says (the app adds peak and restoration milestones from the model itself).
const EVENTS: Record<string, { atHours: number; text: string }[]> = {
    af_aug2019: [
        { atHours: 0, text: 'Lightning strike; an offshore wind farm, a gas power station and embedded generation are lost. LFDD disconnects about 4% of demand (Ofgem 2020).' },
        { atHours: 0.75, text: 'In 2019 all supplies were restored within 45 minutes (Ofgem 2020).' },
    ],
    af_substation_fire: [
        { atHours: 0, text: 'Transformer fire: the whole substation is lost overnight, as at North Hyde in March 2025 (NESO 2025).' },
        { atHours: 6, text: 'The distribution network is rearranged to restore customers from other substations.' },
        { atHours: 13, text: 'At North Hyde, all but two SSEN customers were back on by 12:24 the next day (NESO 2025).' },
    ],
    st_windstorm_north: [
        { atHours: 0, text: 'Northerly gale: trees bring down overhead lines across rural networks.' },
        { atHours: 24, text: 'In Storm Arwen, 82% of customers were restored within 24 hours (Ofgem 2022).' },
        { atHours: 168, text: 'In Storm Arwen, nearly 4,000 customers (0.4%) were still off after a week (Ofgem 2022).' },
    ],
    st_substation_flood: [
        { atHours: 0, text: 'Flood water reaches the substation, which is switched off for safety (as in Lancaster, December 2015).' },
    ],
};

const withMap = (s: RiskScenario): RiskScenario => ({ ...s, footprint: FOOTPRINTS[s.id], events: EVENTS[s.id] });

export const SCENARIO_LIBRARY: RiskScenario[] = ([
    // ---------------- Storm and weather ----------------
    make({
        id: 'st_windstorm_north', name: 'Severe windstorm in northern Britain', category: 'Storm',
        description: 'A deep low brings an unusual northerly gale that brings down trees onto overhead lines across rural networks.',
        narrative: 'An Arwen-type storm hits areas where networks are less used to winds from that direction. Faults build over half a day; most customers are restored within 24 hours, but rural and access-limited areas take more than a week.',
        probability: 'High', impactLevel: 'Major', customersBasis: 'sourced', coordinates: { lat: 55.3, lng: -2.3 },
        model: { type: 'storm', peak: 1000000, buildHours: 12, pctRestored24h: 82, pctStillOff7d: 0.4 },
        rationale: 'Calibrated directly on Storm Arwen (Nov 2021): nearly 1 million homes lost power, 82% were restored within 24 hours and nearly 4,000 (0.4%) were off for over a week (Ofgem 2022). The 12-hour build-up is an assumption.',
        sources: [S.arwen, S.nrr],
    }),
    make({
        id: 'st_substation_flood', name: 'Flooding of a city\'s grid substation', category: 'Storm',
        description: 'River flooding overtops defences and floods the substation supplying a city, which has to be switched off for safety.',
        narrative: 'As in Lancaster during Storm Desmond (Dec 2015), the whole area fed by one flooded substation loses power at once. Supplies return in stages as water is pumped out, equipment is dried and tested, and temporary generators are brought in.',
        probability: 'Medium', impactLevel: 'Major', customersBasis: 'sourced', coordinates: { lat: 54.05, lng: -2.8 },
        model: { type: 'instant', peak: 61000, offHours: 24, restoreHours: 48 },
        rationale: 'Peak is based on Storm Desmond, when about 61,000 properties in and around Lancaster lost power after the substation flooded (Lancaster University 2016). The restoration shape (24 hours fully off, then restored over two days) is an assumption broadly consistent with that event.',
        sources: [S.lancaster, S.nrr],
    }),
    make({
        id: 'st_snow_ice', name: 'Heavy wet snow and ice on rural lines', category: 'Storm',
        description: 'Wet snow and ice load overhead lines in upland areas; blocked roads slow repairs.',
        narrative: 'Ice and snow accumulate on wires and trees across hill areas. Fewer customers are affected than in a major windstorm, but access is harder, so restoration is slower.',
        probability: 'Medium', impactLevel: 'Major', customersBasis: 'assumption', coordinates: { lat: 54.6, lng: -3.0 },
        model: { type: 'storm', peak: 150000, buildHours: 18, pctRestored24h: 60, pctStillOff7d: 1.5 },
        rationale: 'Illustrative assumption: about 15% of an Arwen-scale event, because snow and ice loading affects mainly upland rural lines. Restoration is assumed slower than Arwen (60% within 24 h, 1.5% still off after a week) because of road access. Not calibrated on a specific event.',
        sources: [S.arwen, S.nrr],
    }),
    make({
        id: 'st_space_weather', name: 'Severe space weather (Carrington-class)', category: 'Storm',
        description: 'A severe geomagnetic storm drives currents into the high-voltage grid, overheating some large transformers.',
        narrative: 'NESO and the transmission owners take protective actions, but a small number of large transformers are damaged. Local areas lose supply until the network can be rearranged around them; replacing the transformers takes much longer.',
        probability: 'Low', impactLevel: 'Critical', customersBasis: 'assumption',
        model: { type: 'instant', peak: 500000, offHours: 72, restoreHours: 168 },
        rationale: 'Severe space weather is on the National Risk Register. The Royal Academy of Engineering (2013) judged that an extreme event could damage a small number of high-voltage transformers, causing local outages. The 500,000 customers and the restoration times here are illustrative assumptions, not estimates from those reports.',
        sources: [S.nrr, S.raeng],
    }),
    make({
        id: 'st_cold_still', name: 'Cold, still week (low wind, high demand)', category: 'Storm',
        description: 'A week of freezing, windless weather pushes demand up while wind output falls close to zero.',
        narrative: 'Electricity Margin Notices are possible and prices spike, but the system is expected to balance using gas, storage, interconnectors and demand flexibility. On its own this is not expected to cause power cuts; combine it with an outage scenario to stress-test.',
        probability: 'Medium', impactLevel: 'Minor', customersBasis: 'assumption',
        model: { type: 'none', days: 7 },
        rationale: 'NESO\'s Winter Outlook assesses the margin each winter against the reliability standard; outside unusual combinations of events, a cold still spell has been managed without disconnections. Run this together with a supply loss (for example gas or interconnector scenarios) to see a combined effect.',
        sources: [S.winter, S.nrr],
    }),

    // ---------------- Cyber ----------------
    make({
        id: 'cy_dno_breakers', name: 'Attack opens breakers through a DNO\'s control system', category: 'Cyber',
        description: 'Attackers with access to a distribution control system remotely open circuit breakers at several substations.',
        narrative: 'Modelled on the December 2015 attack on Ukrainian distribution companies: power is cut to a large area at once, remote control cannot be trusted, and engineers restore supply by operating substations by hand.',
        probability: 'Low', impactLevel: 'Major', customersBasis: 'sourced',
        model: { type: 'instant', peak: 225000, offHours: 1, restoreHours: 5 },
        rationale: 'In Ukraine (Dec 2015) about 225,000 customers lost power for 1 to 6 hours, restored by manual operation (E-ISAC/SANS 2016). The same customer numbers and timings are used here; GB network size and procedures would change the actual figures.',
        sources: [S.ukraine, S.nrr],
    }),
    make({
        id: 'cy_dno_ransomware', name: 'Ransomware forces a DNO to run without its control system', category: 'Cyber',
        description: 'Ransomware on business IT leads a distribution company to isolate its control systems as a precaution.',
        narrative: 'As with Colonial Pipeline (2021), the operator shuts systems down to stop the spread. The network keeps running, but every fault is found and fixed manually, so everyday power cuts last longer for up to two weeks.',
        probability: 'Medium', impactLevel: 'Minor', customersBasis: 'assumption',
        model: { type: 'none', days: 14 },
        rationale: 'No immediate power cuts are assumed: networks can run without remote control. The risk is slower restoration of normal faults, which this model does not count. Colonial Pipeline shut down for about six days as a precaution after an IT compromise (CISA).',
        sources: [S.colonial, S.nrr],
    }),
    make({
        id: 'cy_neso_failover', name: 'NESO control room lost; backup takes over', category: 'Cyber',
        description: 'A cyber or physical incident forces the national control room to evacuate and operations move to backup facilities.',
        narrative: 'Base case: the handover works and the system stays secure, with some loss of efficiency and heightened risk while operating from backup.',
        probability: 'Low', impactLevel: 'Minor', customersBasis: 'assumption',
        model: { type: 'none', days: 3 },
        rationale: 'Assumes system operators\' backup control arrangements work as designed, so no customer impact. See the next scenario for the case where they do not.',
        sources: [S.nrr],
    }),
    make({
        id: 'cy_neso_national', name: 'Cyber attack on system control leads to national power failure', category: 'Cyber',
        description: 'A sophisticated attack disrupts national control, the system cannot be balanced, and it collapses. Black Start restoration is needed.',
        narrative: 'All GB customers lose power. Restoration follows the Electricity System Restoration Standard, but is assumed to start later and run slower because control systems must first be trusted again.',
        probability: 'Low', impactLevel: 'Critical', customersBasis: 'assumption',
        model: { type: 'restoration', peak: 30000000, delayHours: 6, pct24h: 60, fullHours: 168 },
        rationale: 'Failure of the national transmission system is on the National Risk Register. The ESRS requires 60% of regional demand within 24 hours and all demand within five days; here restoration is assumed to start 6 hours late and finish in 7 days (both assumptions) because control systems would need to be cleaned or bypassed. Peak uses about 30 million GB customers (assumption).',
        sources: [S.nrr, S.esrs, S.iberia],
    }),
    make({
        id: 'cy_common_supplier', name: 'Compromise of equipment from a single widely used supplier', category: 'Cyber',
        description: 'A malicious update or shared vulnerability in equipment used at many power stations trips several large units at once.',
        narrative: 'A common-mode failure across many sites: the combined loss is far beyond the 1,800 MW the system is secured for, so frequency falls and Low Frequency Demand Disconnection (LFDD) cuts customers automatically. Supplies return within hours if no plant is damaged.',
        probability: 'Low', impactLevel: 'Critical', customersBasis: 'scaled',
        model: { type: 'instant', peak: 4350000, offHours: 1, restoreHours: 3 },
        rationale: 'Assumes LFDD disconnects about 15% of demand (assumption for a multi-gigawatt simultaneous loss). Scaled from 9 August 2019, when about 4% of demand was disconnected, affecting 1.15 million customers: 15 × ~290,000 customers per 1% ≈ 4.35 million. Restoration within about 4 hours assumes no physical damage. If equipment were damaged, restoration would be much slower.',
        sources: [S.aug2019, S.nrr],
    }),
    make({
        id: 'cy_mass_devices', name: 'Mass remote switching of smart meters or home devices', category: 'Cyber',
        description: 'Attackers misuse a central platform to switch off supply to, or swing the demand of, millions of homes.',
        narrative: 'Homes lose supply at once. Restoring them depends on the platform being trusted again; some may need site visits.',
        probability: 'Low', impactLevel: 'Critical', customersBasis: 'assumption',
        model: { type: 'instant', peak: 2000000, offHours: 12, restoreHours: 36 },
        rationale: 'Illustrative assumption for a risk widely discussed in energy security work: 2 million homes, 12 hours before restoration can start, then 36 hours to restore everyone. No real event of this kind has happened in GB.',
        sources: [S.nrr],
    }),
    make({
        id: 'cy_flex_fleet', name: 'Hijacked fleet of EV chargers and home batteries', category: 'Cyber',
        description: 'Control of a large fleet of smart chargers and batteries is taken over and used to swing demand suddenly.',
        narrative: 'A sudden demand swing of about 2 GW is similar in size to the 9 August 2019 event, so LFDD operates and supplies are restored within the hour.',
        probability: 'Low', impactLevel: 'Major', customersBasis: 'scaled',
        model: { type: 'instant', peak: 1150000, offHours: 0.25, restoreHours: 0.5 },
        rationale: 'A swing just above the 1,800 MW secured limit is assumed to have a similar effect to 9 August 2019 (about 1,990 MW lost; 1.15 million customers disconnected; restored within 45 minutes).',
        sources: [S.aug2019, S.nrr],
    }),
    make({
        id: 'cy_gas_terminal', name: 'Ransomware shuts a major gas terminal as a precaution', category: 'Cyber',
        description: 'A gas reception terminal isolates its control systems after an IT compromise and stops taking gas for several days.',
        narrative: 'A large share of GB gas supply stops. Outside very cold weather, storage, LNG and linepack normally cover the gap; in a cold spell National Gas could issue warnings and ask large users to reduce demand.',
        probability: 'Low', impactLevel: 'Major', customersBasis: 'assumption',
        model: { type: 'none', days: 6 },
        supplyLost: { mw: 32000, label: 'About 70 mcm/d of gas (≈ 32 GW at 39.5 MJ/m³), the size of the largest single import routes. Check the Energy Flows panel for live figures.' },
        rationale: 'Six days matches the Colonial Pipeline precautionary shutdown (CISA). The supply loss size is an assumption based on the largest live entry flows (National Gas data). No customer cuts are assumed in the base case.',
        sources: [S.colonial, S.gasData, S.nrr],
    }),

    // ---------------- Asset failure ----------------
    make({
        id: 'af_aug2019', name: 'Repeat of 9 August 2019 (lightning, two power stations lost)', category: 'Asset Failure',
        description: 'A lightning strike on a transmission line is followed by the near-simultaneous loss of a large offshore wind farm, a gas power station and embedded generation.',
        narrative: 'Frequency falls below 48.8 Hz and LFDD disconnects about 4% of demand. Rail services are disrupted. All supplies are restored within 45 minutes.',
        probability: 'Medium', impactLevel: 'Major', customersBasis: 'sourced',
        model: { type: 'instant', peak: 1150000, offHours: 0.25, restoreHours: 0.5 },
        rationale: 'Replays the real event: at least 1,990 MW of generation lost, 892 MW of demand disconnected by LFDD affecting 1.15 million customers, all restored within 45 minutes (Ofgem 2020).',
        sources: [S.aug2019],
    }),
    make({
        id: 'af_three_units', name: 'Three large generating units trip together', category: 'Asset Failure',
        description: 'Three large units (about 3 GW in total) trip within seconds, for example from a shared grid fault or common cause.',
        narrative: 'The loss is well beyond the 1,800 MW limit the system is secured for. LFDD disconnects a larger share of demand than in 2019; supplies return within about an hour once reserves are dispatched.',
        probability: 'Low', impactLevel: 'Major', customersBasis: 'scaled',
        model: { type: 'instant', peak: 2300000, offHours: 0.25, restoreHours: 0.75 },
        rationale: 'Scaled from 9 August 2019 (about 2 GW lost → about 4% of demand disconnected → 1.15 million customers). A 3 GW loss is assumed to need about 8% disconnection ≈ 2.3 million customers. Real outcomes depend on demand level, inertia and reserves at the time.',
        sources: [S.aug2019, S.nrr],
    }),
    make({
        id: 'af_largest_ic', name: 'Largest interconnector trips during low wind', category: 'Asset Failure',
        description: 'A 1,400 MW interconnector trips while importing at full power on a low-wind evening.',
        narrative: 'The loss is within the 1,800 MW the system is secured for, so frequency response and reserve cover it and no customers should be cut off. It shows why multiple simultaneous losses matter more than single ones.',
        probability: 'Medium', impactLevel: 'Minor', customersBasis: 'sourced', affectedAssets: ['i1'],
        model: { type: 'none', days: 1 },
        supplyLost: { mw: 1400, label: 'Up to 1,400 MW of imports' },
        rationale: 'The SQSS secures the system against losses up to 1,800 MW, so a single 1,400 MW loss should not trigger LFDD (see Ofgem 2020 for how the limits work).',
        sources: [S.aug2019],
    }),
    make({
        id: 'af_substation_fire', name: 'Fire at a major substation supplying a city area', category: 'Asset Failure',
        description: 'A transformer fault starts a fire at a 275 kV substation, cutting supply to tens of thousands of customers and a critical site.',
        narrative: 'Modelled on North Hyde (March 2025): the whole substation is lost overnight; the distribution network is rearranged to restore customers by the next afternoon, while a major airport is closed for most of a day.',
        probability: 'Medium', impactLevel: 'Major', customersBasis: 'sourced', coordinates: { lat: 51.5, lng: -0.42 },
        model: { type: 'instant', peak: 71655, offHours: 6, restoreHours: 7 },
        rationale: 'North Hyde (20-21 March 2025): 71,655 customers lost power; all but two of the 66,919 customers supplied by SSEN were restored by 12:24 the next day (NESO 2025). The 6 + 7 hour shape approximates that timeline.',
        sources: [S.northHyde],
    }),
    make({
        id: 'af_voltage_collapse', name: 'System-wide collapse from voltage instability', category: 'Asset Failure',
        description: 'Voltage control fails on a low-demand day; generators trip in a cascade and the whole system shuts down.',
        narrative: 'Like Spain and Portugal on 28 April 2025, the system collapses within seconds. GB restores supply under the Electricity System Restoration Standard.',
        probability: 'Low', impactLevel: 'Critical', customersBasis: 'assumption',
        model: { type: 'restoration', peak: 30000000, delayHours: 1, pct24h: 60, fullHours: 120 },
        rationale: 'Iberia (Apr 2025): more than 50 million people lost power and supply was restored within about 12-16 hours, helped by neighbouring systems (POWER/ENTSO-E). GB is planned against the ESRS (60% within 24 hours, 100% within 5 days), which is used here. Peak uses about 30 million GB customers (assumption).',
        sources: [S.iberia, S.esrs, S.nrr],
    }),

    // ---------------- Supply chain ----------------
    make({
        id: 'sc_transformer_spare', name: 'Large transformer fails with no spare available', category: 'Supply Chain',
        description: 'A grid supply point transformer fails and no spare is available; replacement takes well over a year.',
        narrative: 'Customers are moved onto neighbouring circuits and temporary generation within a day, but the area runs without its normal back-up for a long time, so a second fault would cause a longer power cut.',
        probability: 'Medium', impactLevel: 'Major', customersBasis: 'assumption',
        model: { type: 'instant', peak: 80000, offHours: 4, restoreHours: 20 },
        rationale: 'Illustrative assumption: a grid supply point serving about 80,000 customers, restored by network switching and temporary generation within a day. The IEA reports lead times for large transformers have roughly doubled since 2021, which is why the reduced resilience lasts so long.',
        sources: [S.iea, S.nrr],
    }),
    make({
        id: 'sc_type_fault', name: 'Type fault found in a widely used piece of switchgear', category: 'Supply Chain',
        description: 'A defect is found in a common model of switchgear, so operators restrict how it can be used until it is fixed.',
        narrative: 'No immediate power cuts, but restrictions reduce flexibility and slow fault restoration while hundreds of units are inspected or modified.',
        probability: 'Medium', impactLevel: 'Minor', customersBasis: 'assumption',
        model: { type: 'none', days: 30 },
        rationale: 'Base case assumes safe operating restrictions prevent customer impact. The risk is longer outages if faults occur while restricted, which this model does not count.',
        sources: [S.nrr],
    }),
    make({
        id: 'sc_storm_staffing', name: 'Major storm during a pandemic-scale staff absence', category: 'Supply Chain',
        description: 'An Arwen-scale storm hits while many field engineers and contractors are off sick.',
        narrative: 'The same damage as a major storm, but fewer crews means restoration is much slower and more customers are off for days.',
        probability: 'Low', impactLevel: 'Critical', customersBasis: 'assumption', coordinates: { lat: 55.3, lng: -2.3 },
        model: { type: 'storm', peak: 1000000, buildHours: 12, pctRestored24h: 60, pctStillOff7d: 3 },
        rationale: 'Starts from Storm Arwen (1 million customers; Ofgem 2022). Slower restoration (60% within 24 hours, 3% still off after a week) is an assumption for reduced field staff. Pandemics are on the National Risk Register.',
        sources: [S.arwen, S.nrr],
    }),
    make({
        id: 'sc_export_controls', name: 'Export restrictions on critical grid components', category: 'Supply Chain',
        description: 'A major producing country restricts exports of key components (transformers, cable, power electronics, critical minerals).',
        narrative: 'No immediate effect on supply, but connections, repairs and upgrades are delayed for months, and the network carries more risk while spares run down.',
        probability: 'Medium', impactLevel: 'Major', customersBasis: 'assumption',
        model: { type: 'none', days: 180 },
        rationale: 'A chronic risk rather than an outage: no customer power cuts in the base case. The IEA notes supply chains for grid equipment are already stretched.',
        sources: [S.iea, S.nrr],
    }),

    // ---------------- Geopolitical ----------------
    make({
        id: 'gp_subsea', name: 'Subsea power cables and a gas pipeline damaged together', category: 'Geopolitical',
        description: 'Two interconnectors and a major import gas pipeline are damaged on the seabed within days of each other.',
        narrative: 'As in the Baltic in 2023-2024, damage may take months to repair. GB can cover the losses in mild weather, but the margin for a cold spell is much smaller.',
        probability: 'Low', impactLevel: 'Major', customersBasis: 'assumption', affectedAssets: ['i1', 'i2', 'g1'],
        model: { type: 'none', days: 60 },
        supplyLost: { mw: 2400, label: 'About 2.4 GW of interconnector capacity, plus a major gas import route (see the Energy Flows panel for live figures)' },
        rationale: 'Baltic precedent: Estlink 2 power cable failed in December 2024 (Fingrid) and the Balticconnector gas pipeline was damaged in October 2023. No customer cuts in the base case; run with the cold, still week to stress-test.',
        sources: [S.estlink, S.gasData, S.nrr],
    }),
    make({
        id: 'gp_gas_winter', name: 'Loss of Norwegian pipeline gas in a cold spell', category: 'Geopolitical',
        description: 'Supplies from Norway are cut for two weeks during cold weather; a Gas Deficit Emergency limits gas to power stations.',
        narrative: 'Large gas users, including power stations, are cut back first to protect homes. Electricity supply falls short at peak times, so rota disconnections share the shortfall across the country in blocks of a few hours.',
        probability: 'Low', impactLevel: 'Critical', customersBasis: 'assumption',
        model: { type: 'rota', shareOff: 0.05, days: 5 },
        rationale: 'Norwegian pipeline gas is often the largest single source of GB supply (see the live Energy Flows panel). Rota disconnections under the Electricity Supply Emergency Code are the planned response to a sustained shortfall. The 5% of customers off at any one time, for 5 of the 14 days, is an illustrative assumption.',
        sources: [S.gasData, S.esec, S.nrr],
    }),
    make({
        id: 'gp_substation_attack', name: 'Coordinated physical attack on distribution substations', category: 'Geopolitical',
        description: 'Several distribution substations in one area are deliberately damaged on the same night.',
        narrative: 'Modelled on Moore County, North Carolina (Dec 2022): damaged equipment has to be replaced before supply returns, so customers are off for several days.',
        probability: 'Low', impactLevel: 'Major', customersBasis: 'sourced',
        model: { type: 'instant', peak: 45000, offHours: 72, restoreHours: 48 },
        rationale: 'Moore County: about 45,000 customers lost power for up to five days. Same scale and duration used here; GB network design would change the actual figures.',
        sources: [S.moore, S.nrr],
    }),
    make({
        id: 'gp_lng', name: 'Global LNG shipping disruption in winter', category: 'Geopolitical',
        description: 'Conflict or shipping disruption cuts LNG cargoes to Europe for a month in winter.',
        narrative: 'Prices rise sharply and storage is drawn down faster. On its own this is unlikely to cut supply to customers, but it removes headroom for other events.',
        probability: 'Medium', impactLevel: 'Major', customersBasis: 'assumption',
        model: { type: 'none', days: 30 },
        rationale: 'LNG is a large but variable part of GB gas supply (see the live Energy Flows panel). No customer cuts in the base case.',
        sources: [S.gasData, S.nrr],
    }),

    // ---------------- Growth and demand ----------------
    make({
        id: 's_growth_dc', name: 'Data centre expansion (2015-2025)', category: 'Growth',
        description: 'Ten-year timelapse of data centre growth across the UK.',
        narrative: 'Shows the data centres on the map coming online over a decade, and the growing load on local networks.',
        probability: 'High', impactLevel: 'Major', customersBasis: 'assumption',
        affectedAssets: ['dc_slough_1', 'dc_london_dock', 'dc_dublin_link', 'dc_manchester', 'dc_newport', 'dc_edinburgh', 'dc_hemel', 'dc_slough_2', 'dc_london_north', 'dc_newcastle', 'dc_birmingham', 'dc_scotland_wind', 'dc_london_west', 'dc_cumbria'],
        model: { type: 'growth', mwAdded: 2500, years: 10 },
        rationale: 'Illustrative: the 2,500 MW total and the growth curve are assumptions for visualisation, not measured data. Investment is not modelled.',
        sources: [S.nrr],
    }),
    make({
        id: 'gr_cold_electrified', name: 'Electrified winter peak in a cold snap (2030s)', category: 'Growth',
        description: 'Millions of heat pumps and electric vehicles push winter peak demand well above today\'s levels during a cold spell.',
        narrative: 'Without enough flexibility, local networks overload first. Base case assumes smart charging and flexibility keep the system within limits.',
        probability: 'Medium', impactLevel: 'Major', customersBasis: 'assumption',
        model: { type: 'none', days: 7 },
        rationale: 'A planning stress test, not a forecast: no customer cuts in the base case. Network and system operators plan for this through their future energy scenarios.',
        sources: [S.winter],
    }),
    make({
        id: 'gr_dc_gsp', name: 'Data centre demand overloads a grid supply point', category: 'Growth',
        description: 'Several large data centres connect to the same grid supply point faster than it can be reinforced.',
        narrative: 'Operators manage the constraint by limiting connections and using flexibility; the risk is a fault during a peak causing a local outage.',
        probability: 'Medium', impactLevel: 'Minor', customersBasis: 'assumption',
        model: { type: 'none', days: 30 },
        rationale: 'Base case: managed constraint, no customer cuts. See the connection registers on the map for real queues at each substation.',
        sources: [S.nrr],
    }),
] as RiskScenario[]).map(withMap);
