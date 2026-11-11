# 5주차 백엔드 검토

담당 김두영 / 2026-11-11 / Windows, Node v24.22.2.

AI 처리 중 세션이 종료되거나 만료되면 완료된 결과를 반환하지 않고 410을 반환하도록 보완했다. 분석·질문·피드백 경로에 적용했다. health는 demo-rule-based/local-model/external을 구분한다.

시험은 가상 입력, 메모리 DB, mock AI를 사용하며 유료 API를 호출하지 않았다. CORS preflight와 신뢰하지 않는 Origin 거절, 대기 중 세션 종료·만료를 추가 검증했다.

## 연결 오류 조사

기본 `node --test` 실행에서 일부 HTTP listen이 Windows EFAULT로 실패했다(21개 중 17개 통과). 이후 `node --test --test-concurrency=1` 실행은 21/21 통과했다. 단독 HTTP 진단 `node scripts/diagnose-network.js`는 10/10 통과했다. 간헐적인 OS/실행 환경 오류의 근본 원인을 특정한 것으로 보고하지 않는다.

테스트 서버의 오류를 Promise rejection으로 전달하고 자원 해제를 먼저 등록했다. 제품 코드에 무한 재시도나 오류 무시를 추가하지 않았고 방화벽을 변경하지 않았다. 재현 시 Node 버전·실행 환경·진단 결과를 함께 비교한다.

## 후속 확인

- 실제 로컬 모델 설치·품질 시험과 검증된 참고 자료 확보는 별도 단계다.
- 통합 브랜치의 최종 결과는 `docs/week-05-integration.md`에 기록한다.
- 사용자 입력은 기존처럼 세션 메모리만 사용하고 DB에 저장하지 않는다.
