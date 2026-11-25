import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Quaternion,Vector3} from 'three';
import {distributeForearmRoll} from '../vrm-retarget.js';

test('forearm roll keeps arm direction and shares half the palm rotation',()=>{
  const axis=new Vector3(1,0,0),normal=new Vector3(0,0,1);
  const target=normal.clone().applyAxisAngle(axis,Math.PI/2);
  const result=distributeForearmRoll(new Quaternion(),axis,normal,target);
  assert.ok(axis.clone().applyQuaternion(result).distanceTo(axis)<1e-8);
  assert.ok(Math.abs(result.angleTo(new Quaternion())-Math.PI/4)<1e-8);
});
test('roll correction is capped and degenerate palm directions stay finite',()=>{
  const axis=new Vector3(1,0,0),normal=new Vector3(0,0,1);
  const result=distributeForearmRoll(new Quaternion(),axis,normal,normal.clone().negate(),1,.3);
  assert.ok(result.angleTo(new Quaternion())<=.30000001);
  const unchanged=distributeForearmRoll(new Quaternion(),axis,axis,axis);
  assert.deepEqual(unchanged.toArray(),[0,0,0,1]);
});
