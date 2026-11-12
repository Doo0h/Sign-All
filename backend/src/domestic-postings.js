import {fail} from './common.js';
const kst=value=>{if(!value)return null;const iso=String(value).replace(/\./g,'-').replace(' ','T');const time=Date.parse(/(?:Z|[+-]\d\d:\d\d)$/.test(iso)?iso:iso+'+09:00');return Number.isFinite(time)?new Date(time).toISOString():null;};
export function domesticPostings(request,now,plainText,classify){
 function kakao(r){
   if(!/^[PS]-\d+$/.test(r.realId||'')||r.privateFlag||r.closeFlag||r.useFlag!==true||r.statusCode!=='PROGRESS')return null;
   const deadline=kst(r.resumeSubmissionEndDatetime||r.endDate);if(deadline&&Date.parse(deadline)<=now())return null;
   const title=String(r.jobOfferTitle||'');if(!title)return null;
   return {id:'kakao:'+r.realId,board:'kakao',companyName:r.companyName||'카카오',title,location:r.locationName||'근무지 원문 확인',category:classify(title),experience:/신입|인턴/.test(title+' '+r.employeeTypeName)?'신입·인턴 명시':/경력/.test(title)?'경력 표현 포함':'원문 확인',sourceUrl:'https://careers.kakao.com/jobs/'+r.realId,deadline,checkedAt:new Date(now()).toISOString(),updatedAt:kst(r.uptDate),description:plainText([r.introduction,r.workContentDesc,r.qualification].filter(Boolean).join('\n'))};
 }
 function naver(r){
   const deadline=kst(r.endYmdTime),start=kst(r.staYmdTime);
   if(!Number.isSafeInteger(r.annoId)||!String(r.stateCdNm||'').startsWith('채용진행중')||!deadline||Date.parse(deadline)<=now()||start&&Date.parse(start)>now())return null;
   return {id:'naver:'+r.annoId,board:'naver',companyName:r.sysCompanyCdNm||'NAVER',title:r.annoSubject,location:'근무지 원문 확인',category:classify(r.annoSubject+' '+r.subJobCdNm),experience:r.entTypeCdNm==='신입'?'신입·인턴 명시':r.entTypeCdNm==='경력'?'경력 표현 포함':'원문 확인',sourceUrl:'https://recruit.navercorp.com/rcrt/view.do?annoId='+r.annoId,deadline,checkedAt:new Date(now()).toISOString(),updatedAt:null,publishedAt:start};
 }
 async function naverList(){const r=await request('https://recruit.navercorp.com/rcrt/loadJobList.do');if(!Array.isArray(r.list))throw Error('INVALID_LIST');return r.list.map(naver).filter(Boolean);}
 return {
   async list(board){
     if(board==='naver')return naverList();
     const rows=await Promise.all(['TECHNOLOGY','BUSINESS_SERVICES','DESIGN','STAFF'].map(async part=>{
       const url='https://careers.kakao.com/public/api/job-list?part='+part+'&page=';
       const first=await request(url+'1');if(!Array.isArray(first.jobList)||!Number.isInteger(first.totalPage)||first.totalPage>10)throw Error('INVALID_LIST');
       const all=[...first.jobList];for(let page=2;page<=first.totalPage;page++){const next=await request(url+page);if(!Array.isArray(next.jobList))throw Error('INVALID_LIST');all.push(...next.jobList);}
       return all.map(kakao).filter(Boolean).map(({description,...p})=>p);
     }));return [...new Map(rows.flat().map(p=>[p.id,p])).values()];
   },
   async detail(board,id){
     if(board==='kakao'){
       const r=await request('https://careers.kakao.com/public/api/job-detail?id='+encodeURIComponent(id)+'&isAvailable=true');
       const p=kakao(r);if(!p||p.id!=='kakao:'+id)fail(410,'POSTING_UNAVAILABLE','공고가 마감되었거나 더 이상 제공되지 않습니다.');return p;
     }
     const p=(await naverList()).find(p=>p.id==='naver:'+id);if(!p)fail(410,'POSTING_UNAVAILABLE','공고가 마감되었거나 더 이상 제공되지 않습니다.');
     const html=await request(p.sourceUrl,true),start=html.indexOf('class="detail_wrap"'),end=html.indexOf('class="half_detail_box"',start);
     if(start<0||end<0)fail(503,'POSTINGS_UNAVAILABLE','공고 상세 형식이 변경되었습니다. 원문을 확인해 주세요.');
     const block=html.slice(start,html.lastIndexOf('<',end));p.description=plainText(block.slice(block.indexOf('>')+1));
     const structured=html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
     if(structured)try{const j=JSON.parse(structured[1]);p.location=j.jobLocation?.address?.streetAddress||p.location;}catch{}
     return p;
   }
 };
}
