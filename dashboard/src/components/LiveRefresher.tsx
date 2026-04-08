"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Fica no layout e faz router.refresh() periodicamente.
 * Quando há indexação ativa: polling a cada 4s.
 * Quando tudo está idle: polling a cada 30s.
 */
export function LiveRefresher() {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      if (cancelled) return;

      let interval = 30_000; // idle
      try {
        const res = await fetch("/painel/api/live-status", { cache: "no-store" });
        const { active } = await res.json();
        if (active) {
          router.refresh();
          interval = 4_000;
        }
      } catch {}

      if (!cancelled) {
        timerRef.current = setTimeout(tick, interval);
      }
    }

    tick();
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [router]);

  return null;
}
