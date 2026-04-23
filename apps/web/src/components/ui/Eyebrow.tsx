import type { HTMLAttributes, ReactNode } from "react";

import styles from "./Eyebrow.module.css";

export type EyebrowProps = HTMLAttributes<HTMLSpanElement> & {
  withDot?: boolean;
  children: ReactNode;
};

export function Eyebrow({ withDot = true, className, children, ...rest }: EyebrowProps) {
  return (
    <span className={[styles.eyebrow, className].filter(Boolean).join(" ")} {...rest}>
      {withDot ? <span className={styles.dot} aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
