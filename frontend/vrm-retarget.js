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
