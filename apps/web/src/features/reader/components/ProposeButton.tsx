"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, Textarea } from "@/components/ui";

import styles from "./ProposeButton.module.css";

/**
 * SegmentPair 옆 "제안하기" 버튼 + 인라인 편집 패널.
 * POST /api/translations/:slug/proposals를 호출. 성공 시 router.refresh()로
 * Reader의 proposals 목록·세그먼트 chip이 다시 계산되게 한다.
 *
 * 비인증(isAuthed=false)이면 클릭 자체를 막고 로그인 링크를 노출해 401 왕복을
 * 피한다 — AppHeader의 me 조회 결과를 내려 받는다.
 */

export type ProposeButtonProps = {
  slug: string;
  segmentId: string;
  baseSegmentVersion: number;
  initialText: string;
  isAuthed: boolean;
};

type State =
  | { phase: "idle" }
  | { phase: "editing" }
  | { phase: "submitting" }
  | { phase: "success" }
  | { phase: "error"; message: string }
  | { phase: "rebase-required"; currentVersion: number; currentText: string }
  | { phase: "duplicate" };

export function ProposeButton(props: ProposeButtonProps) {
  const { slug, segmentId, baseSegmentVersion, initialText, isAuthed } = props;
  const router = useRouter();
  const [state, setState] = useState<State>({ phase: "idle" });
  const [draft, setDraft] = useState(initialText);
  const [reason, setReason] = useState("");

  if (!isAuthed) {
    return (
      <p className={styles.authHint}>
        제안하려면 <a href="/api/auth/github">GitHub으로 로그인</a>이 필요합니다.
      </p>
    );
  }

  if (state.phase === "idle") {
    return (
      <Button variant="secondary" onClick={() => setState({ phase: "editing" })}>
        제안하기
      </Button>
    );
  }

  if (state.phase === "success") {
    return <p className={styles.success}>제안이 등록되었습니다. 목록이 새로고침됩니다.</p>;
  }

  async function submit() {
    setState({ phase: "submitting" });
    let res: Response;
    try {
      res = await fetch(`/api/translations/${encodeURIComponent(slug)}/proposals`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          segmentId,
          baseSegmentVersion,
          proposedText: draft,
          reason: reason.trim() === "" ? undefined : reason,
        }),
      });
    } catch (err) {
      setState({
        phase: "error",
        message: `API에 연결하지 못했습니다: ${err instanceof Error ? err.message : String(err)}`,
      });
      return;
    }

    if (res.status === 201) {
      setState({ phase: "success" });
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
    if (res.status === 409 && body.code === "duplicate_open_proposal") {
      setState({ phase: "duplicate" });
      return;
    }
    setState({
      phase: "error",
      message: `HTTP ${res.status}${body.code ? ` (${body.code})` : ""}`,
    });
  }

  return (
    <div className={styles.panel}>
      <Textarea
        label="제안 번역"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={3}
      />
      <Textarea
        label="제안 사유 (선택)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
      />

      <div className={styles.actions}>
        <Button onClick={submit} disabled={state.phase === "submitting" || draft.trim() === ""}>
          {state.phase === "submitting" ? "보내는 중" : "제안 보내기"}
        </Button>
        <Button variant="ghost" onClick={() => setState({ phase: "idle" })}>
          취소
        </Button>
      </div>

      {state.phase === "rebase-required" ? (
        <p className={styles.warn}>
          이 세그먼트가 그 사이 수정되어 버전이 어긋났습니다 (현재 v{state.currentVersion}). 현재
          번역 기준으로 다시 작성해 주세요.
        </p>
      ) : null}
      {state.phase === "duplicate" ? (
        <p className={styles.warn}>
          이 세그먼트에 이미 열린 제안이 있습니다. 이전 제안을 철회하거나 리드의 응답을 기다려
          주세요.
        </p>
      ) : null}
      {state.phase === "error" ? <p className={styles.error}>제안 실패: {state.message}</p> : null}
    </div>
  );
}
