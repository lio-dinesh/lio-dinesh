const GH_FN="github-personal-assistant";
const GH_PREFIX="dcc-github-assistant-v1:";
const ghState={supabase:null,user:null,repositories:[],selected:"all",history:[],loading:false,repoLoading:false,open:false,bound:false};

function ghEsc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function ghInline(v){return ghEsc(v).replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>").replace(/\x60([^\x60]+)\x60/g,"<code>$1</code>");}
function ghMd(v){
 const chunks=String(v||"").split(/\x60{3}([\w+-]*)\n([\s\S]*?)\x60{3}/g);let html="";
 for(let i=0;i<chunks.length;i++){
  if(i%3===1){html+='<pre class="gh-code"><code>'+ghEsc(chunks[i+1]||"")+"</code></pre>";i+=2;continue;}
  let p=[],list=[],type="";
  const fp=()=>{if(p.length){html+="<p>"+p.map(ghInline).join("<br>")+"</p>";p=[];}};
  const fl=()=>{if(list.length){html+=(type==="ol"?"<ol>":"<ul>")+list.map(x=>"<li>"+ghInline(x)+"</li>").join("")+(type==="ol"?"</ol>":"</ul>");list=[];type="";}};
  for(const raw of chunks[i].split("\n")){
   const line=raw.trim(),h=line.match(/^#{1,3}\s+(.+)$/),b=line.match(/^[-*]\s+(.+)$/),n=line.match(/^\d+[.)]\s+(.+)$/);
   if(h){fp();fl();html+="<h4>"+ghEsc(h[1])+"</h4>";continue;}
   if(b||n){fp();const next=n?"ol":"ul";if(type&&type!==next)fl();type=next;list.push((b||n)[1]);continue;}
   if(!line){fp();fl();continue;}fl();p.push(raw);
  }fp();fl();
 }
 return html;
}
function ghKey(){return GH_PREFIX+(ghState.user?.id||"guest")+":"+(ghState.selected||"all");}
function ghLoadHistory(){ghState.history=[];if(!ghState.user?.id)return;try{const a=JSON.parse(localStorage.getItem(ghKey())||"[]");if(Array.isArray(a))ghState.history=a.filter(x=>["user","assistant"].includes(x.role)&&typeof x.content==="string").slice(-24);}catch{}}
function ghSave(){if(!ghState.user?.id)return;try{localStorage.setItem(ghKey(),JSON.stringify(ghState.history.slice(-24)));}catch{}}
function ghStatus(t,state){const s=document.getElementById("gh-status"),d=document.getElementById("gh-dot");if(s)s.textContent=String(t||"").toUpperCase();if(d)d.dataset.state=state||"idle";}
function ghContext(t){const e=document.getElementById("gh-context-text");if(!e)return;if(t){e.textContent=t;return;}const r=ghState.repositories.find(x=>x.full_name===ghState.selected);e.textContent=ghState.selected==="all"?"ALL REPOSITORIES · "+ghState.repositories.length+" PROJECTS · PORTFOLIO CONTEXT":(r?.full_name||"SELECT A REPOSITORY")+" · README · FILE TREE · KEY SOURCE FILES";}
function ghRender(typing){
 const host=document.getElementById("gh-messages");if(!host)return;
 if(!ghState.history.length){
  host.innerHTML="<div class='gh-welcome'><span class='gh-eyebrow'>YOUR PERSONAL REPOSITORY GUIDE</span><h3>"+(ghState.selected==="all"?"Your GitHub,":"Let us explore this project,")+"<br><em>understood.</em></h3><p>"+(ghState.selected==="all"?"Ask about your portfolio, compare projects, find your strongest work, or get a roadmap across your repositories.":"Ask me to explain this repo, trace architecture, walk through files, review code, or suggest improvements.")+"</p><div class='gh-pills'><span>"+ghState.repositories.length+" REPOSITORIES</span><span>REPO-AWARE ANSWERS</span><span>READ-ONLY ANALYSIS</span></div></div>";
 }else{
  host.innerHTML=ghState.history.map(m=>"<article class='gh-message "+(m.role==="user"?"user":"assistant")+"'><div class='gh-avatar'>"+(m.role==="user"?"YOU":"⌘")+"</div><div class='gh-message-content'><span class='gh-role'>"+(m.role==="user"?"YOU":"GITHUB ASSISTANT")+"</span><div class='gh-message-body'>"+(m.role==="assistant"?ghMd(m.content):"<p>"+ghEsc(m.content)+"</p>")+"</div></div></article>").join("");
 }
 if(typing)host.insertAdjacentHTML("beforeend","<article class='gh-message assistant typing'><div class='gh-avatar'>⌘</div><div class='gh-message-content'><span class='gh-role'>GITHUB ASSISTANT</span><p>Reading your repository context…</p></div></article>");
 host.scrollTop=host.scrollHeight;
}
function ghControls(){
 const signed=!!ghState.user,blocked=ghState.loading||ghState.repoLoading;
 const input=document.getElementById("gh-input"),send=document.getElementById("gh-send"),select=document.getElementById("gh-repo"),refresh=document.getElementById("gh-refresh");
 if(input)input.disabled=!signed||blocked;if(send)send.disabled=!signed||blocked;if(select)select.disabled=!signed||blocked||!ghState.repositories.length;if(refresh)refresh.disabled=!signed||blocked;
}
async function ghErr(error){
 let d="",status=error?.context?.status||error?.status;
 try{if(error?.context?.clone){const j=await error.context.clone().json().catch(async()=>({error:await error.context.clone().text().catch(()=> "")}));d=String(j?.details||j?.error||j?.message||"");}}catch{}
 return (String(error?.message||"Request failed.")+(status?" (HTTP "+status+")":"")+(d&&d!==error?.message?" · "+d:"")).slice(0,500);
}
async function ghCall(body){
 const {data,error}=await ghState.supabase.functions.invoke(GH_FN,{body});
 if(error)throw new Error(await ghErr(error));if(data?.error)throw new Error(data.error+(data.details?": "+data.details:""));return data;
}
function ghRenderRepos(){
 const select=document.getElementById("gh-repo");if(!select)return;
 const prev=ghState.selected;
 select.innerHTML="<option value='all'>✦ All repositories · portfolio mode</option>"+ghState.repositories.map(r=>"<option value='"+ghEsc(r.full_name)+"'>"+ghEsc(r.name)+(r.private?" · PRIVATE":"")+(r.archived?" · ARCHIVED":"")+"</option>").join("");
 select.value=ghState.repositories.some(r=>r.full_name===prev)?prev:"all";ghState.selected=select.value;ghLoadHistory();ghContext();ghRender();ghControls();
}
async function ghLoadRepos(refresh){
 if(!ghState.user||ghState.repoLoading)return;
 ghState.repoLoading=true;ghControls();ghStatus("DISCOVERING YOUR REPOSITORIES","loading");ghContext("Fetching repositories visible to your GitHub access…");
 try{
  const data=await ghCall({action:"list_repos",refresh:!!refresh});ghState.repositories=Array.isArray(data.repositories)?data.repositories:[];ghState.accessMode=data.access_mode||"public_only";
  ghRenderRepos();ghStatus(data.total+" REPOSITORIES · "+(data.private_access_configured?"PUBLIC + PRIVATE":"PUBLIC REPOSITORIES"),"connected");
  if(!ghState.repositories.length){ghState.history=[{role:"assistant",content:"No repositories were found under lio-dinesh. Check the GitHub username and token permissions."}];ghRender();}
 }catch(error){ghStatus("REPOSITORY DISCOVERY FAILED","error");ghContext(String(error.message||error));ghState.history=[{role:"assistant",content:"I could not load your GitHub repositories. "+String(error.message||error)+"\n\nSign in through Cloud Settings Sync and refresh. To include private repositories, configure a read-only GITHUB_TOKEN in Supabase secrets."}];ghRender();}
 finally{ghState.repoLoading=false;ghControls();}
}
function ghBuildUi(){
 if(document.getElementById("github-assistant-root"))return;
 const root=document.createElement("div");root.id="github-assistant-root";
 root.innerHTML=[
  "<button class='gh-launcher' id='gh-launcher' type='button' aria-label='Open Personal GitHub Assistant' aria-expanded='false'><span class='gh-orbit'><i></i><i></i><i></i></span><span class='gh-launcher-copy'><strong>GITHUB AI</strong><small>PERSONAL ASSISTANT</small></span><b>↗</b></button>",
  "<div class='gh-backdrop' id='gh-backdrop' hidden></div>",
  "<aside class='gh-panel' id='gh-panel' aria-label='Personal GitHub Assistant' aria-hidden='true'>",
  "<header class='gh-header'><div class='gh-brand'><div class='gh-mark'>⌘</div><div><span>DINESH'S WORKSPACE</span><h2>GitHub Assistant</h2><p>Knows your projects. Explains your code.</p></div></div><div class='gh-head-actions'><i id='gh-dot'></i><button id='gh-close' type='button' aria-label='Close assistant'>×</button></div></header>",
  "<div class='gh-repo-bar'><label for='gh-repo'>CONTEXT</label><select id='gh-repo' disabled><option value='all'>All repositories</option></select><button id='gh-refresh' type='button' aria-label='Refresh repositories'>↻</button></div>",
  "<div class='gh-context'><b>⌘</b><span id='gh-context-text'>Loading your GitHub workspace…</span></div>",
  "<div class='gh-messages' id='gh-messages' aria-live='polite'></div>",
  "<div class='gh-suggestions'><button data-gh-prompt='Give me a complete overview of all my GitHub repositories. Group them by purpose and technology, identify my strongest projects, and explain what I should improve next.'>Review all repos</button><button data-gh-prompt='Explain this repository from beginner to developer level. Tell me its purpose, features, tech stack, architecture, important files, how to run it, and what I should improve.'>Explain this project</button><button data-gh-prompt='Act as a senior engineer and review this repository. Identify the most important security, architecture, code quality, testing, UI/UX and deployment improvements. Give file-specific recommendations.'>Review & improve</button><button data-gh-prompt='Which repositories best demonstrate my AI/ML, Python, full-stack and automation skills? Explain the evidence and how I should present them in my portfolio.'>Portfolio review</button></div>",
  "<form class='gh-composer' id='gh-form'><textarea id='gh-input' rows='2' maxlength='2500' placeholder='Ask about your projects, code, architecture or improvements…' disabled></textarea><button id='gh-send' type='submit' disabled>↑</button></form>",
  "<footer class='gh-footer'><span id='gh-status'>SIGN IN THROUGH CLOUD SETTINGS SYNC</span><span>ENTER TO SEND · SHIFT + ENTER NEW LINE</span></footer>",
  "</aside>"
 ].join("");
 document.body.appendChild(root);
 root.addEventListener("click",e=>{
  if(e.target.closest("#gh-launcher"))ghOpen();if(e.target.closest("#gh-close")||e.target.closest("#gh-backdrop"))ghClose();if(e.target.closest("#gh-refresh"))void ghLoadRepos(true);
  const p=e.target.closest("[data-gh-prompt]");if(p)void ghSend(p.dataset.ghPrompt);
 });
 root.addEventListener("change",e=>{if(e.target.id==="gh-repo"){ghState.selected=e.target.value||"all";ghLoadHistory();ghContext();ghRender();}});
 root.addEventListener("submit",e=>{if(e.target.id!=="gh-form")return;e.preventDefault();const i=document.getElementById("gh-input"),m=i?.value.trim();if(m&&!ghState.loading){i.value="";void ghSend(m);}});
 root.addEventListener("keydown",e=>{if(e.target.id==="gh-input"&&e.key==="Enter"&&!e.shiftKey){e.preventDefault();e.target.closest("form")?.requestSubmit();}if(e.key==="Escape"&&ghState.open)ghClose();});
}
function ghOpen(){ghState.open=true;document.getElementById("gh-panel")?.classList.add("open");document.getElementById("gh-panel")?.setAttribute("aria-hidden","false");const b=document.getElementById("gh-backdrop");if(b)b.hidden=false;document.getElementById("gh-launcher")?.setAttribute("aria-expanded","true");document.body.classList.add("gh-open");if(ghState.user&&!ghState.repositories.length)void ghLoadRepos();setTimeout(()=>document.getElementById("gh-input")?.focus(),180);}
function ghClose(){ghState.open=false;document.getElementById("gh-panel")?.classList.remove("open");document.getElementById("gh-panel")?.setAttribute("aria-hidden","true");const b=document.getElementById("gh-backdrop");if(b)b.hidden=true;document.getElementById("gh-launcher")?.setAttribute("aria-expanded","false");document.body.classList.remove("gh-open");}
async function ghSend(value){
 const message=String(value||"").trim();if(!message||ghState.loading)return;if(!ghState.user){ghStatus("SIGN IN THROUGH CLOUD SETTINGS SYNC FIRST","error");return;}if(!ghState.repositories.length){await ghLoadRepos();if(!ghState.repositories.length)return;}if(message.length>2500)return;
 const previous=ghState.history.slice(-8);ghState.history.push({role:"user",content:message});ghState.history=ghState.history.slice(-24);ghSave();ghState.loading=true;ghRender(true);ghControls();ghStatus("READING PROJECT CONTEXT","loading");
 try{
  const data=await ghCall({action:"chat",message,history:previous,repo_full_name:ghState.selected});
  if(typeof data.reply!=="string"||!data.reply.trim())throw new Error("The assistant returned an empty answer.");
  ghState.history.push({role:"assistant",content:data.reply.trim()});ghState.history=ghState.history.slice(-24);ghSave();ghRender();ghStatus((data.model||"GEMINI")+(data.used_fallback?" · FALLBACK":"")+" · "+data.repository_count+" REPOS","connected");ghContext(data.context_note||"Repository context loaded.");
 }catch(error){ghState.history.push({role:"assistant",content:"I could not complete that repository request. "+String(error.message||error)+"\n\nRefresh your repository list. For private repositories, add a read-only GitHub token in Supabase secrets; never paste it into this chat."});ghState.history=ghState.history.slice(-24);ghSave();ghRender();ghStatus("ASSISTANT REQUEST FAILED","error");}
 finally{ghState.loading=false;ghControls();document.getElementById("gh-input")?.focus();}
}
function ghBindAuth(){
 if(ghState.bound||!ghState.supabase?.auth?.onAuthStateChange)return;ghState.bound=true;
 ghState.supabase.auth.onAuthStateChange((event,session)=>{
  if(["SIGNED_IN","INITIAL_SESSION","TOKEN_REFRESHED"].includes(event)){
   if(session?.user&&ghState.user?.id!==session.user.id){ghState.user=session.user;ghState.repositories=[];ghLoadHistory();void ghLoadRepos();}else ghState.user=session?.user||null;
  }
  if(event==="SIGNED_OUT"){ghState.user=null;ghState.repositories=[];ghState.history=[];ghState.selected="all";ghRenderRepoSelect();ghRender();ghStatus("SIGNED OUT","error");ghControls();}
 });
}
async function initGitHubAssistant(){
 ghBuildUi();ghState.supabase=window.commandCenterBridge?.getSupabase?.()||null;if(!ghState.supabase){ghStatus("DASHBOARD CONNECTION NOT READY","error");return;}ghBindAuth();
 try{const {data,error}=await ghState.supabase.auth.getSession();if(error)throw error;ghState.user=data?.session?.user||null;if(ghState.user){ghLoadHistory();await ghLoadRepos();}else{ghStatus("SIGN IN THROUGH CLOUD SETTINGS SYNC","error");ghContext("Sign in to load your repository catalogue and start asking questions.");}ghControls();}
 catch(error){ghStatus("AUTHENTICATION ERROR","error");ghContext(String(error.message||error));}
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",initGitHubAssistant,{once:true});else void initGitHubAssistant();
