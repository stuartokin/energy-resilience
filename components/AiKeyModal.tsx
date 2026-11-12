import React, { useState } from 'react';
import { SparklesIcon, XMarkIcon, CheckCircleIcon, KeyIcon } from '@heroicons/react/24/solid';
import { getAiKey, setAiKey, clearAiKey } from '../services/aiKey';

interface Props {
    onClose: () => void;
}

const AiKeyModal: React.FC<Props> = ({ onClose }) => {
    const existing = getAiKey();
    const [value, setValue] = useState('');
    const [saved, setSaved] = useState(false);
    const [show, setShow] = useState(false);

    const save = () => {
        if (!value.trim()) return;
        setAiKey(value);
        setValue('');
        setSaved(true);
        setTimeout(onClose, 900);
    };

    const masked = existing ? `${existing.slice(0, 4)}••••••••${existing.slice(-4)}` : '';

    return (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={onClose}>
            <div
                className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden"
                onClick={e => e.stopPropagation()}
                role="dialog"
                aria-labelledby="ai-key-title"
            >
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                        <SparklesIcon className="w-5 h-5 text-cyan-400" />
                        <h2 id="ai-key-title" className="font-bold text-white">Turn on AI features</h2>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white" aria-label="Close"><XMarkIcon className="w-5 h-5" /></button>
                </div>

                <div className="p-5 space-y-4 text-sm text-slate-300">
                    <p>
                        The map, live grid data and built-in scenarios work without this. To use the AI analyst,
                        generated scenarios, live outage search and reports, add your own free Gemini key.
                    </p>

                    <ol className="space-y-2 list-decimal list-inside marker:text-cyan-400 marker:font-bold">
                        <li>
                            Open{' '}
                            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-cyan-400 underline hover:text-cyan-300">
                                Google AI Studio → Get API key
                            </a>{' '}
                            and sign in with a Google account.
                        </li>
                        <li>Click <b>Create API key</b> and copy it.</li>
                        <li>Paste it below and click <b>Save</b>.</li>
                    </ol>

                    {existing && !saved && (
                        <div className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
                            <span className="flex items-center gap-2 text-xs"><CheckCircleIcon className="w-4 h-4 text-green-500" /> Key saved: <code className="text-slate-400">{masked}</code></span>
                            <button onClick={() => { clearAiKey(); onClose(); }} className="text-xs text-red-400 hover:text-red-300 font-bold">Remove</button>
                        </div>
                    )}

                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <KeyIcon className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                                type={show ? 'text' : 'password'}
                                value={value}
                                onChange={e => setValue(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && save()}
                                placeholder={existing ? 'Paste a new key to replace it' : 'Paste your Gemini API key'}
                                autoComplete="off"
                                spellCheck={false}
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-14 py-2 text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-500"
                            />
                            <button onClick={() => setShow(s => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] uppercase font-bold text-slate-500 hover:text-slate-300">{show ? 'Hide' : 'Show'}</button>
                        </div>
                        <button onClick={save} disabled={!value.trim()} className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold">
                            {saved ? 'Saved' : 'Save'}
                        </button>
                    </div>

                    <div className="text-xs text-slate-500 bg-slate-950/60 border border-slate-800 rounded-lg p-3 space-y-1">
                        <p><b className="text-slate-400">Private:</b> your key is stored only in this browser and is sent only to Google. It is never shared with this site's owner.</p>
                        <p><b className="text-slate-400">Cost:</b> Google's free tier covers normal use. Video reports need a paid key.</p>
                        <p><b className="text-slate-400">Shared computer?</b> Click <i>Remove</i> when you've finished.</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AiKeyModal;
