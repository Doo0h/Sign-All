// 개인정보가 없는 가상 자기소개서. 답변은 사람이 작성한 예상 출력이며 실제 모델 응답이 아닙니다.
export const cases = [
  {
    id:'S01-collaboration',
    resumeText:'학과 팀 프로젝트에서 일정이 지연되자 팀원들과 남은 작업을 나누고 진행 상황을 공유했습니다. 매주 점검표를 작성해 완료 여부를 확인했습니다.',
    analysis:{summary:'팀 프로젝트에서 작업을 나누고 진행 상황을 공유했으며 점검표를 작성한 경험이다.',keywords:['협업','역할 분담','진행 상황','점검표'],competencies:[{name:'협업 경험',evidence:'팀원들과 남은 작업을 나누고 진행 상황을 공유했습니다'},{name:'진행 관리 경험',evidence:'매주 점검표를 작성해 완료 여부를 확인했습니다'}]},
    questions:{questions:[{text:'팀원들과 남은 작업을 나눌 때 어떤 기준을 고려했나요?',keywords:['팀원','역할 분담'],referenceIds:[]},{text:'진행 상황을 공유하고 점검표를 사용한 방법을 설명해 주세요.',keywords:['진행 상황','공유','점검표'],referenceIds:[]}]}
  },
  {
    id:'S02-problem-solving',
    resumeText:'수업 과제의 API 응답이 간헐적으로 실패하여 요청 로그를 비교했습니다. 입력값을 바꿔 재현한 후 오류를 발생시키는 조건을 문서에 정리했습니다.',
    analysis:{summary:'API 응답 실패 상황에서 로그를 비교하고 입력값 변경으로 재현한 조건을 문서로 정리했다.',keywords:['API','오류','요청 로그','재현','문서화'],competencies:[{name:'문제 분석 경험',evidence:'요청 로그를 비교했습니다'},{name:'원인 조사 경험',evidence:'입력값을 바꿔 재현한 후 오류를 발생시키는 조건을 문서에 정리했습니다'}]},
    questions:{questions:[{text:'API 응답 실패를 조사하면서 어떤 로그를 비교했나요?',keywords:['API','로그','오류'],referenceIds:[]},{text:'입력값을 바꿔 오류를 재현한 과정을 설명해 주세요.',keywords:['재현','입력값','문제 해결'],referenceIds:[]}]}
  },
  {
    id:'S03-insufficient-evidence',
    resumeText:'개발에 관심이 있습니다.',
    analysis:{summary:'개발에 관심이 있다고 표현했다.',keywords:['개발 관심'],competencies:[]},
    questions:{questions:[{text:'개발에 관심을 갖게 된 계기를 설명해 주세요.',keywords:['개발','관심'],referenceIds:[]}]}
  }
];
