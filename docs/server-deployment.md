# Docker 실행과 팀 서버 배포

2026-11-11. 현재 서버 계정·주소가 없으므로 원격 배포는 아직 하지 않았다. 아래 구성은 같은 코드를 서버에 올릴 수 있게 준비한 실행 경로다. 팀 공용 실행 서버와 팀원의 코드 편집 환경은 별개이며, 수정은 본인 PC의 Git 브랜치에서 하고 서버에는 검증한 커밋을 배포한다.

## 권장 서버

**이 프로젝트에는 RAM 2GB 이상 Linux VM + Docker Compose를 우선 권장한다.** 문서 추출 프로세스와 프론트·백엔드 컨테이너를 함께 실행하기 위한 시작 사양이며 실제 동시 사용자 수에 따라 조정한다. AI는 외부 Groq 무료 API를 사용하면 서버에서 모델을 직접 실행할 필요가 없다.

| 후보 | 판단 | 공식 근거 |
|---|---|---|
| Oracle Cloud Always Free VM | 무료 우선 후보. 계정 생성·리전별 자원 확보가 가능할 때 Compose 설치. 무료 대상과 할당량 확인 필요 | https://www.oracle.com/cloud/free/ |
| 저가 Linux VPS (예: Hetzner) | Compose·볼륨·SSH 사용이 쉬운 유료 대안. 2GB 이상 선택, 리전·IP·세금 포함 견적 확인 후 구매 | https://www.hetzner.com/cloud/ |
| Koyeb Free | 512MB, 1개 무료 인스턴스, 영구 볼륨 불가, 유휴 절전. 현재 2컨테이너·문서 추출 구성의 직접 대체로는 비추천 | https://www.koyeb.com/docs/reference/instances |
| Render Free | 가벼운 시연 후보. 무료 웹서비스의 절전·일시 저장소 제약 때문에 지속적인 팀 서버로는 별도 설계 필요 | https://render.com/docs/free |

무료 서버를 무조건 확보할 수 있거나 지속 운영이 보장된다고 판단하지 않는다. 서버 결제·가입·약관 동의는 아직 수행하지 않았다.

## 로컬 Docker

저장소 루트에서 Docker Desktop의 Linux 엔진을 실행한다.

```powershell
Copy-Item deploy.env.example .env
docker compose up -d --build --wait
docker compose ps
```

http://localhost:8080 에 접속한다. 최초에는 **실제 기업·사전 참고 자료 + 규칙 기반 AI 시연**이다. backend 포트는 호스트에 공개하지 않는다. 프론트가 같은 출처 `/api`를 프록시하므로 다른 PC에서 localhost API로 잘못 연결되는 문제가 없다.

`.env`에 Groq 키를 직접 설정하고 `APP_MODE=live`로 바꾼 뒤 `docker compose up -d`를 실행하면 실제 모델을 사용한다. 키를 넣기 전 계정 Free Plan과 데이터 설정을 확인한다. [무료 AI 안내](free-external-ai.md) 참조. 유료 모델로 자동 대체하지 않는다.

`reference-db` 볼륨은 참고 자료 DB 전용이다. 지원서 원본 파일은 저장하지 않고 추출 프로세스 메모리만 사용한다. 입력·결과는 서버 재시작 시 사라지는 세션 메모리이므로 재시작 전에 팀에 알린다. 여러 backend 복제본은 현재 지원하지 않는다.

## 브랜치를 분리해 서버에 올리는 방법

브랜치는 코드 작업 이력이고, 컨테이너는 실행 서비스다. ai와 sign-data를 별도 HTTP 서버로 만들 필요는 없다. AI 코드는 backend에 병합되고 sign-data의 JSON은 읽기 전용으로 전달된다.

서버에서는 검증한 main 하나로 실행하는 방식이 가장 단순하다. 역할별 체크아웃을 유지하려면 다음처럼 구성할 수 있다.

```sh
git clone --branch backend https://github.com/Doo0h/Sign-All.git Sign-All-backend
git clone --branch frontend https://github.com/Doo0h/Sign-All.git Sign-All-frontend
git clone --branch sign-data https://github.com/Doo0h/Sign-All.git Sign-All-sign-data
cd Sign-All-backend
cp deploy.env.example .env
```

`.env`의 BACKEND_CONTEXT는 `.`, FRONTEND_CONTEXT는 `../Sign-All-frontend`, REFERENCE_DATA_FILE은 `../Sign-All-sign-data/data/reference-starter.json`으로 설정한다. backend에 사용할 AI 변경 커밋이 병합돼 있어야 한다. 각 체크아웃의 `git rev-parse HEAD`를 배포 기록에 함께 남긴다.

## HTTPS와 팀 접속

1. VM에 Docker Engine + Compose를 설치하고 저장소를 받는다. 공식 설치 문서: https://docs.docker.com/engine/install/ubuntu/
2. 도메인의 DNS를 VM으로 연결한다. 서버 방화벽은 SSH 관리 경로와 웹 80/443만 필요한 범위로 연다. backend 3001은 공개하지 않는다.
3. `docker run --rm -it caddy:2-alpine caddy hash-password`로 팀 접속 암호의 해시를 대화형 생성한다. 평문을 명령 인자·Git에 남기지 않는다.
4. `.env`에 SITE_DOMAIN, TEAM_USER, TEAM_PASSWORD_HASH를 설정한다. 해시는 작은따옴표로 감싼다. PUBLIC_ORIGIN은 실제 `https://도메인`으로 설정하고 BIND_ADDRESS는 127.0.0.1로 유지한다.
5. `docker compose -f compose.yaml -f compose.https.yaml up -d --build --wait`를 실행한다. Caddy가 인증서와 팀 공용 로그인 보호를 제공한다. 도메인이 없으면 HTTPS 구성을 실행하지 않는다.

기본 인증은 팀 시연용 공용 접근 제한이며 개인 사용자 계정·지원서 접수 시스템이 아니다. 현재 실제 채용 접수 기능은 만들지 않았다.

## 갱신·복구

변경 전 커밋을 기록하고, 검증된 main을 pull한 뒤 같은 Compose 명령으로 재빌드한다. 문제 발생 시 이전 커밋의 별도 체크아웃을 만들어 다시 빌드한다. `docker compose down`은 컨테이너만 내리며 볼륨 삭제 옵션 `-v`는 사용하지 않는다.

`.env`, 서버 키, 실제 지원서, 로컬 DB는 Git·이미지에 넣지 않는다. 문서 추출은 5MB/15초/동시 2개 제한, Linux 자식 프로세스 메모리 제한을 사용한다. 스캔 PDF OCR과 HWP 구버전·암호·배포용 문서는 미지원이며 텍스트 입력으로 이어갈 수 있다.

자동 검증은 `.github/workflows/verify.yml`에서 Node/Python 시험과 Compose smoke를 수행한다. 실제 모델 키는 CI에 넣지 않으며 demo만 검증한다.
