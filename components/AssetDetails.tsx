
import React, { useState } from 'react';
import { InfrastructureAsset } from '../types';
import { XMarkIcon, SparklesIcon, BoltIcon, ExclamationTriangleIcon, UserGroupIcon, ServerStackIcon } from '@heroicons/react/24/solid';
import { analyzeAssetRisks } from '../services/geminiService';

interface AssetDetailsProps {
    asset: InfrastructureAsset | null;
    regionName: string;
    onClose: () => void;
}

const getVoltageValue = (asset: InfrastructureAsset) => {
    if (asset.voltageKV) return asset.voltageKV;
    if (asset.rawTags?.voltage) {
        const v = parseInt(String(asset.rawTags.voltage).replace(/\D/g, ''));
        return isNaN(v) ? null : (v > 500 ? v / 1000 : v); // Normalize to kV roughly if needed, usually comes as V
    }
    return null;
};

const getConsumersServed = (asset: InfrastructureAsset) => {
    if (!asset.capacityMW) return "Unknown";
    // Rough estimate: 1 MW ~ 600-1000 homes depending on region/season. Using 800.
    const homes = Math.floor(asset.capacityMW * 800);
    return homes > 1000000 ? `${(homes/1000000).toFixed(1)}M Homes` : `${(homes/1000).toFixed(1)}k Homes`;
};

const AssetDetails: React.FC<AssetDetailsProps> = ({ asset, regionName, onClose }) => {
    const [analysis, setAnalysis] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    if (!asset) return null;

    const handleAnalyze = async () => {
        setLoading(true);
        const result = await analyzeAssetRisks(asset, regionName);
        setAnalysis(result);
        setLoading(false);
    };

    const voltage = getVoltageValue(asset);
    // voltage in raw tags is usually volts. >1000 is likely V.
    const displayVoltage = voltage ? (voltage > 400 ? `${(voltage/1000).toFixed(0)} kV` : `${voltage} V`) : (asset.typeId.includes('transmission') ? '400 kV (Est)' : 'Unknown');
    const criticality = voltage && voltage >= 275000 ? "Critical Transmission" : (asset.capacityMW && asset.capacityMW > 500 ? "Critical Generation" : "Standard Asset");

    return (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn" onClick={onClose}>
            <div 
                className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden relative" 
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-5 border-b border-slate-800 flex justify-between items-start bg-slate-950">
                    <div>
                        <h3 className="font-bold text-white text-2xl leading-tight">{asset.name}</h3>
                        <div className="text-sm text-slate-400 uppercase tracking-wider mt-1 flex items-center gap-2">
                            <BoltIcon className="w-4 h-4 text-yellow-500" />
                            {asset.capacityMW ? `${asset.capacityMW} MW Capacity` : criticality}
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-slate-800 rounded transition-colors"><XMarkIcon className="w-8 h-8 text-slate-500 hover:text-white" /></button>
                </div>
                
                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                         <div className="bg-slate-800 p-3 rounded-lg border border-slate-700">
                             <span className="text-slate-500 block text-xs uppercase font-bold mb-1">Asset Type</span>
                             <span className="text-white font-mono text-base">{asset.typeId}</span>
                         </div>
                         <div className="bg-slate-800 p-3 rounded-lg border border-slate-700">
                             <span className="text-slate-500 block text-xs uppercase font-bold mb-1">Operational Status</span>
                             <span className={`font-mono text-base font-bold ${asset.status === 'Operational' ? 'text-green-400' : 'text-red-400'}`}>{asset.status}</span>
                         </div>
                         <div className="bg-slate-800 p-3 rounded-lg border border-slate-700">
                             <span className="text-slate-500 block text-xs uppercase font-bold mb-1 flex items-center gap-1"><UserGroupIcon className="w-3 h-3" /> Consumers Served</span>
                             <span className="text-white font-mono text-base">{getConsumersServed(asset)}</span>
                         </div>
                         {(asset.typeId.includes('line') || asset.typeId.includes('transmission') || asset.typeId.includes('distribution')) && (
                             <div className="bg-slate-800 p-3 rounded-lg border border-slate-700">
                                 <span className="text-slate-500 block text-xs uppercase font-bold mb-1 flex items-center gap-1"><BoltIcon className="w-3 h-3" /> Voltage Class</span>
                                 <span className="text-white font-mono text-base">{displayVoltage}</span>
                             </div>
                         )}
                    </div>

                    {!analysis ? (
                        <div className="py-8 flex flex-col items-center justify-center border-2 border-dashed border-slate-700 rounded-xl bg-slate-900/50">
                            <p className="text-slate-400 mb-4 text-center max-w-xs">Ask AI (your Gemini key) why this asset matters to the grid, the general risks for this type of asset, and the impact if it were unavailable. AI output is labelled and not checked.</p>
                            <button 
                                onClick={handleAnalyze}
                                disabled={loading}
                                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 shadow-lg shadow-indigo-900/20"
                            >
                                {loading ? <SparklesIcon className="w-5 h-5 animate-spin" /> : <SparklesIcon className="w-5 h-5" />}
                                {loading ? "Analyzing Asset Criticality..." : "Run AI Risk & Supplier Analysis"}
                            </button>
                        </div>
                    ) : (
                        <div className="bg-slate-800/30 p-5 rounded-xl border border-indigo-500/30 animate-fadeIn">
                            <h4 className="text-sm font-bold text-indigo-400 mb-4 flex items-center gap-2 border-b border-indigo-500/20 pb-2">
                                <ServerStackIcon className="w-5 h-5" /> AI Risk Summary
                            </h4>
                            <div className="prose prose-invert prose-sm max-w-none text-slate-300 whitespace-pre-line leading-relaxed">
                                {analysis}
                            </div>
                            <p className="text-[10px] text-slate-500 mt-4 border-t border-slate-800 pt-2">
                                Generated by Google Gemini from public web search. Not verified, and not an assessment of this site's actual security. Check figures against the cited sources.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default React.memo(AssetDetails);
