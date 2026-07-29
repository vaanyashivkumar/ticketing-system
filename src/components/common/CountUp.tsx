import { useRef } from 'react';
import { useMotionScope } from '@hooks/useMotion';
import { countTo } from '@lib/motion';

interface CountUpProps {
  readonly value: number;
  readonly decimals?: number;
  readonly className?: string;
  /** Delay in seconds, for staggering a row of tiles. */
  readonly delay?: number;
}

/**
 * A number that counts up to its value on mount.
 *
 * USED ONLY ON DASHBOARD KPI TILES, and that restriction is the design. On a KPI the figure *is*
 * the content — the tile exists to say "seven overdue" — so animating it draws the eye to the one
 * thing worth reading. Applied to a table cell, a filter count or a queue badge it would be
 * actively harmful: those numbers are read in passing, and a value that is briefly WRONG on its
 * way to being right is a value someone can act on. "Backlog 3" en route to 47 is a decision made
 * on a number that never existed.
 *
 * ---------------------------------------------------------------------------
 * WHAT ASSISTIVE TECHNOLOGY GETS.
 *
 * The animated node is `aria-hidden`, and the true value is rendered beside it in a visually
 * hidden span. Without that split, a screen reader reaching the tile mid-tween would announce
 * whatever frame it landed on — a plausible, specific, wrong number, announced with confidence.
 * The visible text and the announced text are the same by the time anyone reads either; this
 * guarantees they are never different for anyone.
 *
 * The animated span also renders `value` as its initial React children, so the DOM is correct
 * before GSAP touches it. If the motion layer never runs, the number is simply there.
 */
export function CountUp({ value, decimals = 0, className, delay = 0 }: CountUpProps) {
  const el = useRef<HTMLSpanElement>(null);

  const scope = useMotionScope<HTMLSpanElement>(() => {
    if (el.current) countTo(el.current, value, { decimals, duration: 0.5 + delay });
  }, [value, decimals, delay]);

  return (
    <span ref={scope}>
      <span ref={el} className={className} aria-hidden>
        {decimals > 0 ? value.toFixed(decimals) : value.toLocaleString('en-GB')}
      </span>
      <span className="sr-only">
        {decimals > 0 ? value.toFixed(decimals) : value.toLocaleString('en-GB')}
      </span>
    </span>
  );
}
