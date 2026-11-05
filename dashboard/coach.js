const COACH_STORAGE_PREFIX="dcc-ai-coach-chat-v1:";
const coachState={last:null,history:[],loading:false,analysisLoading:false,testing:false,userId:null,bound:false,autoStarted:false};

function coachBridge(){return window.commandCenterBridge||null;}
function coachEscape(value){
  return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
async function coachErrorDetails(error){
  let detail="";
  let status=error?.context?.status||error?.status||null;
  try{
    const response=error?.context;
    if(response&&typeof response.clone==="function"){
      const copy=response.clone();
      const payload=await copy.json().catch(async()=>{
        const text=await response.clone().text().catch(()=> "");
        return text?{error:text}:null;
      });
      if(payload&&typeof payload==="object"){
        detail=String(payload.details||payload.error||payload.message||"");
        if(payload.code)detail+=" · "+String(payload.code);
      }else if(payload)detail=String(payload);
    }
  }catch(parseError){console.warn("Could not read Edge Function error response",parseError);}
  const base=String(error?.message||"Request failed.");
  const statusText=status?" (HTTP "+status+")":"";
  const extra=detail&&detail!==base?" · "+detail:"";
  return (base+statusText+extra).slice(0,420);
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
      <div class="coach-score"><span>PERFORMANCE INDEX</span><strong id="coach-score">—</strong><small id="coach-trend">/ 100 · awaiting analysis</small></div>
    </div>
    <div class="coach-score-breakdown" id="coach-score-breakdown"></div>
    <div class="coach-grid">
      <div class="coach-column"><span class="coach-label">YOUR STRENGTHS</span><div id="coach-strengths"></div></div>
      <div class="coach-column"><span class="coach-label">BEST NEXT IMPROVEMENTS</span><div id="coach-weaknesses"></div></div>
      <div class="coach-column coach-plan"><span class="coach-label">TODAY'S ACTION PLAN</span><div id="coach-plan"></div></div>
    </div>
    <section class="coach-detail-section"><div class="coach-detail-heading"><div><span class="coach-label">FOUR-PLATFORM REVIEW</span><h3>What your activity is telling us</h3></div><span>MEASURED EVIDENCE → NEXT STEP</span></div><div class="coach-platform-grid" id="coach-platform-insights"></div></section>
    <section class="coach-detail-section"><div class="coach-detail-heading"><div><span class="coach-label">YOUR NEXT SEVEN DAYS</span><h3>A realistic improvement rhythm</h3></div><span>DATED · ACTIONABLE · FLEXIBLE</span></div><div class="coach-week-grid" id="coach-weekly-plan"></div></section>
    <section class="coach-recommendation-section"><span class="coach-label">PRIORITISED RECOMMENDATIONS</span><div class="coach-recommendations" id="coach-recommendations"></div><div id="coach-data-gaps" class="coach-data-gaps"></div></section>
    <div class="coach-footer"><span id="coach-engine-status">LOCAL SNAPSHOT ANALYSIS</span><div class="coach-footer-actions"><button id="coach-test" type="button">✓ TEST GEMINI</button><button id="coach-refresh" type="button">↻ ANALYZE LATEST DATA</button></div></div>
    <section class="coach-chat" aria-label="Chat with your AI performance coach">
      <div class="coach-chat-heading"><div><span class="coach-label">PRIVATE COACH CONVERSATION</span><h3>Ask better questions. Get a useful plan.</h3><p>Your coach uses the latest dashboard snapshot, explains the evidence, and can teach concepts step by step.</p></div><span id="coach-auth-status" class="coach-auth-status">CHECKING SIGN-IN…</span></div>
      <div id="coach-chat-log" class="coach-chat-log" aria-live="polite"></div>
      <div class="coach-prompts" aria-label="Suggested questions">
        <button type="button" data-coach-prompt="Analyse my latest performance. Show the exact metrics, what they mean, my top three priorities and how to improve each one.">Deep performance review</button>
        <button type="button" data-coach-prompt="Create a realistic 7-day study plan using my latest activity. Include daily time, exact tasks, steps and measurable completion checks.">Build a 7-day plan</button>
        <button type="button" data-coach-prompt="Review my LeetCode progress. Explain what my solved difficulty mix tells us, what we cannot know without topic data, and create a diagnostic practice plan.">Improve problem solving</button>
        <button type="button" data-coach-prompt="Review my Monkeytype speed and accuracy together. Give me a 14-day plan that improves consistency without sacrificing accuracy.">Improve typing</button>
      </div>
      <form id="coach-chat-form" class="coach-chat-form">
        <label class="sr-only" for="coach-chat-input">Message your AI Performance Coach</label>
        <textarea id="coach-chat-input" rows="3" maxlength="2500" placeholder="Ask: Review my progress and give me three specific improvements…" disabled></textarea>
        <button id="coach-send" type="submit" disabled>SEND ↗</button>
      </form>
      <div class="coach-chat-foot"><span id="coach-chat-note">Sign in above using Cloud Settings Sync to enable Gemini chat.</span><span>ENTER TO SEND · SHIFT + ENTER FOR NEW LINE</span></div>
    </section>`;
  host.dataset.ready="true";
  host.addEventListener("click",event=>{
    const prompt=event.target.closest("[data-coach-prompt]");
    if(prompt)sendCoachMessage(prompt.dataset.coachPrompt);
    if(event.target.closest("#coach-refresh"))runAICoach(true);
    if(event.target.closest("#coach-test"))void testGeminiConnection();
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
function coachPriority(value){
  const priority=String(value||"medium").toLowerCase();
  return ["high","medium","low"].includes(priority)?priority:"medium";
}
function renderCoach(data,meta={}){
  ensureCoachMarkup();
  const $=id=>document.getElementById(id);
  if(!$("coach-summary"))return;
  $("coach-summary").textContent=data.summary||"Your latest activity has been reviewed.";
  $("coach-score").textContent=String(Math.max(0,Math.min(100,Math.round(Number(data.performance_score)||0))));
  $("coach-trend").textContent="/ 100 · "+(data.trend||"steady");
  $("coach-score-breakdown").innerHTML=(data.score_breakdown||[]).map(part=>{
    const score=Number.isFinite(Number(part.score))?Math.max(0,Math.min(100,Number(part.score))):0;
    return '<div class="coach-score-part"><div><strong>'+coachEscape(part.label)+'</strong><span>'+coachEscape(part.weight_pct)+'% weight</span></div><div class="coach-score-track"><i style="width:'+score+'%"></i></div><small>'+coachEscape(part.explanation||"")+'</small></div>';
  }).join("")+(data.score_methodology?'<p class="coach-methodology">'+coachEscape(data.score_methodology)+'</p>':"");
  const renderInsightList=(id,items,kind,empty)=>{
    $(id).innerHTML=(items||[]).slice(0,4).map(item=>{
      const obj=typeof item==="string"?{title:item}:item||{};
      const extra=kind==="strength"?obj.why_it_matters:obj.impact;
      const action=kind==="strength"?obj.action:obj.improvement;
      return '<article class="coach-evidence-item '+kind+'"><strong>'+coachEscape(obj.title||"Coaching insight")+'</strong>'+
        (obj.evidence?'<p class="coach-evidence">'+coachEscape(obj.evidence)+'</p>':"")+
        (extra?'<p>'+coachEscape(extra)+'</p>':"")+
        (action?'<p class="coach-action-line"><b>Next:</b> '+coachEscape(action)+'</p>':"")+'</article>';
    }).join("")||'<p class="coach-empty">'+coachEscape(empty)+'</p>';
  };
  renderInsightList("coach-strengths",data.strengths,"strength","More activity is needed to identify a reliable strength.");
  renderInsightList("coach-weaknesses",data.weaknesses,"weakness","No clear weakness is supported by the available data.");
  $("coach-plan").innerHTML=(data.today_plan||[]).map(item=>
    '<article class="coach-plan-row"><div class="coach-plan-top"><strong>'+coachEscape(item.platform)+'</strong><span class="coach-priority '+coachPriority(item.priority)+'">'+coachEscape(item.priority||"medium")+'</span></div>'+
    '<span class="coach-plan-objective">'+coachEscape(item.objective||"Measurable practice")+'</span>'+
    '<p>'+coachEscape(item.task)+'</p>'+
    (Array.isArray(item.steps)&&item.steps.length?'<ol>'+item.steps.map(step=>'<li>'+coachEscape(step)+'</li>').join("")+'</ol>':"")+
    '<small>TIME · '+coachEscape(item.estimated_minutes||20)+' MIN</small>'+
    (item.success_check?'<div class="coach-success-check"><b>DONE WHEN</b> '+coachEscape(item.success_check)+'</div>':"")+'</article>'
  ).join("")||'<p class="coach-empty">No daily plan is available yet.</p>';
  $("coach-platform-insights").innerHTML=(data.platform_insights||[]).map(item=>
    '<article class="coach-platform-insight"><div class="coach-insight-head"><strong>'+coachEscape(item.platform)+'</strong><span>'+coachEscape(item.confidence||data.confidence||"medium")+' confidence</span></div>'+
    '<h4>'+coachEscape(item.headline||"Activity review")+'</h4>'+
    (Array.isArray(item.evidence)&&item.evidence.length?'<ul>'+item.evidence.map(ev=>'<li>'+coachEscape(ev)+'</li>').join("")+'</ul>':"")+
    '<p>'+coachEscape(item.interpretation||"")+'</p><div class="coach-insight-next"><b>NEXT STEP</b>'+coachEscape(item.next_step||"")+'</div></article>'
  ).join("");
  $("coach-weekly-plan").innerHTML=(data.weekly_plan||[]).map(day=>
    '<article class="coach-week-day"><div class="coach-week-date"><strong>'+coachEscape(day.day||"Day")+'</strong><span>'+coachEscape(day.date||"")+'</span></div><h4>'+coachEscape(day.focus||"Practice and review")+'</h4>'+
    '<div class="coach-week-tasks">'+(day.tasks||[]).map(task=>'<div><span>'+coachEscape(task.platform)+'</span><p>'+coachEscape(task.task)+'</p><small>'+coachEscape(task.minutes||20)+' min</small></div>').join("")+'</div>'+
    '<div class="coach-week-total">'+coachEscape(day.total_minutes||0)+' MIN TOTAL</div><small class="coach-week-done">'+coachEscape(day.done_when||"Complete the selected tasks.")+'</small></article>'
  ).join("")||'<p class="coach-empty">A seven-day plan will appear after the next analysis.</p>';
  $("coach-recommendations").innerHTML=(data.recommendations||[]).map(item=>{
    const obj=typeof item==="string"?{title:item}:item||{};
    return '<article class="coach-recommendation"><span class="coach-priority '+coachPriority(obj.priority)+'">'+coachEscape(obj.priority||"medium")+'</span><div><strong>'+coachEscape(obj.title||"Next improvement")+'</strong>'+
      (obj.reason?'<p>'+coachEscape(obj.reason)+'</p>':"")+(obj.action?'<small>'+coachEscape(obj.action)+'</small>':"")+'</div></article>';
  }).join("")||'<p class="coach-empty">No additional recommendations.</p>';
  const gaps=Array.isArray(data.data_gaps)?data.data_gaps:[];
  $("coach-data-gaps").innerHTML=gaps.length?'<strong>DATA LIMITATIONS</strong><ul>'+gaps.slice(0,7).map(gap=>'<li>'+coachEscape(gap)+'</li>').join("")+'</ul>':'<span>All four platform feeds supplied activity data for this report.</span>';
  $("coach-engine-status").textContent=meta.ai?((meta.model||"GEMINI")+" · "+(meta.saved?"DETAILED REPORT SAVED":"LIVE REPORT")+(meta.usedFallback?" · AUTOMATIC FALLBACK":"")+" · "+(data.confidence||"medium").toUpperCase()+" CONFIDENCE"):(meta.status||"LOCAL SNAPSHOT ANALYSIS");
  $("coach-refresh").disabled=coachState.analysisLoading;
  $("coach-refresh").textContent=coachState.analysisLoading?"ANALYZING…":"↻ ANALYZE LATEST DATA";
  renderChat();
}
function formatCoachMessage(value){
  const chunks=String(value||"").split(/\x60{3}([\w+-]*)\n([\s\S]*?)\x60{3}/g);
  let html="";
  for(let i=0;i<chunks.length;i++){
    if(i%3===1){
      const code=chunks[i+1]||"";
      html+='<pre class="coach-code"><code>'+coachEscape(code)+'</code></pre>';
      i+=2;
      continue;
    }
    const lines=chunks[i].split("\n");
    let paragraph=[],list=[],listType="";
    const inline=line=>coachEscape(line)
      .replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>")
      .replace(/\x60([^\x60]+)\x60/g,"<code>$1</code>");
    const flushParagraph=()=>{
      if(paragraph.length){
        html+='<p>'+paragraph.map(inline).join("<br>")+'</p>';
        paragraph=[];
      }
    };
    const flushList=()=>{
      if(list.length){
        html+=(listType==="ol"?"<ol>":"<ul>")+list.map(line=>'<li>'+inline(line)+'</li>').join("")+(listType==="ol"?"</ol>":"</ul>");
        list=[];
        listType="";
      }
    };
    for(const line of lines){
      const trimmed=line.trim();
      const heading=trimmed.match(/^(#{1,3})\s+(.+)$/);
      const bullet=trimmed.match(/^[-*]\s+(.+)$/);
      const numbered=trimmed.match(/^\d+[.)]\s+(.+)$/);
      if(heading){
        flushParagraph();flushList();
        html+='<h4>'+coachEscape(heading[2])+'</h4>';
        continue;
      }
      if(bullet||numbered){
        flushParagraph();
        const type=numbered?"ol":"ul";
        if(listType&&listType!==type)flushList();
        listType=type;
        list.push((bullet||numbered)[1]);
        continue;
      }
      if(!trimmed){
        flushParagraph();flushList();
        continue;
      }
      flushList();
      paragraph.push(line);
    }
    flushParagraph();flushList();
  }
  return html;
}
function renderChat(typing=false){
  const log=document.getElementById("coach-chat-log");
  if(!log)return;
  const items=coachState.history.length?coachState.history:[{role:"assistant",content:"Hi Dinesh — I’m your performance coach. Ask for a detailed performance review, a realistic weekly plan, help with a coding concept, or a step-by-step way to improve one platform."}];
  log.innerHTML=items.map(m=>'<div class="coach-message '+(m.role==="user"?"user":"assistant")+'"><span>'+(m.role==="user"?"YOU":"COACH")+'</span><div class="coach-message-body">'+(m.role==="assistant"?formatCoachMessage(m.content):'<p>'+coachEscape(m.content)+'</p>')+'</div></div>').join("")+(typing?'<div class="coach-message assistant typing"><span>COACH</span><p>Reviewing your metrics and preparing a practical answer…</p></div>':"");
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
    renderCoach(data,{ai:true,saved:data.saved!==false,model:data.model,usedFallback:Boolean(data.usedFallback)});
    setChatAvailability(session);
  }catch(error){
    console.error("AI Performance Coach analysis failed",error);
    coachState.last=local;
    renderCoach(local,{status:"GEMINI UNAVAILABLE · LOCAL ANALYSIS ACTIVE"});
    const status=document.getElementById("coach-status");
    const detail=await coachErrorDetails(error);
    if(status)status.textContent="COACH CONNECTION ISSUE · "+detail;
    try{const {session}=await getCoachSession();setChatAvailability(session,"Gemini is unavailable. Check the function logs and API key.");}catch{}
  }finally{
    coachState.analysisLoading=false;
    const button=document.getElementById("coach-refresh");
    if(button){button.disabled=false;button.textContent="↻ ANALYZE LATEST DATA";}
    try{const {session}=await getCoachSession();setChatAvailability(session);}catch{}
  }
}
async function testGeminiConnection(){
  const button=document.getElementById("coach-test");
  const status=document.getElementById("coach-engine-status");
  if(coachState.testing)return;
  coachState.testing=true;
  if(button){button.disabled=true;button.textContent="TESTING…";}
  if(status)status.textContent="CHECKING SUPABASE AUTH + GEMINI API…";
  try{
    const {session,supabase}=await getCoachSession();
    if(!session?.access_token)throw new Error("Sign in through Cloud Settings Sync first.");
    const {data,error}=await supabase.functions.invoke("ai-performance-coach",{body:{action:"health"}});
    if(error)throw error;
    if(data?.error)throw new Error(data.details||data.error);
    if(!data?.ok)throw new Error("Gemini did not confirm a successful response.");
    if(status)status.textContent="CONNECTED · "+(data.model||"GEMINI")+" · SUPABASE AUTH VERIFIED"+(data.usedFallback?" · FALLBACK MODEL":"");
    const note=document.getElementById("coach-chat-note");
    if(note)note.textContent=data.usedFallback?"Connection test passed using the automatic fallback model. You can now chat with Gemini.":"Connection test passed. You can now chat with Gemini.";
  }catch(error){
    console.error("Gemini connection test failed",error);
    const detail=await coachErrorDetails(error);
    if(status)status.textContent="CONNECTION TEST FAILED · "+detail;
    const note=document.getElementById("coach-chat-note");
    if(note)note.textContent="Diagnostic: "+detail+". Check the GEMINI_API_KEY secret, AI Studio API access and project quota.";
  }finally{
    coachState.testing=false;
    if(button){button.disabled=false;button.textContent="✓ TEST GEMINI";}
  }
}

async function sendCoachMessage(text){
  const message=String(text||"").trim();
  if(!message||coachState.loading)return;
  if(message.length>2500)return;
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
    if(note)note.textContent="Gemini replied using your latest platform snapshot"+(data.usedFallback?" via fallback model.":".");
    const engine=document.getElementById("coach-engine-status");
    if(engine)engine.textContent=(data.model||"GEMINI")+" · CHAT CONNECTED"+(data.usedFallback?" · AUTOMATIC FALLBACK":"");
  }catch(error){
    console.error("AI Performance Coach chat failed",error);
    const detail=await coachErrorDetails(error);
    coachState.history.push({role:"assistant",content:"I couldn't reach Gemini just now. "+detail+" Check the Gemini API key and quota, then try again."});
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
