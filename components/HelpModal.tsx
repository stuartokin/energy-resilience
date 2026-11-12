
import React, { useState } from 'react';
import { XMarkIcon, SparklesIcon, BookOpenIcon, ServerStackIcon, CircleStackIcon, ChatBubbleBottomCenterTextIcon, CheckCircleIcon, ExclamationTriangleIcon, XCircleIcon, PlayIcon, ChatBubbleLeftRightIcon, ClipboardDocumentListIcon } from '@heroicons/react/24/solid';
import { APP_VERSION, BUILD_DATE, BUILD_COMMIT, ASSET_TYPES } from '../constants';
import { CHANGELOG } from '../content/changelog';
import { DATA_SOURCES } from '../content/sources';
import { getApiSystemStatus, getSystemLogs } from '../services/geminiService';

interface HelpModalProps {
    onClose: () => void;
    onLaunchTour?: () => void;
    initialTab?: 'guide' | 'whatsnew' | 'assets' | 'sources' | 'status' | 'logs';
}

const HelpModal: React.FC<HelpModalProps> = ({ onClose, onLaunchTour, initialTab = 'guide' }) => {
    const [activeTab, setActiveTab] = useState<'guide' | 'whatsnew' | 'assets' | 'sources' | 'status' | 'logs'>(initialTab);
    const apiStatuses = getApiSystemStatus();
    const systemLogs = getSystemLogs();

    const tabs = [
        { id: 'guide', label: 'User Guide', icon: BookOpenIcon },
        { id: 'whatsnew', label: "What's new", icon: SparklesIcon },
        { id: 'assets', label: 'Asset Legend', icon: CircleStackIcon },
        { id: 'sources', label: 'About & sources', icon: ChatBubbleBottomCenterTextIcon },
        { id: 'status', label: 'System Status', icon: ServerStackIcon },
        { id: 'logs', label: 'System Logs', icon: ClipboardDocumentListIcon },
    ];

    return (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur flex items-center justify-center p-4 md:p-8" onClick={onClose}>
            <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-5xl w-full h-[80vh] shadow-2xl relative flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                
                {/* Header */}
                <div className="flex justify-between items-center p-6 border-b border-slate-800 bg-slate-950">
                    <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                        <span className="text-cyan-400">///</span> Resilience Platform Help
                    </h2>
                    <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
                        <XMarkIcon className="w-8 h-8" />
                    </button>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    {/* Sidebar */}
                    <div className="w-64 bg-slate-950/50 border-r border-slate-800 flex flex-col p-4 gap-2">
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-bold transition-all ${
                                    activeTab === tab.id 
                                    ? 'bg-cyan-900/30 text-cyan-400 border border-cyan-500/30 shadow-lg' 
                                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                                }`}
                            >
                                <tab.icon className="w-5 h-5" />
                                {tab.label}
                            </button>
                        ))}
                        
                        <div className="mt-auto space-y-2">
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
                    <div className="flex-1 overflow-y-auto p-8 bg-slate-900/50 custom-scrollbar">
                        
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
                                        ['Map and layers', 'text-cyan-400', 'Use the filter (funnel) to choose layers: generation, networks, DNO areas, power cuts, generator outages, interconnector flows, flood and weather warnings. Click anything for details and its source.'],
                                        ['Live data', 'text-green-400', 'Demand, frequency and the mix refresh every minute; outages, flows and warnings every 5 minutes. If a feed fails, the last real value is shown marked "est." - nothing is made up.'],
                                        ['History', 'text-yellow-400', 'Click Grid Demand or Frequency for real Elexon history (24 hours to a year for demand; 24 hours or 7 days for frequency).'],
                                        ['Scenarios', 'text-red-400', 'Run "what if" scenarios to see illustrative impacts over time. Scenario figures are modelled assumptions, not forecasts.'],
                                        ['AI features (optional)', 'text-purple-400', 'Add your own free Gemini key (AI: Off, top bar) for the analyst, AI summaries and AI scenarios. AI output comes from web search and is not verified.'],
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
                            <div className="animate-fadeIn">
                                <h3 className="text-xl font-bold text-white mb-6 border-b border-slate-700 pb-2">Infrastructure Asset Legend</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {ASSET_TYPES.map(asset => (
                                        <div key={asset.id} className="flex items-center gap-4 bg-slate-800/30 p-3 rounded border border-slate-700/50">
                                            <div 
                                                className="w-8 h-8 rounded-full border-2 border-white/20 shadow-lg shrink-0"
                                                style={{ backgroundColor: asset.color }}
                                            />
                                            <div>
                                                <div className="font-bold text-slate-200">{asset.label}</div>
                                                <div className="text-xs text-slate-500 uppercase tracking-wider">{asset.category}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
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
                                        const isWarn = status.status === 'Degraded';
                                        return (
                                            <div key={i} className="flex justify-between items-center bg-slate-800/50 p-4 rounded border border-slate-700">
                                                <div className="flex items-center gap-4">
                                                    {isGood ? <CheckCircleIcon className="w-6 h-6 text-green-500" /> : 
                                                     isWarn ? <ExclamationTriangleIcon className="w-6 h-6 text-amber-500" /> :
                                                     <XCircleIcon className="w-6 h-6 text-red-500" />}
                                                    <div>
                                                        <div className="text-slate-200 font-bold">{status.org}</div>
                                                        <div className="text-xs text-slate-500 uppercase font-bold tracking-wider">{status.type}</div>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className={`text-sm font-bold ${isGood ? 'text-green-400' : isWarn ? 'text-amber-400' : 'text-red-400'}`}>{status.status}</div>
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
