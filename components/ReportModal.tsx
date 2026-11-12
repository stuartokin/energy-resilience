import React, { useRef, useEffect, useState } from 'react';
import { XMarkIcon, PlayIcon, PauseIcon, SpeakerWaveIcon, DocumentTextIcon, ForwardIcon, BackwardIcon } from '@heroicons/react/24/solid';

interface ReportModalProps {
    onClose: () => void;
    script: string;
    audioUrl: string | null;
    images: string[];
    scenarioName: string;
}

const cleanScript = (text: string) => {
    return text
        .replace(/\*\*/g, '')
        .replace(/EXECUTIVE SUMMARY:|SCENARIO ANALYSIS:|CREDIBILITY & SOURCES:|PROJECTED IMPACT:|\[.*?\]/g, '')
        .trim();
};

const ReportModal: React.FC<ReportModalProps> = ({ onClose, script, audioUrl, images, scenarioName }) => {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);

    const togglePlay = () => {
        if (audioRef.current) {
            if (isPlaying) audioRef.current.pause();
            else audioRef.current.play();
            setIsPlaying(!isPlaying);
        }
    };

    const handleSkip = (seconds: number) => {
        if (audioRef.current) {
            audioRef.current.currentTime += seconds;
        }
    };

    const handleTimeUpdate = () => {
        if (audioRef.current) {
            const pct = (audioRef.current.currentTime / audioRef.current.duration) * 100;
            setProgress(pct || 0);
        }
    };

    // We don't want to aggressively strip the headers for the visual transcript view, 
    // only the markdown bolding, to keep the structure visible for the user reading it.
    const displayScript = script.replace(/\*\*/g, '');

    return (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn" onClick={onClose}>
            <div 
                className="bg-slate-900 border border-cyan-500/50 rounded-xl w-full max-w-4xl shadow-2xl relative flex flex-col max-h-[90vh] overflow-hidden" 
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="bg-cyan-600 text-white px-2 py-0.5 text-xs font-bold uppercase rounded">Risk Assessment</div>
                        <h2 className="text-lg font-bold text-white">{scenarioName}</h2>
                    </div>
                    <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 flex flex-col md:flex-row gap-6">
                    {/* Visuals Column */}
                    <div className="w-full md:w-1/2 flex flex-col gap-4">
                        <div className="aspect-video bg-black rounded-lg overflow-hidden border border-slate-700 relative shadow-lg group">
                            {images.length > 0 ? (
                                <img src={images[0]} alt="Scenario Visualization" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-slate-600">No Signal</div>
                            )}
                            
                            {/* Audio Overlay Controls */}
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/20 hover:bg-black/40 transition-colors">
                                <div className="flex items-center gap-4">
                                     <button 
                                        onClick={() => handleSkip(-10)}
                                        className="p-2 rounded-full bg-slate-900/80 text-white hover:bg-cyan-600 transition-colors"
                                        title="Rewind 10s"
                                    >
                                        <BackwardIcon className="w-6 h-6" />
                                    </button>
                                    <button 
                                        onClick={togglePlay}
                                        className="w-16 h-16 bg-cyan-600/90 hover:bg-cyan-500 text-white rounded-full flex items-center justify-center backdrop-blur-sm shadow-[0_0_20px_rgba(8,145,178,0.5)] transition-transform hover:scale-110 active:scale-95"
                                    >
                                        {isPlaying ? <PauseIcon className="w-8 h-8" /> : <PlayIcon className="w-8 h-8 ml-1" />}
                                    </button>
                                     <button 
                                        onClick={() => handleSkip(10)}
                                        className="p-2 rounded-full bg-slate-900/80 text-white hover:bg-cyan-600 transition-colors"
                                        title="Forward 10s"
                                    >
                                        <ForwardIcon className="w-6 h-6" />
                                    </button>
                                </div>
                            </div>
                            
                            {/* Audio Element */}
                            {audioUrl && (
                                <audio 
                                    ref={audioRef} 
                                    src={audioUrl} 
                                    onEnded={() => setIsPlaying(false)} 
                                    onPlay={() => setIsPlaying(true)}
                                    onPause={() => setIsPlaying(false)}
                                    onTimeUpdate={handleTimeUpdate}
                                />
                            )}
                            
                            {/* Progress Bar */}
                            <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-800">
                                <div className="h-full bg-cyan-500 transition-all duration-100" style={{ width: `${progress}%` }}></div>
                            </div>
                        </div>

                        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                             <h3 className="text-xs font-bold text-cyan-400 uppercase mb-2 flex items-center gap-2">
                                <SpeakerWaveIcon className="w-4 h-4" /> Audio Channel
                             </h3>
                             <div className="flex items-center gap-3">
                                <div className="flex-1 h-8 bg-slate-900 rounded overflow-hidden flex items-center px-2 gap-1">
                                    {[...Array(20)].map((_, i) => (
                                        <div 
                                            key={i} 
                                            className={`w-1 bg-cyan-500 rounded-full transition-all duration-75`}
                                            style={{
                                                height: isPlaying ? `${Math.random() * 100}%` : '20%',
                                                opacity: isPlaying ? 1 : 0.3
                                            }}
                                        />
                                    ))}
                                </div>
                                <span className="text-xs font-mono text-slate-400">{isPlaying ? "PLAYING" : "READY"}</span>
                             </div>
                        </div>
                    </div>

                    {/* Script Column */}
                    <div className="w-full md:w-1/2 bg-slate-950 border border-slate-800 rounded-lg p-6 overflow-y-auto max-h-[500px] shadow-inner">
                        <h3 className="text-xs font-bold text-slate-500 uppercase mb-4 flex items-center gap-2 border-b border-slate-800 pb-2">
                            <DocumentTextIcon className="w-4 h-4" /> Formal Risk Assessment
                        </h3>
                        <div className="prose prose-invert prose-sm font-serif leading-relaxed whitespace-pre-line text-slate-300">
                            {displayScript || "Generating assessment..."}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ReportModal;