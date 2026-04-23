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
              <span className={styles.heroAccent}>함께 번역합니다.</span>
            </h1>
            <p className={styles.heroLead}>
              poomgeul(품글)은 공개 라이선스 텍스트를 위한 오픈소스 번역 플랫폼입니다.
              원문은 위키처럼 공유하고, 번역본은 깃허브처럼 제안하고 머지합니다.
            </p>
            <div className={styles.ctaRow}>
              <Button href="/translations">번역본 목록</Button>
              <Button variant="secondary" href="/import">
                원문 가져오기
              </Button>
              <Button variant="ghost" href="/t/sparse-moe-low-resource-mt">
                샘플 번역본
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
            <h2 className={styles.sectionTitle}>품글은 이렇게 운영됩니다</h2>
            <div className={styles.cardGrid}>
              <Card>
                <CardEyebrow>단일 원문 수렴 · Wiki</CardEyebrow>
                <CardTitle>신뢰할 수 있는 원문 확보</CardTitle>
                <CardBody>
                  arXiv 논문이나 기술 문서를 문장 단위로 수집하고 교정합니다.
                  위키처럼 모두가 하나의 원문을 가꾸며 번역의 단단한 기초를 세웁니다.
                </CardBody>
              </Card>
              <Card>
                <CardEyebrow>AI 초벌과 교열 · AI Draft</CardEyebrow>
                <CardTitle>AI와 함께하는 초안 작업</CardTitle>
                <CardBody>
                  AI가 제안하는 초안을 바탕으로 번역의 진입 장벽을 낮춥니다.
                  사람은 맥락을 짚어 문장을 다듬고, 수정 근거를 투명하게 기록합니다.
                </CardBody>
              </Card>
              <Card>
                <CardEyebrow>여러 번역본의 공존 · GitHub</CardEyebrow>
                <CardTitle>다양성이 공존하는 번역</CardTitle>
                <CardBody>
                  정답은 하나가 아닙니다. 깃허브처럼 번역을 포크하고 제안하며,
                  동등하게 존재하는 여러 판본 속에서 최선의 표현을 함께 찾아갑니다.
                </CardBody>
              </Card>
            </div>
          </div>

          <div>
            <h2 className={styles.sectionTitle}>제안 상태</h2>
            <Card>
              <CardBody>
                번역 제안은 오픈 → 머지/거절/철회/스테일로만 이동합니다.
                상태는 컬러 토큰과 함께 언제나 같은 이름으로 드러납니다.
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
                제품은 Pre-M0 단계입니다. 백엔드 API와 웹 스캐폴드가 세워져 있고,
                디자인 시스템이 방금 이 페이지에 내려앉았습니다. 로드맵과 M0 스펙은
                저장소의 문서에서 확인하실 수 있습니다.
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
