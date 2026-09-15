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

배포 대상, 도메인, 백업 제공자와 배치 작업 실행 방식은 아직 결정되지 않았다. 선택 전까지 특정 호스팅의 설정을 프로젝트 표준으로 기록하지 않는다. 후보를 비교할 때는 MVP 비용과 관리 난이도, Next.js 실행 호환성, Supabase와의 지역 지연, ZIP 가져오기·내보내기·정리 작업의 실행 시간, 사용자 증가 시 확장, 논리 백업과 복구 절차를 함께 평가한다.

Supabase 배포는 Dashboard에서 SQL을 붙여넣는 대신 연결된 프로젝트에 마이그레이션 이력을 적용한다.

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push
```

실제 서비스 배포 절차가 정해지면 애플리케이션 배포, 환경값 등록, 데이터베이스 적용, 스모크 검사, 롤백과 백업 복구 순서를 하나의 반복 가능한 절차로 확정해야 한다.
