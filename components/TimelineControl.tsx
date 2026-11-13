// Timeline under the map while a scenario runs: play, scrub, speed, markers for captions, and Clear.
import React from 'react';
import { PlayIcon, PauseIcon, BackwardIcon, ForwardIcon, ArrowPathIcon, XMarkIcon } from '@heroicons/react/24/solid';

interface TimelineControlProps {
    currentDay: number;
    totalDays: number;
    isPlaying: boolean;
    playbackSpeed: number;
    onPlayPause: () => void;
    onSeek: (day: number) => void;
    onSpeedChange: (speed: number) => void;
    labels?: string[];                          // per-step labels, e.g. "Hour 6" or "Day 2"
    marks?: { step: number; text: string }[];   // caption markers along the track
    onClear?: () => void;                       // clear the scenario and close the timeline
}

const TimelineControl: React.FC<TimelineControlProps> = ({ currentDay, totalDays, isPlaying, playbackSpeed, onPlayPause, onSeek, onSpeedChange, labels, marks = [], onClear }) => {
    const pct = (i: number) => (totalDays > 0 ? (i / totalDays) * 100 : 0);
    return (
        <div className="bg-slate-900 px-3 sm:px-4 py-2.5 flex items-center gap-2 sm:gap-4">
            <button type="button" onClick={onPlayPause} aria-label={isPlaying ? 'Pause' : 'Play'}
                className="flex-none w-10 h-10 bg-cyan-600 hover:bg-cyan-500 rounded-full flex items-center justify-center text-white shadow-lg">
                {isPlaying ? <PauseIcon className="w-5 h-5" /> : <PlayIcon className="w-5 h-5 ml-0.5" />}
            </button>

            <div className="flex-1 min-w-0 flex flex-col gap-1">
                <div className="flex justify-between text-[11px] text-slate-400 font-mono">
                    <span className="hidden sm:inline">{labels?.[0] || 'Start'}</span>
                    <span className="text-white font-bold">{labels?.[currentDay] || `Step ${currentDay}`}</span>
                    <span className="hidden sm:inline">{labels?.[totalDays] || `Step ${totalDays}`}</span>
                </div>
                <div className="relative">
                    <input type="range" min={0} max={totalDays} value={currentDay} aria-label="Timeline position"
                        onChange={(e) => onSeek(parseInt(e.target.value))}
                        className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500 hover:accent-cyan-400" />
                    {/* Caption markers: click to jump */}
                    <div className="absolute inset-x-0 -bottom-1.5 h-2 pointer-events-none">
                        {marks.map((m, i) => (
                            <button key={i} type="button" onClick={() => onSeek(m.step)} title={m.text} aria-label={`Jump to: ${m.text}`}
                                className="absolute w-2 h-2 -ml-1 rounded-full bg-red-400 border border-slate-900 pointer-events-auto hover:scale-150 transition-transform"
                                style={{ left: `${pct(m.step)}%` }} />
                        ))}
                    </div>
                </div>
            </div>

            <div className="flex-none flex items-center gap-1 sm:gap-2">
                <div className="hidden sm:flex bg-slate-800 rounded-lg p-0.5 mr-1" role="group" aria-label="Playback speed">
                    {[1, 2, 5].map(speed => (
                        <button key={speed} type="button" onClick={() => onSpeedChange(speed)} aria-pressed={playbackSpeed === speed}
                            className={`px-2 py-1 text-[10px] font-bold rounded transition-colors ${playbackSpeed === speed ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                            {speed}x
                        </button>
                    ))}
                </div>
                <button type="button" onClick={() => onSeek(0)} className="hidden sm:block p-2 text-slate-400 hover:text-white" title="Back to the start" aria-label="Back to the start"><ArrowPathIcon className="w-5 h-5" /></button>
                <button type="button" onClick={() => onSeek(Math.max(0, currentDay - 1))} className="p-1.5 sm:p-2 text-slate-400 hover:text-white" aria-label="Step back"><BackwardIcon className="w-5 h-5" /></button>
                <button type="button" onClick={() => onSeek(Math.min(totalDays, currentDay + 1))} className="p-1.5 sm:p-2 text-slate-400 hover:text-white" aria-label="Step forward"><ForwardIcon className="w-5 h-5" /></button>
                {onClear && (
                    <button type="button" onClick={onClear} title="Clear the scenario and close the timeline"
                        className="ml-1 flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-lg border border-red-900 text-red-300 hover:text-white hover:bg-red-950 text-[11px] font-semibold">
                        <XMarkIcon className="w-4 h-4" /><span className="hidden sm:inline">Clear</span>
                    </button>
                )}
            </div>
        </div>
    );
};

export default React.memo(TimelineControl);
