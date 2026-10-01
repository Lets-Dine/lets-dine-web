import { useEffect, useRef, useState } from 'react';
import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export { gsap, ScrollTrigger };

/**
 * Motion for the marketing page.
 *
 * Two rules everything here obeys:
 *
 *  1. Nothing is hidden in CSS. GSAP hides elements at runtime, immediately
 *     before it animates them in, so a visitor with JavaScript unavailable
 *     gets the finished page rather than a blank one.
 *  2. Under `prefers-reduced-motion: reduce` there is no smooth scroll, no
 *     scrub, and no travel — the final state is set instantly. Reduced motion
 *     is not "the same animation, faster".
 */

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* ── Smooth scroll ────────────────────────────────────────────────
   Lenis is the page's *only* smooth-scroll engine. Locomotive Scroll is
   deliberately not installed: two engines driving `scrollTop` fight each
   other, and ScrollTrigger can only be wired to one of them.          */

let lenis: Lenis | null = null;

/** The running Lenis instance, if smooth scrolling is active at all. */
export function getLenis(): Lenis | null {
  return lenis;
}

/**
 * Starts Lenis for as long as the landing page is mounted, drives it from
 * GSAP's ticker (one rAF loop for the whole page, not two), and keeps
 * ScrollTrigger's measurements in step with it.
 */
export function useSmoothScroll(enabled = true) {
  useEffect(() => {
    if (!enabled || prefersReducedMotion()) return;

    const instance = new Lenis({
      duration: 1.05,
      easing: (t) => 1 - Math.pow(1 - t, 3),
      // Touch devices already have excellent native momentum; overriding it
      // makes a phone feel laggy, so Lenis only takes over pointer scrolling.
      smoothWheel: true,
      syncTouch: false,
    });
    lenis = instance;

    instance.on('scroll', ScrollTrigger.update);

    const drive = (time: number) => instance.raf(time * 1000);
    gsap.ticker.add(drive);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(drive);
      gsap.ticker.lagSmoothing(500, 33);
      instance.destroy();
      lenis = null;
    };
  }, [enabled]);
}

/**
 * Re-measures every ScrollTrigger once the things that change page height
 * have settled: web fonts swapping in, and images finishing decode. Without
 * this, every trigger below the fold is pinned to a stale offset.
 */
export function useRefreshOnLoad() {
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      if (alive) ScrollTrigger.refresh();
    };

    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    fonts?.ready.then(refresh);
    window.addEventListener('load', refresh);

    // Images below the fold arrive late and each one moves everything under it.
    const images = Array.from(document.images).filter((img) => !img.complete);
    images.forEach((img) => img.addEventListener('load', refresh, { once: true }));

    const settle = window.setTimeout(refresh, 600);

    return () => {
      alive = false;
      window.clearTimeout(settle);
      window.removeEventListener('load', refresh);
      images.forEach((img) => img.removeEventListener('load', refresh));
    };
  }, []);
}

/** Smooth in-page anchor jumps, routed through Lenis so it stays authoritative. */
export function scrollToSection(hash: string) {
  const target = document.querySelector(hash);
  if (!target) return;
  const offset = -84;
  if (lenis) {
    lenis.scrollTo(target as HTMLElement, { offset, duration: 1.1 });
  } else {
    const top = target.getBoundingClientRect().top + window.scrollY + offset;
    window.scrollTo({ top, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }
}

/* ── Entrances ────────────────────────────────────────────────────── */

const EASE = 'power3.out';

/**
 * The page's one entrance pattern: everything marked `data-reveal` inside the
 * section rises as the section arrives, in document order, in one small
 * stagger. A `data-reveal-group` attribute starts a fresh stagger, so a grid
 * of cards doesn't inherit the delay owed to the heading above it.
 *
 * Returns the ref to put on the section element.
 */
export function useReveal<T extends HTMLElement>(options: { start?: string; y?: number } = {}) {
  const ref = useRef<T>(null);
  const { start = 'top 82%', y = 26 } = options;

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    if (prefersReducedMotion()) return;

    const ctx = gsap.context(() => {
      const groups = new Map<string, HTMLElement[]>();
      root.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => {
        const key = el.closest<HTMLElement>('[data-reveal-group]')?.dataset.revealGroup ?? 'root';
        const bucket = groups.get(key);
        if (bucket) bucket.push(el);
        else groups.set(key, [el]);
      });

      groups.forEach((elements) => {
        gsap.set(elements, { opacity: 0, y });
        gsap.to(elements, {
          opacity: 1,
          y: 0,
          duration: 0.78,
          ease: EASE,
          stagger: 0.07,
          scrollTrigger: { trigger: root, start },
        });
      });
    }, root);

    return () => ctx.revert();
  }, [start, y]);

  return ref;
}

/**
 * Reveals a heading one word at a time.
 *
 * The element must already contain an unsplit copy of the text for assistive
 * technology and for the no-JavaScript case; the per-word spans it animates
 * are `aria-hidden` decoration. See `SplitHeading` in kit.tsx, which is the
 * only thing that should be calling this.
 */
export function useWordReveal<T extends HTMLElement>(start = 'top 80%') {
  const ref = useRef<T>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    if (prefersReducedMotion()) return;

    const words = root.querySelectorAll<HTMLElement>('[data-reveal-word] > span');
    if (words.length === 0) return;

    const ctx = gsap.context(() => {
      gsap.set(words, { yPercent: 108, opacity: 0 });
      gsap.to(words, {
        yPercent: 0,
        opacity: 1,
        duration: 0.9,
        ease: 'power4.out',
        stagger: 0.045,
        scrollTrigger: { trigger: root, start },
      });
    }, root);

    return () => ctx.revert();
  }, [start]);

  return ref;
}

/* ── Numbers ──────────────────────────────────────────────────────── */

/**
 * Counts a figure up the first time it scrolls into view. Renders the real
 * value straight away under reduced motion, and — because the initial state
 * is the target, not zero — also when JavaScript never runs.
 */
export function useCountUp(target: number, decimals = 0): [(node: HTMLElement | null) => void, string] {
  const [text, setText] = useState(() => target.toFixed(decimals));
  const done = useRef(false);

  const setRef = (node: HTMLElement | null) => {
    if (!node || done.current) return;
    if (prefersReducedMotion()) return;
    done.current = true;

    const counter = { value: 0 };
    setText((0).toFixed(decimals));

    ScrollTrigger.create({
      trigger: node,
      start: 'top 88%',
      once: true,
      onEnter: () => {
        gsap.to(counter, {
          value: target,
          duration: 1.5,
          ease: 'power2.out',
          onUpdate: () => setText(counter.value.toFixed(decimals)),
        });
      },
    });
  };

  return [setRef, text];
}

/** `1248` → `1,248`, for figures that are counts rather than measurements. */
export function group(value: string): string {
  const [whole, fraction] = value.split('.');
  const grouped = Number(whole).toLocaleString('en-US');
  return fraction ? `${grouped}.${fraction}` : grouped;
}
