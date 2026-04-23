"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui";

import styles from "./ReprocessButton.module.css";

/**
 * Reader에 노출되는 "실패분만 재시도" 버튼.
 * POST /api/translations/:slug/retry-failed 호출.
 * 세그먼트 재분할 없이 aiDraftText=null인 번역 세그먼트만 다시 Gemini에 보낸다.
 */

type RetrySuccess = {
  outcome: "retried";
  attemptedCount: number;
  draftStatus: "ok" | "skipped" | "partial" | "failed";
  draftSucceeded: number;
  draftFailed: number;
};

type RetryApiResult =
  | RetrySuccess
  | { outcome: "nothing-to-retry" }
  | { outcome: "not-found"; reason: string };

type State =
  | { phase: "idle" }
  | { phase: "running"; startedAt: number }
  | { phase: "done"; result: RetrySuccess; durationMs: number }
  | { phase: "done-nothing" }
  | { phase: "error"; message: string };

export function RetryFailedButton({ slug, failedCount }: { slug: string; failedCount: number }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ phase: "idle" });
  const [now, setNow] = useState(() => Date.now());
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (state.phase !== "running") {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
      return;
    }
    setNow(Date.now());
    tickRef.current = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      tickRef.current = null;
    };
  }, [state.phase]);

  async function handleClick() {
    const startedAt = Date.now();
    setState({ phase: "running", startedAt });

    let res: Response;
    try {
      res = await fetch(`/api/translations/${encodeURIComponent(slug)}/retry-failed`, {
        method: "POST",
        headers: { accept: "application/json" },
      });
    } catch (err) {
      setState({
        phase: "error",
        message: `API에 연결하지 못했습니다: ${err instanceof Error ? err.message : String(err)}`,
      });
      return;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      setState({
        phase: "error",
        message: `HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`,
      });
      return;
    }

    const body = (await res.json()) as RetryApiResult;
    if (body.outcome === "not-found") {
      setState({ phase: "error", message: body.reason });
      return;
    }
    if (body.outcome === "nothing-to-retry") {
      setState({ phase: "done-nothing" });
      router.refresh();
      return;
    }

    setState({ phase: "done", result: body, durationMs: Date.now() - startedAt });
    router.refresh();
  }

  return (
    <div className={styles.wrap}>
      <Button onClick={handleClick} disabled={state.phase === "running" || failedCount === 0}>
        {state.phase === "running"
          ? "재시도 중"
          : failedCount === 0
            ? "실패분 없음"
            : `실패분 ${failedCount}개 재시도`}
      </Button>

      {state.phase === "running" ? (
        <RunningView startedAt={state.startedAt} now={now} attempted={failedCount} />
      ) : null}

      {state.phase === "done" ? (
        <DoneView result={state.result} durationMs={state.durationMs} />
      ) : null}

      {state.phase === "done-nothing" ? (
        <p className={styles.stageDetail}>
          번역이 실패한 세그먼트가 없어 재시도할 대상이 없습니다.
        </p>
      ) : null}

      {state.phase === "error" ? (
        <p className={styles.errorMsg}>재시도 실패: {state.message}</p>
      ) : null}
    </div>
  );
}

function RunningView({
  startedAt,
  now,
  attempted,
}: {
  startedAt: number;
  now: number;
  attempted: number;
}) {
  const elapsedMs = Math.max(0, now - startedAt);
  return (
    <div className={styles.progress} role="status" aria-live="polite">
      <div className={styles.stageLine}>
        <span className={styles.stage}>
          <span className={styles.dots}>
            실패한 {attempted}개 세그먼트를 묶어 다시 번역 중입니다
          </span>
        </span>
        <span className={styles.elapsed}>{formatElapsed(elapsedMs)}</span>
      </div>
      <span className={styles.stageDetail}>
        세그먼트 8개씩 묶어 Gemini로 요청을 보냅니다. 호출 간 4초의 간격이 강제되므로 분량이 많으면
        몇 분 정도 소요될 수 있습니다.
      </span>
    </div>
  );
}

function DoneView({ result, durationMs }: { result: RetrySuccess; durationMs: number }) {
  const cls = summaryClass(result);
  return (
    <div className={cls} role="status" aria-live="polite">
      <span className={styles.summaryHead}>{summaryHeadline(result)}</span>
      <span className={styles.summaryBody}>{summaryBody(result)}</span>
      <span className={styles.summaryStats}>
        <span>attempted: {result.attemptedCount}</span>
        <span>
          drafts: {result.draftSucceeded} ok · {result.draftFailed} fallback
        </span>
        <span>elapsed: {formatElapsed(durationMs)}</span>
      </span>
    </div>
  );
}

function summaryClass(result: RetrySuccess): string {
  if (result.draftStatus === "failed") return `${styles.summary} ${styles.summaryErr}`;
  if (result.draftStatus === "partial" || result.draftStatus === "skipped") {
    return `${styles.summary} ${styles.summaryWarn}`;
  }
  return styles.summary!;
}

function summaryHeadline(result: RetrySuccess): string {
  if (result.draftStatus === "failed") return "모든 재시도가 실패했습니다";
  if (result.draftStatus === "partial") return "일부는 복구되었으나 일부는 다시 실패했습니다";
  if (result.draftStatus === "skipped") return "번역을 건너뛰었습니다 (API 키 미설정)";
  return "재시도에 성공했습니다";
}

function summaryBody(result: RetrySuccess): string {
  if (result.draftStatus === "failed") {
    return `${result.attemptedCount}개 세그먼트 모두 다시 실패했습니다. Gemini 할당량 복구를 기다린 후 다시 시도해 주세요.`;
  }
  if (result.draftStatus === "partial") {
    return `${result.attemptedCount}개 중 ${result.draftSucceeded}개는 번역되었고, ${result.draftFailed}개는 여전히 원문 상태입니다. 남은 실패분은 이후에 다시 재시도하실 수 있습니다.`;
  }
  if (result.draftStatus === "skipped") {
    return `API 키가 설정되지 않아 번역을 건너뛰었습니다.`;
  }
  return `${result.attemptedCount}개 세그먼트가 모두 번역되었습니다.`;
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m > 0) return `${m}m ${s.toString().padStart(2, "0")}s`;
  return `${s}s`;
}
