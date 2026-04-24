import { AddCommentForm } from "./AddCommentForm";
import styles from "./ProposalCommentThread.module.css";

import type { ProposalCommentItem } from "../types";

export type ProposalCommentThreadProps = {
  slug: string;
  proposalId: string;
  comments: ProposalCommentItem[];
  isAuthed: boolean;
};

/**
 * 서버 컴포넌트. Reader 페이지가 각 open proposal 옆에 인라인으로 달아준다.
 * 댓글 수가 적은 초기 트래픽을 가정해 페이지네이션·펼치기 토글은 없다 —
 * 전부 한 번에 렌더.
 */
export function ProposalCommentThread({
  slug,
  proposalId,
  comments,
  isAuthed,
}: ProposalCommentThreadProps) {
  return (
    <div className={styles.thread}>
      {comments.length === 0 ? (
        <p className={styles.empty}>아직 댓글이 없습니다.</p>
      ) : (
        <ul className={styles.list}>
          {comments.map((c) => (
            <li key={c.commentId} className={styles.item}>
              <div className={styles.meta}>
                <span className={styles.author}>
                  {c.author.displayName ?? c.author.githubHandle ?? "(이름 없음)"}
                </span>
                <time className={styles.time}>{formatTime(c.createdAt)}</time>
              </div>
              <p className={styles.body}>{c.body}</p>
            </li>
          ))}
        </ul>
      )}
      {isAuthed ? (
        <AddCommentForm slug={slug} proposalId={proposalId} />
      ) : (
        <p className={styles.authHint}>
          댓글을 작성하려면 <a href="/api/auth/github">GitHub으로 로그인</a>이 필요합니다.
        </p>
      )}
    </div>
  );
}

function formatTime(iso: string): string {
  // 상대 시간은 locale 의존이 커서 일단 yyyy-mm-dd hh:mm 포맷으로.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`;
}
