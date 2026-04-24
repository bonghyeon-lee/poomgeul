"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui";

import styles from "./DecideButtons.module.css";

/**
 * proposer 본인이 자신의 open 제안을 철회할 때 쓴다.
 * POST /api/translations/:slug/proposals/:id/withdraw. body 없음. 200.
 *
 * 409 not_open은 이미 terminal 상태라는 뜻이므로 조용히 refresh해 최신 상태로.
 */

export type WithdrawButtonProps = {
  slug: string;
  proposalId: string;
};

type State = { phase: "idle" } | { phase: "submitting" } | { phase: "error"; message: string };

export function WithdrawButton({ slug, proposalId }: WithdrawButtonProps) {
  const router = useRouter();
  const [state, setState] = useState<State>({ phase: "idle" });

  async function submit() {
    setState({ phase: "submitting" });
    let res: Response;
    try {
      res = await fetch(
        `/api/translations/${encodeURIComponent(slug)}/proposals/${encodeURIComponent(proposalId)}/withdraw`,
        {
          method: "POST",
          headers: { accept: "application/json" },
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

    let code: string | undefined;
    try {
      const json = (await res.json()) as { code?: string };
      code = json.code;
    } catch {
      /* ignore */
    }
    if (res.status === 409 && code === "not_open") {
      setState({ phase: "idle" });
      router.refresh();
      return;
    }
    setState({
      phase: "error",
      message: `HTTP ${res.status}${code ? ` (${code})` : ""}`,
    });
  }

  return (
    <div>
      <Button size="sm" variant="ghost" onClick={submit} disabled={state.phase === "submitting"}>
        {state.phase === "submitting" ? "철회 중" : "철회"}
      </Button>
      {state.phase === "error" ? <p className={styles.error}>철회 실패: {state.message}</p> : null}
    </div>
  );
}
