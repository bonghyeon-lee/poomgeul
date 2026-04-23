import type { HTMLAttributes, ReactNode } from "react";

import styles from "./Card.module.css";

type CardPadding = "default" | "dense";

export type CardProps = HTMLAttributes<HTMLElement> & {
  as?: "div" | "article" | "section";
  padding?: CardPadding;
  children: ReactNode;
};

export function Card({
  as: Tag = "article",
  padding = "default",
  className,
  children,
  ...rest
}: CardProps) {
  const cls = [styles.card, styles[padding], className].filter(Boolean).join(" ");
  return (
    <Tag className={cls} {...rest}>
      {children}
    </Tag>
  );
}

export type CardEyebrowProps = HTMLAttributes<HTMLSpanElement> & { children: ReactNode };
export function CardEyebrow({ className, children, ...rest }: CardEyebrowProps) {
  return (
    <span className={[styles.eyebrow, className].filter(Boolean).join(" ")} {...rest}>
      {children}
    </span>
  );
}

export type CardTitleProps = HTMLAttributes<HTMLHeadingElement> & {
  as?: "h2" | "h3" | "h4";
  children: ReactNode;
};
export function CardTitle({ as: Tag = "h3", className, children, ...rest }: CardTitleProps) {
  return (
    <Tag className={[styles.title, className].filter(Boolean).join(" ")} {...rest}>
      {children}
    </Tag>
  );
}

export type CardBodyProps = HTMLAttributes<HTMLParagraphElement> & { children: ReactNode };
export function CardBody({ className, children, ...rest }: CardBodyProps) {
  return (
    <p className={[styles.body, className].filter(Boolean).join(" ")} {...rest}>
      {children}
    </p>
  );
}
