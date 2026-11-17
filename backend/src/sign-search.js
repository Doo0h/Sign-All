// Curated explanations and related search concepts, not sign-language translations.
const entries = [
  {aliases:['전력IT','전력정보기술'],term:'전력 IT',description:'전기를 생산·공급·관리하는 일에 정보기술을 활용하는 분야입니다.',relatedTerms:['전기','정보통신기술']},
  {aliases:['보안리스크','보안위험'],term:'보안 리스크',description:'정보가 유출되거나 시스템이 공격받아 피해가 생길 가능성을 뜻합니다.',relatedTerms:['보안','위험']},
  {aliases:['개인정보보호'],term:'개인정보 보호',description:'개인을 알아볼 수 있는 정보가 허락 없이 쓰이거나 유출되지 않도록 지키는 일입니다.',relatedTerms:['개인정보','보호']},
  {aliases:['장애대응','시스템장애대응','서비스장애대응'],term:'장애 대응',description:'여기서는 IT 서비스가 정상 작동하지 않을 때 원인을 확인하고 복구하는 일을 뜻합니다. 아래 자료는 관련 개념의 참고 자료입니다.',relatedTerms:['고장','문제','해결'],unavailableTerms:['장애 대응 전체 표현']},
  {aliases:['정보기술','IT','ICT'],term:'정보기술',description:'정보를 처리하고 전달하는 기술을 뜻합니다. 정보통신기술은 관련 개념의 참고 자료입니다.',relatedTerms:['정보통신기술']},
];
const key = s => s.normalize('NFC').replace(/[\s·,，/()_-]+/gu,'').toLowerCase();
export function searchSigns(list, keyword) {
  const normalized=keyword.normalize('NFC');
  const glossary=entries.find(e=>e.aliases.some(a=>key(a)===key(normalized)));
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
