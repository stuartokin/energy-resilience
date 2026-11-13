// Scenario impact model: transparent, deterministic, no AI and no random numbers.
//   customers off supply over time  <- the scenario's ImpactProfile (types.ts), whose numbers are explained
//                                      in the scenario's rationale and sources
//   energy not supplied (MWh)       =  customers off × average demand per customer × hours
//   cost (£m)                       =  energy not supplied × Value of Lost Load
// The values used are in content/assumptions.ts, each with its source or reasoning.
import { RiskScenario, TimelineStep, ImpactProfile } from '../types';
import { A } from '../content/assumptions';

// Customers off supply at time t (hours) for one profile
export const customersOffAt = (p: ImpactProfile, t: number): number => {
    if (t < 0) return 0; // before the event
    switch (p.type) {
        case 'instant': {
            if (t < 0) return 0;
            if (t <= p.offHours) return p.peak;
            if (p.restoreHours <= 0) return 0;
            return Math.max(0, p.peak * (1 - (t - p.offHours) / p.restoreHours));
        }
        case 'storm': {
            // Customers go off over buildHours, then are restored. Restoration curve passes through the
            // scenario's anchors: pctRestored24h after 24 h and pctStillOff7d after 7 days (both measured
            // from the peak), log-linear between anchors, then the last customers over two more days.
            if (t < 0) return 0;
            if (t <= p.buildHours) return p.peak * (t / Math.max(1, p.buildHours));
            const s = t - p.buildHours;
            const r24 = Math.max(1e-4, 1 - p.pctRestored24h / 100);
            const r7d = Math.max(1e-5, Math.min(r24, p.pctStillOff7d / 100));
            let remaining: number;
            if (s <= 24) remaining = Math.exp(Math.log(r24) * (s / 24));
            else if (s <= 168) remaining = Math.exp(Math.log(r24) + (Math.log(r7d) - Math.log(r24)) * ((s - 24) / 144));
            else remaining = Math.max(0, r7d * (1 - (s - 168) / 48));
            return p.peak * remaining;
        }
        case 'restoration': {
            // Black-start style: everyone off until restoration starts, then pct24h restored 24 h later,
            // and everyone by fullHours (Electricity System Restoration Standard shape).
            if (t < 0) return 0;
            const s = t - p.delayHours;
            if (s <= 0) return p.peak;
            const restored = s <= 24 ? (p.pct24h / 100) * (s / 24)
                : Math.min(1, p.pct24h / 100 + (1 - p.pct24h / 100) * ((s - 24) / Math.max(1, p.fullHours - 24)));
            return p.peak * (1 - restored);
        }
        case 'rota':
            return t >= 0 && t < p.days * 24 ? A('gbCustomers') * p.shareOff : 0;
        case 'none':
        case 'growth':
            return 0;
    }
};

export const horizonHours = (p: ImpactProfile): number => {
    switch (p.type) {
        case 'instant': return p.offHours + p.restoreHours;
        case 'storm': return p.buildHours + 168 + 48;
        case 'restoration': return p.delayHours + p.fullHours;
        case 'rota': return p.days * 24;
        case 'none': return p.days * 24;
        case 'growth': return p.years * 8760;
    }
};

// Older or AI-generated scenarios without a model: a simple, labelled default shape
// (ramp to the stated peak over the first fifth of the duration, then linear restoration).
export const fallbackProfile = (s: RiskScenario): ImpactProfile => ({
    type: 'instant', peak: s.peakConsumersAffected || 0, offHours: Math.max(1, s.durationDays * 24 * 0.2), restoreHours: Math.max(1, s.durationDays * 24 * 0.8),
});

export const profileOf = (s: RiskScenario): ImpactProfile => s.model || fallbackProfile(s);

export const peakOf = (p: ImpactProfile): number => {
    if (p.type === 'rota') return Math.round(A('gbCustomers') * p.shareOff);
    if (p.type === 'none' || p.type === 'growth') return 0;
    return p.peak;
};

const stepFor = (h: number) => (h <= 48 ? 1 : h <= 240 ? 6 : 24);
const labelFor = (t: number, step: number) => (step === 1 ? `Hour ${t}` : t % 24 === 0 ? `Day ${t / 24}` : `Day ${(t / 24).toFixed(2).replace(/0$/, '')}`);

// Growth scenarios (capacity added over years); no cost is invented for these
const growthTimeline = (p: Extract<ImpactProfile, { type: 'growth' }>): TimelineStep[] => {
    const steps: TimelineStep[] = [];
    const n = 60, start = 2015;
    for (let i = 0; i <= n; i++) {
        const progress = i / n;
        const year = Math.floor(start + progress * p.years);
        const mw = Math.round(p.mwAdded * Math.pow(progress, 2.5));
        steps.push({ day: i, label: String(year), consumersOffline: mw, costMillions: 0, restorationPct: Math.round(progress * 100), activeAlerts: i % 6 === 0 ? [`Year ${year}`] : [], description: `${year}: about ${mw} MW added` });
    }
    return steps;
};

// One combined timeline for one or more scenarios running together
export const buildTimeline = (scenarios: RiskScenario[]): TimelineStep[] => {
    if (!scenarios.length) return [];
    const growth = scenarios.find(s => s.model?.type === 'growth' || (!s.model && s.category === 'Growth'));
    if (growth && scenarios.length === 1) {
        const p = growth.model?.type === 'growth' ? growth.model : { type: 'growth' as const, mwAdded: growth.peakConsumersAffected, years: 10 };
        return growthTimeline(p);
    }
    const profiles = scenarios.map(profileOf).filter(p => p.type !== 'growth');
    const horizon = Math.max(1, ...profiles.map(horizonHours));
    const step = stepFor(horizon);
    const peakTotal = profiles.reduce((a, p) => a + peakOf(p), 0) || 1;
    const kw = A('avgCustomerKw'), voll = A('voll');
    const steps: TimelineStep[] = [];
    let mwh = 0;
    // Lead-in: a few steps of normal running before the event hits (about an eighth of the run, at least 4 steps)
    const lead = Math.max(4, Math.round((horizon / step) * 0.12));
    for (let j = lead; j > 0; j--) {
        const t = -j * step;
        const label = step === 24 ? `${j} day${j > 1 ? 's' : ''} before` : `${j * step} h before`;
        steps.push({ day: steps.length, hours: t, label, consumersOffline: 0, costMillions: 0, energyUnservedMWh: 0, restorationPct: 100, activeAlerts: [], description: `${label}: normal running, all customers on supply` });
    }
    for (let i = 0, t = 0; t <= horizon + step; i++, t += step) {
        const off = profiles.reduce((a, p) => a + customersOffAt(p, t), 0);
        if (i > 0) mwh += (off * kw * step) / 1000;
        steps.push({
            day: steps.length, hours: t, label: labelFor(t, step),
            consumersOffline: Math.round(off),
            costMillions: Math.round((mwh * voll) / 1e5) / 10,
            energyUnservedMWh: Math.round(mwh),
            restorationPct: Math.max(0, Math.min(100, Math.round((1 - off / peakTotal) * 100))),
            activeAlerts: i === 0 ? ['Event start'] : [],
            description: `${labelFor(t, step)}: ${Math.round(off).toLocaleString()} customers off supply`,
        });
    }
    return steps;
};

// Plain-English summary of how the numbers were produced
export const methodNote = 'Customers off supply follow the scenario\'s restoration profile (see its rationale and sources). Cost = energy not supplied × Value of Lost Load (£16,950/MWh, DECC 2013); energy not supplied = customers off × 0.31 kW average domestic demand (Ofgem) × hours. Excludes wider economic and social costs, so it is a floor, not an estimate of total cost.';

export const describeProfile = (p: ImpactProfile): string => {
    switch (p.type) {
        case 'instant': return `${p.peak.toLocaleString()} customers off at once, held for ${p.offHours} h, then restored over ${p.restoreHours} h.`;
        case 'storm': return `Builds to ${p.peak.toLocaleString()} customers over ${p.buildHours} h; ${p.pctRestored24h}% restored within 24 h; ${p.pctStillOff7d}% still off after 7 days.`;
        case 'restoration': return `${p.peak.toLocaleString()} customers off; restoration starts after ${p.delayHours} h; ${p.pct24h}% restored 24 h later; all by ${p.fullHours} h.`;
        case 'rota': return `Rota disconnections: about ${(p.shareOff * 100).toFixed(0)}% of GB customers off at any one time, in rotating blocks, for ${p.days} days.`;
        case 'none': return `No customer power cuts expected in the base case (${p.days} days of heightened risk).`;
        case 'growth': return `${p.mwAdded.toLocaleString()} MW added over ${p.years} years.`;
    }
};
