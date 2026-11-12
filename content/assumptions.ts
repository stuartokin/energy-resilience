// Every number the scenario impact model uses, with where it comes from.
// Shown in Help > Scenario model, and next to results. Change a value here and every scenario updates.
// Rule (see CLAUDE.md): a value is either sourced, or labelled as an assumption with the reasoning.

export interface Assumption {
    id: string;
    label: string;
    value: number;
    unit: string;
    kind: 'sourced' | 'assumption';
    basis: string;
    source?: { title: string; url: string };
}

export const ASSUMPTIONS: Record<string, Assumption> = {
    voll: {
        id: 'voll', label: 'Value of Lost Load (VoLL)', value: 16950, unit: '£/MWh', kind: 'sourced',
        basis: 'Central GB estimate used to set the electricity reliability standard (2012 prices), from a London Economics survey of domestic and SME customers. Used here to put a cost on electricity not supplied. It does not capture wider economic or social costs, so true costs of long or widespread outages are likely higher.',
        source: { title: 'DECC (2013) Reliability Standard Methodology, Annex C', url: 'https://assets.publishing.service.gov.uk/media/5a7c4a16ed915d338141dd0a/Annex_C_-_reliability_standard_methodology.pdf' },
    },
    avgCustomerKw: {
        id: 'avgCustomerKw', label: 'Average demand per customer', value: 0.31, unit: 'kW', kind: 'assumption',
        basis: 'Ofgem\'s typical domestic electricity use of 2,700 kWh a year ÷ 8,760 hours ≈ 0.31 kW. Business customers use more, and winter evening demand is higher, so this understates lost energy (and cost) for most events.',
        source: { title: 'Ofgem: average gas and electricity usage (TDCV)', url: 'https://www.ofgem.gov.uk/information-consumers/energy-advice-households/average-gas-and-electricity-use-explained' },
    },
    gbCustomers: {
        id: 'gbCustomers', label: 'Electricity customers in Great Britain', value: 30000000, unit: 'customers', kind: 'assumption',
        basis: 'Rounded figure for homes and businesses connected to the GB distribution networks (about 30 million is the figure commonly used by the networks). Used only for national-scale scenarios.',
        source: { title: 'Energy Networks Association', url: 'https://www.energynetworks.org/' },
    },
    largestInfeed: {
        id: 'largestInfeed', label: 'Largest single loss the system is secured for', value: 1800, unit: 'MW', kind: 'sourced',
        basis: 'Under the Security and Quality of Supply Standard (SQSS), NESO holds enough response to contain the loss of up to 1,800 MW (the "infrequent infeed loss risk") without disconnecting customers. Losses inside this limit should not cause power cuts; larger or simultaneous losses can trigger Low Frequency Demand Disconnection (LFDD).',
        source: { title: 'Ofgem (2020) 9 August 2019 power outage report (explains the SQSS loss limits)', url: 'https://www.ofgem.gov.uk/system/files/docs/2020/01/9_august_2019_power_outage_report.pdf' },
    },
    aug2019Customers: {
        id: 'aug2019Customers', label: '9 August 2019: customers disconnected by LFDD', value: 1150000, unit: 'customers', kind: 'sourced',
        basis: 'About 1,990 MW of generation was lost within seconds after a lightning strike; LFDD disconnected 892 MW of demand (about 4%), affecting 1.15 million customers. All supplies were restored within 45 minutes.',
        source: { title: 'Ofgem (2020) 9 August 2019 power outage report', url: 'https://www.ofgem.gov.uk/system/files/docs/2020/01/9_august_2019_power_outage_report.pdf' },
    },
    customersPerPctLfdd: {
        id: 'customersPerPctLfdd', label: 'Customers per 1% of demand disconnected by LFDD', value: 290000, unit: 'customers', kind: 'assumption',
        basis: 'Scaled from 9 August 2019: 1.15 million customers for about 4% of demand ≈ 290,000 customers per 1%. The real figure depends on which feeders are armed for LFDD and the time of day.',
    },
    arwenCustomers: {
        id: 'arwenCustomers', label: 'Storm Arwen (Nov 2021): customers who lost power', value: 1000000, unit: 'customers', kind: 'sourced',
        basis: 'Nearly 1 million homes lost power; 82% were restored within 24 hours; nearly 4,000 were without power for over a week.',
        source: { title: 'Ofgem (2022) review into the networks\' response to Storm Arwen', url: 'https://www.ofgem.gov.uk/publications/ofgem-publishes-full-report-following-six-month-review-networks-response-storm-arwen' },
    },
    esrs24h: {
        id: 'esrs24h', label: 'Restoration standard: regional demand restored within 24 hours', value: 60, unit: '%', kind: 'sourced',
        basis: 'Electricity System Restoration Standard: NESO must be able to restore 60% of regional demand within 24 hours and 100% of GB demand within five days after a total or partial shutdown, by 31 December 2026.',
        source: { title: 'NESO: Electricity System Restoration Standard', url: 'https://www.neso.energy/industry-information/balancing-services/electricity-system-restoration-standard' },
    },
    esrsFullDays: {
        id: 'esrsFullDays', label: 'Restoration standard: all GB demand restored within', value: 5, unit: 'days', kind: 'sourced',
        basis: 'As above (Electricity System Restoration Standard).',
        source: { title: 'NESO: Electricity System Restoration Standard', url: 'https://www.neso.energy/industry-information/balancing-services/electricity-system-restoration-standard' },
    },
    rotaBlockHours: {
        id: 'rotaBlockHours', label: 'Rota disconnection block length', value: 3, unit: 'hours', kind: 'assumption',
        basis: 'Under the Electricity Supply Emergency Code (ESEC), planned rota disconnections are organised in blocks of a few hours so the same customers are not off continuously. Three hours is used as a representative block; the code allows variations.',
        source: { title: 'DESNZ: Electricity Supply Emergency Code', url: 'https://www.gov.uk/government/publications/electricity-supply-emergency-code' },
    },
    gasCv: {
        id: 'gasCv', label: 'Gas calorific value (for GW conversion)', value: 39.5, unit: 'MJ/m³', kind: 'assumption',
        basis: 'Typical calorific value of GB transmission gas; National Gas publishes actual daily values, usually 38-41 MJ/m³. 1 mcm/d ≈ 457 MW.',
        source: { title: 'National Gas Data Portal', url: 'https://data.nationalgas.com' },
    },
};

export const A = (id: keyof typeof ASSUMPTIONS) => ASSUMPTIONS[id].value;

// Reference events used to calibrate or compare scenarios
export const REFERENCE_EVENTS: { name: string; date: string; summary: string; source: { title: string; url: string } }[] = [
    { name: 'GB frequency event (LFDD)', date: '9 Aug 2019', summary: 'About 1,990 MW of generation lost after a lightning strike; LFDD disconnected 1.15 million customers; restored within 45 minutes.', source: ASSUMPTIONS.aug2019Customers.source! },
    { name: 'Storm Arwen', date: 'Nov 2021', summary: 'Nearly 1 million homes off supply; 82% restored within 24 hours; nearly 4,000 off for over a week.', source: ASSUMPTIONS.arwenCustomers.source! },
    { name: 'North Hyde substation fire (Heathrow)', date: '20-21 Mar 2025', summary: 'Transformer bushing failure and fire at a 275 kV substation; 71,655 customers lost power and Heathrow closed for most of 21 March.', source: { title: 'NESO (2025) North Hyde review final report', url: 'https://www.neso.energy/national-energy-system-operator-publishes-final-report-review-north-hyde-substation-outage' } },
    { name: 'Iberian Peninsula blackout', date: '28 Apr 2025', summary: 'Voltage-control failure led to the collapse of the Spanish and Portuguese systems; more than 50 million people lost power; restored within about 12-16 hours.', source: { title: 'POWER (2026) on the ENTSO-E expert panel final report', url: 'https://www.powermag.com/anatomy-of-a-blackout-findings-from-the-spain-portugal-grid-collapse-final-report/' } },
    { name: 'Cyber attack on Ukrainian distribution companies', date: 'Dec 2015', summary: 'Attackers used control systems to open breakers; about 225,000 customers lost power for 1-6 hours until manual operation restored supply.', source: { title: 'E-ISAC / SANS ICS (2016) analysis of the cyber attack on the Ukrainian power grid', url: 'https://nsarchive.gwu.edu/sites/default/files/documents/3891751/SANS-and-Electricity-Information-Sharing-and.pdf' } },
    { name: 'Colonial Pipeline ransomware', date: 'May 2021', summary: 'Ransomware on business IT led the operator to shut the largest US fuel pipeline for about six days as a precaution.', source: { title: 'CISA: The attack on Colonial Pipeline, what we\'ve learned', url: 'https://www.cisa.gov/news-events/news/attack-colonial-pipeline-what-weve-learned-what-weve-done-over-past-two-years' } },
    { name: 'Moore County substation shootings', date: 'Dec 2022', summary: 'Gunfire damaged two distribution substations in North Carolina; about 45,000 customers lost power for up to five days.', source: { title: 'Wikipedia: 2022 Moore County substation attack', url: 'https://en.wikipedia.org/wiki/2022_Moore_County_substation_attack' } },
    { name: 'Baltic subsea cable and pipeline damage', date: '2023-2024', summary: 'Balticconnector gas pipeline (Oct 2023) and Estlink 2 power cable (Dec 2024) damaged, reportedly by ships\' anchors; months to repair.', source: { title: 'Fingrid (Dec 2024) Estlink 2 failure statement', url: 'https://www.fingrid.fi/en/news/news/2024/estlink-2-electricity-transmission-link-between-finland-and-estonia-has-failed-investigation-continues2/' } },
];
