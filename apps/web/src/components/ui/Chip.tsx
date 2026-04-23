import type { HTMLAttributes, ReactNode } from "react";

import styles from "./Chip.module.css";

export type ProposalStatus = "open" | "merged" | "rejected" | "stale" | "withdrawn";

export type ChipProps = HTMLAttributes<HTMLSpanElement> & {
  status: ProposalStatus;
  children: ReactNode;
};

export function Chip({ status, className, children, ...rest }: ChipProps) {
  const cls = [styles.chip, styles[status], className].filter(Boolean).join(" ");
  return (
    <span className={cls} {...rest}>
      <span className={styles.dot} aria-hidden="true" />
      {children}
    </span>
  );
}
