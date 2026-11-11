
import React, { useState, useEffect, useMemo } from 'react';
import { XMarkIcon, SparklesIcon, ChartBarIcon } from '@heroicons/react/24/solid';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { fetchGridHistory, analyzeGridHistory } from '../services/geminiService';

interface GridHistoryModalProps {
    metric: 'demand' | 'frequency';
    onClose: () => void;
}

const GridHistoryModal: React.FC<GridHistoryModalProps> = ({ metric, onClose }) => {
    const [range, setRange] = useState<'24h' | '7d' | '30d' | '1y'>('24h');
    const [data, setData] = useState<{ timestamp: number, value: number }[]>([]);
    const [analysis, setAnalysis] = useState<string | null>(null);
    const [isLoadingData, setIsLoadingData] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    useEffect(() => {
        const loadData = async () => {
            setIsLoadingData(true);
            setAnalysis(null);
            const history = await fetchGridHistory(metric, range);
            setData(history);
            setIsLoadingData(false);
        };
        loadData();
    }, [metric, range]);

    const handleAnalyze = async () => {
        setIsAnalyzing(true);
        const result = await analyzeGridHistory(metric, range, data);
        setAnalysis(result);
        setIsAnalyzing(false);
    };

    const formatXAxis = (tick: any) => {
        const date = new Date(tick);
        if (range === '24h') return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        if (range === '7d') return date.toLocaleDateString([], { weekday: 'short' });
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    };

    const color = metric === 'demand' ? '#eab308' : '#22c55e'; // Yellow for Demand, Green for Freq

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn" onClick={onClose}>
            <div 
                className="w-full max-w-4xl bg-slate-900 border border-slate-700 rounded-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden" 
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-950">
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${metric === 'demand' ? 'bg-yellow-900/30 text-yellow-500' : 'bg-green-900/30 text-green-500'}`}>
                            <ChartBarIcon className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="font-bold text-white text-xl capitalize">{metric === 'demand' ? 'Grid Demand' : 'Grid Frequency'} History</h3>
                            <p className="text-xs text-slate-400">Historical performance data & anomaly detection</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-lg transition-colors group">
                        <XMarkIcon className="w-6 h-6 text-slate-500 group-hover:text-white" />
                    </button>
                </div>

                {/* Controls */}
                <div className="p-4 border-b border-slate-800 bg-slate-900 flex gap-2">
                    {['24h', '7d', '30d', '1y'].map((r) => (
                        <button
                            key={r}
                            onClick={() => setRange(r as any)}
                            className={`px-4 py-1.5 rounded text-sm font-bold transition-all ${
                                range === r 
                                ? 'bg-slate-700 text-white shadow-lg' 
                                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                            }`}
                        >
                            {r.toUpperCase()}
                        </button>
                    ))}
                    <div className="flex-1"></div>
                    <button 
                        onClick={handleAnalyze}
                        disabled={isAnalyzing || isLoadingData}
                        className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-sm font-bold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-900/20"
                    >
                        {isAnalyzing ? <SparklesIcon className="w-4 h-4 animate-spin" /> : <SparklesIcon className="w-4 h-4" />}
                        AI Analysis
                    </button>
                </div>

                {/* Chart Area */}
                <div className="flex-1 min-h-[300px] p-4 relative">
                    {isLoadingData ? (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-8 h-8 border-4 border-slate-600 border-t-cyan-500 rounded-full animate-spin"></div>
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={data}>
                                <defs>
                                    <linearGradient id="colorMetric" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor={color} stopOpacity={0.8}/>
                                        <stop offset="95%" stopColor={color} stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                <XAxis 
                                    dataKey="timestamp" 
                                    stroke="#94a3b8" 
                                    fontSize={10} 
                                    tickFormatter={formatXAxis}
                                    minTickGap={30}
                                />
                                <YAxis 
                                    stroke="#94a3b8" 
                                    fontSize={10} 
                                    domain={['auto', 'auto']}
                                />
                                <Tooltip 
                                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f1f5f9' }}
                                    itemStyle={{ fontSize: '12px' }}
                                    labelFormatter={(l) => new Date(l).toLocaleString()}
                                    formatter={(value: any) => [
                                        metric === 'demand' ? `${(value/1000).toFixed(2)} GW` : `${value.toFixed(3)} Hz`, 
                                        metric === 'demand' ? 'Demand' : 'Frequency'
                                    ]}
                                />
                                <Area 
                                    type="monotone" 
                                    dataKey="value" 
                                    stroke={color} 
                                    fillOpacity={1} 
                                    fill="url(#colorMetric)" 
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    )}
                </div>

                {/* Analysis Panel */}
                {analysis && (
                    <div className="p-6 bg-slate-950 border-t border-slate-800 max-h-48 overflow-y-auto animate-slideUp">
                        <h4 className="text-xs font-bold text-indigo-400 uppercase mb-2 flex items-center gap-2">
                            <SparklesIcon className="w-4 h-4" /> AI Insight
                        </h4>
                        <div className="prose prose-invert prose-sm text-slate-300 leading-relaxed whitespace-pre-line">
                            {analysis}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default GridHistoryModal;
