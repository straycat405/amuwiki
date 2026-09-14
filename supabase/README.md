# Supabase

마이그레이션은 파일명 순서대로 적용합니다.

```bash
npx supabase start
npx supabase db reset
```

프로덕션에는 Dashboard SQL Editor가 아니라 Supabase CLI의 연결된 프로젝트 배포를 사용합니다.

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push
```

모든 공개 테이블은 RLS를 활성화하며 브라우저에 `service_role` 키를 노출하지 않습니다.

첫 소유자 계정은 Supabase Dashboard에서 `OWNER_EMAIL`과 같은 이메일로 미리 생성하고, Auth 설정의 신규 가입 허용을 끕니다. 애플리케이션도 `shouldCreateUser: false`로 OTP를 요청합니다.
