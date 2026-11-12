
import React from 'react';
import { PlayIcon, PauseIcon, BackwardIcon, ForwardIcon, ArrowPathIcon } from '@heroicons/react/24/solid';

interface TimelineControlProps {
    currentDay: number;
    totalDays: number;
    isPlaying: boolean;
    playbackSpeed: number;
    onPlayPause: () => void;
    onSeek: (day: number) => void;
    onSpeedChange: (speed: number) => void;
    labels?: string[]; // per-step labels, e.g. "Hour 6" or "Day 2"
}

const TimelineControl: React.FC<TimelineControlProps> = ({ currentDay, totalDays, isPlaying, playbackSpeed, onPlayPause, onSeek, onSpeedChange, labels }) => {
    return (
        <div className="bg-slate-900 border-t border-slate-800 p-4 flex items-center gap-4">
            <button 
                onClick={onPlayPause}
                className="flex-none w-10 h-10 bg-cyan-600 hover:bg-cyan-500 rounded-full flex items-center justify-center text-white shadow-lg shadow-cyan-900/20 transition-all"
            >
                {isPlaying ? <PauseIcon className="w-5 h-5" /> : <PlayIcon className="w-5 h-5 ml-0.5" />}
            </button>
            
            <div className="flex-1 flex flex-col gap-1">
                <div className="flex justify-between text-xs text-slate-400 font-mono">
                    <span>{labels?.[0] || 'Day 0'}</span>
                    <span className="text-white font-bold">{labels?.[currentDay] || `Day ${currentDay}`}</span>
                    <span>{labels?.[totalDays] || `Day ${totalDays}`}</span>
                </div>
                <input 
                    type="range" 
                    min={0} 
                    max={totalDays} 
                    value={currentDay}
                    onChange={(e) => onSeek(parseInt(e.target.value))}
                    className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500 hover:accent-cyan-400"
                />
            </div>

            <div className="flex-none flex items-center gap-2">
                <div className="flex bg-slate-800 rounded-lg p-0.5 mr-2">
                    {[1, 2, 5].map(speed => (
                        <button
                            key={speed}
                            onClick={() => onSpeedChange(speed)}
                            className={`px-2 py-1 text-[10px] font-bold rounded transition-colors ${playbackSpeed === speed ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'}`}
                        >
                            {speed}x
                        </button>
                    ))}
                </div>

                 <button 
                    onClick={() => onSeek(0)} 
                    className="p-2 text-slate-400 hover:text-white"
                    title="Restart Simulation"
                >
                    <ArrowPathIcon className="w-5 h-5" />
                </button>
                <button onClick={() => onSeek(Math.max(0, currentDay - 1))} className="p-2 text-slate-400 hover:text-white"><BackwardIcon className="w-5 h-5" /></button>
                <button onClick={() => onSeek(Math.min(totalDays, currentDay + 1))} className="p-2 text-slate-400 hover:text-white"><ForwardIcon className="w-5 h-5" /></button>
            </div>
        </div>
    );
};

export default React.memo(TimelineControl);
