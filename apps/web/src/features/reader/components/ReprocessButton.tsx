"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui";

/**
 * Reader의 PendingSegmentsView에서 쓰는 client 전용 버튼.
 * POST /api/translations/:slug/reprocess 호출 → 성공 시 router.refresh()로 서버 컴포넌트 재렌더.
 *
 * 자동 트리거는 일부러 안 둔다(arXiv·Gemini rate limit). 사용자가 누를 때만 동작.
 */
export function ReprocessButton({ slug }: { slug: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<
    { phase: "idle" } | { phase: "running" } | { phase: "error"; message: string }
  >({ phase: "idle" });

  async function handleClick() {
    setStatus({ phase: "running" });
    let res: Response;
    try {
      res = await fetch(`/api/translations/${encodeURIComponent(slug)}/reprocess`, {
        method: "POST",
        headers: { accept: "application/json" },
      });
    } catch (err) {
      setStatus({
        phase: "error",
        message: `API에 닿지 못했다: ${err instanceof Error ? err.message : String(err)}`,
      });
      return;
    }

    if (!res.ok) {
      setStatus({ phase: "error", message: `HTTP ${res.status}` });
      return;
    }

    const body = (await res.json()) as { outcome: string; reason?: string };
    if (body.outcome === "not-found" || body.outcome === "unsupported-format") {
      setStatus({ phase: "error", message: body.reason ?? body.outcome });
      return;
    }

    setStatus({ phase: "idle" });
    // 서버 컴포넌트가 다시 API를 타 bundle을 읽도록.
    router.refresh();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <Button onClick={handleClick} disabled={status.phase === "running"}>
        {status.phase === "running" ? "재처리 중… (수십 초 걸릴 수 있다)" : "지금 재처리"}
      </Button>
      {status.phase === "error" ? (
        <span style={{ fontSize: "13px", color: "var(--color-accent)" }}>
          재처리 실패: {status.message}
        </span>
      ) : null}
    </div>
  );
}
