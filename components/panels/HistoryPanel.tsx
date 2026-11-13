// History window: charts from the data lake (services/history.ts). Settings are part of saved views.
import React, { useEffect, useMemo, useState } from 'react';
import { AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from 'recharts';
import { loadIndex, loadRange, DayRecord, HistoryIndex, cutRows, mixRows, importRows, dailySummary, windGrid, concentrationRows, DNO_NAMES, DNO_COLOURS, FUEL_COLOURS } from '../../services/history';
import { ASSUMPTIONS } from '../../content/assumptions';

export interface HistorySettings { range: number; charts: string[] }
export const DEFAULT_HISTORY: HistorySettings = { range: 7, charts: ['cuts', 'daily', 'mix', 'imports', 'wind', 'freq', 'gas', 'conc'] };

export const HISTORY_CHARTS: { id: string; label: string }[] = [
    { id: 'cuts', label: 'Power cuts' }, { id: 'daily', label: 'Worst day' }, { id: 'mix', label: 'Generation' },
    { id: 'imports', label: 'Imports' }, { id: 'wind', label: 'Wind heatmap' }, { id: 'freq', label: 'Frequency' },
    { id: 'gas', label: 'Gas' }, { id: 'conc', label: 'Concentration' },
];

const IMPORT_COLOURS: Record<string, string> = { France: '#3b82f6', Netherlands: '#f97316', Belgium: '#eab308', Norway: '#ef4444', Denmark: '#ec4899', Ireland: '#22c55e', 'Northern Ireland': '#14b8a6' };
const AX = { stroke: '#64748b', fontSize: 10 } as const;
const TT = { contentStyle: { background: '#0f172a', border: '1px solid #334155', fontSize: 11 }, labelStyle: { color: '#cbd5e1' } };

const Card: React.FC<{ title: string; note?: string; children: React.ReactNode }> = ({ title, note, children }) => (
    <section className="bg-slate-900 border border-slate-800 rounded-lg p-3">
        <h4 className="text-[12px] font-semibold text-slate-100">{title}</h4>
        <div className="mt-2">{children}</div>
        {note && <p className="text-[10px] text-slate-500 mt-1.5">{note}</p>}
    </section>
);

const tick = (ts: number) => { const d = new Date(ts); return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')} ${String(d.getUTCHours()).padStart(2, '0')}h`; };

export const HistoryPanel: React.FC<{ settings: HistorySettings; onChange: (s: HistorySettings) => void }> = ({ settings, onChange }) => {
    const [index, setIndex] = useState<HistoryIndex | null>(null);
    const [recs, setRecs] = useState<DayRecord[]>([]);
    const [loading, setLoading] = useState(false);
    useEffect(() => { loadIndex().then(setIndex); }, []);
    useEffect(() => {
        if (!index?.days.length) return;
        setLoading(true);
        loadRange(index.days.slice(-settings.range)).then(r => { setRecs(r); setLoading(false); });
    }, [index, settings.range]);
    const on = (id: string) => settings.charts.includes(id);
    const toggle = (id: string) => onChange({ ...settings, charts: on(id) ? settings.charts.filter(c => c !== id) : [...settings.charts, id] });

    const cuts = useMemo(() => cutRows(recs), [recs]);
    const mix = useMemo(() => mixRows(recs), [recs]);
    const imports = useMemo(() => importRows(recs), [recs]);
    const daily = useMemo(() => dailySummary(recs), [recs]);
    const wind = useMemo(() => windGrid(recs), [recs]);
    const conc = useMemo(() => concentrationRows(recs), [recs]);
    const gas = useMemo(() => recs.flatMap(r => r.t.map((t, i) => ({ ts: Date.parse(`${r.date}T${t}:00Z`), supply: r.gas.supply[i], linepack: r.gas.linepack[i] }))), [recs]);
    const countries = useMemo(() => [...new Set(imports.flatMap(r => Object.keys(r).filter(k => k !== 'ts' && k !== 'label')))], [imports]);
    const fuels = useMemo(() => Object.keys(FUEL_COLOURS).filter(f => mix.some(r => typeof r[f] === 'number')), [mix]);
    const windMax = Math.max(1, ...wind.flatMap(w => w.hours.map(h => h || 0)));

    if (index && !index.days.length) {
        return (
            <div className="text-xs text-slate-300 space-y-3">
                <p><b>History is not collecting yet.</b> {index.error || 'No days stored so far.'}</p>
                <p className="text-slate-400">Once switched on, the site's Cloudflare Worker takes a snapshot every 15 minutes: demand and frequency, generation by type and interconnector flows (Elexon), gas supply by entry point (National Gas), power cuts from the five open network feeds, and Met Office and Environment Agency warnings. Live power-cut feeds vanish once a cut is fixed, so this is the only place that history builds up.</p>
                <p className="text-slate-500">Set-up steps are at the top of worker/outages-worker.js (a free KV store and a 15-minute schedule).</p>
            </div>
        );
    }
    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                <div className="flex bg-slate-900 border border-slate-800 rounded-lg p-0.5" role="group" aria-label="Range">
                    {[1, 7, 30, 90].map(n => (
                        <button key={n} type="button" aria-pressed={settings.range === n} onClick={() => onChange({ ...settings, range: n })}
                            className={`px-2.5 py-1 rounded text-[11px] font-semibold ${settings.range === n ? 'bg-cyan-700 text-white' : 'text-slate-400 hover:text-white'}`}>{n === 1 ? 'Today' : `${n} days`}</button>
                    ))}
                </div>
                <span className="text-[10px] text-slate-500">{index ? `Collecting since ${index.since || index.days[0]} · ${index.days.length} day${index.days.length === 1 ? '' : 's'} stored` : 'Loading…'}{loading ? ' · loading' : ''}</span>
            </div>
            <div className="flex flex-wrap gap-1" role="group" aria-label="Charts shown">
                {HISTORY_CHARTS.map(c => (
                    <button key={c.id} type="button" aria-pressed={on(c.id)} onClick={() => toggle(c.id)}
                        className={`px-2 py-0.5 rounded-full text-[10px] border ${on(c.id) ? 'border-cyan-600 bg-cyan-950/50 text-cyan-100' : 'border-slate-700 text-slate-400'}`}>{c.label}</button>
                ))}
            </div>

            {on('cuts') && (
                <Card title="Customers off supply (unplanned), by network" note="Snapshot every 15 minutes from each operator's live feed. SP Energy Networks' feed doesn't give customer numbers. Electricity North West and Northern Ireland are not included (no open live feed).">
                    <div className="h-44"><ResponsiveContainer><AreaChart data={cuts}>
                        <CartesianGrid stroke="#1e293b" /><XAxis dataKey="ts" type="number" domain={['dataMin', 'dataMax']} scale="time" tickFormatter={tick} {...AX} minTickGap={40} /><YAxis {...AX} width={44} tickFormatter={v => v >= 1000 ? `${Math.round(v / 1000)}k` : v} />
                        <Tooltip {...TT} labelFormatter={v => tick(v as number)} />
                        {Object.keys(DNO_NAMES).map(k => <Area key={k} type="stepAfter" dataKey={k} name={DNO_NAMES[k]} stackId="1" stroke={DNO_COLOURS[k]} fill={DNO_COLOURS[k]} fillOpacity={0.5} isAnimationActive={false} />)}
                    </AreaChart></ResponsiveContainer></div>
                </Card>
            )}

            {on('daily') && (
                <Card title="Worst moment each day, and weather warnings" note="Red bars (left scale): the most customers off at any one snapshot that day. Amber and dark red bars (right scale): Met Office amber and red warnings in force that day.">
                    <div className="h-36"><ResponsiveContainer><BarChart data={daily}>
                        <CartesianGrid stroke="#1e293b" /><XAxis dataKey="label" {...AX} /><YAxis yAxisId="a" {...AX} width={44} tickFormatter={v => v >= 1000 ? `${Math.round(v / 1000)}k` : v} /><YAxis yAxisId="b" orientation="right" {...AX} width={24} allowDecimals={false} />
                        <Tooltip {...TT} />
                        <Bar yAxisId="a" dataKey="worstCustomers" name="Most customers off" fill="#ef4444" isAnimationActive={false} />
                        <Bar yAxisId="b" dataKey="amber" name="Amber warnings" fill="#f59e0b" isAnimationActive={false} />
                        <Bar yAxisId="b" dataKey="red" name="Red warnings" fill="#b91c1c" isAnimationActive={false} />
                    </BarChart></ResponsiveContainer></div>
                </Card>
            )}

            {on('mix') && (
                <Card title="Generation by type (GW, transmission-connected)" note="Elexon FUELINST. Embedded solar and small wind are not in this data, so solar is missing; imports shown when positive.">
                    <div className="h-44"><ResponsiveContainer><AreaChart data={mix}>
                        <CartesianGrid stroke="#1e293b" /><XAxis dataKey="ts" type="number" domain={['dataMin', 'dataMax']} scale="time" tickFormatter={tick} {...AX} minTickGap={40} /><YAxis {...AX} width={32} />
                        <Tooltip {...TT} labelFormatter={v => tick(v as number)} formatter={(v: any) => (typeof v === 'number' ? v.toFixed(1) : v)} />
                        {fuels.map(f => <Area key={f} type="monotone" dataKey={f} stackId="1" stroke={FUEL_COLOURS[f]} fill={FUEL_COLOURS[f]} fillOpacity={0.55} isAnimationActive={false} />)}
                    </AreaChart></ResponsiveContainer></div>
                </Card>
            )}

            {on('imports') && (
                <Card title="Electricity imports by country (GW; below zero = exports)" note="Elexon FUELINST interconnector flows (signed).">
                    <div className="h-40"><ResponsiveContainer><AreaChart data={imports} stackOffset="sign">
                        <CartesianGrid stroke="#1e293b" /><XAxis dataKey="ts" type="number" domain={['dataMin', 'dataMax']} scale="time" tickFormatter={tick} {...AX} minTickGap={40} /><YAxis {...AX} width={32} />
                        <Tooltip {...TT} labelFormatter={v => tick(v as number)} formatter={(v: any) => (typeof v === 'number' ? v.toFixed(2) : v)} />
                        <ReferenceLine y={0} stroke="#475569" />
                        {countries.map(c => <Area key={c} type="monotone" dataKey={c} stackId="1" stroke={IMPORT_COLOURS[c] || '#94a3b8'} fill={IMPORT_COLOURS[c] || '#94a3b8'} fillOpacity={0.5} isAnimationActive={false} />)}
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                    </AreaChart></ResponsiveContainer></div>
                </Card>
            )}

            {on('wind') && (
                <Card title="Wind output by hour of day (GW)" note="Each row is a day; darker = less wind. Long dark runs are the still spells when the system leans on gas and imports.">
                    <div className="overflow-x-auto">
                        <div className="grid gap-px text-[9px] text-slate-500" style={{ gridTemplateColumns: '44px repeat(24, minmax(10px, 1fr))' }}>
                            <span />{Array.from({ length: 24 }, (_, h) => <span key={h} className="text-center">{h % 6 === 0 ? h : ''}</span>)}
                            {wind.map(w => (
                                <React.Fragment key={w.date}>
                                    <span className="pr-1 text-right">{w.date.slice(5)}</span>
                                    {w.hours.map((v, h) => <span key={h} title={v === null ? 'no data' : `${w.date} ${h}:00 UTC · ${v.toFixed(1)} GW`} className="h-3.5 rounded-[2px]"
                                        style={{ background: v === null ? '#0f172a' : `rgba(16,185,129,${0.08 + 0.92 * (v / windMax)})` }} />)}
                                </React.Fragment>
                            ))}
                        </div>
                    </div>
                </Card>
            )}

            {on('freq') && (
                <Card title="Frequency: minutes outside 49.8–50.2 Hz each day" note="Elexon 15-second frequency, counted for the 15 minutes before each snapshot (so the whole day is covered). NESO aims to keep frequency between 49.8 and 50.2 Hz in normal operation.">
                    <div className="h-32"><ResponsiveContainer><BarChart data={daily}>
                        <CartesianGrid stroke="#1e293b" /><XAxis dataKey="label" {...AX} /><YAxis {...AX} width={32} allowDecimals={false} />
                        <Tooltip {...TT} formatter={(v: any, n: any, p: any) => (n === 'Minutes outside' ? [`${v} min (lowest ${p.payload.fMin ?? '–'} Hz, highest ${p.payload.fMax ?? '–'} Hz)`, n] : [v, n])} />
                        <Bar dataKey="minutesOutside" name="Minutes outside" fill="#a855f7" isAnimationActive={false} />
                    </BarChart></ResponsiveContainer></div>
                </Card>
            )}

            {on('gas') && (
                <Card title="Gas: total supply (mcm/d) and linepack (mcm)" note="National Gas live data. Linepack is the gas stored in the pipes themselves; a falling line during a cold spell is a stress sign.">
                    <div className="h-36"><ResponsiveContainer><LineChart data={gas}>
                        <CartesianGrid stroke="#1e293b" /><XAxis dataKey="ts" type="number" domain={['dataMin', 'dataMax']} scale="time" tickFormatter={tick} {...AX} minTickGap={40} />
                        <YAxis yAxisId="a" {...AX} width={36} domain={['auto', 'auto']} /><YAxis yAxisId="b" orientation="right" {...AX} width={36} domain={['auto', 'auto']} />
                        <Tooltip {...TT} labelFormatter={v => tick(v as number)} formatter={(v: any) => (typeof v === 'number' ? v.toFixed(1) : v)} />
                        <Line yAxisId="a" dataKey="supply" name="Supply" stroke="#f59e0b" dot={false} isAnimationActive={false} connectNulls />
                        <Line yAxisId="b" dataKey="linepack" name="Linepack" stroke="#38bdf8" dot={false} isAnimationActive={false} connectNulls />
                    </LineChart></ResponsiveContainer></div>
                </Card>
            )}

            {on('conc') && (
                <Card title="Concentration over time" note={`Orange: share of GB gas supply coming through the largest single route (%). Cyan: the largest single electricity import (MW), against the ${ASSUMPTIONS.largestInfeed.value.toLocaleString()} MW loss the system is secured for (dashed).`}>
                    <div className="h-36"><ResponsiveContainer><LineChart data={conc}>
                        <CartesianGrid stroke="#1e293b" /><XAxis dataKey="ts" type="number" domain={['dataMin', 'dataMax']} scale="time" tickFormatter={tick} {...AX} minTickGap={40} />
                        <YAxis yAxisId="a" {...AX} width={30} unit="%" /><YAxis yAxisId="b" orientation="right" {...AX} width={40} />
                        <Tooltip {...TT} labelFormatter={v => tick(v as number)} />
                        <ReferenceLine yAxisId="b" y={ASSUMPTIONS.largestInfeed.value} stroke="#22d3ee" strokeDasharray="4 3" />
                        <Line yAxisId="a" dataKey="gasTopShare" name="Largest gas route share (%)" stroke="#f59e0b" dot={false} isAnimationActive={false} connectNulls />
                        <Line yAxisId="b" dataKey="topImportMW" name="Largest single import (MW)" stroke="#22d3ee" dot={false} isAnimationActive={false} connectNulls />
                    </LineChart></ResponsiveContainer></div>
                </Card>
            )}
        </div>
    );
};

export default HistoryPanel;
