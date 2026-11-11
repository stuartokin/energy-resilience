import React from 'react';
import { InterconnectorFlow, GasSnapshot, WeatherWarning, FloodWarning } from '../services/liveSystems';
import { GeneratorOutage } from '../types';

interface Props {
    flows: InterconnectorFlow[];
    gas: GasSnapshot | null;
    weather: WeatherWarning[];
    floods: { warnings: FloodWarning[], alerts: number } | null;
    generatorOutages: GeneratorOutage[];
    updated: Date | null;
}

const fmt = (v: number | null | undefined, d = 0) => (v === null || v === undefined || isNaN(v) ? '–' : v.toFixed(d));
const levelColour: Record<string, string> = { Red: 'bg-red-600', Amber: 'bg-amber-500', Yellow: 'bg-yellow-400 text-black' };

const Section: React.FC<{ title: string, source: string, children: React.ReactNode }> = ({ title, source, children }) => (
    <div className="border-t border-slate-800 pt-2 mt-2 first:border-0 first:pt-0 first:mt-0">
        <div className="flex justify-between items-baseline mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wide text-cyan-400">{title}</span>
            <span className="text-[9px] text-slate-600">{source}</span>
        </div>
        {children}
    </div>
);

const LiveSystemsPanel: React.FC<Props> = ({ flows, gas, weather, floods, generatorOutages, updated }) => {
    const netImport = flows.reduce((a, f) => a + f.mw, 0);
    const genOutMW = generatorOutages.reduce((a, g) => a + g.unavailableMW, 0);
    const genUnplannedMW = generatorOutages.filter(g => !g.planned).reduce((a, g) => a + g.unavailableMW, 0);
    return (
        <div className="text-xs text-slate-300 space-y-1 max-h-[60vh] overflow-y-auto custom-scrollbar pr-1">
            <Section title="Interconnectors" source="Elexon">
                <div className="text-[11px] mb-1">Net {netImport >= 0 ? 'import' : 'export'}: <b className="text-white">{Math.abs(netImport).toLocaleString()} MW</b></div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                    {flows.map(f => (
                        <div key={f.code} className="flex justify-between text-[10px]" title={`${f.name} to ${f.country}, capacity ${f.capacityMW} MW`}>
                            <span className="text-slate-400 truncate">{f.name}</span>
                            <span className={f.mw > 0 ? 'text-green-400' : f.mw < 0 ? 'text-orange-400' : 'text-slate-600'}>{f.mw > 0 ? '↓' : f.mw < 0 ? '↑' : ''}{Math.abs(f.mw)}</span>
                        </div>
                    ))}
                </div>
                <div className="text-[9px] text-slate-600 mt-0.5">↓ import into GB · ↑ export</div>
            </Section>

            <Section title="Generator outages" source="Elexon REMIT">
                <div className="text-[11px]"><b className="text-white">{Math.round(genOutMW).toLocaleString()} MW</b> unavailable across {generatorOutages.length} units</div>
                <div className="text-[10px] text-amber-400">{Math.round(genUnplannedMW).toLocaleString()} MW unplanned</div>
            </Section>

            <Section title="Gas system (NTS)" source="National Gas">
                {gas ? (
                    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
                        <span className="text-slate-400">Demand</span><span className="text-right text-white">{fmt(gas.ntsDemand)} mcm/d</span>
                        <span className="text-slate-400">Supply</span><span className="text-right text-white">{fmt(gas.totalSupply)} mcm/d</span>
                        <span className="text-slate-400">Linepack</span><span className="text-right text-white">{fmt(gas.linepack)} mcm</span>
                        <span className="text-slate-400">To power stations</span><span className="text-right">{fmt(gas.powerStations)} mcm/d</span>
                    </div>
                ) : <div className="text-[10px] text-slate-600">Unavailable</div>}
            </Section>

            <Section title="Weather warnings" source="Met Office">
                {weather.length === 0 ? <div className="text-[10px] text-slate-500">No warnings in force</div> : weather.slice(0, 6).map((w, i) => (
                    <a key={i} href={w.link} target="_blank" rel="noopener noreferrer" className="flex items-start gap-1.5 text-[10px] hover:text-white mb-0.5">
                        <span className={`px-1 rounded font-bold ${levelColour[w.level] || 'bg-slate-600'}`}>{w.level}</span>
                        <span>{w.type} – {w.region}</span>
                    </a>
                ))}
            </Section>

            <Section title="Flood warnings (England)" source="Environment Agency">
                {floods ? (
                    <div className="text-[10px]">
                        <span className={floods.warnings.length ? 'text-blue-300 font-bold' : 'text-slate-500'}>{floods.warnings.length} warnings</span>
                        <span className="text-slate-500"> · {floods.alerts} alerts</span>
                        {floods.warnings.filter(w => w.level === 1).length > 0 && <div className="text-red-400 font-bold">{floods.warnings.filter(w => w.level === 1).length} SEVERE</div>}
                    </div>
                ) : <div className="text-[10px] text-slate-600">Unavailable</div>}
            </Section>

            {updated && <div className="text-[9px] text-slate-600 pt-1">Updated {updated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · refreshes every 5 min</div>}
        </div>
    );
};

export default LiveSystemsPanel;
