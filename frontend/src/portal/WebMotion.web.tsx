import React, { ReactNode } from "react";
import {
  AnimatePresence,
  motion,
  MotionConfig,
  useReducedMotion,
} from "motion/react";
export { AnimatePresence, motion };
export function WebMotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig
      reducedMotion="user"
      transition={{ duration: 0.22, ease: "easeOut" }}
    >
      {children}
    </MotionConfig>
  );
}
export function PageTransition({
  children,
  page,
  className = "p-grid",
}: {
  children: ReactNode;
  page: string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={page}
        initial={{ opacity: 0, y: reduce ? 0 : 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: reduce ? 0 : -4 }}
        transition={{ duration: reduce ? 0 : 0.18 }}
        style={{ minWidth: 0 }}
        className={className}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
