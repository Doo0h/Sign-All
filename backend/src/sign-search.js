// Curated explanations and related search concepts, not sign-language translations.
const entries = [
  {aliases:['도로망','도로네트워크','도로네트웍'],term:'도로망',description:'여러 도로가 서로 이어져 이루는 체계를 뜻합니다. 도로와 연결은 이해를 돕는 관련 개념입니다.',relatedTerms:['도로','연결']},
  {aliases:['CCTV','씨씨티비','시시티브이','씨씨티브이','폐쇄회로TV','폐쇄회로텔레비전','감시카메라','방범카메라','보안카메라'],term:'CCTV',description:'특정 장소의 모습을 카메라로 촬영해 확인하거나 기록하는 장치입니다. 카메라·촬영·감시는 관련 개념이며 CCTV 전체의 수어 번역은 아닙니다.',relatedTerms:['카메라','촬영','감시']},
  {aliases:['영상관제','CCTV관제'],term:'영상 관제',description:'영상을 살펴 상황을 확인하고 필요한 조치를 하는 업무입니다. 아래는 관련 개념의 참고 자료입니다.',relatedTerms:['감시','촬영','안전']},
  {aliases:['교통관제'],term:'교통 관제',description:'교통 상황을 살펴 안전한 이동을 위해 필요한 조치를 하는 업무입니다.',relatedTerms:['감시','교통','안전']},
  {aliases:['교통망','도로교통','교통시스템'],term:'교통 체계',description:'사람과 차량이 이동하는 도로와 교통의 연결 체계를 이해하기 위한 관련 자료입니다.',relatedTerms:['교통','도로','연결']},
  {aliases:['통신망','네트워크','네트웍'],term:'통신망',description:'정보를 주고받을 수 있도록 기기들이 연결된 체계를 뜻합니다.',relatedTerms:['통신','연결']},
  {aliases:['교통안전','도로안전'],term:'교통·도로 안전',description:'도로에서 사고나 위험을 예방하고 안전하게 이동하는 것과 관련된 표현입니다.',relatedTerms:['교통','도로','안전','위험']},
  {aliases:['정보보안','사이버보안','네트워크보안'],term:'정보 보안',description:'정보와 시스템을 허가되지 않은 접근이나 유출로부터 보호하는 일입니다.',relatedTerms:['보안','보호','통신']},
  {aliases:['전력IT','전력정보기술'],term:'전력 IT',description:'전기를 생산·공급·관리하는 일에 정보기술을 활용하는 분야입니다.',relatedTerms:['전기','정보통신기술']},
  {aliases:['보안리스크','보안위험'],term:'보안 리스크',description:'정보가 유출되거나 시스템이 공격받아 피해가 생길 가능성을 뜻합니다.',relatedTerms:['보안','위험']},
  {aliases:['개인정보보호'],term:'개인정보 보호',description:'개인을 알아볼 수 있는 정보가 허락 없이 쓰이거나 유출되지 않도록 지키는 일입니다.',relatedTerms:['개인정보','보호']},
  {aliases:['장애대응','시스템장애대응','서비스장애대응'],term:'장애 대응',description:'여기서는 IT 서비스가 정상 작동하지 않을 때 원인을 확인하고 복구하는 일을 뜻합니다. 아래 자료는 관련 개념의 참고 자료입니다.',relatedTerms:['고장','문제','해결'],unavailableTerms:['장애 대응 전체 표현']},
  {aliases:['정보기술','IT','ICT'],term:'정보기술',description:'정보를 처리하고 전달하는 기술을 뜻합니다. 정보통신기술은 관련 개념의 참고 자료입니다.',relatedTerms:['정보통신기술']},
];
const key = s => s.normalize('NFKC').replace(/[\s·,，/()_.-]+/gu,'').toLowerCase();
const suffix=/^(관리|운영|구축|설계|점검|모니터링|유지보수|분석|개선|확장|연계){1,2}$/u;
function glossaryFor(value) {
 const input=key(value);
 return entries.find(e=>e.aliases.some(a=>key(a)===input)) || entries.find(e=>e.aliases.some(a=>input.startsWith(key(a))&&suffix.test(input.slice(key(a).length))));
}
// Extract words actually present in the question; do not invent synonyms with AI.
export function questionSignKeywords(list, text, suggested=[]) {
 const normalized=text.normalize('NFKC');
 const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const candidates=[...suggested,...entries.flatMap(e=>e.aliases),...list.flatMap(r=>[r.term,...r.keywords])];
 const found=[];
 for(const word of new Set(candidates)) {
   const pattern=word.normalize('NFKC').split(/\s+/u).map(escape).join('\\s*');
   const re=new RegExp('(^|[^가-힣a-zA-Z0-9])('+pattern+')(?=(?:은|는|이|가|을|를|에|에서|에게|의|와|과|로|으로|도|만|이나|나|부터|까지|하고|에서는|에는|으로는|로는)?(?:[^가-힣a-zA-Z0-9]|$))','giu');
   const m=re.exec(normalized);if(m)found.push({word:m[2],start:m.index+m[1].length,end:m.index+m[1].length+m[2].length});
 }
 return found.filter(a=>!found.some(b=>b.start<=a.start&&b.end>=a.end&&b.end-b.start>a.end-a.start))
   .sort((a,b)=>a.start-b.start).map(x=>x.word).filter((v,i,a)=>a.indexOf(v)===i).slice(0,20);
}
export function searchSigns(list, keyword) {
  const normalized=keyword.normalize('NFC');
  const glossary=glossaryFor(normalized);
  const matches=term=>list.filter(r=>[r.term,...r.keywords].some(v=>v.normalize('NFC')===term));
  const exact=matches(normalized);
  const terms=glossary?.relatedTerms || normalized.split(/[\s·,，/()]+/u).filter(Boolean);
  const groups=terms.map(term=>({term,items:matches(term)}));
  const items=(glossary?groups.flatMap(g=>g.items):exact.length?exact:groups.flatMap(g=>g.items));
  const unique=[...new Map(items.map(r=>[r.id,r])).values()].slice(0,20);
  return {items:unique,matchStatus:unique.length?'candidate':'not_found',
    ...(glossary?{explanation:{term:glossary.term,description:glossary.description,relatedTerms:terms},missingTerms:[...groups.filter(g=>!g.items.length).map(g=>g.term),...(glossary.unavailableTerms||[])]}:{}),
    notice:glossary?'관련 단어별 참고 자료이며 전문 용어 전체의 수어 번역이 아닙니다. 질문 문맥과 맞는지 원문에서 확인하세요.':'문자열 검색 후보이며 질문 전체 번역이나 문맥상 의미 일치를 보장하지 않습니다.'};
}
