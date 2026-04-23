import { Button, Card, CardBody, CardEyebrow, CardTitle, Chip, Eyebrow, Logo } from "@/components/ui";

import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Logo variant="wordmark-ko" priority />
          <nav className={styles.nav} aria-label="주요 링크">
            <a href="https://github.com/bonghyeon-lee/poomgeul" rel="noreferrer">
              GitHub
            </a>
            <a href="http://localhost:3000/api/docs" rel="noreferrer">
              API 문서
            </a>
          </nav>
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.hero}>
          <div className={styles.heroInner}>
            <Eyebrow>Pre-M0 · 2026</Eyebrow>
            <h1 className={styles.heroTitle}>
              <span>공개 텍스트를 </span>
              <span className={styles.heroAccent}>함께 번역한다.</span>
            </h1>
            <p className={styles.heroLead}>
              poomgeul(품글)은 공개 라이선스 텍스트를 위한 오픈소스 번역 플랫폼이다.
              원문은 위키처럼 공유하고, 번역본은 깃허브처럼 제안하고 머지한다.
            </p>
            <div className={styles.ctaRow}>
              <Button href="/t/sparse-moe-low-resource-mt">샘플 번역본 읽기</Button>
              <Button variant="secondary" href="/import">
                원문 가져오기
              </Button>
              <Button
                variant="ghost"
                href="https://github.com/bonghyeon-lee/poomgeul"
                rel="noreferrer"
              >
                GitHub
              </Button>
            </div>
          </div>
        </section>

        <section className={styles.sections}>
          <div>
            <h2 className={styles.sectionTitle}>세 축으로 움직인다</h2>
            <div className={styles.cardGrid}>
              <Card>
                <CardEyebrow>원문 · Wiki</CardEyebrow>
                <CardTitle>공개 텍스트를 가져온다</CardTitle>
                <CardBody>
                  arXiv 프리프린트와 퍼블릭 도메인 문서를 세그먼트 단위로 수입한다.
                  라이선스는 블록 레벨의 일급 UI로 노출한다.
                </CardBody>
              </Card>
              <Card>
                <CardEyebrow>초안 · AI draft</CardEyebrow>
                <CardTitle>번역 초안을 만든다</CardTitle>
                <CardBody>
                  세그먼트마다 AI가 한국어 초안을 제시한다. 사람은 읽고, 고치고,
                  근거를 남긴다. 버전과 해시는 모노스페이스로 드러낸다.
                </CardBody>
              </Card>
              <Card>
                <CardEyebrow>협업 · GitHub</CardEyebrow>
                <CardTitle>제안하고 머지한다</CardTitle>
                <CardBody>
                  제안은 <code>open</code>에서 출발해 <code>merged</code>,{" "}
                  <code>rejected</code>, <code>withdrawn</code>, <code>stale</code>로
                  정해진 상태기계를 거친다.
                </CardBody>
              </Card>
            </div>
          </div>

          <div>
            <h2 className={styles.sectionTitle}>제안 상태</h2>
            <Card>
              <CardBody>
                번역 제안은 오픈 → 머지/거절/철회/스테일로만 이동한다.
                상태는 컬러 토큰과 함께 언제나 같은 이름으로 드러난다.
              </CardBody>
              <div className={styles.statusRow}>
                <Chip status="open">open</Chip>
                <Chip status="merged">merged</Chip>
                <Chip status="rejected">rejected</Chip>
                <Chip status="stale">stale</Chip>
                <Chip status="withdrawn">withdrawn</Chip>
              </div>
            </Card>
          </div>

          <div>
            <h2 className={styles.sectionTitle}>지금 단계</h2>
            <Card>
              <CardBody>
                제품은 Pre-M0다. 백엔드 API와 웹 스캐폴드가 세워져 있고,
                디자인 시스템이 방금 이 페이지에 내려앉았다. 로드맵과 M0 스펙은
                저장소의 문서에서 확인한다.
              </CardBody>
              <ul className={styles.linkList}>
                <li>
                  <span className={styles.linkLabel}>Roadmap</span>
                  <code>docs/overview/roadmap.md</code>
                </li>
                <li>
                  <span className={styles.linkLabel}>M0 Spec</span>
                  <code>docs/specs/m0-mvp.md</code>
                </li>
                <li>
                  <span className={styles.linkLabel}>Workflow</span>
                  <code>docs/architecture/workflow-proposal.md</code>
                </li>
              </ul>
            </Card>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <span>poomgeul · 공개 텍스트를 위한 번역 플랫폼</span>
          <div className={styles.footerMeta}>
            <a href="https://github.com/bonghyeon-lee/poomgeul" rel="noreferrer">
              GitHub
            </a>
            <a href="http://localhost:3000/api/docs" rel="noreferrer">
              API 문서
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
