import {fail} from './common.js';
import {domesticPostings} from './domestic-postings.js';

// Fixed public GET endpoints only. No application submission or user data transmission.
export const boards=[['kakao','카카오'],['naver','NAVER'],['coupang','쿠팡'],['moloco','몰로코'],['sendbird','센드버드'],['riotgames','라이엇게임즈'],['fender','Fender'],['2k','2K']];
const categories=[['보안',/security|보안/i],['데이터·AI',/data|machine learning|scientist|\bAI\b|데이터|머신러닝/i],['디자인',/design|디자인|designer/i],['개발·IT',/engineer|software|developer|개발|엔지니어|IT /i],['마케팅',/marketing|마케팅|brand|브랜드/i],['영업·사업',/sales|business|account|영업|사업/i],['인사',/recruit|talent|human resources|인사|채용|people/i],['재무·회계',/finance|financial|accounting|회계|재무/i],['물류·운영',/logistic|operations|warehouse|물류|운영|배송|센터/i],['기획·관리',/product|program|project|manager|기획|관리/i],['고객지원',/support|customer|고객|상담/i],['생산·품질',/quality|manufactur|품질|생산|\bQA\b/i]];
const clean=value=>String(value||'').slice(0,1000);
function safeUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}}
export function plainText(value){
 let s=String(value||'');
 for(let i=0;i<2;i++)s=s.replace(/&(?:amp|lt|gt|quot|apos|nbsp);|&#(x[0-9a-f]+|\d+);/gi,(m,n)=>{if(n){const cp=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return cp>0&&cp<=0x10ffff?String.fromCodePoint(cp):' ';}return ({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '})[m.toLowerCase()]||' ';});
 return s.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,6500);
}
function normalize(raw,board,name,now){
 if(!Number.isSafeInteger(raw.id)||!raw.internal_job_id||!raw.title||!/Korea|Seoul|서울|한국|Pangyo|Busan|판교|부산/i.test(raw.location?.name||''))return null;
 if(/expression of interest|talent pool|인재풀|채용관심등록/i.test(raw.title))return null;
 const url=safeUrl(raw.absolute_url);if(!url)return null;
 const deadline=raw.application_deadline&&Number.isFinite(Date.parse(raw.application_deadline))?raw.application_deadline:null;
 if(deadline&&Date.parse(deadline)<=now)return null;
 const title=clean(raw.title);
 return {id:`${board}:${raw.id}`,board,companyName:name,title,location:clean(raw.location.name),category:categories.find(([,re])=>re.test(title))?.[0]||'기타',experience:/intern|인턴|신입|new grad/i.test(title)?'신입·인턴 명시':/senior|staff|lead|경력|시니어/i.test(title)?'경력 표현 포함':'원문 확인',sourceUrl:url,deadline,checkedAt:new Date(now).toISOString(),updatedAt:raw.updated_at||null};
}
export function createPostings({fetcher=fetch,now=Date.now,providers=boards}={}){
 let cache=null,pending=null;const ttl=15*60*1000;
 async function requestUrl(url,asText=false){
   const r=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(15000)});
   if(r.status===404)fail(410,'POSTING_UNAVAILABLE','공고가 종료되었거나 더 이상 제공되지 않습니다. 목록에서 다시 선택해 주세요.');
   if(!r.ok)throw new Error('PROVIDER_UNAVAILABLE');
   let length=0;const chunks=[];
   for await(const chunk of r.body){length+=chunk.length;if(length>4*1024*1024)throw new Error('RESPONSE_TOO_LARGE');chunks.push(chunk);}
   const value=Buffer.concat(chunks).toString('utf8');return asText?value:JSON.parse(value);
 }
 const request=path=>requestUrl('https://boards-api.greenhouse.io/v1/boards/'+path);
 const domestic=domesticPostings(requestUrl,now,plainText,title=>categories.find(([,re])=>re.test(title))?.[0]||'기타');
 async function snapshot(){
   if(cache&&now()-cache.time<ttl)return cache;
   if(pending)return pending;
   pending=(async()=>{
     const results=await Promise.allSettled(providers.map(async([board,name])=>{
       if(['kakao','naver'].includes(board))return domestic.list(board);
       const r=await request(board+'/jobs');if(!Array.isArray(r.jobs))throw new Error('INVALID_LIST');
       return r.jobs.map(j=>normalize(j,board,name,now())).filter(Boolean);
     }));
     const failedBoards=results.flatMap((r,i)=>r.status==='rejected'?[providers[i][1]]:[]);
     if(failedBoards.length===providers.length)fail(503,'POSTINGS_UNAVAILABLE','채용 공고를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',undefined,true);
     cache={time:now(),items:results.flatMap(r=>r.status==='fulfilled'?r.value:[]),failedBoards};return cache;
   })().finally(()=>{pending=null;});return pending;
 }
 return {
   async list(params){
     for(const k of params.keys())if(!['q','company','category','region','experience','offset','sort'].includes(k))fail(400,'INVALID_INPUT','검색 조건을 확인해 주세요.');
     const sort=params.get('sort')||'default';if(!['default','deadline','recent'].includes(sort))fail(400,'INVALID_INPUT','정렬 조건을 확인해 주세요.');
     const filters=Object.fromEntries(['q','company','category','region','experience'].map(k=>[k,(params.get(k)||'').trim()]));
     if(Object.values(filters).some(v=>v.length>100)||!/^\d{1,6}$/.test(params.get('offset')||'0'))fail(400,'INVALID_INPUT','검색 조건을 확인해 주세요.');
     const s=await snapshot(),offset=Number(params.get('offset')||0),limit=12;
     const all=s.items.filter(p=>!p.deadline||Date.parse(p.deadline)>now());
     const items=all.filter(p=>(!filters.q||`${p.title} ${p.companyName}`.toLowerCase().includes(filters.q.toLowerCase()))&&(!filters.company||p.board===filters.company)&&(!filters.category||p.category===filters.category)&&(!filters.region||p.location.toLowerCase().includes(filters.region.toLowerCase()))&&(!filters.experience||p.experience===filters.experience));
     if(sort==='deadline')items.sort((a,b)=>(a.deadline?Date.parse(a.deadline):Infinity)-(b.deadline?Date.parse(b.deadline):Infinity));
     if(sort==='recent')items.sort((a,b)=>(Date.parse(b.updatedAt)||0)-(Date.parse(a.updatedAt)||0));
     return {items:items.slice(offset,offset+limit),total:items.length,offset,limit,checkedAt:new Date(s.time).toISOString(),failedBoards:s.failedBoards,companies:providers.map(([id,name])=>({id,name})),categories:[...new Set(all.map(p=>p.category))].sort(),notice:'공식 채용 게시판에 게시된 한국 근무 공고 · 최대 15분 간격 갱신. 마감일 미제공 공고는 원문 확인. 직무·경력 필터는 공고 제목 기반 분류입니다.'};
   },
   async detail(key){
     if(typeof key!=='string'||!/^[-a-z0-9]+:(?:[PS]-)?\d+$/.test(key))fail(400,'INVALID_INPUT','공고 식별자를 확인해 주세요.');
     const [board,id]=key.split(':'),provider=providers.find(p=>p[0]===board);if(!provider)fail(400,'INVALID_INPUT','지원하지 않는 채용 출처입니다.');
     if(['kakao','naver'].includes(board))try{return await domestic.detail(board,id);}catch(e){if(e.code)throw e;fail(503,'POSTINGS_UNAVAILABLE','공고 원문을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.',undefined,true);}
     let raw;try{raw=await request(board+'/jobs/'+id);}catch(e){if(e.code)throw e;fail(503,'POSTINGS_UNAVAILABLE','공고 원문을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.',undefined,true);}
     const p=normalize(raw,...provider,now());if(!p||String(raw.id)!==id)fail(410,'POSTING_UNAVAILABLE','진행 중인 공고를 다시 선택해 주세요.');
     return {...p,description:plainText(raw.content)};
   }
 };
}
