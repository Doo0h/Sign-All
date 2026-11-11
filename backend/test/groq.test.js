import test from 'node:test';
import assert from 'node:assert/strict';
import {config} from '../src/common.js';
import {createAI} from '../src/ai.js';

test('Groq preset sends JSON contract to server-only provider endpoint',async()=>{
 const cfg=config({APP_MODE:'live',AI_PROVIDER:'groq',AI_API_KEY:'synthetic-test-key'});
 assert.equal(cfg.aiModel,'openai/gpt-oss-20b');
 const ai=createAI(cfg,async(url,options)=>{
   assert.equal(url,'https://api.groq.com/openai/v1/chat/completions');
   const body=JSON.parse(options.body);assert.equal(body.response_format.type,'json_object');assert.equal(body.max_completion_tokens,2048);
   return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({summary:'가상 경험',keywords:[],competencies:[]})}}]}));
 });
 assert.equal((await ai('analyze',{resumeText:'가상 경험'})).summary,'가상 경험');
});
test('Groq rate limit is actionable and never retried or switched to a paid model',async()=>{
 let calls=0;const ai=createAI(config({APP_MODE:'live',AI_PROVIDER:'groq',AI_API_KEY:'synthetic'}),async()=>{calls++;return new Response('{}',{status:429});});
 await assert.rejects(ai('analyze',{resumeText:'가상'}),e=>e.code==='AI_PROVIDER_LIMIT'&&e.status===503);
 assert.equal(calls,1);
});
