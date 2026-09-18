/** Shared motion tokens — one easing curve and timing scale across the app (2026 "settle" feel). */
export const EASE_OUT = [0.16, 1, 0.3, 1] as const;

/** Subtle lift on hover / press feedback for interactive surfaces (spread into motion.* props). */
export const hoverLift = { whileHover: { y: -3, transition: { duration: 0.2, ease: EASE_OUT } }, whileTap: { scale: 0.985 } } as const;
