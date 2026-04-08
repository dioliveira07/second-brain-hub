"use client";
import { CSSProperties, ReactNode } from "react";

interface FadeInProps {
  children:  ReactNode;
  delay?:    number;   // ms
  duration?: number;   // ms
  from?:     "bottom" | "left" | "right" | "scale";
  style?:    CSSProperties;
  className?: string;
}

const KEYFRAME: Record<string, string> = {
  bottom: "fade-up",
  left:   "fade-left",
  right:  "fade-right",
  scale:  "scale-in",
};

export function FadeIn({
  children,
  delay    = 0,
  duration = 420,
  from     = "bottom",
  style,
  className,
}: FadeInProps) {
  return (
    <div
      className={className}
      style={{
        animation:      `${KEYFRAME[from]} ${duration}ms cubic-bezier(.16,1,.3,1) both`,
        animationDelay: `${delay}ms`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
