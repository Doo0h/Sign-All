import {fail} from './common.js';
const types=[['A2001','공기업(시장형)'],['A2002','공기업(준시장형)'],['A2003','준정부기관(기금관리형)'],['A2004','준정부기관(위탁집행형)'],['A2005','기타공공기관']];
const endDate=s=>{const m=s.match(/\b(\d{2}|\d{4})\.(\d{2})\.(\d{2})\b/);return m?`${m[1].length===2?'20'+m[1]:m[1]}-${m[2]}-${m[3]}T23:59:59+09:00`:null;};
export function publicPostings(request,now,plainText,classify){
 async function list(){
   const groups=await Promise.all(types.map(async([code,label])=>{
     const html=await request('https://job.alio.go.kr/recruit.do?ing=2&org_type='+code+'&pageNo=1',true);
     if(!html.includes('name="org_type"'))throw Error('PUBLIC_LIST_FORMAT');
     return [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].flatMap(([,row])=>{
       const link=row.match(/href="\/recruitview\.do\?idx=(\d+)"[^>]*>([\s\S]*?)<\/a>/i);if(!link)return [];
       const cells=[...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m=>plainText(m[1]));
       if(cells.length<9||!cells.at(-1).includes('진행중'))return [];
       const deadline=endDate(cells[7]);if(!deadline||Date.parse(deadline)<=now())return [];
       const title=plainText(link[2]);
       return [{id:'alio:'+link[1],board:'alio',companyName:cells[3],title,location:cells[4]||'원문 확인',category:classify(title),experience:/신입|인턴/.test(title)?'신입·인턴 명시':/경력/.test(title)?'경력 표현 포함':'원문 확인',sourceUrl:'https://job.alio.go.kr/recruitview.do?idx='+link[1],deadline,checkedAt:new Date(now()).toISOString(),updatedAt:null,organizationType:label,enterpriseType:code==='A2001'||code==='A2002'?'public-enterprise':'public-agency'}];
     });
   }));return [...new Map(groups.flat().map(p=>[p.id,p])).values()];
 }
 return {list,async detail(id){
   const p=(await list()).find(p=>p.id==='alio:'+id);if(!p)fail(410,'POSTING_UNAVAILABLE','공공기관 최신 목록에서 공고를 다시 선택해 주세요.');
   const html=await request(p.sourceUrl,true),period=html.match(/<th>채용기간<\/th>\s*<td>([\s\S]*?)<\/td>/);
   const dates=period?.[1].split('~'),deadline=dates?.length===2?endDate(dates[1]):null;
   if(!deadline||Date.parse(deadline)<=now())fail(410,'POSTING_UNAVAILABLE','마감된 공고이거나 채용기간을 확인할 수 없습니다.');
   const start=html.indexOf('<h4>응시자격</h4>'),end=html.indexOf('id="tab-2"',start);
   if(start<0||end<0)fail(503,'POSTINGS_UNAVAILABLE','공공기관 상세 형식이 변경되었습니다. 원문을 확인해 주세요.');
   return {...p,deadline,description:plainText(html.slice(start,html.lastIndexOf('<',end)))};
 }};
}
