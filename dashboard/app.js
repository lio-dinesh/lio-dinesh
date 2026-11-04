import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { gsap } from "gsap";

const DATA_URL="./data.json";
const POLL_MS=30000;
const colors={
  monkeytype:"#E58B67",
  leetcode:"#6E8BFF",
  codechef:"#D6B365",
  github:"#B5A1E8"
};
const settings={range:90,quality:"medium",paused:false,reducedMotion:window.matchMedia("(prefers-reduced-motion: reduce)").matches};
const records=new Map();
let currentSnapshot=null;
let lastFetch=0;
let animationFrame=0;
const $=id=>document.getElementById(id);

function esc(value){
  return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function n(value){
  if(value===null||value===undefined||value==="")return "—";
  return new Intl.NumberFormat("en-IN").format(Number(value));
}
function dateLabel(value){
  if(!value)return "No activity";
  const d=new Date(value+"T00:00:00Z");
  return Number.isNaN(d.getTime())?value:d.toLocaleDateString("en-IN",{day:"2-digit",month:"short",timeZone:"UTC"});
}
function metric(platform,key){
  const m=(platform.metrics||[]).find(x=>String(x.label).toLowerCase()===key.toLowerCase());
  return m?m.value:"—";
}
function level(value,max){
  if(!value||value<=0)return 0;
  const ratio=value/Math.max(1,max);
  return ratio<=.25?1:ratio<=.5?2:ratio<=.75?3:4;
}
function material(color,extra={}){
  return new THREE.MeshStandardMaterial({color,roughness:.48,metalness:.12,...extra});
}
function rangedPlatform(platform){
  const days=platform.dailyActivity||[];
  const filtered=days.slice(-settings.range);
  return {...platform,dailyActivity:filtered,activeDays:filtered.filter(day=>Number(day.count)>0).length};
}
function motionEnabled(){return !settings.paused&&!settings.reducedMotion;}
function animateIn(target,from={y:18,opacity:0},duration=.8){
  if(settings.reducedMotion)return;
  gsap.fromTo(target,from,{y:0,opacity:1,duration,ease:"power3.out",clearProps:"transform,opacity"});
}
function addBox(group,size,position,color,detail){
  const obj=new THREE.Mesh(new THREE.BoxGeometry(...size),material(color));
  obj.position.set(...position);
  obj.castShadow=true;obj.receiveShadow=true;
  if(detail)obj.userData.detail=detail;
  group.add(obj);
  return obj;
}
function addBase(scene){
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(15,11),material("#22262B",{roughness:.96}));
  floor.rotation.x=-Math.PI/2;floor.position.y=-.12;scene.add(floor);
  const grid=new THREE.GridHelper(14,28,"#414753","#2A2E35");
  grid.position.y=-.105;grid.material.transparent=true;grid.material.opacity=.5;scene.add(grid);
}
function disposeGroup(group){
  group.traverse(obj=>{
    if(obj.geometry)obj.geometry.dispose();
    if(obj.material){
      if(Array.isArray(obj.material))obj.material.forEach(m=>m.dispose());
      else obj.material.dispose();
    }
  });
}
function makeKeyboard(platform){
  const group=new THREE.Group(),pickables=[],animated=[];
  addBox(group,[8.8,.36,3.4],[0,.2,0],"#22262B");
  addBox(group,[8.4,.08,3.04],[0,.42,0],"#414753");
  const days=platform.dailyActivity||[];
  for(let r=0;r<4;r++)for(let c=0;c<11;c++){
    const i=(r*11+c)%Math.max(1,days.length),day=days[i]||{count:0,date:""};
    const isAccent=(r+c)%9===0;
    const key=addBox(group,[.62,.21,.55],[-3.76+c*.75,.59,-1.06+r*.68],
      isAccent?"#E58B67":"#D9DCE2",
      {title:"KEY "+(r+1)+"-"+(c+1),line1:"Activity: "+(day.count||0),line2:day.date||"Typing practice"});
    key.userData.homeY=key.position.y;key.userData.phase=(r*11+c)*.19;
    pickables.push(key);animated.push(key);
  }
  const space=addBox(group,[3.15,.18,.53],[0,.58,1.16],"#AEB6C4",
    {title:"SPACE BAR",line1:"Best WPM: "+metric(platform,"BEST WPM"),line2:"Accuracy: "+metric(platform,"ACCURACY")});
  space.userData.homeY=space.position.y;space.userData.phase=1.8;
  pickables.push(space);animated.push(space);
  return {group,pickables,animate:t=>animated.forEach(key=>{
    const wave=Math.max(0,Math.sin(t*2.5-key.userData.phase));
    key.position.y=key.userData.homeY+wave*.07;
    key.rotation.x=wave*.025;
  })};
}
function makeLeetCode(platform){
  const group=new THREE.Group(),pickables=[],animated=[];
  addBox(group,[8.3,.25,4.7],[0,.02,0],"#E5D8C6");
  const difficulty=[
    {label:"EASY",value:metric(platform,"EASY"),color:"#6E8BFF"},
    {label:"MEDIUM",value:metric(platform,"MEDIUM"),color:"#B5A1E8"},
    {label:"HARD",value:metric(platform,"HARD"),color:"#E58B67"}
  ];
  difficulty.forEach((d,i)=>{
    const count=Number(d.value)||0;
    const height=Math.min(7,Math.max(1,Math.ceil(count/5)));
    const tower=new THREE.Group();group.add(tower);
    for(let k=0;k<height;k++){
      const block=addBox(tower,[1.12,.46,1.12],[0,.4+k*.48,0],d.color,
        {title:d.label+" SOLUTIONS",line1:"Accepted: "+count,line2:"LeetCode difficulty"});
      pickables.push(block);
    }
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.9,.045,10,48),material("#D6B365",{metalness:.32}));
    ring.rotation.x=Math.PI/2;ring.position.y=.3+height*.5;tower.add(ring);
    tower.position.x=(i-1)*2.55;animated.push({tower,ring,phase:i*.8});
  });
  return {group,pickables,animate:t=>animated.forEach(o=>{
    o.ring.rotation.z=t*.48+o.phase;
    o.tower.position.y=.025+Math.sin(t*1.3+o.phase)*.04;
  })};
}
function makeCodeChef(platform){
  const group=new THREE.Group(),pickables=[];
  addBox(group,[8.4,.25,4.8],[0,.02,0],"#22262B");
  addBox(group,[5,.32,2.6],[0,.3,0],"#414753");
  addBox(group,[3.65,.38,1.95],[0,.65,0],"#9A684F");
  addBox(group,[2.35,.42,1.35],[0,1.05,0],"#34372F");
  const trophy=new THREE.Group();
  const cup=new THREE.Mesh(new THREE.CylinderGeometry(.49,.78,.78,40),material("#D6B365",{metalness:.55,roughness:.24}));
  cup.position.y=2.05;trophy.add(cup);
  const stem=new THREE.Mesh(new THREE.CylinderGeometry(.16,.22,.66,24),material("#B88C48",{metalness:.5}));
  stem.position.y=1.36;trophy.add(stem);
  const foot=new THREE.Mesh(new THREE.CylinderGeometry(.68,.72,.16,36),material("#414753",{metalness:.35}));
  foot.position.y=1.05;trophy.add(foot);
  const rim=new THREE.Mesh(new THREE.TorusGeometry(.51,.065,10,48),material("#E5C987",{metalness:.5}));
  rim.rotation.x=Math.PI/2;rim.position.y=2.45;trophy.add(rim);
  for(const side of [-1,1]){
    const handle=new THREE.Mesh(new THREE.TorusGeometry(.32,.065,10,36,Math.PI),material("#D6B365",{metalness:.45}));
    handle.rotation.z=side<0?Math.PI/2:-Math.PI/2;handle.position.set(side*.58,2.13,0);trophy.add(handle);
  }
  const trophyDetail={title:"CODECHEF TROPHY",line1:"Solved: "+metric(platform,"SOLVED"),line2:"Stars: "+metric(platform,"STARS")};
  trophy.traverse(child=>{
    if(child.isMesh){child.userData.detail=trophyDetail;pickables.push(child);}
  });
  group.add(trophy);
  const days=(platform.dailyActivity||[]).slice(-21),max=Math.max(1,...days.map(x=>Number(x.count||0)));
  days.forEach((day,i)=>{
    const value=Number(day.count||0),height=value?(.12+Math.sqrt(value/max)*1.15):.035;
    const bar=addBox(group,[.15,height,.15],[-3.15+(i%7)*.37,.16+height/2,-1.65+Math.floor(i/7)*.48],
      i%3===0?"#D6B365":"#A66B4F",
      {title:"CONTEST ACTIVITY",line1:day.date,line2:"Daily submissions: "+value});
    pickables.push(bar);
  });
  return {group,pickables,animate:t=>{trophy.rotation.y=t*.42;trophy.position.y=Math.sin(t*1.25)*.055;}};
}
function makeGitHub(platform){
  const group=new THREE.Group(),pickables=[];
  addBox(group,[9,.22,6],[0,-.02,0],"#22262B");
  const days=platform.dailyActivity||[],max=Math.max(1,...days.map(x=>Number(x.count||0)));
  const geometry=new THREE.BoxGeometry(.43,1,.43);
  const material3d=material("#B5A1E8",{roughness:.42,metalness:.16});
  const cubes=new THREE.InstancedMesh(geometry,material3d,Math.max(days.length,1));
  const dummy=new THREE.Object3D(),color=new THREE.Color();
  cubes.userData.items=[];
  days.forEach((day,i)=>{
    const value=Number(day.count||0),height=value?.12+Math.sqrt(value/max)*1.7:.04;
    const x=-4.05+Math.floor(i/7)*.68,z=-2.38+(i%7)*.68;
    dummy.position.set(x,height/2+.09,z);dummy.scale.set(1,height,1);dummy.updateMatrix();
    cubes.setMatrixAt(i,dummy.matrix);
    const ratio=value/max;
    color.set(value?(ratio>.7?"#E58B67":ratio>.35?"#B5A1E8":"#6E8BFF"):"#414753");
    cubes.setColorAt(i,color);
    cubes.userData.items[i]={title:"GITHUB CONTRIBUTION",date:day.date,count:value};
  });
  cubes.count=days.length;cubes.instanceMatrix.needsUpdate=true;
  if(cubes.instanceColor)cubes.instanceColor.needsUpdate=true;
  group.add(cubes);pickables.push(cubes);
  cubes.userData.detail={title:"CONTRIBUTION TERRAIN",line1:"12-month total: "+metric(platform,"CONTRIBUTIONS · 12M"),line2:"Hover individual days"};
  return {group,pickables,animate:t=>{cubes.rotation.y=Math.sin(t*.2)*.018;}};
}
const builders={monkeytype:makeKeyboard,leetcode:makeLeetCode,codechef:makeCodeChef,github:makeGitHub};

function initScene(platform){
  const id=platform.id,host=$("scene-"+id);
  if(!host||records.has(id))return;
  try{
    const scene=new THREE.Scene();
    scene.background=new THREE.Color("#15171A");
    scene.fog=new THREE.Fog("#15171A",17,34);
    const camera=new THREE.PerspectiveCamera(39,host.clientWidth/host.clientHeight,.1,80);
    camera.position.set(9,8,11);
    const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:"high-performance"});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.35));
    renderer.setSize(host.clientWidth,host.clientHeight);
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=1.08;
    host.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight("#F2EFE8","#414753",2.1));
    const key=new THREE.DirectionalLight("#FFFFFF",3.4);key.position.set(-5,10,7);scene.add(key);
    const rim=new THREE.DirectionalLight(colors[id],2.0);rim.position.set(7,5,-5);scene.add(rim);
    const fill=new THREE.PointLight("#D6B365",12,22);fill.position.set(5,5,-5);scene.add(fill);
    addBase(scene);

    const composer=new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene,camera));
    const bloom=new UnrealBloomPass(new THREE.Vector2(host.clientWidth,host.clientHeight),.105,.32,.9);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    const controls=new OrbitControls(camera,renderer.domElement);
    controls.target.set(0,1,0);controls.enableDamping=true;controls.dampingFactor=.075;
    controls.minDistance=5.5;controls.maxDistance=22;controls.maxPolarAngle=Math.PI*.47;
    controls.autoRotate=!settings.paused&&!settings.reducedMotion;controls.autoRotateSpeed=.28;

    const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
    const record={
      id,host,scene,camera,renderer,composer,bloom,controls,raycaster,pointer,
      model:null,pickables:[],animate:null,visible:true,
      reset:{position:new THREE.Vector3(9,8,11),target:new THREE.Vector3(0,1,0)}
    };
    records.set(id,record);

    const tooltip=$("tooltip-"+id);
    renderer.domElement.addEventListener("pointermove",event=>{
      const rect=renderer.domElement.getBoundingClientRect();
      pointer.x=((event.clientX-rect.left)/rect.width)*2-1;
      pointer.y=-((event.clientY-rect.top)/rect.height)*2+1;
      raycaster.setFromCamera(pointer,camera);
      const hits=raycaster.intersectObjects(record.pickables,true);
      if(!hits.length){tooltip.hidden=true;return;}
      const hit=hits[0];
      let detail=hit.object.userData.detail;
      if(hit.instanceId!==undefined&&hit.object.userData.items)detail=hit.object.userData.items[hit.instanceId];
      if(!detail){tooltip.hidden=true;return;}
      tooltip.hidden=false;
      tooltip.style.left=Math.max(8,Math.min(rect.width-190,event.clientX-rect.left+12))+"px";
      tooltip.style.top=Math.max(46,Math.min(rect.height-85,event.clientY-rect.top+10))+"px";
      tooltip.innerHTML="<strong>"+esc(detail.title||"ACTIVITY")+"</strong><span>"+esc(detail.date||detail.line1||"Platform data")+"</span><span>"+esc(detail.count!==undefined?"Activity: "+detail.count:(detail.line2||"Inspect platform statistics"))+"</span>";
    });
    renderer.domElement.addEventListener("pointerleave",()=>{tooltip.hidden=true;});

    const observer=new IntersectionObserver(entries=>{
      for(const entry of entries)if(entry.target===host)record.visible=entry.isIntersecting;
    },{threshold:.02});
    observer.observe(host);
    new ResizeObserver(()=>{
      const w=host.clientWidth,h=host.clientHeight;
      if(!w||!h)return;
      camera.aspect=w/h;camera.updateProjectionMatrix();
      renderer.setSize(w,h);composer.setSize(w,h);
    }).observe(host);

    setQualityForRecord(record);
  }catch(error){
    console.error("3D model init failed",id,error);
    host.innerHTML='<div class="stat-placeholder">3D preview is unavailable in this browser. The data breakdown remains available below.</div>';
  }
}
function updateScene(originalPlatform){
  const platform=rangedPlatform(originalPlatform);
  const record=records.get(platform.id);
  if(!record)return;
  if(record.model){record.scene.remove(record.model);disposeGroup(record.model);}
  const built=builders[platform.id](platform);
  record.model=built.group;record.pickables=built.pickables;record.animate=built.animate;
  record.scene.add(record.model);
  if(!settings.reducedMotion){
    record.model.scale.setScalar(.94);
    gsap.to(record.model.scale,{x:1,y:1,z:1,duration:.85,ease:"back.out(1.5)",overwrite:true});
    gsap.fromTo(record.model.position,{y:-.22},{y:0,duration:.7,ease:"power3.out",overwrite:true});
  }
}
function renderPlatform(original){
  const platform=rangedPlatform(original),id=platform.id;
  $("status-"+id).textContent=(platform.status||"PROFILE")+" · "+(platform.activityAvailable?"ACTIVITY AVAILABLE":"ACTIVITY PRIVATE")+" · "+settings.range+"D";
  const stats=(platform.metrics||[]).slice(0,4).map(item=>
    '<div class="platform-stat"><strong>'+esc(item.value)+'</strong><span>'+esc(item.label)+'</span></div>'
  ).join("");
  $("stats-"+id).innerHTML=stats+
    '<div class="platform-stat"><strong>'+n(platform.currentStreak)+'</strong><span>CURRENT STREAK</span></div>'+
    '<div class="platform-stat"><strong>'+n(platform.longestStreak)+'</strong><span>LONGEST STREAK</span></div>'+
    '<div class="platform-stat"><strong>'+n(platform.activeDays)+'</strong><span>ACTIVE DAYS · '+settings.range+'D</span></div>';
  const days=platform.dailyActivity||[];
  const max=Math.max(1,...days.map(x=>Number(x.count||0)));
  $("heatmap-"+id).innerHTML='<div class="mini-heatmap-head"><span>ACTIVITY · LAST '+settings.range+' DAYS</span><span>'+(platform.activityAvailable?n(platform.activeDays)+" ACTIVE DAYS":"ACTIVITY PRIVATE")+'</span></div><div class="mini-heatmap-cells">'+days.map(day=>'<span class="mini-cell" data-level="'+level(Number(day.count||0),max)+'" title="'+esc(day.date)+' · '+Number(day.count||0)+' activity"></span>').join("")+'</div>';
  if(!settings.reducedMotion)gsap.fromTo($("stats-"+id).children,{y:8,opacity:0},{y:0,opacity:1,duration:.35,stagger:.045,ease:"power2.out"});
}
function renderCalendars(platforms){
  $("combined-heatmaps").innerHTML=platforms.map(original=>{
    const p=rangedPlatform(original),days=p.dailyActivity||[],max=Math.max(1,...days.map(x=>Number(x.count||0)));
    return '<article class="calendar-card"><div class="calendar-card-head"><strong>'+esc(p.label)+'</strong><span>'+(p.activityAvailable?n(p.activeDays)+" ACTIVE DAYS":"ACTIVITY PRIVATE")+'</span></div><div class="calendar-cells">'+days.map(d=>'<span class="calendar-cell" data-level="'+level(Number(d.count||0),max)+'" title="'+esc(d.date)+' · '+Number(d.count||0)+' activity"></span>').join("")+'</div><div class="calendar-foot"><span>'+(days.length?dateLabel(days[0].date):"—")+'</span><span>'+settings.range+' DAYS</span><span>'+(days.length?dateLabel(days[days.length-1].date):"—")+'</span></div></article>';
  }).join("");
  if(!settings.reducedMotion)gsap.fromTo(".calendar-card",{y:12,opacity:0},{y:0,opacity:1,duration:.45,stagger:.07,ease:"power2.out"});
}
function updateDashboard(data){
  currentSnapshot=data;
  const platforms=data.platforms||[];
  $("platform-count").textContent=String(platforms.length).padStart(2,"0");
  const active=platforms.reduce((sum,p)=>sum+rangedPlatform(p).activeDays,0);
  $("total-active").textContent=n(active);
  const latest=platforms.filter(p=>p.lastActiveDate).sort((a,b)=>String(b.lastActiveDate).localeCompare(String(a.lastActiveDate)))[0];
  $("latest-date").textContent=latest?dateLabel(latest.lastActiveDate):"—";
  $("latest-source").textContent=latest?latest.label+" · "+latest.handle:"No published activity";
  $("snapshot-time").textContent="Snapshot: "+(data.generatedAtIST||"—");
  $("summary-updated").textContent="SOURCE SNAPSHOT · "+(data.generatedAtIST||"—");
  platforms.forEach(platform=>{
    renderPlatform(platform);
    if(!records.has(platform.id))initScene(platform);
    updateScene(platform);
  });
  renderCalendars(platforms);
  $("connection-status").textContent="CONNECTED";
  $("connection-status").style.color="var(--accent)";
}
async function refresh(manual=false){
  const button=$("refresh-now");
  if(manual){button.disabled=true;button.textContent="CHECKING…";}
  try{
    const response=await fetch(DATA_URL+"?v="+Date.now(),{cache:"no-store"});
    if(!response.ok)throw new Error("Snapshot HTTP "+response.status);
    const data=await response.json();
    if(!Array.isArray(data.platforms))throw new Error("Invalid snapshot format");
    if(!currentSnapshot||data.generatedAt!==currentSnapshot.generatedAt)updateDashboard(data);
    lastFetch=Date.now();
  }catch(error){
    console.warn("Live refresh failed",error);
    $("connection-status").textContent="DATA DELAYED";
    $("connection-status").style.color="var(--terracotta)";
  }finally{
    if(manual){button.disabled=false;button.textContent="↻ REFRESH DATA";}
  }
}
function cameraPreset(record,preset){
  const positions={
    front:new THREE.Vector3(0,5.6,13),
    side:new THREE.Vector3(13,6,0),
    top:new THREE.Vector3(0,16,.01)
  };
  const destination=positions[preset];
  if(!destination)return;
  if(settings.reducedMotion){
    record.camera.position.copy(destination);
    record.controls.target.set(0,1,0);
    record.controls.update();
    return;
  }
  gsap.to(record.camera.position,{x:destination.x,y:destination.y,z:destination.z,duration:.85,ease:"power3.inOut",onUpdate:()=>record.camera.lookAt(record.controls.target)});
  gsap.to(record.controls.target,{x:0,y:1,z:0,duration:.85,ease:"power3.inOut"});
}
function setQualityForRecord(record){
  const presets={
    low:{pixelRatio:.85,bloom:0},
    medium:{pixelRatio:1.15,bloom:.075},
    high:{pixelRatio:Math.min(window.devicePixelRatio||1,1.8),bloom:.13}
  };
  const preset=presets[settings.quality]||presets.medium;
  record.renderer.setPixelRatio(preset.pixelRatio);
  record.renderer.setSize(record.host.clientWidth,record.host.clientHeight);
  record.bloom.strength=preset.bloom;
  record.composer.setSize(record.host.clientWidth,record.host.clientHeight);
  record.renderer.shadowMap.enabled=settings.quality==="high";
}
function applyQuality(){
  records.forEach(setQualityForRecord);
}
function applyMotionSettings(){
  records.forEach(record=>{
    record.controls.autoRotate=motionEnabled();
  });
}
function setupControls(){
  document.querySelectorAll("[data-reset]").forEach(button=>button.addEventListener("click",()=>{
    const record=records.get(button.dataset.reset);if(!record)return;
    if(settings.reducedMotion){
      record.camera.position.copy(record.reset.position);
      record.controls.target.copy(record.reset.target);
      record.controls.update();
    }else{
      gsap.to(record.camera.position,{x:record.reset.position.x,y:record.reset.position.y,z:record.reset.position.z,duration:.8,ease:"power3.inOut"});
      gsap.to(record.controls.target,{x:record.reset.target.x,y:record.reset.target.y,z:record.reset.target.z,duration:.8,ease:"power3.inOut"});
    }
  }));
  document.querySelectorAll("[data-autorotate]").forEach(button=>button.addEventListener("click",()=>{
    const record=records.get(button.dataset.autorotate);if(!record)return;
    record.controls.autoRotate=!record.controls.autoRotate;
    button.textContent=record.controls.autoRotate?"PAUSE":"RESUME";
  }));
  document.querySelectorAll("[data-camera]").forEach(button=>button.addEventListener("click",()=>{
    const record=records.get(button.dataset.scene);if(record)cameraPreset(record,button.dataset.camera);
  }));
  document.querySelectorAll("[data-fullscreen]").forEach(button=>button.addEventListener("click",async()=>{
    const card=document.querySelector('[data-platform-card="'+button.dataset.fullscreen+'"]');
    if(!card)return;
    try{
      if(document.fullscreenElement)await document.exitFullscreen();
      else await card.requestFullscreen();
    }catch(error){console.warn("Fullscreen is unavailable",error);}
  }));
  $("range-select").addEventListener("change",event=>{
    settings.range=Number(event.target.value)||90;
    if(currentSnapshot)updateDashboard(currentSnapshot);
  });
  $("quality-select").addEventListener("change",event=>{
    settings.quality=event.target.value;
    applyQuality();
  });
  $("pause-all").addEventListener("click",()=>{
    settings.paused=!settings.paused;
    $("pause-all").textContent=settings.paused?"▶ RESUME ALL":"Ⅱ PAUSE ALL";
    applyMotionSettings();
  });
  $("reduced-motion").checked=settings.reducedMotion;
  $("reduced-motion").addEventListener("change",event=>{
    settings.reducedMotion=event.target.checked;
    applyMotionSettings();
  });
}
function animate(){
  const time=performance.now()/1000;
  records.forEach(record=>{
    if(!record.visible)return;
    record.controls.update();
    if(motionEnabled()&&record.animate)record.animate(time);
    if(settings.quality==="low")record.renderer.render(record.scene,record.camera);
    else record.composer.render();
  });
  animationFrame=requestAnimationFrame(animate);
}
function setTimeAndCountdown(){
  const tick=()=>{
    $("clock").textContent=new Intl.DateTimeFormat("en-IN",{timeZone:"Asia/Kolkata",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).format(new Date())+" IST";
    const left=Math.max(0,POLL_MS-(Date.now()-lastFetch));
    $("next-refresh").textContent=lastFetch?"NEXT CHECK "+String(Math.ceil(left/1000)).padStart(2,"0")+"s":"CHECKING…";
  };
  tick();setInterval(tick,1000);
}
function setupScrollReveal(){
  const targets=document.querySelectorAll(".intro,.overview-card,.platform-intro,.model-card,.activity-summary,.data-disclaimer");
  if(settings.reducedMotion||!("IntersectionObserver" in window)){targets.forEach(el=>el.classList.add("is-visible"));return;}
  const observer=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if(entry.isIntersecting){
        entry.target.classList.add("is-visible");
        gsap.fromTo(entry.target,{y:16,opacity:0},{y:0,opacity:1,duration:.65,ease:"power2.out"});
        observer.unobserve(entry.target);
      }
    });
  },{threshold:.08});
  targets.forEach(el=>observer.observe(el));
}
async function init(){
  setupControls();
  setupScrollReveal();
  const prefersReduced=window.matchMedia("(prefers-reduced-motion: reduce)");
  if(prefersReduced.matches)settings.reducedMotion=true;
  await refresh(false);
  setInterval(()=>refresh(false),POLL_MS);
  setTimeAndCountdown();
  animate();
  $("refresh-now").addEventListener("click",()=>refresh(true));
}
init();
