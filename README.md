# 아무위키

문서를 떠나지 않고 개념을 연쇄 탐색하는 클라우드 개인 위키입니다.

## 로컬 실행

```bash
cp .env.example .env.local
npm install
npm run dev
```

환경변수에는 Supabase 프로젝트 URL, 공개 anon 키와 초기 소유자 이메일을 입력합니다.

## 품질 검사

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

제품·기술 결정은 [`docs/아무위키-제품-기술-설계.md`](docs/아무위키-제품-기술-설계.md)를 기준으로 합니다.
