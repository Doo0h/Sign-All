import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {VRMLoaderPlugin,VRMUtils} from '@pixiv/three-vrm';
import {distributeForearmRoll,alignElbowPlane,solveTwoBone,boundedTarget,aimFingerSegment,stabilizeDirection,nearestTipPair} from './vrm-retarget.js';

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
  // This pinned VRM supplies explicit *_end nodes outside normalizedHumanBones.
  const fingertipDirections=new Map(),fingertipNodes=[];
  for(const side of ['left','right'])for(const finger of ['Thumb','Index','Middle','Ring','Little']){
    const name=side+finger+'Distal',raw=vrm.humanoid.getRawBoneNode(name);
    const end=raw?.children.find(child=>child.name.endsWith('_end'));
    if(end){
      const direction=end.getWorldPosition(new THREE.Vector3()).sub(raw.getWorldPosition(new THREE.Vector3()));
      if(direction.lengthSq()>1e-10){fingertipDirections.set(name,direction);fingertipNodes.push({side,name:finger,node:end});}
    }
  }
  const tipMarkers=new THREE.Group();scene.add(tipMarkers);
  const tipGeometry=new THREE.SphereGeometry(.003,8,6);
  for(const tip of fingertipNodes){
    const marker=new THREE.Mesh(tipGeometry,new THREE.MeshBasicMaterial({color:tip.side==='left'?0x66e5ff:0xffbf66,depthTest:false,depthWrite:false,transparent:true}));
    marker.renderOrder=999;tipMarkers.add(marker);tip.marker=marker;
  }
  stage.dataset.fingertips=String(fingertipNodes.length);
  let latestMeasurement=null;
  const fingerLabels={Thumb:'엄지',Index:'검지',Middle:'중지',Ring:'약지',Little:'소지'};
  function measureTips(){
    if(mode!=='motion'){
      latestMeasurement=null;
      if($('tip-distance'))$('tip-distance').textContent='동작 프레임을 선택하면 양손 손끝 뼈 사이의 최소 거리를 표시합니다.';
      return;
    }
    const points=side=>fingertipNodes.filter(t=>t.side===side).map(t=>({name:t.name,position:t.node.getWorldPosition(new THREE.Vector3())}));
    const pair=nearestTipPair(points('left'),points('right'));
    if(!pair)return;
    const index=Number($('timeline').value);
    const settings=Object.fromEntries(['position-correction','elbow-correction','correction','finger-correction','finger-stability'].map(id=>[id,Boolean($(id)?.checked)]));
    latestMeasurement={frame:index,timestampMs:motion.frames[index].timestampMs,left:pair.left,right:pair.right,distanceMeters:pair.distance,settings};
    if($('tip-distance')){
      $('tip-distance').textContent=`왼손 ${fingerLabels[pair.left]} ↔ 오른손 ${fingerLabels[pair.right]}: ${(pair.distance*1000).toFixed(1)}mm (양손 손끝 중 최소 거리)`;
      $('tip-distance').dataset.meters=String(pair.distance);
    }
  }
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
  const armLengths={};for(const side of ['left','right'])armLengths[side]=[
    rest.get(side+'UpperArm').position.distanceTo(rest.get(side+'LowerArm').position),
    rest.get(side+'LowerArm').position.distanceTo(rest.get(side+'Hand').position)];
  const scales=motion.frames.map(f=>{const p=f.poseWorld.map(v);return (armLengths.left[0]+armLengths.left[1]+armLengths.right[0]+armLengths.right[1])/(p[11].distanceTo(p[13])+p[13].distanceTo(p[15])+p[12].distanceTo(p[14])+p[14].distanceTo(p[16]));}).filter(Number.isFinite).sort((a,b)=>a-b);
  const sourceScale=scales[Math.floor(scales.length/2)];
  const shoulderCenter=rest.get('leftUpperArm').position.clone().add(rest.get('rightUpperArm').position).multiplyScalar(.5);
  let playing=false,position=0,mode='neutral';const duration=(motion.frames.at(-1).timestampMs-motion.frames[0].timestampMs)/1000;
  const reviewKey='signall-vrm-review:'+motion.modelSha256+':'+motion.sourceVideoSha256+':'+motion.frames.map(f=>f.timestampMs).join(',');
  let reviews={};
  try{const saved=JSON.parse(localStorage.getItem(reviewKey)||'{}');if(saved&&typeof saved==='object'&&!Array.isArray(saved))reviews=saved;}catch{}
  function showReview(index){
    if(!$('review-note'))return;
    const row=reviews[index];$('review-note').value=typeof row?.note==='string'?row.note:'';
    $('review-kind').value=['contact','direction','occlusion','other'].includes(row?.kind)?row.kind:'contact';
    $('review-frame').textContent=`${index}번 프레임 · ${motion.frames[index].timestampMs}ms · 기록 ${Object.keys(reviews).length}개`;
  }
  function saveReview(){
    const index=Number($('timeline').value),note=$('review-note').value.trim();
    if(note)reviews[index]={timestampMs:motion.frames[index].timestampMs,kind:$('review-kind').value,note,measurement:latestMeasurement?.frame===index?latestMeasurement:null};else delete reviews[index];
    try{localStorage.setItem(reviewKey,JSON.stringify(reviews));$('review-save-status').textContent='이 브라우저에 저장됨';}catch{$('review-save-status').textContent='브라우저 저장 실패 — JSON 내려받기로 보관하세요.';}
    $('review-frame').textContent=`${index}번 프레임 · ${motion.frames[index].timestampMs}ms · 기록 ${Object.keys(reviews).length}개`;
  }
  if($('review-note')){
    const pauseReview=()=>{playing=false;$('status').textContent='검토 기록 중';};
    $('review-note').onfocus=pauseReview;$('review-kind').onfocus=pauseReview;
    $('review-note').oninput=saveReview;$('review-kind').onchange=saveReview;
    $('review-export').onclick=()=>{
      const report={schemaVersion:1,status:'draft-unreviewed',measurementMeaning:'model-bone-end-distance-not-skin-contact',currentFrameMeasurement:latestMeasurement,modelSha256:motion.modelSha256,sourceVideoSha256:motion.sourceVideoSha256,source:motion.source,frames:motion.frames.map(f=>f.timestampMs),reviews};
      const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
      const a=document.createElement('a');a.href=url;a.download='signall-vrm-review.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    };
    showReview(0);
  }
  const referenceVideo=$('reference-video');let referenceTarget=motion.frames[0].timestampMs/1000;
  function syncReference(){
    if(!motion.hasVideo||!$('sync-video')?.checked||referenceVideo.readyState<1)return;
    referenceVideo.pause();
    if(!referenceVideo.seeking&&Math.abs(referenceVideo.currentTime-referenceTarget)>.012)referenceVideo.currentTime=referenceTarget;
  }
  if(referenceVideo){
    referenceVideo.addEventListener('seeked',syncReference);
    referenceVideo.addEventListener('loadedmetadata',syncReference);
    referenceVideo.addEventListener('play',()=>{if($('sync-video')?.checked)referenceVideo.pause();});
  }
  if($('sync-video')){
    $('sync-video').disabled=!motion.hasVideo;
    const update=()=>{referenceVideo.controls=!$('sync-video').checked;syncReference();};
    $('sync-video').onchange=update;update();
  }
  function sample(index){restore();const f=motion.frames[index],pose=f.poseWorld.map(v);
    referenceTarget=f.timestampMs/1000;syncReference();
    const sourceCenter=pose[11].clone().add(pose[12]).multiplyScalar(.5);
    const desired={left:pose[15].clone().sub(sourceCenter).multiplyScalar(sourceScale).add(shoulderCenter),right:pose[16].clone().sub(sourceCenter).multiplyScalar(sourceScale).add(shoulderCenter)};
    const baseline={},applied={};let limited=0;
    for(const [side,key,shoulder,elbow,wrist] of [['left','L',11,13,15],['right','R',12,14,16]]){
      const anchor=rest.get(side+'UpperArm').position;
      const currentElbow=anchor.clone().add(pose[elbow].clone().sub(pose[shoulder]).normalize().multiplyScalar(armLengths[side][0]));
      baseline[side]=currentElbow.clone().add(pose[wrist].clone().sub(pose[elbow]).normalize().multiplyScalar(armLengths[side][1]));
      if($('position-correction')?.checked){
        const target=boundedTarget(baseline[side],desired[side]);
        const solved=solveTwoBone(anchor,target,currentElbow,...armLengths[side]);
        if(solved.clamped||target.distanceTo(desired[side])>1e-5)limited++;
        pose[shoulder]=anchor.clone();pose[elbow]=solved.elbow;pose[wrist]=solved.wrist;
      }
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
          const dir=j<2?next.position.clone().sub(r.position):(fingertipDirections.get(name)?.clone()||r.position.clone().sub(prev.position));
          const restDirection=dir.clone();
          const initial=dir.applyQuaternion(twist).normalize();
          let target=hand[start+j+1].clone().sub(hand[start+j]).normalize();
          if($('finger-stability')?.checked&&index>0&&index<motion.frames.length-1){
            const segment=frame=>v(frame.hands[key][start+j+1]).sub(v(frame.hands[key][start+j]));
            target=stabilizeDirection(target,segment(motion.frames[index-1]),segment(motion.frames[index+1]));
          }
          if($('finger-correction')?.checked&&j>0){
            const parentName=side+finger+joints[j-1];
            const parentDelta=bone(parentName).getWorldQuaternion(new THREE.Quaternion()).multiply(rest.get(parentName).world.clone().invert());
            worldRotation(name,aimFingerSegment(restDirection,target,parentDelta,r.world));
          }else worldRotation(name,new THREE.Quaternion().setFromUnitVectors(initial,target).multiply(twist.clone().multiply(r.world)));
        }
      }
      applied[side]=bone(side+'Hand').getWorldPosition(new THREE.Vector3());
    }
    if($('placement-report')){
      const goal=desired.left.distanceTo(desired.right),before=baseline.left.distanceTo(baseline.right),after=applied.left.distanceTo(applied.right);
      $('placement-report').textContent=`손목 간격: 원본 비율 목표 ${Math.round(goal*1000)}mm · 보정 전 ${Math.round(before*1000)}mm · 현재 ${Math.round(after*1000)}mm${limited?' · 이동/도달 제한 적용':''}. 접촉 정확도 판정은 아닙니다.`;
      $('placement-report').dataset.goal=String(goal);$('placement-report').dataset.before=String(before);$('placement-report').dataset.after=String(after);
    }
    clearExpression();if($('source-face').checked){const b=f.blendshapes;vrm.expressionManager.setValue('blinkLeft',b.eyeBlinkLeft||0);vrm.expressionManager.setValue('blinkRight',b.eyeBlinkRight||0);vrm.expressionManager.setValue('aa',b.jawOpen||0);}
    $('timeline').value=String(index);$('time').textContent=`${index} / ${motion.frames.length-1} 프레임`;
    showReview(index);
  }
  $('play').onclick=()=>{mode='motion';if(position>=duration)position=0;playing=true;$('status').textContent='미검수 동작 재생 중';};
  $('pause').onclick=()=>{playing=false;$('status').textContent='일시정지';};
  $('reset').onclick=()=>{playing=false;mode='neutral';position=0;neutral();showReview(0);$('timeline').value='0';$('time').textContent='0 / 44 프레임';$('status').textContent='기본 자세';};
  const seekFrame=i=>{playing=false;mode='motion';i=Math.max(0,Math.min(motion.frames.length-1,i));position=i/(motion.frames.length-1)*duration;sample(i);const video=$('reference-video');if(video&&motion.hasVideo&&video.readyState>=1){video.pause();video.currentTime=motion.frames[i].timestampMs/1000;}$('status').textContent='프레임 확인 중';};
  $('timeline').oninput=()=>seekFrame(Number($('timeline').value));
  if($('previous-frame'))$('previous-frame').onclick=()=>seekFrame(Number($('timeline').value)-1);
  if($('next-frame'))$('next-frame').onclick=()=>seekFrame(Number($('timeline').value)+1);
  $('source-face').onchange=()=>{if(mode==='motion')sample(Number($('timeline').value));};
  if($('correction'))$('correction').onchange=()=>{if(mode==='motion')sample(Number($('timeline').value));};
  if($('elbow-correction'))$('elbow-correction').onchange=()=>{if(mode==='motion')sample(Number($('timeline').value));};
  if($('position-correction'))$('position-correction').onchange=()=>{if(mode==='motion')sample(Number($('timeline').value));};
  if($('finger-correction'))$('finger-correction').onchange=()=>{if(mode==='motion')sample(Number($('timeline').value));};
  if($('finger-stability'))$('finger-stability').onchange=()=>{if(mode==='motion')sample(Number($('timeline').value));};
  for(const button of document.querySelectorAll('[data-expression]'))button.onclick=()=>{playing=false;mode='expression';neutral();const name=button.dataset.expression;if(name!=='neutral')vrm.expressionManager.setValue(name,1);$('status').textContent=button.textContent+' 표정';};
  neutral();$('controls').disabled=false;$('status').textContent='VRM 아바타 준비 완료';
  const clock=new THREE.Clock();function frame(){const dt=Math.min(clock.getDelta(),.05);if(playing&&!document.hidden){position=Math.min(duration,position+dt*Number($('speed')?.value||1));sample(Math.round(position/duration*(motion.frames.length-1)));if(position>=duration){playing=false;$('status').textContent='재생 완료';}}vrm.update(dt);measureTips();tipMarkers.visible=Boolean($('show-fingertips')?.checked);if(tipMarkers.visible)for(const tip of fingertipNodes)tip.marker.position.copy(tip.node.getWorldPosition(new THREE.Vector3()));if($('view').value==='hands')positionCamera();renderer.render(scene,camera);requestAnimationFrame(frame);}frame();
}catch(error){$('status').textContent=error.message;console.error(error);}
