import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {VRMLoaderPlugin,VRMUtils} from '@pixiv/three-vrm';
import {distributeForearmRoll,alignElbowPlane} from './vrm-retarget.js';

const $=id=>document.getElementById(id);
const v=point=>new THREE.Vector3(point.x,-point.y,-point.z);
try{
  const [asset,motionResponse]=await Promise.all([fetch('/avatar.vrm'),fetch('/motion.json')]);
  if(!asset.ok||!motionResponse.ok)throw Error('모델 또는 동작을 불러오지 못했습니다.');
  const bytes=await asset.arrayBuffer();if(bytes.byteLength>30*1024*1024)throw Error('모델 크기 제한을 초과했습니다.');
  const motion=await motionResponse.json();
  if($('reference')){ $('reference').hidden=!motion.hasVideo;if(motion.hasVideo)$('reference-video').src='/source.webm'; }
  const manager=new THREE.LoadingManager();manager.setURLModifier(url=>{if(url.startsWith('blob:')||url.startsWith('data:image/'))return url;throw Error('외부 파일을 참조하는 모델은 지원하지 않습니다.');});
  const loader=new GLTFLoader(manager);loader.register(parser=>new VRMLoaderPlugin(parser));
  const gltf=await loader.parseAsync(bytes,'');const vrm=gltf.userData.vrm;
  if(!vrm)throw Error('VRM 모델이 아닙니다.');VRMUtils.rotateVRM0(vrm);
  vrm.scene.traverse(o=>{o.frustumCulled=false;});
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.setClearColor(0,0);renderer.toneMapping=THREE.ACESFilmicToneMapping;
  const scene=new THREE.Scene();scene.add(vrm.scene);scene.add(new THREE.HemisphereLight(0xffffff,0x9aabc8,.6));
  const light=new THREE.DirectionalLight(0xffffff,1.5);light.position.set(1,2,3);scene.add(light);
  const camera=new THREE.PerspectiveCamera(30,1,.01,100);
  const stage=$('stage');stage.append(renderer.domElement);renderer.domElement.setAttribute('aria-label','완성형 VRM 버츄얼 캐릭터');renderer.domElement.setAttribute('role','img');
  const bone=name=>vrm.humanoid.getNormalizedBoneNode(name);
  vrm.scene.updateMatrixWorld(true);
  const rest=new Map();
  for(const name of Object.keys(vrm.humanoid.normalizedHumanBones)){
    const node=bone(name);if(node)rest.set(name,{local:node.quaternion.clone(),world:node.getWorldQuaternion(new THREE.Quaternion()),position:node.getWorldPosition(new THREE.Vector3())});
  }
  const head=rest.get('head').position,hips=rest.get('hips').position;
  const elbowHinges={};for(const side of ['left','right'])elbowHinges[side]=new THREE.Vector3(0,side==='left'?-1:1,0).applyQuaternion(vrm.humanoid.getRawBoneNode(side+'LowerArm').getWorldQuaternion(new THREE.Quaternion()));
  function positionCamera(){
    const close=$('view').value==='face',targetY=close?head.y+.06:hips.y+(head.y-hips.y)*.68;
    const hands=$('view').value==='hands';
    const left=bone('leftHand').getWorldPosition(new THREE.Vector3()),right=bone('rightHand').getWorldPosition(new THREE.Vector3());
    const target=hands?left.clone().add(right).multiplyScalar(.5).add(new THREE.Vector3(0,.025,0)):new THREE.Vector3(0,targetY,0);
    const frameHeight=hands?.42:(close?.48:.86),frameWidth=hands?Math.max(.48,Math.abs(left.x-right.x)+.30):(close?.42:.72);
    const distance=Math.max(frameHeight,frameWidth/camera.aspect)/(2*Math.tan(THREE.MathUtils.degToRad(15)));
    camera.position.set(target.x,target.y,target.z+distance);camera.lookAt(target);camera.updateProjectionMatrix();}
  function fit(){const width=stage.clientWidth,height=innerWidth<760?520:680;renderer.setSize(width,height);camera.aspect=width/height;positionCamera();}
  new ResizeObserver(fit).observe(stage);$('view').onchange=fit;fit();
  const restore=()=>{for(const [name,r] of rest)bone(name).quaternion.copy(r.local);vrm.scene.updateMatrixWorld(true);};
  const clearExpression=()=>{for(const name of ['happy','blink','blinkLeft','blinkRight','aa','oh','ou','ee','ih','relaxed','surprised'])vrm.expressionManager.setValue(name,0);};
  function neutral(){restore();bone('leftUpperArm').rotation.z=-1.15;bone('rightUpperArm').rotation.z=1.15;clearExpression();}
  function worldRotation(name,q){const node=bone(name);if(!node)return;node.parent.updateWorldMatrix(true,false);const parent=node.parent.getWorldQuaternion(new THREE.Quaternion());node.quaternion.copy(parent.invert().multiply(q));node.updateWorldMatrix(false,true);}
  function aim(name,next,direction){if(direction.lengthSq()<1e-10)return;const a=rest.get(name),b=rest.get(next);if(!a||!b)return;const initial=b.position.clone().sub(a.position).normalize();worldRotation(name,new THREE.Quaternion().setFromUnitVectors(initial,direction.clone().normalize()).multiply(a.world));}
  function palm(wrist,index,middle,little){const y=middle.clone().sub(wrist).normalize(),x=index.clone().sub(little);x.addScaledVector(y,-x.dot(y)).normalize();const z=x.clone().cross(y).normalize();return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z));}
  const palms={};for(const side of ['left','right'])palms[side]=palm(rest.get(side+'Hand').position,rest.get(side+'IndexProximal').position,rest.get(side+'MiddleProximal').position,rest.get(side+'LittleProximal').position);
  let playing=false,position=0,mode='neutral';const duration=(motion.frames.at(-1).timestampMs-motion.frames[0].timestampMs)/1000;
  function sample(index){restore();const f=motion.frames[index],pose=f.poseWorld.map(v);
    for(const [side,key,shoulder,elbow,wrist] of [['left','L',11,13,15],['right','R',12,14,16]]){
      aim(side+'UpperArm',side+'LowerArm',pose[elbow].clone().sub(pose[shoulder]));aim(side+'LowerArm',side+'Hand',pose[wrist].clone().sub(pose[elbow]));
      if($('elbow-correction')?.checked){
        const upper=pose[elbow].clone().sub(pose[shoulder]),lower=pose[wrist].clone().sub(pose[elbow]);
        const start=rest.get(side+'UpperArm'),middle=rest.get(side+'LowerArm'),end=rest.get(side+'Hand');
        const restDirection=middle.position.clone().sub(start.position);
        const rotation=alignElbowPlane(restDirection,elbowHinges[side],upper,lower);
        worldRotation(side+'UpperArm',rotation.clone().multiply(start.world));
        const initial=end.position.clone().sub(middle.position).applyQuaternion(rotation).normalize();
        worldRotation(side+'LowerArm',new THREE.Quaternion().setFromUnitVectors(initial,lower.normalize()).multiply(rotation).multiply(middle.world));
      }
      const hand=f.hands[key].map(v),twist=palm(hand[0],hand[5],hand[9],hand[17]).multiply(palms[side].clone().invert());
      if($('correction')?.checked){
        const name=side+'LowerArm',r=rest.get(name),current=bone(name).getWorldQuaternion(new THREE.Quaternion());
        const swing=current.clone().multiply(r.world.clone().invert());
        const normal=new THREE.Vector3(0,0,1).applyQuaternion(palms[side]);
        const corrected=distributeForearmRoll(swing,pose[wrist].clone().sub(pose[elbow]),normal,normal.clone().applyQuaternion(twist));
        worldRotation(name,corrected.multiply(r.world));
      }
      worldRotation(side+'Hand',twist.clone().multiply(rest.get(side+'Hand').world));
      for(const [finger,start,joints] of [['Thumb',1,['Metacarpal','Proximal','Distal']],['Index',5,['Proximal','Intermediate','Distal']],['Middle',9,['Proximal','Intermediate','Distal']],['Ring',13,['Proximal','Intermediate','Distal']],['Little',17,['Proximal','Intermediate','Distal']]]){
        for(let j=0;j<3;j++){
          const name=side+finger+joints[j],r=rest.get(name);if(!r)continue;
          const next=rest.get(side+finger+joints[Math.min(j+1,2)]),prev=rest.get(side+finger+joints[Math.max(j-1,0)]);
          const dir=j<2?next.position.clone().sub(r.position):r.position.clone().sub(prev.position);
          const initial=dir.applyQuaternion(twist).normalize(),target=hand[start+j+1].clone().sub(hand[start+j]).normalize();
          worldRotation(name,new THREE.Quaternion().setFromUnitVectors(initial,target).multiply(twist.clone().multiply(r.world)));
        }
      }
    }
    clearExpression();if($('source-face').checked){const b=f.blendshapes;vrm.expressionManager.setValue('blinkLeft',b.eyeBlinkLeft||0);vrm.expressionManager.setValue('blinkRight',b.eyeBlinkRight||0);vrm.expressionManager.setValue('aa',b.jawOpen||0);}
    $('timeline').value=String(index);$('time').textContent=`${index} / ${motion.frames.length-1} 프레임`;
  }
  $('play').onclick=()=>{mode='motion';if(position>=duration)position=0;playing=true;$('status').textContent='미검수 동작 재생 중';};
  $('pause').onclick=()=>{playing=false;$('status').textContent='일시정지';};
  $('reset').onclick=()=>{playing=false;mode='neutral';position=0;neutral();$('timeline').value='0';$('time').textContent='0 / 44 프레임';$('status').textContent='기본 자세';};
  const seekFrame=i=>{playing=false;mode='motion';i=Math.max(0,Math.min(motion.frames.length-1,i));position=i/(motion.frames.length-1)*duration;sample(i);const video=$('reference-video');if(video&&motion.hasVideo&&video.readyState>=1){video.pause();video.currentTime=motion.frames[i].timestampMs/1000;}$('status').textContent='프레임 확인 중';};
  $('timeline').oninput=()=>seekFrame(Number($('timeline').value));
  if($('previous-frame'))$('previous-frame').onclick=()=>seekFrame(Number($('timeline').value)-1);
  if($('next-frame'))$('next-frame').onclick=()=>seekFrame(Number($('timeline').value)+1);
  $('source-face').onchange=()=>{if(mode==='motion')sample(Number($('timeline').value));};
  if($('correction'))$('correction').onchange=()=>{if(mode==='motion')sample(Number($('timeline').value));};
  if($('elbow-correction'))$('elbow-correction').onchange=()=>{if(mode==='motion')sample(Number($('timeline').value));};
  for(const button of document.querySelectorAll('[data-expression]'))button.onclick=()=>{playing=false;mode='expression';neutral();const name=button.dataset.expression;if(name!=='neutral')vrm.expressionManager.setValue(name,1);$('status').textContent=button.textContent+' 표정';};
  neutral();$('controls').disabled=false;$('status').textContent='VRM 아바타 준비 완료';
  const clock=new THREE.Clock();function frame(){const dt=Math.min(clock.getDelta(),.05);if(playing&&!document.hidden){position=Math.min(duration,position+dt);sample(Math.round(position/duration*(motion.frames.length-1)));if(position>=duration){playing=false;$('status').textContent='재생 완료';}}vrm.update(dt);if($('view').value==='hands')positionCamera();renderer.render(scene,camera);requestAnimationFrame(frame);}frame();
}catch(error){$('status').textContent=error.message;console.error(error);}
