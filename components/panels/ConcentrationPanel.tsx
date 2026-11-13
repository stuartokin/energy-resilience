// System concentration: how much of today's supply depends on one route, one link, one fuel or the weather.
// System-level only, from live public data. Deliberately no ranking of individual sites (see CLAUDE.md):
// a list of "the places whose loss would hurt most" would be a targeting aid.
import React from 'react';
import { FlowsSummary, fmtGW } from '../../services/flows';
import { GenerationMix } from '../../types';
import { ASSUMPTIONS } from '../../content/assumptions';

interface Props {
    flows: FlowsSummary;
    mix: GenerationMix | null;
    demandMW: number;
    onTest: (scenarioId: string) => void;
}

const Meter: React.FC<{ label: string; value: number | null; max?: number; display: string; detail: string; source: string; test?: { id: string; label: string }; onTest: (id: string) => void; mark?: { at: number; label: string } }> =
    ({ label, value, max = 100, display, detail, source, test, onTest, mark }) => (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
        <div className="flex justify-between gap-3 items-baseline">
            <span className="text-[12px] font-semibold text-slate-100">{label}</span>
            <span className="font-mono text-sm text-cyan-200 shrink-0">{value === null ? '–' : display}</span>
        </div>
        <div className="relative h-2 bg-slate-800 rounded mt-2" aria-hidden="true">
            {value !== null && <div className="h-2 rounded bg-cyan-500/80" style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%` }} />}
            {mark && <div className="absolute -top-1 h-4 border-l-2 border-dashed border-amber-400" style={{ left: `${Math.min(100, (mark.at / max) * 100)}%` }} title={mark.label} />}
        </div>
        <p className="text-[11px] text-slate-400 mt-1.5">{value === null ? 'No live data at the moment.' : detail}</p>
        <div className="flex justify-between items-center mt-1 gap-2">
            <span className="text-[10px] text-slate-500">{source}</span>
            {test && <button type="button" onClick={() => onTest(test.id)} className="text-[11px] text-red-300 hover:text-white underline shrink-0">{test.label}</button>}
        </div>
    </div>
);

export const ConcentrationPanel: React.FC<Props> = ({ flows, mix, demandMW, onTest }) => {
    const gas = flows.links.filter(l => l.kind === 'gas' && l.group !== 'Export pipeline' && l.gw > 0);
    const gasTotal = gas.reduce((a, l) => a + l.gw, 0);
    const topGas = [...gas].sort((a, b) => b.gw - a.gw)[0];
    const share = (g: string[]) => (gasTotal > 0 ? (gas.filter(l => g.includes(l.group)).reduce((a, l) => a + l.gw, 0) / gasTotal) * 100 : null);
    const lng = share(['LNG']);
    const imported = share(['Norway pipeline', 'LNG', 'Continental pipeline']);

    const elec = flows.links.filter(l => l.kind === 'electricity');
    const topImport = [...elec].sort((a, b) => b.value - a.value)[0];
    const importsMW = elec.reduce((a, l) => a + Math.max(0, l.value), 0);
    const byCountry: Record<string, number> = {};
    elec.forEach(l => { if (l.value > 0) byCountry[l.from] = (byCountry[l.from] || 0) + l.value; });
    const topCountry = Object.entries(byCountry).sort((a, b) => b[1] - a[1])[0];

    const fuels = (mix?.generation || []).filter(f => f.fuel !== 'imports');
    const topFuel = [...fuels].sort((a, b) => b.perc - a.perc)[0];
    const weather = mix ? (mix.generation.find(f => f.fuel === 'wind')?.perc || 0) + (mix.generation.find(f => f.fuel === 'solar')?.perc || 0) : null;
    const secured = ASSUMPTIONS.largestInfeed.value;

    return (
        <div className="space-y-2.5">
            <p className="text-[11px] text-slate-400">How much of GB supply depends right now on one route, one link, one fuel or the weather. System-level only: this panel deliberately does not rank individual sites. Each measure links to a scenario that tests it.</p>
            <Meter label="Largest single gas route" value={topGas && gasTotal ? (topGas.gw / gasTotal) * 100 : null} display={`${topGas && gasTotal ? Math.round((topGas.gw / gasTotal) * 100) : 0}%`}
                detail={topGas ? `${topGas.name}: ${fmtGW(topGas.gw)} of ${fmtGW(gasTotal)} of gas coming into the network.` : ''} source="National Gas (live), routes as in Energy flows"
                test={{ id: 'cy_gas_terminal', label: 'Test: a major terminal shuts' }} onTest={onTest} />
            <Meter label="Gas that is clearly imported" value={imported} display={`${Math.round(imported || 0)}%`}
                detail="Norway pipeline, LNG and continental pipelines. St Fergus carries both UK and Norwegian gas, so it isn't counted here." source="National Gas (live)"
                test={{ id: 'gp_gas_winter', label: 'Test: lose Norwegian gas' }} onTest={onTest} />
            <Meter label="Gas arriving as LNG" value={lng} display={`${Math.round(lng || 0)}%`} detail="LNG import terminals (ships from many countries)." source="National Gas (live)"
                test={{ id: 'gp_lng', label: 'Test: LNG shipping disruption' }} onTest={onTest} />
            <Meter label="Largest single electricity import" value={topImport && topImport.value > 0 ? topImport.value : null} max={Math.max(2100, secured * 1.15)} display={`${Math.round(topImport?.value || 0).toLocaleString()} MW`}
                mark={{ at: secured, label: `${secured.toLocaleString()} MW secured loss` }}
                detail={topImport ? `${topImport.name} (${topImport.from}). The dashed line is the ${secured.toLocaleString()} MW single loss the system is secured for (SQSS).` : ''} source="Elexon FUELINST (live)"
                test={{ id: 'af_largest_ic', label: 'Test: largest link trips' }} onTest={onTest} />
            <Meter label="Electricity imports as a share of demand" value={demandMW > 0 ? (importsMW / demandMW) * 100 : null} display={`${demandMW > 0 ? Math.round((importsMW / demandMW) * 100) : 0}%`}
                detail={topCountry ? `${Math.round(importsMW).toLocaleString()} MW in total; the most from ${topCountry[0]} (${Math.round((topCountry[1] / Math.max(1, importsMW)) * 100)}% of imports).` : 'No imports at the moment.'} source="Elexon FUELINST and demand (live)"
                test={{ id: 'gp_subsea', label: 'Test: subsea links damaged' }} onTest={onTest} />
            <Meter label="Largest single source of generation" value={topFuel ? topFuel.perc : null} display={`${topFuel ? Math.round(topFuel.perc) : 0}%`}
                detail={topFuel ? `${topFuel.fuel[0].toUpperCase()}${topFuel.fuel.slice(1)} is the biggest share of the GB mix right now.` : ''} source="NESO Carbon Intensity API (live)"
                test={{ id: 'cy_common_supplier', label: 'Test: common-mode fault in a fleet' }} onTest={onTest} />
            <Meter label="Generation that depends on the weather" value={weather} display={`${Math.round(weather || 0)}%`}
                detail="Wind and solar together. A high share is cheap and clean; the risk is a cold, still spell when it all drops at once." source="NESO Carbon Intensity API (live)"
                test={{ id: 'st_cold_still', label: 'Test: cold, still week' }} onTest={onTest} />
            <p className="text-[10px] text-slate-500">History of these measures builds up in History → Concentration. {flows.hasGasDetail ? '' : 'Gas detail is not available at the moment.'}</p>
        </div>
    );
};

export default ConcentrationPanel;
