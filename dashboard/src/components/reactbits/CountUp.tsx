"use client";
import { useEffect, useRef, useState } from "react";

interface CountUpProps {
  to:       number;
  duration?: number;
  locale?:  string;
}

export function CountUp({ to, duration = 1400, locale = "pt-BR" }: CountUpProps) {
  const [value, setValue]   = useState(0);
  const startRef            = useRef<number | null>(null);
  const rafRef              = useRef<number>(0);

  useEffect(() => {
    startRef.current = null;

    const animate = (ts: number) => {
      if (startRef.current === null) startRef.current = ts;
      const elapsed  = ts - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased    = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(to * eased));
      if (progress < 1) rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [to, duration]);

  return <>{value.toLocaleString(locale)}</>;
}
