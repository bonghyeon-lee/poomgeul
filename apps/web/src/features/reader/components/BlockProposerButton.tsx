"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui";

import styles from "./DecideButtons.module.css";

/**
 * ADR-0007-2 리드 전용 "이 제안자 차단" 버튼. 제안 행 인라인에 붙어서 한 번에
 * 차단할 수 있게 한다. reason은 선택 prompt로 받고, 한 번 더 확인을 묻는다.
 * 재차단(이미 revoke된 row)은 API가 같은 row를 재사용하므로 여기서도 동일
 * 엔드포인트를 때리면 된다.
 */
export type BlockProposerButtonProps = {
  slug: string;
  proposerId: string;
  proposerDisplayName: string | null;
};

type State = { phase: "idle" } | { phase: "submitting" } | { phase: "error"; message: string };

export function BlockProposerButton({
  slug,
  proposerId,
  proposerDisplayName,
}: BlockProposerButtonProps) {
  const router = useRouter();
  const [state, setState] = useState<State>({ phase: "idle" });

  async function block() {
    const label = proposerDisplayName ?? "이 사용자";
    const confirmed =
      typeof window !== "undefined"
        ? window.confirm(
            `${label}의 새 제안을 이 번역본에서 차단하시겠습니까? 기존 제안은 그대로 유지됩니다.`,
          )
        : true;
    if (!confirmed) return;

    // prompt는 라이트한 UX. 빈 문자열/취소면 reason 없이 보낸다.
    const reasonRaw =
      typeof window !== "undefined"
        ? window.prompt("차단 사유(선택, 리드 본인에게만 보입니다)", "")
        : null;
    const reason = reasonRaw && reasonRaw.trim().length > 0 ? reasonRaw.trim() : null;

    setState({ phase: "submitting" });
    let res: Response;
    try {
      res = await fetch(`/api/translations/${encodeURIComponent(slug)}/blocklist`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ userId: proposerId, ...(reason ? { reason } : {}) }),
      });
    } catch (err) {
      setState({
        phase: "error",
        message: `API에 연결하지 못했습니다: ${err instanceof Error ? err.message : String(err)}`,
      });
      return;
    }

    if (res.status === 201) {
      setState({ phase: "idle" });
      router.refresh();
      return;
    }

    let body: { code?: string; message?: string } = {};
    try {
      body = (await res.json()) as typeof body;
    } catch {
      /* ignore */
    }
    setState({
      phase: "error",
      message: `HTTP ${res.status}${body.code ? ` (${body.code})` : ""}`,
    });
  }

  return (
    <>
      <Button
        size="sm"
        variant="destructive"
        onClick={block}
        disabled={state.phase === "submitting"}
      >
        {state.phase === "submitting" ? "차단 중" : "차단"}
      </Button>
      {state.phase === "error" ? <p className={styles.error}>차단 실패: {state.message}</p> : null}
    </>
  );
}
