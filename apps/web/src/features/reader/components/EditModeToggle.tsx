"use client";

import { Button } from "@/components/ui";

import { useEditMode } from "./EditModeProvider";
import styles from "./EditModeToggle.module.css";

/**
 * §5 편집 모드 토글. 리드 페이지에서만 Provider에 감싸여 렌더된다.
 * 클릭 시 context의 enabled가 뒤집히며, 활성 세그먼트 선택도 초기화된다.
 */
export function EditModeToggle() {
  const { enabled, setEnabled, setActiveSegmentId } = useEditMode();

  function toggle() {
    if (enabled) setActiveSegmentId(null);
    setEnabled(!enabled);
  }

  return (
    <div className={styles.wrap}>
      <Button
        size="sm"
        variant={enabled ? "primary" : "secondary"}
        onClick={toggle}
        aria-pressed={enabled}
      >
        {enabled ? "편집 모드 · ON" : "편집 모드"}
      </Button>
      {enabled ? (
        <span className={styles.hint}>
          j/k로 이동 · 세그먼트에서 &ldquo;편집&rdquo; → Ctrl+Enter 저장, Esc 취소
        </span>
      ) : null}
    </div>
  );
}
