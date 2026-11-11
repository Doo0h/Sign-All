import test from 'node:test';
import assert from 'node:assert/strict';
import {createAI,validateAI} from '../src/ai.js';
import {config} from '../src/common.js';

const local={...config({}),mode:'live',aiProvider:'ollama',aiModel:'installed-local-model'};
test('local Ollama requests JSON without transmitting an API key',async()=>{
  let seen;
  const ai=createAI({...local,aiKey:'must-not-be-sent'},async(url,opts)=>{
    seen={url,opts};
    return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({summary:'가상 입력',keywords:[],competencies:[]})}}]}));
  });
  assert.equal((await ai('analyze',{resumeText:'가상 입력'})).summary,'가상 입력');
  assert.equal(seen.url,'http://127.0.0.1:11434/v1/chat/completions');
  assert.equal(seen.opts.headers.Authorization,undefined);
  assert.deepEqual(JSON.parse(seen.opts.body).response_format,{type:'json_object'});
});
test('local provider cannot target LAN, remote URLs, cloud tags or arbitrary paths',()=>{
  for (const aiUrl of ['http://192.168.0.2:11434/v1/chat/completions','http://localhost:11434/v1/chat/completions','https://provider.example/v1/chat/completions','http://127.0.0.1:11434/api/pull','http://127.0.0.1:11434/v1/chat/completions?key=x'])
    assert.throws(()=>createAI({...local,aiUrl}));
  assert.throws(()=>createAI({...local,aiModel:'model:cloud'}));
  assert.throws(()=>createAI({...local,aiModel:''}));
  assert.throws(()=>config({AI_PROVIDER:'unknown'}));
});
test('external provider retains HTTPS and key requirements',()=>{
  assert.throws(()=>createAI({...local,aiProvider:'external',aiUrl:'http://127.0.0.1:11434/v1/chat/completions'}));
  assert.throws(()=>createAI({...local,aiProvider:'external',aiUrl:'https://provider.example'}));
});
test('unknown AI operation fails before network or output validation',async()=>{
  let called=false;
  await assert.rejects(()=>createAI(local,async()=>{called=true;})('unknown',{}));
  assert.equal(called,false);
  assert.throws(()=>validateAI('unknown',{},{}));
});
