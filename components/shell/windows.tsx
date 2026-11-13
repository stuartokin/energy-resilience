// Window system: every panel is a "window" that can be
//   docked     - a tab in the right-hand side panel (default)
//   floating   - popped out over the map, moved by its header, resized from the corner
//   minimised  - a chip at the bottom-left of the map
//   closed     - hidden until reopened from the tool rail
// One header design for all windows. Layout is remembered in this browser.
// Phones: no floating; windows open as a bottom sheet from the tab bar.
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { XMarkIcon, MinusIcon, ArrowTopRightOnSquareIcon, ArrowRightOnRectangleIcon, ChevronDoubleRightIcon, ChevronDoubleLeftIcon } from '@heroicons/react/24/solid';

export type AppMode = 'live' | 'scenarios';
export type WinState = 'docked' | 'floating' | 'minimised' | 'closed';

export interface WinDef {
    id: string;
    title: string;
    short: string;          // label on the rail / tab bar
    colour: string;         // accent square in the header
    icon: React.ComponentType<{ className?: string }>;
    modes: AppMode[];
    width?: number;         // floating width (320 small, 420 medium, 560 large)
    fill?: boolean;         // content manages its own height (e.g. chat)
    content: React.ReactNode;
}

interface Geo { x: number; y: number; w?: number; h?: number; zoom?: number }
export interface Persisted {
    states: Record<string, WinState>;
    geo: Record<string, Geo>;
    active: Record<AppMode, string>;
    panelW: number;
    collapsed: boolean;
}

const KEY = 'energy_resilience_windows_v1';
const DEFAULT: Persisted = { states: {}, geo: {}, active: { live: 'overview', scenarios: 'library' }, panelW: 420, collapsed: false };
const load = (): Persisted => {
    try { return { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return DEFAULT; }
};
const save = (p: Persisted) => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* not remembered */ } };
export const clearWindowLayout = () => { try { localStorage.removeItem(KEY); } catch { /* ignore */ } };

export const ZOOMS = [0.8, 0.9, 1, 1.1, 1.25, 1.4];

export const useWindows = () => {
    const [p, setP] = useState<Persisted>(load);
    const [stack, setStack] = useState<string[]>([]);
    const [version, setVersion] = useState(0); // bumps when a saved view is loaded, so floating windows re-read their position
    useEffect(() => { save(p); }, [p]);
    const stateOf = useCallback((id: string): WinState => p.states[id] || 'docked', [p.states]);
    const setState = (id: string, s: WinState) => setP(prev => ({ ...prev, states: { ...prev.states, [id]: s } }));
    const setGeo = (id: string, g: Partial<Geo>) => setP(prev => ({ ...prev, geo: { ...prev.geo, [id]: { ...(prev.geo[id] || { x: 80, y: 40 }), ...g } } }));
    const setActive = (mode: AppMode, id: string) => setP(prev => ({ ...prev, active: { ...prev.active, [mode]: id } }));
    const bringToFront = (id: string) => setStack(prev => [...prev.filter(x => x !== id), id]);
    // Open a window wherever it lives (used by the rail, the top bar and buttons inside panels)
    const open = (id: string, mode: AppMode) => {
        const s = stateOf(id);
        if (s === 'floating') { bringToFront(id); return; }
        setP(prev => ({ ...prev, states: { ...prev.states, [id]: 'docked' }, active: { ...prev.active, [mode]: id }, collapsed: false }));
    };
    const popOut = (id: string, at?: { x: number; y: number }) => {
        setP(prev => ({ ...prev, states: { ...prev.states, [id]: 'floating' }, geo: { ...prev.geo, [id]: { ...(prev.geo[id] || {}), x: at?.x ?? prev.geo[id]?.x ?? 64 + (stack.length % 6) * 28, y: at?.y ?? prev.geo[id]?.y ?? 30 + (stack.length % 6) * 28 } } }));
        bringToFront(id);
    };
    return {
        ...p, stateOf, setState, setGeo, setActive, open, popOut, bringToFront,
        zOf: (id: string) => 20 + Math.max(0, stack.indexOf(id)),
        setPanelW: (w: number) => setP(prev => ({ ...prev, panelW: Math.max(320, Math.min(680, w)) })),
        setCollapsed: (c: boolean) => setP(prev => ({ ...prev, collapsed: c })),
        reset: () => { clearWindowLayout(); setP(DEFAULT); setStack([]); },
        version,
        // Saved views (services/views.ts)
        snapshot: (): Persisted => p,
        restore: (np: Partial<Persisted>) => { setP({ ...DEFAULT, ...np, active: { ...DEFAULT.active, ...(np.active || {}) } }); setStack([]); setVersion(v => v + 1); },
    };
};
export type Windows = ReturnType<typeof useWindows>;

// ---------- Standard header ----------
const HeaderButton: React.FC<{ label: string; onClick: () => void; children: React.ReactNode }> = ({ label, onClick, children }) => (
    <button type="button" onClick={onClick} aria-label={label} title={label}
        className="no-drag w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-white hover:bg-slate-700/70 text-[11px] font-bold">
        {children}
    </button>
);

export const WindowHeader: React.FC<{ def: WinDef; dragProps?: React.HTMLAttributes<HTMLDivElement>; children?: React.ReactNode }> = ({ def, dragProps, children }) => (
    <div {...dragProps} className={`h-10 shrink-0 flex items-center gap-2 pl-3 pr-1.5 bg-slate-900 border-b border-slate-800 select-none ${dragProps ? 'cursor-move' : ''}`}>
        <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: def.colour }} aria-hidden="true" />
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-100 flex-1 truncate">{def.title}</span>
        {children}
    </div>
);

// ---------- Floating window ----------
export const FloatingWindow: React.FC<{ def: WinDef; win: Windows; container: React.RefObject<HTMLDivElement> }> = ({ def, win, container }) => {
    const g = win.geo[def.id] || { x: 64, y: 30 };
    const [pos, setPos] = useState({ x: g.x, y: g.y });
    const [size, setSize] = useState<{ w?: number; h?: number }>({ w: g.w, h: g.h });
    const zoom = g.zoom ?? 1;
    const ref = useRef<HTMLDivElement>(null);

    const clamp = useCallback(() => {
        const el = ref.current, parent = container.current;
        if (!el || !parent) return;
        const maxX = Math.max(0, parent.clientWidth - el.offsetWidth - 6), maxY = Math.max(0, parent.clientHeight - 48);
        setPos(p => ({ x: Math.min(Math.max(6, p.x), maxX), y: Math.min(Math.max(6, p.y), maxY) }));
    }, [container]);
    useEffect(() => { clamp(); window.addEventListener('resize', clamp); return () => window.removeEventListener('resize', clamp); }, [clamp]);

    const drag = (e: React.PointerEvent, kind: 'move' | 'resize') => {
        if (e.button !== 0) return;
        if (kind === 'move' && (e.target as HTMLElement).closest('button, input, select, textarea, a, .no-drag')) return;
        win.bringToFront(def.id);
        const el = ref.current!;
        const sx = e.clientX, sy = e.clientY, base = { ...pos }, bs = { w: el.offsetWidth, h: el.offsetHeight };
        let moved = false;
        const onMove = (ev: PointerEvent) => {
            const dx = ev.clientX - sx, dy = ev.clientY - sy;
            if (!moved && Math.hypot(dx, dy) < 4) return;
            moved = true;
            ev.preventDefault();
            if (kind === 'move') setPos({ x: base.x + dx, y: base.y + dy });
            else setSize({ w: Math.max(260, bs.w + dx), h: Math.max(140, bs.h + dy) });
        };
        const onUp = () => {
            window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp);
            if (!moved) return;
            clamp();
            requestAnimationFrame(() => {
                if (kind === 'move') setPos(p => { win.setGeo(def.id, { x: p.x, y: p.y }); return p; });
                else setSize(s => { win.setGeo(def.id, { w: s.w, h: s.h }); return s; });
            });
        };
        window.addEventListener('pointermove', onMove, { passive: false }); window.addEventListener('pointerup', onUp); window.addEventListener('pointercancel', onUp);
    };
    const changeZoom = (dir: 1 | -1) => {
        const i = ZOOMS.findIndex(z => z >= zoom - 0.001);
        win.setGeo(def.id, { zoom: ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, (i < 0 ? 2 : i) + dir))] });
    };

    const width = size.w ?? def.width ?? 420;
    return (
        <section ref={ref} aria-label={`${def.title} (popped out)`} onPointerDown={() => win.bringToFront(def.id)}
            className="absolute flex flex-col bg-slate-950/95 backdrop-blur border border-slate-600 rounded-xl shadow-[0_12px_40px_rgba(0,0,0,0.55)] overflow-hidden pointer-events-auto"
            style={{ left: pos.x, top: pos.y, width, height: size.h, maxHeight: size.h ? undefined : 'calc(100% - 12px)', zIndex: win.zOf(def.id) }}>
            <WindowHeader def={def} dragProps={{ onPointerDown: e => drag(e, 'move'), style: { touchAction: 'none' } }}>
                <HeaderButton label="Smaller text" onClick={() => changeZoom(-1)}>A−</HeaderButton>
                <HeaderButton label="Larger text" onClick={() => changeZoom(1)}>A+</HeaderButton>
                <HeaderButton label="Dock into the side panel" onClick={() => { win.setState(def.id, 'docked'); }}><ArrowRightOnRectangleIcon className="w-4 h-4" /></HeaderButton>
                <HeaderButton label="Minimise" onClick={() => win.setState(def.id, 'minimised')}><MinusIcon className="w-4 h-4" /></HeaderButton>
                <HeaderButton label="Close" onClick={() => win.setState(def.id, 'closed')}><XMarkIcon className="w-4 h-4" /></HeaderButton>
            </WindowHeader>
            <div className={`flex-1 min-h-0 ${def.fill ? 'flex flex-col' : 'overflow-auto custom-scrollbar p-3'}`} style={{ zoom } as React.CSSProperties}>
                {def.fill ? <div className="flex-1 min-h-0" style={{ height: size.h ? undefined : 480 }}>{def.content}</div> : def.content}
            </div>
            <div onPointerDown={e => { e.stopPropagation(); drag(e, 'resize'); }} title="Drag to resize" aria-hidden="true"
                className="no-drag absolute right-0 bottom-0 w-4 h-4 cursor-nwse-resize" style={{ touchAction: 'none', background: 'linear-gradient(135deg, transparent 50%, #475569 50%)' }} />
        </section>
    );
};

// ---------- Side panel (docked windows as tabs) ----------
export const SidePanel: React.FC<{ defs: WinDef[]; mode: AppMode; win: Windows; overlay?: boolean; onClose?: () => void }> = ({ defs, mode, win, overlay, onClose }) => {
    const docked = defs.filter(d => d.modes.includes(mode) && win.stateOf(d.id) === 'docked');
    const active = docked.find(d => d.id === win.active[mode]) || docked[0];
    const startResize = (e: React.PointerEvent) => {
        const sx = e.clientX, w0 = win.panelW;
        const onMove = (ev: PointerEvent) => { ev.preventDefault(); win.setPanelW(w0 + (sx - ev.clientX)); };
        const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
        window.addEventListener('pointermove', onMove, { passive: false }); window.addEventListener('pointerup', onUp);
    };

    if (win.collapsed && !overlay) {
        return (
            <aside aria-label="Side panel (collapsed)" className="w-12 shrink-0 border-l border-slate-800 bg-slate-950 flex flex-col items-center py-2 gap-1">
                <button type="button" onClick={() => win.setCollapsed(false)} aria-label="Expand side panel" title="Expand side panel" className="w-9 h-9 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center"><ChevronDoubleLeftIcon className="w-4 h-4" /></button>
                {docked.map(d => { const I = d.icon; return (
                    <button key={d.id} type="button" onClick={() => win.open(d.id, mode)} aria-label={d.title} title={d.title} className="w-9 h-9 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center"><I className="w-4 h-4" /></button>
                ); })}
            </aside>
        );
    }

    return (
        <aside aria-label="Side panel" className={`${overlay ? 'absolute right-0 top-0 bottom-0 z-[60] shadow-[-12px_0_30px_rgba(0,0,0,0.45)]' : 'relative shrink-0'} border-l border-slate-800 bg-slate-950 flex flex-col min-h-0`} style={{ width: overlay ? Math.min(win.panelW, 400) : win.panelW }}>
            {!overlay && <div onPointerDown={startResize} title="Drag to resize the panel" aria-hidden="true" className="absolute left-0 top-0 bottom-0 w-1.5 -ml-0.5 cursor-ew-resize hover:bg-cyan-500/40 z-10" style={{ touchAction: 'none' }} />}
            {active ? (
                <WindowHeader def={active}>
                    <HeaderButton label="Pop out as a floating window" onClick={() => win.popOut(active.id)}><ArrowTopRightOnSquareIcon className="w-4 h-4" /></HeaderButton>
                    {overlay
                        ? <HeaderButton label="Close panel" onClick={() => onClose?.()}><XMarkIcon className="w-4 h-4" /></HeaderButton>
                        : <HeaderButton label="Collapse side panel" onClick={() => win.setCollapsed(true)}><ChevronDoubleRightIcon className="w-4 h-4" /></HeaderButton>}
                </WindowHeader>
            ) : (
                <div className="h-10 shrink-0 flex items-center px-3 border-b border-slate-800 text-[11px] text-slate-400 justify-between">
                    <span>Side panel</span>
                    {!overlay && <HeaderButton label="Collapse side panel" onClick={() => win.setCollapsed(true)}><ChevronDoubleRightIcon className="w-4 h-4" /></HeaderButton>}
                </div>
            )}
            {docked.length > 1 && (
                <div role="tablist" aria-label="Panel tabs" className="flex gap-0.5 px-2 border-b border-slate-800 overflow-x-auto custom-scrollbar shrink-0">
                    {docked.map(d => (
                        <button key={d.id} role="tab" type="button" aria-selected={active?.id === d.id} onClick={() => win.setActive(mode, d.id)}
                            className={`px-2.5 py-2 text-[11px] whitespace-nowrap border-b-2 ${active?.id === d.id ? 'border-cyan-400 text-white font-semibold' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
                            {d.short}
                        </button>
                    ))}
                </div>
            )}
            <div className={`flex-1 min-h-0 ${active?.fill ? 'flex flex-col' : 'overflow-y-auto custom-scrollbar p-3'}`}>
                {active ? active.content : <p className="text-xs text-slate-400 p-3">Every window is popped out. Use the dock button in a window's header to bring it back here.</p>}
            </div>
        </aside>
    );
};

// ---------- Minimised chips ----------
export const MinimisedTray: React.FC<{ defs: WinDef[]; mode: AppMode; win: Windows }> = ({ defs, mode, win }) => {
    const mins = defs.filter(d => d.modes.includes(mode) && win.stateOf(d.id) === 'minimised');
    if (!mins.length) return null;
    return (
        <div className="absolute left-3 bottom-3 z-[15] flex flex-wrap gap-1.5 max-w-[70%] pointer-events-auto" aria-label="Minimised windows">
            {mins.map(d => (
                <button key={d.id} type="button" onClick={() => { win.setState(d.id, 'floating'); win.bringToFront(d.id); }}
                    className="flex items-center gap-1.5 rounded-full border border-slate-600 bg-slate-950/90 px-3 py-1.5 text-[11px] text-slate-200 hover:border-slate-400 shadow-lg">
                    <span className="w-1.5 h-1.5 rounded-sm" style={{ background: d.colour }} aria-hidden="true" />{d.short}
                </button>
            ))}
        </div>
    );
};

// ---------- Tool rail (desktop / tablet) ----------
export const ToolRail: React.FC<{ defs: WinDef[]; mode: AppMode; win: Windows; onReset: () => void; overlayPanel?: boolean; onOpenOverlay?: (id: string) => void; overlayOpen?: string | null }> = ({ defs, mode, win, onReset, overlayPanel, onOpenOverlay, overlayOpen }) => (
    <nav aria-label="Tools" className="w-16 shrink-0 border-r border-slate-800 bg-slate-950 flex flex-col items-center gap-1 py-2 overflow-y-auto custom-scrollbar">
        {defs.filter(d => d.modes.includes(mode)).map(d => {
            const I = d.icon;
            const s = win.stateOf(d.id);
            const on = overlayPanel ? overlayOpen === d.id : (s === 'floating' || (s === 'docked' && !win.collapsed && win.active[mode] === d.id));
            return (
                <button key={d.id} type="button" title={d.title} aria-label={d.title} aria-pressed={on}
                    onClick={() => overlayPanel && s === 'docked' ? onOpenOverlay?.(d.id) : win.open(d.id, mode)}
                    className={`w-12 py-1.5 rounded-lg flex flex-col items-center gap-0.5 text-[9px] font-semibold ${on ? 'bg-slate-800 text-white ring-1 ring-slate-600' : 'text-slate-400 hover:text-white hover:bg-slate-900'}`}>
                    <I className="w-5 h-5" />
                    <span className="truncate max-w-[44px]">{d.short}</span>
                </button>
            );
        })}
        <div className="flex-1" />
        <button type="button" onClick={onReset} title="Reset window layout" aria-label="Reset window layout" className="w-12 py-1.5 rounded-lg text-[9px] text-slate-500 hover:text-white hover:bg-slate-900">Reset<br />layout</button>
    </nav>
);

// ---------- Phone: tab bar + bottom sheet ----------
export const PhoneSheet: React.FC<{ def: WinDef | null; onClose: () => void }> = ({ def, onClose }) => {
    const [full, setFull] = useState(false);
    if (!def) return null;
    return (
        <section aria-label={def.title} className={`fixed inset-x-0 bottom-14 z-[450] flex flex-col bg-slate-950/97 backdrop-blur border-t border-slate-700 rounded-t-2xl shadow-2xl ${full ? 'top-14' : 'h-[58vh]'}`}>
            <button type="button" onClick={() => setFull(f => !f)} aria-label={full ? 'Shrink sheet' : 'Expand sheet'} className="mx-auto mt-1.5 w-12 h-4 flex items-center justify-center"><span className="w-10 h-1 rounded-full bg-slate-600" /></button>
            <div className="flex items-center justify-between px-4 pb-1 shrink-0">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2"><span className="w-2 h-2 rounded-sm" style={{ background: def.colour }} />{def.title}</span>
                <button type="button" onClick={onClose} className="text-slate-400 hover:text-white text-sm px-3 py-2" aria-label="Close">Close</button>
            </div>
            <div className={`flex-1 min-h-0 ${def.fill ? 'flex flex-col' : 'overflow-y-auto px-3 pb-3'}`}>{def.content}</div>
        </section>
    );
};

export const PhoneTabs: React.FC<{ defs: WinDef[]; mode: AppMode; active: string | null; onPick: (id: string | null) => void }> = ({ defs, mode, active, onPick }) => (
    <nav aria-label="Panels" className="fixed inset-x-0 bottom-0 z-[460] h-14 bg-slate-950/95 backdrop-blur border-t border-slate-800 flex overflow-x-auto">
        {defs.filter(d => d.modes.includes(mode)).map(d => { const I = d.icon; return (
            <button key={d.id} type="button" onClick={() => onPick(active === d.id ? null : d.id)} aria-pressed={active === d.id}
                className={`min-w-[64px] flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold ${active === d.id ? 'text-cyan-300 bg-slate-900' : 'text-slate-400'}`}>
                <I className="w-5 h-5" />{d.short}
            </button>
        ); })}
    </nav>
);
