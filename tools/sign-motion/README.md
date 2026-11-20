# 수어 동작 준비 도구

첫 목표 문장: **자기소개를 해 주세요.**

이후 실제 공개 자료로 **‘운영’ 단어의 팔·손 동작 변환 시험**을 수행했습니다. [실제 자료·출처·실행 결과](REAL-DATA-TRIAL.md)를 참고하세요. 첫 목표 문장 전체의 아바타나 생성 모델 학습은 아직 완료되지 않았습니다.

현재 구현은 `영상 → 추정 좌표·표정 추출 → 로컬 검토`와 `별도로 제작·검토한 GLB → 사이트 등록`입니다.
**좌표 → MakeHuman 팔·손 골격 변환은 실험 도구로 추가했습니다. 한국어→한국수어 번역 모델, 생성 모델 학습은 아직 구현하지 않았습니다.**
CC BY 실제 단어 영상으로 추출·변환·재생을 시험했으며, 한국수어의 언어적 정확도는 아직 검수하지 않았습니다.

## 1. 준비 (저장소 루트에서 PowerShell)

```powershell
python -m venv tools/sign-motion/.venv
tools/sign-motion/.venv/Scripts/python.exe -m pip install -r tools/sign-motion/requirements.txt
tools/sign-motion/.venv/Scripts/python.exe tools/sign-motion/pipeline.py models --directory data/private/sign-motion/models
```

Python 3.11을 사용합니다. 마지막 명령만 Google 공식 모델 파일을 다운로드합니다.
모델 URL·SHA-256을 기록합니다. 추출 시 영상은 외부 API로 전송되지 않습니다. 유료 API 키가 필요하지 않습니다.
원본 영상·동의 기록·추출 결과·모델은 Git에서 제외된 `data/private/sign-motion/`에 보관하세요.
가상환경과 개인 자료는 애플리케이션 Docker 빌드에 포함하지 않습니다.

## 2. 원본 영상과 기록

`data/private/sign-motion/question-001/`에 다음 파일을 준비합니다.

- `intro.mp4`: 해당 질문 한 문장만 담은 영상. 한 명, 양손·얼굴·상체가 프레임 안에 보이도록 촬영.
- `permission.txt`: 동작 추출·변형, 학습, 결과 공개에 허용된 범위를 실제 자료에 맞게 기록. 근거 문서 파일을 대신 사용해도 됩니다.
- `manifest.json`: `question-001.example.json`을 복사하여 출처와 가명 수어자 ID, 영상 좌우 반전 여부를 입력.

허락된 항목만 `rights`에 true를 기록합니다. 동작 추출에는 `motionExtraction`, 공개 등록에는 `derivativeDistribution`도 필요합니다. `training`은 향후 학습 데이터 선정용이며 이 도구는 학습을 실행하지 않습니다.
`video`와 `evidenceFile`의 상대 경로 기준은 manifest 파일의 폴더입니다.

## 3. 추출

```powershell
tools/sign-motion/.venv/Scripts/python.exe tools/sign-motion/pipeline.py extract --manifest data/private/sign-motion/question-001/manifest.json --models data/private/sign-motion/models --output data/private/sign-motion/question-001/take-01
```

기본 최대 120초, 최대 허용 설정 600초입니다. 기존 출력 폴더는 덮어쓰지 않습니다.
일정 프레임 속도(CFR) 영상을 사용하세요. 현재 타임스탬프는 프레임 번호/FPS로 계산하므로 VFR 영상은 먼저 CFR로 변환해야 합니다.

| 출력 | 내용 |
|---|---|
| motion.json | 몸·양손·얼굴 좌표, 얼굴 표정 계수·변환 행렬, 프레임 시간, 원본/모델 해시 |
| quality.json | 몸·얼굴·양손 검출 비율과 검토 주의점 |
| manifest.json | 원본 기록 사본. 상대 경로는 원래 manifest 위치를 기준으로 함 |

손·몸 world 좌표는 서로 다른 기준점을 사용하므로 바로 합치지 않습니다. 검출 실패는 빈 배열로 보존합니다. 검출 비율이 높다고 올바른 수어라는 뜻은 아닙니다.

## 4. 로컬 검토 화면

`tools/sign-motion/review.html`을 브라우저로 열고 `motion.json`과 선택적으로 원본 영상을 고릅니다.
재생·일시정지·0.5배속·프레임 이동으로 손과 얼굴 검출 누락을 확인합니다.
이 화면은 파일 선택 후 로컬에서 읽으며 업로드하지 않습니다. 점·선으로 표시하는 **2D 좌표 검토 화면**이며 3D 아바타가 아닙니다.

## 5. 아바타 제작 단계 — 별도 작업 필요

### Blender 좌표 가져오기

`blender_import.py`는 추출한 좌표를 **별도 Blender 장면**으로 가져와 키프레임으로 만듭니다.
기존 장면을 삭제하지 않으며 기존 출력 파일을 덮어쓰지 않습니다. Blender 4.3 API를 대상으로 합니다.

```powershell
& 'C:/Program Files/Blender Foundation/Blender 4.3/blender.exe' --background --python tools/sign-motion/blender_import.py -- --motion data/private/sign-motion/question-001/take-01/motion.json --output data/private/sign-motion/question-001/take-01/review.blend
```

Blender 실행 파일 경로는 실제 설치 위치로 바꾸세요. Blender Python 모듈을 사용하는 별도 환경에서도 실행할 수 있습니다.

```powershell
python -m venv D:/SignAll/blender-tools/.venv
D:/SignAll/blender-tools/.venv/Scripts/python.exe -m pip install -r tools/sign-motion/requirements-blender.txt
D:/SignAll/blender-tools/.venv/Scripts/python.exe tools/sign-motion/blender_import.py --motion data/private/sign-motion/question-001/take-01/motion.json --output data/private/sign-motion/question-001/take-01/review.blend
```

- 몸과 왼손·오른손을 **서로 독립된 패널**로 배치합니다. 손은 검토를 위해 4배 확대합니다. 이것은 몸에 손을 붙인 아바타가 아닙니다.
- 점과 연결선으로 관절을 표시합니다. 누락 프레임이나 좌우 분류가 중복된 손은 숨깁니다. 좌우 신뢰도 0.5 미만도 표시하지 않습니다.
- 입력 시간에 맞춰 키프레임을 만들고 보간을 하지 않습니다. 추정하지 못한 중간 동작을 임의로 만들지 않습니다.
- `Face_coefficients_NOT_APPLIED_TO_AVATAR` 오브젝트의 사용자 속성에 표정 계수와 검출 여부를 기록합니다. 캐릭터 표정에는 아직 적용하지 않습니다.
- 최대 4,000프레임·150 MiB 파일을 받습니다. 큰 영상은 먼저 짧게 나누세요.
- 생성된 `.blend`는 보정 작업의 시작점이며 웹사이트 등록 파일이나 검증된 한국수어가 아닙니다.

실제 Blender 호출 테스트는 별도 모듈 설치 후 실행합니다.

```powershell
$env:SIGN_MOTION_BLENDER_TEST = '1'
D:/SignAll/blender-tools/.venv/Scripts/python.exe -m unittest discover -s tools/sign-motion -p test_blender_import.py
```

### 사람형 캐릭터에 적용 (팔·손 실험 도구 추가, 얼굴·전체 표현 미완료)

`retarget_makehuman.py`는 확인한 163관절 MakeHuman 기반 모델에 팔·손 방향을 맞추는 초안입니다. 실행과 제한은 [실제 자료 시험 기록](REAL-DATA-TRIAL.md)에 있습니다. 아래 보정·검수 단계는 여전히 필요합니다.

사용 허락된 손가락 골격·얼굴 표정이 있는 캐릭터가 필요합니다. Blender 등에서 다음을 수행합니다.

1. 몸 좌표 기준으로 어깨·팔·손목의 회전을 계산하고 캐릭터 뼈대에 맞춥니다.
2. 손목을 기준으로 손가락 관절의 방향·길이·손바닥 회전을 맞춥니다. 손 world 좌표를 몸 좌표에 그대로 붙이지 않습니다.
3. 얼굴 표정 계수를 캐릭터의 shape key에 대응시키고 시선과 상체 움직임을 보정합니다.
4. 가려진 손·관절 뒤집힘·튀는 프레임을 원본 영상과 비교해 수작업 보정합니다.
5. 정면 +Z, 내장 텍스처·버퍼, 이름 있는 애니메이션 클립 `question-001`로 30 MiB 이하 GLB를 내보냅니다.
6. 한국수어 사용자/전문가가 실제 아바타 재생을 보며 문장 의미·손·표정·연결 동작을 검토합니다.

원본이 없거나 검수가 끝나지 않은 파일을 실제 수어로 등록하지 않습니다.

## 6. 검토 완료 파일 등록

`review.example.json`을 개인 자료 폴더의 `review.json`으로 복사합니다. 실제 검토 완료 후에만 status, 검토자, 날짜(YYYY-MM-DD), checks를 기록합니다.
`assetSha256`은 최종 GLB의 `Get-FileHash -Algorithm SHA256` 결과를 소문자로 넣습니다. 파일을 수정하면 재검토해야 합니다.

```powershell
tools/sign-motion/.venv/Scripts/python.exe tools/sign-motion/register.py --manifest data/private/sign-motion/question-001/manifest.json --review data/private/sign-motion/question-001/review.json --glb data/private/sign-motion/question-001/question-001.glb
```

기본은 검증만 수행합니다. 성공한 내용을 확인한 후 같은 명령에 `--apply`를 붙이면 해시 파일명의 GLB를 `frontend/avatars/`에 복사하고 `backend/src/avatar-catalog.json`에 추가합니다.
등록 도구는 권한·검토 기록, 최종 파일 해시, 기본 GLB 형식과 클립 이름을 검사하며, 기록의 진실성·언어적 정확성이나 모든 glTF 구조의 유효성을 대신 검증하지 않습니다.
이후 `docker compose up -d --build`로 적용합니다. 실제 생성된 질문이 검토한 문장과 정확히 같을 때만 재생됩니다. 이 도구는 AI 질문을 해당 고정 문장으로 강제하지 않습니다.

## 7. 향후 학습 데이터로 확대

먼저 한 질문의 아바타 의미 전달을 검증한 뒤 같은 절차로 자료를 쌓습니다. 학습 허용된 자료만 포함하고 수어자 ID 기준으로 학습/검증/평가를 나눠 같은 사람의 거의 동일한 영상이 양쪽에 섞이지 않게 합니다.
한국어 문장, 검토된 한국수어 표현/구간 주석, 보정된 동작을 연결한 데이터가 필요합니다. 이 단계에서 모델 종류·GPU·데이터량을 결정합니다.

## 검증 명령

```powershell
python -m unittest discover -s tools/sign-motion -p "test_*.py"
```

실제 MediaPipe 호출을 포함한 빈 영상 시험(실제 수어 평가가 아님):

```powershell
$env:SIGN_MOTION_MODELS = (Resolve-Path data/private/sign-motion/models).Path
tools/sign-motion/.venv/Scripts/python.exe -m unittest discover -s tools/sign-motion -p "test_*.py"
```

모델 경로를 지정하지 않은 CI에서는 영상 시험을 건너뛰고 권한·검토·파일 형식 검사를 실행합니다.

## 참고

- https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/python
- https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/python
- https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/python
- 한국수어사전 영상별 이용 조건: https://sldict.korean.go.kr/front/main/copyRightPolicy.do
