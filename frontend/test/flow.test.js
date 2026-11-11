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
  w.fetch = (url, options) => intercept?.(url, options) ?? fetch(url.replace('http://127.0.0.1:3001',base),options);
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

test('실제 demo HTTP와 DOM 전체 흐름, 수어 없음, 답변 수정, 종료', async t => {
  const h=await setup(t);
  await h.questions(); h.click('연습하기'); await h.screen('S4');
  h.click('수어 자료 보기'); await h.wait(()=>h.d.body.textContent.includes('찾지 못했습니다'));
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
