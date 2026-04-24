"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui";

import styles from "./DecideButtons.module.css";

/**
 * 리드 전용 승인/거절 버튼. POST /api/translations/:slug/proposals/:id/decide.
 *
 * 409 분기:
 *  - rebase_required (approve만): 세그먼트가 그 사이 바뀌었다. 현재 본문을
 *    그대로 표기해 리드가 파악할 수 있게 한다.
 *  - not_open: 다른 곳에서 먼저 결정됨. 바로 refresh해 최신 상태로 수렴.
 *
 * ADR-0003의 optimistic lock은 서버에서 UPDATE WHERE version=expected로
 * 더블 체크되므로 클라이언트는 에러 코드만 신뢰하면 된다.
 */

export type DecideButtonsProps = {
  slug: string;
  proposalId: string;
};

type State =
  | { phase: "idle" }
  | { phase: "submitting"; action: "approve" | "reject" }
  | { phase: "rebase-required"; currentVersion: number; currentText: string }
  | { phase: "error"; message: string };

export function DecideButtons({ slug, proposalId }: DecideButtonsProps) {
  const router = useRouter();
  const [state, setState] = useState<State>({ phase: "idle" });

  async function decide(action: "approve" | "reject") {
    setState({ phase: "submitting", action });
    let res: Response;
    try {
      res = await fetch(
        `/api/translations/${encodeURIComponent(slug)}/proposals/${encodeURIComponent(proposalId)}/decide`,
        {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ action }),
        },
      );
    } catch (err) {
      setState({
        phase: "error",
        message: `API에 연결하지 못했습니다: ${err instanceof Error ? err.message : String(err)}`,
      });
      return;
    }

    if (res.status === 200) {
      setState({ phase: "idle" });
      router.refresh();
      return;
    }

    let body: { code?: string; currentVersion?: number; currentText?: string } = {};
    try {
      body = (await res.json()) as typeof body;
    } catch {
      /* ignore */
    }

    if (res.status === 409 && body.code === "rebase_required") {
      setState({
        phase: "rebase-required",
        currentVersion: body.currentVersion ?? -1,
        currentText: body.currentText ?? "",
      });
      return;
    }
    if (res.status === 409 && body.code === "not_open") {
      // 다른 주체가 먼저 처리. 사용자에게 별도 알림 없이 목록을 새로 고친다.
      setState({ phase: "idle" });
      router.refresh();
      return;
    }
    setState({
      phase: "error",
      message: `HTTP ${res.status}${body.code ? ` (${body.code})` : ""}`,
    });
  }

  return (
    <div>
      <div className={styles.row}>
        <Button size="sm" onClick={() => decide("approve")} disabled={state.phase === "submitting"}>
          {state.phase === "submitting" && state.action === "approve" ? "승인 중" : "승인"}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => decide("reject")}
          disabled={state.phase === "submitting"}
        >
          {state.phase === "submitting" && state.action === "reject" ? "거절 중" : "거절"}
        </Button>
      </div>
      {state.phase === "rebase-required" ? (
        <p className={styles.warn}>
          이 세그먼트가 그 사이 수정되어 버전이 어긋났습니다 (현재 v{state.currentVersion}). 현재
          번역을 확인한 뒤 승인 여부를 다시 판단해 주세요.{"\n"}
          현재 번역: {state.currentText}
        </p>
      ) : null}
      {state.phase === "error" ? <p className={styles.error}>처리 실패: {state.message}</p> : null}
    </div>
  );
}
