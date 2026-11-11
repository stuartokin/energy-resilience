
import React, { useState } from 'react';
import { XMarkIcon, BookOpenIcon, ServerStackIcon, CircleStackIcon, ChatBubbleBottomCenterTextIcon, CheckCircleIcon, ExclamationTriangleIcon, XCircleIcon, PlayIcon, ChatBubbleLeftRightIcon, ClipboardDocumentListIcon } from '@heroicons/react/24/solid';
import { APP_VERSION, BUILD_DATE, ASSET_TYPES, ALL_SOURCES } from '../constants';
import { getApiSystemStatus, getSystemLogs } from '../services/geminiService';

interface HelpModalProps {
    onClose: () => void;
    onLaunchTour?: () => void;
    initialTab?: 'guide' | 'assets' | 'sources' | 'status' | 'logs';
}

const HelpModal: React.FC<HelpModalProps> = ({ onClose, onLaunchTour, initialTab = 'guide' }) => {
    const [activeTab, setActiveTab] = useState<'guide' | 'assets' | 'sources' | 'status' | 'logs'>(initialTab);
    const apiStatuses = getApiSystemStatus();
    const systemLogs = getSystemLogs();

    const tabs = [
        { id: 'guide', label: 'User Guide', icon: BookOpenIcon },
        { id: 'assets', label: 'Asset Legend', icon: CircleStackIcon },
        { id: 'sources', label: 'Data Sources', icon: ChatBubbleBottomCenterTextIcon },
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
                                    <p>{BUILD_DATE}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Content Area */}
                    <div className="flex-1 overflow-y-auto p-8 bg-slate-900/50 custom-scrollbar">
                        
                        {activeTab === 'guide' && (
                            <div className="space-y-8 animate-fadeIn">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h3 className="text-xl font-bold text-white mb-4 border-b border-slate-700 pb-2">Platform Overview</h3>
                                        <p className="text-slate-300 leading-relaxed max-w-2xl">
                                            The Energy Sector Resilience & Risk platform is a next-generation simulation tool designed to visualize critical infrastructure dependencies and model the impact of high-impact, low-probability events (HILP).
                                        </p>
                                    </div>
                                    {onLaunchTour && (
                                        <button 
                                            onClick={onLaunchTour}
                                            className="px-6 py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg shadow-lg flex items-center gap-2 transition-transform hover:scale-105 shadow-cyan-900/20"
                                        >
                                            <PlayIcon className="w-5 h-5" /> Start Tour
                                        </button>
                                    )}
                                </div>

                                <div className="grid grid-cols-2 gap-6">
                                    <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                                        <h4 className="font-bold text-cyan-400 mb-2">Interactive Mapping</h4>
                                        <p className="text-sm text-slate-400">Real-time visualization of Generation, Transmission, and Distribution assets overlaid with live outage data.</p>
                                    </div>
                                    <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                                        <h4 className="font-bold text-red-400 mb-2">Risk Simulation</h4>
                                        <p className="text-sm text-slate-400">Model scenarios like Cyber Attacks, Storms, or Supply Chain failures to estimate consumer impact and economic cost.</p>
                                    </div>
                                    <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                                        <h4 className="font-bold text-purple-400 mb-2">AI Analysis</h4>
                                        <p className="text-sm text-slate-400">Gemini 2.5 powered analysis of grid vulnerabilities, asset criticality, and real-time threat intelligence.</p>
                                    </div>
                                    <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                                        <h4 className="font-bold text-green-400 mb-2">Multimedia Reporting</h4>
                                        <p className="text-sm text-slate-400">Generate narrated audio briefings and print-ready reports for stakeholders instantly.</p>
                                    </div>
                                </div>
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
                                <h3 className="text-xl font-bold text-white mb-6 border-b border-slate-700 pb-2">Data Integrity & Sources</h3>
                                <p className="text-slate-400 mb-6">
                                    This platform aggregates data from public open-source intelligence (OSINT), official regulatory bodies, and real-time API feeds.
                                </p>
                                <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {ALL_SOURCES.map((source, i) => (
                                        <li key={i} className="flex items-center gap-3 text-sm text-slate-300 bg-slate-950/50 p-3 rounded border border-slate-800">
                                            <CheckCircleIcon className="w-4 h-4 text-cyan-500 shrink-0" />
                                            {source}
                                        </li>
                                    ))}
                                </ul>
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
