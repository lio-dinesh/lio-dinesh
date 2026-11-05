const COACH_FUNCTION_URL="https://bdbnblvdnxxhojnbtpxi.supabase.co/functions/v1/ai-performance-coach";
const coachState={last:null,loading:false};

function coachSnapshot(platforms){
  const days=(p)=>p.dailyActivity||[];
  const range=settings.range;
  return {
    generated_at:new Date().toISOString(),
    range_days:range,
    platforms:platforms.map(p=>({
      id:p.id,label:p.label,handle:p.handle,
      current_streak:p.currentStreak,longest_streak:p.longestStreak,
      active_days:p.activeDays,last_active_date:p.lastActiveDate,
      metrics:p.metrics||[],
      activity:days(p).slice(-range)
    }))
  };
}

function deterministicCoach(snapshot){
  const ps=snapshot.platforms;
  const consistency=ps.map(p=>{
    const active=p.activity.filter(d=>Number(d.count)>0).length;
    return {...p,ratio:active/Math.max(1,p.activity.length)};
  }).sort((a,b)=>b.ratio-a.ratio);
  const streak=ps.filter(p=>Number.isFinite(Number(p.current_streak))).sort((a,b)=>Number(b.current_streak)-Number(a.current_streak))[0];
  const totalActive=ps.reduce((s,p)=>s+p.activity.filter(d=>Number(d.count)>0).length,0);
  const score=Math.max(0,Math.min(100,Math.round(45+(consistency[0]?.ratio||0)*25+(streak?Math.min(20,Number(streak.current_streak)):0)+Math.min(10,totalActive/4))));
  const strengths=[];
  const weaknesses=[];
  if(consistency[0])strengths.push(consistency[0].label+" consistency");
  if(streak&&Number(streak.current_streak)>=7)strengths.push(streak.label+" streak");
  const low=consistency.filter(x=>x.ratio<.35).slice(0,2);
  low.forEach(x=>weaknesses.push(x.label+" needs more regular practice"));
  if(!weaknesses.length)weaknesses.push("Keep all four practice lanes balanced");
  return {
    summary:"Your strongest signal is consistency. Keep the routine small enough to repeat and increase difficulty only after the habit is stable.",
    performance_score:score,
    trend:"steady",
    strengths,weaknesses,
    today_plan:[
      {platform:"Monkeytype",task:"15 minutes of focused typing",reason:"Build speed without sacrificing accuracy."},
      {platform:"LeetCode",task:"1 problem at your current edge",reason:"Prioritize one complete solution over volume."},
      {platform:"CodeChef",task:"1 problem or one contest review",reason:"Keep competitive problem-solving active."},
      {platform:"GitHub",task:"1 meaningful commit",reason:"Turn learning into visible shipped work."}
    ],
    recommendations:["Protect a repeatable daily baseline.","Review mistakes before increasing difficulty.","Use the 7-day trend to decide tomorrow's workload."]
  };
}

function renderCoach(data,meta={}){
  const host=document.getElementById("ai-coach-panel");
  if(!host)return;
  const score=Math.round(Number(data.performance_score)||0);
  const strengths=(data.strengths||[]).slice(0,3);
  const weaknesses=(data.weaknesses||[]).slice(0,3);
  const plan=(data.today_plan||[]).slice(0,4);
  host.innerHTML=`
    <div class="coach-head">
      <div><p class="eyebrow">AI PERFORMANCE COACH</p><h2>Practice with intention.</h2><p class="coach-summary">${esc(data.summary||"Your coach is ready.")}</p></div>
      <div class="coach-score"><span>PERFORMANCE</span><strong>${score}</strong><small>/ 100 · ${esc(data.trend||"steady")}</small></div>
    </div>
    <div class="coach-grid">
      <div class="coach-column"><span class="coach-label">STRENGTH SIGNALS</span>${strengths.map(x=>`<div class="coach-item positive"><i>+</i><span>${esc(x)}</span></div>`).join("")||"<div class=\"coach-item\"><span>Building signal…</span></div>"}</div>
      <div class="coach-column"><span class="coach-label">WATCH NEXT</span>${weaknesses.map(x=>`<div class="coach-item caution"><i>↗</i><span>${esc(x)}</span></div>`).join("")}</div>
      <div class="coach-column coach-plan"><span class="coach-label">TODAY'S PLAN</span>${plan.map(x=>`<div class="coach-plan-row"><strong>${esc(x.platform)}</strong><span>${esc(x.task)}</span><small>${esc(x.reason||"Based on your recent data.")}</small></div>`).join("")}</div>
    </div>
    <div class="coach-footer"><span>${meta.ai?"GEMINI ANALYSIS · SOURCE DATA VERIFIED":"LOCAL ANALYSIS · ADD GEMINI_API_KEY TO ENABLE AI REASONING"}</span><button id="coach-refresh" type="button">${coachState.loading?"ANALYZING…":"↻ ANALYZE AGAIN"}</button></div>`;
  const btn=document.getElementById("coach-refresh");
  if(btn)btn.addEventListener("click",()=>runAICoach(currentSnapshot?.platforms||[]));
}

async function runAICoach(platforms){
  if(coachState.loading)return;
  coachState.loading=true;
  renderCoach(coachState.last||deterministicCoach(coachSnapshot(platforms)),{ai:false});
  try{
    const snapshot=coachSnapshot(platforms);
    const res=await fetch(COACH_FUNCTION_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({snapshot})});
    const payload=await res.json();
    if(!res.ok)throw new Error(payload.error||"Coach request failed");
    coachState.last=payload;
    renderCoach(payload,{ai:true});
  }catch(error){
    coachState.last=deterministicCoach(coachSnapshot(platforms));
    renderCoach(coachState.last,{ai:false});
    const status=document.getElementById("coach-status");
    if(status)status.textContent="Fallback analysis active · "+error.message;
  }finally{
    coachState.loading=false;
  }
}

window.initAIPerformanceCoach=()=>{if(currentSnapshot)runAICoach(currentSnapshot.platforms);};
window.addEventListener("load",()=>{setTimeout(()=>{if(currentSnapshot)runAICoach(currentSnapshot.platforms)},900);});
