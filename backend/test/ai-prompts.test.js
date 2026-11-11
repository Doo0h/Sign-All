import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSystemPrompt,createAI,validateAI} from '../src/ai.js';

import {cases} from '../fixtures/ai-cases.js';
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
