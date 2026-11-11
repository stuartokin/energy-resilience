import React, { useState, useEffect, useRef } from 'react';

interface DraggablePanelProps {
    children: React.ReactNode;
    initialX: number;
    initialY: number;
    className?: string;
    zIndex?: number;
    onInteract?: () => void;
}

const DraggablePanel: React.FC<DraggablePanelProps> = ({ children, initialX, initialY, className, zIndex, onInteract }) => {
    const [position, setPosition] = useState({ x: initialX, y: initialY });
    const [isDragging, setIsDragging] = useState(false);
    const dragStart = useRef({ x: 0, y: 0 });
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
        clampToParent();
        const raf = requestAnimationFrame(clampToParent); // after content has laid out
        window.addEventListener('resize', clampToParent);
        return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', clampToParent); };
    }, []);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (onInteract) onInteract();
        
        // Prevent drag if interacting with buttons/inputs inside the panel
        if ((e.target as HTMLElement).closest('button, input, select, textarea, .no-drag')) return;
        
        setIsDragging(true);
        dragStart.current = {
            x: e.clientX - position.x,
            y: e.clientY - position.y
        };
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging) return;
            setPosition({
                x: e.clientX - dragStart.current.x,
                y: e.clientY - dragStart.current.y
            });
        };
        const handleMouseUp = () => { setIsDragging(false); clampToParent(); };

        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging]);

    return (
        <div 
            ref={panelRef}
            className={`${className || ''} absolute`}
            style={{ left: position.x, top: position.y, touchAction: 'none', zIndex: zIndex || 30 }}
            onMouseDown={handleMouseDown}
        >
            <div className={`cursor-move ${isDragging ? 'cursor-grabbing ring-2 ring-cyan-500/50 rounded-lg' : ''}`}>
                {children}
            </div>
        </div>
    );
};

export default DraggablePanel;