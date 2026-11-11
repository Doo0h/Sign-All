// OS loopback probe only. Does not change firewall/network settings or retry application requests.
import {createServer} from 'node:http';
const results=[];
for(let i=0;i<10;i++) {
 const server=createServer((req,res)=>res.end('ok'));
 try {
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const response=await fetch(`http://127.0.0.1:${server.address().port}`,{signal:AbortSignal.timeout(3000)});
  results.push({attempt:i+1,ok:(await response.text())==='ok'});
 } catch(e) {results.push({attempt:i+1,ok:false,code:e.code||e.cause?.code||e.name});}
 finally {server.closeAllConnections();if(server.listening)await new Promise(r=>server.close(r));}
}
console.log(JSON.stringify({node:process.version,platform:process.platform,results},null,2));
if(results.some(r=>!r.ok))process.exitCode=1;
