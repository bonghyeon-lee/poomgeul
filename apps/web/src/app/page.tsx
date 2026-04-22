export default function Home() {
  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <h1>poomgeul</h1>
      <p>
        공개 텍스트를 위한 오픈소스 번역 플랫폼. 현재 <strong>Pre-M0</strong> 단계입니다.
      </p>
      <p>
        백엔드는{" "}
        <a href="http://localhost:3000/api/docs" rel="noreferrer">
          API 문서 (localhost:3000/api/docs)
        </a>
        에서 확인할 수 있습니다.
      </p>
      <p>
        자세한 로드맵은 저장소의 <code>docs/overview/roadmap.md</code> 참조.
      </p>
    </main>
  );
}
