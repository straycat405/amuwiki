# 문서 라우터

이 문서는 "어떤 작업을 할 때 무엇을 먼저 읽어야 하는가"와 "충돌하는 두 문서 중 무엇을 믿어야 하는가"에 답하기 위해 존재한다. 새 문서를 추가하거나 옮길 때는 이 표도 함께 갱신한다.

## 문서 상태 구분

문서가 어느 칸에 있는지가 곧 신뢰도다. 아래 순서로 우선한다: **현재 사실 > 결정 기록 > 가이드 > 제안 중 > 보관**. 상위 칸의 문서와 하위 칸의 문서 내용이 다르면 상위 칸이 맞다.

| 상태 | 의미 | 위치 |
|---|---|---|
| 현재 사실 | 지금 시점에 유효한 확정된 사실. 구현이 이 내용과 다르면 문서 또는 코드 중 하나가 틀린 것이므로 바로잡는다. | `docs/architecture.md`, `docs/business-rules.md`, `docs/security.md`, `docs/contracts.md`, `docs/tracking/status.md`, `docs/tracking/findings.md` |
| 결정 기록 (ADR) | 왜 이렇게 정했는지의 근거. 결정이 뒤집히면 새 ADR을 추가하고 기존 ADR에 "대체됨: 000X" 표시를 남긴다. 기존 ADR을 고쳐 쓰지 않는다. | `docs/tracking/decisions/` |
| 가이드 | 작업 방법, 재발하는 문제와 대응, 운영 절차. | `docs/standards.md`, `docs/engineering-notes.md`, `docs/operations.md` |
| 제안 중 | 검토·논의 단계이며 아직 채택되지 않았다. **코드나 다른 문서의 근거로 인용하지 않는다.** 채택되면 결정 기록으로 승격하고 이 폴더에서 제거한다. 반려되면 보관으로 옮긴다. | `docs/tracking/proposals/` |
| 보관 | 과거 시점의 기록. 현재 사실과 다를 수 있으며, 충돌하면 무시한다. 전체 맥락이 필요한 드문 경우에만 참고한다. | `docs/archive/` |

## 작업을 시작하기 전에 (항상)

1. 루트 `AGENTS.md`/`CLAUDE.md`의 "절대 지켜야 할 기준"
2. `docs/standards.md`, `docs/engineering-notes.md`
3. 변경 영역의 `AGENTS.md` (`app/`, `components/`, `features/`, `lib/`, `supabase/`)

## 작업 유형별 추가로 읽을 문서

| 작업 유형 | 추가로 읽을 문서 |
|---|---|
| 인증, 공개/게시, 데이터 격리 관련 변경 | `docs/security.md`, `docs/business-rules.md` |
| 스키마·마이그레이션·RLS 변경 | `supabase/AGENTS.md`, `docs/operations.md`, `docs/security.md` |
| 문서 저장·리비전·Wiki link·카드 탐색 | `docs/business-rules.md`, ADR [0003](tracking/decisions/0003-document-as-concept.md)·[0004](tracking/decisions/0004-contextual-card-exploration.md)·[0005](tracking/decisions/0005-explicit-server-save.md) |
| 가져오기·내보내기 | `docs/business-rules.md`, `docs/tracking/findings.md`(스테이징 정리 미구현), ADR [0001](tracking/decisions/0001-database-and-markdown.md)·[0006](tracking/decisions/0006-synchronous-export.md) |
| UI·테마·카드 인터페이스 변경 | `components/AGENTS.md`, `docs/business-rules.md`, `docs/tracking/proposals/`의 UX 제안(제안 중, 채택 여부 확인 먼저) |
| 외부 HTTP 인터페이스 추가·변경 | `docs/contracts.md`, `docs/tracking/findings.md`(공개 API 형식 미정) |
| 배포·CI·백업 | `docs/operations.md`, `docs/tracking/findings.md`(배포 방식 미정), `docs/tracking/proposals/ci-cd-deployment-proposal.md`(제안 중) |
| "왜 이렇게 되어 있나" 확인 | [`docs/tracking/decisions/index.md`](tracking/decisions/index.md) → 개별 ADR |
| 지금 뭐가 구현/미구현인지 확인 | [`docs/tracking/status.md`](tracking/status.md), [`docs/tracking/findings.md`](tracking/findings.md) |
| 상용화·다중 사용자 전환 준비 | [`docs/상용화-대비-교체-지점.md`](상용화-대비-교체-지점.md) |
| 과거 설계 전체 맥락이 필요할 때(드묾) | `docs/archive/` — 현재 사실과 다르면 무시 |

## 새 문서를 추가하거나 정리할 때

- 확정된 사실이면 새 문서를 만들지 말고 해당하는 "현재 사실" 문서에 통합한다. 새 영역이라 통합할 곳이 없다면 새 문서를 만들고 이 표에 추가한다.
- 아직 결정하지 않았거나 검토가 필요하면 `docs/tracking/proposals/`에 상태(`제안 중`/`반려`)를 문서 상단에 표시해 둔다.
- 결정을 내렸다면 `docs/tracking/decisions/`에 번호를 이어 ADR을 추가하고 `index.md`를 갱신한다. 원래 제안 문서가 `proposals/`에 있었다면 제거하거나 `docs/archive/`로 옮긴다.
- 더 이상 현재 사실이 아니게 된 문서는 `docs/archive/`로 옮기고, 문서 최상단에 "보관 문서 — 현재 사실 아님"과 대체 문서 링크를 남긴다. 파일을 삭제하지 않는다(git 이력에는 남지만, 사람이 다시 찾아보기 어려워진다).
- `docs/tracking/status.md`에는 서술형 세션 기록을 추가하지 않는다. "지금 시점의 사실"만 갱신하고, 무엇을 언제 어떻게 검증했는지는 커밋 메시지로 남긴다.
