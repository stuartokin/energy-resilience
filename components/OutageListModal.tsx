
import React, { useState } from 'react';
import { OutageEvent } from '../types';
import { XMarkIcon, ExclamationTriangleIcon, BoltIcon, ClockIcon, MapPinIcon, ArrowPathIcon, ShieldCheckIcon } from '@heroicons/react/24/solid';

interface OutageListModalProps {
    outages: OutageEvent[];
    onClose: () => void;
    onRefresh: () => void;
}

const OutageListModal: React.FC<OutageListModalProps> = ({ outages, onClose, onRefresh }) => {
    const [isRefreshing, setIsRefreshing] = useState(false);

    const handleRefreshClick = () => {
        setIsRefreshing(true);
        onRefresh();
        // Reset local spinning state after a timeout or rely on parent re-render, 
        // but simple timeout provides good feedback
        setTimeout(() => setIsRefreshing(false), 1000);
    };

    const hasSimulatedData = outages.some(o => o.isSimulated);

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn" onClick={onClose}>
            <div 
                className="w-full max-w-5xl bg-slate-900 border border-slate-700 rounded-xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden relative" 
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-950">
                    <div>
                        <h3 className="font-bold text-white text-xl flex items-center gap-2">
                            {outages.length > 0 ? (
                                <ExclamationTriangleIcon className="w-6 h-6 text-red-500 animate-pulse" />
                            ) : (
                                <ShieldCheckIcon className="w-6 h-6 text-green-500" />
                            )}
                            {outages.length > 0 ? 'Live Power Outages' : 'Grid Status Report'}
                        </h3>
                        <p className="text-sm text-slate-400 mt-1">Real-time incident reports from DNO feeds and news sources.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={handleRefreshClick}
                            className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-bold transition-all"
                        >
                            <ArrowPathIcon className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                            Check Status
                        </button>
                        <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-lg transition-colors group">
                            <XMarkIcon className="w-6 h-6 text-slate-500 group-hover:text-white" />
                        </button>
                    </div>
                </div>
                
                {/* Simulation Warning */}
                {hasSimulatedData && (
                    <div className="bg-amber-900/40 border-b border-amber-700/50 p-3 flex items-center justify-center gap-2 text-xs text-amber-200">
                        <ExclamationTriangleIcon className="w-4 h-4 text-amber-400" />
                        <span className="font-bold">NOTICE:</span> Real-time DNO data unavailable. Displaying simulated incident data for system demonstration.
                    </div>
                )}
                
                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 bg-slate-900/50">
                    {outages.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center py-12">
                            <div className="w-24 h-24 bg-green-500/10 rounded-full flex items-center justify-center mb-6">
                                <ShieldCheckIcon className="w-12 h-12 text-green-500" />
                            </div>
                            <h4 className="text-xl font-bold text-white mb-2">No Active Incidents Reported</h4>
                            <p className="text-slate-400 max-w-md mx-auto">
                                All monitored systems are currently operating within nominal parameters. No significant outages or grid faults have been detected in this region.
                            </p>
                            <button 
                                onClick={handleRefreshClick}
                                className="mt-6 text-cyan-400 hover:text-cyan-300 text-sm font-bold flex items-center gap-2"
                            >
                                <ArrowPathIcon className="w-4 h-4" /> Verify Status Again
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {outages.map((outage) => (
                                <div key={outage.id} className={`bg-slate-950 border ${outage.isSimulated ? 'border-amber-900/50' : 'border-slate-800'} rounded-xl p-4 hover:border-red-500/50 transition-all hover:shadow-lg hover:shadow-red-900/10 group`}>
                                    <div className="flex justify-between items-start mb-3">
                                        <div className="flex items-start gap-2">
                                            <MapPinIcon className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
                                            <h4 className="font-bold text-slate-200 text-sm leading-tight group-hover:text-white">{outage.locationName}</h4>
                                        </div>
                                        <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${
                                            outage.status === 'Active' ? 'bg-red-950 text-red-400 border-red-900' : 
                                            outage.status === 'Investigating' ? 'bg-amber-950 text-amber-400 border-amber-900' : 
                                            'bg-green-950 text-green-400 border-green-900'
                                        }`}>{outage.status}</span>
                                    </div>
                                    
                                    <p className="text-xs text-slate-400 mb-4 h-10 line-clamp-2">{outage.description}</p>
                                    
                                    <div className="space-y-2 bg-slate-900/50 rounded p-3 text-xs border border-slate-800/50">
                                        <div className="flex justify-between items-center">
                                            <span className="text-slate-500 flex items-center gap-1"><BoltIcon className="w-3 h-3" /> Affected</span>
                                            <span className="text-slate-200 font-mono font-bold">{outage.consumersAffected.toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-slate-500 flex items-center gap-1"><ClockIcon className="w-3 h-3" /> Reported</span>
                                            <span className="text-slate-300">{new Date(outage.startTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                        </div>
                                        <div className="flex justify-between items-center pt-1 border-t border-slate-800">
                                            <span className="text-slate-500">Source</span>
                                            <span className="text-slate-400 italic max-w-[100px] truncate" title={outage.source}>{outage.source}</span>
                                        </div>
                                    </div>
                                    {outage.isSimulated && (
                                        <div className="mt-2 text-[9px] text-amber-500/70 text-center uppercase tracking-widest font-bold">Simulated Data</div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                
                {/* Footer */}
                <div className="p-4 border-t border-slate-800 bg-slate-950 flex justify-between items-center text-xs text-slate-500">
                    <span>Total Incidents: {outages.length}</span>
                    {outages.length > 0 && (
                        <span>Total Consumers Affected: {outages.reduce((sum, o) => sum + o.consumersAffected, 0).toLocaleString()}</span>
                    )}
                </div>
            </div>
        </div>
    );
};

export default OutageListModal;
