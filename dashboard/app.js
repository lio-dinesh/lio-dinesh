import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const DATA_URL="./data.json";
const POLL_MS=30000;
const colors={
  monkeytype:"#C17A5B",
  leetcode:"#78816A",
  codechef:"#A66B4F",
  github:"#66695F"
};
const records=new Map();
let currentSnapshot=null;
let lastFetch=0;
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
  return new THREE.MeshStandardMaterial({color,roughness:.55,metalness:.08,...extra});
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
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(15,11),material("#E4E7DA",{roughness:.98}));
  floor.rotation.x=-Math.PI/2;floor.position.y=-.12;scene.add(floor);
  const grid=new THREE.GridHelper(14,28,"#B5B9AA","#D0D0C5");
  grid.position.y=-.105;grid.material.transparent=true;grid.material.opacity=.55;scene.add(grid);
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
  addBox(group,[8.8,.36,3.4],[0,.2,0],"#34372F");
  addBox(group,[8.4,.08,3.04],[0,.42,0],"#78816A");
  const days=platform.dailyActivity||[];
  for(let r=0;r<4;r++)for(let c=0;c<11;c++){
    const i=(r*11+c)%Math.max(1,days.length),day=days[i]||{count:0,date:""};
    const isAccent=(r+c)%9===0;
    const key=addBox(group,[.62,.21,.55],[-3.76+c*.75,.59,-1.06+r*.68],
      isAccent?"#C17A5B":"#F7F4ED",
      {title:"KEY "+(r+1)+"-"+(c+1),line1:"Activity: "+(day.count||0),line2:day.date||"Typing practice"});
    key.userData.homeY=key.position.y;key.userData.phase=(r*11+c)*.19;
    pickables.push(key);animated.push(key);
  }
  const space=addBox(group,[3.15,.18,.53],[0,.58,1.16],"#E5D8C6",
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
    {label:"EASY",value:metric(platform,"EASY"),color:"#78816A"},
    {label:"MEDIUM",value:metric(platform,"MEDIUM"),color:"#C17A5B"},
    {label:"HARD",value:metric(platform,"HARD"),color:"#34372F"}
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
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.9,.045,10,48),material("#C17A5B",{metalness:.22}));
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
  addBox(group,[8.4,.25,4.8],[0,.02,0],"#E5D8C6");
  addBox(group,[5,.32,2.6],[0,.3,0],"#78816A");
  addBox(group,[3.65,.38,1.95],[0,.65,0],"#C17A5B");
  addBox(group,[2.35,.42,1.35],[0,1.05,0],"#34372F");
  const trophy=new THREE.Group();
  const cup=new THREE.Mesh(new THREE.CylinderGeometry(.49,.78,.78,40),material("#C17A5B",{metalness:.38,roughness:.3}));
  cup.position.y=2.05;trophy.add(cup);
  const stem=new THREE.Mesh(new THREE.CylinderGeometry(.16,.22,.66,24),material("#A66B4F",{metalness:.32}));
  stem.position.y=1.36;trophy.add(stem);
  const foot=new THREE.Mesh(new THREE.CylinderGeometry(.68,.72,.16,36),material("#34372F",{metalness:.3}));
  foot.position.y=1.05;trophy.add(foot);
  const rim=new THREE.Mesh(new THREE.TorusGeometry(.51,.065,10,48),material("#A66B4F",{metalness:.4}));
  rim.rotation.x=Math.PI/2;rim.position.y=2.45;trophy.add(rim);
  for(const side of [-1,1]){
    const handle=new THREE.Mesh(new THREE.TorusGeometry(.32,.065,10,36,Math.PI),material("#C17A5B",{metalness:.3}));
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
      i%3===0?"#C17A5B":"#78816A",
      {title:"CONTEST ACTIVITY",line1:day.date,line2:"Daily submissions: "+value});
    pickables.push(bar);
  });
  return {group,pickables,animate:t=>{trophy.rotation.y=t*.42;trophy.position.y=Math.sin(t*1.25)*.055;}};
}
function makeGitHub(platform){
  const group=new THREE.Group(),pickables=[];
  addBox(group,[9,.22,6],[0,-.02,0],"#E5D8C6");
  const days=platform.dailyActivity||[],max=Math.max(1,...days.map(x=>Number(x.count||0)));
  const geometry=new THREE.BoxGeometry(.43,1,.43);
  const material3d=material("#78816A",{roughness:.48,metalness:.08});
  const cubes=new THREE.InstancedMesh(geometry,material3d,Math.max(days.length,1));
  const dummy=new THREE.Object3D(),color=new THREE.Color();
  cubes.userData.items=[];
  days.forEach((day,i)=>{
    const value=Number(day.count||0),height=value?.12+Math.sqrt(value/max)*1.7:.04;
    const x=-4.05+Math.floor(i/7)*.68,z=-2.38+(i%7)*.68;
    dummy.position.set(x,height/2+.09,z);dummy.scale.set(1,height,1);dummy.updateMatrix();
    cubes.setMatrixAt(i,dummy.matrix);
    const ratio=value/max;
    color.set(value?(ratio>.7?"#C17A5B":ratio>.35?"#78816A":"#A6A995"):"#D8D4C9");
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
    scene.background=new THREE.Color("#EAE6DC");
    scene.fog=new THREE.Fog("#EAE6DC",15,30);
    const camera=new THREE.PerspectiveCamera(40,host.clientWidth/host.clientHeight,.1,70);
    camera.position.set(9,8,11);
    const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:"high-performance"});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
    renderer.setSize(host.clientWidth,host.clientHeight);
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight("#fffaf0","#78816A",2.25));
    const key=new THREE.DirectionalLight("#ffffff",3.1);key.position.set(-5,10,7);scene.add(key);
    const fill=new THREE.PointLight("#C17A5B",12,22);fill.position.set(5,5,-5);scene.add(fill);
    addBase(scene);
    const controls=new OrbitControls(camera,renderer.domElement);
    controls.target.set(0,1,0);controls.enableDamping=true;controls.dampingFactor=.07;
    controls.minDistance=6;controls.maxDistance=20;controls.maxPolarAngle=Math.PI*.47;
    controls.autoRotate=true;controls.autoRotateSpeed=.33;
    const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
    const record={id,host,scene,camera,renderer,controls,raycaster,pointer,model:null,pickables:[],animate:null,reset:{position:new THREE.Vector3(9,8,11),target:new THREE.Vector3(0,1,0)}};
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
      tooltip.style.left=Math.max(8,Math.min(rect.width-180,event.clientX-rect.left+12))+"px";
      tooltip.style.top=Math.max(48,Math.min(rect.height-80,event.clientY-rect.top+10))+"px";
      tooltip.innerHTML="<strong>"+esc(detail.title||"ACTIVITY")+"</strong><span>"+esc(detail.date||detail.line1||"Platform data")+"</span><span>"+esc(detail.count!==undefined?"Activity: "+detail.count:(detail.line2||"Inspect platform statistics"))+"</span>";
    });
    renderer.domElement.addEventListener("pointerleave",()=>{tooltip.hidden=true;});
    new ResizeObserver(()=>{
      const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;
      camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h);
    }).observe(host);
  }catch(error){
    console.error("3D model init failed",id,error);
    host.innerHTML='<div class="stat-placeholder">3D preview is unavailable in this browser. The data breakdown remains available below.</div>';
  }
}
function updateScene(platform){
  const record=records.get(platform.id);
  if(!record)return;
  if(record.model){record.scene.remove(record.model);disposeGroup(record.model);}
  const built=builders[platform.id](platform);
  record.model=built.group;record.pickables=built.pickables;record.animate=built.animate;
  record.scene.add(record.model);
}
function renderPlatform(platform){
  const id=platform.id;
  $("status-"+id).textContent=(platform.status||"PROFILE")+" · "+(platform.activityAvailable?"ACTIVITY AVAILABLE":"ACTIVITY PRIVATE");
  $("stats-"+id).innerHTML=(platform.metrics||[]).slice(0,4).map(item=>
    '<div class="platform-stat"><strong>'+esc(item.value)+'</strong><span>'+esc(item.label)+'</span></div>'
  ).join("")||'<div class="stat-placeholder">No public metrics returned</div>';
  const days=platform.dailyActivity||[],max=Math.max(1,...days.map(x=>Number(x.count||0)));
  $("heatmap-"+id).innerHTML='<div class="mini-heatmap-head"><span>13-WEEK SOURCE ACTIVITY</span><span>'+(platform.activityAvailable?n(platform.activeDays)+" ACTIVE DAYS":"ACTIVITY PRIVATE")+'</span></div><div class="mini-heatmap-cells">'+days.map(day=>'<span class="mini-cell" data-level="'+level(Number(day.count||0),max)+'" title="'+esc(day.date)+' · '+Number(day.count||0)+' activity"></span>').join("")+'</div>';
}
function renderCalendars(platforms){
  $("combined-heatmaps").innerHTML=platforms.map(p=>{
    const days=p.dailyActivity||[],max=Math.max(1,...days.map(x=>Number(x.count||0)));
    return '<article class="calendar-card"><div class="calendar-card-head"><strong>'+esc(p.label)+'</strong><span>'+(p.activityAvailable?n(p.activeDays)+" ACTIVE DAYS":"ACTIVITY PRIVATE")+'</span></div><div class="calendar-cells">'+days.map(d=>'<span class="calendar-cell" data-level="'+level(Number(d.count||0),max)+'" title="'+esc(d.date)+' · '+Number(d.count||0)+' activity"></span>').join("")+'</div><div class="calendar-foot"><span>'+(days.length?dateLabel(days[0].date):"—")+'</span><span>91 DAYS</span><span>'+(days.length?dateLabel(days[days.length-1].date):"—")+'</span></div></article>';
  }).join("");
}
function updateDashboard(data){
  currentSnapshot=data;
  const platforms=data.platforms||[];
  $("platform-count").textContent=String(platforms.length).padStart(2,"0");
  $("total-active").textContent=n(platforms.reduce((sum,p)=>sum+(Number(p.activeDays)||0),0));
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
  $("connection-status").style.color=palette.olive;
}
async function refresh(manual=false){
  const button=$("refresh-now");
  if(manual){button.disabled=true;button.textContent="Checking…";}
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
    $("connection-status").style.color=palette.terracotta;
  }finally{
    if(manual){button.disabled=false;button.textContent="↻ Refresh data";}
  }
}
function setControls(){
  document.querySelectorAll("[data-reset]").forEach(button=>button.addEventListener("click",()=>{
    const record=records.get(button.dataset.reset);if(!record)return;
    record.camera.position.copy(record.reset.position);
    record.controls.target.copy(record.reset.target);
    record.controls.update();
  }));
  document.querySelectorAll("[data-autorotate]").forEach(button=>button.addEventListener("click",()=>{
    const record=records.get(button.dataset.autorotate);if(!record)return;
    record.controls.autoRotate=!record.controls.autoRotate;
    button.textContent=record.controls.autoRotate?"PAUSE ROTATION":"RESUME ROTATION";
  }));
}
function animate(){
  const t=performance.now()/1000;
  records.forEach(record=>{
    record.controls.update();
    if(record.animate)record.animate(t);
    record.renderer.render(record.scene,record.camera);
  });
  requestAnimationFrame(animate);
}
function clock(){
  const tick=()=>{
    $("clock").textContent=new Intl.DateTimeFormat("en-IN",{timeZone:"Asia/Kolkata",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).format(new Date())+" IST";
    const left=Math.max(0,POLL_MS-(Date.now()-lastFetch));
    $("next-refresh").textContent=lastFetch?"NEXT CHECK "+String(Math.ceil(left/1000)).padStart(2,"0")+"s":"CHECKING…";
  };
  tick();setInterval(tick,1000);
}
async function init(){
  setControls();
  await refresh(false);
  setInterval(()=>refresh(false),POLL_MS);
  clock();
  animate();
  $("refresh-now").addEventListener("click",()=>refresh(true));
}
init();
