import type { ReaderBundle } from "./types";

const TRANSLATION_ID = "tr-0001";
const SOURCE_ID = "src-2310-12345";
const LEAD_USER_ID = "u-lead-minsu";
const LEAD_NAME = "김민수";
const PROPOSER_USER_ID = "u-proposer-suji";

const AI_DRAFT_SOURCE = {
  model: "gemini-1.5-flash",
  promptHash: "a3f7c9",
  version: "translate.en-ko.v1",
} as const;

const mkSegment = (
  order: number,
  kind: "body" | "caption" | "footnote" | "reference",
  originalText: string,
): ReaderBundle["segments"][number] => ({
  segmentId: `seg-${String(order).padStart(3, "0")}`,
  sourceId: SOURCE_ID,
  order,
  originalText,
  kind,
});

const mkTs = (
  segmentId: string,
  text: string,
  opts: {
    aiDraftText?: string | null;
    version?: number;
    status?: "unreviewed" | "approved";
  } = {},
): ReaderBundle["translationSegments"][number] => ({
  translationId: TRANSLATION_ID,
  segmentId,
  text,
  aiDraftText: opts.aiDraftText ?? text,
  aiDraftSource: opts.aiDraftText === null ? null : AI_DRAFT_SOURCE,
  version: opts.version ?? 1,
  lastEditorId: LEAD_USER_ID,
  lastEditedAt: "2026-04-21T09:14:00Z",
  status: opts.status ?? "approved",
});

const SAMPLE: ReaderBundle = {
  source: {
    sourceId: SOURCE_ID,
    title: "Sparse Mixture-of-Experts for Low-Resource Machine Translation",
    author: ["Sofía Restrepo", "Arjun Iyer", "Lina Haddad"],
    originalLang: "en",
    license: "CC-BY",
    attributionSource: "https://arxiv.org/abs/2310.12345",
    sourceVersion: "v2",
    importedAt: "2026-04-18T02:33:00Z",
    importedBy: { userId: LEAD_USER_ID, displayName: LEAD_NAME, githubHandle: "minsu-kim" },
  },
  translation: {
    translationId: TRANSLATION_ID,
    sourceId: SOURCE_ID,
    targetLang: "ko",
    leadId: LEAD_USER_ID,
    leadDisplayName: LEAD_NAME,
    status: "reviewed",
    license: "CC-BY",
    slug: "sparse-moe-low-resource-mt",
    currentRevisionId: "rev-0042",
  },
  segments: [
    mkSegment(
      1,
      "body",
      "We study how sparse mixture-of-experts (MoE) layers behave when training data for a target language pair is limited to a few hundred thousand parallel sentences.",
    ),
    mkSegment(
      2,
      "body",
      "Our central claim is that routing sparsity is a property of the task more than of the model: when the token distribution is narrow, aggressive expert dropout behaves like implicit regularization and improves BLEU by a small but consistent margin.",
    ),
    mkSegment(
      3,
      "body",
      "The rest of this paper is organized as follows. §2 situates the work in prior scaling literature. §3 describes the architectural changes. §4 reports results on four low-resource pairs, and §5 discusses negative results that we believe the community should be aware of.",
    ),
    mkSegment(
      4,
      "body",
      "Prior work on MoE has largely assumed web-scale data. Shazeer et al. (2017) and the Switch Transformer line of work optimize for throughput at very large token counts. We instead ask whether the same sparsity primitives have a place when only a few million tokens are available.",
    ),
    mkSegment(
      5,
      "caption",
      "Figure 1: Expert utilization under three dropout regimes. Low dropout (left) concentrates tokens on two experts; our proposed schedule (right) spreads load more evenly while preserving validation loss.",
    ),
    mkSegment(
      6,
      "body",
      "We replace the feed-forward block of every other transformer layer with an 8-expert routed MoE block. Routing is top-1 with auxiliary load-balancing loss coefficient 0.02, matching common defaults in the public literature.",
    ),
    mkSegment(
      7,
      "caption",
      "Equation (3): Load-balancing loss used during training. See §3.2 for derivation.",
    ),
    mkSegment(
      8,
      "body",
      "Across English→Swahili, English→Nepali, English→Khmer, and English→Amharic, our schedule improves over the dense baseline by 0.7 BLEU on average, with the largest gain on Khmer (+1.3) and the smallest on Swahili (+0.2).",
    ),
    mkSegment(
      9,
      "footnote",
      "¹ We release the full training logs and expert routing histograms under CC BY 4.0; see the supplementary materials for links.",
    ),
    mkSegment(
      10,
      "reference",
      "Shazeer, N. et al. (2017). Outrageously Large Neural Networks: The Sparsely-Gated Mixture-of-Experts Layer. ICLR.",
    ),
    mkSegment(
      11,
      "reference",
      "Fedus, W., Zoph, B., & Shazeer, N. (2022). Switch Transformers: Scaling to Trillion Parameter Models with Simple and Efficient Sparsity. JMLR.",
    ),
  ],
  translationSegments: [
    mkTs(
      "seg-001",
      "우리는 대상 언어쌍의 학습 데이터가 병렬 문장 수십만 건 규모로 제한될 때 희소 전문가 혼합(MoE) 계층이 어떻게 동작하는지 연구한다.",
      {
        aiDraftText:
          "우리는 대상 언어쌍에 대한 훈련 데이터가 몇십만 병렬 문장으로 제한될 때 희소 혼합 전문가(MoE) 레이어가 어떻게 행동하는지를 연구한다.",
        version: 2,
      },
    ),
    mkTs(
      "seg-002",
      "우리의 핵심 주장은, 라우팅의 희소성이 모델의 속성이라기보다 과제의 속성이라는 점이다. 토큰 분포가 좁을 때 공격적인 전문가 드롭아웃은 암묵적 정규화처럼 작동하여 BLEU를 작지만 일관되게 끌어올린다.",
      {
        aiDraftText:
          "우리의 핵심 주장은 라우팅 희소성이 모델보다 작업의 특성이라는 것이다. 토큰 분포가 좁을 때 공격적인 전문가 드롭아웃은 암묵적 정규화로 동작해 BLEU를 작지만 일관되게 개선한다.",
        version: 3,
      },
    ),
    mkTs(
      "seg-003",
      "이 논문의 구성은 다음과 같다. 2절은 선행 스케일링 연구의 맥락을 정리하고, 3절은 아키텍처 변경을 설명한다. 4절은 네 가지 저자원 언어쌍의 실험 결과를 보고하고, 5절은 커뮤니티가 알아야 한다고 생각하는 부정적 결과를 다룬다.",
      { version: 1 },
    ),
    mkTs(
      "seg-004",
      "MoE에 관한 선행 연구는 대체로 웹 규모 데이터를 전제한다. Shazeer 외 (2017)와 Switch Transformer 계열은 매우 큰 토큰 수에서의 처리량을 최적화한다. 우리는 동일한 희소성 원리가 수백만 토큰 규모에서도 자리를 가지는지를 묻는다.",
      { version: 1 },
    ),
    mkTs(
      "seg-005",
      "그림 1: 세 가지 드롭아웃 체제에서의 전문가 활용도. 낮은 드롭아웃(왼쪽)에서는 토큰이 두 전문가에 집중되며, 우리가 제안한 스케줄(오른쪽)은 검증 손실을 유지하면서 부하를 더 고르게 분산한다.",
      { version: 1 },
    ),
    mkTs(
      "seg-006",
      "우리는 트랜스포머의 한 층씩 걸러 피드포워드 블록을 전문가 8개의 라우팅된 MoE 블록으로 교체한다. 라우팅은 top-1이며 보조 부하 균형 손실 계수는 0.02로, 공개 문헌에서 일반적으로 쓰이는 기본값과 일치한다.",
      { version: 2, status: "unreviewed" },
    ),
    mkTs(
      "seg-007",
      "식 (3): 학습 중 사용하는 부하 균형 손실. 유도 과정은 3.2절 참조.",
      { version: 1 },
    ),
    mkTs(
      "seg-008",
      "영어→스와힐리어, 영어→네팔어, 영어→크메르어, 영어→암하라어 네 쌍 전체에 걸쳐 우리 스케줄은 밀집 기준선 대비 평균 0.7 BLEU 향상을 보였다. 가장 큰 향상은 크메르어(+1.3), 가장 작은 향상은 스와힐리어(+0.2)였다.",
      { version: 1 },
    ),
    mkTs(
      "seg-009",
      "¹ 우리는 전체 학습 로그와 전문가 라우팅 히스토그램을 CC BY 4.0으로 공개한다. 링크는 부록을 참고한다.",
      { version: 1 },
    ),
    mkTs(
      "seg-010",
      "Shazeer, N. 외 (2017). Outrageously Large Neural Networks: The Sparsely-Gated Mixture-of-Experts Layer. ICLR.",
      { aiDraftText: null, version: 0 },
    ),
    mkTs(
      "seg-011",
      "Fedus, W., Zoph, B., Shazeer, N. (2022). Switch Transformers: Scaling to Trillion Parameter Models with Simple and Efficient Sparsity. JMLR.",
      { aiDraftText: null, version: 0 },
    ),
  ],
  contributors: [
    {
      userId: LEAD_USER_ID,
      displayName: LEAD_NAME,
      githubHandle: "minsu-kim",
      mergedProposalCount: 0,
    },
    {
      userId: PROPOSER_USER_ID,
      displayName: "박수지",
      githubHandle: "suji-park",
      mergedProposalCount: 2,
    },
  ],
  proposals: [
    {
      proposalId: "prop-1042",
      segmentId: "seg-006",
      proposerDisplayName: "박수지",
      status: "open",
      createdAt: "2026-04-22T14:02:00Z",
    },
    {
      proposalId: "prop-1041",
      segmentId: "seg-002",
      proposerDisplayName: "박수지",
      status: "merged",
      createdAt: "2026-04-20T08:10:00Z",
    },
    {
      proposalId: "prop-1040",
      segmentId: "seg-003",
      proposerDisplayName: "이도현",
      status: "rejected",
      createdAt: "2026-04-19T11:45:00Z",
    },
  ],
};

const BUNDLES: Record<string, ReaderBundle> = {
  [SAMPLE.translation.slug]: SAMPLE,
};

export function findReaderBundleBySlug(slug: string): ReaderBundle | null {
  return BUNDLES[slug] ?? null;
}

export function listReaderSlugs(): string[] {
  return Object.keys(BUNDLES);
}

export { SAMPLE as sampleReaderBundle };
