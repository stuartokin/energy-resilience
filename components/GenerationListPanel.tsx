
import React from 'react';
import { InfrastructureAsset } from '../types';
import { XMarkIcon, BoltIcon } from '@heroicons/react/24/solid';

interface GenerationListPanelProps {
    title: string;
    assets: InfrastructureAsset[];
    onClose: () => void;
    onSelectAsset: (asset: InfrastructureAsset) => void;
}

const GenerationListPanel: React.FC<GenerationListPanelProps> = ({ title, assets, onClose, onSelectAsset }) => {
    const sorted = [...assets].sort((a, b) => (b.capacityMW || 0) - (a.capacityMW || 0));

    return (
        <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-xl w-80 max-h-[500px] flex flex-col pointer-events-auto">
            <div className="p-3 border-b border-slate-800 flex justify-between items-center bg-slate-950 rounded-t-lg">
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                    <BoltIcon className="w-4 h-4 text-yellow-500" /> {title}
                </h3>
                <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
                    <XMarkIcon className="w-5 h-5" />
                </button>
            </div>
            <div className="overflow-y-auto p-2 space-y-1 custom-scrollbar">
                {sorted.length === 0 ? (
                    <div className="text-center text-xs text-slate-500 py-4">No active assets found in view.</div>
                ) : sorted.map(asset => (
                    <div 
                        key={asset.id} 
                        onClick={() => onSelectAsset(asset)}
                        className="p-2 hover:bg-slate-800 rounded cursor-pointer group border border-transparent hover:border-slate-700 transition-all"
                    >
                        <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-slate-200 group-hover:text-white truncate max-w-[180px]">{asset.name}</span>
                            <span className={`text-[10px] px-1.5 rounded ${asset.liveStatus === 'generating' ? 'bg-green-900/50 text-green-400' : 'bg-slate-800 text-slate-500'}`}>
                                {asset.capacityMW ? `${asset.capacityMW} MW` : 'N/A'}
                            </span>
                        </div>
                        <div className="flex justify-between items-center mt-1">
                            <span className="text-[10px] text-slate-500">{asset.typeId.replace(/_/g, ' ')}</span>
                            {asset.liveStatus === 'generating' && (
                                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" title="Generating"></span>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default GenerationListPanel;
