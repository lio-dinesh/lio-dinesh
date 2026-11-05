import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS"
};

const schema={
  type:"object",
  properties:{
    summary:{type:"string"},
    performance_score:{type:"integer"},
    trend:{type:"string"},
    strengths:{type:"array",items:{type:"string"}},
    weaknesses:{type:"array",items:{type:"string"}},
    today_plan:{type:"array",items:{type:"object",properties:{platform:{type:"string"},task:{type:"string"},reason:{type:"string"}},required:["platform","task","reason"]}},
    recommendations:{type:"array",items:{type:"string"}}
  },
  required:["summary","performance_score","trend","strengths","weaknesses","today_plan","recommendations"]
};

function response(body,status=200){
  return new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json",...corsHeaders}});
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST")return response({error:"POST required"},405);
  const apiKey=Deno.env.get("GEMINI_API_KEY");
  if(!apiKey)return response({error:"GEMINI_API_KEY is not configured in Supabase Edge Function secrets."},503);
  try{
    const {snapshot}=await req.json();
    if(!snapshot?.platforms?.length)return response({error:"Missing performance snapshot."},400);
    const prompt=[
      "You are Dinesh's AI Performance Coach inside a developer practice dashboard.",
      "Analyze ONLY the supplied source snapshot. Never invent metrics, streaks, platforms, dates, or achievements.",
      "Be concise, practical and evidence-driven. Optimize for sustainable daily improvement.",
      "Performance score: 0-100. Weight consistency 25%, problem solving 30%, typing 15%, competitive coding 15%, GitHub/building 15%. If a metric is unavailable, do not pretend it exists; rebalance the score.",
      "Return valid JSON matching the supplied schema. Today plan must contain exactly four platform entries.",
      "Explain why recommendations follow from the data.",
      "SOURCE SNAPSHOT:\n"+JSON.stringify(snapshot)
    ].join("\n\n");
    const gemini=await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",{
      method:"POST",
      headers:{"Content-Type":"application/json","x-goog-api-key":apiKey},
      body:JSON.stringify({
        contents:[{parts:[{text:prompt}]}],
        generationConfig:{
          responseMimeType:"application/json",
          responseJsonSchema:schema,
          temperature:0.35
        }
      })
    });
    const raw=await gemini.json();
    if(!gemini.ok)return response({error:"Gemini API error",details:raw},502);
    const text=raw?.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("")||"";
    const parsed=JSON.parse(text);
    parsed.performance_score=Math.max(0,Math.min(100,Math.round(Number(parsed.performance_score)||0)));
    return response(parsed);
  }catch(error){
    console.error(error);
    return response({error:"Unable to generate coach analysis."},500);
  }
});
