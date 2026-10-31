"use client";

import { useMemo } from "react";

const COLORS = ["var(--play-flame)", "var(--play-sun)", "var(--play-mint)", "var(--play-sky)", "var(--play-grape)", "var(--play-rose)"];

/** A short CSS confetti burst for reward moments (disabled automatically by prefers-reduced-motion). */
export function Confetti({ count = 18 }: { count?: number }) {
  const dots = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const a = (i / count) * Math.PI * 2;
        const d = 60 + ((i * 37) % 70);
        return { dx: Math.cos(a) * d, dy: Math.sin(a) * d - 30, c: COLORS[i % COLORS.length], delay: (i % 5) * 30 };
      }),
    [count],
  );
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center overflow-visible">
      {dots.map((d, i) => (
        <span key={i} className="confetti-dot" style={{ background: d.c, ["--dx" as string]: `${d.dx}px`, ["--dy" as string]: `${d.dy}px`, animationDelay: `${d.delay}ms` }} />
      ))}
    </span>
  );
}
