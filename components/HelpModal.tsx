
import React, { useState } from 'react';
import { XMarkIcon, SparklesIcon, BookOpenIcon, ServerStackIcon, CircleStackIcon, ChatBubbleBottomCenterTextIcon, CheckCircleIcon, ExclamationTriangleIcon, XCircleIcon, PlayIcon, ChatBubbleLeftRightIcon, ClipboardDocumentListIcon } from '@heroicons/react/24/solid';
import { APP_VERSION, BUILD_DATE, BUILD_COMMIT, ASSET_TYPES } from '../constants';
import { CHANGELOG } from '../content/changelog';
import { iconSvg, powerCutSvg, LINE_LEGEND } from './icons';
import { DATA_SOURCES } from '../content/sources';
import { ScenarioModelPanel } from './panels/ScenarioPanels';
import { getApiSystemStatus, getSystemLogs } from '../services/geminiService';

interface HelpModalProps {
    onClose: () => void;
    onLaunchTour?: () => void;
    initialTab?: 'guide' | 'whatsnew' | 'assets' | 'model' | 'sources' | 'status' | 'logs';
}

const HelpModal: React.FC<HelpModalProps> = ({ onClose, onLaunchTour, initialTab = 'guide' }) => {
    const [activeTab, setActiveTab] = useState<'guide' | 'whatsnew' | 'assets' | 'model' | 'sources' | 'status' | 'logs'>(initialTab);
    const apiStatuses = getApiSystemStatus();
    const systemLogs = getSystemLogs();

    const tabs = [
        { id: 'guide', label: 'User Guide', icon: BookOpenIcon },
        { id: 'whatsnew', label: "What's new", icon: SparklesIcon },
        { id: 'assets', label: 'Map legend', icon: CircleStackIcon },
        { id: 'model', label: 'Scenario model', icon: PlayIcon },
        { id: 'sources', label: 'About & sources', icon: ChatBubbleBottomCenterTextIcon },
        { id: 'status', label: 'System Status', icon: ServerStackIcon },
        { id: 'logs', label: 'System Logs', icon: ClipboardDocumentListIcon },
    ];

    return (
        <div className="fixed inset-0 z-[500] bg-black/80 backdrop-blur flex items-center justify-center p-0 sm:p-4 md:p-8" onClick={onClose}>
            <div className="bg-slate-900 border border-slate-700 sm:rounded-xl max-w-5xl w-full h-full sm:h-[85vh] shadow-2xl relative flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                
                {/* Header */}
                <div className="flex justify-between items-center px-4 py-3 sm:p-6 border-b border-slate-800 bg-slate-950">
                    <h2 className="text-lg sm:text-2xl font-bold text-white flex items-center gap-3">
                        <span className="text-cyan-400">///</span> Resilience Platform Help
                    </h2>
                    <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
                        <XMarkIcon className="w-8 h-8" />
                    </button>
                </div>

                <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
                    {/* Sidebar */}
                    <div className="md:w-64 shrink-0 bg-slate-950/50 border-b md:border-b-0 md:border-r border-slate-800 flex md:flex-col p-2 md:p-4 gap-1 md:gap-2 overflow-x-auto">
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                className={`flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2 md:py-3 rounded-lg text-xs md:text-sm font-bold whitespace-nowrap shrink-0 transition-all ${
                                    activeTab === tab.id 
                                    ? 'bg-cyan-900/30 text-cyan-400 border border-cyan-500/30 shadow-lg' 
                                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                                }`}
                            >
                                <tab.icon className="w-5 h-5" />
                                {tab.label}
                            </button>
                        ))}
                        
                        <div className="mt-auto space-y-2 hidden md:block">
                             <div className="p-4 bg-slate-800/50 rounded border border-slate-700/50">
                                <h3 className="text-xs font-bold text-slate-400 uppercase mb-2 flex items-center gap-2">
                                    <ChatBubbleLeftRightIcon className="w-3 h-3" /> Support
                                </h3>
                                <button 
                                    onClick={() => window.location.href = 'mailto:stuart@horizonqltd.com'}
                                    className="w-full px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs font-bold transition-colors truncate"
                                    title="Email Support"
                                >
                                    stuart@horizonqltd.com
                                </button>
                            </div>

                            <div className="p-4 bg-slate-900 rounded border border-slate-800">
                                <h3 className="text-xs font-bold text-slate-500 uppercase mb-2">Version Info</h3>
                                <div className="text-xs text-slate-400 font-mono">
                                    <p>v{APP_VERSION}</p>
                                    <p>Built {BUILD_DATE}</p>
                                    {BUILD_COMMIT && <p>Commit {BUILD_COMMIT}</p>}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Content Area */}
                    <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-slate-900/50 custom-scrollbar">
                        
                        {activeTab === 'guide' && (
                            <div className="space-y-6 animate-fadeIn">
                                <div className="flex justify-between items-start gap-4">
                                    <div>
                                        <h3 className="text-xl font-bold text-white mb-3 border-b border-slate-700 pb-2">What this is</h3>
                                        <p className="text-slate-300 leading-relaxed max-w-2xl">
                                            A live picture of the GB energy system - infrastructure, power cuts, generator outages, flows and warnings - built only from public open data, with "what if" disruption scenarios on top.
                                        </p>
                                        <p className="text-xs text-slate-500 mt-2 max-w-2xl">
                                            A personal project by Stuart Okin. Not an official product of Ofgem or any other organisation. Live data comes straight from the publishers listed under About &amp; sources; AI features are unverified and labelled as such.
                                        </p>
                                    </div>
                                    {onLaunchTour && (
                                        <button onClick={onLaunchTour} className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg shadow-lg flex items-center gap-2 shrink-0">
                                            <PlayIcon className="w-5 h-5" /> Start tour
                                        </button>
                                    )}
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                    {[
                                        ['Two modes', 'text-cyan-400', 'Live (top bar) shows how the energy system is running now and over time. Scenarios lets you choose one or more risks from the Library, run them together and see the impact.'],
                                        ['Windows', 'text-slate-200', 'Every window opens as a tab in the right-hand panel. Use the pop-out button in its header to float it over the map; drag it by its header, resize it from the corner, change its text size, minimise it, or dock it back. Reset layout (left bar) puts everything back.'],
                                        ['Reports and briefings', 'text-amber-400', 'Create report (top bar) makes a printable report of the live system or the scenario run: pick sections, add a byline, and save it as a PDF from the print dialog. Video briefing makes an AI-narrated briefing on the running scenario.'],
                                        ['Map and layers', 'text-cyan-400', 'Open Layers to choose what the map shows: generation, networks, operator areas, energy flows, generator outages, flood and weather warnings. Click anything for details and its source.'],
                                        ['Live data', 'text-green-400', 'Demand, frequency and the mix refresh every minute; outages, flows and warnings every 5 minutes. If a feed fails, the last real value is shown marked "est." - nothing is made up.'],
                                        ['History', 'text-yellow-400', 'Click Demand or Frequency (Overview) for real Elexon history (24 hours to a year for demand; 24 hours or 7 days for frequency).'],
                                        ['History window', 'text-sky-400', 'History charts what the system did over days and weeks, from snapshots the site takes every 15 minutes: power cuts by network (including ones since fixed), generation, imports, wind, frequency, gas and concentration.'],
                                        ['Concentration', 'text-violet-400', 'How much of supply depends right now on one gas route, one link, one country, one fuel or the weather. System-level only, with a link to the scenario that tests each measure.'],
                                        ['Views and presenting', 'text-cyan-300', 'Tools → Views saves your whole set-up (windows, layers, map, text size, chart settings) by name, to a file or as a link. Present (top bar) shows the map full screen with large captions: Space plays, arrows step, Esc leaves.'],
                                        ['How it\'s built', 'text-slate-200', 'The cube icon in the top bar opens an interactive guide to how the app works: its parts and their live status, where numbers come from, the scenario engine and the map layers.'],
                                        ['Scenarios', 'text-red-400', 'Run "what if" scenarios to see illustrative impacts over time. Scenario figures are modelled assumptions, not forecasts.'],
                                        ['AI features (optional)', 'text-purple-400', 'Add your own free Gemini key (AI: Off, top bar) for the analyst, AI report summaries and AI scenario proposals. AI output comes from web search and is not verified, and AI never supplies scenario numbers: a proposal borrows them from a sourced library scenario you choose.'],
                                        ['System status', 'text-slate-300', 'The green dot by the region shows whether every data source answered. Details are under System Status.'],
                                    ].map(([t, c, d]) => (
                                        <div key={t} className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                                            <h4 className={`font-bold mb-1 ${c}`}>{t}</h4>
                                            <p className="text-slate-400">{d}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {activeTab === 'whatsnew' && (
                            <div className="animate-fadeIn space-y-6">
                                <h3 className="text-xl font-bold text-white border-b border-slate-700 pb-2">What's new</h3>
                                {CHANGELOG.map(entry => (
                                    <div key={entry.version} className="bg-slate-800/40 border border-slate-700 rounded-lg p-4">
                                        <div className="flex items-baseline justify-between gap-3 mb-2">
                                            <h4 className="font-bold text-white">v{entry.version} - {entry.title}</h4>
                                            <span className="text-xs text-slate-500 shrink-0">{new Date(entry.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                        </div>
                                        <ul className="list-disc list-inside space-y-1 text-sm text-slate-300">
                                            {entry.changes.map((c, i) => <li key={i}>{c}</li>)}
                                        </ul>
                                    </div>
                                ))}
                            </div>
                        )}

                        {activeTab === 'assets' && (
                            <div className="animate-fadeIn space-y-6">
                                <div>
                                    <h3 className="text-xl font-bold text-white mb-2 border-b border-slate-700 pb-2">Map legend</h3>
                                    <p className="text-sm text-slate-400">The outline shape shows the family: <b className="text-slate-200">circle</b> = generation, <b className="text-slate-200">hexagon</b> = storage, <b className="text-slate-200">square</b> = substation / network, <b className="text-slate-200">diamond</b> = gas network, <b className="text-slate-200">triangle</b> = demand. Zoomed out, assets show as small coloured shapes; zoom in to see the symbols, then individual turbines, solar arrays and local lines. Click anything for details; click a substation to highlight the lines connected to it. A red ring means the asset is affected by the running scenario.</p>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                                    {ASSET_TYPES.filter(a => !['transmission_elec', 'distribution_elec', 'pipeline_gas', 'custom_search'].includes(a.id)).map(asset => (
                                        <div key={asset.id} className="flex items-center gap-3 bg-slate-800/30 p-2 rounded border border-slate-700/50">
                                            <span className="shrink-0" dangerouslySetInnerHTML={{ __html: iconSvg(asset.id, asset.color, 32) }} />
                                            <span className="text-xs text-slate-200 font-bold">{asset.label}</span>
                                        </div>
                                    ))}
                                </div>
                                <div>
                                    <h4 className="font-bold text-slate-200 mb-2">Live events</h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-300">
                                        <div className="flex items-center gap-3"><span dangerouslySetInnerHTML={{ __html: powerCutSvg(24) }} /> Power cut (unplanned ones pulse; planned work is smaller)</div>
                                        <div className="flex items-center gap-3"><span className="px-1.5 rounded border border-amber-500 bg-amber-900 text-amber-200 font-bold">&#9660;812 MW</span> Generator / interconnector outage (amber = unplanned, grey = planned)</div>
                                        <div className="flex items-center gap-3"><span className="px-1.5 rounded border border-green-400 text-green-400 font-bold">IFA &darr;331 MW</span> Interconnector flow (green = import, orange = export)</div>
                                        <div className="flex items-center gap-3"><span className="w-4 h-4 bg-blue-600 border-2 border-white rounded-sm inline-block" /> Flood warning (red = severe)</div>
                                        <div className="flex items-center gap-3"><span className="flex gap-1"><span className="w-3 h-3 rounded-full inline-block bg-yellow-400" /><span className="w-3 h-3 rounded-full inline-block border-2 border-lime-400" /></span> Generator / battery from a DNO capacity register (filled = connected, ring = accepted, not built; size = MW). Click for the substations it connects through</div>
                                        <div className="flex items-center gap-3"><span className="w-3 h-3 rounded-full inline-block bg-yellow-400/60 border border-slate-200 shrink-0" /><span>Renewable or storage site from the government's planning database (REPD), where no network register covers it. Click to see the substation it <i>probably</i> connects to, inferred from OpenStreetMap (labelled, may be wrong)</span></div>
                                    </div>
                                </div>
                                <div>
                                    <h4 className="font-bold text-slate-200 mb-2">Data coverage and scenarios</h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-300">
                                        <div className="flex items-center gap-3"><span className="w-6 h-4 border border-dashed border-amber-400 shrink-0" style={{ background: 'repeating-linear-gradient(135deg, rgba(251,191,36,0.6) 0 2px, transparent 2px 5px)' }} /> No open live power-cut feed (North West England, Northern Ireland): cuts there won't show</div>
                                        <div className="flex items-center gap-3"><svg width="56" height="10" className="shrink-0"><line x1="2" y1="5" x2="54" y2="5" stroke="#16a34a" strokeWidth="2" /></svg> Network operator line from its own open data (green = 33/66 kV, blue = 132 kV; dashed = underground)</div>
                                        <div className="flex items-center gap-3"><span className="w-6 h-4 shrink-0" style={{ background: 'rgba(239,68,68,0.28)' }} /> Faint red: power cuts spreading towards this area</div>
                                        <div className="flex items-center gap-3"><span className="w-6 h-4 shrink-0" style={{ background: 'rgba(239,68,68,0.65)' }} /> Red haze: an area losing power</div>
                                        <div className="flex items-center gap-3"><span className="w-6 h-4 shrink-0 border border-slate-600" style={{ background: '#000' }} /> Black: lights out (modelled; which areas is illustrative). Fades back to normal when supply returns</div>
                                        <div className="flex items-center gap-3"><svg width="56" height="10" className="shrink-0"><line x1="2" y1="5" x2="54" y2="5" stroke="#ef4444" strokeWidth="3" strokeDasharray="3 3" /></svg> Energy route cut by the scenario (flow stopped)</div>
                                        <div className="flex items-center gap-3"><span className="w-4 h-4 rounded-full border-2 border-red-500 bg-red-500/25 shrink-0" /> Fleet affected by a common-mode scenario (illustrative)</div>
                                    </div>
                                </div>
                                <div>
                                    <h4 className="font-bold text-slate-200 mb-2">Lines and pipes</h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {LINE_LEGEND.map(l => (
                                            <div key={l.label} className="flex items-center gap-3 text-xs text-slate-300">
                                                <svg width="56" height="10"><line x1="2" y1="5" x2="54" y2="5" stroke={l.colour} strokeWidth={l.width} strokeDasharray={l.dash || undefined} strokeLinecap="round" /></svg>
                                                {l.label}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'model' && (
                            <div className="animate-fadeIn">
                                <h3 className="text-xl font-bold text-white mb-3 border-b border-slate-700 pb-2">How scenario impacts are worked out</h3>
                                <ScenarioModelPanel />
                            </div>
                        )}

                        {activeTab === 'sources' && (
                            <div className="animate-fadeIn">
                                <h3 className="text-xl font-bold text-white mb-3 border-b border-slate-700 pb-2">About &amp; sources</h3>
                                <p className="text-slate-400 mb-5 text-sm">
                                    Every figure comes from one of these public sources. Where the app models or estimates something (for example scenario impacts), it says so and gives the reasoning or source next to the figure.
                                </p>
                                <div className="space-y-2">
                                    {DATA_SOURCES.map(src => (
                                        <div key={src.name} className="bg-slate-950/50 p-3 rounded border border-slate-800 text-sm">
                                            <div className="flex justify-between gap-3 flex-wrap">
                                                <a href={src.url} target="_blank" rel="noopener noreferrer" className="font-bold text-cyan-400 hover:underline">{src.name}</a>
                                                <span className="text-xs text-slate-500">{src.licence}</span>
                                            </div>
                                            <div className="text-slate-300">{src.usedFor}</div>
                                            <div className="text-xs text-slate-500">Updates: {src.refresh}{src.via ? ` · via ${src.via}` : ''}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {activeTab === 'status' && (
                            <div className="animate-fadeIn">
                                <h3 className="text-xl font-bold text-white mb-6 border-b border-slate-700 pb-2">System API Status</h3>
                                <div className="space-y-3">
                                    {apiStatuses.map((status, i) => {
                                        const isGood = status.status === 'Operational' || status.status === 'Connected';
                                        const isWarn = status.status === 'Degraded' || status.status === 'No coverage';
                                        const isIdle = status.status === 'Not needed' || status.status === 'Not checked yet';
                                        return (
                                            <div key={i} className="flex justify-between items-center bg-slate-800/50 p-4 rounded border border-slate-700">
                                                <div className="flex items-center gap-4">
                                                    {isGood ? <CheckCircleIcon className="w-6 h-6 text-green-500" /> : 
                                                     isWarn ? <ExclamationTriangleIcon className="w-6 h-6 text-amber-500" /> :
                                                     isIdle ? <span className="w-6 h-6 rounded-full border-2 border-slate-500 inline-block" aria-hidden="true" /> :
                                                     <XCircleIcon className="w-6 h-6 text-red-500" />}
                                                    <div>
                                                        <div className="text-slate-200 font-bold">{status.org}</div>
                                                        <div className="text-xs text-slate-500 uppercase font-bold tracking-wider">{status.type}</div>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className={`text-sm font-bold ${isGood ? 'text-green-400' : isWarn ? 'text-amber-400' : isIdle ? 'text-slate-400' : 'text-red-400'}`}>{status.status}</div>
                                                    <div className="text-xs text-slate-500">{status.keyStatus}</div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {activeTab === 'logs' && (
                            <div className="animate-fadeIn h-full flex flex-col">
                                <h3 className="text-xl font-bold text-white mb-4 border-b border-slate-700 pb-2">Operational System Logs</h3>
                                <div className="flex-1 overflow-y-auto space-y-2 font-mono text-xs bg-black p-4 rounded border border-slate-800">
                                    {systemLogs.length === 0 ? (
                                        <div className="text-slate-500 text-center mt-10">No logs recorded.</div>
                                    ) : (
                                        systemLogs.map((log, i) => (
                                            <div key={i} className="border-b border-slate-900 pb-2 mb-2 last:border-0 last:mb-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-slate-500">{new Date(log.timestamp).toLocaleTimeString()}</span>
                                                    <span className={`uppercase font-bold px-1 rounded ${
                                                        log.type === 'error' ? 'bg-red-900 text-red-400' : 
                                                        log.type === 'warning' ? 'bg-amber-900 text-amber-400' : 
                                                        'bg-blue-900 text-blue-400'
                                                    }`}>{log.type}</span>
                                                    <span className="text-slate-300 font-bold">{log.message}</span>
                                                </div>
                                                {log.details && (
                                                    <div className="text-slate-500 pl-20 break-words whitespace-pre-wrap">
                                                        {log.details}
                                                    </div>
                                                )}
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default HelpModal;
