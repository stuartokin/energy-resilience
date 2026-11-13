// Scenarios-mode window contents: Library (choose + basket), Results, Model (assumptions and sources).
import React, { useMemo, useState } from 'react';
import { RiskScenario, TimelineStep } from '../../types';
import { describeProfile, profileOf, peakOf, horizonHours, customersOffAt, methodNote } from '../../services/impactModel';
import { ASSUMPTIONS, REFERENCE_EVENTS } from '../../content/assumptions';
import { GAS_CV_NOTE } from '../../services/flows';
import { ImpactChart } from '../Charts';

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

// ---------- Library ----------
export const ScenarioLibraryPanel: React.FC<{ scenarios: RiskScenario[]; running: RiskScenario[]; onRun: (s: RiskScenario[]) => void; onManage: () => void }> = ({ scenarios, running, onRun, onManage }) => {
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
                                    <button type="button" onClick={() => setOpen(open === s.id ? null : s.id)} className="text-[11px] text-cyan-300 hover:underline mt-1" aria-expanded={open === s.id}>{open === s.id ? 'Hide details' : 'Why these numbers?'}</button>
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
}> = ({ active, timeline, step, onVideo, onReport, onExport, onStop, onLibrary }) => {
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
                <button type="button" onClick={onStop} className="py-2 rounded-lg border border-red-900 text-[11px] text-red-300 hover:text-white">Stop simulation</button>
            </div>
        </div>
    );
};

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
                            <span className="font-mono text-cyan-300">{a.value.toLocaleString()} {a.unit} <span className={`ml-1 text-[10px] px-1.5 rounded border ${a.kind === 'sourced' ? 'text-emerald-300 border-emerald-800' : 'text-amber-300 border-amber-800'}`}>{a.kind === 'sourced' ? 'Sourced' : 'Assumption'}</span></span>
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
