import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Quaternion,Vector3} from 'three';
import {distributeForearmRoll,alignElbowPlane,solveTwoBone,boundedTarget,aimFingerSegment,stabilizeDirection,nearestTipPair,validateReviewSettings,interpolateWristKeys} from '../vrm-retarget.js';

test('nearest fingertip pair measures cross-hand geometry without a contact threshold',()=>{
  const left=[{name:'Index',position:new Vector3()},{name:'Thumb',position:new Vector3(5,0,0)}];
  const right=[{name:'Middle',position:new Vector3(.03,.04,0)}];
  assert.deepEqual(nearestTipPair(left,right),{left:'Index',right:'Middle',distance:.05});
  assert.equal(nearestTipPair([],right),null);
  assert.equal(nearestTipPair(left,[{name:'bad',position:new Vector3(NaN,0,0)}]),null);
});

test('finger stability reduces isolated jitter with a strict angular cap and preserved length',()=>{
  const axis=new Vector3(1,0,0),jitter=new Vector3(1,.3,0).normalize().multiplyScalar(.02);
  const filtered=stabilizeDirection(jitter,axis,axis);
  assert.ok(filtered.angleTo(axis)<jitter.angleTo(axis));
  assert.ok(filtered.angleTo(jitter)<=Math.PI/30+1e-7);
  assert.ok(Math.abs(filtered.length()-.02)<1e-10);
  assert.deepEqual(stabilizeDirection(axis,axis,axis).toArray(),axis.toArray());
  assert.deepEqual(stabilizeDirection(axis,new Vector3(),axis).toArray(),axis.toArray());
});

test('finger aiming preserves inherited roll while following measured direction',()=>{
  const axis=new Vector3(1,0,0),roll=new Quaternion().setFromAxisAngle(axis,.7);
  const result=aimFingerSegment(axis,axis,roll,new Quaternion());
  assert.ok(result.angleTo(roll)<1e-7);
  const target=new Vector3(.2,.8,.3).normalize();
  const aimed=aimFingerSegment(axis,target,roll,new Quaternion());
  assert.ok(axis.clone().applyQuaternion(aimed).distanceTo(target)<1e-8);
  assert.ok(aimFingerSegment(axis,new Vector3(),roll,new Quaternion()).toArray().every(Number.isFinite));
});

test('two-bone placement preserves lengths for reachable, unreachable and degenerate targets',()=>{
  const origin=new Vector3();
  for(const target of [new Vector3(.3,.2,.1),new Vector3(3,0,0),origin.clone()]){
    const result=solveTwoBone(origin,target,origin,.3,.25);
    assert.ok(Math.abs(result.elbow.length()-.3)<1e-8);
    assert.ok(Math.abs(result.elbow.distanceTo(result.wrist)-.25)<1e-8);
    assert.ok(result.elbow.toArray().every(Number.isFinite));
    if(target.length()>.05&&target.length()<.55)assert.ok(result.wrist.distanceTo(target)<1e-8);
    else assert.equal(result.clamped,true);
  }
  assert.throws(()=>solveTwoBone(origin,origin,origin,0,.3));
});
test('placement limits each wrist translation and leaves small corrections unchanged',()=>{
  const origin=new Vector3();
  assert.ok(Math.abs(boundedTarget(origin,new Vector3(1,0,0)).length()-.06)<1e-8);
  assert.deepEqual(boundedTarget(origin,new Vector3(.01,0,0)).toArray(),[.01,0,0]);
  assert.deepEqual(boundedTarget(origin,origin).toArray(),[0,0,0]);
});

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
test('elbow plane alignment preserves the upper arm direction and aligns its hinge',()=>{
  const rest=new Vector3(1,0,0),hinge=new Vector3(0,-1,0);
  const upper=new Vector3(.5,-.5,.1).normalize(),lower=new Vector3(-.1,.2,.8).normalize();
  const rotation=alignElbowPlane(rest,hinge,upper,lower);
  assert.ok(rest.clone().applyQuaternion(rotation).distanceTo(upper)<1e-7);
  const target=upper.clone().cross(lower).normalize();
  assert.ok(hinge.clone().applyQuaternion(rotation).distanceTo(target)<1e-7);
});
test('straight elbow has finite stable orientation',()=>{
  const q=alignElbowPlane(new Vector3(1,0,0),new Vector3(0,-1,0),new Vector3(0,-1,0),new Vector3(0,-1,0));
  assert.ok(q.toArray().every(Number.isFinite));
});

test('settings restore validates source, frames and every offset before returning values',()=>{
  const motion={modelSha256:'model',sourceVideoSha256:'video',frames:[{timestampMs:367}]};
  const report={schemaVersion:1,modelSha256:'model',sourceVideoSha256:'video',frames:[367],currentFrameMeasurement:{frame:0,timestampMs:367,settings:{'position-correction':true,'elbow-correction':true,correction:false,'finger-correction':true,'finger-stability':true,wristOffsetMm:{left:{x:10,y:0,z:-20},right:{x:0,y:0,z:0}}}}};
  assert.equal(validateReviewSettings(report,motion).offsets.left.x,10);
  for(const change of [r=>r.modelSha256='other',r=>r.frames[0]=1,r=>r.currentFrameMeasurement.frame=2,r=>r.currentFrameMeasurement.settings.wristOffsetMm.left.x=21,r=>r.currentFrameMeasurement.settings.correction='true']){
    const bad=structuredClone(report);change(bad);assert.throws(()=>validateReviewSettings(bad,motion));
  }
  assert.throws(()=>validateReviewSettings(null,motion));
});

test('wrist keys preserve exact keys and zero endpoints with bounded interpolation',()=>{
 const offsets={left:{x:20,y:-10,z:0},right:{x:0,y:0,z:0}},keys=[{frame:22,offsets}];
 assert.deepEqual(interpolateWristKeys(keys,22,44),offsets);
 assert.equal(interpolateWristKeys(keys,0,44).left.x,0);
 assert.equal(interpolateWristKeys(keys,44,44).left.x,0);
 assert.equal(interpolateWristKeys(keys,11,44).left.x,10);
 for(let i=0;i<=44;i++)assert.ok(interpolateWristKeys(keys,i,44).left.x<=20);
 assert.equal(interpolateWristKeys([],22,44).left.x,0);
});
