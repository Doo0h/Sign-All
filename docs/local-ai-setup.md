# 무료 로컬 AI 연결 안내

2026-11-11 사용자 요청: 유료 호출 없이 AI 사용을 원함. 실제 공급자·모델은 미확정입니다.

## 이번 구현

`AI_PROVIDER=ollama`를 명시하면 API 키 없이 로컬 Ollama의 chat-completions 형식에 연결합니다. 기본 demo는 그대로이며 외부 공급자 설정은 HTTPS와 키가 필요합니다. 로컬 모드는 정확히 `http://127.0.0.1:11434/v1/chat/completions`만 허용하고 cloud 이름을 포함한 모델을 거절합니다. Ollama 쪽에서도 로컬 전용 설정을 사용해야 합니다.

Ollama는 로컬 모델 실행과 OpenAI 호환 요청을 지원합니다. 클라우드 모델과 구분해 설치한 로컬 모델만 사용하세요. 로컬 추론에는 외부 API 호출 요금이 없지만 PC 메모리·저장 공간·전력은 사용하며, 모델별 라이선스 확인이 필요합니다.

공식 근거:
- https://docs.ollama.com/api/openai-compatibility
- https://docs.ollama.com/faq (로컬 실행과 클라우드 비활성화)
- https://ollama.com/download/windows

## 설정 순서

1. 공식 설치 안내로 Ollama를 설치하고 PC 사양과 라이선스에 맞는 로컬 모델을 선택·다운로드합니다. 이 작업에서는 설치나 대용량 모델 다운로드를 수행하지 않았습니다.
2. Ollama를 실행할 터미널에 `OLLAMA_NO_CLOUD=1`을 설정하고 로컬 전용으로 실행합니다. 이미 실행 중인 Ollama에는 재시작 후 적용됩니다. 클라우드 로그인이나 cloud 모델을 사용하지 않습니다.
3. `ollama list`로 설치된 모델 이름을 확인합니다.
4. backend/.env를 다음 예시로 설정합니다. 기존 설정은 덮어쓰기 전에 확인하세요.

```dotenv
APP_MODE=demo
AI_PROVIDER=ollama
AI_API_URL=http://127.0.0.1:11434/v1/chat/completions
AI_MODEL=여기에_실제로_설치한_로컬_모델명
AI_TIMEOUT_MS=120000
```

`APP_MODE=demo`에서는 화면이 계속 규칙 기반 응답을 사용합니다. 먼저 아래 독립 시험으로 실제 모델을 평가합니다. 이 시험은 가상 자기소개서 3개만 사용하며 최대 6회 로컬 요청을 합니다. 결과 JSON의 semanticReview는 사람이 의미를 검토하기 전까지 pending입니다.

```powershell
cd backend
node --env-file-if-exists=.env scripts/evaluate-local-ai.js --run
```

서비스 화면에서 실제 모델을 쓰려면 검증된 기업·직무·능력단위 자료를 DB에 준비한 후 `APP_MODE=live`로 전환합니다. 가상 자료를 verified로 바꿔 이 절차를 우회하지 않습니다. 실제 자기소개서 사용 전 고지·동의와 자료 처리 조건을 정합니다.

## 확인 범위

로컬 어댑터의 JSON 요청·출력 검증과 외부 HTTP/클라우드 모델 거절은 mock 테스트 대상입니다. 현재 PC에 Ollama가 확인되지 않아 실제 로컬 모델 품질·속도·메모리 사용은 미검증입니다. 로컬 모델에도 환각과 JSON 오류가 있을 수 있으므로 테스트 통과를 의미 정확성으로 해석하지 않습니다.
