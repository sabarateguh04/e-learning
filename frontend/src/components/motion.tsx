import type { ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'framer-motion';

import { EASE_OUT } from '../lib/motionTokens';

const pageVariants: Variants = {
  initial: { opacity: 0, y: 14, filter: 'blur(4px)' },
  enter: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.42, ease: EASE_OUT } },
  exit: { opacity: 0, y: -8, filter: 'blur(2px)', transition: { duration: 0.18, ease: 'easeIn' } },
};

/** Route-level transition: fade + slide-up on enter, quick fade-out on leave. */
export function PageTransition({ routeKey, children, className = '' }: { routeKey: string; children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={routeKey} variants={reduce ? undefined : pageVariants} initial="initial" animate="enter" exit="exit" className={className}>
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

const stepVariants: Variants = {
  initial: (dir: number) => ({ opacity: 0, x: dir >= 0 ? 32 : -32 }),
  enter: { opacity: 1, x: 0, transition: { duration: 0.32, ease: EASE_OUT } },
  exit: (dir: number) => ({ opacity: 0, x: dir >= 0 ? -24 : 24, transition: { duration: 0.16, ease: 'easeIn' } }),
};

/** Wizard step transition: slides in the direction of navigation. */
export function StepTransition({ stepKey, direction, children }: { stepKey: string | number; direction: number; children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence mode="wait" custom={direction} initial={false}>
      <motion.div key={stepKey} custom={direction} variants={reduce ? undefined : stepVariants} initial="initial" animate="enter" exit="exit">
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

const listVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
};
const itemVariants: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.38, ease: EASE_OUT } },
};

/** Staggered card entrance for grids/lists. Wrap children in <MotionItem>. */
export function MotionList({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <motion.div variants={listVariants} initial="hidden" animate="show" className={className}>
      {children}
    </motion.div>
  );
}

export function MotionItem({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <motion.div variants={itemVariants} className={className}>
      {children}
    </motion.div>
  );
}
