// Energy flows into and out of GB: electricity and gas on one scale (GW).
// Headline totals, the make-up of gas supply, and every route as a two-way bar (left = out, right = in).
import React, { useState } from 'react';
import { FlowsSummary, FlowLink, fmtGW, fmtNative, GAS_CV_NOTE, GW_PER_MCMD, FlowGroup } from '../services/flows';

export const ELEC_COLOUR = '#22d3ee';
export const GAS_COLOUR = '#f59e0b';

const GROUP_COLOUR: Record<string, string> = {
    'Norway pipeline': '#f97316', 'UK & Norway (mixed)': '#fdba74', 'LNG': '#e879f9', 'Continental pipeline': '#facc15',
    'UK North Sea': '#a3e635', 'Storage': '#60a5fa',
};

const Bar: React.FC<{ l: FlowLink, max: number }> = ({ l, max }) => {
    const w = Math.min(50, (Math.abs(l.gw) / max) * 50);
    const colour = l.kind === 'electricity' ? ELEC_COLOUR : GAS_COLOUR;
    const dir = l.value > 0 ? 'in' : l.value < 0 ? 'out' : 'idle';
    return (
        <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-2 items-center text-[10px]" title={`${l.name}: ${l.from}${l.landing ? ` → ${l.landing}` : ''}${l.note ? `\n${l.note}` : ''}`}>
            <div className="min-w-0">
                <div className="flex justify-between gap-1">
                    <span className="truncate text-slate-300">{l.name} <span className="text-slate-500">{l.from.split(' (')[0]}</span></span>
                    <span className={`shrink-0 ${dir === 'in' ? 'text-slate-200' : dir === 'out' ? 'text-slate-400' : 'text-slate-600'}`}>{dir === 'idle' ? '0' : `${dir === 'in' ? '+' : '−'}${fmtGW(l.gw)}`}</span>
                </div>
                <div className="text-[9px] text-slate-500">{fmtNative(l)}{l.capacity ? ` of ${l.capacity.toLocaleString()} MW` : ''}</div>
            </div>
            <div className="relative h-3 bg-slate-800/60 rounded-sm">
                <div className="absolute inset-y-0 left-1/2 w-px bg-slate-500" />
                {dir !== 'idle' && <div className="absolute inset-y-0 rounded-sm" style={{ background: colour, opacity: dir === 'out' ? 0.55 : 0.95, width: `${w}%`, left: dir === 'in' ? '50%' : `${50 - w}%` }} />}
            </div>
        </div>
    );
};

const EnergyFlowsPanel: React.FC<{ flows: FlowsSummary, updated: Date | null }> = ({ flows, updated }) => {
    const [show, setShow] = useState<'all' | 'electricity' | 'gas'>('all');
    const list = flows.links.filter(l => show === 'all' || l.kind === show).sort((a, b) => Math.abs(b.gw) - Math.abs(a.gw));
    const max = Math.max(1, ...list.map(l => Math.abs(l.gw)));
    const supply: [string, number][] = (['Norway pipeline', 'UK & Norway (mixed)', 'LNG', 'Continental pipeline', 'UK North Sea', 'Storage'] as FlowGroup[]).map(g => {
        const v = g === 'Storage' ? flows.gasStorageGW : flows.links.filter(l => l.kind === 'gas' && l.group === g).reduce((a, l) => a + Math.max(0, l.gw), 0);
        return [g, v] as [string, number];
    }).filter(([, v]) => v > 0.05);
    const supplyTotal = supply.reduce((a, [, v]) => a + v, 0);

    return (
        <div className="text-xs text-slate-300 space-y-2 max-h-[65vh] overflow-y-auto custom-scrollbar pr-1">
            {/* Headline */}
            <div className="grid grid-cols-2 gap-2">
                <div className="rounded border border-cyan-900 bg-cyan-950/30 p-2">
                    <div className="text-[9px] uppercase font-bold tracking-wide" style={{ color: ELEC_COLOUR }}>Electricity</div>
                    {flows.links.some(l => l.kind === 'electricity') ? <>
                        <div className="text-white font-bold text-base leading-tight">+{fmtGW(flows.elecImportGW)} <span className="text-[10px] text-slate-400 font-normal">in</span></div>
                        <div className="text-[10px] text-slate-400">−{fmtGW(flows.elecExportGW)} out · net {flows.elecImportGW - flows.elecExportGW >= 0 ? 'import' : 'export'} {fmtGW(flows.elecImportGW - flows.elecExportGW)}</div>
                    </> : <div className="text-[10px] text-slate-500 mt-1">Unavailable (Elexon not answering)</div>}
                </div>
                <div className="rounded border border-amber-900 bg-amber-950/30 p-2">
                    <div className="text-[9px] uppercase font-bold tracking-wide" style={{ color: GAS_COLOUR }}>Gas</div>
                    {flows.hasGasDetail ? <>
                        <div className="text-white font-bold text-base leading-tight">+{fmtGW(flows.gasImportGW)} <span className="text-[10px] text-slate-400 font-normal">imported</span></div>
                        <div className="text-[10px] text-slate-400">−{fmtGW(flows.gasExportGW)} out{flows.gasMixedGW > 0 ? ` · +${fmtGW(flows.gasMixedGW)} mixed UK/Norway` : ''}</div>
                    </> : <div className="text-[10px] text-slate-500 mt-1">{flows.gasSupplyMcmd !== null ? 'Route detail needs the updated Worker (see README)' : 'Unavailable'}</div>}
                </div>
            </div>

            {/* Gas supply make-up */}
            {flows.hasGasDetail && supplyTotal > 0 && (
                <div>
                    <div className="flex justify-between text-[10px] mb-0.5">
                        <span className="font-bold text-slate-300">Where GB gas is coming from now</span>
                        <span className="text-slate-500">{flows.gasSupplyMcmd !== null ? `${flows.gasSupplyMcmd.toFixed(0)} mcm/d ≈ ${fmtGW(flows.gasSupplyMcmd * GW_PER_MCMD)}` : ''}</span>
                    </div>
                    <div className="flex h-3 rounded-sm overflow-hidden">
                        {supply.map(([g, v]) => <div key={g} style={{ width: `${(v / supplyTotal) * 100}%`, background: GROUP_COLOUR[g] }} title={`${g}: ${fmtGW(v)} (${Math.round((v / supplyTotal) * 100)}%)`} />)}
                    </div>
                    <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1 text-[9px] text-slate-400">
                        {supply.map(([g, v]) => <span key={g}><span style={{ color: GROUP_COLOUR[g] }}>■</span> {g} {Math.round((v / supplyTotal) * 100)}%</span>)}
                    </div>
                    {flows.gasImportShare !== null && (
                        <div className="text-[10px] text-slate-400 mt-1">At least <b className="text-white">{Math.round(flows.gasImportShare * 100)}%</b> of supply is imported right now (Norway pipeline, LNG, continental pipelines). St Fergus mixes UK and Norwegian gas and isn't counted as imported.</div>
                    )}
                </div>
            )}

            {/* Every route */}
            <div>
                <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] font-bold text-slate-300">By route <span className="font-normal text-slate-500">← out · in →</span></span>
                    <div className="flex gap-0.5 text-[9px]">
                        {(['all', 'electricity', 'gas'] as const).map(k => (
                            <button key={k} onClick={() => setShow(k)} className={`px-1.5 py-0.5 rounded ${show === k ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'}`}>{k === 'all' ? 'All' : k === 'electricity' ? 'Power' : 'Gas'}</button>
                        ))}
                    </div>
                </div>
                <div className="space-y-1.5">
                    {list.length === 0 ? <div className="text-[10px] text-slate-600">Waiting for data…</div> : list.map(l => <Bar key={l.id} l={l} max={max} />)}
                </div>
            </div>

            <div className="text-[9px] text-slate-500 leading-snug border-t border-slate-800 pt-1.5">
                Sources: Elexon FUELINST (interconnectors, 5-minute) and National Gas instantaneous flows by entry point (2-minute{flows.asAt.gas ? `, as at ${flows.asAt.gas}` : ''}). {GAS_CV_NOTE} Map routes are indicative, not exact cable or pipeline routes.
                {updated && <> Updated {updated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}.</>}
            </div>
        </div>
    );
};

export default EnergyFlowsPanel;
