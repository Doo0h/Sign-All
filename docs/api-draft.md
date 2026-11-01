# API 명세 초안

상태: 팀 검토용 설계 제안. 아래 경로·필드는 우리 서비스의 내부 계약이며 외부 API의 원본 필드가 아닙니다. 구현·외부 연동은 아직 완료하지 않았습니다.

## 공통 규칙

- /api 아래에 경로를 둡니다. JSON 요청·응답을 제안합니다.
- 성공은 data, 실패는 error 객체로 반환합니다.
- 오류 객체: code(기계 식별용), message(사용자 안내용).
- 입력 누락·형식 오류: 400, ID 없음: 404, 요청 제한: 429, 외부 공급자 실패: 502, 제한 시간 초과: 504.
- 입력 길이·질문 수·타임아웃·호출 제한 값은 구현 전에 합의합니다.
- 외부 공급자의 원문 오류·키·사용자 원문을 응답이나 로그에 노출하지 않습니다.

## 기능별 계약

| 메서드·경로 | 요청 후보 | 응답 data 후보 |
|---|---|---|
| GET /api/companies | q(선택), limit·offset(범위 검증) | items, total |
| GET /api/jobs | q(선택), limit·offset(범위 검증) | items, total |
| POST /api/resume/analyze | resumeText | summary, keywords, competencies |
| POST /api/interview/questions | companyId, jobId, analysis | questions |
| GET /api/signs | keyword | items, matchStatus |
| POST /api/interview/feedback | questionText, answerText, jobId | strengths, improvements, suggestion, references |

companyId·jobId는 팀 내부 ID입니다. 분석 결과를 클라이언트에서 받는 경우 신뢰할 수 없는 입력으로 검증합니다. 기업·직무 근거는 서버가 ID로 조회하며 클라이언트가 전달한 기업 특성을 사실로 신뢰하지 않습니다.

## 설계용 응답 예시

다음은 가상 설계 예시이며 실제 API 호출 결과가 아닙니다.

질문 생성:

```json
{
  "data": {
    "questions": [
      {
        "id": "sample-question-001",
        "text": "문제를 해결하기 위해 다른 사람과 협력한 경험을 설명해 주세요.",
        "keywords": ["협력", "문제 해결"],
        "references": []
      }
    ]
  }
}
```

수어 항목을 확보하지 못했을 때:

```json
{
  "data": {
    "items": [],
    "matchStatus": "not_found"
  }
}
```

수어 결과에는 확보·검토한 항목만 포함합니다. term, meaning, sourcePageUrl을 내부 후보로 두고 videoUrl은 실제 응답과 이용 조건 확인 후 채택합니다. 정확히 맞는 단어 영상이 없으면 질문 텍스트를 유지하고 자료 없음 안내를 표시합니다. 키워드 영상은 질문 전체의 수어 번역이 아닙니다.

## 미결정 사항

- 자기소개서·답변·분석 결과의 저장 여부와 세션 관리
- 질문 생성과 분석 기능을 분리할지, 하나로 합칠지
- 로그인 도입 여부, CORS 허용 출처, 입력 길이·요청 제한
- 프레임워크·AI 공급자·DB 선정
- 실제 NCS 자료와 수어 응답 확보 후 최종 응답 구조

DB가 없어도 API 처리는 가능합니다. 개인정보 원문은 저장 필요성을 결정하기 전 영구 저장하지 않는 방향을 제안합니다.
