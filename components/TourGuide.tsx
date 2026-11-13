// Guided tour. A small card in the corner (it doesn't cover the app), and each step opens the part of the
// app it talks about (App.tsx handleTourStep), so you see the real thing rather than a description.
import React, { useEffect, useRef, useState } from 'react';
import { XMarkIcon, ChevronRightIcon, ChevronLeftIcon } from '@heroicons/react/24/solid';

interface TourGuideProps {
    onClose: () => void;
    onStepChange?: (step: string) => void;
}

export const TOUR_STEPS: { key: string; title: string; text: string }[] = [
    { key: 'intro', title: 'Welcome',
      text: 'A live picture of the GB energy system from public open data, and "what if" scenarios to see how risks would play out. Every figure says where it comes from; anything modelled or AI-written is labelled.' },
    { key: 'live', title: 'Live mode: the system now',
      text: 'Overview shows demand, frequency, the generation mix, power cuts and energy flows, each with its source. Hatched areas on the map have no open live power-cut feed, so cuts there will not show.' },
    { key: 'map', title: 'The map',
      text: 'Zoom in for substations, lines, solar farms and batteries. Click a substation to see the lines and generators connected to it. Layers turns things on and off, including power cuts and generator outages.' },
    { key: 'flows', title: 'Energy flows',
      text: 'Electricity and gas coming into and out of GB, by route, on one GW scale. The moving dashes on the map show the direction of flow.' },
    { key: 'history', title: 'History and concentration',
      text: 'History charts what the system did over days and weeks, from snapshots the site takes every 15 minutes, including power cuts that have since been fixed. Concentration shows how much supply depends right now on one gas route, one link, one fuel or the weather.' },
    { key: 'library', title: 'Scenarios: choose',
      text: 'Pick one or more risks from the Library. "Why these numbers?" shows the real event and sources behind each one. Local events can be placed anywhere with "Place it on the map".' },
    { key: 'run', title: 'Scenarios: watch it play',
      text: 'The run starts with normal running, then the event hits. Areas losing power glow red, then go black; as supplies return they fade back. Captions tell the story; live power cuts and data centres are hidden so you can see the whole country. Clear (on the timeline or top bar) ends it.' },
    { key: 'results', title: 'Results',
      text: 'Customers off over time, the cost (energy not supplied × Value of Lost Load), and normal vs scenario. The shaded areas are illustrative, not a forecast of where cuts would fall.' },
    { key: 'ai', title: 'AI, clearly labelled',
      text: 'With your own free Gemini key, Analyst AI answers questions about the live system and the running scenario, and AI can propose new scenarios. AI never supplies the numbers: you choose a sourced scenario to model a proposal on.' },
    { key: 'report', title: 'Reports and video briefing',
      text: 'Create report builds a printable live or scenario report (save it as a PDF). Video briefing narrates a running scenario.' },
    { key: 'help', title: 'Help and System Status',
      text: 'Help has the map legend, the scenario model with every value and source, all data sources and licences, and System Status. "How it\'s built" (cube icon) shows how the parts fit together. Tools → Views saves your whole set-up to a file or link, and Present gives a full-screen map for talks.' },
];

const TourGuide: React.FC<TourGuideProps> = ({ onClose, onStepChange }) => {
    const [step, setStep] = useState(0);
    const cb = useRef(onStepChange);
    cb.current = onStepChange;
    useEffect(() => { cb.current?.(TOUR_STEPS[step].key); }, [step]);
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'ArrowRight') setStep(s => Math.min(TOUR_STEPS.length - 1, s + 1));
            if (e.key === 'ArrowLeft') setStep(s => Math.max(0, s - 1));
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const d = TOUR_STEPS[step];
    const last = step === TOUR_STEPS.length - 1;
    return (
        <div role="dialog" aria-label={`Tour: ${d.title}`} aria-live="polite"
            className="fixed z-[600] left-3 right-3 bottom-[4.5rem] sm:right-auto sm:left-20 sm:bottom-28 sm:w-[380px] bg-slate-900/97 border border-cyan-500/60 rounded-xl shadow-2xl p-4 animate-fadeIn">
            <button type="button" onClick={onClose} aria-label="Close the tour" className="absolute top-3 right-3 text-slate-500 hover:text-white"><XMarkIcon className="w-5 h-5" /></button>
            <div className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest">Tour · {step + 1} of {TOUR_STEPS.length}</div>
            <h2 className="text-lg font-bold text-white mt-1 pr-6">{d.title}</h2>
            <p className="text-[13px] text-slate-300 leading-relaxed mt-2">{d.text}</p>
            <div className="flex justify-between items-center mt-4">
                <div className="flex gap-1" aria-hidden="true">
                    {TOUR_STEPS.map((_, i) => <div key={i} className={`h-1.5 rounded-full transition-all ${i === step ? 'w-5 bg-cyan-500' : 'w-1.5 bg-slate-700'}`} />)}
                </div>
                <div className="flex gap-2">
                    <button type="button" onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0} aria-label="Previous step"
                        className="px-3 py-1.5 rounded-lg bg-slate-800 text-white disabled:opacity-40 hover:bg-slate-700"><ChevronLeftIcon className="w-4 h-4" /></button>
                    <button type="button" onClick={() => (last ? onClose() : setStep(s => s + 1))}
                        className="px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-bold flex items-center gap-1">
                        {last ? 'Finish' : 'Next'}{!last && <ChevronRightIcon className="w-4 h-4" />}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TourGuide;
