<div align="center">

# 아무위키

**읽던 문서를 떠나지 않고, 연결된 개념을 카드로 따라가는 개인 위키**

[빠른 시작](#빠른-시작) · [주요 기능](#주요-기능) · [기술 스택](#기술-스택) · [문서](#더-읽을-문서) · [알려진 제한](#알려진-제한)

</div>

---

> **상태**: 개인 MVP. 소유자 한 명(`OWNER_EMAIL` 환경값)만 로그인할 수 있고, 아직 배포처를 정하지 않아
> 로컬 실행을 전제로 합니다. 외부 기여를 받을 준비가 된 프로젝트는 아니지만, 구조와 결정 과정을
> 공개해두었습니다. 자세한 내용은 [상태](#상태-mvp)와 [알려진 제한](#알려진-제한)을 참고하세요.

## 이게 뭔가요

아무위키는 한 사람이 여러 기기에서 Markdown 문서를 쓰고, **지금 읽던 문서를 떠나지 않은 채** 연결된
개념을 카드로 열어보는 개인 지식 도구입니다. 링크를 가리키면 짧은 요약이 뜨고, 클릭하면 화면 위에
탐색 가능한 카드로 고정됩니다 — 전체 문서로 넘어가는 건 그걸 명시적으로 선택했을 때뿐입니다.

이 조합은 두 가지에서 왔습니다: Obsidian처럼 **문서 소유권이 전부 Markdown 파일에 있는 것**(여기서는
운영 원본이 데이터베이스지만, 언제든 Markdown·frontmatter·첨부파일 전체를 손실 없이 내보낼 수 있어야
한다는 원칙으로 이어집니다), 그리고 게임 *발더스 게이트 3*의 인게임 코덱처럼 **지금 읽던 맥락을 잃지
않고 설명을 연쇄적으로 따라가는 경험**입니다.

## 주요 기능

- **개념 카드 탐색** — 링크 호버는 요약만, 클릭은 화면 위 카드로 고정(최대 3개 동시). 카드 안에서도
  다시 다른 카드를 열며 계속 파고들 수 있고, 원래 읽던 문서는 그대로 남아 있습니다.
- **명시적 Wiki link** — `[[문서 제목]]`, `[[문서|표시명]]` 문법. 저장할 때 제목·별칭 사전과 대조해
  자동으로 연결하고, 대상이 없는 링크도 지우지 않고 "끊긴 링크"로 보여줍니다.
- **한국어 문서 주소** — 제목이 그대로 주소가 됩니다(`/documents/문서-제목`).
- **검색** — 제목 완전 일치 → 별칭 → 접두어 → 유사도 → 본문 부분 일치 순으로 정렬, 본문 결과는 검색어
  주변 문맥을 미리보기로 보여줍니다.
- **이미지 첨부** — 붙여넣기·업로드, 내용 해시로 중복 제거, 비공개 Storage에 저장.
- **가져오기** — `.md`/`.markdown`/`.txt` 다중 선택 또는 Markdown 폴더·Obsidian vault를 담은 ZIP.
  경로 이탈·심볼릭 링크·압축 폭탄을 먼저 걸러내고, 묶음 안에서 서로를 가리키는 문서들도 순서와
  무관하게 전부 연결합니다.
- **전체 내보내기** — 문서마다 frontmatter를 보존한 Markdown, 첨부파일, `manifest.json`, 탐색용
  `index.md`를 담은 ZIP을 그 자리에서 내려받습니다. 서비스가 사라져도 읽을 수 있게 하는 게 목표입니다.
- **AI 질문 (BYOK)** — 자신의 Anthropic/OpenAI 키를 등록하면 카드 안에서 문서에 질문하고, 답변을 새
  문서 초안으로 저장할 수 있습니다. 키는 암호화해 저장하고, AI는 언제나 제안만 하며 원문을 직접
  고치지 않습니다.
- **정리 제안** — 고아 문서, 깨진 링크, 정방향으로만 연결된 링크, 빈 요약을 찾아 보여주고 승인해야만
  반영됩니다.

## 기술 스택

| 영역 | 사용 기술 |
|---|---|
| 프레임워크 | Next.js 16 (App Router), TypeScript, React 19 |
| 데이터베이스·인증·Storage | Supabase (PostgreSQL, Auth, Storage, RLS) |
| Markdown | `react-markdown` + `remark-gfm`, `gray-matter`(frontmatter) |
| 가져오기·내보내기 | `yauzl`(ZIP 읽기, zip-slip·압축 폭탄 방어), `yazl`(ZIP 쓰기) |
| AI | Anthropic·OpenAI SDK (BYOK, 사용자 키로만 호출) |
| 테스트 | Vitest, Testing Library |

## 빠른 시작

Node.js 20.9+, npm, Docker, [Supabase CLI](https://supabase.com/docs/guides/cli)가 필요합니다.

```bash
cp .env.example .env.local
npm install
npx supabase start
```

`npx supabase status -o env`가 출력한 API URL·anon 키를 `.env.local`에 넣고, 로컬 인증은 신규
가입이 꺼져 있으므로 Admin API로 소유자 계정을 직접 만듭니다 — 정확한 절차는
[`docs/operations.md`](docs/operations.md)에 있습니다. 소유자 계정을 만든 뒤:

```bash
npm run dev
```

로그인 폼에 소유자 이메일을 입력하면 로컬 Mailpit(`http://localhost:54324`)으로 매직 링크가 갑니다.

### 품질 검사

```bash
npm test        # Vitest
npm run typecheck
npm run lint
npm run build
```

기능을 완료로 보기 전에 네 가지를 모두 통과시킵니다. 인증·권한·가져오기·내보내기처럼 데이터에 영향을
주는 변경은 여기에 더해 `supabase/tests/`의 SQL 검사나 실제 브라우저 흐름으로도 확인합니다
([`docs/standards.md`](docs/standards.md) 참조).

## 더 읽을 문서

이 저장소는 설계 배경과 결정 이유를 코드만큼 진지하게 기록합니다. 무언가를 바꾸기 전에 관련 문서부터
읽는 걸 권장합니다.

| 문서 | 내용 |
|---|---|
| [`docs/아무위키-제품-기술-설계.md`](docs/아무위키-제품-기술-설계.md) | 전체 제품 범위의 원본 설계 |
| [`docs/architecture.md`](docs/architecture.md) | 구성 요소, 의존 방향, 주요 데이터 흐름 |
| [`docs/business-rules.md`](docs/business-rules.md) | 문서·개념·탐색·가져오기의 제품 규칙 |
| [`docs/security.md`](docs/security.md) | 인증, 사용자 격리, 비공개 데이터 정책 |
| [`docs/standards.md`](docs/standards.md) | 변경 시 반드시 지킬 개발 규칙 |
| [`docs/engineering-notes.md`](docs/engineering-notes.md) | 재발하기 쉬운 문제와 검증 방법 |
| [`docs/operations.md`](docs/operations.md) | 설치, 실행, 데이터베이스, 배포 절차 |
| [`docs/tracking/status.md`](docs/tracking/status.md) | 지금까지 구현·검증된 범위와 남은 순서 |
| [`docs/tracking/findings.md`](docs/tracking/findings.md) | 지금 해결하지 못한 실제 문제 |
| [`docs/tracking/decisions/`](docs/tracking/decisions/index.md) | 채택된 설계 결정과 그 이유 |

## AI 코딩 에이전트로 작업하기

이 저장소는 Claude Code·Codex 같은 AI 에이전트가 직접 코드를 작성하는 걸 전제로 구조화되어 있습니다.
루트의 [`CLAUDE.md`](CLAUDE.md)/[`AGENTS.md`](AGENTS.md)가 진입점이고, `app/`·`components/`·
`features/`·`lib/`·`supabase/` 각 영역에는 그 영역의 경계를 설명하는 `AGENTS.md`가 따로 있습니다.
사람이 기여하더라도 같은 문서를 읽는 걸 권장합니다 — 코드 스타일이 아니라 "이 계층은 무엇을 책임지지
않는가"를 정해둔 문서라 리뷰 기준과 동일합니다.

## 상태: MVP

지금은 소유자 한 명을 위한 개인 도구입니다. 사용자 ID 기준 데이터 격리, RLS 정책, 사용자별 Storage
경계는 이미 다중 사용자 서비스를 전제로 설계되어 있지만, 가입·계정 복구·탈퇴·악용 방지는 아직 없습니다
— 개인 사용 경험이 검증된 뒤에 열 계획입니다([`0002-private-multitenant-foundation`](docs/tracking/decisions/0002-private-multitenant-foundation.md)).

## 알려진 제한

- **배포처 미정** — 로컬 `next dev` + 로컬 Supabase로만 검증되어 있습니다. 다른 기기에서 쓰려면 실제
  호스팅이 필요합니다. GitHub Actions 기반 CI/CD 제안은
  [`docs/tracking/ci-cd-deployment-proposal.md`](docs/tracking/ci-cd-deployment-proposal.md)에
  있지만 아직 채택되지 않았습니다.
- **백업·복구 리허설 없음** — 정기 논리 백업과 복구 절차가 아직 없습니다.
- **가져오기 스테이징 정리 없음** — ZIP 원본·분석 보고서가 7일 뒤 삭제되도록 설계되어 있지만, 실제로
  지우는 주기 작업은 아직 없습니다.
- **모바일 카드 탐색 미구현** — 데스크톱 위주로 다듬어져 있고, 작은 화면의 하단 시트·키보드·스크린리더
  경험은 후속 범위입니다.

더 자세한 목록과 재현 조건은 [`docs/tracking/findings.md`](docs/tracking/findings.md)에 있습니다.

## 라이선스

아직 정해지지 않았습니다. 실제로 공개 저장소로 전환하기 전에 결정해야 합니다.

## 기여

지금은 단일 소유자가 직접 관리하는 프로젝트라 이슈 템플릿이나 PR 검토 파이프라인이 없습니다. 구조를
참고하거나 포크해서 쓰는 건 자유지만, 변경을 제안하기 전에 [`docs/standards.md`](docs/standards.md)와
관련 영역의 `AGENTS.md`를 먼저 읽어주세요.
