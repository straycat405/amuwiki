<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# 아무위키

아무위키는 한 사용자가 여러 기기에서 Markdown 문서를 기록하고, 현재 문서를 떠나지 않은 채 연결된 개념을 카드로 연쇄 탐색하는 개인 지식 도구다. 현재는 소유자 한 명을 위한 MVP지만, 데이터와 권한 경계는 향후 사용자별 독립 공간을 제공하는 서비스로 확장할 수 있어야 한다.

## 프로젝트 문서와 코드 영역

```text
my-wiki/
├── AGENTS.md                     ← Codex 작업 진입점
├── CLAUDE.md                     ← Claude Code 작업 진입점
├── docs/
│   ├── INDEX.md                  ← 작업 유형별 필독 문서 라우터, 문서 상태(현재 사실/결정/가이드/제안/보관) 정의
│   ├── architecture.md           ← 구성 요소, 의존 방향, 주요 데이터 흐름
│   ├── business-rules.md         ← 문서·개념·탐색·가져오기의 제품 규칙
│   ├── security.md               ← 인증, 사용자 격리, 비공개 데이터 정책
│   ├── standards.md              ← 변경 시 반드시 지킬 개발 규칙
│   ├── engineering-notes.md      ← 재발하기 쉬운 문제와 검증 방법
│   ├── operations.md             ← 설치, 실행, 데이터베이스, 배포 절차
│   ├── contracts.md              ← 현재 외부 HTTP 인터페이스
│   ├── 상용화-대비-교체-지점.md  ← 상용화·다중 사용자 전환 시 교체할 지점
│   ├── archive/                  ← 보관 문서(현재 사실 아님): 원본 설계서, 개발 인수인계 기록
│   └── tracking/
│       ├── status.md             ← 지금 시점의 구현 범위(서술형 이력 없음, 이력은 git log 참고)
│       ├── findings.md           ← 지금 해결하지 못한 실제 문제
│       ├── proposals/            ← 검토 중이며 아직 채택되지 않은 제안 문서
│       └── decisions/
│           ├── index.md          ← 결정 기록 목록
│           ├── 0001-database-and-markdown.md          ← DB 원본과 Markdown 이식성 결정
│           ├── 0002-private-multitenant-foundation.md ← 비공개·사용자별 서비스 기반 결정
│           ├── 0003-document-as-concept.md            ← 문서를 개념 단위로 삼은 결정
│           ├── 0004-contextual-card-exploration.md    ← 현재 문맥의 카드 탐색 결정
│           ├── 0005-explicit-server-save.md           ← 임시 저장과 서버 저장 분리 결정
│           └── 0006-synchronous-export.md             ← 전체 내보내기를 동기 방식으로 생성하는 결정
├── app/
│   └── AGENTS.md                 ← 페이지, 서버 작업, HTTP 진입점 경계
├── components/
│   └── AGENTS.md                 ← 상호작용 UI와 렌더링 경계
├── features/
│   └── AGENTS.md                 ← 기능별 데이터 접근과 제품 로직 경계
├── lib/
│   └── AGENTS.md                 ← 인증·파싱·외부 서비스 공통 경계
└── supabase/
    └── AGENTS.md                 ← 스키마, 권한 정책, SQL 검증 경계
```

## 절대 지켜야 할 기준

- 사용자의 문서·검색 기록·설정·첨부파일은 기본 비공개다. 공개 또는 게시 기능은 사용자가 대상을 명시적으로 공개한 뒤에만 접근 경계를 열어야 한다.
- 모든 사용자 데이터는 사용자 ID로 격리한다. 현재의 소유자 이메일 제한을 완화하더라도 사용자별 데이터 격리를 우회하거나 단일 사용자 가정을 스키마에 추가하지 않는다.
- 운영 중 원본은 데이터베이스지만, Markdown 본문·메타데이터·첨부파일을 사용자가 읽을 수 있는 형태로 전부 내보낼 수 있어야 한다.
- 데이터베이스 변경은 새 마이그레이션으로만 추가한다. 기존 마이그레이션을 고쳐 배포 이력을 다시 쓰거나, 승인 없이 사용자 데이터를 초기화하지 않는다.
- 저장, 인증, 권한, 가져오기처럼 데이터 손실 가능성이 있는 변경은 자동 검사뿐 아니라 실제 사용자 흐름 또는 SQL 권한 검사로 결과를 확인한다.

## 작업 전에 확인할 것

- 작업 유형에 따라 추가로 읽을 문서는 `docs/INDEX.md`에서 먼저 확인한다. 이 문서는 어떤 문서가 지금 시점의 사실이고 어떤 문서가 제안·보관 상태인지도 정의한다.
- 모든 변경 전에 `docs/standards.md`와 `docs/engineering-notes.md`, 변경 영역의 `AGENTS.md`를 읽는다.
- 인증·공개·게시 기능을 바꾸기 전에는 사용자별 격리와 비공개 기본값이 유지되는지 먼저 확인한다.
- 스키마나 데이터 수명주기를 바꾸기 전에는 순방향 마이그레이션인지, 기존 문서와 첨부파일을 보존하는지 확인한다.
- 문서 경로를 추가하거나 수정하기 전에는 한글 주소 디코딩 규칙을 확인한다.
- 테마를 바꾸기 전에는 색상과 전 테마 공통 형태 토큰의 경계를 확인한다.
- Next.js 코드를 작성하기 전에는 설치된 버전의 `node_modules/next/dist/docs/`에서 관련 안내를 읽고 현재 API를 기준으로 구현한다.

## 문제 처리

다른 사용자의 데이터가 보이거나 수정되는 문제, 인증 우회, 문서·첨부파일 유실, 되돌릴 수 없는 마이그레이션은 작업을 멈추고 즉시 사용자에게 알린다. 그 밖에 현재 작업 범위를 벗어나 해결할 수 없는 문제는 `docs/tracking/findings.md`에 재현 조건, 영향, 지금 해결하지 못하는 이유를 남긴다.
