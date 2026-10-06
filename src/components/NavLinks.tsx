"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/puzzles", label: "Puzzles" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/rules", label: "Rules" },
] as const;

// useLayoutEffect warns during server rendering; fall back to useEffect there
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Main navigation with a gold underline under the page you're on. The line
 * slides to the new link when you navigate (spatial cue: "you moved from here
 * to there"); the active link also gets aria-current="page".
 */
export function NavLinks() {
  const pathname = usePathname();
  const active = LINKS.find((l) => pathname === l.href || pathname.startsWith(`${l.href}/`))?.href ?? null;
  const navRef = useRef<HTMLElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const visible = useRef(false);

  useIsoLayoutEffect(() => {
    const nav = navRef.current;
    const bar = barRef.current;
    if (!nav || !bar) return;

    /** glide: slide from the previous link. Otherwise appear in place (just fade in). */
    const place = (glide: boolean) => {
      const link = active ? nav.querySelector<HTMLElement>(`a[href="${active}"]`) : null;
      if (!link) {
        bar.style.opacity = "0";
        visible.current = false;
        return;
      }
      // Underline spans the link's text, not its padding
      const inset = 12;
      const transform = `translateX(${link.offsetLeft + inset}px) scaleX(${Math.max(link.offsetWidth - inset * 2, 0)})`;
      if (glide) {
        bar.style.transform = transform;
      } else {
        bar.style.transition = "none";
        bar.style.transform = transform;
        void bar.offsetWidth; // commit the jump before transitions come back
        bar.style.transition = "";
      }
      bar.style.opacity = "1";
      visible.current = true;
    };

    // Slide only if the bar was already showing under another link
    place(visible.current);

    // Re-measure when fonts load or the header wraps to two rows. ResizeObserver
    // also fires once right away; skip that so it can't cancel the slide.
    let lastWidth = nav.offsetWidth;
    const ro = new ResizeObserver(() => {
      if (nav.offsetWidth === lastWidth) return;
      lastWidth = nav.offsetWidth;
      place(false);
    });
    ro.observe(nav);
    return () => ro.disconnect();
  }, [active]);

  return (
    <nav ref={navRef} aria-label="Main" className="relative order-last -mx-3 flex w-full gap-1 sm:order-none sm:mx-0 sm:w-auto">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} aria-current={active === l.href ? "page" : undefined} className="nav-link">
          {l.label}
        </Link>
      ))}
      <span
        ref={barRef}
        aria-hidden="true"
        className="pointer-events-none absolute bottom-1 left-0 h-0.5 w-px origin-left rounded-full bg-gold opacity-0 transition-[transform,opacity] duration-[220ms] ease-in-out motion-reduce:transition-none"
      />
    </nav>
  );
}
