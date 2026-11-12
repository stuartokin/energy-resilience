// A floating panel you can move (mouse or touch), resize, and zoom (A- / A+).
// Its position, size and zoom are remembered in this browser (see layout.tsx).
// On phones it becomes a bottom sheet, opened from the tab bar.
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLayout, loadPanelLayout, savePanelLayout } from './layout';

interface DraggablePanelProps {
    id?: string;              // enables remembering layout, and the phone tab bar
    title?: string;           // shown on the phone sheet header
    children: React.ReactNode;
    initialX: number;
    initialY: number;
    className?: string;
    zIndex?: number;
    onInteract?: () => void;
    resizable?: boolean;      // default true
}

const ZOOMS = [0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.4, 1.6];

const DraggablePanel: React.FC<DraggablePanelProps> = ({ id, title, children, initialX, initialY, className, zIndex, onInteract, resizable = true }) => {
    const { mode, activeSheet, setActiveSheet } = useLayout();
    const saved = id ? loadPanelLayout(id) : {};
    const defaultZoom = mode === 'tablet' ? 0.9 : 1;
    const [position, setPosition] = useState({ x: saved.x ?? initialX, y: saved.y ?? initialY });
    const [size, setSize] = useState<{ w?: number, h?: number }>({ w: saved.w, h: saved.h });
    const [zoom, setZoom] = useState<number>(saved.zoom ?? defaultZoom);
    const [isDragging, setIsDragging] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);

    // Keep the panel inside the visible map area (small windows, resizes, after dragging).
    const clampToParent = () => {
        const el = panelRef.current;
        const parent = el?.offsetParent as HTMLElement | null;
        if (!el || !parent) return;
        const maxX = Math.max(0, parent.clientWidth - el.offsetWidth - 8);
        const maxY = Math.max(0, parent.clientHeight - el.offsetHeight - 8);
        setPosition(p => {
            const x = Math.min(Math.max(8, p.x), maxX);
            const y = Math.min(Math.max(8, p.y), maxY);
            return x === p.x && y === p.y ? p : { x, y };
        });
    };

    useEffect(() => {
        if (mode === 'phone') return;
        clampToParent();
        const raf = requestAnimationFrame(clampToParent);
        window.addEventListener('resize', clampToParent);
        return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', clampToParent); };
    }, [mode]);

    const persist = (patch: { x?: number, y?: number, w?: number, h?: number, zoom?: number }) => { if (id) savePanelLayout(id, patch); };

    // Drag with window listeners (no pointer capture, so clicks inside the panel still work).
    // A move only starts after the pointer travels a few pixels.
    const beginDrag = (e: React.PointerEvent, kind: 'move' | 'resize') => {
        const el = panelRef.current!;
        const startX = e.clientX, startY = e.clientY;
        const base = { ...position };
        const baseSize = { w: el.offsetWidth, h: el.offsetHeight };
        let active = kind === 'resize';
        if (active) setIsDragging(true);
        const onMove = (ev: PointerEvent) => {
            const dx = ev.clientX - startX, dy = ev.clientY - startY;
            if (!active) {
                if (Math.hypot(dx, dy) < 4) return;
                active = true;
                setIsDragging(true);
            }
            ev.preventDefault();
            if (kind === 'move') setPosition({ x: base.x + dx, y: base.y + dy });
            else setSize({ w: Math.max(160, baseSize.w + dx), h: Math.max(80, baseSize.h + dy) });
        };
        const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
            if (!active) return;
            setIsDragging(false);
            clampToParent();
            requestAnimationFrame(() => {
                if (kind === 'move') setPosition(p => { persist({ x: p.x, y: p.y }); return p; });
                else setSize(sz => { persist({ w: sz.w, h: sz.h }); return sz; });
            });
        };
        window.addEventListener('pointermove', onMove, { passive: false });
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
    };

    const startMove = (e: React.PointerEvent) => {
        if (onInteract) onInteract();
        if (e.button !== 0) return;
        if ((e.target as HTMLElement).closest('button, input, select, textarea, a, .no-drag, .recharts-wrapper')) return;
        beginDrag(e, 'move');
    };

    const startResize = (e: React.PointerEvent) => {
        e.stopPropagation();
        beginDrag(e, 'resize');
    };

    const changeZoom = (dir: 1 | -1) => {
        const i = ZOOMS.findIndex(z => z >= zoom - 0.001);
        const next = ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, (i < 0 ? 3 : i) + dir))];
        setZoom(next);
        persist({ zoom: next });
        requestAnimationFrame(clampToParent);
    };

    const resetPanel = () => {
        setZoom(defaultZoom);
        setSize({});
        persist({ zoom: undefined, w: undefined, h: undefined });
    };

    // ---------- Phone: bottom sheet ----------
    if (mode === 'phone') {
        if (!id || activeSheet !== id) return null;
        return createPortal(
            <div className="fixed inset-x-0 bottom-14 z-[450] max-h-[62vh] flex flex-col bg-slate-950/95 backdrop-blur border-t border-slate-700 rounded-t-2xl shadow-2xl animate-slideUp">
                <div className="flex items-center justify-between px-4 pt-2 pb-1 shrink-0">
                    <div className="w-10 h-1 rounded-full bg-slate-600 absolute left-1/2 -translate-x-1/2 top-1.5" />
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-300 mt-2">{title || ''}</span>
                    <button onClick={() => setActiveSheet(null)} className="mt-2 text-slate-400 hover:text-white text-sm px-2" aria-label="Close panel">Close</button>
                </div>
                <div className="overflow-y-auto px-3 pb-3 sheet-content">{children}</div>
            </div>,
            document.body
        );
    }

    // ---------- Desktop / tablet: floating panel ----------
    return (
        <div
            ref={panelRef}
            className={`${size.w ? '' : (className || '')} absolute group/panel ${className?.includes('pointer-events-auto') ? 'pointer-events-auto' : ''}`}
            style={{ left: position.x, top: position.y, zIndex: zIndex || 30, width: size.w, height: size.h, touchAction: 'none' }}
            onPointerDown={startMove}
        >
            <div
                className={`cursor-move h-full ${size.h ? 'overflow-auto custom-scrollbar' : ''} ${isDragging ? 'cursor-grabbing ring-2 ring-cyan-500/50 rounded-lg' : ''}`}
                style={{ zoom } as React.CSSProperties}
            >
                {children}
            </div>

            {/* Panel controls: text size and reset (top left, on hover; always shown on touch screens) */}
            {id && resizable && (
                <div className="no-drag absolute -top-3 left-2 hidden group-hover/panel:flex [@media(hover:none)]:flex gap-0.5 bg-slate-800 border border-slate-600 rounded-md shadow-lg text-[10px] font-bold text-slate-300 overflow-hidden" style={{ zIndex: 5 }}>
                    <button onClick={() => changeZoom(-1)} className="px-1.5 py-0.5 hover:bg-slate-700" title="Smaller" aria-label="Make panel smaller">A−</button>
                    <button onClick={() => changeZoom(1)} className="px-1.5 py-0.5 hover:bg-slate-700" title="Larger" aria-label="Make panel larger">A+</button>
                    <button onClick={resetPanel} className="px-1.5 py-0.5 hover:bg-slate-700" title="Reset size" aria-label="Reset panel size">⟲</button>
                </div>
            )}
            {resizable && id && <div className="panel-resize no-drag opacity-0 group-hover/panel:opacity-100 [@media(hover:none)]:opacity-100" onPointerDown={startResize} title="Drag to resize" />}
        </div>
    );
};

export default DraggablePanel;
