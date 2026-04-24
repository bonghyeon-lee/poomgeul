"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui";

import type { BlocklistEntryItem } from "../api";
import styles from "./BlocklistManager.module.css";

/**
 * ADR-0007-2 리드 전용 차단 목록 매니저. 서버에서 이미 `entries`를 받아오며,
 * 본 컴포넌트는 개별 해제(POST DELETE)만 담당한다. 차단 신규 추가는 제안 행의
 * BlockProposerButton으로 진입 — 리드가 "어떤 사용자"를 차단할지는 제안 맥락
 * 에서 가장 자연스럽다(별도 UUID 입력 폼 필요 없음).
 *
 * entries는 active + revoked 전부 포함. revoked는 히스토리 용도로 보여주고,
 * active에만 해제 버튼을 단다. 재차단이 필요하면 제안 행에서 다시 차단 버튼을
 * 누르면 된다(API 측 upsert가 같은 row를 재사용).
 */
export type BlocklistManagerProps = {
  slug: string;
  entries: BlocklistEntryItem[];
};

type PerRowState =
  | { phase: "idle" }
  | { phase: "submitting" }
  | { phase: "error"; message: string };

export function BlocklistManager({ slug, entries }: BlocklistManagerProps) {
  const router = useRouter();
  const [rowState, setRowState] = useState<Record<string, PerRowState>>({});

  async function unblock(userId: string) {
    setRowState((prev) => ({ ...prev, [userId]: { phase: "submitting" } }));
    let res: Response;
    try {
      res = await fetch(
        `/api/translations/${encodeURIComponent(slug)}/blocklist/${encodeURIComponent(userId)}`,
        { method: "DELETE", headers: { accept: "application/json" } },
      );
    } catch (err) {
      setRowState((prev) => ({
        ...prev,
        [userId]: {
          phase: "error",
          message: `API에 연결하지 못했습니다: ${err instanceof Error ? err.message : String(err)}`,
        },
      }));
      return;
    }
    if (res.status === 204) {
      setRowState((prev) => ({ ...prev, [userId]: { phase: "idle" } }));
      router.refresh();
      return;
    }
    let body: { code?: string } = {};
    try {
      body = (await res.json()) as typeof body;
    } catch {
      /* ignore */
    }
    setRowState((prev) => ({
      ...prev,
      [userId]: {
        phase: "error",
        message: `HTTP ${res.status}${body.code ? ` (${body.code})` : ""}`,
      },
    }));
  }

  const active = entries.filter((e) => e.revokedAt === null);
  const revoked = entries.filter((e) => e.revokedAt !== null);

  return (
    <div className={styles.wrap}>
      <p className={styles.intro}>
        차단된 사용자는 이 번역본에서 새 제안을 생성할 수 없습니다. 기존 제안은 유지되며, 차단
        사유는 리드 본인에게만 보입니다. 새 차단은 위 제안 행의 &ldquo;차단&rdquo; 버튼으로 추가할
        수 있습니다.
      </p>

      <h3 className={styles.subhead}>활성 차단 ({active.length})</h3>
      {active.length === 0 ? (
        <p className={styles.empty}>현재 활성 차단이 없습니다.</p>
      ) : (
        <ul className={styles.list}>
          {active.map((e) => {
            const s = rowState[e.userId] ?? { phase: "idle" };
            return (
              <li key={e.userId} className={styles.row}>
                <div className={styles.rowMain}>
                  <span className={styles.who}>
                    {e.userDisplayName ?? e.userGithubHandle ?? "(이름 없음)"}
                    {e.userGithubHandle ? (
                      <span className={styles.handle}>@{e.userGithubHandle}</span>
                    ) : null}
                  </span>
                  <span className={styles.when}>차단일 {formatTime(e.createdAt)}</span>
                  {e.reason ? (
                    <span className={styles.reason}>&ldquo;{e.reason}&rdquo;</span>
                  ) : null}
                </div>
                <div className={styles.rowActions}>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => unblock(e.userId)}
                    disabled={s.phase === "submitting"}
                  >
                    {s.phase === "submitting" ? "해제 중" : "해제"}
                  </Button>
                </div>
                {s.phase === "error" ? (
                  <p className={styles.error}>해제 실패: {s.message}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {revoked.length > 0 ? (
        <>
          <h3 className={styles.subhead}>해제된 이력 ({revoked.length})</h3>
          <ul className={styles.list}>
            {revoked.map((e) => (
              <li key={e.userId} className={`${styles.row} ${styles.rowRevoked}`}>
                <div className={styles.rowMain}>
                  <span className={styles.who}>
                    {e.userDisplayName ?? e.userGithubHandle ?? "(이름 없음)"}
                    {e.userGithubHandle ? (
                      <span className={styles.handle}>@{e.userGithubHandle}</span>
                    ) : null}
                  </span>
                  <span className={styles.when}>
                    차단 {formatTime(e.createdAt)} · 해제 {formatTime(e.revokedAt!)}
                  </span>
                  {e.reason ? (
                    <span className={styles.reason}>&ldquo;{e.reason}&rdquo;</span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`;
}
