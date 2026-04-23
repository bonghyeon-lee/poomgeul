"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { Button, Input, LicenseBadge, Logo } from "@/components/ui";
import {
  SourceInputError,
  lookupSourceLicense,
  parseSourceInput,
  type LicenseLookupResult,
  type ParsedSource,
} from "@/features/source-import";

import styles from "./page.module.css";

type FormStatus =
  | { phase: "idle" }
  | { phase: "parse-error"; message: string }
  | { phase: "looking-up"; parsed: ParsedSource }
  | { phase: "result"; parsed: ParsedSource; result: LicenseLookupResult };

const SAMPLES: Array<{ label: string; value: string; kind: string }> = [
  { label: "CC BY · 이미 등록됨", value: "2310.12345", kind: "arxiv" },
  { label: "CC BY-SA · ShareAlike", value: "arXiv:2504.20451", kind: "arxiv" },
  { label: "CC BY-ND · 차단", value: "https://arxiv.org/abs/2401.11112", kind: "arxiv" },
  { label: "Public Domain", value: "2506.00001", kind: "arxiv" },
  { label: "DOI · M1 예정", value: "10.1234/abcd.5678", kind: "doi" },
];

function formatErrorMessage(err: unknown): string {
  if (err instanceof SourceInputError) {
    if (err.code === "empty") return "arXiv ID나 URL을 입력한다.";
    return "인식할 수 없는 입력이다. 2310.12345 또는 https://arxiv.org/abs/... 형태로 넣는다.";
  }
  return "입력을 해석하는 중 알 수 없는 오류가 났다.";
}

export default function ImportPage() {
  const [raw, setRaw] = useState("");
  const [status, setStatus] = useState<FormStatus>({ phase: "idle" });

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
    const result = await lookupSourceLicense(parsed);
    setStatus({ phase: "result", parsed, result });
  }

  function handleSampleClick(value: string) {
    setRaw(value);
    void runLookup(value);
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
            입력은 <code>GET /api/sources/license</code>로 백엔드에 실제 조회된다.
            등록(번역본 생성)은 API가 붙을 때까지 비활성.
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
            <ResultCard parsed={status.parsed} result={status.result} />
          ) : null}
        </section>
      </main>
    </div>
  );
}

function ResultCard({
  parsed,
  result,
}: {
  parsed: ParsedSource;
  result: LicenseLookupResult;
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
              등록 가능하다. 다음 단계에서 ar5iv HTML을 가져와 세그먼트로 분할한다.
            </p>
            <div className={styles.resultActions}>
              <Button disabled>번역본 만들기</Button>
              <span className={styles.resultNote}>
                버튼은 API 연결 후 활성화된다.
              </span>
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
          <LicenseBadge kind={result.license} />
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
