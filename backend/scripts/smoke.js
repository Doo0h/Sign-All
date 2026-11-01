// 서버를 별도 실행한 뒤 npm run smoke. 출력에 세션 토큰·사용자 원문을 남기지 않습니다.
const base=process.argv[2] || 'http://127.0.0.1:3001';
async function call(path,body,token){
 const res=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(token?{'X-Session-Token':token}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
 const json=await res.json();if(!res.ok)throw new Error(`${path}: ${json.error?.code || res.status}`);return json.data;
}
try{
 const health=await call('/api/health');if(health.mode!=='demo')throw new Error('이 시연 스크립트는 demo 모드 전용입니다.');
 const {sessionToken}=await call('/api/session',{});
 try{
  const c=await call('/api/companies'),j=await call('/api/jobs');
  const a=await call('/api/resume/analyze',{resumeText:'가상 테스트: 팀 프로젝트의 오류를 조사하고 수정했습니다.'},sessionToken);
  const q=await call('/api/interview/questions',{companyId:c.items[0].id,jobId:j.items[0].id,analysisId:a.analysisId},sessionToken);
  const s=await call('/api/signs?keyword='+encodeURIComponent('문제 해결'));
  const f=await call('/api/interview/feedback',{questionId:q.questions[0].questionId,answerText:'원인을 찾고 수정한 뒤 재검증했습니다.'},sessionToken);
  console.log(JSON.stringify({mode:health.mode,companies:c.total,jobs:j.total,analysisCompleted:!!a.analysisId,questions:q.questions.length,signMatch:s.matchStatus,feedbackCompleted:Array.isArray(f.improvements)},null,2));
 }finally{await call('/api/session/end',{},sessionToken);}
}catch(e){console.error(e.message);process.exitCode=1;}
