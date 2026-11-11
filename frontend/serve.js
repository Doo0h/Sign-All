import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const assets = {'/':['index.html','text/html'],'/index.html':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/style.css':['style.css','text/css']};
export function createFrontendServer(backend = process.env.BACKEND_URL || 'http://127.0.0.1:3001') {
  const target = new URL(backend);
  if(target.protocol!=='http:')throw new Error('BACKEND_URL must be an internal HTTP service');
  return http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Security-Policy',"default-src 'self'; connect-src 'self'; img-src 'self' data:; media-src https:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    const path = new URL(req.url,'http://local').pathname;
    if(path.startsWith('/api/')) {
      const headers={};
      for(const key of ['content-type','content-length','origin','x-session-token','x-file-name'])if(req.headers[key])headers[key]=req.headers[key];
      headers['x-forwarded-for']=req.socket.remoteAddress;
      const upstream=http.request(new URL(path+new URL(req.url,'http://local').search,target),{method:req.method,headers,timeout:135000},reply=>{
        res.writeHead(reply.statusCode,{'Content-Type':'application/json; charset=utf-8',...(reply.headers['retry-after']?{'Retry-After':reply.headers['retry-after']}:{})});
        reply.pipe(res);
      });
      upstream.on('timeout',()=>upstream.destroy());
      upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{code:'BACKEND_UNAVAILABLE',message:'서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.'}}));});
      res.on('close',()=>upstream.destroy());req.pipe(upstream);return;
    }
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'}).end();return;}
    const asset=assets[path];if(!asset){res.writeHead(404).end('Not found');return;}
    try {const data=await readFile(new URL(asset[0],import.meta.url));res.writeHead(200,{'Content-Type':asset[1]+'; charset=utf-8'}).end(req.method==='HEAD'?undefined:data);}
    catch {res.writeHead(500).end('Unavailable');}
  });
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const port=Number(process.env.PORT||5173),host=process.env.HOST||'127.0.0.1';
  const server=createFrontendServer().listen(port,host,()=>console.log(`Sign-All frontend: http://${host}:${port}`));
  for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>process.exit(0)));
}
