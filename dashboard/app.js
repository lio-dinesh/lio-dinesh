import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import gsap from "gsap";

const DATA_URL="./data.json";
const POLL_MS=30000;
const colors={
  monkeytype:"#E58B67",
  leetcode:"#6E8BFF",
  codechef:"#D6B365",
  github:"#B5A1E8"
};
const settings={range:90,quality:"medium",colorMood:"graphite",paused:false,reducedMotion:window.matchMedia("(prefers-reduced-motion: reduce)").matches};
const colorMoods={
  graphite:{orange:"#E58B67",blue:"#6E8BFF",gold:"#D6B365",lavender:"#B5A1E8",warm:"#F2EFE8"},
  prism:{orange:"#FF6B9D",blue:"#43D9FF",gold:"#FFC857",lavender:"#B994FF",warm:"#F4F0FF"},
};
const accentKeys={
  "#E58B67":"orange","#6E8BFF":"blue","#D6B365":"gold","#B5A1E8":"lavender",
  "#A66B4F":"orange","#B88C48":"gold","#E5C987":"gold","#F2D99A":"gold",
  "#FFFFFF":"warm","#F2EFE8":"warm"
};
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
function themeColor(color){
  const hex=String(color).toUpperCase();
  const key=accentKeys[hex];
  return key?colorMoods[settings.colorMood][key]:color;
}
function material(color,extra={}){
  const mat=new THREE.MeshStandardMaterial({color:themeColor(color),roughness:.48,metalness:.12,...extra});
  mat.userData.sourceColor=String(color).toUpperCase();
  return mat;
}
function applyColorMood(mode){
  if(!colorMoods[mode])return;
  settings.colorMood=mode;
  const mood=colorMoods[mode];
  const root=document.documentElement;
  root.style.setProperty("--orange",mood.orange);
  root.style.setProperty("--cobalt",mood.blue);
  root.style.setProperty("--brass",mood.gold);
  root.style.setProperty("--lavender",mood.lavender);
  root.style.setProperty("--mood-glow",mood.blue+"22");
  root.style.setProperty("--mood-warm",mood.orange+"18");
  document.body.dataset.colorMood=mode;
  const toggle=$("color-mode-toggle");
  const action=$("color-mode-action");
  const current=$("color-mode-current");
  if(toggle){
    const isPrism=mode==="prism";
    toggle.setAttribute("aria-pressed",String(isPrism));
    toggle.dataset.activeMood=mode;
  }
  if(action)action.textContent=mode==="graphite"?"SWITCH TO PRISM ENERGY":"SWITCH TO GRAPHITE SIGNATURE";
  if(current)current.textContent="CURRENT: "+(mode==="graphite"?"GRAPHITE SIGNATURE":"PRISM ENERGY");
  if(currentSnapshot){
    currentSnapshot.platforms.forEach(platform=>updateScene(platform));
    renderActivityInsights(currentSnapshot.platforms);
    renderCalendars(currentSnapshot.platforms);
  }
  records.forEach(record=>{
    record.rimLight.color.set(moodColorForPlatform(record.id));
    record.fillLight.color.set(mood.gold);
    if(record.particleMaterial)record.particleMaterial.color.set(moodColorForPlatform(record.id));
  });
}
function moodColorForPlatform(id){
  const mood=colorMoods[settings.colorMood];
  return mood[id==="monkeytype"?"orange":id==="leetcode"?"blue":id==="codechef"?"gold":"lavender"];
}
function createAmbientParticles(scene,id){
  const count=110,positions=new Float32Array(count*3);
  for(let i=0;i<count;i++){
    positions[i*3]=(Math.random()-.5)*13;
    positions[i*3+1]=Math.random()*5+.4;
    positions[i*3+2]=(Math.random()-.5)*10;
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute("position",new THREE.BufferAttribute(positions,3));
  const mat=new THREE.PointsMaterial({color:moodColorForPlatform(id),size:.045,transparent:true,opacity:.58,depthWrite:false,blending:THREE.AdditiveBlending});
  const points=new THREE.Points(geometry,mat);
  points.userData.baseY=0;
  scene.add(points);
  return {points,material:mat,geometry};
}
function rangedPlatform(platform){
  const days=platform.dailyActivity||[];
  const filtered=days.slice(-settings.range);
  return {...platform,dailyActivity:filtered,activeDays:platform.activityAvailable?filtered.filter(day=>Number(day.count)>0).length:null};
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
function addRoundedBox(group,size,position,color,radius=.07,detail,extra={}){
  const geometry=new RoundedBoxGeometry(size[0],size[1],size[2],3,radius);
  const obj=new THREE.Mesh(geometry,material(color,extra));
  obj.position.set(position[0],position[1],position[2]);
  obj.castShadow=true;obj.receiveShadow=true;
  if(detail)obj.userData.detail=detail;
  group.add(obj);
  return obj;
}
function makeKeyLabel(text,color="#22262B"){
  const canvas=document.createElement("canvas");
  canvas.width=256;canvas.height=256;
  const ctx=canvas.getContext("2d");
  ctx.clearRect(0,0,256,256);
  ctx.fillStyle=color;
  ctx.font="600 104px 'DM Mono', monospace";
  ctx.textAlign="center";ctx.textBaseline="middle";
  ctx.fillText(text,128,128);
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  const mat=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false});
  return mat;
}
function addKeyLegend(key,label,height=.24){
  if(!label||!key)return;
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(.32,.25),makeKeyLabel(label));
  mesh.rotation.x=-Math.PI/2;
  mesh.position.set(0,height/2+.006,0);
  key.add(mesh);
}
function addStudioRing(group,radius,tube,y,color){
  const ring=new THREE.Mesh(new THREE.TorusGeometry(radius,tube,16,96),material(color,{metalness:.68,roughness:.24}));
  ring.rotation.x=Math.PI/2;
  ring.position.y=y;
  ring.castShadow=true;
  group.add(ring);
  return ring;
}
function addBase(scene){
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(15,11),material("#22262B",{roughness:.96}));
  floor.rotation.x=-Math.PI/2;floor.position.y=-.12;floor.receiveShadow=true;scene.add(floor);
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
  // An anodized chassis with a recessed deck and four low-profile feet.
  addRoundedBox(group,[9.2,.38,3.65],[0,.16,0],"#292E35",.14,null,{metalness:.58,roughness:.3});
  addRoundedBox(group,[8.82,.11,3.28],[0,.39,0],"#414753",.08);
  addBox(group,[8.5,.045,2.96],[0,.465,0],"#171A20");
  for(const x of [-3.8,3.8])for(const z of [-1.35,1.35])
    addRoundedBox(group,[.38,.12,.28],[x,.015,z],"#596273",.08,null,{metalness:.7,roughness:.3});
  // QWERTY layout with keycaps, readable legends and a few burnt-orange accent keys.
  const rows=[
    {labels:["ESC","1","2","3","4","5","6","7","8","9","0","⌫"],offset:-4.05,z:-1.08},
    {labels:["TAB","Q","W","E","R","T","Y","U","I","O","P"],offset:-3.78,z:-.35},
    {labels:["CAPS","A","S","D","F","G","H","J","K","L","↵"],offset:-3.78,z:.38},
    {labels:["SHIFT","Z","X","C","V","B","N","M",",",".","SHIFT"],offset:-4.05,z:1.11}
  ];
  const activity=platform.dailyActivity||[];
  let index=0;
  rows.forEach((row,r)=>{
    row.labels.forEach((label,c)=>{
      const x=row.offset+c*.73;
      const day=activity[index%Math.max(1,activity.length)]||{count:0,date:""};
      const accent=["ESC","⌫","↵"].includes(label)||((r+c)%17===0);
      const keyColor=accent?"#E58B67":"#D9DCE2";
      const cap=addRoundedBox(group,[.62,.24,.56],[x,.61,row.z],keyColor,.07,{
        title:"KEY "+label,line1:"Activity: "+(day.count||0),line2:day.date||"Typing practice"
      },{roughness:.36,metalness:.13});
      cap.userData.homeY=cap.position.y;
      cap.userData.phase=(r*13+c)*.16;
      cap.userData.index=index;
      addKeyLegend(cap,label,.24);
      pickables.push(cap);animated.push(cap);index++;
    });
  });
  // Wide spacebar and a subtle central accent rail.
  const space=addRoundedBox(group,[3.05,.22,.54],[0,.61,1.70],"#E58B67",.09,{
    title:"SPACE BAR",line1:"Best WPM: "+metric(platform,"BEST WPM"),line2:"Accuracy: "+metric(platform,"ACCURACY")
  },{roughness:.32,metalness:.16});
  space.userData.homeY=space.position.y;space.userData.phase=1.1;
  addKeyLegend(space,"SPACE",.22);
  pickables.push(space);animated.push(space);
  const rail=addRoundedBox(group,[7.8,.045,.06],[0,.49,-1.57],"#6E8BFF",.02,null,{metalness:.5,roughness:.28});
  return {group,pickables,animate:t=>animated.forEach(key=>{
    const wave=Math.max(0,Math.sin(t*2.5-key.userData.phase));
    key.position.y=key.userData.homeY+wave*.055;
    key.rotation.x=wave*.018;
  })};
}
function makeLeetCode(platform){
  const group=new THREE.Group(),pickables=[],animated=[];
  addRoundedBox(group,[8.3,.25,4.7],[0,.02,0],"#22262B",.16,null,{roughness:.42,metalness:.25});
  const difficulty=[
    {label:"EASY",value:metric(platform,"EASY"),color:"#6E8BFF"},
    {label:"MEDIUM",value:metric(platform,"MEDIUM"),color:"#B5A1E8"},
    {label:"HARD",value:metric(platform,"HARD"),color:"#E58B67"}
  ];
  difficulty.forEach((d,i)=>{
    const count=Number(d.value)||0;
    const height=Math.min(7,Math.max(1,Math.ceil(count/5)));
    const tower=new THREE.Group();
    const x=(i-1)*2.55;
    // Individual floating solution blocks retain a visible seam and bevel.
    for(let k=0;k<height;k++){
      const block=addRoundedBox(tower,[1.22,.43,1.22],[0,.38+k*.47,0],d.color,.09,{
        title:d.label+" SOLUTIONS",line1:"Accepted: "+count,line2:"Layer "+(k+1)+" / "+height
      },{roughness:.31,metalness:.16});
      pickables.push(block);
    }
    const ring=addStudioRing(tower,.91,.045,.28+height*.47,"#D6B365");
    const inner=addStudioRing(tower,.66,.018,.31+height*.47,"#F2EFE8");
    tower.position.x=x;
    group.add(tower);
    animated.push({tower,ring,inner,phase:i*.8,height});
    // Pedestal plaques for the difficulty category.
    addRoundedBox(group,[1.55,.13,.72],[x,.25,1.35],"#292E35",.06);
    const plaque=addBox(group,[1.05,.025,.045],[x,.325,1.35],d.color);
    plaque.userData.detail={title:d.label,line1:"Solved: "+count,line2:"LeetCode difficulty"};
    pickables.push(plaque);
  });
  return {group,pickables,animate:t=>animated.forEach(o=>{
    o.ring.rotation.y=t*.43+o.phase;
    o.inner.rotation.y=-t*.28-o.phase;
    o.tower.position.y=.025+Math.sin(t*1.1+o.phase)*.035;
  })};
}
function makeCodeChef(platform){
  const group=new THREE.Group(),pickables=[],activityBars=[],days=(platform.dailyActivity||[]).slice(-21);
  addRoundedBox(group,[8.4,.25,4.8],[0,.02,0],"#22262B",.16,null,{roughness:.38,metalness:.24});
  addRoundedBox(group,[5.5,.34,2.9],[0,.30,0],"#414753",.12,null,{metalness:.38});
  addRoundedBox(group,[4.2,.30,2.45],[0,.61,0],"#9A684F",.10,{title:"CONTEST PLATFORM",line1:"CodeChef practice",line2:"Public profile data"});
  addRoundedBox(group,[2.8,.37,1.78],[0,.93,0],"#292E35",.10,null,{metalness:.45});
  const trophy=new THREE.Group();
  // A classic cup profile generated by revolving a smooth silhouette.
  const profile=[
    new THREE.Vector2(.18,0),new THREE.Vector2(.27,.12),new THREE.Vector2(.35,.28),
    new THREE.Vector2(.48,.62),new THREE.Vector2(.60,.98),new THREE.Vector2(.67,1.30),
    new THREE.Vector2(.60,1.46),new THREE.Vector2(.48,1.51),new THREE.Vector2(.28,1.48),
    new THREE.Vector2(.14,1.38)
  ];
  const cup=new THREE.Mesh(new THREE.LatheGeometry(profile,64),material("#D6B365",{metalness:.82,roughness:.19}));
  cup.position.y=1.48;cup.castShadow=true;trophy.add(cup);
  const inside=new THREE.Mesh(new THREE.CylinderGeometry(.34,.43,.08,48),material("#E5C987",{metalness:.72,roughness:.23}));
  inside.position.y=2.86;trophy.add(inside);
  const stem=new THREE.Mesh(new THREE.CylinderGeometry(.13,.22,.62,32),material("#B88C48",{metalness:.78,roughness:.2}));
  stem.position.y=1.34;trophy.add(stem);
  for(const [radius,height] of [[.38,1.02],[.58,.93],[.76,.82]]){
    const foot=new THREE.Mesh(new THREE.CylinderGeometry(radius*.92,radius,height*.16,48),material("#E5C987",{metalness:.72,roughness:.22}));
    foot.position.y=height;trophy.add(foot);
  }
  const rim=addStudioRing(trophy,.62,.065,2.96,"#F2D99A");
  for(const side of [-1,1]){
    const handle=new THREE.Mesh(new THREE.TorusGeometry(.39,.075,16,56,Math.PI),material("#E5C987",{metalness:.82,roughness:.2}));
    handle.rotation.z=side<0?Math.PI/2:-Math.PI/2;
    handle.position.set(side*.61,2.48,0);trophy.add(handle);
  }
  const medal=new THREE.Mesh(new THREE.SphereGeometry(.14,24,16),material("#E58B67",{metalness:.45,roughness:.26}));
  medal.position.set(0,1.68,.51);trophy.add(medal);
  const trophyDetail={title:"CODECHEF TROPHY",line1:"Solved: "+metric(platform,"SOLVED"),line2:"Stars: "+metric(platform,"STARS")};
  trophy.traverse(child=>{if(child.isMesh){child.userData.detail=trophyDetail;pickables.push(child);}});
  trophy.position.y=.15;group.add(trophy);
  const halo=addStudioRing(group,1.28,.024,3.65,"#D6B365");
  halo.rotation.x=.13;
  const max=Math.max(1,...days.map(x=>Number(x.count||0)));
  days.forEach((day,i)=>{
    const value=Number(day.count||0),height=value?(.10+Math.sqrt(value/max)*1.12):.035;
    const bar=addRoundedBox(group,[.17,height,.17],[-3.35+(i%7)*.39,.16+height/2,-1.55+Math.floor(i/7)*.48],
      i%4===0?"#D6B365":"#E58B67",.035,
      {title:"CONTEST ACTIVITY",line1:day.date,line2:"Daily submissions: "+value});
    bar.userData.homeY=bar.position.y;bar.userData.phase=i*.31;
    activityBars.push(bar);pickables.push(bar);
  });
  return {group,pickables,animate:t=>{
    trophy.rotation.y=t*.32;
    trophy.position.y=.15+Math.sin(t*.95)*.035;
    halo.rotation.y=t*.17;
    activityBars.forEach((bar,i)=>{
      bar.position.y=bar.userData.homeY+Math.sin(t*1.4+bar.userData.phase)*.025;
      bar.rotation.z=Math.sin(t*.8+bar.userData.phase)*.025;
    });
  }};
}
function makeGitHub(platform){
  const group=new THREE.Group(),pickables=[];
  addRoundedBox(group,[9.6,.24,6.6],[0,-.04,0],"#22262B",.16,null,{metalness:.25,roughness:.42});
  const days=platform.dailyActivity||[],max=Math.max(1,...days.map(x=>Number(x.count||0)));
  const geometry=new RoundedBoxGeometry(.43,1,.43,2,.055);
  const material3d=material("#FFFFFF",{roughness:.37,metalness:.2});
  const cubes=new THREE.InstancedMesh(geometry,material3d,Math.max(days.length,1));
  const dummy=new THREE.Object3D(),color=new THREE.Color(),voxelTransforms=[];
  cubes.userData.items=[];
  days.forEach((day,i)=>{
    const value=Number(day.count||0),height=value?.12+Math.sqrt(value/max)*1.7:.045;
    const x=-4.3+Math.floor(i/7)*.68,z=-2.45+(i%7)*.68;
    dummy.position.set(x,height/2+.12,z);dummy.scale.set(1,height,1);dummy.updateMatrix();
    cubes.setMatrixAt(i,dummy.matrix);
    const ratio=value/max;
    color.set(themeColor(value?(ratio>.72?"#E58B67":ratio>.36?"#B5A1E8":"#6E8BFF"):"#414753"));
    cubes.setColorAt(i,color);
    cubes.userData.items[i]={title:"GITHUB CONTRIBUTION",date:day.date,count:value};
    voxelTransforms.push({x,y:height/2+.12,z,height,phase:i*.13,count:value});
  });
  cubes.count=days.length;cubes.instanceMatrix.needsUpdate=true;
  if(cubes.instanceColor)cubes.instanceColor.needsUpdate=true;
  cubes.castShadow=true;cubes.receiveShadow=true;
  group.add(cubes);pickables.push(cubes);
  // Weekly edge rails make the calendar's 7-row structure easier to read in perspective.
  for(let w=0;w<13;w++){
    const rail=addBox(group,[.025,.035,5.0],[-4.3+w*.68,.10,0],"#596273");
    rail.material.transparent=true;rail.material.opacity=.48;
  }
  cubes.userData.detail={title:"CONTRIBUTION TERRAIN",line1:"12-month total: "+metric(platform,"CONTRIBUTIONS · 12M"),line2:"Hover individual daily voxels"};
  return {group,pickables,animate:t=>{
    cubes.rotation.y=Math.sin(t*.15)*.012;
    voxelTransforms.forEach((voxel,i)=>{
      const breathe=voxel.count>0?Math.sin(t*1.35+voxel.phase)*.035:0;
      dummy.position.set(voxel.x,voxel.y+breathe,voxel.z);
      dummy.scale.set(1,voxel.height,1);
      dummy.updateMatrix();
      cubes.setMatrixAt(i,dummy.matrix);
    });
    cubes.instanceMatrix.needsUpdate=true;
  }};
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
    renderer.shadowMap.enabled=true;
    renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    host.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight("#F2EFE8","#414753",2.1));
    const key=new THREE.DirectionalLight("#FFFFFF",3.4);key.position.set(-5,10,7);scene.add(key);
    const rim=new THREE.DirectionalLight(moodColorForPlatform(id),2.25);rim.position.set(7,5,-5);scene.add(rim);
    const fill=new THREE.PointLight(colorMoods[settings.colorMood].gold,15,24);fill.position.set(5,5,-5);scene.add(fill);
    const particles=createAmbientParticles(scene,id);
    const aura=new THREE.PointLight(moodColorForPlatform(id),7,18);aura.position.set(-4,2.2,3);scene.add(aura);
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
      rimLight:rim,fillLight:fill,auraLight:aura,particles:particles.points,particleMaterial:particles.material,
      model:null,pickables:[],animate:null,visible:true,manualRotation:true,hoveredObject:null,
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
      if(!hits.length){
        tooltip.hidden=true;
        if(record.hoveredObject){
          const previous=record.hoveredObject;
          if(previous.userData.hoverTween)previous.userData.hoverTween.kill();
          if(previous.userData.baseScale)gsap.to(previous.scale,{x:previous.userData.baseScale.x,y:previous.userData.baseScale.y,z:previous.userData.baseScale.z,duration:.2,ease:"power2.out"});
          record.hoveredObject=null;
        }
        renderer.domElement.style.cursor="grab";
        return;
      }
      const hit=hits[0];
      if(record.hoveredObject!==hit.object){
        if(record.hoveredObject&&record.hoveredObject.userData.baseScale){
          const previous=record.hoveredObject;
          gsap.to(previous.scale,{x:previous.userData.baseScale.x,y:previous.userData.baseScale.y,z:previous.userData.baseScale.z,duration:.18,ease:"power2.out"});
        }
        record.hoveredObject=hit.object;
        if(!hit.object.userData.baseScale)hit.object.userData.baseScale=hit.object.scale.clone();
        if(!(hit.object instanceof THREE.InstancedMesh)&&!settings.reducedMotion){
          gsap.to(hit.object.scale,{x:hit.object.userData.baseScale.x*1.08,y:hit.object.userData.baseScale.y*1.08,z:hit.object.userData.baseScale.z*1.08,duration:.18,ease:"back.out(2)"});
        }
        renderer.domElement.style.cursor="pointer";
      }
      let detail=hit.object.userData.detail;
      if(hit.instanceId!==undefined&&hit.object.userData.items)detail=hit.object.userData.items[hit.instanceId];
      let parent=hit.object.parent;
      while(!detail&&parent){detail=parent.userData.detail;parent=parent.parent;}
      if(!detail){tooltip.hidden=true;return;}
      tooltip.hidden=false;
      tooltip.style.left=Math.max(8,Math.min(rect.width-190,event.clientX-rect.left+12))+"px";
      tooltip.style.top=Math.max(46,Math.min(rect.height-85,event.clientY-rect.top+10))+"px";
      tooltip.innerHTML="<strong>"+esc(detail.title||"ACTIVITY")+"</strong><span>"+esc(detail.date||detail.line1||"Platform data")+"</span><span>"+esc(detail.count!==undefined?"Activity: "+detail.count:(detail.line2||"Inspect platform statistics"))+"</span>";
    });
    renderer.domElement.addEventListener("pointerleave",()=>{
      tooltip.hidden=true;
      renderer.domElement.style.cursor="grab";
      if(record.hoveredObject&&record.hoveredObject.userData.baseScale&&!settings.reducedMotion){
        const previous=record.hoveredObject;
        gsap.to(previous.scale,{x:previous.userData.baseScale.x,y:previous.userData.baseScale.y,z:previous.userData.baseScale.z,duration:.18,ease:"power2.out"});
      }
      record.hoveredObject=null;
    });

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
  record.hoveredObject=null;
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
function renderActivityInsights(platforms){
  $('activity-insights').innerHTML=platforms.map(original=>{
    const p=rangedPlatform(original),days=p.dailyActivity||[];
    const total=days.reduce((sum,day)=>sum+Number(day.count||0),0);
    const active=p.activityAvailable?days.filter(day=>Number(day.count||0)>0).length:null;
    const peak=days.reduce((best,day)=>Number(day.count||0)>Number(best&&best.count||0)?day:best,null);
    const average=active?(total/active).toFixed(1):'0.0';
    return '<article class="activity-insight" data-source="'+esc(p.id)+'"><div class="insight-top"><span>'+esc(p.label)+'</span><span>'+settings.range+' DAYS</span></div><strong>'+n(total)+'</strong><small>TOTAL ACTIVITY EVENTS</small><div class="insight-meta"><span>'+n(active)+' ACTIVE DAYS</span><span>AVG '+average+'/ACTIVE DAY</span></div><div class="insight-peak"><span>PEAK DAY</span><b>'+(peak&&Number(peak.count)>0?esc(dateLabel(peak.date))+' · '+n(peak.count):'NO ACTIVITY')+'</b></div></article>';
  }).join('');
}
function renderCalendars(platforms){
  $('combined-heatmaps').innerHTML=platforms.map(original=>{
    const p=rangedPlatform(original),days=p.dailyActivity||[];
    const max=Math.max(1,...days.map(day=>Number(day.count||0)));
    const active=p.activityAvailable?days.filter(day=>Number(day.count||0)>0).length:null;
    const total=days.reduce((sum,day)=>sum+Number(day.count||0),0);
    const peak=days.reduce((best,day)=>Number(day.count||0)>Number(best&&best.count||0)?day:best,null);
    const first=days.length?new Date(days[0].date+'T00:00:00Z'):new Date();
    const offset=(first.getUTCDay()+6)%7;
    const weeks=Math.max(1,Math.ceil((offset+days.length)/7));
    const slots=Array(offset).fill(null).concat(days);
    while(slots.length<weeks*7)slots.push(null);
    const weekday=['M','T','W','T','F','S','S'];
    const labels='<div class="weekday-labels">'+weekday.map(x=>'<span>'+x+'</span>').join('')+'</div>';
    let columns='';
    for(let w=0;w<weeks;w++){
      let cells='';
      for(let d=0;d<7;d++){
        const day=slots[w*7+d];
        if(!day){cells+='<span class="calendar-cell is-empty"></span>';continue;}
        const count=Number(day.count||0);
        cells+='<span class="calendar-cell" data-level="'+level(count,max)+'" title="'+esc(day.date)+' · '+count+' activity events"></span>';
      }
      columns+='<div class="calendar-week">'+cells+'</div>';
    }
    const trend=days.slice(-14),trendMax=Math.max(1,...trend.map(day=>Number(day.count||0)));
    const bars=trend.map(day=>{const value=Number(day.count||0),height=value?Math.max(8,Math.round(value/trendMax*100)):3;return '<span class="trend-bar" style="--bar-height:'+height+'%" title="'+esc(day.date)+' · '+value+' events"></span>';}).join('');
    const monthMarks=[];let lastMonth='';
    days.forEach((day,index)=>{const month=day.date.slice(0,7);if(month!==lastMonth){monthMarks.push({week:Math.floor((offset+index)/7),label:new Date(day.date+'T00:00:00Z').toLocaleDateString('en-IN',{month:'short',timeZone:'UTC'})});lastMonth=month;}});
    const monthLabels=monthMarks.map(mark=>'<span style="grid-column:'+(mark.week+1)+'">'+esc(mark.label)+'</span>').join('');
    return '<article class="calendar-card" data-source="'+esc(p.id)+'" style="--heat-accent:'+moodColorForPlatform(p.id)+'">'+
      '<div class="calendar-card-head"><div><strong>'+esc(p.label)+'</strong><small>'+settings.range+' DAYS · DAILY ACTIVITY MAP</small></div><span>'+n(active)+' ACTIVE</span></div>'+
      '<div class="calendar-months" style="--week-count:'+weeks+'"><span></span>'+monthLabels+'</div>'+
      '<div class="calendar-layout">'+labels+'<div class="calendar-weeks" style="--week-count:'+weeks+'">'+columns+'</div></div>'+
      '<div class="calendar-stats"><div><b>'+n(total)+'</b><span>TOTAL EVENTS</span></div><div><b>'+n(active)+'</b><span>ACTIVE DAYS</span></div><div><b>'+(peak&&Number(peak.count)>0?n(peak.count):'—')+'</b><span>PEAK DAY</span></div></div>'+
      '<div class="trend-head"><span>LAST 14 DAYS · ACTIVITY TREND</span><span>PEAK '+n(trendMax)+'</span></div><div class="trend-chart">'+bars+'</div>'+
      '<div class="calendar-foot"><span>'+(days.length?dateLabel(days[0].date):'—')+'</span><span>DAILY HISTORY</span><span>'+(days.length?dateLabel(days[days.length-1].date):'—')+'</span></div>'+
      '<div class="intensity-legend"><span>LESS</span><i data-level="0"></i><i data-level="1"></i><i data-level="2"></i><i data-level="3"></i><i data-level="4"></i><span>MORE</span></div></article>';
  }).join('');
  if(!settings.reducedMotion)gsap.fromTo('.calendar-card',{y:18,opacity:0,scale:.985},{y:0,opacity:1,scale:1,duration:.55,stagger:.08,ease:'power3.out'});
}
function updateDashboard(data){
  currentSnapshot=data;
  const platforms=data.platforms||[];
  setCounter($("platform-count"),platforms.length,2);
  const active=platforms.reduce((sum,p)=>sum+(Number(rangedPlatform(p).activeDays)||0),0);
  setCounter($("total-active"),active);
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
  renderActivityInsights(platforms);
  renderCalendars(platforms);
  $("connection-status").textContent="CONNECTED";
  $("connection-status").style.color="var(--cobalt)";
  if(!settings.reducedMotion)gsap.fromTo(".overview-card",{y:8,opacity:.65},{y:0,opacity:1,duration:.45,stagger:.06,ease:"power2.out"});
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
    record.controls.autoRotate=motionEnabled()&&record.manualRotation;
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
    record.manualRotation=!record.manualRotation;
    record.controls.autoRotate=record.manualRotation&&motionEnabled();
    button.textContent=record.manualRotation?"PAUSE":"RESUME";
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
  $("color-mode-toggle").addEventListener("click",()=>{
    applyColorMood(settings.colorMood==="graphite"?"prism":"graphite");
    if(!settings.reducedMotion){
      gsap.fromTo(".model-card",{filter:"brightness(.78)",y:3},{filter:"brightness(1)",y:0,duration:.58,stagger:.065,ease:"power3.out",clearProps:"filter,transform"});
      gsap.fromTo(".calendar-card",{filter:"brightness(.82)"},{filter:"brightness(1)",duration:.48,stagger:.045,ease:"power2.out",clearProps:"filter"});
    }
  });
  applyColorMood("graphite");
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
    if(motionEnabled()){
      if(record.animate)record.animate(time);
      record.particles.rotation.y=time*.018;
      record.particles.rotation.x=Math.sin(time*.22)*.025;
      record.auraLight.position.x=Math.cos(time*.42)*4.5;
      record.auraLight.position.z=Math.sin(time*.42)*4.5;
      record.auraLight.intensity=6.2+Math.sin(time*1.4)*1.4;
      record.rimLight.intensity=1.9+Math.sin(time*.9)*.24;
      if(settings.quality==="high")record.bloom.strength=.12+Math.sin(time*1.1)*.018;
    }
    if(settings.quality==="low")record.renderer.render(record.scene,record.camera);
    else record.composer.render();
  });
  animationFrame=requestAnimationFrame(animate);
}
function setCounter(element,target,pad=0){
  if(!element)return;
  const finalValue=Number(target);
  if(!Number.isFinite(finalValue)){element.textContent=String(target??"—");return;}
  if(settings.reducedMotion){element.textContent=String(finalValue).padStart(pad,"0");return;}
  const value={count:0};
  gsap.to(value,{count:finalValue,duration:.8,ease:"power2.out",onUpdate:()=>{
    element.textContent=Math.round(value.count).toString().padStart(pad,"0");
  }});
}
function setupMagneticInteractions(){
  if(settings.reducedMotion)return;
  document.querySelectorAll(".toolbar-action,.outline-link,.connection-actions button").forEach(element=>{
    element.addEventListener("pointermove",event=>{
      const rect=element.getBoundingClientRect();
      const dx=event.clientX-(rect.left+rect.width/2);
      const dy=event.clientY-(rect.top+rect.height/2);
      gsap.to(element,{x:dx*.08,y:dy*.08,duration:.22,ease:"power2.out",overwrite:true});
    });
    element.addEventListener("pointerleave",()=>{
      gsap.to(element,{x:0,y:0,duration:.35,ease:"power2.out",overwrite:true});
    });
  });
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
  setupMagneticInteractions();
  const prefersReduced=window.matchMedia("(prefers-reduced-motion: reduce)");
  if(prefersReduced.matches)settings.reducedMotion=true;
  await refresh(false);
  setInterval(()=>refresh(false),POLL_MS);
  setTimeAndCountdown();
  animate();
  $("refresh-now").addEventListener("click",()=>refresh(true));
}
init();
