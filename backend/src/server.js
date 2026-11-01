import {createApp} from './app.js';
import {config} from './common.js';
const cfg=config();
const app=createApp({config:cfg});
app.server.listen(cfg.port,cfg.host,()=>console.log(`Sign-All backend: http://${cfg.host}:${cfg.port} | mode=${cfg.mode}`));
let stopping=false;
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{if(stopping)return;stopping=true;await app.close();process.exit(0);});
