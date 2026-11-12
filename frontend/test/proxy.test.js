import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createFrontendServer} from '../serve.js';

test('same-origin proxy forwards API and uploads, hides server files, rejects absolute target switching',async t=>{
 const backend=http.createServer(async(req,res)=>{let size=0;for await(const chunk of req)size+=chunk.length;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({path:req.url,size,token:req.headers['x-session-token'],ip:req.headers['x-forwarded-for']}));});
 const listen=server=>new Promise((r,j)=>{server.once('error',j);server.listen(0,'127.0.0.1',r)});
 await listen(backend);t.after(()=>new Promise(r=>backend.close(r)));
 const server=createFrontendServer('http://127.0.0.1:'+backend.address().port);await listen(server);t.after(()=>new Promise(r=>server.close(r)));
 const base='http://127.0.0.1:'+server.address().port;
 assert.equal((await fetch(base+'/')).status,200);assert.equal((await fetch(base+'/serve.js')).status,404);assert.equal((await fetch(base+'/.env')).status,404);
 const logo=await fetch(base+'/logos/kakao.ico');assert.equal(logo.status,200);assert.match(logo.headers.get('content-type'),/image\/x-icon/);assert.equal((await fetch(base+'/logos/SOURCES.md')).status,404);
 const result=await fetch(base+'/api/documents/extract',{method:'POST',body:'synthetic',headers:{'Content-Type':'application/octet-stream','X-File-Name':'resume.txt','X-Session-Token':'synthetic-token','X-Forwarded-For':'fake'}});
 const data=await result.json();assert.equal(data.size,9);assert.equal(data.token,'synthetic-token');assert.notEqual(data.ip,'fake');
 assert.match(result.headers.get('content-security-policy'),/frame-ancestors 'none'/);
 const absolute=await new Promise((resolve,reject)=>{
  const req=http.request({hostname:'127.0.0.1',port:server.address().port,path:'http://untrusted.invalid/api/health'},res=>{let raw='';res.on('data',c=>raw+=c);res.on('end',()=>resolve(JSON.parse(raw)));});req.on('error',reject);req.end();
 });
 assert.equal(absolute.path,'/api/health');
});
