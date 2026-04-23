import Image from "next/image";
import Link from "next/link";

import styles from "./Logo.module.css";

export type LogoVariant = "wordmark-ko" | "wordmark" | "mark";

const SOURCES: Record<LogoVariant, { src: string; width: number; height: number; alt: string }> = {
  "wordmark-ko": {
    src: "/brand/logo-wordmark-ko.svg",
    width: 140,
    height: 48,
    alt: "품글 poomgeul",
  },
  wordmark: {
    src: "/brand/logo-wordmark.svg",
    width: 220,
    height: 48,
    alt: "poomgeul",
  },
  mark: {
    src: "/brand/logo-mark.svg",
    width: 48,
    height: 48,
    alt: "poomgeul",
  },
};

export type LogoProps = {
  variant?: LogoVariant;
  href?: string;
  className?: string;
  priority?: boolean;
  ariaLabel?: string;
};

export function Logo({
  variant = "wordmark-ko",
  href = "/",
  className,
  priority = false,
  ariaLabel = "poomgeul 홈",
}: LogoProps) {
  const { src, width, height, alt } = SOURCES[variant];
  const cls = [styles.logo, className].filter(Boolean).join(" ");
  const img = <Image src={src} alt={alt} width={width} height={height} priority={priority} />;

  if (href) {
    return (
      <Link href={href} className={cls} aria-label={ariaLabel}>
        {img}
      </Link>
    );
  }
  return <span className={cls}>{img}</span>;
}
