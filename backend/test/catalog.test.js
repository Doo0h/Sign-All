import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {config} from '../src/common.js';
import {createApp} from '../src/app.js';
import {importDataset} from '../src/db.js';

test('curated references work with demo AI without fabricated NCS or video claims',async t=>{
 const data=JSON.parse(await readFile(new URL('../../data/reference-starter.json',import.meta.url)));
 const app=createApp({config:{...config({REFERENCE_MODE:'live'}),dbPath:':memory:',rateLimit:1000}});t.after(()=>app.close());importDataset(app.db,data);
 await new Promise((r,j)=>{app.server.once('error',j);app.server.listen(0,'127.0.0.1',r)});
 const base='http://127.0.0.1:'+app.server.address().port;
 const get=async path=>(await (await fetch(base+path)).json()).data;
 const post=async(path,body,token)=>(await (await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{'X-Session-Token':token}:{})},body:JSON.stringify(body)})).json()).data;
 assert.equal((await get('/api/health')).dataMode,'live');
 const companies=await get('/api/companies');assert.equal(companies.total,3);assert.ok(companies.items.every(c=>c.practiceOnly&&c.sourcePageUrl.startsWith('https://')));
 const sign=await get('/api/signs?keyword='+encodeURIComponent('경험'));assert.equal(sign.matchStatus,'candidate');assert.equal(sign.items[0].semanticStatus,'unreviewed');assert.equal(sign.items[0].videoUrl,undefined);
 const token=(await post('/api/session',{})).sessionToken;
 const analysis=await post('/api/resume/analyze',{resumeText:'가상 테스트 경험'},token);
 const questions=await post('/api/interview/questions',{companyId:'naver',jobId:'backend-practice',analysisId:analysis.analysisId},token);
 assert.ok(questions.questions.length);assert.ok(questions.questions[0].references.some(r=>r.id==='team-practice-rubric'));
});
