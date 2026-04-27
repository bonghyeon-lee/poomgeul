"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * §5 편집 모드 클라이언트 context. 리드에게만 Provider를 붙이는 것은 서버
 * 컴포넌트 측 책임. 여기선 "켜졌을 때 어떤 동작을 허용할지"만 다룬다.
 *
 * 키보드 단축키(이 구현):
 *  - 편집 중이 아닐 때 `j/k`로 세그먼트 이동(hash 앵커 `#seg-N`).
 *  - 편집 textarea 내부에서는 단축키 가로채지 않음(hotkey로 입력 방해 금지).
 *  - `Esc`/`Ctrl+Enter`는 개별 에디터가 직접 처리.
 */

type EditModeContextValue = {
  enabled: boolean;
  setEnabled: (next: boolean) => void;
  segmentOrders: number[];
  /** 현재 어떤 세그먼트 에디터가 열려 있는가. 하나만 허용. */
  activeSegmentId: string | null;
  setActiveSegmentId: (id: string | null) => void;
};

const EditModeContext = createContext<EditModeContextValue | null>(null);

export function useEditMode(): EditModeContextValue {
  const ctx = useContext(EditModeContext);
  if (!ctx) {
    throw new Error("useEditMode must be used within EditModeProvider");
  }
  return ctx;
}

export function useOptionalEditMode(): EditModeContextValue | null {
  return useContext(EditModeContext);
}

export type EditModeProviderProps = {
  segmentOrders: number[];
  children: ReactNode;
};

export function EditModeProvider({ segmentOrders, children }: EditModeProviderProps) {
  const [enabled, setEnabled] = useState(false);
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);

  // segmentOrders는 매 렌더마다 새 배열로 만들어질 수 있어 메모화.
  const orders = useMemo(() => [...segmentOrders].sort((a, b) => a - b), [segmentOrders]);

  const currentOrderRef = useRef<number | null>(null);

  const gotoDelta = useCallback(
    (delta: 1 | -1) => {
      if (orders.length === 0) return;
      const current = currentOrderRef.current;
      let nextIdx: number;
      if (current === null) {
        nextIdx = delta === 1 ? 0 : orders.length - 1;
      } else {
        const idx = orders.indexOf(current);
        if (idx === -1) {
          nextIdx = 0;
        } else {
          nextIdx = Math.max(0, Math.min(orders.length - 1, idx + delta));
        }
      }
      const nextOrder = orders[nextIdx];
      if (nextOrder === undefined) return;
      currentOrderRef.current = nextOrder;
      const el = document.getElementById(`seg-${nextOrder}`);
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    },
    [orders],
  );

  useEffect(() => {
    if (!enabled) return;

    function onKey(e: KeyboardEvent) {
      // 사용자가 텍스트 입력 중이면 건드리지 않는다.
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName.toLowerCase();
        if (tag === "textarea" || tag === "input" || target.isContentEditable) return;
      }
      // activeSegmentId가 설정돼 있으면 해당 세그먼트에서 사용자가 타이핑 중일 수
      // 있으므로 단축키를 꺼 둔다.
      if (activeSegmentId !== null) return;
      if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        gotoDelta(1);
      } else if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        gotoDelta(-1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, activeSegmentId, gotoDelta]);

  const value = useMemo<EditModeContextValue>(
    () => ({ enabled, setEnabled, segmentOrders: orders, activeSegmentId, setActiveSegmentId }),
    [enabled, orders, activeSegmentId],
  );

  return <EditModeContext.Provider value={value}>{children}</EditModeContext.Provider>;
}
