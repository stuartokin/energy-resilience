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
        const handleMouseUp = () => setIsDragging(false);

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