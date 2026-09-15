# 현재 HTTP 인터페이스

모든 개인 데이터 인터페이스는 Supabase 세션 쿠키를 사용한다. 인증되지 않았거나 현재 허용된 소유자 이메일과 다른 세션은 개인 데이터를 받지 못한다. 응답 오류는 현재 주소마다 `{ message }` 형태이며, 설계된 `/api/v1` 공통 오류 형식은 아직 구현되지 않았다.

## `GET /api/documents/preview?slug=<문서-slug>`

- 입력: URL 인코딩 가능한 문서 slug. 빈 값이나 잘못된 값은 요청 오류다.
- 성공: `200`과 slug, 제목, 요약, Markdown 본문, 해석된 Wiki link 대상. 응답은 `private, no-store`로 캐시하지 않는다.
- 오류: 인증 실패 `401`, 잘못된 slug `400`, 같은 사용자의 활성 문서가 없으면 `404`.
- 접근 조건: 휴지통 문서와 다른 사용자의 문서는 반환하지 않는다.

```json
{
  "slug": "문서-slug",
  "title": "문서 제목",
  "summary": "요약",
  "bodyMarkdown": "본문",
  "wikiLinkResolutions": {
    "정규화된 개념 이름": { "href": "/documents/대상-slug", "title": "대상 제목" }
  }
}
```

## `POST /api/attachments`

- 입력: `multipart/form-data`의 `file`과 `documentId`. 파일은 PNG, JPEG, GIF, WEBP 중 하나이며 최대 25MB다.
- 성공: `200`과 `{ id, url }`. 같은 사용자·문서에서 같은 내용 해시가 이미 있으면 기존 첨부를 반환한다.
- 오류: 인증 실패 `401`, 입력·형식·크기 위반 `400`, Storage 또는 메타데이터 저장 실패 `500`.
- 접근 조건: 반환 URL은 공개 파일 주소가 아니라 인증된 다운로드 주소다.

## `GET /api/attachments/<id>`

- 입력: 첨부 UUID에 해당하는 경로 값.
- 성공: `200`과 원본 바이트, 저장된 MIME, 개인용 장기 캐시 헤더.
- 오류: 인증 실패 `401`, 첨부 메타데이터가 같은 사용자에게 없거나 파일이 없으면 `404`.
- 접근 조건: 요청자가 소유한 첨부만 비공개 Storage에서 내려받는다.

## `POST /api/imports`

- 입력: `multipart/form-data`의 복수 `files`. 현재 `.md`, `.markdown`, `.txt`만 허용하며 한 번에 최대 200개, 파일당 최대 5MB다.
- 성공: `200`과 작업 ID, 전체·준비·실패·중복 수, 항목별 경고, 최대 10개의 미리보기 표본. 이 단계는 문서를 생성하지 않는다.
- 오류: 인증 실패 `401`, 파일 없음이나 개수 초과 `400`, 작업 생성 실패 `500`. 개별 파일의 형식·크기·업로드 실패는 전체 요청 실패 대신 항목별 실패로 기록될 수 있다.
- 접근 조건: 원본은 사용자 ID 아래 비공개 작업 공간에 저장한다.

```json
{
  "jobId": "uuid",
  "totalFiles": 2,
  "readyCount": 1,
  "failedCount": 1,
  "duplicateInBatchCount": 0,
  "conflictWithExistingCount": 0,
  "items": [
    {
      "id": "uuid",
      "relativePath": "메모.md",
      "detectedTitle": "메모",
      "status": "ready",
      "warningCodes": []
    }
  ],
  "samples": [
    { "relativePath": "메모.md", "title": "메모", "bodyMarkdown": "본문" }
  ]
}
```

항목 상태는 `pending`, `ready`, `imported`, `skipped`, `failed` 중 하나다. 현재 발생 가능한 경고 코드는 `unsupported_extension`, `file_too_large`, `duplicate_title_in_batch`, `duplicate_title_existing`, `upload_failed`다.

## `POST /api/imports/<jobId>/commit`

- 입력: JSON `{ "conflictPolicy": "skip" | "rename" }`. 다른 값이나 생략은 `skip`으로 처리한다.
- 성공: `200`과 가져옴·건너뜀·실패 수 및 항목별 결과. 일부만 성공하면 작업 상태는 부분 성공으로 남는다.
- 오류: 인증 실패 `401`, 같은 사용자의 작업을 찾을 수 없으면 `404`. 파일별 읽기·문서 생성 실패는 항목별 실패로 반환된다.
- 접근 조건: 기존 문서 생성 규칙을 그대로 사용하며, 이름 바꾸기는 최대 20번 숫자 접미사를 시도한다. 기존 문서를 덮어쓰지 않는다.

```json
{
  "imported": 1,
  "skipped": 0,
  "failed": 0,
  "items": [
    {
      "relativePath": "메모.md",
      "title": "메모",
      "status": "imported",
      "slug": "메모"
    }
  ]
}
```

`slug`는 성공한 항목에만 있으며 건너뜀·실패 항목에는 없다. 작업의 최종 상태는 실패가 없으면 `completed`, 성공과 실패가 섞이면 `partial`, 성공이 없고 실패가 있으면 `failed`다.

## `GET /auth/callback`

- 입력: Supabase가 전달한 일회성 `code`와 선택적인 내부 `next` 경로.
- 성공: 코드를 세션으로 교환하고 같은 응답에 쿠키를 설정한 뒤 안전한 내부 경로로 이동한다.
- 오류: 코드 누락·교환 실패·허용되지 않은 이메일은 오류 표시가 있는 로그인 화면으로 이동한다.
- 접근 조건: `next`가 `/`로 시작하지 않거나 `//`로 시작하면 홈으로 제한해 외부 주소 이동을 막는다.
