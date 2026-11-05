const COACH_STORAGE_PREFIX="dcc-ai-coach-chat-v1:";
const coachState={last:null,history:[],loading:false,analysisLoading:false,userId:null,bound:false,autoStarted:false};

function coachBridge(){return window.commandCenterBridge||null;}
function coachEscape(value){
  return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function coachSnapshot(){
  const bridge=coachBridge();
  const data=bridge?.getSnapshot?.();
  const range=Number(bridge?.getRangeDays?.())||90;
  if(!data||!Array.isArray(data.platforms))return null;
  return {
    generated_at:data.generatedAt||new Date().toISOString(),
    generated_at_ist:data.generatedAtIST||null,
    activity_date:data.activityDate||null,
    range_days:range,
    platforms:data.platforms.map(p=>({
      id:p.id,label:p.label,handle:p.handle,
      status:p.status||"unknown",
      activity_available:Boolean(p.activityAvailable),
      current_streak:p.currentStreak??null,
      longest_streak:p.longestStreak??null,
      active_days:p.activeDays??null,
      last_active_date:p.lastActiveDate??null,
      metrics:Array.isArray(p.metrics)?p.metrics:[],
      activity:Array.isArray(p.dailyActivity)?p.dailyActivity.slice(-range):[]
    }))
  };
}
function localCoach(snapshot){
  const ps=snapshot?.platforms||[];
  const active=ps.map(p=>{
    const days=p.activity||[];
    const count=days.filter(d=>Number(d.count)>0).length;
    return {...p,ratio:count/Math.max(1,days.length)};
  }).sort((a,b)=>b.ratio-a.ratio);
  const best=active[0];
  const low=active.filter(p=>p.ratio<.35).slice(0,2);
  const current=ps.filter(p=>Number.isFinite(Number(p.current_streak))).sort((a,b)=>Number(b.current_streak)-Number(a.current_streak))[0];
  const score=Math.max(0,Math.min(100,Math.round(50+(best?.ratio||0)*25+(current?Math.min(15,Number(current.current_streak)):0))));
  return {
    summary:"Your local dashboard snapshot is loaded. Sign in with Cloud Settings Sync to ask Gemini for a personalised analysis and chat about your progress.",
    performance_score:score,trend:"snapshot-based",
    strengths:best?[best.label+" has the strongest active-day consistency in this window."]:["Your four platform feeds are connected."],
    weaknesses:low.map(p=>p.label+" has fewer active days in the selected period."),
    today_plan:[
      {platform:"Monkeytype",task:"Complete one focused 10–15 minute typing session.",reason:"Track accuracy alongside speed."},
      {platform:"LeetCode",task:"Solve one problem and review the final complexity.",reason:"Prioritise explanation and correctness."},
      {platform:"CodeChef",task:"Practise one problem or review a previous contest.",reason:"Keep competitive problem-solving active."},
      {platform:"GitHub",task:"Ship one small, documented improvement.",reason:"Turn practice into a useful project update."}
    ],
    recommendations:["Keep a repeatable daily baseline.","Review mistakes before increasing difficulty.","Use the same time window when comparing progress."]
  };
}
function ensureCoachMarkup(){
  const host=document.getElementById("ai-coach-panel");
  if(!host)return null;
  if(host.dataset.ready==="true")return host;
  host.innerHTML=`
    <div class="coach-head">
      <div><p class="eyebrow">AI PERFORMANCE COACH</p><h2>Practice with intention.</h2><p id="coach-summary" class="coach-summary">Loading your latest performance snapshot…</p></div>
      <div class="coach-score"><span>PERFORMANCE</span><strong id="coach-score">—</strong><small id="coach-trend">/ 100 · awaiting analysis</small></div>
    </div>
    <div class="coach-grid">
      <div class="coach-column"><span class="coach-label">STRENGTH SIGNALS</span><div id="coach-strengths"></div></div>
      <div class="coach-column"><span class="coach-label">WATCH NEXT</span><div id="coach-weaknesses"></div></div>
      <div class="coach-column coach-plan"><span class="coach-label">TODAY'S PLAN</span><div id="coach-plan"></div></div>
    </div>
    <div class="coach-recommendations" id="coach-recommendations"></div>
    <div class="coach-footer"><span id="coach-engine-status">LOCAL SNAPSHOT ANALYSIS</span><button id="coach-refresh" type="button">↻ ANALYZE LATEST DATA</button></div>
    <section class="coach-chat" aria-label="Chat with your AI performance coach">
      <div class="coach-chat-heading"><div><span class="coach-label">PRIVATE COACH CONVERSATION</span><h3>Ask about your progress.</h3><p>Chat about practice, weaknesses, study plans, coding goals and your next steps.</p></div><span id="coach-auth-status" class="coach-auth-status">CHECKING SIGN-IN…</span></div>
      <div id="coach-chat-log" class="coach-chat-log" aria-live="polite"></div>
      <div class="coach-prompts" aria-label="Suggested questions">
        <button type="button" data-coach-prompt="What should I practise today based on my latest data?">What should I practise today?</button>
        <button type="button" data-coach-prompt="Which platform or skill is my weakest right now, and why?">Find my weakest area</button>
        <button type="button" data-coach-prompt="Create a realistic 7-day improvement plan using my current activity.">Build a 7-day plan</button>
      </div>
      <form id="coach-chat-form" class="coach-chat-form">
        <label class="sr-only" for="coach-chat-input">Message your AI Performance Coach</label>
        <textarea id="coach-chat-input" rows="2" maxlength="1600" placeholder="Ask: How can I improve my LeetCode problem-solving?" disabled></textarea>
        <button id="coach-send" type="submit" disabled>SEND ↗</button>
      </form>
      <div class="coach-chat-foot"><span id="coach-chat-note">Sign in above using Cloud Settings Sync to enable Gemini chat.</span><span>SHIFT + ENTER FOR NEW LINE</span></div>
    </section>`;
  host.dataset.ready="true";
  host.addEventListener("click",event=>{
    const prompt=event.target.closest("[data-coach-prompt]");
    if(prompt)sendCoachMessage(prompt.dataset.coachPrompt);
    if(event.target.closest("#coach-refresh"))runAICoach(true);
  });
  host.addEventListener("submit",event=>{
    if(event.target.id!=="coach-chat-form")return;
    event.preventDefault();
    const input=document.getElementById("coach-chat-input");
    const message=input?.value.trim();
    if(message){input.value="";sendCoachMessage(message);}
  });
  host.addEventListener("keydown",event=>{
    if(event.target.id==="coach-chat-input"&&event.key==="Enter"&&!event.shiftKey){
      event.preventDefault();
      const form=document.getElementById("coach-chat-form");
      if(form?.requestSubmit)form.requestSubmit();
    }
  });
  return host;
}
function renderCoach(data,meta={}){
  ensureCoachMarkup();
  const $=id=>document.getElementById(id);
  if(!$("coach-summary"))return;
  $("coach-summary").textContent=data.summary||"Your coach is ready.";
  $("coach-score").textContent=String(Math.max(0,Math.min(100,Math.round(Number(data.performance_score)||0))));
  $("coach-trend").textContent="/ 100 · "+(data.trend||"steady");
  const list=(id,items,empty)=>$(id).innerHTML=(items||[]).slice(0,4).map((x,i)=>'<div class="coach-item '+(id==="coach-strengths"?"positive":"caution")+'"><i>'+(id==="coach-strengths"?"+":"↗")+'</i><span>'+coachEscape(x)+'</span></div>').join("")||'<div class="coach-item"><span>'+coachEscape(empty)+'</span></div>';
  list("coach-strengths",data.strengths,"Building strength signals…");
  list("coach-weaknesses",data.weaknesses,"No clear weakness detected in this snapshot.");
  $("coach-plan").innerHTML=(data.today_plan||[]).slice(0,4).map(x=>'<div class="coach-plan-row"><strong>'+coachEscape(x.platform)+'</strong><span>'+coachEscape(x.task)+'</span><small>'+coachEscape(x.reason||"Based on your recent data.")+'</small></div>').join("")||'<div class="coach-plan-row">No plan available yet.</div>';
  $("coach-recommendations").innerHTML=(data.recommendations||[]).slice(0,4).map(x=>'<span>'+coachEscape(x)+'</span>').join("");
  $("coach-engine-status").textContent=meta.ai?(meta.saved?"GEMINI 3.8 FLASH · INSIGHT SAVED TO SUPABASE":"GEMINI 3.8 FLASH · LIVE RESPONSE"):(meta.status||"LOCAL SNAPSHOT ANALYSIS");
  $("coach-refresh").disabled=coachState.analysisLoading;
  $("coach-refresh").textContent=coachState.analysisLoading?"ANALYZING…":"↻ ANALYZE LATEST DATA";
  renderChat();
}
function renderChat(typing=false){
  const log=document.getElementById("coach-chat-log");
  if(!log)return;
  const items=coachState.history.length?coachState.history:[{role:"assistant",content:"Hi Dinesh — I’m your performance coach. Ask me about your latest activity, what to practise next, your coding weaknesses, or a realistic study plan."}];
  log.innerHTML=items.map(m=>'<div class="coach-message '+(m.role==="user"?"user":"assistant")+'"><span>'+(m.role==="user"?"YOU":"COACH")+'</span><p>'+coachEscape(m.content)+'</p></div>').join("")+(typing?'<div class="coach-message assistant typing"><span>COACH</span><p>Thinking through your latest data…</p></div>':"");
  log.scrollTop=log.scrollHeight;
}
function setChatAvailability(session,reason=""){
  const input=document.getElementById("coach-chat-input");
  const send=document.getElementById("coach-send");
  const badge=document.getElementById("coach-auth-status");
  const note=document.getElementById("coach-chat-note");
  const signedIn=Boolean(session?.user);
  if(input)input.disabled=!signedIn||coachState.loading;
  if(send)send.disabled=!signedIn||coachState.loading;
  if(badge)badge.textContent=signedIn?"SIGNED IN · "+(session.user.email||"ACCOUNT ACTIVE"):"SIGN-IN REQUIRED";
  if(note)note.textContent=signedIn?"Gemini reads the latest four-platform snapshot. Chat history stays in this browser.":(reason||"Use Cloud Settings Sync above to sign in and enable Gemini chat.");
}
function saveChatHistory(){
  if(!coachState.userId)return;
  try{localStorage.setItem(COACH_STORAGE_PREFIX+coachState.userId,JSON.stringify(coachState.history.slice(-16)));}catch(error){console.warn("Coach chat could not be stored locally",error);}
}
function loadChatHistory(userId){
  coachState.userId=userId||null;
  coachState.history=[];
  if(!userId)return;
  try{
    const parsed=JSON.parse(localStorage.getItem(COACH_STORAGE_PREFIX+userId)||"[]");
    if(Array.isArray(parsed))coachState.history=parsed.filter(m=>["user","assistant"].includes(m.role)&&typeof m.content==="string").slice(-16);
  }catch(error){console.warn("Coach chat history could not be read",error);}
}
async function getCoachSession(){
  const bridge=coachBridge();
  const supabase=bridge?.getSupabase?.();
  if(!supabase)return {session:null,supabase:null};
  const {data,error}=await supabase.auth.getSession();
  if(error)throw error;
  return {session:data?.session||null,supabase};
}
async function runAICoach(force=false){
  if(coachState.analysisLoading)return;
  const snapshot=coachSnapshot();
  if(!snapshot)return;
  const local=localCoach(snapshot);
  coachState.analysisLoading=true;
  renderCoach(coachState.last||local,{status:"LOCAL SNAPSHOT · CONNECTING TO GEMINI"});
  try{
    const {session,supabase}=await getCoachSession();
    if(!session?.access_token){
      coachState.last=local;
      renderCoach(local,{status:"SIGN IN WITH CLOUD SETTINGS SYNC TO ENABLE GEMINI"});
      setChatAvailability(null);
      return;
    }
    const {data,error}=await supabase.functions.invoke("ai-performance-coach",{
      body:{action:"analyze",snapshot}
    });
    if(error)throw error;
    if(data?.error)throw new Error(data.error+(data.details?": "+data.details:""));
    coachState.last=data;
    renderCoach(data,{ai:true,saved:data.saved!==false});
    setChatAvailability(session);
  }catch(error){
    console.error("AI Performance Coach analysis failed",error);
    coachState.last=local;
    renderCoach(local,{status:"GEMINI UNAVAILABLE · LOCAL ANALYSIS ACTIVE"});
    const status=document.getElementById("coach-status");
    if(status)status.textContent="COACH CONNECTION ISSUE · "+String(error.message||error).slice(0,90);
    try{const {session}=await getCoachSession();setChatAvailability(session,"Gemini is unavailable. Check the function logs and API key.");}catch{}
  }finally{
    coachState.analysisLoading=false;
    const button=document.getElementById("coach-refresh");
    if(button){button.disabled=false;button.textContent="↻ ANALYZE LATEST DATA";}
    try{const {session}=await getCoachSession();setChatAvailability(session);}catch{}
  }
}
async function sendCoachMessage(text){
  const message=String(text||"").trim();
  if(!message||coachState.loading)return;
  if(message.length>1600)return;
  const snapshot=coachSnapshot();
  if(!snapshot){const note=document.getElementById("coach-chat-note");if(note)note.textContent="The platform snapshot is still loading. Try again in a moment.";return;}
  let session,supabase;
  try{
    ({session,supabase}=await getCoachSession());
  }catch(error){
    const note=document.getElementById("coach-chat-note");if(note)note.textContent="Could not read your Supabase session: "+error.message;
    return;
  }
  if(!session?.access_token){
    setChatAvailability(null,"Sign in through Cloud Settings Sync before sending a coach message.");
    return;
  }
  coachState.history.push({role:"user",content:message});
  coachState.history=coachState.history.slice(-16);
  saveChatHistory();
  coachState.loading=true;
  renderChat(true);
  setChatAvailability(session);
  try{
    const {data,error}=await supabase.functions.invoke("ai-performance-coach",{
      body:{
        action:"chat",
        message,
        history:coachState.history.slice(0,-1),
        snapshot
      }
    });
    if(error)throw error;
    if(data?.error)throw new Error(data.error+(data.details?": "+data.details:""));
    if(typeof data?.reply!=="string"||!data.reply.trim())throw new Error("The coach returned an empty reply.");
    coachState.history.push({role:"assistant",content:data.reply.trim()});
    coachState.history=coachState.history.slice(-16);
    saveChatHistory();
    renderChat();
    const note=document.getElementById("coach-chat-note");
    if(note)note.textContent="Gemini replied using your latest platform snapshot.";
  }catch(error){
    console.error("AI Performance Coach chat failed",error);
    coachState.history.push({role:"assistant",content:"I couldn't reach Gemini just now. "+String(error.message||error).slice(0,220)+" Please check your sign-in and Supabase function logs, then try again."});
    coachState.history=coachState.history.slice(-16);
    saveChatHistory();
    renderChat();
  }finally{
    coachState.loading=false;
    try{const {session}=await getCoachSession();setChatAvailability(session);}catch{}
    const input=document.getElementById("coach-chat-input");
    if(input&&!input.disabled)input.focus();
  }
}
function bindCoachAuth(){
  if(coachState.bound)return;
  const supabase=coachBridge()?.getSupabase?.();
  if(!supabase?.auth?.onAuthStateChange)return;
  coachState.bound=true;
  supabase.auth.onAuthStateChange((event,session)=>{
    if(event==="SIGNED_IN"||event==="INITIAL_SESSION"||event==="TOKEN_REFRESHED"){
      if(session?.user&&coachState.userId!==session.user.id)loadChatHistory(session.user.id);
      void maybeInitializeCoach();
    }
    if(event==="SIGNED_OUT"){
      coachState.autoStarted=false;
      coachState.last=null;
      loadChatHistory(null);
      const snapshot=coachSnapshot();
      if(snapshot)renderCoach(localCoach(snapshot),{status:"SIGNED OUT · LOCAL SNAPSHOT"});
      setChatAvailability(null);
    }
  });
}

async function maybeInitializeCoach(){
  bindCoachAuth();
  const snapshot=coachSnapshot();
  if(!snapshot)return;
  try{
    const {session}=await getCoachSession();
    if(session?.user){
      if(coachState.userId!==session.user.id)loadChatHistory(session.user.id);
      renderCoach(coachState.last||localCoach(snapshot),{status:"SIGNED IN · READY TO ANALYZE"});
      setChatAvailability(session);
      if(!coachState.autoStarted){
        coachState.autoStarted=true;
        await runAICoach();
      }
    }else{
      if(coachState.userId)loadChatHistory(null);
      renderCoach(coachState.last||localCoach(snapshot),{status:"LOCAL SNAPSHOT · SIGN IN FOR GEMINI"});
      setChatAvailability(null);
    }
  }catch(error){
    renderCoach(localCoach(snapshot),{status:"LOCAL SNAPSHOT · AUTH CHECK FAILED"});
    setChatAvailability(null);
  }
}
window.initAIPerformanceCoach=()=>void maybeInitializeCoach();
window.onDashboardSnapshotUpdated=()=>{if(!coachState.autoStarted)void maybeInitializeCoach();};
window.addEventListener("load",()=>setTimeout(()=>void maybeInitializeCoach(),800));
// Auth listener is attached lazily after the dashboard bridge is available.
