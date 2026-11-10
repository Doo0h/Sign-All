import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSystemPrompt,createAI,validateAI} from '../src/ai.js';

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
const company={id:'demo-company',sourceId:'demo-source',name:'가상기업 (테스트 전용)'};
const job={id:'demo-job',sourceId:'demo-source',name:'가상 연습 직무'};
const units=[{id:'demo-unit',sourceId:'demo-source',name:'팀 작성 문제 해결 연습 요소',definition:'공식 NCS가 아닌 가상 연습 자료'}];
const cfg={mode:'live',aiUrl:'https://example.invalid/chat/completions',aiKey:'FAKE_TEST_KEY',aiModel:'fixture-only',aiTimeout:2000};

for (const item of cases) {
  test(item.id+' — mocked live adapter JSON contract (not model quality)',async()=>{
    let step=0;let lastMessage;
    const fetcher=async(url,request)=>{
      assert.equal(url,cfg.aiUrl);
      const body=JSON.parse(request.body); lastMessage=body.messages;
      assert.ok(!JSON.stringify(body).includes('analysisId from model'));
      const result=step++===0 ? item.analysis : item.questions;
      return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(result)}}]}));
    };
    const ai=createAI(cfg,fetcher);
    const a=await ai('analyze',{resumeText:item.resumeText});
    assert.deepEqual(a,item.analysis);
    for(const c of a.competencies) assert.ok(item.resumeText.includes(c.evidence));
    const q=await ai('questions',{company,job,units,analysis:a,referenceIds:['demo-source']});
    assert.deepEqual(q,item.questions);
    assert.ok(q.questions.length>=1 && q.questions.length<=3);
    for(const question of q.questions){
      assert.ok(question.keywords.length<=10);
      assert.ok(question.referenceIds.every(ref=>ref==='demo-source'));
      assert.doesNotMatch(question.text,/이 기업의 인재상|실제 기출|합격 확률|공식 NCS 평가/);
    }
    assert.equal(step,2);
    assert.match(lastMessage[0].content,/1~3개/);
    assert.deepEqual(Object.keys(q),['questions']);
  });
}

test('separate prompts and untrusted input protection',()=>{
  const a=buildSystemPrompt('analyze'),q=buildSystemPrompt('questions'),f=buildSystemPrompt('feedback');
  assert.match(a,/연속 부분 문자열/);
  assert.match(a,/competencies/);
  assert.match(q,/referenceIds/);
  assert.match(q,/수어 사전/);
  for (const p of [a,q,f]) {assert.match(p,/분석할 데이터/);assert.match(p,/JSON 객체/);}
  assert.throws(()=>buildSystemPrompt('unknown'));
});

test('invalid hallucinated evidence, fabricated reference, and four questions rejected',()=>{
  const item=cases[2];
  assert.throws(()=>validateAI('analyze',{summary:'요약',keywords:[],competencies:[{name:'관리 역량',evidence:'프로젝트를 성공시켰습니다'}]},{resumeText:item.resumeText}));
  assert.throws(()=>validateAI('questions',{questions:[{text:'질문',keywords:[],referenceIds:['invented-source']}]},{referenceIds:['demo-source']}));
  assert.throws(()=>validateAI('questions',{questions:Array.from({length:4},()=>({text:'질문',keywords:[],referenceIds:[]}))},{referenceIds:[]}));
});
