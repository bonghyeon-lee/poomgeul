import type { HTMLAttributes } from "react";

import styles from "./LicenseBadge.module.css";

export type LicenseKind =
  | "CC-BY"
  | "CC-BY-SA"
  | "PD"
  | "CC-BY-ND"
  | "CC-BY-NC-ND";

const LABEL: Record<LicenseKind, string> = {
  "CC-BY": "CC BY",
  "CC-BY-SA": "CC BY-SA",
  PD: "Public Domain",
  "CC-BY-ND": "CC BY-ND",
  "CC-BY-NC-ND": "CC BY-NC-ND",
};

function variantClass(kind: LicenseKind): string {
  switch (kind) {
    case "CC-BY":
      return styles["license-ccby"]!;
    case "CC-BY-SA":
      return styles["license-ccbysa"]!;
    case "PD":
      return styles["license-pd"]!;
    case "CC-BY-ND":
    case "CC-BY-NC-ND":
      return styles["license-blocked"]!;
  }
}

export type LicenseBadgeProps = HTMLAttributes<HTMLSpanElement> & {
  kind: LicenseKind;
};

export function LicenseBadge({ kind, className, ...rest }: LicenseBadgeProps) {
  const cls = [styles.badge, variantClass(kind), className].filter(Boolean).join(" ");
  const label = LABEL[kind];
  return (
    <span className={cls} aria-label={`라이선스: ${label}`} {...rest}>
      <span className={styles.glyph} aria-hidden="true" />
      <span className={styles.label}>{label}</span>
    </span>
  );
}
