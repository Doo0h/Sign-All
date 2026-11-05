# Sign-All 화면 흐름 (3주차)

- 브랜치: `frontend` / 작성: 강지모 (프론트엔드)
- 표기: **[확정]** 팀 규칙, **[제안]** 프론트 제안, **[확인 필요]** 미확인
- 구현 코드: `frontend/` (프레임워크 없는 HTML/JS, D1 임시 선택). 실행: `cd backend && npm start`, `cd frontend && node serve.js` → http://localhost:5173

## 구현 범위

| 구분 | 내용 |
|---|---|
| 구현 | S0~S5 전체 흐름, 7개 API 연결, 로딩·오류·빈 결과·세션 만료, 데모 배너, 수어 candidate 안내, 키보드·접근성 기본, 변경 시 초기화 |
| 더미 | S0 개인정보·AI 고지 문구(화면에 `[더미 문구]`로 표시) |
| 미구현·스킵 | 와이어프레임 이미지, 탭 닫을 때 세션 종료 호출, 예상 소요 시간 문구, 모달 대신 `confirm()` 사용, 자동 테스트 |

## 0. 전제 [확정]

| 항목 | 값 |
|---|---|
| 백엔드 | `http://127.0.0.1:3001` |
| 허용 프론트 주소 | `localhost:5173`, `127.0.0.1:5173` |
| 응답 | 성공 `{data, meta}`, 실패 `{error}` (백엔드 계약서 기준 `error.code/message/retryable`) |
| 세션 헤더 | `X-Session-Token` (메모리에만 보관) |
| 데모 | `meta.isDemo === true`이면 상단 배너 표시 |
| 초기화 | 기업·직무·자기소개서 변경 시 질문·피드백 삭제 |
| 수어 | candidate는 의미 검증 전 자료, 없어도 텍스트 연습 가능 |

원칙: API 응답에 없는 기업 정보·영상은 만들어 넣지 않는다.

## 1. 화면 구성과 이동 [제안]

| ID | 화면 |
|---|---|
| S0 | 시작 (세션 생성) |
| S1 | 기업·직무 선택 |
| S2 | 자기소개서 입력·분석 |
| S3 | 질문 목록 |
| S4 | 질문 연습 (질문 → 수어 자료 → 답변 → 피드백, 한 화면) |
| S5 | 종료 |

```
S0 ─[연습 시작]→ S1 ─[다음]→ S2 ─[예상 질문 만들기]→ S3
S3 ─[연습하기]→ S4 ─[질문 목록으로]→ S3
S3 ─[기업·직무 변경]→ S1 (질문·피드백 초기화)
S3 ─[자기소개서 수정]→ S2 (분석·질문·피드백 초기화)
S3 ─[연습 종료]→ S5
```

## 2. 화면별 입력·버튼·결과

| 화면 | 입력 | 버튼 | 결과 영역 |
|---|---|---|---|
| S0 | 없음 | 연습 시작 | 안내, 고지 문구(더미), 오류 |
| S1 | 기업·직무 select | 다음 (둘 다 선택 시 활성) | 목록, 빈 목록 안내 |
| S2 | 자기소개서(≤10000자) | 분석하기, 이전, 예상 질문 만들기 | summary, keywords, competencies |
| S3 | 없음 | 연습하기, 기업·직무 변경, 자기소개서 수정, 연습 종료 | 질문 목록, `○ 미답변`/`✓ 피드백 받음` |
| S4 | 답변(≤5000자) | 키워드별 수어 자료 보기, 피드백 받기, 질문 목록으로, 다음 질문 | 수어 후보, 피드백(strengths/improvements/suggestion) |
| S5 | 없음 | 처음부터 다시 | 종료 안내 |

수어 구역이 비거나 실패해도 답변·피드백은 항상 가능. 응답에 `videoUrl`(https)이 있을 때만 `<video>` 생성.

## 3. 버튼별 API

| 화면 | 시점 | 요청 | 본문 | 받는 값 |
|---|---|---|---|---|
| S0 | 연습 시작 | `POST /api/session` | `{}` | `sessionToken` |
| S1 | 세션 직후 | `GET /api/companies`, `GET /api/jobs` (동시) | — | `items` |
| S2 | 분석하기 | `POST /api/resume/analyze` | `{resumeText}` | `analysisId, summary, keywords, competencies` |
| S2 | 예상 질문 만들기 | `POST /api/interview/questions` | `{companyId, jobId, analysisId}` | `questions[{questionId,text,keywords}]` |
| S4 | 수어 자료 보기 | `GET /api/signs?keyword=` | URL 인코딩 | `items, matchStatus, notice` |
| S4 | 피드백 받기 | `POST /api/interview/feedback` | `{questionId, answerText}` | `strengths, improvements, suggestion` |
| S3 | 연습 종료 | `POST /api/session/end` | `{}` | `ended` |

## 4. 로딩·오류·빈 결과·만료

- 로딩: 버튼 비활성(중복 요청 방지) + `role=status` 문장 + 결과 영역 `aria-busy`.
- 오류: `role=alert`에 백엔드 `error.message`(없으면 공통 문구) 표시, 입력값은 유지.
- 빈 결과: 기업·직무 없음, 질문 0개, 수어 없음/조회 실패 문구 표시.
- 세션 만료: HTTP 401·410 → "연습 시간이 만료되었습니다…" + `새로 시작`.
- 데모: 어떤 응답이든 `meta.isDemo`가 true면 상단 고정 배너.
- 수어 candidate: 자료가 있으면 항상 "참고용 후보 자료입니다. 질문 속 의미와 다를 수 있습니다."

## 5. 접근성·키보드

기본 `<button>`/`<a>`만 사용, 포커스 테두리 유지, `본문으로 건너뛰기` 링크, 화면 전환·결과 도착 시 제목으로 포커스, 색 외에 `✓`/`○` 글자 사용, 토스트·소리·자동재생 없음, 답변창 Enter는 줄바꿈.

## 6. 보안

토큰은 JS 변수에만 보관(storage·URL·console 금지). 자기소개서·답변은 URL에 넣지 않음. 입력이 있으면 `beforeunload` 확인. 탭 닫을 때 세션 종료는 `sendBeacon`이 커스텀 헤더를 못 붙여 미구현(서버 30분 만료에 맡김).

## 7. 결정 필요 사항

| # | 항목 | 상태 |
|---|---|---|
| D1 | 프레임워크 | 임시로 프레임워크 없이 구현. 확정 필요 |
| D2 | 응답 `data` 필드 | 계약서 기준으로 연결함. 백엔드 확인 필요 |
| D3 | 수어 키워드 | 해결: 질문 응답에 `keywords` 포함 |
| D4 | 세션 만료 기준 | 계약서 410/401 기준으로 처리 중 |
| D5 | 오류 문구 책임 | 백엔드 `message` 우선 사용 중 |
| D6 | `isDemo` 범위 | 어느 응답이든 true면 배너 |
| D7 | 토큰 필요 범위·CORS | 모든 요청에 토큰 첨부. CORS는 `Content-Type, X-Session-Token` 허용 확인 |
| D8 | S0 고지 문구 | 더미 문구 사용 중, 팀 확정 필요 |
| D9 | 피드백 재요청 | 임시 허용(확인 창) |
| D10 | S4 통합안 | 제안 상태 |
| D11 | 만료 후 자기소개서 유지 | 임시로 유지 안 함 |
