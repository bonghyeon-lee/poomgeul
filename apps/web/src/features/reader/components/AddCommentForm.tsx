"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, Textarea } from "@/components/ui";

import styles from "./AddCommentForm.module.css";

export type AddCommentFormProps = {
  slug: string;
  proposalId: string;
};

type State = { phase: "idle" } | { phase: "submitting" } | { phase: "error"; message: string };

export function AddCommentForm({ slug, proposalId }: AddCommentFormProps) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [state, setState] = useState<State>({ phase: "idle" });

  async function submit() {
    setState({ phase: "submitting" });
    let res: Response;
    try {
      res = await fetch(
        `/api/translations/${encodeURIComponent(slug)}/proposals/${encodeURIComponent(proposalId)}/comments`,
        {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ body }),
        },
      );
    } catch (err) {
      setState({
        phase: "error",
        message: `API에 연결하지 못했습니다: ${err instanceof Error ? err.message : String(err)}`,
      });
      return;
    }

    if (res.status === 201) {
      setBody("");
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
    setState({
      phase: "error",
      message: `HTTP ${res.status}${code ? ` (${code})` : ""}`,
    });
  }

  return (
    <div className={styles.form}>
      <Textarea
        label="댓글"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        placeholder="제안에 대한 의견을 남겨주세요"
      />
      <div className={styles.actions}>
        <Button
          size="sm"
          onClick={submit}
          disabled={state.phase === "submitting" || body.trim() === ""}
        >
          {state.phase === "submitting" ? "등록 중" : "댓글 달기"}
        </Button>
        {state.phase === "error" ? <span className={styles.error}>{state.message}</span> : null}
      </div>
    </div>
  );
}
