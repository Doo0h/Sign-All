# Sign-All 5주차 통합 결과

2026-11-11. 담당별 브랜치에 구현·조사 결과를 커밋하고 main 대상 PR로 병합한다. 이 기록은 실제 수행 범위이며 실제 모델·수어 검증 완료 보고가 아니다.

| 담당 | 브랜치 | 반영 내용 | 남은 작업 |
|---|---|---|---|
| 김두영 | backend | 세션 종료·만료 후 지연 AI 응답 차단, CORS 시험, 로컬 통신 진단, 통합 검증 | 간헐 Windows EFAULT 원인 규명, 검증된 실제 기업·직무·능력단위 자료 확보 |
| 황건수 | ai | 기능별 프롬프트 통합, 근거·출처 검증, Ollama 로컬 어댑터, 가상 입력 3개 평가 스크립트 | 실제 로컬 모델 선택·설치 후 품질·속도 측정 |
| 강지모 | frontend | UI 디자인, 단계별 화면 연결, 모드 안내, 중복 요청·만료·종료 실패 처리, DOM 시험 | 실제 브라우저 시각·모바일·키보드 검수 |
| 모소연 | sign-data | 모의 질문 키워드 5개 공식 검색, 상세 3개 확인, 의미 불일치 배제, 내부 sourceId 정정 | 실제 모델 질문 재조사, 영상 재생·전문가 의미 검토·개별 사용 조건 |

## 검증 결과

Windows / Node v24.22.2. 테스트는 개인정보 없는 가상 입력·demo 또는 mock을 사용했다.

- backend: `node --test --test-concurrency=1` **25/25 통과**.
- frontend: `npm ci --ignore-scripts` 후 Node 24 `node --test` **4/4 통과**. jsdom에서 실제 임시 demo HTTP 서버와 연결했다.
- `backend/scripts/smoke.js`: 임시 메모리 DB 서버에 연결하여 세션 생성 → 목록 → 분석 → 질문 1개 → 빈 수어 → 피드백 → 종료 통과.
- `backend/scripts/diagnose-network.js`: 단독 HTTP listen/fetch/close 10/10 통과.
- 기본 병렬 backend 시험에서는 일부 listen EFAULT 발생 이력이 있다. 순차 실행의 통과를 근본 해결로 단정하지 않는다. [백엔드 기록](backend-review.md) 참조.
- 브라우저 제어 호스트를 사용할 수 없어 화면 캡처 및 시각 검수는 미수행이다.

## 무료 AI 적용 상태

사용자 요청에 따라 외부 유료 호출 없이 로컬 Ollama 연결 옵션을 구현했다. 현재 PC에서 Ollama를 확인하지 못했으며 모델 설치·다운로드·실제 추론은 수행하지 않았다. **현재 demo 화면은 실제 AI가 아닌 규칙 응답이다.** [설정 및 독립 평가 순서](local-ai-setup.md)를 따른다. 모델 라이선스·PC 자원은 선택 시 확인한다.

live 화면은 검증된 참고 자료가 없으면 질문 생성을 차단한다. 가상 자료를 검증 완료로 바꿔 우회하지 않았다. 수어 검색 결과도 문맥·이용 조건이 검증되지 않아 DB에 넣지 않았다.

## 팀원 작업 시작

자신의 수정이 있다면 먼저 커밋하거나 보관한 뒤 실행한다. 브랜치 이름은 backend, ai, frontend, sign-data다.

```powershell
git fetch origin
git switch <본인브랜치>
git merge origin/<본인브랜치>
git merge origin/main
```

main의 통합본만 받을 때는 깨끗한 작업 트리에서 `git switch main` 후 `git pull --ff-only origin main`을 사용한다. 충돌이 있으면 내용을 검토하며 강제 reset/push하지 않는다.

담당별 질문·후속 항목은 `week-05-*-tasks.md`, [프론트 결과](week-05-frontend-results.md), [수어 조사 결과](week-05-sign-research.md)에 있다. 기존 계획 문서는 완료 여부를 과장하지 않도록 계획 이력으로 유지한다.
