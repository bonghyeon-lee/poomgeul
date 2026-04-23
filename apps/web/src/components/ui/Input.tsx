"use client";

import { useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";

import styles from "./Input.module.css";

type FieldCommonProps = {
  label: ReactNode;
  hint?: ReactNode;
  errorMessage?: ReactNode;
  optional?: boolean;
  mono?: boolean;
  id?: string;
  className?: string;
};

export type InputProps = FieldCommonProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "className">;

export type TextareaProps = FieldCommonProps &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id" | "className">;

function composeClassName(base: string, extras: Array<string | undefined | false>): string {
  return [base, ...extras].filter(Boolean).join(" ");
}

function LabelRow({
  htmlFor,
  label,
  optional,
  hasError,
}: {
  htmlFor: string;
  label: ReactNode;
  optional?: boolean;
  hasError: boolean;
}) {
  return (
    <label className={styles.label} htmlFor={htmlFor}>
      <span>{label}</span>
      {optional ? <span className={styles.optional}>· 선택</span> : null}
      {hasError ? <span className={styles.errorTag}>· 오류</span> : null}
    </label>
  );
}

function FieldMeta({ hint, errorMessage, describedBy }: {
  hint?: ReactNode;
  errorMessage?: ReactNode;
  describedBy: string;
}) {
  if (errorMessage) {
    return (
      <span className={styles.errorMsg} id={describedBy} role="alert">
        {errorMessage}
      </span>
    );
  }
  if (hint) {
    return (
      <span className={styles.hint} id={describedBy}>
        {hint}
      </span>
    );
  }
  return null;
}

export function Input({
  label,
  hint,
  errorMessage,
  optional,
  mono,
  id,
  className,
  ...rest
}: InputProps) {
  const reactId = useId();
  const controlId = id ?? `inp-${reactId}`;
  const metaId = `${controlId}-meta`;
  const hasError = Boolean(errorMessage);
  const controlCls = composeClassName(styles.control!, [
    mono ? styles.mono : undefined,
    hasError ? styles.invalid : undefined,
  ]);
  const fieldCls = composeClassName(styles.field!, [className]);

  return (
    <div className={fieldCls}>
      <LabelRow htmlFor={controlId} label={label} optional={optional} hasError={hasError} />
      <input
        id={controlId}
        className={controlCls}
        aria-invalid={hasError || undefined}
        aria-describedby={hint || errorMessage ? metaId : undefined}
        {...rest}
      />
      <FieldMeta hint={hint} errorMessage={errorMessage} describedBy={metaId} />
    </div>
  );
}

export function Textarea({
  label,
  hint,
  errorMessage,
  optional,
  mono,
  id,
  className,
  rows = 3,
  ...rest
}: TextareaProps) {
  const reactId = useId();
  const controlId = id ?? `ta-${reactId}`;
  const metaId = `${controlId}-meta`;
  const hasError = Boolean(errorMessage);
  const controlCls = composeClassName(styles.control!, [
    styles.textarea,
    mono ? styles.mono : undefined,
    hasError ? styles.invalid : undefined,
  ]);
  const fieldCls = composeClassName(styles.field!, [className]);

  return (
    <div className={fieldCls}>
      <LabelRow htmlFor={controlId} label={label} optional={optional} hasError={hasError} />
      <textarea
        id={controlId}
        className={controlCls}
        rows={rows}
        aria-invalid={hasError || undefined}
        aria-describedby={hint || errorMessage ? metaId : undefined}
        {...rest}
      />
      <FieldMeta hint={hint} errorMessage={errorMessage} describedBy={metaId} />
    </div>
  );
}
