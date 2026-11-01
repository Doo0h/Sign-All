import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../src/app.js';
import {config} from '../src/common.js';
import {openDatabase,importDataset,demoData,repository} from '../src/db.js';
import {createAI,validateAI} from '../src/ai.js';
async function setup(t,overrides={},ai) {
 const app=createApp({config:{...config({}),dbPath:':memory:',rateLimit:1000,...overrides},...(ai?{ai}:{})});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>app.close());
 const base=`http://127.0.0.1:${app.server.address().port}`;
 const request=async(path,body,token,extra={})=>{
  const res=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(token?{'X-Session-Token':token}:{}),...extra},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  return {status:res.status,headers:res.headers,body:await res.json()};
 };
 const session=async()=>{const r=await request('/api/session',{});assert.equal(r.status,200);return r.body.data.sessionToken;};
 return {app,request,session,base};
}
async function prepare(h,token) {
 const a=await h.request('/api/resume/analyze',{resumeText:'팀 프로젝트에서 API 오류를 조사하고 수정했습니다.'},token);assert.equal(a.status,200);
 const q=await h.request('/api/interview/questions',{companyId:'demo-company',jobId:'demo-job',analysisId:a.body.data.analysisId},token);assert.equal(q.status,200);
 return {a,q,id:q.body.data.questions[0].questionId};
}
test('demo 전체 흐름과 사용자 원문 DB 미저장',async t=>{
 const h=await setup(t),token=await h.session();const list=await h.request('/api/companies');assert.equal(list.body.data.total,1);assert.equal(list.body.meta.isDemo,true);
 const {id}=await prepare(h,token);const f=await h.request('/api/interview/feedback',{questionId:id,answerText:'원인을 수정 후 재검증했습니다.'},token);
 assert.equal(f.status,200);assert.match(f.body.data.improvements[0],/실제 AI 평가가 아닙니다/);
 assert.deepEqual(h.app.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(x=>x.name).sort(),['companies','job_units','jobs','signs','sources','units'].sort());
 const signs=await h.request('/api/signs?keyword=word');assert.equal(signs.body.data.matchStatus,'not_found');assert.deepEqual(signs.body.data.items,[]);assert.equal(f.headers.get('cache-control'),'no-store');
});
test('다른 세션의 분석·질문 접근 거절',async t=>{
 const h=await setup(t),a=await h.session(),b=await h.session(),flow=await prepare(h,a);
 assert.equal((await h.request('/api/interview/questions',{companyId:'demo-company',jobId:'demo-job',analysisId:flow.a.body.data.analysisId},b)).status,404);
 assert.equal((await h.request('/api/interview/feedback',{questionId:flow.id,answerText:'답변'},b)).status,404);
 assert.equal((await h.request('/api/resume/analyze',{resumeText:'내용'})).status,401);
});
test('재분석·종료 후 맥락 무효화',async t=>{
 const h=await setup(t),token=await h.session(),flow=await prepare(h,token);
 await h.request('/api/resume/analyze',{resumeText:'새 자기소개서'},token);
 assert.equal((await h.request('/api/interview/feedback',{questionId:flow.id,answerText:'답변'},token)).status,404);
 assert.equal((await h.request('/api/session/end',{},token)).status,200);
 assert.equal((await h.request('/api/resume/analyze',{resumeText:'내용'},token)).status,410);
});
test('공백·길이·ID·임의 필드·검색·JSON 검증',async t=>{
 const h=await setup(t),token=await h.session();
 for(const resumeText of ['   ','a'.repeat(10001),null,{}])assert.equal((await h.request('/api/resume/analyze',{resumeText},token)).status,400);
 assert.equal((await h.request('/api/resume/analyze',{resumeText:'내용',userId:'other'},token)).status,400);
 for(const q of ['limit=-1','limit=1.2','limit=101','offset=-2','offset=','unknown=1'])assert.equal((await h.request('/api/jobs?'+q)).status,400);
 assert.equal((await h.request('/api/signs?keyword=')).status,400);
 const a=await h.request('/api/resume/analyze',{resumeText:'내용'},token);
 assert.equal((await h.request('/api/interview/questions',{companyId:'bad!',jobId:'demo-job',analysisId:a.body.data.analysisId},token)).status,400);
 assert.equal((await h.request('/api/interview/questions',{companyId:'missing',jobId:'demo-job',analysisId:a.body.data.analysisId},token)).status,404);
 assert.equal((await fetch(h.base+'/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:'{oops'})).status,400);
 assert.equal((await fetch(h.base+'/api/session',{method:'POST',body:'{}'})).status,415);
});
test('본문 제한·Origin 차단·정상 빈 검색',async t=>{
 const h=await setup(t,{bodyLimit:1024}),token=await h.session();
 assert.equal((await h.request('/api/resume/analyze',{resumeText:'a'.repeat(2000)},token)).status,413);
 assert.equal((await h.request('/api/health',undefined,undefined,{Origin:'https://untrusted.example'})).status,403);
 const ok=await h.request('/api/health',undefined,undefined,{Origin:'http://localhost:5173'});assert.equal(ok.headers.get('access-control-allow-origin'),'http://localhost:5173');
 const r=await h.request('/api/companies?q=nonexistent');assert.equal(r.status,200);assert.equal(r.body.data.total,0);
});
test('IP·세션·AI 호출 상한',async t=>{
 const r=await setup(t,{rateLimit:1});assert.equal((await r.request('/api/health')).status,200);assert.equal((await r.request('/api/health')).status,429);
 const c=await setup(t,{maxSessions:1});await c.session();assert.equal((await c.request('/api/session',{})).status,503);
 const b=await setup(t,{aiBudget:1}),token=await b.session();await b.request('/api/resume/analyze',{resumeText:'내용'},token);
 assert.equal((await b.request('/api/resume/analyze',{resumeText:'다음'},token)).body.error.code,'AI_BUDGET_EXCEEDED');
});
test('live에서 미확보 자료 503·demo 자료 격리',async t=>{
 const h=await setup(t,{mode:'live'},async()=>{});importDataset(h.app.db,demoData);
 assert.equal((await h.request('/api/companies')).body.error.code,'REFERENCE_DATA_UNAVAILABLE');assert.equal((await h.request('/api/signs?keyword=x')).status,503);
});
test('SQLite 재실행 영속성·FK 실패 전체 롤백',()=>{
 const dir=mkdtempSync(join(tmpdir(),'signall-')),path=join(dir,'test.sqlite');
 try{let db=openDatabase(path);importDataset(db,demoData);db.close();db=openDatabase(path);
  try{assert.equal(repository(db,'demo').list('companies').length,1);
   assert.throws(()=>importDataset(db,{sources:[],companies:[{id:'rollback',sourceId:'demo-source',name:'삽입'}],jobs:[],units:[],signs:[],job_units:[{jobId:'missing',unitId:'demo-unit'}]}));
   assert.equal(repository(db,'demo').get('companies','rollback'),undefined);
  }finally{db.close();}
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('AI 근거·출처·출력 필드 검증',()=>{
 assert.throws(()=>validateAI('analyze',{summary:'요약',keywords:[],competencies:[{name:'역량',evidence:'없는 문장'}]},{resumeText:'실제'}));
 assert.throws(()=>validateAI('questions',{questions:[{text:'질문',keywords:[],referenceIds:['invented']}]},{referenceIds:['real']}));
 assert.equal(validateAI('analyze',{summary:'요약',keywords:[],competencies:[],evil:'x'},{resumeText:'내용'}).evil,undefined);
});
test('AI 어댑터 JSON 처리·키 비노출·timeout·잘못된 응답',async()=>{
 const cfg={...config({}),mode:'live',aiUrl:'https://provider.example/chat/completions',aiKey:'TEST_SECRET',aiModel:'test'};let seen;
 const good=createAI(cfg,async(url,opt)=>{seen=opt;return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({summary:'요약',keywords:[],competencies:[]})}}]}));});
 assert.equal((await good('analyze',{resumeText:'가상'})).summary,'요약');assert.equal(seen.redirect,'error');assert.equal(seen.headers.Authorization,'Bearer TEST_SECRET');
 await assert.rejects(()=>createAI(cfg,async()=>new Response('TEST_SECRET PRIVATE',{status:500}))('analyze',{}),e=>e.code==='UPSTREAM_FAILED'&&!e.message.includes('TEST_SECRET'));
 await assert.rejects(()=>createAI(cfg,async()=>{throw new DOMException('private','TimeoutError');})('analyze',{}),e=>e.status===504);
 await assert.rejects(()=>createAI(cfg,async()=>new Response('{}'))('analyze',{}),e=>e.status===502);
 assert.throws(()=>createAI({...cfg,aiUrl:'http://provider.example'}));
});
test('처리 중 중복 분석·전역 동시 실행 제한',async t=>{
 let release;const wait=new Promise(r=>release=r);let started;const begun=new Promise(r=>started=r);
 const h=await setup(t,{concurrency:1},async()=>{started();await wait;return {summary:'요약',keywords:[],competencies:[]};});
 const a=await h.session(),b=await h.session();const pending=h.request('/api/resume/analyze',{resumeText:'내용'},a);await begun;
 try{assert.equal((await h.request('/api/resume/analyze',{resumeText:'다시'},a)).status,409);assert.equal((await h.request('/api/resume/analyze',{resumeText:'타 세션'},b)).body.error.code,'AI_BUSY');}
 finally{release();}assert.equal((await pending).status,200);
});
test('실제 세션 만료와 외부 응답 크기 상한',async t=>{
 const h=await setup(t,{ttl:10}),token=await h.session();
 await new Promise(r=>setTimeout(r,25));
 assert.equal((await h.request('/api/resume/analyze',{resumeText:'내용'},token)).status,410);
 const cfg={...config({}),mode:'live',aiUrl:'https://provider.example/chat/completions',aiKey:'TEST_ONLY',aiModel:'test'};
 await assert.rejects(()=>createAI(cfg,async()=>new Response('x'.repeat(140000)))('analyze',{}),e=>e.status===502);
});
test('검증된 내부형식 가져오기 후 live 목록·수어 후보 조회',async t=>{
 const h=await setup(t,{mode:'live'},async()=>{});
 const data=structuredClone(demoData);
 data.sources[0]={...data.sources[0],mode:'live',verificationStatus:'verified',name:'테스트에서만 사용하는 출처',url:'https://example.org/test-fixture'};
 data.signs=[{id:'test-sign',sourceId:'demo-source',term:'협력',keywords:['협업'],meaning:'테스트 의미',sourcePageUrl:'https://example.org/test-fixture'}];
 importDataset(h.app.db,data);
 const c=await h.request('/api/companies');assert.equal(c.body.meta.isDemo,false);assert.equal(c.body.data.items.length,1);
 const s=await h.request('/api/signs?keyword='+encodeURIComponent('협업'));assert.equal(s.body.data.matchStatus,'candidate');assert.equal(s.body.data.items[0].videoUrl,undefined);
 const invalid=structuredClone(data);invalid.signs[0].videoUrl='http://example.org/unverified';assert.throws(()=>importDataset(h.app.db,invalid));
});
