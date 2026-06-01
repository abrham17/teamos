"use client";

import { type ReactNode, type MouseEvent, type TouchEvent } from "react";

interface CanvasSurfaceProps {
  zoom: number;
  panX: number;
  panY: number;
  isPanning: boolean;
  isDragging: boolean;
  onMouseDown: (e: MouseEvent<HTMLDivElement>) => void;
  onMouseMove: (e: MouseEvent<HTMLDivElement>) => void;
  onMouseUp: (e: MouseEvent<HTMLDivElement>) => void;
  onMouseLeave: (e: MouseEvent<HTMLDivElement>) => void;
  onTouchStart?: (e: TouchEvent<HTMLDivElement>) => void;
  onTouchMove?: (e: TouchEvent<HTMLDivElement>) => void;
  onTouchEnd?: (e: TouchEvent<HTMLDivElement>) => void;
  onDrop?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver?: (e: React.DragEvent<HTMLDivElement>) => void;
  children: ReactNode;
}

export function CanvasSurface({
  zoom,
  panX,
  panY,
  isPanning,
  isDragging,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onMouseLeave,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  onDrop,
  onDragOver,
  children,
}: CanvasSurfaceProps) {
  return (
    <div
      className="relative flex-1 overflow-hidden touch-none"
      style={{ cursor: isPanning ? "grabbing" : isDragging ? "move" : "grab" }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseLeave}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onDrop={onDrop}
      onDragOver={onDragOver}
    >
      <div
        className="absolute inset-0 pointer-events-none opacity-40"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.07) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />
      <div
        className="absolute pointer-events-none"
        style={{
          top: "5%",
          left: "20%",
          width: 500,
          height: 300,
          background: "rgba(139,127,244,0.04)",
          borderRadius: "50%",
          filter: "blur(100px)",
        }}
      />
      <div
        className="absolute origin-top-left"
        style={{
          transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
          width: 3200,
          height: 2000,
        }}
      >
        {children}
      </div>
    </div>
  );
}
