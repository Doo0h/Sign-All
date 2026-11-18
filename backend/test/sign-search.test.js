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
test('road and CCTV aliases provide related concepts without arbitrary substring matches',()=>{
 for(const q of ['도로망','도로망 관리','도로 네트워크 운영'])assert.deepEqual(searchSigns(signs,q).items.map(x=>x.term),['도로','연결']);
 for(const q of ['CCTV','cctv','ＣＣＴＶ','C.C.T.V.','씨씨티비','CCTV 모니터링','감시카메라'])assert.deepEqual(searchSigns(signs,q).items.map(x=>x.term),['카메라','촬영','감시']);
 assert.deepEqual(searchSigns(signs,'CCTV관제').items.map(x=>x.term),['감시','촬영','안전']);
 assert.deepEqual(searchSigns(signs,'통신망 구축').items.map(x=>x.term),['통신','연결']);
 for(const q of ['무도로망','CCTV아무문자','무보안','길이','망하다'])assert.equal(searchSigns(signs,q).items.length,0);
 assert.equal(searchSigns(signs,'도로').items[0].originalId,'5381');
});
