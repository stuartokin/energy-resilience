
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { RiskScenario, ScenarioLocation, RegionConfig } from '../types';
import { 
    PencilIcon, TrashIcon, DocumentDuplicateIcon, 
    ExclamationTriangleIcon, XMarkIcon, MagnifyingGlassIcon,
    ClockIcon, CheckCircleIcon, PlusIcon, SparklesIcon,
    MapPinIcon, ChartBarIcon, ArrowUpTrayIcon, FunnelIcon,
    LinkIcon, ArrowsPointingOutIcon, ArrowsPointingInIcon, GlobeAmericasIcon, ArrowDownTrayIcon
} from '@heroicons/react/24/solid';
import { generateCustomScenario, getCoordinatesForLocation } from '../services/geminiService';
import { PlayIcon } from '@heroicons/react/24/solid';

interface ScenarioManagerProps {
    scenarios: RiskScenario[];
    onRunSimulation: (selected: RiskScenario[], startMinimized: boolean) => void;
    onUpdateScenarios: (scenarios: RiskScenario[]) => void;
    onClose: () => void;
    onGenerateMore: () => void;
    onMapAction?: (lat: number, lng: number, zoom: number) => void;
    activeRegion?: RegionConfig;
}

// --- Sub-component: Editor ---

interface EditorProps {
    scenario: RiskScenario;
    onSave: (s: RiskScenario) => void;
    onCancel: () => void;
}

const ScenarioEditor: React.FC<EditorProps> = ({ scenario, onSave, onCancel }) => {
    const [formData, setFormData] = useState<RiskScenario>({ ...scenario });
    const [isLocating, setIsLocating] = useState(false);
    const [newLocation, setNewLocation] = useState({ name: '', lat: '', lng: '' });
    const [newSource, setNewSource] = useState('');

    const handleChange = (field: keyof RiskScenario, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleAutoLocate = async () => {
        setIsLocating(true);
        // Prioritize the name typed in "New Location", else fallback to scenario name
        const query = newLocation.name || formData.name + ", " + formData.region;
            
        const coords = await getCoordinatesForLocation(query);
        if (coords) {
            // Automatically add to the list
            const loc: ScenarioLocation = {
                name: query,
                lat: coords.lat,
                lng: coords.lng
            };
            
            const updatedLocs = [...(formData.locations || []), loc];
            
            setFormData(prev => ({
                ...prev,
                locations: updatedLocs,
                coordinates: coords // Also update main coordinates
            }));
            
            // Clear the input to show success
            setNewLocation({ name: '', lat: '', lng: '' });
        }
        setIsLocating(false);
    };

    const addLocation = () => {
        if (newLocation.name && newLocation.lat && newLocation.lng) {
            const loc: ScenarioLocation = {
                name: newLocation.name,
                lat: parseFloat(newLocation.lat),
                lng: parseFloat(newLocation.lng)
            };
            const updated = [...(formData.locations || []), loc];
            setFormData(prev => ({ ...prev, locations: updated }));
            setNewLocation({ name: '', lat: '', lng: '' });
        }
    };

    const removeLocation = (idx: number) => {
        const updated = formData.locations?.filter((_, i) => i !== idx) || [];
        setFormData(prev => ({ ...prev, locations: updated }));
    };

    const addSource = () => {
        if (newSource.trim()) {
            const updated = [...(formData.sources || []), newSource.trim()];
            setFormData(prev => ({ ...prev, sources: updated }));
            setNewSource('');
        }
    };

    const removeSource = (idx: number) => {
        const updated = formData.sources?.filter((_, i) => i !== idx) || [];
        setFormData(prev => ({ ...prev, sources: updated }));
    };

    return (
        <div className="bg-slate-950 p-5 rounded-xl border-2 border-slate-600 space-y-4 w-96 shadow-[0_0_100px_rgba(0,0,0,1)] h-[650px] overflow-y-auto custom-scrollbar ring-1 ring-white/10 flex flex-col">
            <h3 className="text-white font-bold flex items-center gap-2 border-b border-slate-700 pb-3 text-lg shrink-0 cursor-move">
                <PencilIcon className="w-5 h-5 text-cyan-400" /> Edit Scenario
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-slate-400">Title</label>
                    <input 
                        type="text" 
                        value={formData.name} 
                        onChange={e => handleChange('name', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-white focus:border-cyan-500 outline-none focus:bg-slate-800"
                    />
                </div>
                <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-slate-400">Category</label>
                    <input 
                        list="categories"
                        value={formData.category} 
                        onChange={e => handleChange('category', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-white focus:border-cyan-500 outline-none focus:bg-slate-800"
                        placeholder="Select or Type..."
                    />
                    <datalist id="categories">
                        {['Storm', 'Cyber', 'Asset Failure', 'Supply Chain', 'Geopolitical', 'Growth'].map(c => (
                            <option key={c} value={c} />
                        ))}
                    </datalist>
                </div>
            </div>

            <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-400">Description</label>
                <textarea 
                    value={formData.description} 
                    onChange={e => handleChange('description', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-white focus:border-cyan-500 outline-none h-20 resize-none focus:bg-slate-800"
                />
            </div>

            <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-slate-400">Probability</label>
                    <select 
                        value={formData.probability} 
                        onChange={e => handleChange('probability', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-white focus:bg-slate-800"
                    >
                        {['Low', 'Medium', 'High'].map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
                <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-slate-400">Impact</label>
                    <select 
                        value={formData.impactLevel} 
                        onChange={e => handleChange('impactLevel', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-white focus:bg-slate-800"
                    >
                        {['Minor', 'Major', 'Critical'].map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
                <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-slate-400">Duration (Days)</label>
                    <input 
                        type="number" 
                        value={formData.durationDays} 
                        onChange={e => handleChange('durationDays', parseInt(e.target.value))}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-white focus:bg-slate-800"
                    />
                </div>
                 <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-slate-400">Peak Consumers</label>
                    <input 
                        type="number" 
                        value={formData.peakConsumersAffected} 
                        onChange={e => handleChange('peakConsumersAffected', parseInt(e.target.value))}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-white focus:bg-slate-800"
                    />
                </div>
            </div>

            {/* Locations Section */}
            <div className="space-y-2 border-t border-slate-700 pt-3">
                <div className="flex justify-between items-center">
                    <label className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                        <MapPinIcon className="w-3 h-3" /> Impact Locations
                    </label>
                    <button 
                        onClick={handleAutoLocate} 
                        disabled={isLocating} 
                        className="text-[10px] text-cyan-400 hover:text-white flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-800 border border-slate-800 hover:border-slate-600 transition-colors"
                        title="Auto-calculates lat/lng for the location name and adds it."
                    >
                        {isLocating ? <ArrowUpTrayIcon className="w-3 h-3 animate-spin" /> : <SparklesIcon className="w-3 h-3" />}
                        {isLocating ? 'Calculating...' : 'Auto-Detect & Add'}
                    </button>
                </div>
                <div className="space-y-1 max-h-24 overflow-y-auto custom-scrollbar bg-slate-900 rounded border border-slate-800 p-1">
                    {formData.locations?.length === 0 && <div className="text-xs text-slate-600 p-1 italic">No specific locations added.</div>}
                    {formData.locations?.map((loc, idx) => (
                        <div key={idx} className="flex justify-between items-center bg-black px-2 py-1 rounded text-xs text-slate-300 border border-slate-800">
                            <span>{loc.name} <span className="text-slate-500 text-[10px]">({loc.lat.toFixed(2)}, {loc.lng.toFixed(2)})</span></span>
                            <button onClick={() => removeLocation(idx)} className="text-red-500 hover:text-red-400"><XMarkIcon className="w-3 h-3" /></button>
                        </div>
                    ))}
                </div>
                <div className="flex gap-2">
                    <input type="text" placeholder="Location Name" value={newLocation.name} onChange={e => setNewLocation({...newLocation, name: e.target.value})} className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:bg-slate-800" />
                    <input type="text" placeholder="Lat" value={newLocation.lat} onChange={e => setNewLocation({...newLocation, lat: e.target.value})} className="w-16 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:bg-slate-800" />
                    <input type="text" placeholder="Lng" value={newLocation.lng} onChange={e => setNewLocation({...newLocation, lng: e.target.value})} className="w-16 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:bg-slate-800" />
                    <button onClick={addLocation} className="bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white rounded px-2 py-1"><PlusIcon className="w-3 h-3" /></button>
                </div>
            </div>

            {/* Sources Section */}
            <div className="space-y-2 border-t border-slate-700 pt-3">
                <label className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                    <LinkIcon className="w-3 h-3" /> Information Sources
                </label>
                <div className="space-y-1 max-h-20 overflow-y-auto custom-scrollbar bg-slate-900 rounded border border-slate-800 p-1">
                    {formData.sources?.length === 0 && <div className="text-xs text-slate-600 p-1 italic">No sources cited.</div>}
                    {formData.sources?.map((src, idx) => (
                        <div key={idx} className="flex justify-between items-center bg-black px-2 py-1 rounded text-xs text-slate-300 border border-slate-800">
                            <span className="truncate w-11/12">{src}</span>
                            <button onClick={() => removeSource(idx)} className="text-red-500 hover:text-red-400"><XMarkIcon className="w-3 h-3" /></button>
                        </div>
                    ))}
                </div>
                <div className="flex gap-2">
                    <input 
                        type="text" 
                        placeholder="Add Source URL or Citation" 
                        value={newSource} 
                        onChange={e => setNewSource(e.target.value)} 
                        className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:bg-slate-800" 
                    />
                    <button onClick={addSource} className="bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white rounded px-2 py-1"><PlusIcon className="w-3 h-3" /></button>
                </div>
            </div>

            <div className="flex justify-end items-center pt-4 gap-2 border-t border-slate-700 mt-auto">
                <button onClick={onCancel} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded border border-slate-600">Cancel</button>
                <button onClick={() => onSave(formData)} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded shadow-lg shadow-cyan-900/50">Save Changes</button>
            </div>
        </div>
    );
};

// --- Main Component: ScenarioManager ---

const ScenarioManager: React.FC<ScenarioManagerProps> = ({ scenarios, onRunSimulation, onUpdateScenarios, onClose, onGenerateMore, onMapAction, activeRegion }) => {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [searchTerm, setSearchTerm] = useState("");
    const [filterCat, setFilterCat] = useState<string>("All");
    const [editingScenario, setEditingScenario] = useState<RiskScenario | null>(null);
    const [customPrompt, setCustomPrompt] = useState("");
    const [isGeneratingCustom, setIsGeneratingCustom] = useState(false);
    
    // Window State (Manager)
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [size, setSize] = useState({ w: 1000, h: 700 });
    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const [isMaximized, setIsMaximized] = useState(false);
    const [preMaxState, setPreMaxState] = useState<{x: number, y: number, w: number, h: number} | null>(null);
    const [isReady, setIsReady] = useState(false);
    
    // Editor State
    const [editorPosition, setEditorPosition] = useState({ x: 0, y: 0 });
    const [isEditorDragging, setIsEditorDragging] = useState(false);
    const editorDragRef = useRef<{ startX: number, startY: number, initialX: number, initialY: number } | null>(null);
    
    const panelRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<{ startX: number, startY: number, initialX: number, initialY: number, initialW: number, initialH: number } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const filtered = useMemo(() => {
        return scenarios.filter(s => {
            const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) || s.description.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesCat = filterCat === "All" || s.category === filterCat;
            return matchesSearch && matchesCat;
        });
    }, [scenarios, searchTerm, filterCat]);

    useEffect(() => {
        // Center Manager on Init
        const screenW = window.innerWidth;
        const screenH = window.innerHeight;
        const x = Math.max(0, (screenW - size.w) / 2);
        const y = Math.max(60, (screenH - size.h) / 2);
        setPosition({ x, y });
        
        // Center Editor on Init
        setEditorPosition({ x: screenW / 2 - 192, y: screenH / 2 - 325 }); // 192=half width, 325=half height
        
        setTimeout(() => setIsReady(true), 50);
    }, []);

    // --- Drag Handlers ---

    // Manager Drag
    const handleMouseDown = (e: React.MouseEvent) => {
        if (isMaximized) return;
        if ((e.target as HTMLElement).closest('button, input, textarea, select')) return;
        setIsDragging(true);
        dragRef.current = { 
            startX: e.clientX, startY: e.clientY, 
            initialX: position.x, initialY: position.y,
            initialW: size.w, initialH: size.h
        };
    };

    // Manager Resize
    const handleResizeMouseDown = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsResizing(true);
        dragRef.current = { 
            startX: e.clientX, startY: e.clientY, 
            initialX: position.x, initialY: position.y,
            initialW: size.w, initialH: size.h 
        };
    };

    // Editor Drag
    const handleEditorMouseDown = (e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest('button, input, textarea, select')) return;
        setIsEditorDragging(true);
        editorDragRef.current = {
            startX: e.clientX, startY: e.clientY,
            initialX: editorPosition.x, initialY: editorPosition.y
        };
    };

    // Global Mouse Movement
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            // Manager Drag
            if (isDragging && dragRef.current) {
                const dx = e.clientX - dragRef.current.startX;
                const dy = e.clientY - dragRef.current.startY;
                setPosition({ x: dragRef.current.initialX + dx, y: dragRef.current.initialY + dy });
            } 
            // Manager Resize
            else if (isResizing && dragRef.current) {
                const dx = e.clientX - dragRef.current.startX;
                const dy = e.clientY - dragRef.current.startY;
                const newW = Math.max(400, dragRef.current.initialW + dx);
                const newH = Math.max(300, dragRef.current.initialH + dy);
                setSize({ w: newW, h: newH });
            }
            // Editor Drag
            else if (isEditorDragging && editorDragRef.current) {
                const dx = e.clientX - editorDragRef.current.startX;
                const dy = e.clientY - editorDragRef.current.startY;
                setEditorPosition({ x: editorDragRef.current.initialX + dx, y: editorDragRef.current.initialY + dy });
            }
        };
        const handleMouseUp = () => {
            setIsDragging(false);
            setIsResizing(false);
            setIsEditorDragging(false);
        };

        if (isDragging || isResizing || isEditorDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, isResizing, isEditorDragging]);

    const toggleMaximize = () => {
        if (isMaximized && preMaxState) {
            setPosition({ x: preMaxState.x, y: preMaxState.y });
            setSize({ w: preMaxState.w, h: preMaxState.h });
            setIsMaximized(false);
        } else {
            setPreMaxState({ x: position.x, y: position.y, w: size.w, h: size.h });
            setPosition({ x: 20, y: 70 });
            setSize({ w: window.innerWidth - 40, h: window.innerHeight - 180 });
            setIsMaximized(true);
        }
    };

    const toggleSelection = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    const handleRun = () => {
        const selected = scenarios.filter(s => selectedIds.has(s.id));
        if (selected.length > 0) onRunSimulation(selected, false);
    };

    const handleDelete = (id: string) => {
        const updated = scenarios.filter(s => s.id !== id);
        onUpdateScenarios(updated);
        if (selectedIds.has(id)) {
            const next = new Set(selectedIds);
            next.delete(id);
            setSelectedIds(next);
        }
    };

    const handleSaveEdit = (updated: RiskScenario) => {
        const idx = scenarios.findIndex(s => s.id === updated.id);
        const next = [...scenarios];
        if (idx >= 0) {
            next[idx] = { ...updated, status: 'Updated' };
        } else {
            next.push({ ...updated, status: 'New' });
        }
        onUpdateScenarios(next);
        setEditingScenario(null);
    };

    const handleGenerateCustom = async () => {
        if (!customPrompt.trim()) return;
        setIsGeneratingCustom(true);
        const newScenario = await generateCustomScenario(customPrompt, activeRegion?.name || "UK");
        if (newScenario) {
            onUpdateScenarios([...scenarios, newScenario]);
            setCustomPrompt("");
        }
        setIsGeneratingCustom(false);
    };

    const createNew = () => {
        const newS: RiskScenario = {
            id: `user_${Date.now()}`,
            name: 'New Scenario',
            category: 'Cyber',
            description: 'Description of the event...',
            probability: 'Medium',
            impactLevel: 'Major',
            durationDays: 3,
            peakConsumersAffected: 10000,
            affectedAssets: [],
            region: activeRegion?.name || 'UK',
            narrative: '',
            status: 'User',
            isUserCreated: true
        };
        setEditingScenario(newS);
    };

    const handleExport = () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(scenarios, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", `scenarios_export_${new Date().toISOString().slice(0, 10)}.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    };

    const handleImportClick = () => fileInputRef.current?.click();

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const result = reader.result;
                if (typeof result === 'string') {
                    const imported = JSON.parse(result);
                    if (Array.isArray(imported)) {
                        const existingIds = new Set(scenarios.map(s => s.id));
                        const toAdd = imported.filter((s: RiskScenario) => !existingIds.has(s.id));
                        if (toAdd.length > 0) {
                            onUpdateScenarios([...scenarios, ...toAdd]);
                            alert(`Successfully imported ${toAdd.length} scenarios.`);
                        } else {
                            alert("No new scenarios found.");
                        }
                    }
                }
            } catch (err: any) {
                console.error(err);
                alert("Error reading file.");
            }
        };
        reader.readAsText(file);
        e.target.value = "";
    };

    return (
        <>
            <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleFileChange} />

            {/* Scenario Editor Pane (Fixed Position, High Z-Index) */}
            {editingScenario && (
                <div 
                    className="fixed z-[200] cursor-move"
                    style={{ left: editorPosition.x, top: editorPosition.y }}
                    onMouseDown={handleEditorMouseDown}
                >
                    <ScenarioEditor 
                        scenario={editingScenario} 
                        onSave={handleSaveEdit} 
                        onCancel={() => setEditingScenario(null)} 
                    />
                </div>
            )}

            {/* Main Manager Pane */}
            <div 
                ref={panelRef}
                className={`fixed z-[150] bg-slate-950 border border-slate-700 rounded-xl shadow-2xl shadow-black flex flex-col transition-all duration-150 ${isReady ? 'opacity-100' : 'opacity-0'} ${editingScenario ? 'pointer-events-none brightness-50' : ''}`}
                style={{ 
                    left: position.x, 
                    top: position.y,
                    width: size.w,
                    height: size.h,
                    maxWidth: '98vw',
                    maxHeight: '90vh'
                }}
            >
                {/* Header */}
                <div 
                    className={`p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950 rounded-t-xl shrink-0 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                    onMouseDown={handleMouseDown}
                >
                    <div>
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <ExclamationTriangleIcon className="w-6 h-6 text-red-500" />
                            Risk Scenario Manager
                        </h2>
                        <p className="text-xs text-slate-400">Select multiple scenarios to simulate composite events.</p>
                    </div>
                    <div className="flex items-center gap-1">
                        <button onClick={toggleMaximize} className="p-2 hover:bg-slate-800 rounded-lg transition-colors group text-slate-500 hover:text-white">
                            {isMaximized ? <ArrowsPointingInIcon className="w-5 h-5" /> : <ArrowsPointingOutIcon className="w-5 h-5" />}
                        </button>
                        <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-lg transition-colors group">
                            <XMarkIcon className="w-6 h-6 text-slate-500 group-hover:text-white" />
                        </button>
                    </div>
                </div>

                {/* Content Container */}
                <div className="flex-1 flex overflow-hidden">
                    {/* Sidebar Controls */}
                    <div className="w-64 bg-slate-950 border-r border-slate-800 p-4 flex flex-col gap-4 overflow-y-auto shrink-0">
                        
                        {/* Search & Filter */}
                        <div className="space-y-3">
                            <div className="relative">
                                <MagnifyingGlassIcon className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                                <input 
                                    type="text" 
                                    placeholder="Search scenarios..." 
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:border-cyan-500 outline-none"
                                />
                            </div>
                            <select 
                                value={filterCat} 
                                onChange={e => setFilterCat(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 outline-none"
                            >
                                <option value="All">All Categories</option>
                                <option value="Storm">Storm / Weather</option>
                                <option value="Cyber">Cyber Attack</option>
                                <option value="Asset Failure">Asset Failure</option>
                                <option value="Supply Chain">Supply Chain</option>
                                <option value="Geopolitical">Geopolitical</option>
                                <option value="Growth">Growth / Demand</option>
                            </select>
                        </div>

                        {/* AI Generator */}
                        <div className="bg-slate-900 rounded-lg p-3 border border-slate-800">
                            <h3 className="text-xs font-bold text-cyan-400 uppercase mb-2 flex items-center gap-2">
                                <SparklesIcon className="w-3 h-3" /> AI Generator
                            </h3>
                            <textarea 
                                value={customPrompt}
                                onChange={e => setCustomPrompt(e.target.value)}
                                placeholder="Describe a custom threat (e.g. 'Flash flood in Manchester')..."
                                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-white h-20 resize-none mb-2 focus:border-cyan-500 outline-none"
                            />
                            <button 
                                onClick={handleGenerateCustom}
                                disabled={isGeneratingCustom || !customPrompt.trim()}
                                className="w-full bg-cyan-900/30 hover:bg-cyan-900/50 text-cyan-400 border border-cyan-500/30 py-1.5 rounded text-xs font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                            >
                                {isGeneratingCustom ? <ArrowUpTrayIcon className="w-3 h-3 animate-spin" /> : <SparklesIcon className="w-3 h-3" />}
                                Generate
                            </button>
                        </div>

                        {/* Import / Export Controls */}
                        <div className="flex gap-2">
                            <button onClick={handleImportClick} className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-bold flex items-center justify-center gap-2 border border-slate-700 transition-colors">
                                <ArrowUpTrayIcon className="w-3 h-3" /> Import
                            </button>
                            <button onClick={handleExport} className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-bold flex items-center justify-center gap-2 border border-slate-700 transition-colors">
                                <ArrowDownTrayIcon className="w-3 h-3" /> Export
                            </button>
                        </div>

                        <button 
                            onClick={onGenerateMore}
                            className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-sm font-bold flex items-center justify-center gap-2 transition-colors"
                        >
                            <DocumentDuplicateIcon className="w-4 h-4" /> Auto-Generate Batch
                        </button>

                        <button 
                            onClick={createNew}
                            className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-sm font-bold flex items-center justify-center gap-2 transition-colors mt-auto"
                        >
                            <PlusIcon className="w-4 h-4" /> Create Manually
                        </button>
                    </div>

                    {/* List Area */}
                    <div className="flex-1 overflow-y-auto p-4 bg-slate-950 relative">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                            {filtered.map(scenario => {
                                const isSelected = selectedIds.has(scenario.id);
                                const isUser = scenario.status === 'User' || scenario.isUserCreated;
                                const hasLocation = (scenario.coordinates && scenario.coordinates.lat) || (scenario.locations && scenario.locations.length > 0);
                                
                                return (
                                    <div 
                                        key={scenario.id} 
                                        className={`relative p-4 rounded-lg border transition-all cursor-pointer group flex flex-col ${
                                            isSelected 
                                            ? 'bg-red-900/20 border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.2)]' 
                                            : 'bg-slate-800/50 border-slate-700 hover:border-slate-500 hover:bg-slate-800'
                                        }`}
                                        onClick={() => toggleSelection(scenario.id)}
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex items-center gap-2">
                                                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0 ${isSelected ? 'bg-red-500 border-red-500' : 'border-slate-500 bg-transparent'}`}>
                                                    {isSelected && <CheckCircleIcon className="w-4 h-4 text-white" />}
                                                </div>
                                                <h3 className="font-bold text-white truncate max-w-[150px]">{scenario.name}</h3>
                                                {isUser && <span className="text-[10px] bg-indigo-900 text-indigo-300 px-1.5 rounded border border-indigo-700">Custom</span>}
                                            </div>
                                            
                                            <div className="flex items-center gap-1 shrink-0">
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); setEditingScenario(scenario); }}
                                                    className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white"
                                                    title="Edit"
                                                >
                                                    <PencilIcon className="w-4 h-4" />
                                                </button>
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); handleDelete(scenario.id); }}
                                                    className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-red-400"
                                                    title="Delete"
                                                >
                                                    <TrashIcon className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                        
                                        <p className="text-sm text-slate-400 mb-3 pl-6 line-clamp-2 flex-1">{scenario.description}</p>
                                        
                                        <div className="flex items-center gap-3 pl-6 text-xs text-slate-500 mb-3 flex-wrap">
                                            <span className={`px-2 py-0.5 rounded border font-bold ${
                                                scenario.category === 'Cyber' ? 'bg-purple-900/20 text-purple-400 border-purple-900' :
                                                scenario.category === 'Storm' ? 'bg-blue-900/20 text-blue-400 border-blue-900' :
                                                'bg-slate-700 text-slate-300 border-slate-600'
                                            }`}>
                                                {scenario.category}
                                            </span>
                                            <span className="flex items-center gap-1"><ClockIcon className="w-3 h-3" /> {scenario.durationDays}d</span>
                                            <span className="flex items-center gap-1"><ChartBarIcon className="w-3 h-3" /> {scenario.peakConsumersAffected > 1000 ? (scenario.peakConsumersAffected/1000).toFixed(0)+'k' : scenario.peakConsumersAffected}</span>
                                        </div>

                                        {/* Explicit View Controls */}
                                        <div className="flex items-center gap-2 pl-6 mt-auto border-t border-slate-700/50 pt-2">
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); onMapAction?.(activeRegion?.lat || 0, activeRegion?.lng || 0, activeRegion?.zoom || 6); }}
                                                className="px-2 py-1 bg-slate-700 hover:bg-cyan-900/50 hover:text-cyan-400 rounded text-[10px] font-bold text-slate-300 flex items-center gap-1 transition-colors border border-slate-600"
                                            >
                                                <GlobeAmericasIcon className="w-3 h-3" /> Region View
                                            </button>
                                            
                                            <button 
                                                onClick={(e) => { 
                                                    e.stopPropagation(); 
                                                    if (hasLocation) {
                                                        let lat = scenario.coordinates?.lat || scenario.locations?.[0].lat || 0;
                                                        let lng = scenario.coordinates?.lng || scenario.locations?.[0].lng || 0;
                                                        onMapAction?.(lat, lng, 12); 
                                                    }
                                                }}
                                                disabled={!hasLocation}
                                                className={`px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1 transition-colors border ${
                                                    hasLocation 
                                                    ? 'bg-slate-700 hover:bg-red-900/50 hover:text-red-400 text-slate-300 border-slate-600 cursor-pointer' 
                                                    : 'bg-slate-800 text-slate-600 border-slate-800 cursor-not-allowed'
                                                }`}
                                            >
                                                <MapPinIcon className="w-3 h-3" /> Local View
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}

                            {filtered.length === 0 && (
                                <div className="col-span-full text-center py-10 text-slate-500">
                                    <MagnifyingGlassIcon className="w-12 h-12 mx-auto mb-2 opacity-20" />
                                    <p>No scenarios found matching your criteria.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer Action Bar */}
                <div className="p-4 bg-slate-950 border-t border-slate-800 rounded-b-xl flex justify-between items-center shrink-0 relative">
                    <div className="text-sm text-slate-400">
                        <span className="text-white font-bold">{selectedIds.size}</span> scenarios selected
                    </div>
                    <div className="flex gap-3">
                        <button onClick={onClose} className="px-4 py-2 hover:bg-slate-800 rounded text-slate-300 font-bold transition-colors">Close</button>
                        <button 
                            onClick={handleRun}
                            disabled={selectedIds.size === 0}
                            className="px-6 py-2 bg-red-600 hover:bg-red-500 text-white rounded font-bold shadow-lg shadow-red-900/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all hover:scale-105 active:scale-95"
                        >
                            <PlayIcon className="w-5 h-5" />
                            Run Simulation
                        </button>
                    </div>
                    
                    {/* Resize Handle */}
                    {!isMaximized && (
                        <div 
                            className="absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize flex items-end justify-end p-1 z-50"
                            onMouseDown={handleResizeMouseDown}
                        >
                            <ArrowsPointingOutIcon className="w-4 h-4 text-slate-500 rotate-90" />
                        </div>
                    )}
                </div>
            </div>
        </>
    );
};

export default ScenarioManager;
