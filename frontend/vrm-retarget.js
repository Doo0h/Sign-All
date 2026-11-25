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
