# 실제 공개 수어 자료 → 캐릭터 시험 기록

확인일: 2026-11-20. 결과는 **미검수 동작 초안**입니다. 새 생성 모델을 학습하지 않았습니다.

## 자료 선택

| 자료 | 선택 및 이용 조건 |
|---|---|
| 한국수어사전 | 용어·사전 원문 확인용으로 유지. 확인한 항목(경험 6927, 5447, 보안 15506)의 변경금지 표시와 사이트의 영상별 정책 때문에, 이번 동작 추출·아바타 변환의 원천 영상으로 사용하지 않음 |
| 실제 수어 영상 | 한국저작권위원회 **일상생활_수어_사회생활_운영**, 공유마당 13307750. 개별 페이지에 AI 학습용 원천데이터 및 **CC BY 4.0** 표시를 확인. 출처·라이선스와 변경사항 표시를 유지 |
| 캐릭터 | Innerscene의 **Male base mesh – Rigged A-pose**, MakeHuman CC0 자산 기반, **CC0**. 실제 GLB에서 163개 관절과 손가락·얼굴 골격을 확인. 무료·수정 가능한 골격 포함 모델이므로 기술 시험 대상으로 선택. 의상·헤어가 없는 마네킹이며 최종 서비스 디자인은 아님 |
| AI-Hub 수어 영상 | 영상·키포인트·문장 자료를 제공하는 후속 후보. 다운로드 신청·승인과 해당 이용 조건 확인이 필요하여 이번 실행에는 사용하지 않음 |

출처:

- 한국수어사전 정책: https://sldict.korean.go.kr/front/main/copyRightPolicy.do
- 실제 영상/조건: https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?menuNo=200026&wrtSn=13307750
- 영상 다운로드: https://gongu.copyright.or.kr/gongu/wrt/cmmn/wrtFileDownload.do?wrtSn=13307750&fileSn=1
- 영상 라이선스: https://creativecommons.org/licenses/by/4.0/deed.ko
- 캐릭터/조건: https://www.innerscene.com/tools/library/3d-parts/male-base-mesh-3d-person-rigged-a-pose-380e6d89
- 캐릭터 다운로드: https://www.innerscene.com/api/library/male-base-mesh-3d-person-rigged-a-pose-380e6d89/download
- MakeHuman 자산: https://static.makehumancommunity.org/assets/assetpacks.html
- AI-Hub: https://aihub.or.kr/aihubdata/data/view.do?aihubDataSe=data&currMenu=&dataSetSn=103&topMenu=

## 실제 결과

- 원천 영상: 약 2.5초, 30fps MKV. 다운로드 응답의 gzip 압축을 해제한 파일 사용.
- MediaPipe 처리: 디코딩된 74프레임. 몸·얼굴 검출 비율 각각 100%, 양손 동시 검출 60.81%. 검출 비율은 수어 정확도가 아님.
- 변환 구간: 0부터 세는 프레임 **11–55**, 원본 시간 **0.367–1.833초**. 시작·끝의 손 검출 누락 구간을 제외한 45프레임.
- 팔·손 48개 뼈대의 회전값을 캐릭터 골격 길이에 맞춰 적용. 몸·손 좌표의 서로 다른 원점을 직접 합치지 않음.
- 손 좌우는 영상의 몸 손목 위치와 손 검출 위치를 비교해 연결. 누락·모호한 대응은 거부.
- `draft-operation.glb`, `draft-operation.blend`, 3개 프레임 이미지, `retarget-report.json` 생성.
- Edge에서 실제 GLB 재생·완료·다시 보기·일시정지와 참고 영상 재생 확인.
- 원본 참고용 영상은 WebM 960×540으로 재인코딩. 동작 추출에는 원천 MKV를 사용.

이것은 **단어 ‘운영’ 일부 구간의 동작 변환**입니다. ‘자기소개를 해 주세요.’ 또는 생성된 면접 질문의 번역이 아닙니다. 얼굴·시선·몸통은 정지 상태이며, 손가락 회전·손 접촉·충돌은 보정과 한국수어 사용자 검수가 필요합니다. 자동 생성 모델 학습, 새 문장 생성, 한국수어 정확도 평가는 하지 않았습니다. `avatar-catalog.json`에 검토 완료로 등록하지 않았습니다.

## 파일 위치 (이번 로컬 실행)

저장소 루트 `D:/SignAll/Sign-All` 기준:

- 원본 및 조건 기록: `data/private/sign-motion/sources/`
- 추출 좌표: `data/private/sign-motion/operation-take-01/motion.json`
- 최종 시험 결과: `data/private/sign-motion/operation-avatar-03/`
- 별도 Blender Python 환경: `D:/SignAll/blender-tools/.venv/`

원본·추출 결과·캐릭터 바이너리는 Git과 서비스 Docker 이미지에 포함하지 않습니다. 코드·출처·재현 방법만 공유합니다.

SHA-256:

```text
operation-video.mkv 92e79ecc08dab0ec5fcd8d57b015dcf9c81aca16f8b5d731c3c028f069ae47b6
base-male.glb       86c7cdfa989924b45e2e5110c131a4a4e6251ceb4e71246be68e468f3a32ca86
```

## 재실행

원본과 이용 조건을 확보하고 `README.md`에 따라 추출·Blender 환경을 설치한 후 실행합니다. 출력 폴더는 새 이름이어야 합니다.

```powershell
D:/SignAll/blender-tools/.venv/Scripts/python.exe tools/sign-motion/retarget_makehuman.py --motion data/private/sign-motion/operation-take-01/motion.json --model data/private/sign-motion/sources/base-male.glb --output data/private/sign-motion/operation-avatar-new --start 11 --end 55 --render
```

검토 화면은 다음 명령으로 시작합니다. frontend 디렉터리에서 `npm ci --ignore-scripts`, `npm run build`로 플레이어 번들을 먼저 생성합니다.

```powershell
python tools/sign-motion/avatar_review.py --folder data/private/sign-motion/operation-avatar-03 --video data/private/sign-motion/sources/operation-preview.webm
```

http://127.0.0.1:8091/ 에서 확인합니다. 이 서버는 루프백으로만 열리며 지정한 파일만 제공합니다. 면접 서비스의 공개 기능과는 별도입니다.

## 다음에 필요한 작업

1. 동일 조건으로 허용된 자료를 더 확보하고 단어·문장·수어자·출처를 구분해 데이터셋 구성.
2. 원본과 캐릭터를 비교하여 팔의 비틀림, 손가락 방향, 접촉을 교정.
3. 얼굴 표정·시선·몸통 대응과 의상 변형을 보정.
4. 한국수어 사용자/전문가가 최종 동작과 의미를 검토한 뒤 등록.
5. 문장 단위 자료와 검수 결과가 쌓인 뒤 생성 모델의 학습·검증 분할 및 평가 설계.

## 여성 진행자 스타일과 상반신 화면

사용자가 제공한 참고 이미지의 검은 단발, 검은 재킷, 흰 셔츠 구성을 참고해 별도의 3D 메시를 만들었습니다. 이미지 속 원본 캐릭터를 추출하거나 동일하게 복제한 모델은 아닙니다.

기본 모델: [Innerscene / MakeHuman 여성 모델 · CC0](https://www.innerscene.com/tools/library/3d-parts/female-base-mesh-3d-person-rigged-a-pose-dba97ed5). `style_presenter.py`가 의상·머리·눈·눈썹을 만들고 기존 163개 뼈대에 연결합니다. `retarget_makehuman.py`가 기존 동작의 팔·손 회전을 적용하고 `design.json`의 출처를 결과 보고서에 보존합니다. 얼굴 표정은 아직 고정입니다.

```powershell
D:/SignAll/blender-tools/.venv/Scripts/python.exe tools/sign-motion/style_presenter.py --model data/private/sign-motion/sources/base-female.glb --output data/private/sign-motion/presenter-style-new
D:/SignAll/blender-tools/.venv/Scripts/python.exe tools/sign-motion/retarget_makehuman.py --motion data/private/sign-motion/operation-take-01/motion.json --model data/private/sign-motion/presenter-style-new/presenter-female.glb --output data/private/sign-motion/presenter-avatar-new --start 11 --end 55
python tools/sign-motion/avatar_review.py --folder data/private/sign-motion/presenter-avatar-new --video data/private/sign-motion/sources/operation-preview.webm
```

현재 로컬 미리보기 출력은 `presenter-avatar-05`입니다. 플레이어는 검은 배경에서 상반신을 크게 표시하며 `framing: "full"`이면 전신 화면으로 돌아갑니다. 다른 동작 자료를 추가할 때는 팔을 머리 위나 옆으로 뻗는 구간의 잘림도 검토해야 합니다. 생성 파일은 `data/private`에 보관하며 Git과 검토 완료 목록에 자동 등록하지 않습니다.
