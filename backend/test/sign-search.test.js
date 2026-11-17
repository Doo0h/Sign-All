import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {searchSigns} from '../src/sign-search.js';
const {signs}=JSON.parse(await readFile(new URL('../../data/reference-starter.json',import.meta.url)));
test('professional concepts match only curated aliases and verified related records',()=>{
 for(const word of ['전력IT','전력 IT','전력it'])assert.deepEqual(searchSigns(signs,word).items.map(s=>s.term),['전기','정보통신기술']);
 assert.deepEqual(searchSigns(signs,'보안리스크').items.map(s=>s.term),['보안','위험']);
 assert.deepEqual(searchSigns(signs,'개인정보 보호').missingTerms,['개인정보']);
 const incident=searchSigns(signs,'장애 대응');assert.ok(incident.items.every(s=>!['장애','일치','대응'].includes(s.term)));
 assert.ok(incident.missingTerms.includes('장애 대응 전체 표현'));
 assert.equal(searchSigns(signs,'전련IT').items.length,0);
 assert.equal(searchSigns(signs,'무책임').items.length,0);
 assert.equal(searchSigns(signs,'경험').items[0].term,'경험');
});
