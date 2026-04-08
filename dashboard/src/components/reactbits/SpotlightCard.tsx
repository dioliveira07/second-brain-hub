"use client";
import { useRef, MouseEvent, ReactNode, CSSProperties } from "react";

interface SpotlightCardProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  spotColor?: string;
  borderColor?: string;
}

export function SpotlightCard({
  children,
  className,
  style,
  spotColor   = "rgba(6, 182, 212, 0.12)",
  borderColor = "rgba(6, 182, 212, 0.3)",
}: SpotlightCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    const el   = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x    = e.clientX - rect.left;
    const y    = e.clientY - rect.top;

    el.style.setProperty("--spot-x", `${x}px`);
    el.style.setProperty("--spot-y", `${y}px`);
    el.style.setProperty("--spot-opacity", "1");
    el.style.borderColor = borderColor;
  };

  const handleMouseLeave = () => {
    const el = cardRef.current;
    if (!el) return;
    el.style.setProperty("--spot-opacity", "0");
    el.style.borderColor = "";
  };

  return (
    <div
      ref={cardRef}
      className={className}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        position:        "relative",
        background:      "var(--bg-card)",
        border:          "1px solid var(--border)",
        borderRadius:    "var(--radius-lg)",
        overflow:        "hidden",
        transition:      "border-color 200ms",
        cursor:          "default",
        "--spot-opacity": "0",
        "--spot-x":      "50%",
        "--spot-y":      "50%",
        ...style,
      } as CSSProperties}
    >
      {/* Spotlight radial gradient */}
      <div
        aria-hidden
        style={{
          position:        "absolute",
          inset:           0,
          background:      `radial-gradient(circle 200px at var(--spot-x) var(--spot-y), ${spotColor}, transparent)`,
          opacity:         "var(--spot-opacity)" as unknown as number,
          transition:      "opacity 300ms",
          pointerEvents:   "none",
          zIndex:          0,
        }}
      />
      <div style={{ position: "relative", zIndex: 1 }}>{children}</div>
    </div>
  );
}
