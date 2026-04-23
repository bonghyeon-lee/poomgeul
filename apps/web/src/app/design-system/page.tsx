import type { Metadata } from "next";

import {
  Button,
  type ButtonSize,
  type ButtonVariant,
  Card,
  CardBody,
  CardEyebrow,
  CardTitle,
  Chip,
  type LicenseKind,
  LicenseBadge,
  type LogoVariant,
  type ProposalStatus,
  Eyebrow,
  Input,
  Logo,
  Textarea,
} from "@/components/ui";

import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Design System — poomgeul",
  description: "품글 디자인 시스템의 토큰과 컴포넌트 키트 리빙 데모.",
};

type Swatch = { name: string; token: string; hex: string; dark?: boolean };

const PAPER_INK: Swatch[] = [
  { name: "--paper-50", token: "paper-50", hex: "#FEFCF8" },
  { name: "--paper-100", token: "paper-100", hex: "#FAF7F2" },
  { name: "--paper-200", token: "paper-200", hex: "#F3EFE7" },
  { name: "--paper-300", token: "paper-300", hex: "#E8E2D5" },
  { name: "--ink-900", token: "ink-900", hex: "#1A1915", dark: true },
  { name: "--ink-700", token: "ink-700", hex: "#3F3C36", dark: true },
  { name: "--ink-500", token: "ink-500", hex: "#78736A", dark: true },
  { name: "--ink-300", token: "ink-300", hex: "#BFB9AF" },
  { name: "--ink-200", token: "ink-200", hex: "#DED8CC" },
];

const BRAND: Swatch[] = [
  { name: "--dak-50", token: "dak-50", hex: "#F6EFE7" },
  { name: "--dak-100", token: "dak-100", hex: "#E8D9C6" },
  { name: "--dak-300", token: "dak-300", hex: "#A88966" },
  { name: "--dak-500 (brand)", token: "dak-500", hex: "#5B3A23", dark: true },
  { name: "--dak-600", token: "dak-600", hex: "#472C1A", dark: true },
  { name: "--dak-700", token: "dak-700", hex: "#342010", dark: true },
];

const ACCENT: Swatch[] = [
  { name: "--seal-50", token: "seal-50", hex: "#FAECE9" },
  { name: "--seal-300", token: "seal-300", hex: "#D97D6B" },
  { name: "--seal-500 (accent)", token: "seal-500", hex: "#B84C3A", dark: true },
  { name: "--seal-600", token: "seal-600", hex: "#973A2A", dark: true },
];

const SEMANTIC: Swatch[] = [
  { name: "--color-merged", token: "moss-500", hex: "#4A7C59", dark: true },
  { name: "--color-stale", token: "ochre-500", hex: "#9A7524", dark: true },
  { name: "--color-rejected", token: "seal-500", hex: "#B84C3A", dark: true },
  { name: "--color-open", token: "dak-500", hex: "#5B3A23", dark: true },
  { name: "--color-withdrawn", token: "ink-500", hex: "#78736A", dark: true },
];

const BUTTON_VARIANTS: ButtonVariant[] = ["primary", "secondary", "ghost", "destructive"];
const BUTTON_SIZES: ButtonSize[] = ["sm", "md", "lg"];
const STATUSES: ProposalStatus[] = ["open", "merged", "rejected", "stale", "withdrawn"];
const LOGO_VARIANTS: LogoVariant[] = ["wordmark-ko", "wordmark", "mark"];
const LICENSES: LicenseKind[] = ["CC-BY", "CC-BY-SA", "PD", "CC-BY-ND", "CC-BY-NC-ND"];

const SPACING = [
  { token: "--space-1", px: 4 },
  { token: "--space-2", px: 8 },
  { token: "--space-3", px: 12 },
  { token: "--space-4", px: 16 },
  { token: "--space-5", px: 24 },
  { token: "--space-6", px: 32 },
  { token: "--space-7", px: 48 },
  { token: "--space-8", px: 64 },
  { token: "--space-9", px: 96 },
];

const RADII = [
  { token: "--radius-xs", value: "2px" },
  { token: "--radius-sm", value: "4px" },
  { token: "--radius-md", value: "6px" },
  { token: "--radius-lg", value: "8px" },
  { token: "--radius-xl", value: "12px" },
];

function Swatches({ items }: { items: Swatch[] }) {
  return (
    <div className={styles.swatchGrid}>
      {items.map((s) => (
        <div key={s.token} className={styles.swatch}>
          <div className={styles.swatchColor} style={{ background: s.hex }} />
          <div className={styles.swatchMeta}>
            <span className={styles.swatchName}>{s.name}</span>
            <span className={styles.swatchHex}>{s.hex}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function DesignSystemPage() {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Eyebrow withDot={false}>Design System · v0</Eyebrow>
        <h1 className={styles.headerTitle}>품글 디자인 시스템</h1>
        <p className={styles.headerLead}>
          이 페이지는 <code>apps/web/src/app/globals.css</code> 토큰과{" "}
          <code>apps/web/src/components/ui/</code> 키트의 리빙 데모다. 새 화면을 만들기
          전에 여기서 가용한 컴포넌트를 확인한다. 원칙과 근거는{" "}
          <a href="https://github.com/bonghyeon-lee/poomgeul/blob/main/docs/design/README.md">
            docs/design/README.md
          </a>
          에 있다.
        </p>
        <nav className={styles.toc} aria-label="섹션 내비">
          <a href="#logo">logo</a>
          <a href="#color">color</a>
          <a href="#type">type</a>
          <a href="#spacing">spacing</a>
          <a href="#radius">radius</a>
          <a href="#button">button</a>
          <a href="#chip">chip</a>
          <a href="#license">license</a>
          <a href="#input">input</a>
          <a href="#card">card</a>
          <a href="#donts">don&apos;ts</a>
        </nav>
      </header>

      <section id="logo" className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Logo</h2>
          <span className={styles.sectionHint}>components/ui/Logo</span>
        </div>
        <div className={styles.grid}>
          {LOGO_VARIANTS.map((variant) => (
            <div key={variant} className={styles.logoBlock}>
              <Logo variant={variant} href="" ariaLabel={`poomgeul ${variant}`} />
              <span className={styles.logoCaption}>variant=&quot;{variant}&quot;</span>
            </div>
          ))}
          <div className={`${styles.logoBlock} ${styles.logoBlockInverse}`}>
            <Logo variant="wordmark-ko" href="" />
            <span className={`${styles.logoCaption} ${styles.logoCaptionInverse}`}>
              on --ink-900 surface
            </span>
          </div>
        </div>
      </section>

      <section id="color" className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Color — Paper &amp; Ink</h2>
          <span className={styles.sectionHint}>globals.css</span>
        </div>
        <Swatches items={PAPER_INK} />

        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Brand — chaek-gal (책갈)</h2>
          <span className={styles.sectionHint}>--dak-*</span>
        </div>
        <Swatches items={BRAND} />

        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Accent — nakgwan (낙관)</h2>
          <span className={styles.sectionHint}>--seal-*</span>
        </div>
        <Swatches items={ACCENT} />

        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Semantic — proposal status</h2>
          <span className={styles.sectionHint}>--color-open/merged/rejected/stale/withdrawn</span>
        </div>
        <Swatches items={SEMANTIC} />
      </section>

      <section id="type" className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Typography</h2>
          <span className={styles.sectionHint}>Pretendard · Source Serif 4 · Noto Serif KR · JetBrains Mono</span>
        </div>
        <div className={styles.typeStack}>
          <div className={styles.typeRow}>
            <div className={styles.typeMeta}>
              <span>--font-serif</span>
              <span>fs-48 · opsz 48</span>
            </div>
            <div className={`${styles.typeSample} ${styles.typeSampleDisplay}`}>
              공개 텍스트를 함께 번역한다.
            </div>
          </div>
          <div className={styles.typeRow}>
            <div className={styles.typeMeta}>
              <span>h1 · sans</span>
              <span>fs-36 · semibold</span>
            </div>
            <div className={`${styles.typeSample} ${styles.typeSampleH1}`}>
              번역은 제안에서 머지로 움직인다
            </div>
          </div>
          <div className={styles.typeRow}>
            <div className={styles.typeMeta}>
              <span>h2 · sans</span>
              <span>fs-30 · semibold</span>
            </div>
            <div className={`${styles.typeSample} ${styles.typeSampleH2}`}>
              세그먼트 단위로 읽고 고친다
            </div>
          </div>
          <div className={styles.typeRow}>
            <div className={styles.typeMeta}>
              <span>.t-read-ko</span>
              <span>fs-18 · lh 1.75 · keep-all</span>
            </div>
            <div className={`${styles.typeSample} ${styles.typeSampleReadKo}`}>
              공개 라이선스가 붙은 학술 문서와 공공 영역의 문학을 한국어로 옮긴다.
              원문은 위키처럼 공유하고, 번역본은 깃허브처럼 제안하고 머지한다.
            </div>
          </div>
          <div className={styles.typeRow}>
            <div className={styles.typeMeta}>
              <span>.t-read-en</span>
              <span>fs-18 · lh 1.65</span>
            </div>
            <div className={`${styles.typeSample} ${styles.typeSampleReadEn}`}>
              Open-license scholarly texts and public-domain literature, translated by a
              community with AI-drafted first passes and human-led review.
            </div>
          </div>
          <div className={styles.typeRow}>
            <div className={styles.typeMeta}>
              <span>body · sans</span>
              <span>fs-15 · lh 1.5</span>
            </div>
            <div className={`${styles.typeSample} ${styles.typeSampleBody}`}>
              제안은 오픈 → 머지 / 거절 / 철회 / 스테일의 상태기계를 거친다.
            </div>
          </div>
          <div className={styles.typeRow}>
            <div className={styles.typeMeta}>
              <span>--font-mono</span>
              <span>fs-14</span>
            </div>
            <div className={styles.typeSample}>
              <span className={styles.typeSampleMono}>arxiv:2301.12345 · 3cc0a13 · en → ko</span>
            </div>
          </div>
        </div>
      </section>

      <section id="spacing" className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Spacing — 4px base</h2>
          <span className={styles.sectionHint}>--space-1..9</span>
        </div>
        <div className={styles.spacingRow}>
          {SPACING.map((s) => (
            <div key={s.token} className={styles.spacingItem}>
              <span className={styles.rowLabel}>{s.token}</span>
              <span className={styles.spacingBar} style={{ width: `${s.px}px` }} />
              <span>{s.px}px</span>
            </div>
          ))}
        </div>
      </section>

      <section id="radius" className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Radius — small, never pill</h2>
          <span className={styles.sectionHint}>--radius-xs..xl</span>
        </div>
        <div className={styles.radiusGrid}>
          {RADII.map((r) => (
            <div
              key={r.token}
              className={styles.radiusTile}
              style={{ borderRadius: `var(${r.token})` }}
            >
              {r.token} · {r.value}
            </div>
          ))}
        </div>
      </section>

      <section id="button" className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Button</h2>
          <span className={styles.sectionHint}>components/ui/Button</span>
        </div>
        <div className={styles.stack}>
          {BUTTON_VARIANTS.map((variant) => (
            <div key={variant} className={styles.row}>
              <span className={styles.rowLabel}>{variant}</span>
              {BUTTON_SIZES.map((size) => (
                <Button key={size} variant={variant} size={size}>
                  {variant === "destructive" ? "거절" : "제안하기"}
                </Button>
              ))}
              <Button variant={variant} disabled>
                disabled
              </Button>
            </div>
          ))}
          <div className={styles.row}>
            <span className={styles.rowLabel}>anchor</span>
            <Button href="#button">href로 렌더</Button>
          </div>
        </div>
      </section>

      <section id="chip" className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Chip — proposal status</h2>
          <span className={styles.sectionHint}>components/ui/Chip</span>
        </div>
        <div className={styles.row}>
          {STATUSES.map((status) => (
            <Chip key={status} status={status}>
              {status}
            </Chip>
          ))}
        </div>
      </section>

      <section id="license" className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>LicenseBadge</h2>
          <span className={styles.sectionHint}>components/ui/LicenseBadge · 블록 레벨 일급 UI</span>
        </div>
        <div className={styles.row}>
          {LICENSES.map((kind) => (
            <LicenseBadge key={kind} kind={kind} />
          ))}
        </div>
      </section>

      <section id="input" className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Input · Textarea</h2>
          <span className={styles.sectionHint}>components/ui/Input · 라벨 · hint · error</span>
        </div>
        <div className={styles.grid}>
          <Input
            label="표시 이름"
            hint="프로필과 기여 이력에 표시된다."
            placeholder="이름"
            defaultValue="이봉현"
            readOnly
          />
          <Input
            label="arXiv ID 또는 URL"
            mono
            hint="라이선스를 자동 검증한다."
            placeholder="2310.12345"
            defaultValue="2310.12345"
            readOnly
          />
          <Input
            label="arXiv ID"
            mono
            errorMessage="arXiv에서 이 ID를 찾을 수 없다. 형식은 YYMM.NNNNN 이다."
            defaultValue="not-a-real-id"
            readOnly
          />
          <Textarea
            label="수정 이유"
            optional
            hint="기본 2줄, 세로 드래그로 확장."
            defaultValue={`"저자는"으로 'We'를 번역했으나 스타일 가이드 §1에 따라 "우리는"으로 되돌린다.`}
            readOnly
          />
        </div>
      </section>

      <section id="card" className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Card</h2>
          <span className={styles.sectionHint}>components/ui/Card · padding=default|dense</span>
        </div>
        <div className={styles.grid}>
          <Card>
            <CardEyebrow>DEFAULT · 24px</CardEyebrow>
            <CardTitle>세그먼트 #42</CardTitle>
            <CardBody>
              카드는 헤어라인 1px + 라운드 6px. 그림자 없음. 컬러 세로줄만으로 상태를
              표시하는 것은 피한다.
            </CardBody>
            <div className={styles.row} style={{ marginTop: "var(--space-2)" }}>
              <Chip status="open">open</Chip>
            </div>
          </Card>
          <Card padding="dense">
            <CardEyebrow>DENSE · 16px</CardEyebrow>
            <CardTitle>리스트 행</CardTitle>
            <CardBody>
              정보 밀도가 높은 테이블/리스트에 쓴다. 패딩만 줄고 나머지 토큰은 동일.
            </CardBody>
          </Card>
          <Card>
            <CardEyebrow>EYEBROW · uppercase 0.08em</CardEyebrow>
            <CardTitle>Title — h3 by default</CardTitle>
            <CardBody>
              <code>as=&quot;h2&quot;</code>로 의미 수준을 바꿀 수 있으나 시각 스케일은
              동일하다.
            </CardBody>
          </Card>
        </div>
      </section>

      <section id="donts" className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Don&apos;ts</h2>
          <span className={styles.sectionHint}>docs/design/README.md 참조</span>
        </div>
        <ul className={styles.donts}>
          <li>pill 버튼(완전 둥근 border-radius)</li>
          <li>컬러 그림자·네온 글로우</li>
          <li>카드 좌측 컬러 세로줄만으로 상태를 암시하는 클리셰</li>
          <li>파랑·보라 그라데이션</li>
          <li>버튼·토스트·빈 상태의 이모지</li>
          <li>
            <code>outline: none</code>
          </li>
          <li>라이선스 뱃지를 푸터에만 배치(블록 레벨 일급 UI여야 한다)</li>
          <li>
            <code>#000</code> 진검정 — <code>--ink-900</code>을 쓴다
          </li>
          <li>전면 사진, 패럴럭스, 바운스 모션</li>
        </ul>
      </section>
    </div>
  );
}
