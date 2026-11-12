
import React, { useState, useRef, useEffect } from 'react';
import { PaperAirplaneIcon, SparklesIcon, UserIcon, CpuChipIcon, ClipboardDocumentIcon, CheckIcon, LightBulbIcon, ChevronDownIcon } from '@heroicons/react/24/solid';

// Questions an energy analyst typically asks. The Analyst answers from the live data the app passes it,
// and says when it is going beyond that data.
const SUGGESTED: { group: string, questions: string[], needsScenario?: boolean }[] = [
    { group: 'Right now', questions: [
        'Give me a five-line briefing on the GB energy system right now.',
        'How tight is the electricity system right now, and what is driving it?',
        'What is the current generation mix telling us? Is anything unusual for this time of day and year?',
        'Is system frequency behaving normally? What would make you concerned?',
    ] },
    { group: 'Security of supply', questions: [
        'What is the largest single loss the system is exposed to right now, and how would the system cope if it tripped?',
        'Which generator outages matter most for security of supply right now, and why?',
        'Are there any NESO system notices in force? What do they mean in plain English?',
        'If the wind dropped sharply in the next few hours, where would the replacement power come from?',
    ] },
    { group: 'Gas and imports', questions: [
        'How dependent is GB on imports right now, for electricity and for gas?',
        'Where is our gas coming from right now, and what would happen if the Langeled pipeline tripped?',
        'Is NTS linepack healthy, and how much gas are power stations drawing?',
        'Which interconnectors are exporting, and what usually causes that?',
    ] },
    { group: 'Networks and weather', questions: [
        'Summarise the current power cuts by network operator. Is anything unusual?',
        'Do any current weather or flood warnings affect important energy sites?',
        'Which regions have the highest carbon intensity right now, and why?',
    ] },
    { group: 'This scenario', needsScenario: true, questions: [
        'Explain the impact figures for this scenario and the assumptions behind them.',
        'What are the three most effective mitigations for this scenario?',
        'How would restoration be prioritised in this scenario, and who would lead it?',
        'Which real past events is this scenario most like, and what did we learn from them?',
    ] },
];

import { ChatMessage, RiskScenario, OutageEvent, GenerationMix } from '../types';
import { chatWithAnalyst } from '../services/geminiService';

interface ChatPanelProps {
    isOpen: boolean;
    activeScenarios: RiskScenario[];
    assetCount: number; // Optimization: Pass count only
    regionName: string;
    nesoData: { demand: number, frequency: number, carbonIntensity: number, estimated?: boolean };
    outages: OutageEvent[];
    onMapAction: (lat: number, lng: number, zoom: number) => void;
    generationMix?: GenerationMix | null;
    timelineNow?: string;
    generatorOutagesSummary?: string;
    liveSystemsSummary?: string;
    systemWarningsSummary?: string;
}

const ChatPanel: React.FC<ChatPanelProps> = ({ isOpen, activeScenarios, assetCount, regionName, nesoData, outages, onMapAction, generationMix, timelineNow, generatorOutagesSummary, liveSystemsSummary, systemWarningsSummary }) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
    
    // Initialize welcome message
    useEffect(() => {
        if (messages.length === 0) {
            const scenarioText = activeScenarios.length > 0 
                ? `the active ${activeScenarios.length > 1 ? `composite event (${activeScenarios.length} scenarios)` : `"${activeScenarios[0].name}" scenario`}`
                : 'potential risks';
                
            setMessages([{
                role: 'model',
                text: `Hello! I'm your Energy Resilience Analyst. I can help assess grid stability and discuss the impact of ${scenarioText} on the ${regionName} infrastructure. What would you like to know?`,
                timestamp: Date.now()
            }]);
        }
    }, [activeScenarios, regionName]);

    const [inputValue, setInputValue] = useState("");
    const [isTyping, setIsTyping] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, isOpen]);

    const [showSuggestions, setShowSuggestions] = useState(true);
    const groups = SUGGESTED.filter(g => !g.needsScenario || activeScenarios.length > 0);
    const [group, setGroup] = useState(groups[0].group);
    useEffect(() => { if (activeScenarios.length > 0) setGroup('This scenario'); }, [activeScenarios.length]);
    const activeGroup = groups.find(g => g.group === group) || groups[0];

    const handleSend = async (e?: React.FormEvent, preset?: string) => {
        e?.preventDefault();
        const text = (preset ?? inputValue).trim();
        if (!text || isTyping) return;
        setShowSuggestions(false);

        const userMsg: ChatMessage = { role: 'user', text, timestamp: Date.now() };
        setMessages(prev => [...prev, userMsg]);
        setInputValue("");
        setIsTyping(true);

        const context = {
            region: regionName,
            scenarios: activeScenarios,
            assetCount: assetCount,
            nesoData: nesoData,
            generationMix: generationMix ? generationMix.generation.map(g => `${g.fuel} ${g.perc}%`).join(', ') : '',
            timelineNow: timelineNow || '',
            generatorOutages: generatorOutagesSummary || '',
            liveSystems: liveSystemsSummary || '',
            systemWarnings: systemWarningsSummary || '',
            outageCount: outages.length,
            activeOutages: outages.slice(0, 25).map(o => `${o.locationName} (${o.source}): ${String(o.description).slice(0, 80)}, ${o.consumersAffected || 'unknown'} customers, status ${o.status}`).join("; ")
        };

        const response = await chatWithAnalyst(messages, context, userMsg.text);
        
        // Handle Map Tool Action
        if (response.toolCall && response.toolCall.name === 'moveMap') {
            const args = response.toolCall.args as any;
            if (args.lat && args.lng && args.zoom) {
                onMapAction(args.lat, args.lng, args.zoom);
            }
        }

        setMessages(prev => [...prev, {
            role: 'model',
            text: response.text,
            timestamp: Date.now()
        }]);
        setIsTyping(false);
    };

    const handleCopy = (text: string, index: number) => {
        navigator.clipboard.writeText(text);
        setCopiedIndex(index);
        setTimeout(() => setCopiedIndex(null), 2000);
    };

    if (!isOpen) return null;

    return (
        <div className="w-full h-full flex flex-col overflow-hidden bg-slate-900 border border-cyan-500/50 rounded-2xl shadow-2xl backdrop-blur-md">
            {/* Header */}
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex justify-between items-center shrink-0 cursor-move" id="chat-header">
                <div className="flex items-center gap-2 text-cyan-400">
                    <SparklesIcon className="w-5 h-5" />
                    <h3 className="font-bold text-sm">Analyst AI</h3>
                </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-900/50 custom-scrollbar">
                {messages.map((msg, idx) => (
                    <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        {msg.role === 'model' && (
                            <div className="w-8 h-8 rounded-full bg-cyan-900/50 border border-cyan-500/30 flex items-center justify-center shrink-0 mt-1">
                                <CpuChipIcon className="w-4 h-4 text-cyan-400" />
                            </div>
                        )}
                        <div className={`max-w-[80%] relative group`}>
                            <div className={`p-3 rounded-xl text-xs leading-relaxed whitespace-pre-wrap break-words ${
                                msg.role === 'user' 
                                ? 'bg-cyan-600 text-white rounded-br-none' 
                                : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-bl-none'
                            }`}>
                                {msg.text}
                            </div>
                            {/* Copy Button */}
                            <button 
                                onClick={() => handleCopy(msg.text, idx)}
                                className={`absolute ${msg.role === 'user' ? '-left-8' : '-right-8'} top-2 p-1.5 rounded-full bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 opacity-0 group-hover:opacity-100 transition-opacity`}
                                title="Copy Text"
                            >
                                {copiedIndex === idx ? <CheckIcon className="w-3 h-3 text-green-400" /> : <ClipboardDocumentIcon className="w-3 h-3" />}
                            </button>
                        </div>
                        {msg.role === 'user' && (
                            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center shrink-0 mt-1">
                                <UserIcon className="w-4 h-4 text-slate-300" />
                            </div>
                        )}
                    </div>
                ))}
                {isTyping && (
                    <div className="flex gap-3 justify-start animate-pulse">
                         <div className="w-8 h-8 rounded-full bg-cyan-900/50 border border-cyan-500/30 flex items-center justify-center shrink-0">
                            <CpuChipIcon className="w-4 h-4 text-cyan-400" />
                        </div>
                        <div className="bg-slate-800 p-3 rounded-xl rounded-bl-none border border-slate-700">
                            <div className="flex gap-1">
                                <div className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{animationDelay: '0s'}}></div>
                                <div className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                                <div className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{animationDelay: '0.4s'}}></div>
                            </div>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Suggested questions */}
            <div className="bg-slate-950 border-t border-slate-800 shrink-0">
                <button type="button" onClick={() => setShowSuggestions(v => !v)} className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-300 hover:text-amber-200">
                    <span className="flex items-center gap-1"><LightBulbIcon className="w-3 h-3" /> Suggested questions</span>
                    <ChevronDownIcon className={`w-3 h-3 transition-transform ${showSuggestions ? '' : 'rotate-180'}`} />
                </button>
                {showSuggestions && (
                    <div className="px-3 pb-2">
                        <div className="flex flex-wrap gap-1 mb-1.5">
                            {groups.map(g => (
                                <button key={g.group} type="button" onClick={() => setGroup(g.group)} className={`px-2 py-0.5 rounded-full text-[10px] border ${activeGroup.group === g.group ? 'bg-cyan-900/50 border-cyan-500 text-cyan-200' : 'border-slate-700 text-slate-400 hover:text-white'}`}>{g.group}</button>
                            ))}
                        </div>
                        <div className="flex flex-col gap-1 max-h-40 overflow-y-auto custom-scrollbar">
                            {activeGroup.questions.map(q => (
                                <button key={q} type="button" disabled={isTyping} onClick={() => handleSend(undefined, q)} className="text-left text-[11px] leading-snug px-2 py-1 rounded bg-slate-800/70 hover:bg-slate-700 text-slate-200 border border-slate-700 disabled:opacity-50">{q}</button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Input Area */}
            <form onSubmit={handleSend} className="p-3 bg-slate-950 border-t border-slate-800 shrink-0">
                <div className="relative">
                    <input 
                        type="text" 
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder="Ask about the data..."
                        className="w-full bg-slate-800 text-white text-sm rounded-full pl-4 pr-10 py-2.5 outline-none border border-slate-700 focus:border-cyan-500 transition-colors placeholder:text-slate-500"
                    />
                    <button 
                        type="submit" 
                        disabled={!inputValue.trim() || isTyping}
                        className="absolute right-1.5 top-1.5 p-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <PaperAirplaneIcon className="w-4 h-4" />
                    </button>
                </div>
            </form>
        </div>
    );
};

export default React.memo(ChatPanel);
