// Report builder: a printable report of the live system or of a scenario run.
// Pick sections, add a byline, optionally let AI write the summary (labelled), preview, then
// Print / Save as PDF from the browser. Figures always come from the app's data and model.
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { GenerationMix, OutageEvent, GeneratorOutage, RiskScenario, TimelineStep } from '../types';
import { GasSnapshot, SystemWarning, WeatherWarning } from '../services/liveSystems';
import { FlowsSummary, fmtGW, fmtNative, GAS_CV_NOTE } from '../services/flows';
import { describeProfile, profileOf, methodNote } from '../services/impactModel';
import { ASSUMPTIONS } from '../content/assumptions';
import { DATA_SOURCES } from '../content/sources';
import { fetchGridHistory, generateReportText } from '../services/geminiService';
import { APP_VERSION } from '../constants';
import { NesoNow } from './panels/LivePanels';

type Kind = 'live' | 'scenario';
interface Props {
    initialKind: Kind;
    onClose: () => void;
    onVideo: () => void;
    aiEnabled: boolean;
    onNeedAi: () => void;
    neso: NesoNow; mix: GenerationMix | null; flows: FlowsSummary; gas: GasSnapshot | null;
    outages: OutageEvent[]; generatorOutages: GeneratorOutage[]; warnings: SystemWarning[]; weather: WeatherWarning[];
    scenarios: RiskScenario[]; timeline: TimelineStep[]; step: number;
}

const SECTIONS: Record<Kind, { id: string; label: string; ai?: boolean; on: boolean }[]> = {
    live: [
        { id: 'summary', label: 'Executive summary', on: true },
        { id: 'conditions', label: 'System conditions (headline figures)', on: true },
        { id: 'demand', label: 'Demand over the last 24 hours (chart)', on: true },
        { id: 'mix', label: 'Generation mix', on: true },
        { id: 'flows', label: 'Energy flows in and out of GB', on: true },
        { id: 'outages', label: 'Power cuts and generator outages', on: true },
        { id: 'map', label: 'Map snapshot', on: true },
        { id: 'sources', label: 'Data sources', on: true },
    ],
    scenario: [
        { id: 'summary', label: 'Executive summary', on: true },
        { id: 'scenarios', label: 'Scenario descriptions and reasoning', on: true },
        { id: 'impact', label: 'Impact over time (chart and figures)', on: true },
        { id: 'map', label: 'Map snapshot', on: true },
        { id: 'conditions', label: 'System conditions at the time (live data)', on: true },
        { id: 'assumptions', label: 'Assumptions and sources', on: true },
        { id: 'mitigations', label: 'Mitigations', ai: true, on: false },
    ],
};

const BYLINE_KEY = 'energy_resilience_byline';
const readByline = () => { try { return localStorage.getItem(BYLINE_KEY) || ''; } catch { return ''; } };

// Simple line chart as SVG (prints crisply)
const LineChart: React.FC<{ points: { x: number; y: number }[]; colour: string; yLabel: (v: number) => string; xLabels: [string, string] }> = ({ points, colour, yLabel, xLabels }) => {
    if (points.length < 2) return <p className="text-xs text-gray-500">Not enough data to draw a chart.</p>;
    const W = 640, H = 180, P = 36;
    const xs = points.map(p => p.x), ys = points.map(p => p.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(0, ...ys), y1 = Math.max(...ys) || 1;
    const sx = (x: number) => P + ((x - x0) / (x1 - x0 || 1)) * (W - P - 8), sy = (y: number) => H - 22 - ((y - y0) / (y1 - y0 || 1)) * (H - 34);
    const d = points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(' ');
    return (
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Chart">
            <line x1={P} y1={H - 22} x2={W - 8} y2={H - 22} stroke="#94a3b8" />
            <line x1={P} y1={10} x2={P} y2={H - 22} stroke="#e2e8f0" />
            <text x={P - 4} y={14} fontSize="10" textAnchor="end" fill="#475569">{yLabel(y1)}</text>
            <text x={P - 4} y={H - 22} fontSize="10" textAnchor="end" fill="#475569">{yLabel(y0)}</text>
            <path d={`${d} L${sx(x1)} ${H - 22} L${sx(x0)} ${H - 22} Z`} fill={colour} opacity="0.12" />
            <path d={d} stroke={colour} strokeWidth="2" fill="none" />
            <text x={P} y={H - 6} fontSize="10" fill="#475569">{xLabels[0]}</text>
            <text x={W - 8} y={H - 6} fontSize="10" textAnchor="end" fill="#475569">{xLabels[1]}</text>
        </svg>
    );
};

const ReportBuilder: React.FC<Props> = (p) => {
    const canScenario = p.scenarios.length > 0;
    const [kind, setKind] = useState<Kind>(canScenario ? p.initialKind : 'live');
    const [picked, setPicked] = useState<Record<string, boolean>>(() => Object.fromEntries([...SECTIONS.live, ...SECTIONS.scenario].map(s => [`${s.id}`, s.on])));
    const [byline, setByline] = useState(readByline);
    const [useAi, setUseAi] = useState(p.aiEnabled);
    const [busy, setBusy] = useState('');
    const [built, setBuilt] = useState<null | { summary: string; summaryAi: boolean; mitigations: string; map: string | null; demand: { timestamp: number; value: number }[]; at: Date }>(null);

    const on = (id: string) => picked[id] && SECTIONS[kind].some(s => s.id === id);
    const now = p.timeline[Math.min(p.step, p.timeline.length - 1)];
    const last = p.timeline[p.timeline.length - 1];
    const peak = Math.max(0, ...p.timeline.map(t => t.consumersOffline));
    const genOut = p.generatorOutages.reduce((a, g) => a + g.unavailableMW, 0);

    // Facts used for the factual summary and given to the AI (it must not add numbers)
    const facts = (): string => {
        const live = [
            p.neso.demand > 0 ? `GB demand ${(p.neso.demand / 1000).toFixed(1)} GW${p.neso.estimated ? ' (last known)' : ''}` : '',
            p.neso.demand > 0 ? `System frequency ${p.neso.frequency.toFixed(2)} Hz` : 'Grid demand and frequency unavailable',
            p.mix ? `Generation mix: ${p.mix.generation.filter(g => g.perc > 0).map(g => `${g.fuel} ${g.perc}%`).join(', ')}` : '',
            p.flows.links.some(l => l.kind === 'electricity') ? `Electricity interconnectors: ${p.flows.elecImportGW.toFixed(1)} GW in, ${p.flows.elecExportGW.toFixed(1)} GW out` : '',
            p.gas?.totalSupply != null ? `Gas supply ${p.gas.totalSupply.toFixed(0)} mcm/d${p.flows.gasImportShare !== null ? `, at least ${Math.round(p.flows.gasImportShare * 100)}% imported` : ''}` : '',
            `${p.outages.length} live power cuts reported by connected network feeds (no open feed for North West England)`,
            `${p.generatorOutages.length} generator or interconnector outage notices, ${(genOut / 1000).toFixed(1)} GW unavailable`,
            p.warnings.length ? `NESO notices: ${p.warnings.slice(0, 3).map(w => w.type).join('; ')}` : 'No NESO margin or demand-control notices in the last 48 hours',
            p.weather.length ? `Met Office warnings: ${p.weather.slice(0, 5).map(w => `${w.level} ${w.type} (${w.region})`).join('; ')}` : 'No Met Office warnings',
        ].filter(Boolean);
        if (kind === 'live') return live.map(x => `- ${x}`).join('\n');
        return [
            `Scenarios run together: ${p.scenarios.map(s => `${s.name} (${s.category}): ${s.description} Model: ${describeProfile(profileOf(s))} Reasoning: ${s.rationale || 'not stated'}`).join(' | ')}`,
            `Peak customers off supply: ${peak.toLocaleString()}`,
            last ? `Over the whole event: energy not supplied ${(last.energyUnservedMWh || 0).toLocaleString()} MWh; cost at the Value of Lost Load £${last.costMillions.toFixed(1)}m` : '',
            `Method: ${methodNote}`,
            `Live system when the report was made: ${live.join('; ')}`,
        ].filter(Boolean).map(x => `- ${x}`).join('\n');
    };

    const factualSummary = (): string => kind === 'live'
        ? `At ${new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}, ${p.neso.demand > 0 ? `GB electricity demand was ${(p.neso.demand / 1000).toFixed(1)} GW and ` : ''}${p.neso.demand > 0 ? `system frequency was ${p.neso.frequency.toFixed(2)} Hz` : 'live demand and frequency data were unavailable'}. ${p.warnings.length ? `NESO had issued: ${p.warnings[0].type}.` : 'No NESO margin or demand-control notices were in force.'} ${p.outages.length} live power cuts were reported by the connected network feeds, and ${p.generatorOutages.length ? `${(genOut / 1000).toFixed(1)} GW of generation or interconnector capacity was unavailable (Elexon REMIT)` : 'no generator outage notices were loaded'}.`
        : `This report models ${p.scenarios.length > 1 ? 'a composite event of ' + p.scenarios.length + ' scenarios' : 'the scenario'} "${p.scenarios.map(s => s.name).join('" + "')}". At its peak about ${peak.toLocaleString()} customers would be off supply. Over the whole event the energy not supplied is about ${(last?.energyUnservedMWh || 0).toLocaleString()} MWh, which at the Value of Lost Load is £${(last?.costMillions || 0).toFixed(1)}m. These figures are modelled, not forecasts; the reasoning and sources for each are set out below.`;

    const build = async () => {
        try { localStorage.setItem(BYLINE_KEY, byline); } catch { /* ignore */ }
        if (useAi && !p.aiEnabled) { p.onNeedAi(); return; }
        let map: string | null = null;
        if (on('map')) {
            setBusy('Capturing the map…');
            try { const m = (window as any).__energyMap; m?.triggerRepaint?.(); await new Promise(r => setTimeout(r, 300)); map = m?.getCanvas?.().toDataURL('image/png') || null; } catch { map = null; }
        }
        let demand: { timestamp: number; value: number }[] = [];
        if (on('demand')) { setBusy('Loading demand history…'); try { demand = await fetchGridHistory('demand', '24h'); } catch { demand = []; } }
        let summary = factualSummary(), summaryAi = false, mitigations = '';
        if (useAi && p.aiEnabled) {
            if (on('summary')) { setBusy('AI is drafting the summary…'); const t = await generateReportText('summary', facts()); if (t) { summary = t; summaryAi = true; } }
            if (on('mitigations')) { setBusy('AI is drafting mitigations…'); mitigations = await generateReportText('mitigations', facts()); }
        }
        setBusy('');
        setBuilt({ summary, summaryAi, mitigations, map, demand, at: new Date() });
    };

    const title = kind === 'live'
        ? 'GB energy system: live snapshot'
        : (p.scenarios.length > 1 ? `Composite event: ${p.scenarios.map(s => s.name).join(' + ')}` : p.scenarios[0]?.name || 'Scenario report');

    // ---------- Print view ----------
    if (built) {
        const tl = p.timeline;
        return createPortal(
            <div className="report-print fixed inset-0 z-[700] bg-slate-200 overflow-auto">
                <div className="print:hidden sticky top-0 z-10 flex justify-center gap-3 p-3 bg-slate-900 text-white">
                    <button type="button" onClick={() => window.print()} className="px-5 py-2 rounded-lg bg-amber-500 text-slate-950 font-bold text-sm">Print / Save as PDF</button>
                    <button type="button" onClick={() => setBuilt(null)} className="px-4 py-2 rounded-lg border border-slate-600 text-sm">Back to options</button>
                    <button type="button" onClick={p.onClose} className="px-4 py-2 rounded-lg border border-slate-600 text-sm">Close</button>
                    <span className="text-xs text-slate-400 self-center hidden md:inline">Tip: choose "Save as PDF" as the printer.</span>
                </div>
                <article className="report-page mx-auto my-6 print:my-0 bg-white text-slate-900 max-w-[800px] p-10 print:p-0 shadow-xl print:shadow-none" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
                    <div className="text-[11px] tracking-widest text-slate-500 font-sans">ENERGY RESILIENCE · {kind === 'live' ? 'LIVE SYSTEM REPORT' : 'SCENARIO REPORT'} · {built.at.toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' })}</div>
                    <h1 className="text-3xl font-bold mt-2 leading-tight">{title}</h1>
                    {byline && <div className="text-sm text-slate-600 mt-1 font-sans">{byline}</div>}

                    {kind === 'scenario' && (
                        <div className="grid grid-cols-3 gap-3 mt-5 font-sans">
                            <div className="border border-slate-200 rounded p-3"><div className="text-[10px] text-slate-500 font-semibold">PEAK CUSTOMERS OFF</div><div className="text-xl font-bold">{peak.toLocaleString()}</div></div>
                            <div className="border border-slate-200 rounded p-3"><div className="text-[10px] text-slate-500 font-semibold">DURATION</div><div className="text-xl font-bold">{last?.label || '–'}</div></div>
                            <div className="border border-slate-200 rounded p-3"><div className="text-[10px] text-slate-500 font-semibold">COST (VoLL)</div><div className="text-xl font-bold">£{(last?.costMillions || 0).toFixed(1)}m</div></div>
                        </div>
                    )}

                    {on('summary') && <section className="mt-6">
                        <h2 className="text-lg font-bold">Executive summary {built.summaryAi && <span className="ml-2 align-middle text-[10px] font-sans font-semibold bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded">AI-drafted from the figures in this report</span>}</h2>
                        <p className="mt-2 text-[14px] leading-relaxed whitespace-pre-wrap">{built.summary}</p>
                    </section>}

                    {kind === 'scenario' && on('scenarios') && <section className="mt-6">
                        <h2 className="text-lg font-bold">Scenarios</h2>
                        {p.scenarios.map(s => (
                            <div key={s.id} className="mt-3 text-[13px]">
                                <h3 className="font-bold">{s.name} <span className="font-normal text-slate-500 font-sans text-xs">· {s.category} · {s.probability} likelihood</span></h3>
                                <p className="mt-1">{s.description} {s.narrative}</p>
                                <p className="mt-1 text-slate-700"><b>Model:</b> {describeProfile(profileOf(s))}</p>
                                <p className="mt-1 text-slate-700"><b>Why these numbers:</b> {s.rationale || 'Not stated.'}</p>
                            </div>
                        ))}
                    </section>}

                    {kind === 'scenario' && on('impact') && <section className="mt-6 break-inside-avoid">
                        <h2 className="text-lg font-bold">Customers off supply over time</h2>
                        <LineChart points={tl.map((t, i) => ({ x: t.hours ?? i, y: t.consumersOffline }))} colour="#dc2626" yLabel={v => v >= 1e6 ? `${(v / 1e6).toFixed(1)}m` : `${Math.round(v / 1000)}k`} xLabels={[tl[0]?.label || '', last?.label || '']} />
                        <table className="w-full text-[12px] font-sans mt-2 border-collapse"><tbody>
                            <tr className="border-b"><td className="py-1">Peak customers off supply</td><td className="text-right">{peak.toLocaleString()}</td></tr>
                            <tr className="border-b"><td className="py-1">Energy not supplied (whole event)</td><td className="text-right">{(last?.energyUnservedMWh || 0).toLocaleString()} MWh</td></tr>
                            <tr className="border-b"><td className="py-1">Cost at the Value of Lost Load</td><td className="text-right">£{(last?.costMillions || 0).toFixed(1)}m</td></tr>
                            {now && <tr><td className="py-1">Position when the report was made</td><td className="text-right">{now.label}: {now.consumersOffline.toLocaleString()} off</td></tr>}
                        </tbody></table>
                    </section>}

                    {on('map') && <section className="mt-6 break-inside-avoid">
                        <h2 className="text-lg font-bold">Map snapshot</h2>
                        {built.map ? <><img src={built.map} alt="Map of the energy system at the time of the report" className="mt-2 w-full rounded border border-slate-200" /><p className="text-[10px] text-slate-500 mt-1 font-sans">Map layers only; on-screen labels and markers (power cuts, flow labels) are not included.</p></> : <p className="text-xs text-slate-500 mt-1 font-sans">The map could not be captured in this browser.</p>}
                    </section>}

                    {on('conditions') && <section className="mt-6 break-inside-avoid">
                        <h2 className="text-lg font-bold">{kind === 'live' ? 'System conditions' : 'Live system conditions when the report was made'}</h2>
                        <table className="w-full text-[12px] font-sans mt-2 border-collapse"><tbody>
                            <tr className="border-b"><td className="py-1">Demand</td><td className="text-right">{p.neso.demand > 0 ? `${(p.neso.demand / 1000).toFixed(1)} GW${p.neso.estimated ? ' (last known)' : ''}` : 'unavailable'}</td></tr>
                            <tr className="border-b"><td className="py-1">Frequency</td><td className="text-right">{p.neso.demand > 0 ? `${p.neso.frequency.toFixed(2)} Hz` : 'unavailable'}</td></tr>
                            <tr className="border-b"><td className="py-1">Electricity interconnectors</td><td className="text-right">{fmtGW(p.flows.elecImportGW)} in · {fmtGW(p.flows.elecExportGW)} out</td></tr>
                            <tr className="border-b"><td className="py-1">Gas supply</td><td className="text-right">{p.gas?.totalSupply != null ? `${p.gas.totalSupply.toFixed(0)} mcm/d` : 'unavailable'}</td></tr>
                            <tr className="border-b"><td className="py-1">Live power cuts (connected feeds)</td><td className="text-right">{p.outages.length}</td></tr>
                            <tr className="border-b"><td className="py-1">Generation unavailable (REMIT)</td><td className="text-right">{(genOut / 1000).toFixed(1)} GW</td></tr>
                            <tr><td className="py-1">NESO notices</td><td className="text-right">{p.warnings.length ? p.warnings[0].type : 'none in 48 h'}</td></tr>
                        </tbody></table>
                    </section>}

                    {kind === 'live' && on('demand') && <section className="mt-6 break-inside-avoid">
                        <h2 className="text-lg font-bold">Demand over the last 24 hours</h2>
                        <LineChart points={built.demand.map(d => ({ x: d.timestamp, y: d.value / 1000 }))} colour="#ca8a04" yLabel={v => `${v.toFixed(0)} GW`} xLabels={built.demand.length ? [new Date(built.demand[0].timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }), new Date(built.demand[built.demand.length - 1].timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })] : ['', '']} />
                    </section>}

                    {kind === 'live' && on('mix') && p.mix && <section className="mt-6 break-inside-avoid">
                        <h2 className="text-lg font-bold">Generation mix</h2>
                        <table className="w-full text-[12px] font-sans mt-2"><tbody>
                            {[...p.mix.generation].filter(g => g.perc > 0).sort((a, b) => b.perc - a.perc).map(g => <tr key={g.fuel} className="border-b"><td className="py-1 capitalize">{g.fuel}</td><td className="text-right">{g.perc}%</td></tr>)}
                        </tbody></table>
                    </section>}

                    {kind === 'live' && on('flows') && <section className="mt-6 break-inside-avoid">
                        <h2 className="text-lg font-bold">Energy flows in and out of GB</h2>
                        <table className="w-full text-[12px] font-sans mt-2"><tbody>
                            {[...p.flows.links].sort((a, b) => Math.abs(b.gw) - Math.abs(a.gw)).map(l => <tr key={l.id} className="border-b"><td className="py-1">{l.name} <span className="text-slate-500">({l.kind}, {l.from.split(' (')[0]})</span></td><td className="text-right">{l.value > 0 ? 'in' : l.value < 0 ? 'out' : '–'} {fmtNative(l)} · {fmtGW(l.gw)}</td></tr>)}
                        </tbody></table>
                        <p className="text-[11px] text-slate-500 mt-1 font-sans">{GAS_CV_NOTE}</p>
                    </section>}

                    {kind === 'live' && on('outages') && <section className="mt-6 break-inside-avoid">
                        <h2 className="text-lg font-bold">Power cuts and generator outages</h2>
                        <p className="text-[13px] mt-1">{p.outages.length} live power cuts reported by the connected network feeds (no open live feed exists for North West England). {p.generatorOutages.length} outage notices, {(genOut / 1000).toFixed(1)} GW unavailable.</p>
                        <table className="w-full text-[12px] font-sans mt-2"><tbody>
                            {[...p.generatorOutages].sort((a, b) => b.unavailableMW - a.unavailableMW).slice(0, 10).map(g => <tr key={g.id} className="border-b"><td className="py-1">{g.siteName || g.unit} <span className="text-slate-500">{g.fuelType} · {g.planned ? 'planned' : 'unplanned'}</span></td><td className="text-right">{Math.round(g.unavailableMW)} MW</td></tr>)}
                        </tbody></table>
                    </section>}

                    {kind === 'scenario' && on('mitigations') && built.mitigations && <section className="mt-6">
                        <h2 className="text-lg font-bold">Mitigations <span className="ml-2 align-middle text-[10px] font-sans font-semibold bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded">AI-drafted, not reviewed</span></h2>
                        <p className="mt-2 text-[13px] leading-relaxed whitespace-pre-wrap">{built.mitigations}</p>
                    </section>}

                    {kind === 'scenario' && on('assumptions') && <section className="mt-6">
                        <h2 className="text-lg font-bold">Assumptions and sources</h2>
                        <p className="text-[12px] mt-1">{methodNote}</p>
                        <table className="w-full text-[11px] font-sans mt-2"><tbody>
                            {Object.values(ASSUMPTIONS).map(a => <tr key={a.id} className="border-b align-top"><td className="py-1 pr-2">{a.label} <span className="text-slate-500">({a.kind === 'sourced' ? 'sourced' : 'assumption'})</span></td><td className="py-1 text-right whitespace-nowrap">{a.value.toLocaleString()} {a.unit}</td><td className="py-1 pl-2 text-slate-600">{a.source?.title || a.basis.slice(0, 90)}</td></tr>)}
                        </tbody></table>
                        <h3 className="font-bold text-[13px] mt-3">Scenario sources</h3>
                        <ul className="list-disc pl-5 text-[11px] font-sans">{Array.from(new Set(p.scenarios.flatMap(s => s.sources || []))).map(s => <li key={s}>{s}</li>)}</ul>
                    </section>}

                    {(on('sources') || kind === 'scenario') && <section className="mt-6">
                        <h2 className="text-lg font-bold">Data sources</h2>
                        <ul className="list-disc pl-5 text-[11px] font-sans">{DATA_SOURCES.filter(s => !/Gemini/i.test(s.name)).map(s => <li key={s.name}>{s.name} ({s.licence})</li>)}</ul>
                    </section>}

                    <footer className="mt-8 pt-3 border-t border-slate-200 text-[10px] text-slate-500 font-sans">
                        Made with Energy Resilience v{APP_VERSION} from public open data. Scenario figures are modelled, not forecasts. {built.summaryAi || built.mitigations ? 'Sections marked AI-drafted were written by Google Gemini from the figures shown and have not been checked.' : ''}
                    </footer>
                </article>
            </div>,
            document.body
        );
    }

    // ---------- Options ----------
    return (
        <div className="fixed inset-0 z-[600] bg-black/75 backdrop-blur-sm flex items-center justify-center p-0 sm:p-6" onClick={p.onClose}>
            <section role="dialog" aria-label="Create report" onClick={e => e.stopPropagation()} className="w-full max-w-xl max-h-full sm:max-h-[90vh] bg-slate-950 border border-slate-700 sm:rounded-xl shadow-2xl flex flex-col overflow-hidden">
                <div className="h-12 shrink-0 flex items-center gap-2 px-4 border-b border-slate-800 bg-slate-900">
                    <span className="w-2 h-2 rounded-sm bg-amber-500" aria-hidden="true" />
                    <h2 className="text-sm font-bold flex-1">Create report</h2>
                    <button type="button" onClick={p.onClose} aria-label="Close" className="w-9 h-9 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 text-lg">×</button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
                    <fieldset className="space-y-2">
                        <legend className="text-[11px] font-bold text-slate-400 tracking-wider mb-1">REPORT ON</legend>
                        <label className={`flex gap-2.5 items-center rounded-lg border p-2.5 cursor-pointer ${kind === 'live' ? 'border-cyan-600 bg-cyan-950/30' : 'border-slate-800'}`}><input type="radio" name="kind" checked={kind === 'live'} onChange={() => setKind('live')} /> The live system now</label>
                        <label className={`flex gap-2.5 items-center rounded-lg border p-2.5 ${canScenario ? 'cursor-pointer' : 'opacity-50'} ${kind === 'scenario' ? 'border-amber-600 bg-amber-950/30' : 'border-slate-800'}`}><input type="radio" name="kind" disabled={!canScenario} checked={kind === 'scenario'} onChange={() => setKind('scenario')} /> {canScenario ? `The scenario run: ${p.scenarios.map(s => s.name).join(' + ')}` : 'A scenario run (run one first)'}</label>
                    </fieldset>
                    <fieldset className="space-y-1.5">
                        <legend className="text-[11px] font-bold text-slate-400 tracking-wider mb-1">SECTIONS</legend>
                        {SECTIONS[kind].map(s => (
                            <label key={s.id} className="flex gap-2.5 items-center text-[13px]"><input type="checkbox" checked={!!picked[s.id]} onChange={e => setPicked(prev => ({ ...prev, [s.id]: e.target.checked }))} /> {s.label}{s.ai && <span className="text-[10px] text-amber-300 border border-amber-800 rounded px-1">AI, labelled</span>}</label>
                        ))}
                    </fieldset>
                    <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-400 tracking-wider">BYLINE (OPTIONAL, REMEMBERED IN THIS BROWSER)
                        <input value={byline} onChange={e => setByline(e.target.value)} placeholder="Your name and role" className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm font-normal tracking-normal text-white" />
                    </label>
                    <label className="flex gap-2.5 items-start text-[12px] text-slate-300 bg-slate-900 rounded-lg p-3">
                        <input type="checkbox" checked={useAi} onChange={e => setUseAi(e.target.checked)} className="mt-0.5" />
                        <span>Use AI to write the summary{kind === 'scenario' ? ' and mitigations' : ''}. Figures always come from the data and the model; AI text is marked in the report.{!p.aiEnabled && <span className="text-amber-300"> Needs your Gemini key.</span>} Without AI, a short factual summary is written from the figures.</span>
                    </label>
                </div>
                <div className="shrink-0 p-3 border-t border-slate-800 flex gap-2 items-center">
                    {busy && <span className="text-[11px] text-cyan-300 flex-1">{busy}</span>}
                    {!busy && <span className="flex-1" />}
                    {kind === 'scenario' && <button type="button" onClick={p.onVideo} className="px-3 py-2.5 rounded-lg border border-slate-700 text-xs font-semibold hover:border-slate-500">Video briefing</button>}
                    <button type="button" disabled={!!busy} onClick={build} className="px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-bold">Preview and print</button>
                </div>
            </section>
        </div>
    );
};

export default ReportBuilder;
