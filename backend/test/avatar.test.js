import test from 'node:test';
import assert from 'node:assert/strict';
import {avatarForQuestion} from '../src/avatar.js';
test('only exact, reviewed, rights-confirmed question animations become playable',()=>{
 const q={questionId:'q1',text:'보안 경험을 설명해 주세요.'};
 const e={questionText:q.text,language:'ksl',status:'reviewed',reviewedBy:'test-reviewer',reviewedAt:'2026-11-17',rightsConfirmed:true,source:'test fixture',version:'1',assetUrl:'/avatars/test.glb',clips:['question']};
 assert.equal(avatarForQuestion(q).status,'pending');
 assert.equal(avatarForQuestion(q,[e]).status,'ready');
 for(const patch of [{questionText:'다른 보안 질문'},{language:'asl'},{status:'draft'},{rightsConfirmed:false},{reviewedBy:''},{clips:[]},{assetUrl:'https://external/test.glb'},{assetUrl:'/avatars/../test.glb'}])assert.equal(avatarForQuestion(q,[{...e,...patch}]).status,'pending');
});
