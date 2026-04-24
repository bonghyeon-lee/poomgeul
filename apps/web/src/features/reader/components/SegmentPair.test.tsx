import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SegmentPair } from "./SegmentPair";

import type { Segment, TranslationSegment } from "../types";

const seg: Segment = {
  segmentId: "00000000-0000-0000-0000-000000000001",
  sourceId: "src",
  order: 0,
  originalText: "Hello world.",
  kind: "body",
};

function translation(overrides: Partial<TranslationSegment> = {}): TranslationSegment {
  return {
    translationId: "t",
    segmentId: seg.segmentId,
    text: "안녕하세요.",
    aiDraftText: "안녕하세요.",
    aiDraftSource: null,
    version: 1,
    lastEditorId: "u",
    lastEditedAt: "2026-04-24T00:00:00Z",
    status: "unreviewed",
    ...overrides,
  };
}

describe("SegmentPair model badge", () => {
  it("aiDraftSource가 null이면 모델 배지를 렌더하지 않는다", () => {
    render(<SegmentPair segment={seg} translation={translation({ aiDraftSource: null })} />);
    // 'AI draft' 라벨은 있으나 모델 배지는 없다 — gemini/gemma 등의 slug가 문서에 없어야.
    expect(screen.queryByText(/gemini|gemma|claude/i)).toBeNull();
  });

  it("Gemini 네이티브 식별자는 그대로 노출한다", () => {
    render(
      <SegmentPair
        segment={seg}
        translation={translation({
          aiDraftSource: { model: "gemini-2.5-flash", promptHash: "h", version: "1" },
        })}
      />,
    );
    expect(screen.getByText("gemini-2.5-flash")).toBeInTheDocument();
  });

  it("OpenRouter slug는 provider 접두를 떼고 :free 접미는 배지로 드러낸다", () => {
    render(
      <SegmentPair
        segment={seg}
        translation={translation({
          aiDraftSource: {
            model: "google/gemma-2-9b-it:free",
            promptHash: "h",
            promptVersion: "1",
          },
        })}
      />,
    );
    expect(screen.getByText("gemma-2-9b-it · free")).toBeInTheDocument();
  });
});
