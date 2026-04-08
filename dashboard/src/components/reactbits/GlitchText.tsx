"use client";
import { useEffect, useRef, CSSProperties, ReactNode } from "react";

interface GlitchTextProps {
  children: ReactNode;
  style?:   CSSProperties;
  className?: string;
  speed?:   "slow" | "normal" | "fast";
}

const SPEEDS = { slow: 6000, normal: 4000, fast: 2000 };

export function GlitchText({
  children,
  style,
  className,
  speed = "slow",
}: GlitchTextProps) {
  const ref     = useRef<HTMLSpanElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const chars = "!<>-_\\/[]{}—=+*^?#ABCDEF0123456789";
    const orig  = el.textContent || "";
    let frame   = 0;
    let rafId:  number;

    const glitch = () => {
      const iterations = 3 + Math.floor(Math.random() * 4);
      let iter = 0;

      const tick = () => {
        el.textContent = orig
          .split("")
          .map((char, i) => {
            if (char === " ") return " ";
            if (i < frame - iter) return orig[i];
            return chars[Math.floor(Math.random() * chars.length)];
          })
          .join("");

        iter++;
        if (iter < iterations * orig.length) {
          frame++;
          rafId = requestAnimationFrame(tick);
        } else {
          el.textContent = orig;
          frame = 0;
        }
      };

      rafId = requestAnimationFrame(tick);
    };

    const schedule = () => {
      timerRef.current = setTimeout(() => {
        glitch();
        schedule();
      }, SPEEDS[speed] + Math.random() * 2000);
    };

    schedule();
    return () => {
      clearTimeout(timerRef.current);
      cancelAnimationFrame(rafId);
      if (el) el.textContent = orig;
    };
  }, [speed]);

  return (
    <span ref={ref} className={className} style={style}>
      {children}
    </span>
  );
}
