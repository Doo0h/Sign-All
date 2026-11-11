import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {fail,ApiError} from './common.js';

export const documentTypes = ['pdf','hwp','hwpx','docx','txt'];
export function extractDocument(buffer, extension, python='python') {
  if (!documentTypes.includes(extension)) fail(415,'UNSUPPORTED_FILE_TYPE','PDF, HWP, HWPX, DOCX, TXT 파일을 선택해 주세요.');
  return new Promise((resolve,reject) => {
    const parserEnv={PATH:process.env.PATH,PYTHONIOENCODING:'utf-8',PYTHONDONTWRITEBYTECODE:'1',LANG:'C.UTF-8'};
    for(const key of ['SystemRoot','TEMP','TMP'])if(process.env[key])parserEnv[key]=process.env[key];
    const child=spawn(python,[fileURLToPath(new URL('../scripts/extract-document.py',import.meta.url)),extension],{windowsHide:true,stdio:['pipe','pipe','pipe'],env:parserEnv});
    let output='', done=false;
    const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);error?reject(error):resolve(value);};
    const timer=setTimeout(()=>{child.kill();finish(new ApiError(422,'DOCUMENT_TIMEOUT','문서 처리 시간이 초과되었습니다. 텍스트로 붙여 넣어 주세요.'));},15000);
    child.on('error',()=>finish(new ApiError(503,'DOCUMENT_ENGINE_UNAVAILABLE','문서 추출 기능을 사용할 수 없습니다. 텍스트로 붙여 넣어 주세요.')));
    child.stdin.on('error',()=>{});
    child.stderr.resume(); // 원문이나 내부 경로를 로그로 남기지 않는다.
    child.stdout.on('data',chunk=>{output+=chunk.toString('utf8');if(output.length>200000){child.kill();finish(new ApiError(422,'DOCUMENT_OUTPUT_LIMIT','문서가 너무 복잡합니다. 텍스트로 붙여 넣어 주세요.'));}});
    child.on('close',code=>{
      try {
        const result=JSON.parse(output);
        if(code!==0 || typeof result.text!=='string')throw new Error(result.error);
        finish(null,{text:result.text,truncated:!!result.truncated,warnings:result.warnings||[],format:extension,stored:false});
      } catch { finish(new ApiError(422,'DOCUMENT_UNREADABLE','텍스트를 추출하지 못했습니다. 암호·배포용 문서, 스캔 PDF, 손상 파일인지 확인하고 텍스트로 붙여 넣어 주세요.')); }
    });
    child.stdin.end(buffer);
  });
}
