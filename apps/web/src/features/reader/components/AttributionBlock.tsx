"use client";

import { useState } from "react";

import { Button, LicenseBadge } from "@/components/ui";

import type { Contributor, Source, Translation } from "../types";

import styles from "./AttributionBlock.module.css";

export type AttributionBlockProps = {
  source: Source;
  translation: Translation;
  contributors: Contributor[];
};

const LICENSE_LONG: Record<Source["license"], string> = {
  "CC-BY": "Creative Commons 저작자표시 (CC BY 4.0)",
  "CC-BY-SA": "Creative Commons 저작자표시-동일조건변경허락 (CC BY-SA 4.0)",
  PD: "Public Domain",
  "CC-BY-ND": "CC BY-ND — 번역본 제작 차단",
  "CC-BY-NC-ND": "CC BY-NC-ND — 번역본 제작 차단",
};

function formatCitation(source: Source, translation: Translation): string {
  const authorList = source.author.join(", ");
  const leadName = translation.leadDisplayName;
  const url = source.attributionSource;
  const license = translation.license === "CC-BY-SA" ? "CC BY-SA 4.0" : "CC BY 4.0";
  return `${authorList}. "${source.title}." 한국어 번역: ${leadName}(와/과 기여자들). 원문 ${url}. 번역본 라이선스 ${license}.`;
}

export function AttributionBlock({ source, translation, contributors }: AttributionBlockProps) {
  const citation = formatCitation(source, translation);
  const shareAlike = translation.license === "CC-BY-SA";
  // "복사됨" 라벨을 짧게 띄웠다 사라지는 가벼운 피드백. clipboard write가 실패한
  // 경우(권한·http 환경)에는 textarea로 fallback해 select 상태만 보장한다.
  const [copied, setCopied] = useState<"idle" | "ok" | "err">("idle");

  async function copyCitation() {
    try {
      await navigator.clipboard.writeText(citation);
      setCopied("ok");
    } catch {
      setCopied("err");
    }
    window.setTimeout(() => setCopied("idle"), 1800);
  }

  return (
    <section className={styles.block} aria-label="출처와 기여자">
      <div className={styles.row}>
        <span className={styles.label}>원저자</span>
        <span className={styles.value}>{source.author.join(", ")}</span>
      </div>
      <div className={styles.row}>
        <span className={styles.label}>원문</span>
        <span className={styles.value}>
          <a href={source.attributionSource} rel="noreferrer">
            {source.attributionSource}
          </a>{" "}
          · {source.sourceVersion}
        </span>
      </div>
      <div className={styles.row}>
        <span className={styles.label}>원문 라이선스</span>
        <span className={styles.value}>
          <span className={styles.badges}>
            <LicenseBadge kind={source.license} />
            <span>{LICENSE_LONG[source.license]}</span>
          </span>
        </span>
      </div>
      <div className={styles.row}>
        <span className={styles.label}>번역본 라이선스</span>
        <span className={styles.value}>
          <span className={styles.badges}>
            <LicenseBadge kind={translation.license} />
            {shareAlike ? <span>원문의 ShareAlike 조건이 승계된다.</span> : null}
          </span>
        </span>
      </div>
      <div className={styles.row}>
        <span className={styles.label}>리드</span>
        <span className={styles.value}>{translation.leadDisplayName}</span>
      </div>
      <div className={styles.row}>
        <span className={styles.label}>기여자</span>
        <ul className={styles.contributorList}>
          {contributors.map((c) => (
            <li key={c.userId} className={styles.contributorChip}>
              <span>{c.displayName}</span>
              {c.githubHandle ? (
                <span className={styles.contributorHandle}>@{c.githubHandle}</span>
              ) : null}
              <span className={styles.contributorCount}>· merged {c.mergedProposalCount}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className={styles.copyRow}>
        <div className={styles.copyHeader}>
          <span className={styles.label}>인용 문자열</span>
          <Button size="sm" variant="secondary" onClick={copyCitation}>
            {copied === "ok" ? "복사됨" : copied === "err" ? "복사 실패" : "복사"}
          </Button>
        </div>
        <p className={styles.copyQuote}>{citation}</p>
      </div>
    </section>
  );
}
