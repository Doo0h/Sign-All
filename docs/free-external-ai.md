# 무료 외부 AI 선택

확인일 2026-11-11. 1차 추천은 **Groq Free Plan + openai/gpt-oss-20b**다. 이유는 기존 chat-completions 어댑터 호환과 무료 한도 제공이다. 한국어 면접 품질이 검증됐다는 뜻은 아니며 가상 입력으로 평가해야 한다.

| 후보 | 용도 | 확인할 조건 |
|---|---|---|
| Groq 무료 플랜 | 팀 개발·소규모 시연의 1차 후보 | 계정별 무료 한도, 모델 지원, 데이터 제어 설정 |
| Gemini 무료 플랜 | 한국어 출력 품질 비교 후보 | 무료 지원 모델만 선택. 무료 콘텐츠의 제품 개선 이용 조건 확인 |
| Ollama 로컬 | 외부 전송 없이 개발 | 서버 CPU·RAM·모델 저장 공간 필요. API 사용료와 서버 비용은 별개 |

[Groq 한도](https://console.groq.com/docs/rate-limits)에서 이 모델은 무료 표에 30 RPM, 1,000 RPD, 8,000 TPM, 200,000 TPD로 안내된다. 실제 계정 Limits 화면을 우선한다. 자기소개서가 길면 토큰 한도에 먼저 도달할 수 있다. [지원 모델](https://console.groq.com/docs/models), [API 호환 안내](https://console.groq.com/docs/openai) 참조.

[Groq 데이터 정책](https://console.groq.com/docs/your-data)은 일반 추론 입력·출력의 기본 비보관과 오류 조사·악용 방지 등 예외를 구분한다. 무조건 미보관으로 안내하지 않는다. [Gemini 가격·무료 조건](https://ai.google.dev/gemini-api/docs/pricing)은 무료 콘텐츠의 제품 개선 이용을 명시한다. 실제 개인정보는 제외하고 사용자에게 외부 전송을 안내한다.

## 설정

Groq 콘솔에서 본인 계정으로 키를 발급해 배포 환경의 비밀값에 설정한다. 키를 Git, 프론트 코드, 채팅에 넣지 않는다. 무료 계정을 사용하고 유료 전환·결제 등록을 자동화하지 않는다.

```dotenv
APP_MODE=live
AI_PROVIDER=groq
AI_MODEL=openai/gpt-oss-20b
AI_API_KEY=본인이_설정할_비밀값
MAX_AI_CONCURRENT=1
MAX_AI_CALLS_PER_HOUR=30
AI_TIMEOUT_MS=60000
```

기본 demo는 키 없이 동작한다. provider가 429를 반환하면 화면에 한도 안내를 반환하며 자동 재시도·유료 모델 대체는 없다. 앱의 호출 제한은 공급자 과금을 강제로 막는 장치가 아니므로 계정 자체를 Free Plan으로 유지한다.

이번 작업은 mock으로 요청 형식·한도 오류를 검증한다. 실제 계정 키가 없어 외부 추론은 수행하지 않았다. 모델 변경·무료 정책 변경 시 이 문서를 갱신한다.
