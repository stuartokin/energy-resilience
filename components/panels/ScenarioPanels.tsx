// Scenarios-mode window contents: Library (choose + basket), Results, Model (assumptions and sources).
import React, { useMemo, useState } from 'react';
import { RiskScenario, TimelineStep } from '../../types';
import { describeProfile, profileOf, peakOf, horizonHours, customersOffAt, methodNote } from '../../services/impactModel';
import { ASSUMPTIONS, REFERENCE_EVENTS } from '../../content/assumptions';
import { GAS_CV_NOTE } from '../../services/flows';
import { ImpactChart } from '../Charts';
import { footprintOf, CutRoute, FOOTPRINT_NOTE, SCENARIO_COLOURS } from '../../services/footprint';
import { fmtGW } from '../../services/flows';

const CATS = ['Storm', 'Cyber', 'Asset Failure', 'Supply Chain', 'Geopolitical', 'Growth'];
const BASIS: Record<string, [string, string]> = {
    sourced: ['Sourced', 'text-emerald-300 border-emerald-800'],
    scaled: ['Scaled from a real event', 'text-cyan-300 border-cyan-800'],
    assumption: ['Illustrative', 'text-amber-300 border-amber-800'],
};
const srcParts = (s: string) => { const i = s.lastIndexOf(' — '), j = s.lastIndexOf(' - http'); const k = i >= 0 ? i : j; return k >= 0 ? { title: s.slice(0, k), url: s.slice(k + 3).trim() } : { title: s, url: /^https?:/.test(s) ? s : '' }; };
const fmtN = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}m` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n));

export const WhyNumbers: React.FC<{ s: RiskScenario }> = ({ s }) => (
    <div className="space-y-1 text-[11px] text-slate-400">
        <div><span className="text-slate-500">Model:</span> {describeProfile(profileOf(s))}</div>
        {s.supplyLost && <div><span className="text-slate-500">Supply lost:</span> {s.supplyLost.label}</div>}
        <div><span className="text-slate-500">Reasoning:</span> {s.rationale || 'Not stated. This scenario has no sourced model, so a simple default shape is used.'}</div>
        {!!s.sources?.length && <ul className="list-disc pl-4">{s.sources.map((src, i) => { const p = srcParts(src); return <li key={i}>{p.url ? <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">{p.title}</a> : p.title}</li>; })}</ul>}
    </div>
);

// Local scenarios can be placed on the map by the user
const isLocal = (s: RiskScenario) => { const a = footprintOf(s).areas; return a === 'placeable' || (typeof a === 'object' && 'point' in a); };

// ---------- Library ----------
export const ScenarioLibraryPanel: React.FC<{ scenarios: RiskScenario[]; running: RiskScenario[]; onRun: (s: RiskScenario[]) => void; onManage: () => void; onPlace?: (s: RiskScenario) => void; onClear?: () => void }> = ({ scenarios, running, onRun, onManage, onPlace, onClear }) => {
    const [cat, setCat] = useState('All');
    const [q, setQ] = useState('');
    const [picked, setPicked] = useState<Set<string>>(new Set(running.map(s => s.id)));
    const [open, setOpen] = useState<string | null>(null);
    const list = scenarios.filter(s => (cat === 'All' || s.category === cat) && (!q || `${s.name} ${s.description}`.toLowerCase().includes(q.toLowerCase())));
    const basket = scenarios.filter(s => picked.has(s.id));
    const peak = basket.reduce((a, s) => a + (s.category === 'Growth' ? 0 : peakOf(profileOf(s))), 0);
    const days = basket.length ? Math.max(...basket.map(s => horizonHours(profileOf(s)))) / 24 : 0;
    const toggle = (id: string) => setPicked(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    return (
        <div className="flex flex-col gap-2.5">
            <label className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-lg px-2.5 h-9">
                <span className="sr-only">Search scenarios</span>
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search scenarios" className="flex-1 bg-transparent text-xs text-white outline-none" />
            </label>
            <div className="flex flex-wrap gap-1" role="group" aria-label="Category">
                {['All', ...CATS].map(c => (
                    <button key={c} type="button" onClick={() => setCat(c)} aria-pressed={cat === c}
                        className={`px-2.5 py-1 rounded-full text-[11px] border ${cat === c ? 'border-red-500 bg-red-950/50 text-red-100' : 'border-slate-700 text-slate-300 hover:border-slate-500'}`}>
                        {c === 'All' ? `All ${scenarios.length}` : c}
                    </button>
                ))}
            </div>
            <div className="flex flex-col gap-1.5">
                {list.map(s => {
                    const on = picked.has(s.id);
                    const b = s.customersBasis && BASIS[s.customersBasis];
                    return (
                        <div key={s.id} className={`rounded-lg border p-2.5 ${on ? 'border-red-500 bg-red-950/25' : 'border-slate-800 bg-slate-900'}`}>
                            <div className="flex gap-2.5">
                                <input type="checkbox" checked={on} onChange={() => toggle(s.id)} aria-label={`Add ${s.name} to the basket`} className="mt-0.5 w-4 h-4 accent-red-500 shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <div className="text-[13px] font-semibold text-slate-100 leading-snug">{s.name}</div>
                                    <div className="text-[11px] text-slate-400 mt-0.5 flex flex-wrap gap-x-2">
                                        <span>{s.category}</span>
                                        <span>{s.category === 'Growth' ? `${fmtN(s.peakConsumersAffected)} MW` : `${fmtN(peakOf(profileOf(s)))} customers`}</span>
                                        <span>{s.durationDays}d</span>
                                        <span>{s.probability} likelihood</span>
                                        {b ? <span className={`px-1 rounded border text-[10px] ${b[1]}`}>{b[0]}</span> : <span className="px-1 rounded border border-slate-700 text-[10px]">{/^AI draft/.test(s.rationale || '') ? 'AI draft' : 'No model'}</span>}
                                    </div>
                                    <div className="flex flex-wrap gap-x-3 mt-1">
                                        <button type="button" onClick={() => setOpen(open === s.id ? null : s.id)} className="text-[11px] text-cyan-300 hover:underline" aria-expanded={open === s.id}>{open === s.id ? 'Hide details' : 'Why these numbers?'}</button>
                                        {onPlace && isLocal(s) && <button type="button" onClick={() => onPlace(s)} className="text-[11px] text-amber-300 hover:underline" title="Choose on the map where this happens, then run it">Place it on the map</button>}
                                    </div>
                                    {open === s.id && <div className="mt-1.5"><p className="text-[11px] text-slate-300 mb-1">{s.description}</p><WhyNumbers s={s} /></div>}
                                </div>
                            </div>
                        </div>
                    );
                })}
                {list.length === 0 && <div className="text-xs text-slate-500 py-4 text-center">No scenarios match.</div>}
            </div>
            <div className="sticky bottom-0 -mx-3 -mb-3 px-3 py-2.5 bg-slate-950/95 border-t border-slate-800 flex items-center gap-2">
                <div className="flex-1 text-[11px] text-slate-300"><b>Basket: {basket.length}</b>{basket.length > 0 && <div className="text-slate-400">Combined peak {fmtN(peak)} customers · {Math.ceil(days)} days</div>}</div>
                {(basket.length > 0 || running.length > 0) && <button type="button" onClick={() => { setPicked(new Set()); onClear?.(); }} className="px-2.5 py-2 rounded-lg border border-slate-700 text-[11px] text-slate-300 hover:text-white" title="Empty the basket and clear any running scenario and its timeline">Clear</button>}
                <button type="button" onClick={onManage} className="px-2.5 py-2 rounded-lg border border-slate-700 text-[11px] text-slate-300 hover:text-white" title="Edit, add, import, export or AI-generate scenarios">Manage</button>
                <button type="button" disabled={!basket.length} onClick={() => onRun(basket)} className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white text-xs font-bold">Run</button>
            </div>
        </div>
    );
};

// ---------- Results ----------
export const ResultsPanel: React.FC<{
    active: RiskScenario[]; timeline: TimelineStep[]; step: number;
    onVideo: () => void; onReport: () => void; onExport: () => void; onStop: () => void; onLibrary: () => void;
    cutRoutes?: CutRoute[]; footprint?: { units: number; source: 'gsp' | 'dno' | 'none' }; demandMW?: number; gasSupplyGW?: number;
}> = ({ active, timeline, step, onVideo, onReport, onExport, onStop, onLibrary, cutRoutes = [], footprint, demandMW = 0, gasSupplyGW = 0 }) => {
    const now = timeline[Math.min(step, timeline.length - 1)];
    const isGrowth = active.length === 1 && active[0].category === 'Growth';
    const peak = useMemo(() => Math.max(0, ...timeline.map(t => t.consumersOffline)), [timeline]);
    if (!active.length || !now) {
        return (
            <div className="text-xs text-slate-300 space-y-3">
                <p>No scenario is running. Choose one or more in the Library, then press <b>Run</b>.</p>
                <button type="button" onClick={onLibrary} className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-xs">Open the Library</button>
            </div>
        );
    }
    const hours = now.hours ?? 0;
    return (
        <div className="space-y-3">
            <div className="text-[11px] text-slate-400">{active.map(s => s.name).join(' + ')} · at <b className="text-white">{now.label || `Step ${step}`}</b></div>
            <div className="grid grid-cols-3 gap-2">
                <div className="bg-slate-900 border border-slate-800 rounded-lg p-2"><div className="text-[10px] text-slate-400 font-semibold">{isGrowth ? 'MW ADDED' : 'CUSTOMERS OFF'}</div><div className="font-mono text-base text-red-300">{now.consumersOffline.toLocaleString()}</div></div>
                <div className="bg-slate-900 border border-slate-800 rounded-lg p-2"><div className="text-[10px] text-slate-400 font-semibold">PEAK</div><div className="font-mono text-base">{fmtN(peak)}</div></div>
                <div className="bg-slate-900 border border-slate-800 rounded-lg p-2"><div className="text-[10px] text-slate-400 font-semibold">COST (VoLL)</div><div className="font-mono text-base text-amber-300">{isGrowth ? 'n/a' : `£${now.costMillions.toFixed(1)}m`}</div></div>
            </div>
            <div className="h-48"><ImpactChart data={timeline} currentDay={step} /></div>
            {!isGrowth && active.length > 1 && (
                <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
                    <div className="text-[11px] font-semibold mb-2">By scenario</div>
                    {active.map(s => {
                        const off = customersOffAt(profileOf(s), hours);
                        const pk = peakOf(profileOf(s)) || 1;
                        return (
                            <div key={s.id} className="mb-1.5">
                                <div className="flex justify-between text-[11px]"><span className="truncate pr-2">{s.name}</span><span className="text-slate-400 font-mono shrink-0">{Math.round(off).toLocaleString()} off</span></div>
                                <div className="h-1.5 bg-slate-800 rounded mt-1"><div className="h-1.5 rounded bg-red-500" style={{ width: `${Math.min(100, (off / pk) * 100)}%` }} /></div>
                            </div>
                        );
                    })}
                </div>
            )}
            {!isGrowth && (
                <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 text-[11px] space-y-1.5">
                    <div className="font-semibold text-slate-200">Normal vs scenario</div>
                    <Row k="Customers off supply" normal="0" sc={`${now.consumersOffline.toLocaleString()} (${((now.consumersOffline / ASSUMPTIONS.gbCustomers.value) * 100).toFixed(now.consumersOffline / ASSUMPTIONS.gbCustomers.value < 0.01 ? 2 : 1)}% of GB)`} />
                    {active.filter(s => s.supplyLost).map(s => (
                        <Row key={s.id} k="Single loss vs secured limit" normal={`up to ${ASSUMPTIONS.largestInfeed.value.toLocaleString()} MW covered`} sc={`${s.supplyLost!.mw.toLocaleString()} MW (${s.supplyLost!.mw > ASSUMPTIONS.largestInfeed.value ? 'beyond the limit' : 'within the limit'})`} />
                    ))}
                    {cutRoutes.map(r => (
                        <Row key={r.id} k={`${r.name} (${r.kind})`} normal={`${fmtGW(r.gw)} now (live)`} sc={`0: cut${r.kind === 'gas' && gasSupplyGW > 0 && r.gw > 0 ? ` (${Math.round((r.gw / gasSupplyGW) * 100)}% of current gas supply)` : r.kind === 'electricity' && demandMW > 0 && r.gw > 0 ? ` (${((r.gw * 1000 / demandMW) * 100).toFixed(1)}% of demand now)` : ''}`} />
                    ))}
                    {cutRoutes.length > 0 && <div className="text-slate-500">Routes are chosen from live flows when the run starts ({cutRoutes.map(r => r.why).join('; ')}).</div>}
                </div>
            )}
            {!isGrowth && (
                <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 text-[11px] space-y-1.5">
                    <div className="font-semibold text-slate-200">Map key</div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-slate-300">
                        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.5)' }} />Area in footprint</span>
                        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: 'rgba(239,68,68,0.5)', border: '1px solid #ef4444' }} />Red haze: going dark or coming back</span>
                        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: '#020409', border: '1px solid #ef4444' }} />Lights out</span>
                        {cutRoutes.length > 0 && <span className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-red-500" />Route cut</span>}
                    </div>
                    {active.length > 1 && <div className="flex flex-wrap gap-x-3 gap-y-1">{active.map((s, i) => <span key={s.id} className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: SCENARIO_COLOURS[i % SCENARIO_COLOURS.length] }} />{s.name}</span>)}</div>}
                    <p className="text-slate-500">{FOOTPRINT_NOTE}{footprint ? ` Now showing ${footprint.units} ${footprint.source === 'gsp' ? 'Grid Supply Point' : 'network-operator'} areas.` : ''}</p>
                </div>
            )}
            {active.some(s => s.supplyLost) && <div className="text-[11px] text-slate-400">{active.filter(s => s.supplyLost).map(s => <div key={s.id}><b className="text-slate-300">Supply lost ({s.name}):</b> {s.supplyLost!.label}</div>)}</div>}
            <details className="bg-slate-900 border border-slate-800 rounded-lg p-3 text-[11px] text-slate-400">
                <summary className="cursor-pointer font-semibold text-slate-200">How these figures are worked out</summary>
                <p className="mt-2">{methodNote}</p>
                {active.map(s => <div key={s.id} className="mt-2"><b className="text-slate-300">{s.name}</b><WhyNumbers s={s} /></div>)}
                <p className="mt-2 text-slate-500">Energy not supplied so far: {(now.energyUnservedMWh || 0).toLocaleString()} MWh.</p>
            </details>
            <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={onVideo} className="py-2.5 rounded-lg border border-slate-700 bg-slate-900 hover:border-slate-500 text-xs font-semibold">Video briefing</button>
                <button type="button" onClick={onReport} className="py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold">Create report</button>
                <button type="button" onClick={onExport} className="py-2 rounded-lg border border-slate-800 text-[11px] text-slate-300 hover:text-white">Export data (JSON)</button>
                <button type="button" onClick={onStop} className="py-2 rounded-lg border border-red-900 text-[11px] text-red-300 hover:text-white">Clear scenario and timeline</button>
            </div>
        </div>
    );
};

const Row: React.FC<{ k: string; normal: string; sc: string }> = ({ k, normal, sc }) => (
    <div className="grid grid-cols-[1fr_auto_auto] gap-x-2 items-baseline">
        <span className="text-slate-400">{k}</span><span className="text-slate-500 text-right">{normal}</span><span className="text-red-300 font-mono text-right">→ {sc}</span>
    </div>
);

// ---------- Model: every value and reference event ----------
export const ScenarioModelPanel: React.FC = () => (
    <div className="space-y-4 text-sm">
        <div>
            <p className="text-slate-300 text-[12px] mb-2">Scenario figures come from a simple, transparent model in the app, not from AI and not from random numbers. Each scenario says how its numbers were reached: <b className="text-emerald-300">Sourced</b> = taken from a real event, <b className="text-cyan-300">Scaled</b> = scaled from a real event, <b className="text-amber-300">Illustrative</b> = a labelled assumption.</p>
            <p className="text-slate-400 text-[11px]">{methodNote}</p>
            <p className="text-slate-400 text-[11px] mt-2">Energy flows: {GAS_CV_NOTE}</p>
        </div>
        <div>
            <h4 className="font-bold text-slate-200 text-xs mb-2">Values used</h4>
            <div className="space-y-2">
                {Object.values(ASSUMPTIONS).map(a => (
                    <div key={a.id} className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                        <div className="flex justify-between gap-3 flex-wrap text-[12px]">
                            <span className="font-semibold text-white">{a.label}</span>
                            <span className="font-mono text-cyan-300">{a.value ? `${a.value.toLocaleString()} ` : ''}{a.unit} <span className={`ml-1 text-[10px] px-1.5 rounded border ${a.kind === 'sourced' ? 'text-emerald-300 border-emerald-800' : 'text-amber-300 border-amber-800'}`}>{a.kind === 'sourced' ? 'Sourced' : 'Assumption'}</span></span>
                        </div>
                        <div className="text-slate-400 text-[11px] mt-1">{a.basis}</div>
                        {a.source && <a href={a.source.url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-cyan-400 hover:underline">{a.source.title}</a>}
                    </div>
                ))}
            </div>
        </div>
        <div>
            <h4 className="font-bold text-slate-200 text-xs mb-2">Real events used as reference points</h4>
            <div className="space-y-2">
                {REFERENCE_EVENTS.map(e => (
                    <div key={e.name} className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                        <div className="font-semibold text-white text-[12px]">{e.name} <span className="text-slate-500 font-normal">· {e.date}</span></div>
                        <div className="text-slate-400 text-[11px]">{e.summary}</div>
                        <a href={e.source.url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-cyan-400 hover:underline">{e.source.title}</a>
                    </div>
                ))}
            </div>
        </div>
    </div>
);
