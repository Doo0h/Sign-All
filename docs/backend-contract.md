# 백엔드 첫 구현 계약

Node.js 24.x + SQLite의 로컬 MVP 구현 기준안입니다. 기존 api-draft.md는 대안 비교 문서이고, 실제 구현의 계약은 이 문서를 기준으로 합니다. 팀 합의 최종 확정을 의미하지 않습니다.

## 현재 구현과 미완료

| 항목 | 상태 |
|---|---|
| HTTP 서버·SQLite 참조자료 DB·가져오기 | 구현·로컬 테스트 |
| 6개 API 경로·세션 시작/종료 | 구현·데모 전체 흐름 테스트 |
| 사용자 입력 영구 저장 | 구현하지 않음. 임시 결과는 메모리 세션 |
| AI | demo 규칙 응답 + live 호환 HTTP 어댑터. 실제 공급자 미검증 |
| 기업·NCS·수어 원본 | 미확보/추가 검증 필요. demo 자료는 가상임 |
| 화면·로그인·기록 조회 | 미구현, 이번 코드에 범위 추가 안 함 |

## 응답과 메타데이터

성공은 HTTP 200의 data와 meta(mode/isDemo/requestId), 실패는 적절한 HTTP 상태의 error(code/message/retryable/requestId, 선택 field)입니다. 사용자 원문·공급자 키·원문 오류는 로그/응답 오류에 포함하지 않습니다.

## 요청·응답

| API | 요청 | data 핵심 필드 |
|---|---|---|
| GET /api/health | 없음 | status, mode, aiMode, persistentUserData |
| POST /api/session | JSON 빈 객체 | sessionToken, expiresAt, notice |
| POST /api/session/end | JSON 빈 객체, 세션 헤더 | ended |
| GET /api/companies | q, limit(기본20/최대100), offset(기본0/최대1000000) | items, total, limit, offset |
| GET /api/jobs | 위와 같음 | items, total, limit, offset |
| POST /api/resume/analyze | resumeText(1~10000자, 공백만 불가), 세션 헤더 | analysisId, summary, keywords, competencies |
| POST /api/interview/questions | companyId, jobId, analysisId, 세션 헤더 | questions |
| GET /api/signs | keyword(1~100자) | items(최대20), matchStatus, notice |
| POST /api/interview/feedback | questionId, answerText(1~5000자), 세션 헤더 | strengths, improvements, suggestion, references |

세션 헤더는 X-Session-Token이며 로그인 대신 익명 임시 맥락의 bearer 비밀정보로 사용합니다. 분석/질문 ID는 UUID 내부 생성값이며 다른 세션에서 사용할 수 없습니다. ID 형식은 영문·숫자·밑줄·하이픈 1~100자로 제한합니다. 정의되지 않은 본문 필드와 검색 조건은 거절합니다.

선택한 연결 방식은 설계 대안 B(임시 서버 참조)입니다. 따라서 analysis나 questionText를 되돌려 보내지 않고 analysisId/questionId를 보냅니다. 서버가 직무·출처·질문을 조회합니다. 분석 중복/질문 갱신 충돌은 409로 처리합니다. 재분석 시작 시 이전 질문을 무효화합니다. 질문 재생성 때도 이전 질문이 무효화됩니다. 처리 중 변경된 질문의 피드백은 반환하지 않습니다.

기업·직무 목록의 items에는 내부형식 name/id/sourceId가 포함됩니다. 원본의 기업명/번호와 내부 필드는 다릅니다. 표제어가 같거나 키워드가 일치하면 수어 후보를 반환하되 matchStatus=candidate이며 의미 일치 검증을 선언하지 않습니다. demo에서 수어 미확보는 not_found로 표시하고, live에서 목록 자체 미준비는 503입니다. 영상이 없는 경우 프론트는 질문 텍스트로 계속 연습할 수 있도록 합니다.

## 프론트 연동 예시

가상 입력을 사용하는 JavaScript 예시입니다. 실제 호출 전에 별도 터미널에서 서버를 실행하세요.

```js
const base = 'http://127.0.0.1:3001';
let sessionToken;
async function api(path, body) {
  const response = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(body === undefined ? {} : {'Content-Type':'application/json'}),
      ...(sessionToken ? {'X-Session-Token': sessionToken} : {})
    },
    ...(body === undefined ? {} : {body: JSON.stringify(body)})
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error.message);
  // result.meta.isDemo가 true이면 화면에 데모 표시
  return result.data;
}
const session = await api('/api/session', {});
sessionToken = session.sessionToken;
try {
  const companies = await api('/api/companies');
  const jobs = await api('/api/jobs');
  const analysis = await api('/api/resume/analyze', {resumeText:'가상 테스트용 자기소개서'});
  const result = await api('/api/interview/questions', {
    companyId:companies.items[0].id, jobId:jobs.items[0].id, analysisId:analysis.analysisId
  });
  const feedback = await api('/api/interview/feedback', {
    questionId:result.questions[0].questionId, answerText:'가상 답변'
  });
} finally {
  await api('/api/session/end', {});
  sessionToken = undefined;
}
```

## 참조자료 JSON 최소 예시

다음은 팀이 만든 **가상 demo 데이터 형식**이며 공식 원본이 아닙니다. live 자료를 가져오려면 mode=live와 verificationStatus=verified, 검토한 URL·실제 확인일·이용 조건을 넣습니다. 보유하지 않은 영상이나 원본 필드는 생성하지 않습니다.

```json
{
  "sources":[{"id":"example-source","mode":"demo","name":"가상 테스트 출처","checkedAt":"2026-11-01","usage":"테스트 전용","verificationStatus":"demo"}],
  "companies":[{"id":"example-company","sourceId":"example-source","name":"가상 회사","originalNumber":null,"referenceDate":null}],
  "jobs":[{"id":"example-job","sourceId":"example-source","name":"가상 연습 직무"}],
  "units":[{"id":"example-unit","sourceId":"example-source","name":"팀 작성 연습 요소","definition":"공식 NCS가 아닌 가상 자료"}],
  "job_units":[{"jobId":"example-job","unitId":"example-unit"}],
  "signs":[]
}
```

수어 항목의 내부 필드는 id/sourceId/term/keywords 배열, 선택 meaning/sourcePageUrl/videoUrl입니다. 주소가 있다면 HTTPS여야 합니다. 키워드 연결은 후보 검색만 제공하므로 자료의 검증 상태와 질문 문맥 확인은 수어 담당자가 검토합니다. 원본 번호와 능력단위 코드는 originalNumber/originalCode 등 별도 필드로 보존할 수 있으며 내부 ID와 동일시하지 않습니다.

## 실패·제한

- 400: 잘못된 JSON·입력·ID 형식·검색 범위
- 401: 세션 토큰 없음/형식 오류
- 403: 허용하지 않은 브라우저 Origin
- 404: 없는 자료/다른 세션의 결과/없는 경로
- 409: 현재 맥락 처리 중/처리 중 맥락 변경
- 410: 세션 만료·종료·재시작 후 맥락 없음
- 413/415: 본문 크기 초과/JSON Content-Type 아님
- 429: IP별 요청 제한, Retry-After 제공
- 502/504: 외부 AI 실패·잘못된 형식/시간 초과
- 503: 자료 미준비·AI 동시 실행/예산·세션 수 제한

기본 본문 64KiB, 세션 30분·최대500개, IP당 분당30회, AI 동시2개·시간당100회, AI 요청20초입니다. 환경변수로 조정하며 단일 프로세스 한도입니다. 외부 AI 응답은 최대128KiB만 읽고 질문은1~3개, 키워드/근거 배열은 최대10개로 검증합니다. 실제 공급자 호출·품질·비용 검증은 후속 과제입니다.
