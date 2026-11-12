import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {createApp} from '../../backend/src/app.js';
import {config} from '../../backend/src/common.js';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const script = await readFile(new URL('../app.js', import.meta.url), 'utf8');
async function setup(t, intercept) {
  const app = createApp({config:{...config({}), dbPath:':memory:', rateLimit:1000}});
  t.after(() => app.close());
  await new Promise((resolve,reject) => { app.server.once('error',reject); app.server.listen(0,'127.0.0.1',resolve); });
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const dom = new JSDOM(html, {url:'http://localhost:5173', runScripts:'outside-only'});
  t.after(() => dom.window.close());
  const w = dom.window, d = w.document;
  w.confirm = () => true;
  w.AbortSignal = AbortSignal;
  w.fetch = (url, options) => intercept?.(url, options) ?? fetch(base+url,options);
  w.eval(script + '\nwindow.testState = () => st;');
  const wait = async pred => {
    for(let i=0;i<300;i++) { if(pred()) return; await new Promise(r=>setTimeout(r,10)); }
    assert.fail('UI state timeout: '+d.body.textContent);
  };
  const click = text => { const b=[...d.querySelectorAll('button')].find(b=>b.textContent.includes(text)); assert.ok(b,text); assert.equal(b.disabled,false,text); b.click(); };
  const input = (id,value,event='input') => { const el=d.getElementById(id); el.value=value; el.dispatchEvent(new w.Event(event,{bubbles:true})); };
  const screen = id => wait(()=>d.querySelector('main').dataset.screen===id && !d.querySelector('main').hasAttribute('aria-busy'));
  const start = async () => { click('내 면접'); await screen('S1'); input('company','demo-company','change'); input('job','demo-job','change'); click('자기소개서 작성'); await screen('S2'); };
  const questions = async () => { await start(); input('resume','가상 경험: 오류를 조사하고 결과를 공유했습니다.'); click('분석하기'); await wait(()=>!d.getElementById('generate').disabled); click('예상 질문'); await screen('S3'); };
  return {w,d,wait,click,input,screen,start,questions};
}

test('sign library searches and pages without clearing interview input',async t=>{
 const calls=[];
 const h=await setup(t,(url)=>{
   if(!url.startsWith('/api/signs/catalog'))return;
   calls.push(url);const offset=new URL(url,'http://localhost').searchParams.get('offset');
   return Promise.resolve(new Response(JSON.stringify({data:{items:[{term:offset==='0'?'회사':'준비',sourcePageUrl:'https://sldict.korean.go.kr/'}],total:2}})));
 });
 h.w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 h.w.HTMLDialogElement.prototype.close=function(){this.dispatchEvent(new h.w.Event('close'));};
 await h.start();h.input('resume','작성 중인 경험');h.click('수어 자료실');
 await h.wait(()=>h.d.querySelector('dialog article'));
 h.click('더 보기');await h.wait(()=>h.d.querySelectorAll('dialog article').length===2);
 assert.ok(calls[1].includes('offset=1'));
 const query=h.d.querySelector('dialog input');query.value='회사';h.click('검색');
 await h.wait(()=>calls.length===3 && h.d.querySelectorAll('dialog article').length===1);
 assert.ok(calls[2].includes(encodeURIComponent('회사')));
 h.click('닫기');assert.equal(h.d.querySelector('dialog'),null);assert.equal(h.d.getElementById('resume').value,'작성 중인 경험');
});

test('실제 demo HTTP와 DOM 전체 흐름, 수어 없음, 답변 수정, 종료', async t => {
  const h=await setup(t);
  await h.questions(); h.click('연습하기'); await h.screen('S4');
  h.click('수어 자료 보기'); await h.wait(()=>h.d.body.textContent.includes('찾지 못했습니다'));
  const card=h.d.querySelector('.sign-card-button');assert.equal(card.getAttribute('aria-expanded'),'true');
  card.click();assert.equal(card.getAttribute('aria-expanded'),'false');assert.equal(card.nextElementSibling.hidden,true);
  card.click();await h.wait(()=>card.getAttribute('aria-expanded')==='true');assert.equal(card.nextElementSibling.hidden,false);
  h.input('answer','<img src=x onerror=alert(1)> 가상 답변입니다.');
  h.click('피드백 받기'); await h.wait(()=>h.d.body.textContent.includes('실제 AI 평가가 아닙니다'));
  assert.equal(h.d.querySelector('main img'),null);
  h.input('answer','수정한 가상 답변'); assert.equal(h.d.body.textContent.includes('실제 AI 평가가 아닙니다'),false);
  h.click('질문 목록으로'); await h.screen('S3'); h.click('연습 종료'); await h.screen('S5');
  assert.equal(h.w.testState().token,null); assert.equal(h.w.testState().resumeText,'');
  assert.equal(h.w.localStorage.length,0); assert.equal(h.w.sessionStorage.length,0);
});

test('분석 대기 중 중복 호출 차단, 입력 수정으로 분석 무효화', async t => {
  let release, calls=0;
  const h=await setup(t,(url)=>{
    if(!url.endsWith('/api/resume/analyze')) return;
    calls++; return new Promise(r=> {release=()=>r(new Response(JSON.stringify({data:{analysisId:'a',summary:'가상 요약',keywords:[],competencies:[]}})));});
  });
  await h.start(); h.input('resume','가상 입력'); h.click('분석하기');
  assert.ok(h.d.getElementById('resume').disabled);
  [...h.d.querySelectorAll('button')].find(b=>b.textContent==='분석하기').click(); assert.equal(calls,1);
  release(); await h.wait(()=>!h.d.getElementById('generate').disabled);
  h.input('resume','변경된 입력'); assert.ok(h.d.getElementById('generate').disabled); assert.equal(h.w.testState().analysis,null);
});

test('410 만료 응답은 입력과 토큰을 즉시 지운다', async t => {
  const h=await setup(t,url=>url.endsWith('/api/resume/analyze') ? Promise.resolve(new Response(JSON.stringify({error:{message:'만료'}}),{status:410})) : undefined);
  await h.start(); h.input('resume','삭제할 가상 입력'); h.click('분석하기'); await h.screen('EXPIRED');
  assert.equal(h.w.testState().resumeText,''); assert.equal(h.w.testState().token,null);
});

test('종료 연결 실패는 성공으로 표시하지 않고 재시도한다', async t => {
  let fail=true;
  const h=await setup(t,url=>url.endsWith('/api/session/end') && fail ? Promise.reject(new Error('offline')) : undefined);
  await h.questions(); h.click('연습 종료'); await h.wait(()=>h.d.getElementById('error').textContent.includes('연결'));
  assert.equal(h.d.querySelector('main').dataset.screen,'S3'); assert.ok(h.w.testState().token);
  fail=false; h.click('연습 종료'); await h.screen('S5');
});

test('company cards filter and select the company without submitting an application',async t=>{
 const h=await setup(t);h.click('내 면접');await h.screen('S1');
 h.input('company-search','없는기업');assert.ok(h.d.body.textContent.includes('검색 결과가 없습니다'));
 h.input('company-search','');h.click('이 기업으로 연습');assert.equal(h.d.getElementById('company').value,'demo-company');
 assert.ok(h.d.body.textContent.includes('실제 지원서가 기업에 제출되지 않습니다'));
});

test('document upload populates editable text and invalidates existing analysis',async t=>{
 const h=await setup(t,(url,options)=>{
  if(url!=='/api/documents/extract')return;
  assert.equal(options.headers['Content-Type'],'application/octet-stream');assert.equal(options.headers['X-File-Name'],'resume.txt');
  return Promise.resolve(new Response(JSON.stringify({data:{text:'추출한 가상 경험',truncated:false,warnings:[],stored:false}})));
 });
 await h.start();h.input('resume','이전 가상 입력');h.click('분석하기');await h.wait(()=>!h.d.getElementById('generate').disabled);
 Object.defineProperty(h.d.getElementById('resume-file'),'files',{value:[new h.w.File(['synthetic'],'resume.txt')],configurable:true});
 h.click('파일에서 불러오기');await h.wait(()=>h.d.getElementById('resume').value==='추출한 가상 경험');
 assert.equal(h.w.testState().analysis,null);assert.ok(h.d.getElementById('generate').disabled);assert.ok(h.d.getElementById('upload-message').textContent.includes('저장하지 않습니다'));
});

test('external AI analysis starts directly from the unified resume editor',async t=>{
 let calls=0;
 const h=await setup(t,(url)=>{
  if(url==='/api/health')return Promise.resolve(new Response(JSON.stringify({data:{aiMode:'external',aiProvider:'groq'}})));
  if(url==='/api/resume/analyze')calls++;
 });
 await h.start();assert.equal(h.d.getElementById('ai-consent'),null);
 const editor=h.d.querySelector('.resume-editor');assert.ok(editor.contains(h.d.getElementById('resume')));assert.ok(editor.contains(h.d.getElementById('resume-file')));
 h.input('resume','가상 입력');h.click('분석하기');await h.wait(()=>!h.d.getElementById('generate').disabled);assert.equal(calls,1);
});

test('live posting filters and selection carry posting context into question request',async t=>{
 let sent;const posting={id:'test:1',board:'test',companyName:'Test Company',title:'Security Engineer',description:'Review access controls',sourceUrl:'https://example.org/jobs/1',location:'Seoul',category:'보안',experience:'원문 확인'};
 const h=await setup(t,(url,options)=>{
  if(url==='/api/health')return Promise.resolve(Response.json({data:{postingsEnabled:true}}));
  if(url.startsWith('/api/postings?'))return Promise.resolve(Response.json({data:{items:[posting],total:1,checkedAt:'2026-11-12T00:00:00Z',failedBoards:[],companies:[{id:'test',name:'Test Company'}],categories:['보안']}}));
  if(url==='/api/postings/select')return Promise.resolve(Response.json({data:{posting,company:{id:'hiring-test',name:'Test Company'},job:{id:'posting-test-1',name:posting.title}}}));
  if(url==='/api/interview/questions'){sent=JSON.parse(options.body);return Promise.resolve(Response.json({data:{questions:[{questionId:'q1',text:'Security question',keywords:[],references:[]}]}}));}
 });
 h.click('내 면접');await h.screen('S1');await h.wait(()=>h.d.querySelector('.posting-card'));
 assert.ok(h.d.querySelector('.posting-filters'));h.click('공고 선택');await h.wait(()=>h.d.querySelector('.posting-selected').textContent.includes('Review access controls'));
 assert.equal(h.d.querySelector('main').dataset.screen,'S1');assert.equal(h.d.querySelector('.posting-pick').getAttribute('aria-pressed'),'true');
 h.click('이 공고로 면접 연습');await h.screen('S2');
 assert.ok(h.d.querySelector('.selected-posting').textContent.includes('Review access controls'));
 h.input('resume','가상 경험');h.click('분석하기');await h.wait(()=>!h.d.getElementById('generate').disabled);h.click('예상 질문');await h.screen('S3');
 assert.equal(sent.postingId,'test:1');assert.equal(sent.companyId,'hiring-test');
});
