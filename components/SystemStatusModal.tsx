
import React from 'react';
import { XMarkIcon, ServerStackIcon, CheckCircleIcon, ExclamationTriangleIcon, XCircleIcon } from '@heroicons/react/24/solid';

interface SystemStatusModalProps {
    onClose: () => void;
    statuses: { org: string; status: string; keyStatus: string; type: string }[];
}

const SystemStatusModal: React.FC<SystemStatusModalProps> = ({ onClose, statuses }) => {
    return (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn" onClick={onClose}>
            <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-2xl shadow-2xl relative flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950 rounded-t-xl shrink-0">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <ServerStackIcon className="w-5 h-5 text-slate-400" />
                        System API Status
                    </h2>
                    <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </div>
                <div className="p-6 overflow-y-auto">
                    <div className="grid grid-cols-1 gap-3">
                        {statuses.map((status, i) => {
                             const isGood = status.status === 'Operational' || status.status === 'Connected';
                             const isWarn = status.status === 'Degraded';
                             return (
                                <div key={i} className="flex justify-between items-center bg-slate-800/50 p-3 rounded border border-slate-700 hover:border-slate-600 transition-colors">
                                    <div className="flex items-center gap-3">
                                        {isGood ? <CheckCircleIcon className="w-5 h-5 text-green-500" /> : 
                                         isWarn ? <ExclamationTriangleIcon className="w-5 h-5 text-amber-500" /> :
                                         <XCircleIcon className="w-5 h-5 text-red-500" />}
                                        <div>
                                            <div className="text-slate-200 font-bold text-sm">{status.org}</div>
                                            <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">{status.type}</div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                         <div className={`text-xs font-bold ${isGood ? 'text-green-400' : isWarn ? 'text-amber-400' : 'text-red-400'}`}>{status.status}</div>
                                         <div className="text-[10px] text-slate-500">{status.keyStatus}</div>
                                    </div>
                                </div>
                             );
                        })}
                    </div>
                </div>
                <div className="p-4 bg-slate-950 border-t border-slate-800 rounded-b-xl text-center">
                    <p className="text-[10px] text-slate-500">Live connectivity check performed at {new Date().toLocaleTimeString()}</p>
                </div>
            </div>
        </div>
    );
};

export default SystemStatusModal;
