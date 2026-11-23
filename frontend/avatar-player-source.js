import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
export async function mountAvatar(host, data) {
  if(!/^\/avatars\/[a-z0-9_-]+\.glb$/.test(data.assetUrl))throw Error('지원하지 않는 동작 자료 주소입니다.');
  const response=await fetch(data.assetUrl,{signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error('동작 자료를 불러오지 못했습니다.');
  const bytes=await response.arrayBuffer();if(bytes.byteLength>30*1024*1024)throw Error('동작 자료가 너무 큽니다.');
  if(!host.isConnected)return;
  const manager=new THREE.LoadingManager();manager.setURLModifier(url=>{if(/^data:image\//.test(url))return url;throw Error('외부 파일을 참조하는 모델은 지원하지 않습니다.');});
  const gltf=await new GLTFLoader(manager).parseAsync(bytes,'');
  if(data.character?.renderStyle==='animation'){
    const ramp=new THREE.DataTexture(Uint8Array.from({length:64},(_,i)=>155+Math.round(i*100/63)),64,1,THREE.RedFormat);
    ramp.minFilter=THREE.LinearFilter;ramp.magFilter=THREE.LinearFilter;ramp.needsUpdate=true;
    const converted=new Map();
    gltf.scene.traverse(object=>{if(!object.isMesh)return;const convert=original=>{
      if(!converted.has(original)){converted.set(original,new THREE.MeshToonMaterial({color:original.color,map:original.map,gradientMap:ramp,side:original.side,transparent:original.transparent,opacity:original.opacity}));}
      return converted.get(original);
    };object.material=Array.isArray(object.material)?object.material.map(convert):convert(object.material);});
    for(const original of converted.keys())original.dispose();
  }
  const clips=data.clips.map(name=>THREE.AnimationClip.findByName(gltf.animations,name));
  if(clips.some(c=>!c))throw Error('검토한 동작 클립이 파일에 없습니다.');
  if(!host.isConnected)return;
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  const scene=new THREE.Scene();scene.background=new THREE.Color('#080a0e');scene.add(new THREE.HemisphereLight(0xffffff,0x607080,2));
  const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(2,4,3);scene.add(light);
  scene.add(gltf.scene);const box=new THREE.Box3().setFromObject(gltf.scene),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
  const camera=new THREE.PerspectiveCamera(35,1,0.01,1000);
  const full=data.framing==='full';
  const target=center.clone();if(!full)target.y=box.min.y+size.y*.78;
  const frameHeight=Math.max(size.y*(full?1.08:.54),.1),frameWidth=Math.max(size.x*(full?1.12:.78),.1);
  const fitCamera=()=>{const tangent=Math.tan(THREE.MathUtils.degToRad(camera.fov/2));const distance=Math.max(frameHeight/(2*tangent),frameWidth/(2*tangent*camera.aspect));camera.position.set(target.x,target.y,target.z+distance+.05);camera.lookAt(target);};
  fitCamera();
  const canvas=renderer.domElement;canvas.setAttribute('role','img');canvas.setAttribute('aria-label','질문의 한국수어 아바타');
  const controls=document.createElement('div');controls.className='avatar-controls';const status=document.createElement('p');status.setAttribute('role','status');
  const button=text=>{const b=document.createElement('button');b.type='button';b.textContent=text;controls.append(b);return b;};
  const play=button('재생'),pause=button('일시정지'),restart=button('처음부터');
  const label=document.createElement('label');label.textContent='재생 속도 ';const speed=document.createElement('select');speed.setAttribute('aria-label','아바타 재생 속도');
  for(const v of [0.5,0.75,1]){const o=document.createElement('option');o.value=v;o.textContent=v+'배';o.selected=v===1;speed.append(o);}label.append(speed);controls.append(label);
  host.replaceChildren(canvas,controls,status);
  const mixer=new THREE.AnimationMixer(gltf.scene);let index=0,playing=false,finished=false,action;
  const begin=()=>{action?.stop();action=mixer.clipAction(clips[index]);action.reset().setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();};begin();
  play.onclick=()=>{if(finished){index=0;begin();finished=false;}playing=true;status.textContent='재생 중';};
  pause.onclick=()=>{playing=false;status.textContent='일시정지';};
  restart.onclick=()=>{index=0;begin();finished=false;playing=true;status.textContent='처음부터 재생 중';};
  mixer.addEventListener('finished',()=>{if(index+1<clips.length){index++;begin();}else{playing=false;finished=true;status.textContent='재생 완료';}});
  let timeline,timeLabel;
  if(data.status==='draft-unreviewed'&&clips.length===1){
    const row=document.createElement('div');row.style.cssText='display:flex;align-items:center;gap:8px;flex-wrap:wrap';
    timeline=document.createElement('input');timeline.type='range';timeline.min='0';timeline.max=String(clips[0].duration);timeline.step='any';timeline.value='0';timeline.setAttribute('aria-label','동작 위치');timeline.style.cssText='flex:1;min-width:120px';
    timeLabel=document.createElement('output');
    const seek=t=>{playing=false;finished=false;begin();action.time=Math.max(0,Math.min(clips[0].duration,t));mixer.update(0);timeline.value=String(action.time);status.textContent='프레임 확인 중';data.onSeek?.(action.time);};
    timeline.oninput=()=>seek(Number(timeline.value));
    const back=button('이전 프레임'),next=button('다음 프레임');
    const step=clips[0].duration/Math.max(1,(data.outputFrames||45)-1);
    back.onclick=()=>seek(action.time-step);next.onclick=()=>seek(action.time+step);
    row.append(timeline,timeLabel);host.insertBefore(row,status);
  }
  const observer=new ResizeObserver(()=>{const w=Math.max(host.clientWidth,240),height=Math.min(520,Math.max(400,Math.round(w*.9)));renderer.setSize(w,height);camera.aspect=w/height;camera.updateProjectionMatrix();fitCamera();});observer.observe(host);
  const clock=new THREE.Clock();let disposed=false;
  const dispose=()=>{if(disposed)return;disposed=true;observer.disconnect();renderer.dispose();gltf.scene.traverse(o=>{o.geometry?.dispose();for(const m of (Array.isArray(o.material)?o.material:[o.material]))if(m){for(const v of Object.values(m))if(v?.isTexture)v.dispose();m.dispose();}});};
  function frame(){if(!host.isConnected||!canvas.isConnected){dispose();return;}const delta=Math.min(clock.getDelta(),0.1);if(playing&&!document.hidden)mixer.update(delta*Number(speed.value));if(timeline){timeline.value=String(action.time);timeLabel.textContent=action.time.toFixed(2)+' / '+clips[0].duration.toFixed(2)+'초';}renderer.render(scene,camera);requestAnimationFrame(frame);}frame();
  status.textContent='준비되었습니다. 재생을 눌러 주세요.';
}
