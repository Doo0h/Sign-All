# Sign-All Backend

Node.js **24.x**와 내장 SQLite를 사용합니다. 문서 추출에는 Python 3.11과 `python -m pip install -r requirements.txt`가 필요합니다. Docker 이미지는 이 의존성을 포함합니다. 기업·수어 참고 자료와 실제 AI 모드를 분리해 실행할 수 있습니다.

Docker·서버 설정은 [배포 안내](../docs/server-deployment.md)를 따릅니다. `POST /api/documents/extract`는 세션 토큰, `application/octet-stream` 본문, URI 인코딩한 `X-File-Name` 헤더를 받습니다. 최대 5MB이며 PDF/HWP 5/HWPX/DOCX/TXT를 지원합니다. 원본은 저장하지 않으며 추출한 텍스트는 사용자가 검토한 후 별도 분석 요청에 사용합니다.

## 빠른 실행 — Windows PowerShell / macOS / Linux

저장소를 받은 후:

```bash
cd backend
npm start
```

기본 주소는 http://127.0.0.1:3001 이며 APP_MODE=demo입니다. 브라우저에서 `/api/health`, `/api/companies`, `/api/jobs`를 열어 조회할 수 있습니다. POST 기능은 아래 계약에 맞춰 프론트·API 도구로 호출합니다.

별도 터미널에서 전체 요청 흐름을 확인합니다.

```bash
cd backend
npm run smoke
npm test
```

가상 회사·가상 직무·팀 작성 연습 요소를 SQLite에 넣습니다. 자기소개서 분석·질문·피드백은 명시적인 **규칙 기반 데모 응답**이며 실제 AI 분석이 아닙니다. 응답 meta.isDemo와 문구로 표시합니다. 실제 수어 자료가 없으므로 데모 수어 조회는 빈 목록을 반환합니다.

## 구현 범위

- 기업·직무 검색/페이지 조회, 수어 키워드 후보 조회
- 익명 임시 세션 생성·종료 및 분석→질문→피드백 연결
- JSON 입력·길이·ID·목록 범위 검증, 공통 오류 형식
- SQLite 참조자료 스키마·외래키·트랜잭션 가져오기
- 원문·답변·AI 결과의 SQLite 영구 저장 없음. 결과 일부는 만료 전 메모리에만 유지
- 세션 소유권, 입력 변경 시 이전 질문 무효화, 호출량·동시 실행·시간 제한
- 실제 AI용 chat-completions 호환 HTTP 어댑터와 응답·근거 검증

원본 CSV·선정 NCS 자료·수어 영상의 확보나 실제 AI 공급자 연동 검증은 완료하지 않았습니다. 프론트엔드 화면은 포함하지 않습니다.

## 환경 설정

기본 실행에는 .env가 필요 없습니다. `.env.example`을 `.env`로 복사하여 설정할 수 있습니다.

- HOST/PORT: 기본 127.0.0.1:3001. 기본은 로컬 전용
- DB_PATH: 기본 ./var/signall.sqlite. 사용자 원문 없이 참조자료만 저장
- APP_MODE: demo 또는 live. live에서는 demo 자료를 조회하지 않음
- ALLOWED_ORIGINS: 쉼표로 구분한 프론트 주소. 기본 localhost:5173 및 127.0.0.1:5173
- SESSION_TTL_SECONDS: 세션 전체 수명. 새로고침·서버 재시작·종료 시 맥락이 사라질 수 있음
- MAX_SESSIONS/MAX_BODY_BYTES/RATE_LIMIT_PER_MINUTE: 메모리·입력·IP별 제한
- MAX_AI_CONCURRENT/MAX_AI_CALLS_PER_HOUR/AI_TIMEOUT_MS: 단일 서버 프로세스 기준 상한

실제 AI를 연결하려면 APP_MODE=live 및 AI_API_URL(HTTPS 전체 chat-completions 주소), AI_API_KEY, AI_MODEL을 설정합니다. 요청은 messages/model/temperature/max_tokens, 응답은 choices[0].message.content의 JSON을 기대합니다. 공급자의 호환성·개인정보 처리 조건·비용은 별도 확인해야 합니다. 사용 중인 제공처가 다른 형식이면 src/ai.js 어댑터를 수정합니다. 키는 프론트·URL·Git에 넣지 않습니다.

## API 사용 순서

모든 성공 응답은 `{data, meta}`, 오류는 `{error}`입니다. 전체 요청 예시는 [구현 계약](../docs/backend-contract.md)을 참고하세요.

1. POST /api/session, JSON `{}` → data.sessionToken
2. 이후 POST 요청에 `X-Session-Token: 발급값`과 `Content-Type: application/json`
3. POST /api/resume/analyze, `{resumeText}` → analysisId와 분석 결과
4. POST /api/interview/questions, `{companyId,jobId,analysisId}` → questions
5. GET /api/signs?keyword=... → 후보 또는 빈 목록
6. POST /api/interview/feedback, `{questionId,answerText}` → 피드백
7. POST /api/session/end, `{}` → 메모리 세션 제거

세션 토큰은 bearer 비밀정보입니다. 프론트는 우선 메모리에 유지하고 콘솔·공유 URL에 남기지 않습니다. 로그인 기능이 아닙니다. 기업·직무 선택 또는 자기소개서 변경 시 화면의 기존 질문·피드백을 지우고 재요청해야 합니다. 현재 서버는 최신 분석 하나·질문 묶음 하나만 세션에 유지합니다.

## 참조자료 가져오기

검증한 원본을 팀 내부 형식으로 변환한 JSON 파일에 sources, companies, jobs, units, job_units, signs 배열을 넣습니다. 각 항목 규칙과 최소 예시는 [구현 계약](../docs/backend-contract.md)에 있습니다.

```bash
npm run import:data -- ../data/verified-internal.json
```

DB에는 사용자 데이터 테이블이 없습니다. 가져오기는 기존 ID를 갱신하는 트랜잭션이며 관계 오류 시 전체 롤백합니다. 전달한 jobs의 연결 목록을 교체하고 다른 ID는 자동 삭제하지 않습니다. JSON 가져오기는 원본 CSV 자동 검증 도구가 아닙니다. 변환 전 실제 헤더·값·기준일·이용 조건을 사람이 확인해야 합니다. live 출처에는 URL, checkedAt, usage, verificationStatus=verified가 필요합니다. 표시는 팀 검토 선언이며 프로그램이 외부 기관의 자료를 검증했다는 뜻이 아닙니다.

## 담당자 연계

- 황건수: src/ai.js의 프롬프트·모델 출력 검토. 입출력 계약 변경은 공유
- 강지모: docs/backend-contract.md의 세션 헤더·필드·오류에 맞춰 연동
- 모소연: 실제 검토한 수어 term/keywords/meaning/출처·영상 정보를 내부형식으로 전달
- 김두영: 서버·DB·입력 검증·세션·연동 테스트 유지

단일 프로세스 로컬 MVP입니다. 다중 서버의 공유 세션/분산 호출 제한, 운영 배포 HTTPS·인증·실제 공급자 검증은 후속 작업입니다. Node.js 내장 SQLite의 실행 환경은 [Node 24 공식 문서](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html)를 참고합니다.
