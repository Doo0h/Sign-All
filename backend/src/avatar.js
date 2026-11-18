import {readFileSync} from 'node:fs';
const catalog=JSON.parse(readFileSync(new URL('./avatar-catalog.json',import.meta.url),'utf8'));
export function avatarForQuestion(question, entries=catalog) {
  // Exact reviewed wording: keyword overlap must never select a different sentence.
  const entry=entries.find(e=>e.questionText===question.text && e.language==='ksl' && e.status==='reviewed' &&
    e.reviewedBy?.trim() && e.reviewedAt?.trim() && e.rightsConfirmed===true && e.source?.trim() && e.version?.trim() &&
    /^\/avatars\/[a-z0-9_-]+\.glb$/.test(e.assetUrl||'') && Array.isArray(e.clips) && e.clips.length>0 && e.clips.every(c=>typeof c==='string'&&c.trim()));
  if(!entry)return {status:'pending',questionId:question.questionId,message:'이 질문의 한국수어 동작 자료를 준비 중입니다. 질문 텍스트와 아래 단어별 수어 사전을 이용해 주세요.'};
  return {status:'ready',questionId:question.questionId,questionText:question.text,assetUrl:entry.assetUrl,clips:entry.clips,version:entry.version,source:entry.source,reviewedAt:entry.reviewedAt};
}
