# poomgeul — 디자인 시스템

> Phase: `all` · 소스: `apps/web/src/app/globals.css`, `apps/web/src/components/ui/`

이 문서는 품글의 시각·타이포·톤·모션 규범을 정의한다. 출처는 Claude Design으로 작성한 핸드오프 번들(`poomgeul-design-system`)이며, 여기서는 repo 유지보수 관점에서 **왜 이렇게 결정했는지**와 **어기지 말아야 할 선**만 간추린다. 실제 토큰 값과 스타일은 코드(`globals.css`)가 정본이므로 이 문서는 값 자체를 나열하지 않는다.

---

## 원칙 한 줄 요약

품글은 **조용한 학술지**와 **분산 협업 도구**의 교차점에 있다. arXiv의 절제 + Read-the-Docs의 명료함 + GitHub의 밀도를, 한국어 조판 감각으로 옮긴 것이다. UI는 텍스트를 존중한다. SaaS 랜딩처럼 보이는 것을 피한다.

---

## 브랜드 기둥 세 가지

1. **문학적이되 기업적이지 않다.** 본문은 세리프를 감내한다. 색은 조용하다. 배경은 종이톤이다. 번쩍이는 것은 없다.
2. **한국어가 기본값이다.** 한글은 번역 타깃이 아니라 기본 읽기 경험이다. Pretendard는 한글/라틴을 깨끗이 섞기 때문에 UI 기본 서체이다.
3. **위키 × GitHub 감성.** 버전·diff·브랜치·커밋이 산문에 적용된다. 협업 기제를 드러내는 곳(세그먼트 버전, 제안 ID, 커밋 메시지, 해시)에는 항상 모노스페이스를 쓴다.

---

## 문자·톤

### 브랜드 표기

- 국제 문맥: `poomgeul` (소문자, 라틴). **`POOMGEUL`은 쓰지 않는다.**
- 한국어 문맥: `품글`.
- 두 표기는 동등한 피어이며 주/보조 관계가 아니다.

### 본문 산문 — `-이다/한다`체

repo `docs/`의 기존 관례를 따른다.

- ✅ "공개 텍스트를 번역한다."
- ❌ "공개 텍스트를 번역합니다."
- 1인칭 **"우리는"은 보존한다**. "저자는"으로 치환하지 않는다.

### UI 마이크로카피

산문보다 약간 부드럽게. 동사에는 `-하기`를 붙여 버튼 라벨을 만든다.

| 맥락 | 패턴 | 예 |
|---|---|---|
| Primary 버튼 | `{동사}하기` | `제안하기`, `승인하기`, `원문 가져오기` |
| Destructive | `{동사}` (보조어 없이) | `철회`, `거절`, `차단` |
| Empty state | 한 문장 + 안내 | `"아직 제안이 없다. 번역을 읽다가 개선할 곳을 찾으면 '제안하기'를 눌러보자."` |
| Toast — 성공 | 과거형 한 문장 | `"제안이 머지되었다."` |
| Toast — 오류 | 이유 + 다음 행동 | `"세그먼트가 그 사이 변경되었다. 현재 버전 기준으로 다시 작성하시겠어요?"` |

### 영어 병행

국제 기여자용 랜딩·OSS 문서에서만 쓴다.

- **Sentence case**. `Get started`, not `Get Started`.
- 평이·사실적. *blazingly fast*, *seamless* 같은 수사는 쓰지 않는다.
- 제품 고유 어휘를 우선한다: *translation*, *proposal*, *maintainer*, *segment*.

### 숫자·부호

- 아라비아 숫자 + 한국어 단위: `10%`, `세그먼트 30개`.
- 라틴 따옴표는 직선형 `"..."`. 한국어는 `" "` 바깥 + `' '` 안쪽.
- 영어에서 em dash `—`는 허용. 한국어에서는 쉼표 또는 `―`를 선호한다.
- 코드·수식·arXiv ID·커밋 SHA는 항상 모노스페이스.

### 이모지

**쓰지 않는다.** 단, `docs/` 헤딩에서 길잡이로 쓰는 관습(`🆕`, `💻`)만 예외이며 product UI(버튼·토스트·빈 상태)에는 어떤 경우에도 넣지 않는다.

---

## 팔레트 — 왜 "따뜻한 종이"인가

제품은 두 극 사이에 있다.

- **arXiv의 학술 논문** — 따뜻한 크림 종이, 세리프.
- **GitHub의 협업 크롬** — 차가운 중립, 모노스페이스.

품글은 이 둘을 분리해서 적용한다: **읽기 표면엔 따뜻한 종이, 협업 크롬엔 차가운 중립.**

- **Surface** — `--paper-100` 오프화이트(`#FAF7F2`). 순백 `#FFFFFF`는 집중 편집 오버레이에만 쓴다.
- **Ink** — `--ink-900` (`#1A1915`). `#000`을 쓰지 않는 이유는 종이 위에서 검정이 차갑게 보이기 때문이다.
- **Brand** — **책갈(chaek-gal)**, `--dak-500` 책가죽 가죽갈색(`#5B3A23`). SaaS 블루로 읽히지 않는다. 오래된 장정, 인쇄 잉크의 느낌.
- **Accent** — **낙관(nakgwan)**, `--seal-500` 인주 빨강(`#B84C3A`). 라이선스 경고·파괴적 액션·`rejected` 상태에만 쓴다. 아껴서 쓴다.
- **Semantic 상태**:
  - `open` → 책갈색 (`--color-open`)
  - `merged` → 이끼 녹색 `--moss-500`
  - `rejected` → 인주 빨강
  - `stale` → 황토 `--ochre-500`
  - `withdrawn` → 따뜻한 회색 + italic

### 금지 목록

- 파랑·보라 그라데이션
- 네온·형광
- 이모지 색조의 채도 높은 색
- 제품 UI 안의 무지개 그라데이션

팔레트의 어떤 색도 **비명을 지르지 않는다**.

### License 색

| 라이선스 | 색 토큰 | 의미 |
|---|---|---|
| CC BY, CC BY-SA | `--color-license-ccby` (이끼) | 번역·재배포 가능 |
| Public Domain | `--color-license-pd` (잉크) | 저작권 제한 없음 |
| CC BY-ND, CC BY-NC-ND | `--color-license-blocked` (낙관) | 번역본 제작 차단 |

라이선스 뱃지는 **푸터 장식이 아니다.** 블록 수준 일급 UI이다.

---

## 타이포그래피 — 세 서체의 세 가지 역할

| 역할 | 서체 | 토큰 | 근거 |
|---|---|---|---|
| 본문·UI (한글·라틴) | **Pretendard Variable** | `--font-sans` | 사실상 한글 웹 UI 표준. 라틴·한글 조합이 깨끗함. |
| 디스플레이·장문 세리프 (번역문 본문, 신문풍 제목) | **Source Serif 4** | `--font-serif` | 학술적, opsz variable 지원. Noto Serif KR과 짝. |
| 한글 세리프 (번역 읽기 뷰 전용) | **Noto Serif KR** | `--font-serif-ko` | Source Serif 4의 한글 짝. |
| 모노 (코드·SHA·세그먼트 버전·arXiv ID·커밋 메시지) | **JetBrains Mono** | `--font-mono` | 제로/O 구분, 한글 폴백 행동 양호. |

### 스케일·행간

- 타입 스케일: UI는 1.200 비율(`--fs-12` ~ `--fs-36`), 읽기 뷰는 1.250(`--fs-18` ~ `--fs-60`).
- 행간은 **디스플레이는 타이트, 읽기는 여유롭게**.
  - 한국어 본문: `--lh-loose` (1.75). 한글은 공간이 필요하다.
  - 영어 본문: `--lh-relaxed` (1.65).
  - UI: `--lh-normal` (1.5).
- 한국어 본문엔 `word-break: keep-all`을 건다 — `.t-read-ko` 유틸 클래스가 처리한다.

### 언제 어떤 서체를 쓰는가

- **Pretendard가 기본이다.** 헤더·버튼·카드·토스트·nav·폼 전부.
- **Source Serif 4는 랜딩 히어로와 제목**에만. 본문은 쓰지 않는다(Pretendard가 본문이다).
- **Noto Serif KR은 번역 reading view**(세그먼트 렌더링 화면)에만. 다른 곳에서는 쓰지 않는다.
- **모노는 기계적 식별자**만. 제목에 쓰지 않는다.

---

## 레이아웃·공간·모서리·그림자

- **4-px 베이스 스페이싱.** `--space-1`..`--space-9`는 4, 8, 12, 16, 24, 32, 48, 64, 96.
- **모서리는 작다.** `--radius-sm` 4px, `--radius-md` 6px, `--radius-lg` 8px. **pill 버튼 금지, 크게 둥근 카드 금지** — 소비자 앱처럼 읽힌다.
- **엘리베이션은 절제.** 헤어라인 테두리(`1px solid var(--border)`)를 그림자보다 우선한다. 실제 그림자 레벨은 두 개뿐.
  - `--shadow-1` 메뉴
  - `--shadow-2` 모달
  - **카드는 그림자 없음. 헤어라인만.**
- 콘텐츠 측정 폭:
  - 한국어 본문: 64ch (`--measure-ko-body`)
  - 영어 본문: 68ch (`--measure-en-body`)
  - 에디터(원문 옆): 52ch (`--measure-editor`)
- 헤더 높이는 어디서나 **56px** (`--header-h`). 2줄 헤더는 읽기를 방해한다.

### 배경

- **Paper texture** — `/brand/paper-texture.svg`. 2~3% 불투명도의 미세 노이즈. 긴 읽기 뷰와 랜딩 히어로에만 쓴다. **입력·폼 표면엔 쓰지 않는다.**
- **전면 사진 금지.** 제품은 텍스트가 주인공이다.
- **크롬 그라데이션 금지.** 예외는 읽기 뷰 상단의 paper→paper-shadow 수직 그라데이션 하나.

---

## 상호작용 — hover·press·focus·disabled

- **Hover**: 링크는 밑줄이 나타나고 색이 한 단계 어두워진다. 버튼은 배경이 약 6% L 어두워진다.
- **Press**: `scale` 변경 없음. 대신 추가로 4% L 어두워지고 drop-shadow가 제거된다 — "페이지 속으로 눌린" 느낌.
- **Focus**: 항상 보이는 2px offset ring, `--color-brand` 40% alpha. `outline: none`은 절대 쓰지 않는다.
- **Disabled**: `opacity: 0.5` + `cursor: not-allowed`. 색 채도 낮추는 트릭 금지.

---

## 모션

- **페이드 + 짧은 translate만.** 바운스 없음. 문학 UI는 탄성이 없다.
- 표준 이징: `--ease-standard` (`cubic-bezier(0.2, 0, 0, 1)`).
- 기간 토큰:
  - `--dur-1` 120ms — hover·press
  - `--dur-2` 200ms — enter·exit
  - `--dur-3` 320ms — 페이지 전환
- **Segment 저장**은 좌측 엣지 펄스 하나(`--color-merged`)가 유일하게 "축하"처럼 동작한다.
- 스크롤 연동 애니메이션·패럴럭스 금지.

---

## 테두리

- **헤어라인이 기본.** `1px solid var(--border)`.
- **2px**는 focus ring과 활성 탭 인디케이터에만.
- **dashed**는 의미가 있다: dropzone / stale / AI draft placeholder.

---

## 아이콘

- **Lucide**가 기본. 앱에서는 `lucide-react`, 마케팅/HTML에서는 CDN.
- **License 뱃지**는 Lucide가 아니다. `public/brand/`(추후 `assets/license/`) 자체 SVG를 고정 16px + CC 워드마크 + condition 글리프로 배치.
- **arXiv / GitHub / ORCID** 마크는 진짜 브랜드 SVG. **재그리지 않는다.**
- Lucide가 정말 안 맞는 경우에만 커스텀 아이콘을 만든다. 규칙: 24×24 viewBox, 1.5-px stroke, `currentColor`, no fills, rounded caps.
- 이모지는 아이콘 시스템이 아니다(위 참조).
- 유니코드 예외: `—` (영어 em dash), `·` (구분 미들닷), `→` (번역 방향 레이블 `en → ko`).

---

## 컴포넌트 키트 사용 원칙

실제 목록과 props는 `apps/web/src/components/ui/index.ts`를 정본으로 본다. 리빙 데모는 `/design-system` 라우트다. 키트는 다음 규칙을 따른다.

- **모든 스타일 값은 토큰 참조만 한다.** `color: #5B3A23` 같은 리터럴 색·크기·그림자를 쓰지 않는다. 유일한 예외는 diff 스와치처럼 토큰이 아직 없는 화면에 한한다(그 경우 새 토큰을 `globals.css`에 먼저 추가한다).
- **variant는 열거 가능하게.** `Button`의 variant는 `primary | secondary | ghost | destructive`로 고정. 새 variant는 추가하지 말고, 필요하면 해당 맥락에서 새 컴포넌트를 만든다.
- **`Chip`은 proposal status 전용이다.** 일반 태그·라벨을 만들고 싶으면 별도 컴포넌트(예: `Tag`)를 따로 세운다. 상태 유니온이 섞이는 것을 막는다.
- **`LicenseBadge`는 블록 레벨 UI로 노출한다.** 푸터에만 배치하지 않는다. Reader 헤더·번역본 Attribution·원문 import 확인 화면에서 일관된 크기(16~18px 라인 높이)로 쓴다.
- **`Input`과 `Textarea`는 라벨·hint·errorMessage를 필수로 함께 다룬다.** placeholder만 쓴 필드는 접근성 회귀. 단축 입력(arXiv ID 등)은 `mono` prop으로 모노스페이스. error 상태는 `--seal-300` 테두리 + 낙관색 메시지로 고정.
- **도메인-특화 컴포넌트·순수 함수는 `features/<domain>/`에 둔다.** 예: 원문·번역 병렬 세그먼트 행(`SegmentPair`)과 `AttributionBlock`은 `apps/web/src/features/reader/`에, `parseSourceInput`과 mock 라이선스 조회는 `apps/web/src/features/source-import/`에 있다. feature 외부로는 `index.ts`를 통해서만 노출한다.
- **Public API는 `index.ts`에서만 export.** 내부 파일 직접 import 금지 — 교체·폴더 재구성 여지를 남긴다.

---

## 금지 사항 체크리스트

다음 중 하나라도 포함되면 디자인 시스템을 위배한 것이다.

- [ ] pill 버튼 (완전히 둥근 `border-radius`)
- [ ] 컬러 그림자·네온 글로우
- [ ] 좌측 컬러 세로줄만으로 카드 상태 표시(클리셰)
- [ ] 파랑·보라 그라데이션
- [ ] 이모지를 버튼·토스트·빈 상태에 사용
- [ ] `outline: none`
- [ ] 라이선스 뱃지를 푸터에만 배치(블록 수준 일급 UI여야 함)
- [ ] `#000` 진검정
- [ ] 전면 사진·파라락스·바운스 모션

---

## 변경·이견 제기

토큰 값이나 서체를 바꾸고 싶으면 `globals.css` 한 군데만 고친다. 고치기 전에 다음을 점검한다.

1. 이 문서의 **원칙 기둥**에 맞는가?
2. 기존 컴포넌트 키트가 새 값에서도 읽히는가(특히 접근성 대비)?
3. `/` 랜딩이 여전히 일관되는가?

디자인 번들(`poomgeul-design-system`) 원본 README는 브랜드 철학 유도 과정과 초기 대화를 더 상세히 담고 있으며, 이 저장소에는 포함되지 않는다. 필요하면 claude.ai/design의 원본 세션을 참고한다.
