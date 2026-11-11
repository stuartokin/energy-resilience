
import React, { useState, useEffect } from 'react';
import { XMarkIcon, ChevronRightIcon, ChevronLeftIcon } from '@heroicons/react/24/solid';
import { TOUR_SCRIPTS } from '../services/geminiService';

interface TourGuideProps {
    onClose: () => void;
    onStepChange?: (step: string) => void;
}

const STEPS = [
    { key: 'intro', title: 'Welcome to Resilience' },
    { key: 'asset_info', title: 'Asset Intelligence' },
    { key: 'scenarios', title: 'Running Simulations' },
    { key: 'timeline', title: 'Impact Timeline' },
    { key: 'analyst', title: 'AI Analyst Assistant' },
    { key: 'reports', title: 'Multimedia Reporting' },
    { key: 'supply_chain', title: 'Supply Chain Analysis' },
    { key: 'help', title: 'Help & Support' }
];

const TourGuide: React.FC<TourGuideProps> = ({ onClose, onStepChange }) => {
    const [currentStep, setCurrentStep] = useState(0);

    useEffect(() => {
        if (onStepChange) {
            onStepChange(STEPS[currentStep].key);
        }
    }, [currentStep, onStepChange]);

    const handleNext = () => {
        if (currentStep < STEPS.length - 1) setCurrentStep(prev => prev + 1);
        else onClose();
    };

    const handlePrev = () => {
        if (currentStep > 0) setCurrentStep(prev => prev - 1);
    };

    const stepData = STEPS[currentStep];
    const content = TOUR_SCRIPTS[stepData.key] || TOUR_SCRIPTS['intro'];

    return (
        <div className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-cyan-500/50 rounded-xl shadow-2xl max-w-lg w-full p-6 relative animate-fadeIn">
                <button onClick={onClose} className="absolute top-4 right-4 text-slate-500 hover:text-white">
                    <XMarkIcon className="w-6 h-6" />
                </button>

                <div className="mb-6">
                    <span className="text-xs font-bold text-cyan-400 uppercase tracking-widest">Tour: Step {currentStep + 1} of {STEPS.length}</span>
                    <h2 className="text-2xl font-bold text-white mt-2">{stepData.title}</h2>
                </div>

                <div className="min-h-[100px] text-slate-300 text-sm leading-relaxed mb-8">
                    {content}
                </div>

                <div className="flex justify-between items-center">
                    <div className="flex gap-1">
                        {STEPS.map((_, i) => (
                            <div key={i} className={`h-1.5 rounded-full transition-all ${i === currentStep ? 'w-6 bg-cyan-500' : 'w-1.5 bg-slate-700'}`} />
                        ))}
                    </div>
                    <div className="flex gap-2">
                        <button 
                            onClick={handlePrev} 
                            disabled={currentStep === 0}
                            className="px-4 py-2 rounded bg-slate-800 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-700 transition-colors"
                        >
                            <ChevronLeftIcon className="w-5 h-5" />
                        </button>
                        <button 
                            onClick={handleNext}
                            className="px-6 py-2 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-bold flex items-center gap-2 transition-colors"
                        >
                            {currentStep === STEPS.length - 1 ? 'Finish' : 'Next'}
                            {currentStep !== STEPS.length - 1 && <ChevronRightIcon className="w-4 h-4" />}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TourGuide;
