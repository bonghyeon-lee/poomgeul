"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui";

import styles from "./ReprocessButton.module.css";

/**
 * Reader의 PendingSegmentsView에서 쓰는 client 전용 버튼.
 * POST /api/translations/:slug/reprocess 호출 → 성공 시 router.refresh()로 서버 컴포넌트 재렌더.
 *
 * 응답이 수십 초~수 분 걸릴 수 있어, 요청 중엔 elapsed 타이머와 추정 단계를 보여준다.
 * 정확한 진행률은 서버가 단일 동기 응답을 돌려주는 구조라 알 수 없어, 경과 시간 기반의
 * 휴리스틱으로 단계명만 바꾼다. 진짜 진행률이 필요하면 이후 SSE/폴링으로 확장.
 *
 * 자동 트리거는 일부러 안 둔다(arXiv·Gemini rate limit). 사용자가 누를 때만 동작.
 */

type ReprocessSuccess = {
  outcome: "reprocessed";
  segmentCount: number;
  segmentationStatus: "ok" | "skipped" | "upstream-error";
  draftStatus: "ok" | "skipped" | "partial" | "failed";
  draftSucceeded: number;
  draftFailed: number;
};

type ReprocessApiResult =
  | ReprocessSuccess
  | { outcome: "not-found"; reason: string }
  | { outcome: "unsupported-format"; reason: string };

type State =
  | { phase: "idle" }
  | { phase: "running"; startedAt: number }
  | { phase: "done"; result: ReprocessSuccess; durationMs: number }
  | { phase: "error"; message: string };

export function ReprocessButton({ slug }: { slug: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ phase: "idle" });
  const [now, setNow] = useState(() => Date.now());
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // running 중에만 매초 now를 갱신해 elapsed/단계를 다시 계산하게 한다.
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
      res = await fetch(`/api/translations/${encodeURIComponent(slug)}/reprocess`, {
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
      setState({ phase: "error", message: `HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}` });
      return;
    }

    const body = (await res.json()) as ReprocessApiResult;
    if (body.outcome === "not-found" || body.outcome === "unsupported-format") {
      setState({ phase: "error", message: body.reason });
      return;
    }

    setState({
      phase: "done",
      result: body,
      durationMs: Date.now() - startedAt,
    });
    router.refresh();
  }

  return (
    <div className={styles.wrap}>
      <Button onClick={handleClick} disabled={state.phase === "running"}>
        {state.phase === "running" ? "재처리 중" : "지금 재처리"}
      </Button>

      {state.phase === "running" ? (
        <RunningView startedAt={state.startedAt} now={now} />
      ) : null}

      {state.phase === "done" ? <DoneView result={state.result} durationMs={state.durationMs} /> : null}

      {state.phase === "error" ? (
        <p className={styles.errorMsg}>재처리 실패: {state.message}</p>
      ) : null}
    </div>
  );
}

function RunningView({ startedAt, now }: { startedAt: number; now: number }) {
  const elapsedMs = Math.max(0, now - startedAt);
  const { label, detail } = estimateStage(elapsedMs);
  return (
    <div className={styles.progress} role="status" aria-live="polite">
      <div className={styles.stageLine}>
        <span className={styles.stage}>
          <span className={styles.dots}>{label}</span>
        </span>
        <span className={styles.elapsed}>{formatElapsed(elapsedMs)}</span>
      </div>
      <span className={styles.stageDetail}>{detail}</span>
    </div>
  );
}

function DoneView({ result, durationMs }: { result: ReprocessSuccess; durationMs: number }) {
  const cls = summaryClass(result);
  return (
    <div className={cls} role="status" aria-live="polite">
      <span className={styles.summaryHead}>{summaryHeadline(result)}</span>
      <span className={styles.summaryBody}>{summaryBody(result)}</span>
      <span className={styles.summaryStats}>
        <span>segments: {result.segmentCount}</span>
        <span>
          drafts: {result.draftSucceeded} ok · {result.draftFailed} fallback
        </span>
        <span>elapsed: {formatElapsed(durationMs)}</span>
      </span>
    </div>
  );
}

/**
 * 서버가 단일 응답을 돌려주는 구조라 실제 진행률은 알 수 없다. 경과 시간으로
 * 현재 어느 단계인지 추정해 사용자에게 "멈춘 것 아님"을 전달한다. 추정 구간은
 * 세그먼트 수에 무관하게 보수적으로 넓게 잡음.
 */
function estimateStage(elapsedMs: number): { label: string; detail: string } {
  if (elapsedMs < 4_000) {
    return {
      label: "ar5iv HTML 가져오는 중",
      detail: "arXiv의 ar5iv 미러에서 논문 HTML을 가져오고 있습니다. 처음 수 초간 시간이 소요될 수 있습니다.",
    };
  }
  if (elapsedMs < 8_000) {
    return {
      label: "세그먼트 분할 중",
      detail:
        "본문 문단을 문장 단위로 분할하고 있습니다. 수식·캡션·참고문헌을 종류별로 분류합니다.",
    };
  }
  if (elapsedMs < 20_000) {
    return {
      label: "AI 초벌 번역 중",
      detail:
        "세그먼트 하나당 약 2초씩 Gemini 2.5 Flash로 요청을 보냅니다. 세그먼트 수에 비례하여 시간이 소요됩니다.",
    };
  }
  if (elapsedMs < 90_000) {
    return {
      label: "AI 초벌 번역 중 (긴 논문)",
      detail:
        "초벌 번역이 아직 진행 중입니다. 수십 개의 세그먼트가 순차적으로 처리됩니다. 할당량(rate limit)에 도달하면 일부는 원문으로 유지될 수 있습니다.",
    };
  }
  return {
    label: "거의 끝나가는 중",
    detail:
      "예상보다 시간이 다소 소요되고 있습니다. Gemini API 할당량 문제이거나 네트워크가 불안정할 수 있습니다. 응답이 도착하는 대로 결과가 표시됩니다.",
  };
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m > 0) return `${m}m ${s.toString().padStart(2, "0")}s`;
  return `${s}s`;
}

function summaryClass(result: ReprocessSuccess): string {
  if (result.segmentCount === 0) return `${styles.summary} ${styles.summaryErr}`;
  if (result.draftStatus === "failed") return `${styles.summary} ${styles.summaryErr}`;
  if (result.draftStatus === "partial" || result.segmentationStatus !== "ok") {
    return `${styles.summary} ${styles.summaryWarn}`;
  }
  return styles.summary!;
}

function summaryHeadline(result: ReprocessSuccess): string {
  if (result.segmentCount === 0) {
    if (result.segmentationStatus === "upstream-error") {
      return "ar5iv 호출에 실패했습니다";
    }
    // skipped: ar5iv가 이 논문을 렌더하지 못해 arxiv.org/abs로 리다이렉트한 경우가 대부분.
    return "ar5iv에서 이 논문을 지원하지 않습니다";
  }
  if (result.draftStatus === "failed") return "초벌 번역에 모두 실패했습니다";
  if (result.draftStatus === "partial") return "재처리가 완료되었습니다 (일부 번역 실패)";
  if (result.draftStatus === "skipped") return "재처리가 완료되었습니다 (번역 건너뜀 - API 키 미설정)";
  return "재처리가 완료되었습니다";
}

function summaryBody(result: ReprocessSuccess): string {
  if (result.segmentCount === 0) {
    if (result.segmentationStatus === "upstream-error") {
      return "ar5iv 서버가 5xx 오류를 반환했습니다. 일시적인 장애일 수 있으니 잠시 후 다시 시도해 주세요.";
    }
    return (
      "ar5iv 미러가 이 논문의 HTML 렌더링을 제공하지 않습니다(수식이 매우 복잡하거나 최신 논문인 경우). " +
      "현재 버전에서는 ar5iv 기반 파서만 사용하므로 이 논문은 번역 대상이 될 수 없습니다. " +
      "M1 단계에서 PDF 기반 파서가 지원되면 다시 시도하실 수 있습니다."
    );
  }
  if (result.draftStatus === "failed") {
    return `${result.segmentCount}개 세그먼트 전부에 대해 초벌 번역이 실패했습니다. 실패한 세그먼트는 원문 그대로 유지됩니다. API 키 설정과 할당량을 확인해 주세요.`;
  }
  if (result.draftStatus === "partial") {
    return `${result.segmentCount}개 세그먼트 중 ${result.draftSucceeded}개는 번역되었고, ${result.draftFailed}개는 원문으로 유지되었습니다. 실패한 부분은 추후 개별 재시도 기능을 통해 보완하실 수 있습니다.`;
  }
  if (result.draftStatus === "skipped") {
    return `${result.segmentCount}개 세그먼트가 분할되었으나, API 키가 설정되지 않아 번역을 건너뛰었습니다. 현재 원문만 채워진 상태입니다.`;
  }
  return `${result.segmentCount}개 세그먼트가 모두 분할되었으며, ${result.draftSucceeded}개 모두 Gemini 초벌 번역이 생성되었습니다.`;
}
