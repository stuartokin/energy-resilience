
import React from 'react';
import { SupplyChainInsight } from '../types';
import { XMarkIcon, Cog6ToothIcon, CheckBadgeIcon, ExclamationTriangleIcon, LinkIcon } from '@heroicons/react/24/solid';

interface SupplyChainModalProps {
    onClose: () => void;
    insights: SupplyChainInsight[];
    isLoading: boolean;
    progress: number;
    regionName: string;
}

const SupplyChainModal: React.FC<SupplyChainModalProps> = ({ onClose, insights, isLoading, progress, regionName }) => {
    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn" onClick={onClose}>
            <div 
                className="w-full max-w-4xl bg-slate-900 border border-indigo-500/50 rounded-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden relative" 
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-950">
                    <div>
                        <h3 className="font-bold text-white text-xl flex items-center gap-2">
                            <Cog6ToothIcon className="w-6 h-6 text-indigo-500" />
                            OT Supply Chain Analysis
                        </h3>
                        <p className="text-sm text-slate-400 mt-1">Publicly reported relationships between OT/automation suppliers and energy companies in {regionName}.</p>
                        <p className="text-[11px] text-amber-400/80 mt-1">AI-generated from public web search (Google Gemini). Unverified - check each source before relying on it.</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-lg transition-colors group">
                        <XMarkIcon className="w-6 h-6 text-slate-500 group-hover:text-white" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 bg-slate-900/50">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center h-full py-20">
                            <div className="w-64 mb-4">
                                <div className="flex justify-between text-xs font-bold text-indigo-400 mb-1">
                                    <span>Scanning Vendor Associations...</span>
                                    <span>{progress}%</span>
                                </div>
                                <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                                    <div 
                                        className="bg-indigo-500 h-full transition-all duration-300 ease-out shadow-[0_0_10px_rgba(99,102,241,0.5)]" 
                                        style={{ width: `${progress}%` }}
                                    ></div>
                                </div>
                            </div>
                            <p className="text-slate-500 text-sm animate-pulse">Cross-referencing Siemens, GE, Schneider & local DNOs...</p>
                        </div>
                    ) : insights.length === 0 ? (
                        <div className="text-center text-slate-500 py-10">
                            No significant supply chain data found for this region.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {insights.map((insight, idx) => (
                                <div key={idx} className="bg-slate-950 border border-slate-800 rounded-lg p-4 hover:border-indigo-500/30 transition-all group">
                                    <div className="flex justify-between items-start mb-3">
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 rounded bg-white/10 flex items-center justify-center font-bold text-indigo-400 text-sm">
                                                {insight.supplier.substring(0, 2).toUpperCase()}
                                            </div>
                                            <div>
                                                <h4 className="font-bold text-white text-sm">{insight.supplier}</h4>
                                                <span className="text-xs text-slate-500 font-mono uppercase">{insight.techDomain}</span>
                                            </div>
                                        </div>
                                        <span className={`text-[10px] px-2 py-0.5 rounded border uppercase font-bold ${
                                            insight.probability === 'High' ? 'bg-green-900/30 text-green-400 border-green-900' :
                                            insight.probability === 'Medium' ? 'bg-yellow-900/30 text-yellow-400 border-yellow-900' :
                                            'bg-slate-800 text-slate-400 border-slate-700'
                                        }`}>
                                            {insight.probability} Conf.
                                        </span>
                                    </div>
                                    
                                    <div className="space-y-2 text-sm">
                                        <div className="flex gap-2">
                                            <LinkIcon className="w-4 h-4 text-slate-600 shrink-0 mt-0.5" />
                                            <span className="text-slate-300">
                                                <span className="text-slate-500">Connected to:</span> {insight.operatorConnection}
                                            </span>
                                        </div>
                                        {insight.potentialAssets.length > 0 && (
                                            <div className="flex gap-2">
                                                <ExclamationTriangleIcon className="w-4 h-4 text-slate-600 shrink-0 mt-0.5" />
                                                <span className="text-slate-300">
                                                    <span className="text-slate-500">Assets:</span> {insight.potentialAssets.join(", ")}
                                                </span>
                                            </div>
                                        )}
                                        <p className="text-xs text-slate-400 italic border-l-2 border-slate-800 pl-2 py-1 mt-2">
                                            "{insight.evidence}"
                                        </p>
                                    </div>
                                    
                                    {insight.sources.length > 0 && (
                                        <div className="mt-3 pt-3 border-t border-slate-900 text-[10px] text-slate-600 truncate">
                                            Source: {insight.sources[0]}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Caveat Footer */}
                <div className="p-4 bg-slate-950/50 border-t border-slate-800 text-center">
                    <p className="text-xs text-slate-500 flex items-center justify-center gap-2">
                        <ExclamationTriangleIcon className="w-4 h-4 text-amber-500" />
                        <span className="font-bold text-amber-500">AI GENERATED INSIGHTS:</span> 
                        Supply chain associations are inferred from public data and may be incorrect. Verify all vendor relationships manually.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default SupplyChainModal;
