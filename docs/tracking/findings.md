# 해결되지 않은 문제

## `preferredRegion`이 설치된 Next.js 버전에서 폐기(deprecated)됨

`app/api/imports/route.ts:12`와 `app/api/imports/[jobId]/commit/route.ts:11`의 `export const preferredRegion = "icn1"`(Vercel 함수를 Supabase와 같은 서울 리전에 두어 지연을 줄이려던 설정, `operations.md` 참고)이 Next.js 16.3.5에서 빌드 시 `The "preferredRegion" route segment config is deprecated` 경고를 낸다(`node_modules/next/dist/docs/.../preferredRegion.md`: "Remove the `preferredRegion` export from your route files"). 문서엔 코드 내 대체 옵션이 없고 Vercel 플랫폼 설정(`vercel.json`의 `functions` 리전 지정 등)으로 옮기라는 취지로 보이나, 이 설정은 실제 프로덕션에서 239개 문서 ZIP 타임아웃을 고치는 데 쓰인 값이라 확인 없이 걷어내거나 옮기면 그 회귀를 다시 부를 위험이 있다. 지금은 경고만 뜨고 빌드는 통과하므로(에러 아님) 그대로 뒀다 — Vercel 프로젝트의 실제 리전 설정 확인 후 처리한다.

## 로그인/새로고침 직후 간헐적으로 "문서 목록을 불러오지 못했습니다"

2026-09-17 로컬 개발 환경(`app/(wiki)/page.tsx` → `features/documents/data.ts:49` `listDocuments`)에서 두 명(나와 실제 사용자)이 각각 한 번씩 목격했다. `documents` 조회의 `{ error }`가 참이면 원인 없이 일반 메시지만 던지고 새로고침하면 곧바로 정상으로 돌아온다. 이번 가져오기 진행률 작업과는 무관한 기존 코드(로그인·세션·`listDocuments` 어느 것도 이번 변경에서 건드리지 않았다)이지만 재현을 시도했다: 로그아웃→로그인 3회, 연속 새로고침 10회, 동시 요청 15개로도 다시 재현되지 않았고 PostgREST·Postgres 컨테이너 로그에도 관련 에러가 없었다 — 즉 Supabase 쪽 거부가 아니라 클라이언트-서버 왕복 어딘가의 드문 경쟁 상태로 추정된다. 원인을 좁히려고 `features/documents/data.ts:49`에 `console.error("[DEBUG listDocuments]", JSON.stringify(error))`를 임시로 추가해뒀다(커밋 안 됨, 다음에 재현되면 로컬 서버 로그에서 실제 Supabase 에러 내용을 확인할 수 있다). 발생 빈도가 낮고 새로고침으로 즉시 복구되어 이번 세션에서는 원인을 확정하지 못했다.

## 작업 중 로컬 Storage 객체를 content hash로 잘못 지운 사고 (복구됨)

2026-09-16 내보내기 기능 검증 도중, 이전 단계(ZIP 가져오기 테스트) 정리 과정에서 SQL로 `storage.objects`를 content sha256 부분 문자열로 조회해 나온 3건을 전부 내 테스트 데이터로 착각하고 Storage API로 삭제했다. 실제로는 그중 2건이 살아 있는 `attachments` 행(문서 `테스트-이미지-문서`의 `red-pixel.png`, 그리고 제목 없는 버려진 임시 문서의 첨부)이 참조하던 실제 파일이었다. 두 파일 모두 삭제된 sha256(`431ced6916a2a21a156e38701afe55bbd7f88969fbbfc56d7fe099d47f265460`)이 세션 내내 반복 사용한 1x1 테스트 PNG와 정확히 같아, 동일 바이트를 같은 경로에 재업로드해 두 첨부 모두 `/api/attachments/{id}`가 다시 200을 반환하는 것까지 확인해 복구했다. 원본이 정말 같은 바이트였는지는 확인할 수 없고, 복구는 해시가 일치하는 대체 파일을 올린 것이다. 재발 방지: Storage 객체를 정리할 때는 본인이 방금 만든 정확한 경로만 삭제하고, content hash 같은 넓은 조건으로 조회한 결과를 검증 없이 일괄 삭제하지 않는다.

## 가져오기 스테이징 원본이 기한 없이 남음

`import_jobs.expires_at`은 생성 시 7일 뒤로 기본 설정되지만, 이 값을 읽어 `data-jobs` Storage 버킷의 원본 업로드와 분석 보고서를 실제로 지우는 주기 작업은 아직 없다. ZIP·다중 파일 가져오기를 반복할수록 스테이징 버킷 사용량이 계속 늘어난다. `/settings/drafts`의 임시 문서 정리와 같은 종류의 문제이므로, 소유자가 누를 수 있는 수동 정리 화면 또는 Supabase 쪽 자동 스케줄 중 어느 쪽으로 처리할지 먼저 정한 뒤 구현해야 한다.

## 배포와 복구 방식이 결정되지 않음

현재 로컬 개발과 Supabase 마이그레이션 절차는 있지만 실제 애플리케이션 호스팅, 도메인, 배치 작업 실행 위치, 논리 백업과 복구 목표는 정해지지 않았다. 이 상태에서는 공개 서비스의 비용·실행 제한·장애 복구 수준을 검증할 수 없다. MVP의 사용량과 향후 사용자별 서비스 확장을 함께 비교해야 하므로 특정 제공자를 임의로 확정하지 않는다. 주석·검색·정리·가져오기·내보내기의 실행 특성이 구체화되는 시점에 후보별 비용, 실행 시간, 지역, 백업과 이식성을 평가한다. 배포처가 정해지면 [ci-cd-deployment-proposal.md](proposals/ci-cd-deployment-proposal.md)의 GitHub Actions CI/CD 제안(아직 미채택)을 함께 검토한다.

## 커밋 재시도마다 전체 문서를 다시 재색인함

`app/api/imports/[jobId]/commit/route.ts`의 3단계(`reindexAllDocuments`)는 그 커밋 요청에서 하나라도 새 문서를 만들었으면(`created.length > 0`) 매번 실행되는데, 이때 이번 배치뿐 아니라 소유자의 **전체** 문서를 재색인한다. 60초 제한에 걸려 같은 커밋을 여러 번 재요청하면(코드 주석의 "이어서 진행" 방식) 재시도마다 이 전체 재색인 비용을 다시 지불하고, 문서가 쌓일수록 재시도 1회당 비용도 함께 늘어난다. 2026-09-17에 ZIP 문서 개수 상한을 250→150, 총 용량을 250MB→50MB로 낮춰 애초에 재시도가 거의 필요 없도록 했지만(`features/imports/types.ts`), 계정의 문서 수가 늘어나면 상한 안에서도 다시 느려질 수 있다. 근본 해결(배치 대상만 재색인하거나 비동기 작업 큐로 전환)은 이번 범위에서 다루지 않기로 결정했다 — 사용자가 명시적으로 "잡 큐 없이, 캡을 낮춰서 타임아웃을 피하는" 방향을 선택했기 때문.

## 설계된 전체 API 형식과 현재 주소가 다름

원본 제품 설계에는 `/api/v1` 주소와 공통 오류 본문이 정의되어 있지만 현재 구현은 기능에 필요한 내부 주소와 `{ message }` 오류만 제공한다. 지금 UI 내부 사용에는 동작하지만 외부 연동 또는 공개 API를 약속하면 주소와 오류 계약이 달라져 소비자가 깨진다. 공개 소비자가 아직 없고 가입·게시·외부 연동 범위가 정해지지 않아 현재 세션에서 API를 전면 재구성하지 않는다. 외부 API를 제공하기 전에 버전 정책, 인증 방식, 페이지네이션과 오류 형식을 다시 승인하고 호환 계층을 설계해야 한다.
