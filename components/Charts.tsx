
import React, { useState, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { TimelineStep } from '../types';
import { CurrencyDollarIcon, UserGroupIcon } from '@heroicons/react/24/solid';

interface ChartProps {
    data: TimelineStep[];
    currentDay: number;
    onPointClick?: (step: TimelineStep) => void;
}

const CustomizedDot = (props: any) => {
    const { cx, cy, payload, onClick } = props;
    if (!cx || !cy) return null;
    const hasAlerts = payload.activeAlerts && payload.activeAlerts.length > 0;
    if (hasAlerts) {
        return (
            <g onClick={() => onClick && onClick(payload)} style={{ cursor: 'pointer' }}>
                <circle cx={cx} cy={cy} r={8} fill="#ef4444" opacity={0.4} className="animate-ping" />
                <circle cx={cx} cy={cy} r={4} stroke="#fff" strokeWidth={2} fill="#ef4444" />
            </g>
        );
    }
    return null;
};

export const ImpactChart: React.FC<ChartProps> = ({ data, currentDay, onPointClick }) => {
    const [viewMode, setViewMode] = useState<'consumers' | 'cost'>('consumers');

    // Dynamically build chart data
    const chartData = useMemo(() => {
        let lastKnownCost = 0;
        return data.map(d => {
            const isFuture = d.day > currentDay;
            // For cost, if it's future, we usually hide it, but the user requested "remains unchanged after scenario ended".
            // However, "after scenario ended" usually means timeline playback.
            // If viewMode is cost, we show the accumulated line up to currentDay.
            // If data[currentDay] exists, we use it. If currentDay > data.length, we use last known.
            
            if (d.costMillions > lastKnownCost) lastKnownCost = d.costMillions;

            return {
                ...d,
                consumersOffline: isFuture ? null : d.consumersOffline,
                costMillions: isFuture ? null : d.costMillions,
                activeAlerts: isFuture ? [] : d.activeAlerts
            };
        });
    }, [data, currentDay]);

    return (
        <div className="w-full h-full bg-slate-900/50 rounded-lg p-2 border border-slate-800 flex flex-col relative">
            <div className="flex justify-between items-center mb-2 px-2 z-10">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    {viewMode === 'consumers' ? 'Consumers Offline' : 'Cumulative Economic Impact'}
                </h3>
                <div className="flex bg-slate-800 rounded p-0.5">
                    <button 
                        onClick={() => setViewMode('consumers')}
                        className={`p-1 rounded ${viewMode === 'consumers' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'}`}
                        title="Consumers Affected"
                    >
                        <UserGroupIcon className="w-3 h-3" />
                    </button>
                    <button 
                        onClick={() => setViewMode('cost')}
                        className={`p-1 rounded ${viewMode === 'cost' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'}`}
                        title="Cumulative Financial Cost"
                    >
                        <CurrencyDollarIcon className="w-3 h-3" />
                    </button>
                </div>
            </div>
            
            <div className="flex-1 min-h-0 relative">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                            <linearGradient id="colorOff" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8}/>
                                <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                            </linearGradient>
                            <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#eab308" stopOpacity={0.8}/>
                                <stop offset="95%" stopColor="#eab308" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis 
                            dataKey="day" 
                            stroke="#94a3b8" 
                            fontSize={10} 
                            interval="preserveStartEnd"
                        />
                        <YAxis 
                            stroke="#94a3b8" 
                            fontSize={10} 
                            tickFormatter={(val) => {
                                if (viewMode === 'consumers') return val >= 1000 ? `${(val/1000).toFixed(0)}k` : val;
                                return `$${val}M`;
                            }}
                        />
                        <Tooltip 
                            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f1f5f9' }}
                            itemStyle={{ fontSize: '12px' }}
                            labelFormatter={(l) => `Day ${l}`}
                            formatter={(value: any) => {
                                if (value === null || value === undefined) return [];
                                return [
                                    viewMode === 'consumers' ? value.toLocaleString() : `$${value.toFixed(1)}M`, 
                                    viewMode === 'consumers' ? 'Consumers' : 'Cumulative Cost'
                                ];
                            }}
                        />
                        <Area 
                            type="monotone" 
                            dataKey={viewMode === 'consumers' ? 'consumersOffline' : 'costMillions'} 
                            stroke={viewMode === 'consumers' ? '#ef4444' : '#eab308'} 
                            fillOpacity={1} 
                            fill={viewMode === 'consumers' ? 'url(#colorOff)' : 'url(#colorCost)'} 
                            isAnimationActive={false}
                            dot={<CustomizedDot onClick={onPointClick} />}
                        />
                        <ReferenceLine 
                            x={currentDay} 
                            stroke="#fff" 
                            strokeDasharray="3 3" 
                            label={{ 
                                value: 'Active', 
                                position: 'insideTop', 
                                fill: '#fff', 
                                fontSize: 10 
                            }} 
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
            {onPointClick && (
                <div className="absolute bottom-2 right-2 text-[10px] text-slate-500 italic pointer-events-none">
                    * Click red points for details
                </div>
            )}
        </div>
    );
};
