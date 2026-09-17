# 실행과 운영

## 로컬 준비

필수 조건은 Node.js 20.9 이상, npm, Docker를 실행할 수 있는 환경, Supabase CLI다.

```bash
cp .env.example .env.local
npm install
npx supabase start
```

데이터베이스를 시작하기 전에 Docker가 실행 중이어야 한다. `npx supabase status -o env`가 출력한 API URL과 anon 키를 `.env.local`의 공개 Supabase 값에 넣고, 사이트 주소와 소유자 이메일을 실제 로컬 값으로 바꾼다. 로컬 인증은 신규 가입이 꺼져 있으므로 출력된 `SERVICE_ROLE_KEY`를 셸 기록이나 파일에 남기지 않게 직접 입력해 확인된 소유자를 만든다.

```bash
AMUWIKI_API_URL=http://127.0.0.1:54321
AMUWIKI_OWNER_EMAIL=owner@example.com
read -rs "AMUWIKI_SERVICE_ROLE_KEY?Local SERVICE_ROLE_KEY: "
curl --request POST "$AMUWIKI_API_URL/auth/v1/admin/users" \
  --header "apikey: $AMUWIKI_SERVICE_ROLE_KEY" \
  --header "Authorization: Bearer $AMUWIKI_SERVICE_ROLE_KEY" \
  --header "Content-Type: application/json" \
  --data "{\"email\":\"$AMUWIKI_OWNER_EMAIL\",\"email_confirm\":true}"
unset AMUWIKI_SERVICE_ROLE_KEY
```

응답에 사용자 `id`와 입력한 이메일이 있고 오류가 없는지 확인한 뒤, `AMUWIKI_OWNER_EMAIL`과 같은 값을 `.env.local`의 `OWNER_EMAIL`에 넣고 애플리케이션을 시작한다.

```bash
npm run dev
```

로그인 폼에서 소유자 이메일을 요청하고 기본 Mailpit 주소 `http://localhost:54324`에서 링크를 연다. 다른 이메일에는 실제 메일이 생성되지 않아야 한다.

| 환경값 | 역할 | 노출 범위 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 브라우저와 서버가 접근할 Supabase 주소 | 공개 가능 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | RLS를 전제로 사용하는 공개 클라이언트 키 | 공개 가능, 높은 권한 키로 대체 금지 |
| `NEXT_PUBLIC_SITE_URL` | 로그인 콜백의 기준 사이트 주소 | 공개 가능 |
| `OWNER_EMAIL` | 현재 로그인 가능한 소유자 이메일 | 서버 전용 |

## 일상 개발과 검사

```bash
npm run dev
npm test
npm run typecheck
npm run lint
npm run build
```

빠른 피드백에는 관련 테스트를 먼저 사용할 수 있지만 기능 완료 전에는 네 가지 전체 검사를 모두 실행한다. 브라우저 검증 전에는 포트 3000의 프로세스가 현재 작업 디렉터리의 최신 코드인지 확인한다.

## 로컬 데이터베이스

기존 데이터를 보존하며 새 마이그레이션만 적용할 때:

```bash
npx supabase db push --local
```

빈 로컬 환경을 마이그레이션과 seed부터 다시 검증할 때만 다음 명령을 사용한다. 이 명령은 로컬 사용자와 문서를 삭제하므로 보존할 데이터가 없는지 먼저 확인한다.

```bash
npx supabase db reset
```

초기화 뒤에는 위 Admin API 절차로 `OWNER_EMAIL`과 같은 확인된 계정을 다시 만들고 응답의 사용자 ID와 이메일을 확인한다. 신규 가입을 허용하지 않는 로컬 인증 설정을 유지한다. 행 단위 권한과 문서 트랜잭션 검사는 `supabase/tests/`의 SQL을 로컬 데이터베이스 컨테이너에서 실행해 확인한다.

## 배포

2026-09-17에 Personal MVP 배포 대상을 Vercel(무료 Hobby 플랜)과 Supabase(서울 리전, 무료 티어)로 정했다. 백업 제공자와 정기 배치 작업 실행 방식은 아직 결정되지 않았다 — 이 둘은 후속 범위로 남는다.

`main` 브랜치는 Vercel의 Git 연동으로 GitHub 리포(`straycat405/amuwiki`)에 연결되어 있다. `main`에 push하면 Vercel이 자동으로 프로덕션에 배포한다(다른 브랜치는 프리뷰 배포). 별도 GitHub Actions 워크플로는 없다 — [ci-cd-deployment-proposal.md](tracking/ci-cd-deployment-proposal.md)의 GitHub Actions 중심 제안은 검토했지만 Vercel의 기본 Git 연동으로 같은 효과(커밋 기반 자동 배포, 브랜치별 프리뷰)를 얻을 수 있어 별도로 채택하지 않았다.

Supabase 마이그레이션은 애플리케이션 배포와 별개로, 연결된 프로젝트에 직접 적용한다(Vercel push에 자동으로 묶여 있지 않음 — 스키마를 바꾼 뒤에는 반드시 이 명령을 따로 실행한다):

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push
```

애플리케이션 서버리스 함수는 Supabase와 같은 리전(`icn1`, 서울)을 쓰도록 개별 라우트에서 `preferredRegion`을 지정해야 한다. Vercel Hobby 플랜의 함수 실행시간 기본 제한(10초, 최대 60초)을 넘길 가능성이 있는 라우트(대량 ZIP 가져오기 등 여러 항목을 반복 처리하는 API)는 `maxDuration = 60`을 명시하고, 항목별 Storage 요청은 순차 `await` 대신 병렬 배치로 처리해야 한다 — 239개 문서짜리 ZIP 가져오기가 이 제한에 실제로 걸렸다(`app/api/imports/route.ts`, `app/api/imports/[jobId]/commit/route.ts` 참고). 그래도 60초를 넘는 배치는 커밋 API가 이미 처리된 항목(`imported`/`skipped`)을 건너뛰도록 되어 있어, 같은 요청을 다시 보내면 이어서 진행된다 — 다만 이건 재시도로 시간제한을 우회하는 것일 뿐 근본 해결은 아니다. 진짜 해결(비동기 작업 큐)은 후속 범위로 남는다.

실제 서비스 배포 절차(스모크 검사, 롤백, 백업 복구 순서를 하나의 반복 가능한 절차로 확정하는 것)는 아직 정해지지 않았다.
