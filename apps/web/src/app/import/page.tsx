"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button, Input, LicenseBadge, Logo } from "@/components/ui";
import {
  SourceInputError,
  createSource,
  lookupSourceLicense,
  parseSourceInput,
  type CreateSourceResult,
  type LicenseLookupResult,
  type ParsedSource,
} from "@/features/source-import";

import styles from "./page.module.css";

type CreationState =
  | { phase: "idle" }
  | { phase: "creating" }
  | { phase: "error"; message: string };

type FormStatus =
  | { phase: "idle" }
  | { phase: "parse-error"; message: string }
  | { phase: "looking-up"; parsed: ParsedSource }
  | { phase: "result"; parsed: ParsedSource; result: LicenseLookupResult };

const SAMPLES: Array<{ label: string; value: string; kind: string }> = [
  { label: "실제 arXiv (대부분 non-CC → 차단)", value: "2504.20451", kind: "arxiv" },
  { label: "arXiv URL 형식", value: "https://arxiv.org/abs/2310.12345", kind: "arxiv" },
  { label: "존재하지 않는 ID", value: "9999.99999", kind: "arxiv" },
  { label: "잘못된 형식", value: "not-an-id", kind: "invalid" },
  { label: "DOI · M1 예정", value: "10.1234/abcd.5678", kind: "doi" },
];

function formatErrorMessage(err: unknown): string {
  if (err instanceof SourceInputError) {
    if (err.code === "empty") return "arXiv ID나 URL을 입력한다.";
    return "인식할 수 없는 입력이다. 2310.12345 또는 https://arxiv.org/abs/... 형태로 넣는다.";
  }
  return "입력을 해석하는 중 알 수 없는 오류가 났다.";
}

function createErrorMessage(result: CreateSourceResult): string {
  switch (result.outcome) {
    case "blocked":
      return `라이선스 문제로 생성이 차단됐다: ${result.reason}`;
    case "not-found":
      return `arXiv에서 찾을 수 없다: ${result.reason}`;
    case "unsupported-format":
      return `지원하지 않는 입력 형식이다: ${result.reason}`;
    case "upstream-error":
      return `arXiv 조회에 실패했다: ${result.reason}`;
    case "network-error":
      return `API 호출에 실패했다: ${result.reason}`;
    default:
      return "알 수 없는 오류";
  }
}

export default function ImportPage() {
  const router = useRouter();
  const [raw, setRaw] = useState("");
  const [status, setStatus] = useState<FormStatus>({ phase: "idle" });
  const [creation, setCreation] = useState<CreationState>({ phase: "idle" });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runLookup(raw);
  }

  async function runLookup(input: string) {
    let parsed: ParsedSource;
    try {
      parsed = parseSourceInput(input);
    } catch (err) {
      setStatus({ phase: "parse-error", message: formatErrorMessage(err) });
      return;
    }
    setStatus({ phase: "looking-up", parsed });
    setCreation({ phase: "idle" });
    const result = await lookupSourceLicense(parsed);
    setStatus({ phase: "result", parsed, result });
  }

  function handleSampleClick(value: string) {
    setRaw(value);
    void runLookup(value);
  }

  async function handleCreate(parsed: ParsedSource) {
    setCreation({ phase: "creating" });
    const result = await createSource(parsed);
    if (result.outcome === "created" || result.outcome === "already-registered") {
      router.push(`/t/${result.slug}`);
      return;
    }
    setCreation({ phase: "error", message: createErrorMessage(result) });
  }

  const inputError =
    status.phase === "parse-error" ? status.message : undefined;

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.crumbs}>
            <Logo variant="mark" href="/" ariaLabel="poomgeul 홈" />
            <span className={styles.crumbsSep}>/</span>
            <Link href="/">홈</Link>
            <span className={styles.crumbsSep}>/</span>
            <span>import</span>
          </div>
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.title}>
          <h1>원문 가져오기</h1>
          <p className={styles.titleLead}>
            arXiv ID · arXiv URL · DOI를 붙여넣으면 라이선스를 자동으로 검증한다.
            CC BY와 CC BY-SA, 퍼블릭 도메인만 번역본 등록이 가능하다.
          </p>
        </section>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <div className={styles.formRow}>
            <Input
              label="arXiv ID 또는 URL"
              mono
              hint="예: 2310.12345 · arXiv:2504.20451 · https://arxiv.org/abs/2401.11112"
              errorMessage={inputError}
              placeholder="2310.12345"
              value={raw}
              onChange={(e) => {
                setRaw(e.target.value);
                if (status.phase !== "idle") setStatus({ phase: "idle" });
              }}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              name="source-input"
              type="text"
              inputMode="url"
            />
            <Button type="submit" disabled={status.phase === "looking-up"}>
              {status.phase === "looking-up" ? "조회 중…" : "조회"}
            </Button>
          </div>
          <div className={styles.formFooter}>
            입력은 <code>GET /api/sources/license</code>를 거쳐 실제 arXiv Query API로
            조회된다. arXiv 대부분의 논문은 CC가 아닌 기본 non-exclusive 라이선스여서
            차단 결과가 일반적이다. 등록(번역본 생성)은 API가 붙을 때까지 비활성.
          </div>
        </form>

        <section className={styles.samples}>
          <span className={styles.samplesTitle}>샘플 입력</span>
          <div className={styles.sampleList}>
            {SAMPLES.map((s) => (
              <button
                key={s.value}
                type="button"
                className={styles.sampleChip}
                onClick={() => handleSampleClick(s.value)}
              >
                <span>{s.value}</span>
                <span className={styles.sampleKind}>· {s.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className={styles.result} aria-live="polite">
          {status.phase === "looking-up" ? (
            <div className={styles.skeleton}>
              <span className={styles.skeletonDot} aria-hidden="true" />
              라이선스 조회 중…{" "}
              {status.parsed.kind === "arxiv"
                ? `arxiv:${status.parsed.bareId}${status.parsed.version ? `v${status.parsed.version}` : ""}`
                : `doi:${status.parsed.id}`}
            </div>
          ) : null}

          {status.phase === "result" ? (
            <ResultCard
              parsed={status.parsed}
              result={status.result}
              creation={creation}
              onCreate={handleCreate}
            />
          ) : null}
        </section>
      </main>
    </div>
  );
}

function ResultCard({
  parsed,
  result,
  creation,
  onCreate,
}: {
  parsed: ParsedSource;
  result: LicenseLookupResult;
  creation: CreationState;
  onCreate: (parsed: ParsedSource) => void;
}) {
  if (result.outcome === "allowed") {
    const cardCls = result.alreadyRegistered
      ? `${styles.resultCard} ${styles.resultCardWarn}`
      : `${styles.resultCard} ${styles.resultCardAllowed}`;

    return (
      <div className={cardCls}>
        <div className={styles.resultHead}>
          <h2 className={styles.resultTitle}>{result.title}</h2>
          <LicenseBadge kind={result.license} />
        </div>
        <div className={styles.resultAuthors}>{result.authors.join(", ")}</div>
        <dl className={styles.resultGrid}>
          <dt className={styles.resultLabel}>원문 ID</dt>
          <dd className={styles.resultValue}>
            <code>
              {parsed.kind === "arxiv"
                ? `arxiv:${parsed.bareId}${parsed.version ? `v${parsed.version}` : ""}`
                : `doi:${parsed.id}`}
            </code>
            · {result.version}
          </dd>
          <dt className={styles.resultLabel}>원문 라이선스</dt>
          <dd className={styles.resultValue}>
            <LicenseBadge kind={result.license} />
          </dd>
          <dt className={styles.resultLabel}>번역본 라이선스</dt>
          <dd className={styles.resultValue}>
            <LicenseBadge kind={result.translationLicense} />
            {result.shareAlike ? (
              <span className={styles.resultNote}>
                CC BY-SA는 ShareAlike 조건이 승계되어{" "}
                <span className={styles.resultStrong}>자동 고정</span>된다.
              </span>
            ) : null}
          </dd>
        </dl>

        {result.alreadyRegistered ? (
          <>
            <p className={styles.resultNote}>
              이 원문은 이미 번역본이 등록되어 있다. 같은{" "}
              <code>(attribution_source, source_version)</code>은 중복 등록할 수 없다.
            </p>
            <div className={styles.resultActions}>
              {result.registeredSlug ? (
                <Button href={`/t/${result.registeredSlug}`}>등록된 번역본 보기</Button>
              ) : null}
              <Button variant="ghost" href="/">
                홈으로
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className={styles.resultNote}>
              등록 가능하다. 생성 직후엔 세그먼트가 비어 있고 ar5iv 파싱(M0 #3)은
              다음 단계에서 붙는다.
            </p>
            <div className={styles.resultActions}>
              <Button
                onClick={() => onCreate(parsed)}
                disabled={creation.phase === "creating"}
              >
                {creation.phase === "creating" ? "만드는 중…" : "번역본 만들기"}
              </Button>
              {creation.phase === "error" ? (
                <span className={styles.resultNote}>{creation.message}</span>
              ) : null}
            </div>
          </>
        )}
      </div>
    );
  }

  if (result.outcome === "blocked") {
    return (
      <div className={`${styles.resultCard} ${styles.resultCardBlocked}`}>
        <div className={styles.resultHead}>
          <h2 className={styles.resultTitle}>{result.title}</h2>
          {result.license === "arxiv-default" ? (
            <span className={styles.resultNote}>
              <code>arXiv non-exclusive</code>
            </span>
          ) : (
            <LicenseBadge kind={result.license} />
          )}
        </div>
        <p className={styles.resultNote}>{result.reason}</p>
        <div className={styles.resultActions}>
          <Button variant="ghost" href="/">
            홈으로
          </Button>
        </div>
      </div>
    );
  }

  if (result.outcome === "unsupported-format") {
    return (
      <div className={`${styles.resultCard} ${styles.resultCardWarn}`}>
        <div className={styles.resultHead}>
          <h2 className={styles.resultTitle}>DOI는 M1에 지원</h2>
        </div>
        <p className={styles.resultNote}>{result.reason}</p>
      </div>
    );
  }

  if (result.outcome === "upstream-error") {
    return (
      <div className={`${styles.resultCard} ${styles.resultCardBlocked}`}>
        <div className={styles.resultHead}>
          <h2 className={styles.resultTitle}>arXiv 조회 실패</h2>
        </div>
        <p className={styles.resultNote}>{result.reason}</p>
      </div>
    );
  }

  if (result.outcome === "network-error") {
    return (
      <div className={`${styles.resultCard} ${styles.resultCardBlocked}`}>
        <div className={styles.resultHead}>
          <h2 className={styles.resultTitle}>API 호출 실패</h2>
        </div>
        <p className={styles.resultNote}>{result.reason}</p>
      </div>
    );
  }

  return (
    <div className={`${styles.resultCard} ${styles.resultCardWarn}`}>
      <div className={styles.resultHead}>
        <h2 className={styles.resultTitle}>찾을 수 없음</h2>
      </div>
      <p className={styles.resultNote}>{result.reason}</p>
    </div>
  );
}
