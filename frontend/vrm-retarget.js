import {Quaternion,Vector3} from 'three';

// Keep the forearm's measured direction, distributing some palm roll along it.
// This is geometric retargeting, not an anatomical or linguistic validation.
export function distributeForearmRoll(swing,axis,restPalmNormal,targetPalmNormal,weight=.5,maxRadians=Math.PI/3){
  if(axis.lengthSq()<1e-10)return swing.clone();
  const direction=axis.clone().normalize();
  const a=restPalmNormal.clone().applyQuaternion(swing),b=targetPalmNormal.clone();
  a.addScaledVector(direction,-a.dot(direction));b.addScaledVector(direction,-b.dot(direction));
  if(a.lengthSq()<1e-8||b.lengthSq()<1e-8)return swing.clone();
  a.normalize();b.normalize();
  const angle=Math.atan2(direction.dot(new Vector3().crossVectors(a,b)),a.dot(b));
  const correction=Math.max(-maxRadians,Math.min(maxRadians,angle*weight));
  return new Quaternion().setFromAxisAngle(direction,correction).multiply(swing);
}

export function alignElbowPlane(restDirection,restHinge,upperDirection,lowerDirection){
  const upper=upperDirection.clone().normalize(),lower=lowerDirection.clone().normalize();
  const swing=new Quaternion().setFromUnitVectors(restDirection.clone().normalize(),upper);
  const normal=new Vector3().crossVectors(upper,lower);
  if(normal.lengthSq()<1e-6)return swing;
  return distributeForearmRoll(swing,upper,restHinge,normal.normalize(),1,Math.PI);
}

export function solveTwoBone(shoulder,target,guide,upperLength,lowerLength){
  if(!Number.isFinite(upperLength+lowerLength)||upperLength<=0||lowerLength<=0)throw Error('Invalid arm lengths');
  const offset=target.clone().sub(shoulder),requested=offset.length();
  const axis=requested>1e-8?offset.divideScalar(requested):guide.clone().sub(shoulder).normalize();
  if(axis.lengthSq()<.5)axis.set(1,0,0);
  const epsilon=Math.min(upperLength,lowerLength)*1e-5;
  const distance=Math.max(Math.abs(upperLength-lowerLength)+epsilon,Math.min(upperLength+lowerLength-epsilon,requested));
  const along=(upperLength**2-lowerLength**2+distance**2)/(2*distance);
  const height=Math.sqrt(Math.max(0,upperLength**2-along**2));
  const bend=guide.clone().sub(shoulder);bend.addScaledVector(axis,-bend.dot(axis));
  if(bend.lengthSq()<1e-10){bend.set(Math.abs(axis.y)<.9?0:1,Math.abs(axis.y)<.9?1:0,0);bend.addScaledVector(axis,-bend.dot(axis));}
  bend.normalize();
  return {elbow:shoulder.clone().addScaledVector(axis,along).addScaledVector(bend,height),
    wrist:shoulder.clone().addScaledVector(axis,distance),clamped:Math.abs(requested-distance)>epsilon*2};
}

export function boundedTarget(current,target,maxDistance=.06){
  const delta=target.clone().sub(current),distance=delta.length();
  return current.clone().add(delta.multiplyScalar(distance>maxDistance?maxDistance/distance:1));
}

// Carry the preceding phalanx's roll into the next joint before aiming it.
export function aimFingerSegment(restDirection,targetDirection,parentDelta,restWorld){
  if(restDirection.lengthSq()<1e-10||targetDirection.lengthSq()<1e-10)return parentDelta.clone().multiply(restWorld);
  const initial=restDirection.clone().applyQuaternion(parentDelta).normalize();
  return new Quaternion().setFromUnitVectors(initial,targetDirection.clone().normalize()).multiply(parentDelta).multiply(restWorld);
}

// Symmetric, frame-independent filtering: retain the current direction within 6 degrees.
export function stabilizeDirection(current,previous,next,maxRadians=Math.PI/30){
  const result=current.clone();
  if([current,previous,next].some(v=>v.lengthSq()<1e-10))return result;
  const length=result.length(),direction=result.clone().normalize();
  const average=previous.clone().normalize().addScaledVector(direction,2).add(next.clone().normalize());
  if(average.lengthSq()<1e-10)return result;
  average.normalize();const angle=direction.angleTo(average);
  if(angle<1e-8)return result;
  const rotation=new Quaternion().setFromUnitVectors(direction,average);
  return direction.applyQuaternion(new Quaternion().slerp(rotation,Math.min(1,maxRadians/angle))).multiplyScalar(length);
}

export function nearestTipPair(left,right){
  let nearest=null;
  for(const a of left)for(const b of right){
    const distance=a.position.distanceTo(b.position);
    if(Number.isFinite(distance)&&(!nearest||distance<nearest.distance))nearest={left:a.name,right:b.name,distance};
  }
  return nearest;
}
