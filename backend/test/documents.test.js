import test from 'node:test';
import assert from 'node:assert/strict';
import {extractDocument} from '../src/documents.js';
import {createApp} from '../src/app.js';
import {config} from '../src/common.js';

test('UTF-8 document extraction returns text without storage and truncates at 10000',async()=>{
  const result=await extractDocument(Buffer.from('가상 자기소개서\n팀 프로젝트 경험'),'txt');
  assert.equal(result.text,'가상 자기소개서\n팀 프로젝트 경험');assert.equal(result.stored,false);
  const large=await extractDocument(Buffer.from('가'.repeat(10001)),'txt');assert.equal(large.text.length,10000);assert.equal(large.truncated,true);
});
test('document parser rejects fake PDFs, OLE and unsupported files',async()=>{
  for(const ext of ['pdf','hwp','hwpx','docx']) await assert.rejects(extractDocument(Buffer.from('not a document'),ext),e=>e.code==='DOCUMENT_UNREADABLE');
  assert.throws(()=>extractDocument(Buffer.from('x'),'exe'),e=>e.status===415);
});
test('upload HTTP contract requires session and bounded supported binary',async t=>{
  const app=createApp({config:{...config({}),dbPath:':memory:',uploadLimit:1024,rateLimit:1000}});t.after(()=>app.close());
  await new Promise((r,j)=>{app.server.once('error',j);app.server.listen(0,'127.0.0.1',r)});
  const base='http://127.0.0.1:'+app.server.address().port;
  const post=(path,body,headers={})=>fetch(base+path,{method:'POST',body,headers});
  const session=await post('/api/session','{}',{'Content-Type':'application/json'});
  const token=(await session.json()).data.sessionToken;
  const headers={'Content-Type':'application/octet-stream','X-File-Name':'resume.txt','X-Session-Token':token};
  assert.equal((await post('/api/documents/extract','x')).status,401);
  assert.equal((await post('/api/documents/extract','x'.repeat(1025),headers)).status,413);
  assert.equal((await post('/api/documents/extract','x',{...headers,'X-File-Name':'bad.exe'})).status,415);
  const result=await post('/api/documents/extract','Synthetic experience',headers);
  assert.equal(result.status,200);assert.equal((await result.json()).data.text,'Synthetic experience');
  assert.deepEqual(app.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(x=>x.name).sort(),['companies','job_units','jobs','signs','sources','units']);
});
