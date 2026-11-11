// 가상 입력만 사용하는 로컬 모델 시험. DB를 변경하거나 외부 공급자를 호출하지 않습니다.
import {createAI} from '../src/ai.js';
import {config} from '../src/common.js';
import {cases} from '../fixtures/ai-cases.js';

if (!process.argv.includes('--run')) {
  console.log('실제 로컬 모델 시험은 AI_PROVIDER=ollama, AI_MODEL 설정 후 --run을 붙이세요. 외부 API는 지원하지 않습니다.');
} else {
  try {
    const cfg={...config(),mode:'live'};
    if(cfg.aiProvider!=='ollama')throw new Error('AI_PROVIDER=ollama 설정이 필요합니다.');
    const ai=createAI(cfg);
    const report={executedAt:new Date().toISOString(),mode:'local-model-synthetic-input',model:cfg.aiModel,source:'team-authored synthetic resumes; no verified company/NCS claims',cases:[]};
    for(const item of cases){
      const started=Date.now();
      try {
        const analysis=await ai('analyze',{resumeText:item.resumeText});
        const questions=await ai('questions',{company:{name:'가상기업'},job:{name:'가상 연습 직무'},units:[],analysis,referenceIds:[]});
        report.cases.push({id:item.id,input:item.resumeText,analysis,...questions,contractValid:true,semanticReview:'pending',elapsedMs:Date.now()-started});
      } catch(e) { report.cases.push({id:item.id,contractValid:false,errorCode:e.code||'LOCAL_MODEL_ERROR',elapsedMs:Date.now()-started}); }
    }
    console.log(JSON.stringify(report,null,2));
    if(report.cases.some(c=>!c.contractValid))process.exitCode=1;
  } catch(e) { console.error(e.code||'LOCAL_AI_NOT_CONFIGURED', '로컬 모델 설정과 실행 상태를 확인하세요.');process.exitCode=1; }
}
