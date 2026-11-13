// "How it's built": an interactive guide to the app's architecture, data journeys, scenario engine and
// map layers. Driven by content/architecture.ts so it stays in step with the code.
import React, { useMemo, useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/solid';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { COLUMNS, NODES, LAYER_STACK, JOURNEYS, PRINCIPLES, ArchNode } from '../content/architecture';
import { statusOf } from '../services/health';
import { customersOffAt } from '../services/impactModel';
import { ASSUMPTIONS } from '../content/assumptions';
import { CHANGELOG } from '../content/changelog';
import { APP_VERSION } from '../constants';
import { ImpactProfile } from '../types';

const TABS = [
    { id: 'arch', label: 'Architecture' }, { id: 'journey', label: 'Follow a number' }, { id: 'engine', label: 'Scenario engine' },
    { id: 'layers', label: 'Map layers' }, { id: 'lake', label: 'History store' }, { id: 'rules', label: 'Principles' }, { id: 'releases', label: 'Releases' },
] as const;
type Tab = typeof TABS[number]['id'];

const dot = (ids?: string[]) => {
    if (!ids?.length) return { colour: '#475569', text: 'No live check' };
    const st = ids.map(i => statusOf(i).status);
    if (st.every(s => s === 'Operational')) return { colour: '#22c55e', text: 'Working now' };
    if (st.some(s => s === 'Operational')) return { colour: '#f59e0b', text: 'Partly working' };
    if (st.every(s => /Not checked|Not needed/.test(s))) return { colour: '#64748b', text: 'Not checked yet' };
    return { colour: '#ef4444', text: 'Not working now' };
};

// ---------- Architecture diagram ----------
const Architecture: React.FC = () => {
    const [sel, setSel] = useState<ArchNode>(NODES.find(n => n.id === 'worker')!);
    const related = new Set([sel.id, ...(sel.to || []), ...NODES.filter(n => n.to?.includes(sel.id)).map(n => n.id)]);
    return (
        <div className="grid lg:grid-cols-[1fr_320px] gap-4">
            <div className="overflow-x-auto">
                <div className="grid grid-cols-5 gap-3 min-w-[760px]">
                    {COLUMNS.map(c => (
                        <div key={c.id} className="space-y-2">
                            <div><div className="text-[11px] font-bold uppercase tracking-wider text-cyan-300">{c.title}</div><div className="text-[10px] text-slate-500">{c.note}</div></div>
                            {NODES.filter(n => n.col === c.id).map(n => {
                                const d = dot(n.health);
                                const on = related.has(n.id);
                                return (
                                    <button key={n.id} type="button" onClick={() => setSel(n)} aria-pressed={sel.id === n.id}
                                        className={`w-full text-left rounded-lg border px-2.5 py-2 transition-all ${sel.id === n.id ? 'border-cyan-400 bg-cyan-950/50' : on ? 'border-cyan-800 bg-slate-900' : 'border-slate-800 bg-slate-900/60 opacity-60 hover:opacity-100'}`}>
                                        <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.colour }} title={d.text} /><span className="text-[12px] font-semibold text-slate-100">{n.label}</span></div>
                                        {on && sel.id !== n.id && <div className="text-[10px] text-cyan-400 mt-0.5">{sel.to?.includes(n.id) ? '← fed by selection' : 'feeds selection →'}</div>}
                                    </button>
                                );
                            })}
                        </div>
                    ))}
                </div>
                <p className="text-[11px] text-slate-500 mt-3">Click a box to see what it does, which files hold it and what it connects to. Dots show whether that part answered in this session (from System Status).</p>
            </div>
            <aside className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2 h-fit">
                <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: dot(sel.health).colour }} /><h3 className="text-base font-bold text-white">{sel.label}</h3></div>
                <p className="text-[11px] text-slate-400">{dot(sel.health).text}</p>
                <p className="text-sm text-slate-300">{sel.detail}</p>
                {sel.refresh && <p className="text-[12px]"><span className="text-slate-500">Refresh:</span> {sel.refresh}</p>}
                {sel.licence && <p className="text-[12px]"><span className="text-slate-500">Licence:</span> {sel.licence}</p>}
                {!!sel.files?.length && <div><div className="text-[11px] text-slate-500">Files</div><ul className="font-mono text-[11px] text-cyan-200 space-y-0.5">{sel.files.map(f => <li key={f}>{f}</li>)}</ul></div>}
                {!!sel.to?.length && <p className="text-[12px]"><span className="text-slate-500">Feeds:</span> {sel.to.map(t => NODES.find(n => n.id === t)?.label).join(', ')}</p>}
            </aside>
        </div>
    );
};

// ---------- Follow a number ----------
const Journeys: React.FC = () => {
    const [j, setJ] = useState(0);
    const [step, setStep] = useState(0);
    const J = JOURNEYS[j];
    return (
        <div className="space-y-4">
            <div className="flex flex-wrap gap-2">{JOURNEYS.map((x, i) => <button key={i} type="button" aria-pressed={i === j} onClick={() => { setJ(i); setStep(0); }} className={`px-3 py-1.5 rounded-full text-xs border ${i === j ? 'border-cyan-500 bg-cyan-950/50 text-cyan-100' : 'border-slate-700 text-slate-300'}`}>{x.title}</button>)}</div>
            <ol className="flex flex-col md:flex-row gap-2">
                {J.steps.map((s, i) => (
                    <li key={i} className="flex-1">
                        <button type="button" onClick={() => setStep(i)} className={`w-full h-full text-left rounded-lg border p-3 transition-all ${i === step ? 'border-cyan-400 bg-cyan-950/40' : i < step ? 'border-slate-700 bg-slate-900' : 'border-slate-800 bg-slate-900/50 opacity-70'}`}>
                            <div className="text-[10px] font-bold text-cyan-300 uppercase">{i + 1}. {s.label}</div>
                            <div className="text-[12px] text-slate-200 mt-1">{s.text}</div>
                            {s.file && <div className="font-mono text-[10px] text-slate-500 mt-1">{s.file}</div>}
                        </button>
                    </li>
                ))}
            </ol>
            <div className="flex gap-2">
                <button type="button" disabled={step === 0} onClick={() => setStep(s => s - 1)} className="px-3 py-1.5 rounded-lg bg-slate-800 text-xs disabled:opacity-40">Back</button>
                <button type="button" disabled={step === J.steps.length - 1} onClick={() => setStep(s => s + 1)} className="px-3 py-1.5 rounded-lg bg-cyan-700 text-xs text-white disabled:opacity-40">Next step</button>
            </div>
        </div>
    );
};

// ---------- Scenario engine playground ----------
const Engine: React.FC = () => {
    const [type, setType] = useState<'instant' | 'storm'>('storm');
    const [peak, setPeak] = useState(1000000);
    const [a, setA] = useState(12);   // build hours (storm) or hours fully off (instant)
    const [b, setB] = useState(82);   // % restored in 24 h (storm) or restore hours (instant)
    const [voll, setVoll] = useState(ASSUMPTIONS.voll.value);
    const kw = ASSUMPTIONS.avgCustomerKw.value;
    const profile: ImpactProfile = type === 'storm'
        ? { type: 'storm', peak, buildHours: a, pctRestored24h: b, pctStillOff7d: 0.4 }
        : { type: 'instant', peak, offHours: a, restoreHours: b };
    const data = useMemo(() => {
        const rows: { h: number; off: number; cost: number; mwh: number }[] = [];
        let mwh = 0;
        for (let h = 0; h <= 168; h += 2) {
            const off = customersOffAt(profile, h);
            if (h > 0) mwh += (off * kw * 2) / 1000;
            rows.push({ h, off: Math.round(off), cost: Math.round((mwh * voll) / 1e5) / 10, mwh: Math.round(mwh) });
        }
        return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [type, peak, a, b, voll]);
    const last = data[data.length - 1];
    const S: React.FC<{ label: string; v: number; set: (n: number) => void; min: number; max: number; step: number; fmt?: (n: number) => string }> = ({ label, v, set, min, max, step, fmt }) => (
        <label className="block text-[12px] text-slate-300">{label}: <b className="text-white">{fmt ? fmt(v) : v}</b>
            <input type="range" min={min} max={max} step={step} value={v} onChange={e => set(Number(e.target.value))} className="w-full accent-cyan-500" /></label>
    );
    return (
        <div className="grid lg:grid-cols-[300px_1fr] gap-4">
            <div className="space-y-3 bg-slate-900 border border-slate-800 rounded-xl p-4">
                <p className="text-[12px] text-slate-400">This is the same arithmetic the app uses (services/impactModel.ts). Move the sliders to see how the curve and the cost change. No AI and no random numbers.</p>
                <div className="flex gap-1">{(['storm', 'instant'] as const).map(t => <button key={t} type="button" aria-pressed={type === t} onClick={() => { setType(t); if (t === 'storm') { setA(12); setB(82); } else { setA(6); setB(7); } }} className={`flex-1 py-1.5 rounded-lg text-xs ${type === t ? 'bg-cyan-700 text-white' : 'bg-slate-800 text-slate-300'}`}>{t === 'storm' ? 'Storm shape' : 'Sudden loss'}</button>)}</div>
                <S label="Peak customers off" v={peak} set={setPeak} min={10000} max={3000000} step={10000} fmt={n => n.toLocaleString()} />
                {type === 'storm' ? <>
                    <S label="Hours to build to the peak" v={a} set={setA} min={1} max={48} step={1} />
                    <S label="% restored within 24 h of the peak" v={b} set={setB} min={10} max={99} step={1} />
                </> : <>
                    <S label="Hours fully off" v={a} set={setA} min={0} max={72} step={1} />
                    <S label="Hours to restore everyone" v={b} set={setB} min={1} max={120} step={1} />
                </>}
                <S label="Value of Lost Load (£/MWh)" v={voll} set={setVoll} min={5000} max={40000} step={250} fmt={n => `£${n.toLocaleString()}`} />
                <p className="text-[11px] text-slate-500">App value: £{ASSUMPTIONS.voll.value.toLocaleString()}/MWh (DECC 2013). Average demand per customer {kw} kW (Ofgem typical domestic use).</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <div className="flex flex-wrap gap-4 text-sm"><span>Energy not supplied over a week: <b className="text-amber-300">{last.mwh.toLocaleString()} MWh</b></span><span>Cost (VoLL): <b className="text-amber-300">£{last.cost.toLocaleString()}m</b></span></div>
                <div className="h-64 mt-3"><ResponsiveContainer><AreaChart data={data}>
                    <CartesianGrid stroke="#1e293b" /><XAxis dataKey="h" stroke="#64748b" fontSize={10} tickFormatter={h => (h % 24 === 0 ? `Day ${h / 24}` : '')} interval={0} /><YAxis stroke="#64748b" fontSize={10} width={48} tickFormatter={v => v >= 1e6 ? `${(v / 1e6).toFixed(1)}m` : `${Math.round(v / 1000)}k`} />
                    <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', fontSize: 11 }} labelFormatter={h => `Hour ${h}`} formatter={(v: any, n: any) => [n === 'off' ? Number(v).toLocaleString() : `£${v}m`, n === 'off' ? 'Customers off' : 'Cost so far']} />
                    <Area dataKey="off" type="monotone" stroke="#ef4444" fill="#ef4444" fillOpacity={0.3} isAnimationActive={false} />
                </AreaChart></ResponsiveContainer></div>
                <p className="text-[11px] text-slate-500 mt-2">The cost is a floor: energy not supplied × Value of Lost Load. It leaves out wider economic and social costs.</p>
            </div>
        </div>
    );
};

const Layers: React.FC = () => (
    <div className="max-w-2xl mx-auto" style={{ perspective: '900px' }}>
        <p className="text-[12px] text-slate-400 mb-4 text-center">The map is a stack of layers. Top of the list = drawn on top.</p>
        <div className="flex flex-col-reverse gap-1.5">
            {LAYER_STACK.map((l, i) => (
                <div key={l.name} className="rounded-lg border border-slate-700 bg-gradient-to-r from-slate-900 to-slate-800 px-4 py-2 shadow-lg transition-transform hover:-translate-y-1"
                    style={{ transform: `rotateX(18deg) translateZ(${i * 2}px)`, marginLeft: `${i * 6}px`, marginRight: `${(LAYER_STACK.length - i) * 6}px` }}>
                    <div className="flex justify-between gap-3"><b className="text-[13px] text-white">{l.name}</b><span className="text-[10px] text-slate-500">{l.source}</span></div>
                    <div className="text-[11px] text-slate-400">{l.what}</div>
                </div>
            ))}
        </div>
    </div>
);

const Lake: React.FC = () => (
    <div className="grid md:grid-cols-2 gap-4 text-sm text-slate-300">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2">
            <h3 className="font-bold text-white">Why keep history?</h3>
            <p>Elexon, NESO and National Gas keep their own history, but live power-cut feeds and weather warnings disappear once an event is over. Nobody publishes a combined GB record of power cuts, so the app builds one.</p>
            <h3 className="font-bold text-white pt-2">How</h3>
            <ol className="list-decimal pl-5 space-y-1 text-[13px]">
                <li>Every 15 minutes a Cron Trigger wakes the Cloudflare Worker.</li>
                <li>It fetches demand, frequency, generation by fuel, interconnector flows, gas by entry point, power cuts from all five open feeds, and warnings.</li>
                <li>It adds one column to today's record in Workers KV (free tier: about 100 writes a day of 1,000 allowed).</li>
                <li>The History window reads whole days and draws the charts in your browser.</li>
            </ol>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2">
            <h3 className="font-bold text-white">One day's record</h3>
            <pre className="text-[11px] text-cyan-200 bg-slate-950 rounded-lg p-3 overflow-x-auto">{`{
  "date": "2026-11-14",
  "t": ["00:00", "00:15", …],
  "demand": [24100, 23800, …],      // MW
  "freq": { "min": […], "max": […], "out": […] },
  "fuel": { "WIND": […], "CCGT": […], "INTFR": […] },
  "gas":  { "supply": […], "linepack": […], "entry": {…} },
  "cuts": { "ukpn": { "c": […], "u": […], "p": […] }, … },
  "events": { "ukpn_123": { "c": 412, "f": "07:15", "l": "11:30" } },
  "warn": { "Amber warning of wind …": { "f": "06:00" } }
}`}</pre>
            <p className="text-[12px] text-slate-400">Only public, aggregate data. Power cuts are stored as location (rounded), customer count and times: no names or addresses.</p>
        </div>
    </div>
);

export const HowItsBuilt: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const [tab, setTab] = useState<Tab>('arch');
    return (
        <div className="fixed inset-0 z-[550] bg-slate-950 flex flex-col" role="dialog" aria-label="How it's built">
            <div className="flex items-center gap-3 px-4 sm:px-6 h-14 border-b border-slate-800 shrink-0">
                <h2 className="text-lg font-bold text-white">How it's built</h2>
                <span className="text-[11px] text-slate-500 hidden sm:inline">Version {APP_VERSION} · a live guide to the app's parts and data</span>
                <div className="flex-1" />
                <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-white"><XMarkIcon className="w-6 h-6" /></button>
            </div>
            <div className="flex gap-1 px-4 sm:px-6 py-2 border-b border-slate-800 overflow-x-auto shrink-0" role="tablist">
                {TABS.map(t => <button key={t.id} role="tab" type="button" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${tab === t.id ? 'bg-cyan-700 text-white' : 'text-slate-400 hover:text-white'}`}>{t.label}</button>)}
            </div>
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
                {tab === 'arch' && <Architecture />}
                {tab === 'journey' && <Journeys />}
                {tab === 'engine' && <Engine />}
                {tab === 'layers' && <Layers />}
                {tab === 'lake' && <Lake />}
                {tab === 'rules' && (
                    <div className="max-w-2xl space-y-2">{PRINCIPLES.map((p, i) => <div key={i} className="flex gap-3 bg-slate-900 border border-slate-800 rounded-lg p-3 text-sm text-slate-200"><span className="text-cyan-400 font-bold">{i + 1}</span>{p}</div>)}</div>
                )}
                {tab === 'releases' && (
                    <ol className="relative border-l border-slate-700 ml-2 max-w-3xl space-y-4">
                        {CHANGELOG.map(c => (
                            <li key={c.version} className="ml-4">
                                <div className="absolute -left-1.5 w-3 h-3 rounded-full bg-cyan-500 mt-1.5" />
                                <div className="text-[11px] text-slate-500">{c.date} · v{c.version}</div>
                                <div className="text-sm font-semibold text-white">{c.title}</div>
                                <details className="text-[12px] text-slate-400"><summary className="cursor-pointer text-cyan-300">What changed</summary><ul className="list-disc pl-5 mt-1 space-y-0.5">{c.changes.map((x, i) => <li key={i}>{x}</li>)}</ul></details>
                            </li>
                        ))}
                    </ol>
                )}
            </div>
        </div>
    );
};

export default HowItsBuilt;
