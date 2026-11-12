import test from 'node:test';
import assert from 'node:assert/strict';
import {createPostings,plainText} from '../src/postings.js';
import {createApp} from '../src/app.js';
import {config} from '../src/common.js';
const raw=(id,extra={})=>({id,internal_job_id:id,title:'Software Engineer',location:{name:'Seoul, Korea'},absolute_url:'https://job-boards.greenhouse.io/test/jobs/'+id,content:'&lt;p&gt;Build APIs &amp;amp; test systems&lt;/p&gt;',...extra});
test('public postings filter Korea/prospects/deadlines and share bounded cache',async()=>{
 let count=0,clock=Date.parse('2026-11-12T00:00:00Z');
 const service=createPostings({providers:[['test','Test']],now:()=>clock,fetcher:async()=>{count++;return Response.json({jobs:[raw(1),raw(2,{location:{name:'Tokyo'}}),raw(3,{internal_job_id:null}),raw(4,{title:'Expression of Interest: Engineer'}),raw(5,{application_deadline:'2026-01-01'}),raw(6,{title:'Marketing Manager'})]});}});
 const [a,b]=await Promise.all([service.list(new URLSearchParams()),service.list(new URLSearchParams())]);assert.equal(count,1);assert.equal(a.total,2);assert.equal(b.total,2);
 assert.equal((await service.list(new URLSearchParams({category:'마케팅'}))).items[0].id,'test:6');
 assert.equal((await service.list(new URLSearchParams({q:'missing'}))).total,0);
 await assert.rejects(service.list(new URLSearchParams({offset:'-1'})),{code:'INVALID_INPUT'});
 clock+=900001;await service.list(new URLSearchParams());assert.equal(count,2);
});
test('partial outage excludes failed source; all-source outage is not an empty successful list',async()=>{
 const service=createPostings({providers:[['ok','OK'],['bad','BAD']],fetcher:async url=>{if(url.includes('/bad/'))throw Error('offline');return Response.json({jobs:[raw(1)]});}});
 const data=await service.list(new URLSearchParams());assert.deepEqual(data.failedBoards,['BAD']);assert.equal(data.total,1);
 const failed=createPostings({providers:[['bad','BAD']],fetcher:async()=>{throw Error('offline');}});
 await assert.rejects(failed.list(new URLSearchParams()),{code:'POSTINGS_UNAVAILABLE'});
});
test('detail uses fixed provider host, strips HTML, rejects unknown board and withdrawn job',async()=>{
 let calls=0;
 const service=createPostings({providers:[['test','Test']],fetcher:async url=>{assert.ok(url.startsWith('https://boards-api.greenhouse.io/v1/boards/test/jobs/'));calls++;return calls===1?Response.json(raw(1)):new Response('',{status:404});}});
 const p=await service.detail('test:1');assert.equal(p.description,'Build APIs & test systems');
 assert.equal(plainText('&lt;script&gt;bad()&lt;/script&gt;Hello'),'Hello');
 await assert.rejects(service.detail('evil:1'),{code:'INVALID_INPUT'});assert.equal(calls,1);
 await assert.rejects(service.detail('test:1'),{code:'POSTING_UNAVAILABLE'});
});
test('selected posting grounds questions and feedback; selection is session-scoped and revalidated',async t=>{
 let details=0,closed=false;const contexts=[];
 const app=createApp({config:{...config({POSTINGS_ENABLED:'true'}),dbPath:':memory:',rateLimit:1000},postings:{detail:async()=>{details++;if(closed){const {fail}=await import('../src/common.js');fail(410,'POSTING_UNAVAILABLE','closed');}return {id:'test:1',board:'test',companyName:'Test',title:'Security Engineer',description:'Review access controls',sourceUrl:'https://example.org/jobs/1',checkedAt:'2026-11-12'};}},ai:async(kind,input)=>{contexts.push({kind,input});if(kind==='analyze')return {summary:'Example',keywords:[],competencies:[]};if(kind==='questions')return {questions:[{text:'Explain access controls',keywords:['보안'],referenceIds:input.referenceIds}]};return {strengths:[],improvements:[],suggestion:'Explain',referenceIds:input.referenceIds};}});
 t.after(()=>app.close());await new Promise((r,j)=>{app.server.once('error',j);app.server.listen(0,'127.0.0.1',r);});
 const base='http://127.0.0.1:'+app.server.address().port;
 const post=async(path,body,token)=>{const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{'X-Session-Token':token}:{})},body:JSON.stringify(body)});return {status:r.status,...await r.json()};};
 const token=(await post('/api/session',{})).data.sessionToken;
 const a=(await post('/api/resume/analyze',{resumeText:'Synthetic test'},token)).data;
 const request={postingId:'test:1',analysisId:a.analysisId};
 assert.equal((await post('/api/interview/questions',request,token)).status,409);
 await post('/api/postings/select',{postingId:'test:1'},token);
 const q=await post('/api/interview/questions',request,token);assert.equal(q.status,200);assert.equal(details,2);
 assert.equal(contexts.find(c=>c.kind==='questions').input.job.description,'Review access controls');
 assert.equal(q.data.questions[0].jobSnapshot,undefined);assert.equal(q.data.questions[0].references[0].url,'https://example.org/jobs/1');
 await post('/api/interview/feedback',{questionId:q.data.questions[0].questionId,answerText:'Example'},token);
 assert.equal(contexts.find(c=>c.kind==='feedback').input.job.description,'Review access controls');
 closed=true;assert.equal((await post('/api/interview/questions',request,token)).status,410);
});
