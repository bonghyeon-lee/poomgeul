"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import { Button } from "@/components/ui";

import { useOptionalEditMode } from "./EditModeProvider";
import styles from "./SegmentEditor.module.css";

/**
 * §5 세그먼트 에디터. 리드가 편집 모드 켠 상태에서 각 세그먼트 아래 노출된다.
 * 편집 모드 off이거나 Provider가 없으면 자기 자신을 렌더하지 않는다(리드가
 * 아니거나 섹션에 적용 안 됐을 때).
 *
 * 요청: PATCH /api/translations/:slug/segments/:segmentId + If-Match 헤더.
 * 성공: router.refresh()로 Reader가 새 본문을 읽어온다.
 * 실패:
 *   - 409 rebase_required → 현재 본문·버전 안내. draft 유지.
 *   - 412/401/403/400/404 → 간단한 에러 라인.
 *
 * Textarea는 디자인 시스템 컴포넌트 대신 raw <textarea>를 쓴다 — focus()를
 * 위해 ref가 필요한데 design-system이 아직 forwardRef를 노출하지 않는다.
 */

export type SegmentEditorProps = {
  slug: string;
  segmentId: string;
  currentText: string;
  currentVersion: number;
};

type State =
  | { phase: "idle" }
  | { phase: "submitting" }
  | { phase: "rebase-required"; currentVersion: number; currentText: string }
  | { phase: "error"; message: string };

export function SegmentEditor({
  slug,
  segmentId,
  currentText,
  currentVersion,
}: SegmentEditorProps) {
  const router = useRouter();
  const ctx = useOptionalEditMode();
  const [draft, setDraft] = useState(currentText);
  const [commitMessage, setCommitMessage] = useState("");
  const [state, setState] = useState<State>({ phase: "idle" });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bodyId = useId();
  const msgId = useId();

  const isActive = ctx?.activeSegmentId === segmentId;

  useEffect(() => {
    if (!isActive) return;
    textareaRef.current?.focus();
  }, [isActive]);

  useEffect(() => {
    setDraft(currentText);
  }, [currentText]);

  if (!ctx || !ctx.enabled) return null;

  function open() {
    ctx?.setActiveSegmentId(segmentId);
    setDraft(currentText);
    setCommitMessage("");
    setState({ phase: "idle" });
  }

  function close() {
    ctx?.setActiveSegmentId(null);
    setState({ phase: "idle" });
  }

  async function save() {
    const trimmed = draft.trim();
    if (trimmed.length === 0) {
      setState({ phase: "error", message: "본문이 비어 있습니다." });
      return;
    }
    setState({ phase: "submitting" });
    let res: Response;
    try {
      res = await fetch(
        `/api/translations/${encodeURIComponent(slug)}/segments/${encodeURIComponent(segmentId)}`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            accept: "application/json",
            "if-match": `"${currentVersion}"`,
          },
          body: JSON.stringify({
            text: trimmed,
            ...(commitMessage.trim().length > 0 ? { commitMessage: commitMessage.trim() } : {}),
          }),
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
      close();
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

    setState({
      phase: "error",
      message: `HTTP ${res.status}${body.code ? ` (${body.code})` : ""}`,
    });
  }

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      void save();
    }
  }

  if (!isActive) {
    return (
      <div className={styles.row}>
        <Button size="sm" variant="secondary" onClick={open}>
          편집
        </Button>
      </div>
    );
  }

  const textRows = Math.min(12, Math.max(3, draft.split("\n").length + 1));

  return (
    <div className={styles.panel}>
      <label className={styles.label} htmlFor={bodyId}>
        번역 본문 편집
      </label>
      <textarea
        ref={textareaRef}
        id={bodyId}
        className={styles.textarea}
        rows={textRows}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKey}
      />
      <label className={styles.label} htmlFor={msgId}>
        커밋 메시지 <span className={styles.optional}>· 선택</span>
      </label>
      <textarea
        id={msgId}
        className={styles.textarea}
        rows={2}
        value={commitMessage}
        onChange={(e) => setCommitMessage(e.target.value)}
        placeholder="예: 오타 수정, 용어 통일 등"
      />
      <div className={styles.actions}>
        <Button size="sm" onClick={save} disabled={state.phase === "submitting"}>
          {state.phase === "submitting" ? "저장 중" : "저장"}
        </Button>
        <Button size="sm" variant="ghost" onClick={close} disabled={state.phase === "submitting"}>
          취소
        </Button>
        <span className={styles.versionHint}>v{currentVersion} · Ctrl+Enter 저장 · Esc 취소</span>
      </div>
      {state.phase === "rebase-required" ? (
        <p className={styles.warn}>
          다른 편집이 먼저 반영되어 버전이 어긋났습니다 (현재 v{state.currentVersion}). 페이지를
          새로고침하거나 현재 본문을 확인한 뒤 다시 저장해 주세요.
          {"\n"}현재 본문: {state.currentText}
        </p>
      ) : null}
      {state.phase === "error" ? <p className={styles.error}>저장 실패: {state.message}</p> : null}
    </div>
  );
}
