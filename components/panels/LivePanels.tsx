// Live-mode window contents: Overview, Electricity, Outages.
// Every figure shows where it comes from; missing data shows as "–", never a guess.
import React, { useMemo, useState } from 'react';
import { GenerationMix, OutageEvent, GeneratorOutage, InfrastructureAsset } from '../../types';
import { GasSnapshot, SystemWarning, RegionalCarbon } from '../../services/liveSystems';
import { FlowsSummary, fmtGW } from '../../services/flows';
import { ChartBarIcon } from '@heroicons/react/24/solid';

export interface NesoNow { demand: number; frequency: number; carbonIntensity: number; estimated?: boolean }

const Card: React.FC<{ label: string; value: React.ReactNode; note?: React.ReactNode; tone?: string; onClick?: () => void; title?: string }> = ({ label, value, note, tone = 'text-white', onClick, title }) => {
    const body = (
        <>
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-1">{label}{onClick && <ChartBarIcon className="w-3 h-3 text-slate-500" />}</div>
            <div className={`font-mono text-lg leading-tight ${tone}`}>{value}</div>
            {note && <div className="text-[10px] text-slate-500 mt-0.5">{note}</div>}
        </>
    );
    return onClick
        ? <button type="button" onClick={onClick} title={title} className="text-left bg-slate-900 border border-slate-800 hover:border-slate-600 rounded-lg p-2.5">{body}</button>
        : <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5">{body}</div>;
};

const FUEL_COLOURS: Record<string, string> = { wind: '#10b981', gas: '#f97316', nuclear: '#a855f7', imports: '#22d3ee', biomass: '#84cc16', solar: '#facc15', hydro: '#60a5fa', coal: '#78716c', other: '#94a3b8', storage: '#a3e635' };

export const MixBar: React.FC<{ mix: GenerationMix | null }> = ({ mix }) => {
    if (!mix) return <div className="text-[11px] text-slate-500">Generation mix unavailable.</div>;
    const items = [...mix.generation].filter(g => g.perc > 0).sort((a, b) => b.perc - a.perc);
    return (
        <div>
            <div className="flex h-3 rounded overflow-hidden" role="img" aria-label={`Generation mix: ${items.map(g => `${g.fuel} ${g.perc}%`).join(', ')}`}>
                {items.map(g => <div key={g.fuel} style={{ width: `${g.perc}%`, background: FUEL_COLOURS[g.fuel] || '#94a3b8' }} />)}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-[10px] text-slate-400">
                {items.map(g => <span key={g.fuel}><span style={{ color: FUEL_COLOURS[g.fuel] || '#94a3b8' }}>■</span> {g.fuel} {g.perc}%</span>)}
            </div>
        </div>
    );
};

// ---------- Overview ----------
export const OverviewPanel: React.FC<{
    neso: NesoNow; mix: GenerationMix | null; flows: FlowsSummary; gas: GasSnapshot | null;
    outages: OutageEvent[]; generatorOutages: GeneratorOutage[]; warnings: SystemWarning[];
    feedsLive: string; onHistory: (m: 'demand' | 'frequency') => void; onOpen: (id: string) => void;
}> = ({ neso, mix, flows, gas, outages, generatorOutages, warnings, feedsLive, onHistory, onOpen }) => {
    const genOut = generatorOutages.reduce((a, g) => a + g.unavailableMW, 0);
    const genUnplanned = generatorOutages.filter(g => !g.planned).reduce((a, g) => a + g.unavailableMW, 0);
    const hasElec = flows.links.some(l => l.kind === 'electricity');
    const haveGrid = neso.demand > 0; // nothing has loaded yet if demand is still 0
    const freqOk = neso.frequency >= 49.8 && neso.frequency <= 50.2;
    return (
        <div className="space-y-3">
            {warnings.length > 0
                ? <button type="button" onClick={() => onOpen('systems')} className="w-full text-left rounded-lg border border-red-800 bg-red-950/40 p-2.5 text-[11px] text-red-200"><b>{warnings[0].type}</b> · {new Date(warnings[0].published).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}<div className="text-red-300/80 line-clamp-2">{warnings[0].text}</div></button>
                : <div className="rounded-lg border border-emerald-900 bg-emerald-950/30 p-2 text-[11px] text-emerald-300">No NESO margin or demand-control notices in the last 48 hours.</div>}
            <div className="grid grid-cols-2 gap-2">
                <Card label="Demand" value={neso.demand > 0 ? `${(neso.demand / 1000).toFixed(1)} GW` : '–'} note={neso.estimated ? 'est. (feed unavailable)' : 'Elexon · click for history'} onClick={() => onHistory('demand')} title="Demand history" />
                <Card label="Frequency" value={haveGrid ? `${neso.frequency.toFixed(2)} Hz` : '–'} tone={!haveGrid ? 'text-slate-400' : freqOk ? 'text-emerald-300' : 'text-red-300'} note={!haveGrid ? 'Waiting for Elexon' : neso.estimated ? 'est. (feed unavailable)' : freqOk ? 'Within normal limits' : 'Outside 49.8-50.2 Hz'} onClick={() => onHistory('frequency')} title="Frequency history" />
                <Card label="Net electricity import" value={hasElec ? fmtGW(flows.elecImportGW - flows.elecExportGW) : '–'} tone="text-cyan-300" note={hasElec ? `${flows.elecImportGW - flows.elecExportGW >= 0 ? 'importing' : 'exporting'} · ${flows.links.filter(l => l.kind === 'electricity').length} links` : 'Elexon not answering'} onClick={() => onOpen('flows')} title="Energy flows" />
                <Card label="Gas supply" value={gas?.totalSupply != null ? `${gas.totalSupply.toFixed(0)} mcm/d` : '–'} tone="text-amber-300" note={flows.gasImportShare !== null ? `≥${Math.round(flows.gasImportShare * 100)}% imported` : 'National Gas'} onClick={() => onOpen('flows')} title="Energy flows" />
                <Card label="Power cuts" value={outages.length} tone={outages.length ? 'text-red-300' : 'text-emerald-300'} note={feedsLive} onClick={() => onOpen('outages')} title="Outages" />
                <Card label="Generator outages" value={generatorOutages.length ? `${(genOut / 1000).toFixed(1)} GW` : '–'} tone="text-orange-300" note={generatorOutages.length ? `${(genUnplanned / 1000).toFixed(1)} GW unplanned · REMIT` : 'No REMIT notices loaded'} onClick={() => onOpen('outages')} title="Outages" />
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
                <div className="text-[11px] font-semibold text-slate-200 mb-2">Generation mix now <span className="font-normal text-slate-500">· NESO / Elexon</span></div>
                <MixBar mix={mix} />
                {neso.carbonIntensity > 0 && <div className="text-[10px] text-slate-400 mt-2">Carbon intensity: <b className="text-slate-200">{neso.carbonIntensity} gCO2/kWh</b></div>}
            </div>
            {gas && <div className="text-[10px] text-slate-500">Gas linepack {gas.linepack ?? '–'} mcm · to power stations {gas.powerStations ?? '–'} mcm/d</div>}
        </div>
    );
};

// ---------- Electricity ----------
export const ElectricityPanel: React.FC<{ mix: GenerationMix | null; neso: NesoNow; carbon: Record<string, RegionalCarbon>; assets: InfrastructureAsset[]; onHistory: (m: 'demand' | 'frequency') => void; onSelect: (a: InfrastructureAsset) => void }> = ({ mix, neso, carbon, assets, onHistory, onSelect }) => {
    const [list, setList] = useState<'Renewables' | 'Fossil' | null>(null);
    const listAssets = useMemo(() => {
        if (!list) return [];
        const types = list === 'Renewables' ? ['wind_onshore', 'wind_offshore', 'solar', 'hydro', 'biomass'] : ['gas', 'coal', 'nuclear'];
        return assets.filter(a => types.includes(a.typeId)).sort((a, b) => (b.capacityMW || 0) - (a.capacityMW || 0)).slice(0, 40);
    }, [list, assets]);
    const regions = Object.entries(carbon).sort((a, b) => b[1].intensity - a[1].intensity);
    return (
        <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => onHistory('demand')} className="rounded-lg border border-slate-700 bg-slate-900 hover:border-slate-500 p-2.5 text-left text-xs"><b>Demand history</b><div className="text-[10px] text-slate-400">24 h, 7 d, 30 d, 1 year</div></button>
                <button type="button" onClick={() => onHistory('frequency')} className="rounded-lg border border-slate-700 bg-slate-900 hover:border-slate-500 p-2.5 text-left text-xs"><b>Frequency history</b><div className="text-[10px] text-slate-400">24 h, 7 d, 30 d, 1 year</div></button>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
                <div className="text-[11px] font-semibold mb-2">Generation mix</div>
                <MixBar mix={mix} />
                {mix && <div className="grid grid-cols-3 gap-2 mt-3 text-center text-[11px]">
                    <button type="button" onClick={() => setList(list === 'Renewables' ? null : 'Renewables')} className={`rounded p-1.5 border ${list === 'Renewables' ? 'border-emerald-500 bg-emerald-950/40' : 'border-slate-800'}`}><div className="text-emerald-300 font-mono text-base">{mix.renewablesPerc}%</div>Renewables</button>
                    <div className="rounded p-1.5 border border-slate-800"><div className="text-purple-300 font-mono text-base">{mix.lowCarbonPerc}%</div>Low carbon</div>
                    <button type="button" onClick={() => setList(list === 'Fossil' ? null : 'Fossil')} className={`rounded p-1.5 border ${list === 'Fossil' ? 'border-orange-500 bg-orange-950/40' : 'border-slate-800'}`}><div className="text-orange-300 font-mono text-base">{mix.fossilPerc}%</div>Fossil</button>
                </div>}
                {list && <div className="mt-2 max-h-48 overflow-y-auto custom-scrollbar space-y-0.5">
                    {listAssets.length === 0 ? <div className="text-[11px] text-slate-500">No {list.toLowerCase()} assets loaded in this view.</div> : listAssets.map(a => (
                        <button key={a.id} type="button" onClick={() => onSelect(a)} className="w-full flex justify-between text-[11px] px-1.5 py-1 rounded hover:bg-slate-800 text-left"><span className="truncate">{a.name}</span><span className="text-slate-500 font-mono shrink-0 ml-2">{a.capacityMW ? `${a.capacityMW} MW` : ''}</span></button>
                    ))}
                </div>}
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
                <div className="text-[11px] font-semibold mb-1">Carbon intensity by region <span className="font-normal text-slate-500">· NESO forecast</span></div>
                {neso.carbonIntensity > 0 && <div className="text-[10px] text-slate-400 mb-2">GB now: <b className="text-slate-200">{neso.carbonIntensity} gCO2/kWh</b></div>}
                {regions.length === 0 ? <div className="text-[11px] text-slate-500">Unavailable.</div> : (
                    <div className="space-y-1">
                        {regions.map(([name, r]) => (
                            <div key={name} className="flex items-center gap-2 text-[10px]">
                                <span className="w-32 truncate text-slate-300">{name}</span>
                                <div className="flex-1 h-1.5 bg-slate-800 rounded"><div className="h-1.5 rounded bg-slate-400" style={{ width: `${Math.min(100, r.intensity / 4)}%` }} /></div>
                                <span className="w-10 text-right font-mono text-slate-400">{r.intensity}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

// ---------- Outages ----------
export const OutagesPanel: React.FC<{ outages: OutageEvent[]; generatorOutages: GeneratorOutage[]; onFullList: () => void; onGoTo: (lat: number, lng: number) => void }> = ({ outages, generatorOutages, onFullList, onGoTo }) => {
    const bySource = useMemo(() => {
        const m = new Map<string, { n: number; customers: number }>();
        outages.forEach(o => { const k = (o.source || 'Unknown').replace(/\s*\(live\)\s*/i, ''); const v = m.get(k) || { n: 0, customers: 0 }; v.n++; v.customers += o.consumersAffected || 0; m.set(k, v); });
        return Array.from(m.entries()).sort((a, b) => b[1].n - a[1].n);
    }, [outages]);
    const top = [...outages].sort((a, b) => (b.consumersAffected || 0) - (a.consumersAffected || 0)).slice(0, 12);
    const gens = [...generatorOutages].sort((a, b) => Number(a.planned) - Number(b.planned) || b.unavailableMW - a.unavailableMW).slice(0, 10);
    return (
        <div className="space-y-3">
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
                <div className="flex justify-between items-center mb-2"><span className="text-[11px] font-semibold">Power cuts by network</span><button type="button" onClick={onFullList} className="text-[11px] text-cyan-300 hover:underline">Full list</button></div>
                {bySource.length === 0 ? <div className="text-[11px] text-emerald-300">No live power cuts reported by the connected feeds.</div> : bySource.map(([k, v]) => (
                    <div key={k} className="flex justify-between text-[11px] py-0.5"><span className="text-slate-300">{k}</span><span className="text-slate-400 font-mono">{v.n} · {v.customers ? v.customers.toLocaleString() : '?'} cust.</span></div>
                ))}
                <div className="text-[10px] text-amber-300/80 mt-2">No open live feed for North West England (Electricity North West): <a href="https://www.enwl.co.uk" target="_blank" rel="noopener noreferrer" className="underline">enwl.co.uk</a> or call 105.</div>
            </div>
            {top.length > 0 && <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
                <div className="text-[11px] font-semibold mb-1.5">Largest power cuts</div>
                {top.map(o => (
                    <button key={o.id} type="button" onClick={() => onGoTo(o.lat, o.lng)} className="w-full text-left flex justify-between gap-2 text-[11px] px-1.5 py-1 rounded hover:bg-slate-800">
                        <span className="truncate text-slate-200">{o.locationName}<span className="text-slate-500"> · {(o.source || '').replace(/\s*\(live\)/i, '')}</span></span>
                        <span className="text-slate-400 font-mono shrink-0">{o.consumersAffected ? o.consumersAffected.toLocaleString() : '–'}</span>
                    </button>
                ))}
            </div>}
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
                <div className="text-[11px] font-semibold mb-1.5">Power station and interconnector outages <span className="font-normal text-slate-500">· Elexon REMIT</span></div>
                {gens.length === 0 ? <div className="text-[11px] text-slate-500">None loaded.</div> : gens.map(g => (
                    <button key={g.id} type="button" disabled={typeof g.lat !== 'number'} onClick={() => typeof g.lat === 'number' && onGoTo(g.lat, g.lng!)} className="w-full text-left flex justify-between gap-2 text-[11px] px-1.5 py-1 rounded hover:bg-slate-800 disabled:hover:bg-transparent">
                        <span className="truncate"><span className={g.planned ? 'text-slate-400' : 'text-amber-300'}>{g.planned ? 'Planned' : 'Unplanned'}</span> · {g.siteName || g.unit} <span className="text-slate-500">{g.fuelType}</span></span>
                        <span className="font-mono text-slate-300 shrink-0">{Math.round(g.unavailableMW)} MW</span>
                    </button>
                ))}
            </div>
        </div>
    );
};
