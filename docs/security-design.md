# 보안 및 사용자 입력 처리 — 3주차 설계 제안

서버·외부 호출·보안 검증은 아직 구현하지 않았습니다. 기술 스택과 저장 방식은 미정입니다. 아래는 구현 전 합의할 기준이며 적용 완료 체크리스트가 아닙니다.

## 입력과 외부 호출

| 항목 | 제안 | 결정 기준 |
|---|---|---|
| 입력 검증 | 필수값·자료형·공백·허용 필드·길이를 서버에서 검증 | 한국어·줄바꿈 등 자유 입력 보존 |
| 본문·결과 상한 | 본문 크기, 질문 수, 출력 길이 제한 | 모델 한도·비용·화면 요구 |
| 목록 | limit·offset·검색어 상한과 정렬 규칙 | 실제 자료와 응답 시간 |
| 호출량 | 익명 세션/IP별 제한과 전체 예산 상한 | 같은 학교망의 IP 공유, 우회 가능성 고려 |
| 동시 실행 | 서버 동시 호출 상한·타임아웃 | 중복 비용·서버 자원 |
| 재시도 | 제한 횟수, 무한 재시도 금지 | 실패 유형·중복 호출 |
| AI 응답 | JSON·자료형·길이·출처 ID·근거 문장 검증 | 외부 출력도 신뢰하지 않음 |
| 입력 내 지시문 | 자기소개서를 분석 데이터로 취급, 시스템 지시와 분리 | 프롬프트만으로 완전한 방어라고 가정하지 않음 |
| 화면 출력 | 텍스트로 안전하게 표시, 임의 HTML 실행 방지 | 프론트 렌더링 방식 |
| 외부 주소 | 검토한 수어 제공처만 사용 | 클라이언트의 임의 URL을 서버가 조회하지 않음 |

숫자 상한은 모델·자료·실행 환경 선택 후 확정합니다. 프론트 버튼 비활성화는 서버 제한을 대체하지 않습니다.

## 키와 로그

- 외부 API 키는 서버 환경변수로 관리하며 프론트 번들·응답·저장소에 포함하지 않습니다.
- .env.example을 추가한다면 변수명·자리표시자만 기록합니다.
- 사용자 원문, 인증정보, 키가 들어간 외부 요청 URL, 외부 원문 오류를 로그에 남기지 않는 방향입니다.
- 운영 로그는 requestId, 오류 코드, 소요 시간 등 최소 정보를 검토합니다. 입력 길이 등 추가 기록도 필요성을 판단합니다.
- 키가 노출되면 삭제만으로 해결하지 않고 폐기·재발급합니다.
- HTTPS, 허용 출처 CORS, 민감 응답의 공유 캐시 방지 등을 배포 전에 적용·검증합니다.

## 로그인 미확정 상태의 대안

| 대안 | 필요한 보호 |
|---|---|
| 요청별 처리, 서버 결과 미보관 | 응답·캐시·로그·동시 요청에서 데이터 혼선 방지 |
| 익명 세션과 임시 결과 | 서버 발급 세션, 결과 소유 관계 검사, 만료·정리·재시작 안내 |

무작위 ID만으로 접근이 보호되지는 않습니다. 다른 세션의 analysisId·questionId 접근을 거절해야 합니다. 클라이언트가 보낸 sessionId나 userId를 소유권 증거로 신뢰하지 않습니다. 세션 쿠키를 사용한다면 HttpOnly·Secure·SameSite와 상태 변경 요청의 CSRF 대응을 구성에 맞게 검토합니다. CORS는 인증·권한 검증을 대신하지 않습니다.

## 개인정보 처리 결정표

- [ ] 외부 AI에 전송할 최소 범위와 사용자 안내 합의
- [ ] 사용자 입력 영구 저장 여부 합의
- [ ] 임시 저장이 있다면 만료·삭제·새 연습 초기화 규칙 합의
- [ ] 선택·자기소개서 변경 시 기존 분석·질문·피드백 무효화 규칙 합의
- [ ] 세션 간 접근 거절과 키·원문 비노출 확인
- [ ] 가상 입력으로 실패·시간 초과·중복 제출 검증

## 참고 공식 자료

- [OWASP REST Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html)
- [OWASP Input Validation Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html)
- [OWASP API1: Broken Object Level Authorization](https://api-security.owasp.org/editions/2023/en/0xa1-broken-object-level-authorization/)
- [OWASP API4: Unrestricted Resource Consumption](https://api-security.owasp.org/editions/2023/en/0xa4-unrestricted-resource-consumption/)
