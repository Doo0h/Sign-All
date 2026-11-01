# 내부 API 명세 초안 — 3주차

상태: 팀 검토용 설계 제안. 경로와 예시 필드는 팀이 추가하는 내부 계약이며 외부 원본 필드가 아닙니다. 서버·DB·외부 연동·실제 응답 검증은 미구현입니다. 아래의 제안은 팀 합의 완료를 뜻하지 않습니다.

## 공통 계약 제안

- 요청·응답은 JSON, 경로는 /api 아래에 둡니다.
- 성공: data 객체. 실패: error 객체와 적절한 HTTP 상태 코드.
- error: code, message, retryable. field와 requestId는 필요한 경우 추가합니다.
- 목록 total은 검색 조건에 맞는 전체 건수이며 현재 페이지의 개수가 아닙니다.
- limit·offset은 정수로 검증합니다. 기본 20·최대 100은 검토용 수치이며 구현 전 확정합니다. offset은 0 이상, limit은 1 이상입니다. 안정적인 정렬 기준도 합의합니다.
- 사용자 입력, 클라이언트가 되돌려 보낸 분석 결과, 외부 AI 응답 모두 검증 대상입니다.
- 기업·직무 근거는 서버가 검증된 내부 ID로 조회합니다. 클라이언트의 기업 특성·임의 출처를 사실로 신뢰하지 않습니다.
- 실제 자료 미확보와 정상 검색 결과 없음은 구분합니다.

## API별 최소 계약 제안

| 메서드·경로 | 요청 | data 응답 | 확인 사항 |
|---|---|---|---|
| GET /api/companies | q(선택), limit, offset | items, total, limit, offset | companyId·name·확보한 표시 항목 및 자료 기준일. 없는 원본 값은 생성하지 않음 |
| GET /api/jobs | q(선택), limit, offset | items, total, limit, offset | jobId·name. 연습 직무와 능력단위의 차이를 명시 |
| POST /api/resume/analyze | resumeText | summary, keywords, competencies | competencies의 name·evidence 구조 제안. evidence는 원문에 존재하는지 검증 |
| POST /api/interview/questions | companyId, jobId, analysis 또는 analysisId | questions | 요청별 전달 방식과 임시 결과 참조 방식 중 선택 필요 |
| GET /api/signs | keyword | items, matchStatus | 반환 건수 상한 합의. 의미 일치 검증과 문자열 검색 후보 구분 |
| POST /api/interview/feedback | questionText·answerText·jobId 또는 questionId·answerText | strengths, improvements, suggestion, references | 질문 생성 때의 직무·참고 근거와 일치시키는 방식 합의 |

competencies는 객체 배열, keywords는 문자열 배열을 제안합니다. strengths·improvements는 문자열 배열, suggestion은 문자열, references는 서버가 관리하는 출처 참조 배열을 제안합니다. 필드명·자료형은 AI·프론트 담당자와 최종 합의해야 합니다.

## 분석→질문→피드백 연결 대안

| 대안 | 동작 | 장점 | 필요한 검증 |
|---|---|---|---|
| A. 요청마다 정보 전달 | analysis, questionText 등을 클라이언트가 재전달 | 서버의 임시 저장 부담이 작음 | 길이·구조 검증. 변조 가능하므로 서버가 생성한 결과로 보장하지 않음. 직무·근거는 서버 재구성 |
| B. 서버 임시 결과 참조 | analysisId, questionId로 서버 결과 조회 | 질문·직무·근거 맥락 유지 | 소유 세션 검사·만료·정리·재시작 처리 |

B는 영구 DB 저장을 뜻하지 않습니다. 메모리·임시 저장소·DB는 별도 선택입니다. 두 방식을 동시에 허용하여 우선순위가 모호해지지 않도록 구현 전 하나를 정합니다. questionId만 안다고 다른 사용자의 결과에 접근할 수 있어서는 안 됩니다.

기업과 직무의 선택은 사용자 연습 조건이며 해당 기업의 실제 채용 관계를 보장하지 않습니다. 선택값이나 자기소개서 변경 시 이전 분석·질문·피드백의 무효화 규칙을 정합니다.

## 설계용 JSON 예시

가상 형식 예시이며 실제 API 호출 결과나 확보한 원본이 아닙니다.

목록 검색 결과 없음:

```json
{"data":{"items":[],"total":0,"limit":20,"offset":0}}
```

입력 오류:

```json
{"error":{"code":"INVALID_INPUT","message":"자기소개서를 입력해 주세요.","field":"resumeText","retryable":false}}
```

질문 객체 제안:

```json
{
  "data": {
    "questions": [{
      "questionId": "example-question-001",
      "text": "다른 사람과 협력하여 문제를 해결한 경험을 설명해 주세요.",
      "keywords": ["협력", "문제 해결"],
      "referenceIds": []
    }]
  }
}
```

referenceIds가 비어 있는 예시는 근거 확보 완료나 기업·직무 맞춤 검증 완료를 뜻하지 않습니다. 임의의 URL이나 문헌을 AI가 생성하여 근거로 반환하지 않도록 합니다. evidence는 원문 인용으로 사용하며 글자 위치를 추가할지는 후속 합의합니다.

## 수어 조회 규칙 제안

- items 후보: signId, term, meaning, sourcePageUrl, verificationStatus. 원본 확보·이용 조건 확인 후 채택합니다.
- videoUrl은 실제 제공과 이용 가능 여부를 확인한 경우에만 포함합니다.
- matchStatus 후보: not_found(정상 조회이나 결과 없음), candidate(문자열 등 후보만 존재), verified(현재 키워드 의미에 대한 검토된 연결).
- keyword만으로 문맥이 부족하면 후보로 표시합니다. 단어 일치만으로 의미 일치나 verified를 선언하지 않습니다. 질문 문맥을 추가할지는 후속 합의합니다.
- 자료 자체 미준비는 not_found가 아니라 REFERENCE_DATA_UNAVAILABLE 오류로 구분합니다.
- 영상 없음·미매칭에도 질문 텍스트와 답변 기능은 이용 가능하도록 설계합니다.
- 키워드 자료는 질문 전체의 수어 번역이 아닙니다.

## 오류 계약 제안

| 상황 | HTTP | code | 처리 |
|---|---|---|---|
| 공백 입력·자료형·범위·ID 형식 오류 | 400 | INVALID_INPUT / INVALID_ID | 외부 호출 전에 거절, field 안내 |
| 조회 가능한 자료에 해당 ID 없음 | 404 | RESOURCE_NOT_FOUND | 선택 목록 재조회 |
| 정상 목록·수어 검색 결과 없음 | 200 | 해당 없음 | 빈 items, 수어는 not_found |
| 참고자료 미준비 | 503 | REFERENCE_DATA_UNAVAILABLE | 미확보 상태 안내 |
| 임시 맥락 만료 | 410 | CONTEXT_EXPIRED | 분석·질문 재생성. 방식 B 선택 시 적용 |
| 다른 세션 소유 결과 접근 | 403 또는 404 | ACCESS_DENIED 또는 RESOURCE_NOT_FOUND | 존재 여부 노출 정책을 한 가지로 합의 |
| 본문 크기 초과 | 413 | PAYLOAD_TOO_LARGE | 입력 크기 안내 |
| 사용자 호출 제한 | 429 | RATE_LIMITED | 재시도 대기 안내 |
| 외부 응답·구조 검증 실패 | 502 | UPSTREAM_INVALID_RESPONSE | 원문 오류를 노출하지 않음 |
| 외부 응답 시간 초과 | 504 | UPSTREAM_TIMEOUT | 입력 유지, 제한된 재시도 |
| 내부 오류 | 500 | INTERNAL_ERROR | 일반 안내와 추적용 requestId |

외부 공급자 예산·한도 소진과 사용자별 제한은 구분합니다. 자동 재시도는 비용·중복 호출을 고려하여 제한합니다. HTTP 200으로 오류 객체를 반환하지 않는 방향을 제안합니다.

## 구현 전 남은 결정

- 기술 스택, AI 공급자·모델, 비용 한도
- A/B 연결 방식, 영구 저장 여부, 임시 만료·초기화 정책
- 본문·입력 길이·질문 수·동시 호출·타임아웃·재시도·전체 호출 한도
- 로그인 필요 여부, 익명 세션과 소유권 검증, CORS·쿠키 정책
- 실제 직무·수어 샘플 검증 후 필드·자료형 확정

보안 고려사항은 [security-design.md](security-design.md), 데이터 관계는 [data-plan.md](data-plan.md), 결정 상태는 [decisions.md](decisions.md)를 참고합니다.
