import {createServer} from 'node:http';
import {randomBytes,randomUUID} from 'node:crypto';
import {config,ApiError,fail,fields,text,id} from './common.js';
import {openDatabase,importDataset,repository,demoData} from './db.js';
import {createAI} from './ai.js';
import {extractDocument,documentTypes} from './documents.js';
import {isIP} from 'node:net';

export function createApp(options={}) {
  const cfg=options.config || config();
  const db=options.db || openDatabase(cfg.dbPath);
  if(cfg.mode==='demo') importDataset(db,demoData);
  const repo=repository(db,cfg.referenceMode || cfg.mode);
  let extracting=0;
  const ai=options.ai || createAI(cfg);
  const sessions=new Map(), rates=new Map();
  let active=0, calls=0, budgetUntil=Date.now()+3600000;
  const clean=()=>{
    const now=Date.now();
    for(const [k,v] of sessions) if(v.expires<=now)sessions.delete(k);
    for(const [k,v] of rates) if(v.until<=now)rates.delete(k);
  };
  const timer=setInterval(clean,30000);timer.unref();
  const gate=async(kind,input)=>{
    const now=Date.now();if(now>=budgetUntil){calls=0;budgetUntil=now+3600000;}
    if(active>=cfg.concurrency)fail(503,'AI_BUSY','처리 중입니다. 잠시 후 다시 시도해 주세요.',undefined,true);
    if(calls>=cfg.aiBudget)fail(503,'AI_BUDGET_EXCEEDED','현재 AI 호출 한도에 도달했습니다.',undefined,true);
    active++;calls++;
    try{return await ai(kind,input);}finally{active--;}
  };
  const getSession=req=>{
    const token=req.headers['x-session-token'];
    if(typeof token!=='string' || !/^[a-f0-9]{64}$/.test(token))fail(401,'SESSION_REQUIRED','연습 세션을 먼저 시작해 주세요.');
    const session=sessions.get(token);
    if(!session || session.expires<=Date.now()){sessions.delete(token);fail(410,'CONTEXT_EXPIRED','세션이 만료되었습니다. 새 연습을 시작해 주세요.');}
    return session;
  };
  const find=(kind,key)=>{
    const list=repo.list(kind);
    if(!list.length)fail(503,'REFERENCE_DATA_UNAVAILABLE','검증된 참고자료가 아직 준비되지 않았습니다.');
    const item=list.find(r=>r.id===key);
    if(!item)fail(404,'RESOURCE_NOT_FOUND','선택한 자료를 찾을 수 없습니다.');
    return item;
  };
  const referenceObjects=ids=>ids.map(sid=>repo.source(sid)).filter(Boolean);
  async function body(req) {
    if((req.headers['content-type']||'').split(';')[0].trim()!=='application/json')fail(415,'UNSUPPORTED_MEDIA_TYPE','Content-Type은 application/json이어야 합니다.');
    let bytes=0;const chunks=[];
    for await(const chunk of req){bytes+=chunk.length;if(bytes>cfg.bodyLimit)fail(413,'PAYLOAD_TOO_LARGE','요청 본문 크기를 초과했습니다.');chunks.push(chunk);}
    try {return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail(400,'INVALID_JSON','올바른 JSON 객체가 필요합니다.');}
  }
  const server=createServer({maxHeaderSize:16384,requestTimeout:30000,headersTimeout:10000},async(req,res)=>{
    const requestId=randomUUID();
    res.setHeader('Content-Type','application/json; charset=utf-8');
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    const send=(status,payload)=>{if(!res.destroyed){res.writeHead(status);res.end(JSON.stringify(payload));}};
    try {
      const origin=req.headers.origin;
      if(origin && !cfg.origins.includes(origin))fail(403,'ORIGIN_DENIED','허용되지 않은 요청 출처입니다.');
      if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
      if(req.method==='OPTIONS'){
        res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
        res.setHeader('Access-Control-Allow-Headers','Content-Type,X-Session-Token,X-File-Name');res.writeHead(204);return res.end();
      }
      const forwarded=req.headers['x-forwarded-for'];
      const ip=cfg.trustProxy&&typeof forwarded==='string'&&isIP(forwarded)?forwarded:req.socket.remoteAddress || 'unknown';const now=Date.now();
      let rate=rates.get(ip);
      if(!rate || rate.until<=now){clean();if(rates.size>=10000 && !rates.has(ip))fail(503,'SERVER_BUSY','잠시 후 다시 시도해 주세요.',undefined,true);rate={count:0,until:now+60000};rates.set(ip,rate);}
      if(++rate.count>cfg.rateLimit){res.setHeader('Retry-After',Math.ceil((rate.until-now)/1000));fail(429,'RATE_LIMITED','요청 횟수가 많습니다. 잠시 후 다시 시도해 주세요.',undefined,true);}
      const url=new URL(req.url,'http://localhost');
      const path=url.pathname;
      let result;
      if(req.method==='GET' && path==='/api/health')result={status:'ok',mode:cfg.mode,dataMode:cfg.referenceMode||cfg.mode,aiProvider:cfg.aiProvider,aiMode:cfg.mode==='demo'?'demo-rule-based':cfg.aiProvider==='ollama'?'local-model':'external',documentTypes,persistentUserData:false};
      else if(req.method==='POST' && path==='/api/session'){
        const b=await body(req);fields(b,[]);clean();
        if(sessions.size>=cfg.maxSessions)fail(503,'SESSION_CAPACITY','세션 한도에 도달했습니다.',undefined,true);
        const token=randomBytes(32).toString('hex');const expires=now+cfg.ttl;
        sessions.set(token,{expires,analysis:null,questions:[],revision:0,analysisBusy:false,questionsBusy:false});
        result={sessionToken:token,expiresAt:new Date(expires).toISOString(),notice:'입력과 결과는 임시 메모리에서만 처리합니다. 데모 모드는 실제 AI가 아닙니다.'};
      } else if(req.method==='POST' && path==='/api/session/end'){
        const b=await body(req);fields(b,[]);getSession(req);sessions.delete(req.headers['x-session-token']);result={ended:true};
      } else if(req.method==='GET' && ['/api/companies','/api/jobs'].includes(path)){
        for(const k of url.searchParams.keys())if(!['q','limit','offset'].includes(k))fail(400,'INVALID_INPUT','허용되지 않은 검색 조건입니다.',k);
        const q=url.searchParams.get('q') || '';if(q.length>100)fail(400,'INVALID_INPUT','검색어는 100자 이하여야 합니다.','q');
        const integer=(key,fallback,min,max)=>{const raw=url.searchParams.get(key);if(raw===null)return fallback;if(!/^\d+$/.test(raw))fail(400,'INVALID_INPUT','정수 검색 조건이 필요합니다.',key);const n=Number(raw);if(!Number.isSafeInteger(n)||n<min||n>max)fail(400,'INVALID_INPUT','검색 범위를 벗어났습니다.',key);return n;};
        const limit=integer('limit',20,1,100),offset=integer('offset',0,0,1000000);
        const kind=path.endsWith('companies')?'companies':'jobs';
        const list=repo.list(kind);if(!list.length)fail(503,'REFERENCE_DATA_UNAVAILABLE','참고자료가 아직 준비되지 않았습니다.');
        const matches=list.filter(r=>[r.name,r.region,r.industry].some(v=>typeof v==='string'&&v.toLowerCase().includes(q.toLowerCase())));
        result={items:matches.slice(offset,offset+limit),total:matches.length,limit,offset};
      } else if(req.method==='GET' && path==='/api/signs/catalog'){
          for(const k of url.searchParams.keys())if(!['q','offset'].includes(k))fail(400,'INVALID_INPUT','허용되지 않는 검색 조건입니다.',k);
          const q=(url.searchParams.get('q')||'').trim().normalize('NFC');
          const rawOffset=url.searchParams.get('offset')||'0';
          if(q.length>100 || !/^\d{1,6}$/.test(rawOffset))fail(400,'INVALID_INPUT','검색 조건을 확인해 주세요.');
          const offset=Number(rawOffset),limit=12;
          const matches=repo.list('signs').filter(r=>[r.term,...r.keywords].some(v=>v.normalize('NFC').includes(q)));
          result={items:matches.slice(offset,offset+limit),total:matches.length,offset,limit,notice:'사전 원문 참고 자료입니다. 면접 문맥에 맞는 수어인지 별도 확인이 필요합니다.'};
      } else if(req.method==='GET' && path==='/api/signs'){
        for(const k of url.searchParams.keys())if(k!=='keyword')fail(400,'INVALID_INPUT','허용되지 않은 검색 조건입니다.',k);
        const keyword=text(url.searchParams.get('keyword'),'keyword',100);
        const list=repo.list('signs');
        if(!list.length && cfg.mode==='live')fail(503,'REFERENCE_DATA_UNAVAILABLE','검증된 수어 자료가 아직 준비되지 않았습니다.');
        const normalized=keyword.normalize('NFC');
        const words=normalized.split(/[\s·,，/()]+/u).filter(Boolean);
        const exact=list.filter(r=>[r.term,...r.keywords].some(v=>v.normalize('NFC')===normalized));
        const items=(exact.length?exact:list.filter(r=>[r.term,...r.keywords].some(v=>words.includes(v.normalize('NFC'))))).slice(0,20);
        result={items,matchStatus:items.length?'candidate':'not_found',notice:'문자열 검색 후보이며 질문 전체 번역이나 문맥상 의미 일치를 보장하지 않습니다.'};
      } else if(req.method==='POST' && path==='/api/documents/extract'){
        getSession(req);
        if(extracting>=2)fail(503,'DOCUMENT_BUSY','다른 문서를 처리 중입니다. 잠시 후 다시 시도해 주세요.',undefined,true);
        if((req.headers['content-type']||'').split(';')[0]!=='application/octet-stream')fail(415,'UNSUPPORTED_MEDIA_TYPE','파일 바이너리 본문이 필요합니다.');
        let filename;
        try {filename=decodeURIComponent(req.headers['x-file-name']||'');}catch{fail(400,'INVALID_FILE_NAME','파일 이름을 확인해 주세요.');}
        const extension=filename.split('.').pop()?.toLowerCase();
        if(filename.length>255 || !documentTypes.includes(extension))fail(415,'UNSUPPORTED_FILE_TYPE','PDF, HWP, HWPX, DOCX, TXT 파일을 선택해 주세요.');
        extracting++;
        try {
          let size=0;const chunks=[];
          for await(const chunk of req){size+=chunk.length;if(size>cfg.uploadLimit)fail(413,'FILE_TOO_LARGE','파일은 최대 5MB까지 가능합니다.');chunks.push(chunk);}
          if(!size)fail(400,'EMPTY_FILE','빈 파일은 사용할 수 없습니다.');
          result=await extractDocument(Buffer.concat(chunks),extension,cfg.python);
          getSession(req);
        }finally{extracting--;}
      } else if(req.method==='POST' && path==='/api/resume/analyze'){
        const s=getSession(req),b=await body(req);fields(b,['resumeText']);const resumeText=text(b.resumeText,'resumeText',10000);
        if(s.analysisBusy || s.questionsBusy)fail(409,'CONTEXT_BUSY','현재 요청이 완료된 뒤 다시 시도해 주세요.',undefined,true);
        s.analysisBusy=true;s.analysis=null;s.questions=[];s.revision++;
        try {const output=await gate('analyze',{resumeText});getSession(req);s.analysis={id:randomUUID(),...output};result={analysisId:s.analysis.id,...output};}finally{s.analysisBusy=false;}
      } else if(req.method==='POST' && path==='/api/interview/questions'){
        const s=getSession(req),b=await body(req);fields(b,['companyId','jobId','analysisId']);
        const company=find('companies',id(b.companyId,'companyId')),job=find('jobs',id(b.jobId,'jobId'));
        const analysisId=id(b.analysisId,'analysisId');
        if(!s.analysis || s.analysis.id!==analysisId)fail(404,'RESOURCE_NOT_FOUND','현재 세션의 분석 결과를 찾을 수 없습니다.');
        if(s.analysisBusy || s.questionsBusy)fail(409,'CONTEXT_BUSY','현재 요청이 완료된 뒤 다시 시도해 주세요.',undefined,true);
        const units=repo.units(job.id);if(!units.length)fail(503,'REFERENCE_DATA_UNAVAILABLE','직무 참고자료가 준비되지 않았습니다.');
        const referenceIds=[...new Set([company.sourceId,job.sourceId,...units.map(u=>u.sourceId)])];
        s.questionsBusy=true;s.questions=[];s.revision++;
        try {
          const output=await gate('questions',{company,job,units,analysis:s.analysis,referenceIds});
          getSession(req);
          s.questions=output.questions.map(q=>({...q,questionId:randomUUID(),jobId:job.id,companyId:company.id}));
          result={questions:s.questions.map(q=>({...q,references:referenceObjects(q.referenceIds)}))};
        }finally{s.questionsBusy=false;}
      } else if(req.method==='POST' && path==='/api/interview/feedback'){
        const s=getSession(req),b=await body(req);fields(b,['questionId','answerText']);
        const questionId=id(b.questionId,'questionId'),answerText=text(b.answerText,'answerText',5000);
        const question=s.questions.find(q=>q.questionId===questionId);
        if(!question)fail(404,'RESOURCE_NOT_FOUND','현재 세션의 질문을 찾을 수 없습니다.');
        if(s.analysisBusy || s.questionsBusy)fail(409,'CONTEXT_BUSY','질문 갱신이 끝난 뒤 다시 시도해 주세요.',undefined,true);
        const revision=s.revision;
        const output=await gate('feedback',{questionText:question.text,answerText,job:repo.get('jobs',question.jobId),units:repo.units(question.jobId),referenceIds:question.referenceIds});
        getSession(req);
        if(revision!==s.revision)fail(409,'CONTEXT_CHANGED','질문이 변경되었습니다. 현재 질문으로 다시 답변해 주세요.');
        result={strengths:output.strengths,improvements:output.improvements,suggestion:output.suggestion,references:referenceObjects(output.referenceIds)};
      } else fail(404,'ROUTE_NOT_FOUND','해당 경로 또는 메서드를 찾을 수 없습니다.');
      send(200,{data:result,meta:{mode:cfg.mode,isDemo:cfg.mode==='demo',requestId}});
    } catch(e) {
      const known=e instanceof ApiError;
      send(known?e.status:500,{error:{code:known?e.code:'INTERNAL_ERROR',message:known?e.message:'처리 중 오류가 발생했습니다.',...(known&&e.field?{field:e.field}:{}),retryable:known?e.retryable:false,requestId}});
    }
  });
  server.maxHeadersCount=50;
  return {server,db,close:async()=>{clearInterval(timer);server.closeIdleConnections();if(server.listening)await new Promise(resolve=>server.close(resolve));sessions.clear();db.close();}};
}
