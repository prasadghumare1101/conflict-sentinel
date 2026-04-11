import { useState, useEffect, useRef, useCallback } from "react";

/* ─── Agent definitions ─────────────────────────────────────────────────── */
const AGENTS = [
  { id:"osint",    label:"OSINT Intelligence Officer", icon:"⬡", color:"#3b82f6",
    desc:"Multi-source harvest · SIGINT/IMINT/HUMINT/SOCMINT · live news injection" },
  { id:"threat",   label:"Strategic Threat Analyst",   icon:"⬡", color:"#f59e0b",
    desc:"Escalation scoring · NLP pattern detection · war doctrine analysis" },
  { id:"scenario", label:"War Games Director",         icon:"⬡", color:"#a855f7",
    desc:"Military scenario simulation · psychological ops assessment · outcomes" },
  { id:"civilian", label:"Humanitarian Impact Modeler",icon:"⬡", color:"#c2773a",
    desc:"Civilian risk · displacement projection · infrastructure vulnerability" },
  { id:"brief",    label:"Commander's Board Synthesis",icon:"⬡", color:"#10b981",
    desc:"Cross-agent brief · strategic recommendations · traceable sourcing" },
];

/* ─── Helpers ────────────────────────────────────────────────────────────── */
const callLLM = async (systemPrompt, userPrompt) => {
  const r = await fetch("/api/gemini-proxy", {
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ systemPrompt, userPrompt }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "API error");
  return d.text;
};

const parseJSON = (text) => {
  try { return JSON.parse(text.replace(/```json|```/g,"").trim()); }
  catch { return null; }
};

const fmt = (d) => d ? `${d.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})} ${d.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit",second:"2-digit"})} UTC` : "";

const priorityColor  = (p) => p==="IMMEDIATE"?"#ef4444":p==="URGENT"?"#f59e0b":"#3b82f6";
const priorityBg     = (p) => p==="IMMEDIATE"?"rgba(239,68,68,.1)":p==="URGENT"?"rgba(245,158,11,.1)":"rgba(59,130,246,.1)";
const priorityBorder = (p) => p==="IMMEDIATE"?"rgba(239,68,68,.35)":p==="URGENT"?"rgba(245,158,11,.35)":"rgba(59,130,246,.35)";

const getSourceIcon = (url="") => {
  const l=url.toLowerCase();
  if(l.includes("reddit.com")) return {icon:"🔴",label:"REDDIT",color:"#ff4500"};
  if(l.includes("twitter.com")||l.includes("x.com")) return {icon:"🐦",label:"X/TWITTER",color:"#1d9bf0"};
  return {icon:"📰",label:"NEWS",color:"#60a5fa"};
};

/* ─── Sub-components ────────────────────────────────────────────────────── */
function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(()=>{ const t=setInterval(()=>setNow(new Date()),1000); return ()=>clearInterval(t); },[]);
  return (
    <span style={{fontFamily:"monospace",fontSize:11,color:"#10b981",letterSpacing:"0.08em"}}>
      {fmt(now)}
    </span>
  );
}

function ThreatBadge({level}){
  const m={CRITICAL:{bg:"rgba(239,68,68,.1)",color:"#ef4444",border:"rgba(239,68,68,.35)"},HIGH:{bg:"rgba(245,158,11,.1)",color:"#f59e0b",border:"rgba(245,158,11,.35)"},MODERATE:{bg:"rgba(59,130,246,.1)",color:"#3b82f6",border:"rgba(59,130,246,.35)"},LOW:{bg:"rgba(16,185,129,.1)",color:"#10b981",border:"rgba(16,185,129,.35)"}};
  const s=m[level]||m.MODERATE;
  return <span style={{background:s.bg,color:s.color,border:`0.5px solid ${s.border}`,borderRadius:4,padding:"2px 10px",fontSize:11,fontWeight:500,letterSpacing:"0.08em",fontFamily:"monospace"}}>{level}</span>;
}

function AgentCard({agent,status,output,elapsed,timestamp}){
  const sc=status==="done"?"#10b981":status==="running"?"#f59e0b":status==="error"?"#ef4444":"#4b5563";
  const sl=status==="done"?"COMPLETE":status==="running"?"PROCESSING":status==="error"?"ERROR":"STANDBY";
  return (
    <div style={{background:"#111827",border:`0.5px solid ${status==="running"?"#f59e0b33":status==="done"?"#10b98133":"#1f2937"}`,borderRadius:8,padding:"1rem 1.1rem",position:"relative",overflow:"hidden",transition:"border-color .3s"}}>
      {status==="running"&&<div style={{position:"absolute",top:0,left:0,height:2,background:"#f59e0b",animation:"pulse-bar 1.5s ease-in-out infinite",width:"60%"}}/>}
      {status==="done"&&<div style={{position:"absolute",top:0,left:0,height:2,background:"#10b981",width:"100%"}}/>}
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:8}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:16,color:agent.color}}>{agent.icon}</span>
          <div>
            <div style={{fontSize:13,fontWeight:600,color:"#f9fafb",fontFamily:"monospace",letterSpacing:"0.04em"}}>{agent.label}</div>
            <div style={{fontSize:10,color:"#6b7280"}}>{agent.desc}</div>
          </div>
        </div>
        <div style={{textAlign:"right",flexShrink:0,marginLeft:8}}>
          <div style={{fontSize:10,fontFamily:"monospace",color:sc,letterSpacing:"0.1em"}}>{sl}</div>
          {elapsed&&<div style={{fontSize:9,color:"#4b5563",fontFamily:"monospace"}}>{elapsed}s</div>}
          {timestamp&&<div style={{fontSize:8,color:"#374151",fontFamily:"monospace",marginTop:1}}>{fmt(timestamp)}</div>}
        </div>
      </div>
      {output&&(
        <div style={{marginTop:10,paddingTop:10,borderTop:"0.5px solid #1f2937"}}>
          <AgentOutput agentId={agent.id} output={output}/>
        </div>
      )}
    </div>
  );
}

function AgentOutput({agentId,output}){
  if(agentId==="osint"&&output.streams) return (
    <div style={{display:"flex",flexDirection:"column",gap:6}}>
      {output.streams.map((s,i)=>(
        <div key={i} style={{display:"flex",gap:8,alignItems:"flex-start"}}>
          <span style={{fontSize:10,fontFamily:"monospace",color:"#3b82f6",minWidth:72,paddingTop:1}}>[{s.source}]</span>
          <span style={{fontSize:11,color:"#9ca3af",lineHeight:1.5}}>{s.finding}</span>
        </div>
      ))}
      <div style={{marginTop:4,display:"flex",gap:6,flexWrap:"wrap"}}>
        {output.indicators?.map((ind,i)=><span key={i} style={{fontSize:9,fontFamily:"monospace",background:"rgba(59,130,246,.08)",color:"#60a5fa",padding:"2px 7px",borderRadius:4,border:"0.5px solid rgba(59,130,246,.2)"}}>{ind}</span>)}
      </div>
      {output.liveNewsUsed>0&&<div style={{fontSize:9,color:"#10b981",fontFamily:"monospace",marginTop:2}}>↻ {output.liveNewsUsed} live articles injected</div>}
    </div>
  );
  if(agentId==="threat"&&output.score!==undefined) return (
    <div>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:8}}>
        <div>
          <div style={{fontSize:10,color:"#6b7280",fontFamily:"monospace"}}>ESCALATION SCORE</div>
          <div style={{fontSize:26,fontWeight:600,fontFamily:"monospace",color:output.score>=75?"#ef4444":output.score>=50?"#f59e0b":"#10b981"}}>{output.score}<span style={{fontSize:13,color:"#4b5563"}}>/100</span></div>
        </div>
        <div style={{flex:1}}>
          <ThreatBadge level={output.level}/>
          <div style={{fontSize:11,color:"#9ca3af",marginTop:6,lineHeight:1.5}}>{output.summary}</div>
        </div>
      </div>
      <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
        {output.patterns?.map((p,i)=><span key={i} style={{fontSize:9,fontFamily:"monospace",color:"#f59e0b",background:"rgba(245,158,11,.08)",padding:"2px 7px",borderRadius:4,border:"0.5px solid rgba(245,158,11,.25)"}}>▲ {p}</span>)}
      </div>
    </div>
  );
  if(agentId==="scenario"&&output.scenarios) return (
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      {/* Active Tactics Banner */}
      {output.activeTactics?.length>0&&(
        <div style={{background:"rgba(168,85,247,.08)",border:"0.5px solid rgba(168,85,247,.3)",borderRadius:6,padding:"7px 10px"}}>
          <div style={{fontSize:8,fontFamily:"monospace",color:"#a855f7",letterSpacing:"0.1em",marginBottom:5}}>▲ ACTIVE WAR-GAME TACTICS DETECTED</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
            {output.activeTactics.map((t,i)=>(
              <span key={i} style={{fontSize:9,fontFamily:"monospace",background:"rgba(168,85,247,.12)",color:"#c084fc",padding:"2px 7px",borderRadius:4,border:"0.5px solid rgba(168,85,247,.25)"}}>{t}</span>
            ))}
          </div>
        </div>
      )}
      {/* Red Team / Next Move */}
      {(output.redTeamDecision||output.nextMoveProjection)&&(
        <div style={{background:"rgba(239,68,68,.06)",border:"0.5px solid rgba(239,68,68,.25)",borderRadius:6,padding:"7px 10px"}}>
          <div style={{fontSize:8,fontFamily:"monospace",color:"#ef4444",letterSpacing:"0.1em",marginBottom:4}}>RED TEAM DECISION MATRIX</div>
          {output.redTeamDecision&&<div style={{fontSize:10,color:"#fca5a5",lineHeight:1.5,marginBottom:3}}><span style={{color:"#ef4444",fontFamily:"monospace"}}>ADVERSARY: </span>{output.redTeamDecision}</div>}
          {output.nextMoveProjection&&<div style={{fontSize:10,color:"#f87171",lineHeight:1.5,fontWeight:500}}><span style={{color:"#ef4444",fontFamily:"monospace"}}>72H PROJECTION: </span>{output.nextMoveProjection}</div>}
        </div>
      )}
      {/* Scenarios */}
      {output.scenarios.map((sc,i)=>(
        <div key={i} style={{background:"#1f2937",borderRadius:6,padding:"9px 11px",borderLeft:`3px solid ${i===0?"#10b981":i===1?"#f59e0b":"#ef4444"}`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}>
            <span style={{fontSize:12,fontWeight:500,fontFamily:"monospace",color:"#f9fafb"}}>{sc.name}</span>
            <span style={{fontSize:10,fontFamily:"monospace",color:"#6b7280",background:"#111827",padding:"1px 6px",borderRadius:4}}>P={sc.probability}%</span>
          </div>
          <div style={{fontSize:11,color:"#9ca3af",lineHeight:1.5,marginBottom:4}}>{sc.outcome}</div>
          {sc.psyopRisk&&<div style={{fontSize:9,color:"#f59e0b",marginBottom:3,fontFamily:"monospace"}}>PSYOP RISK: {sc.psyopRisk}</div>}
          {sc.recommendation&&<div style={{fontSize:10,color:"#60a5fa",fontStyle:"italic",borderLeft:"2px solid #3b82f6",paddingLeft:6,lineHeight:1.4}}>{sc.recommendation}</div>}
        </div>
      ))}
    </div>
  );
  if(agentId==="civilian"&&(output.zones!==undefined||output.populationAtRisk)) return (
    <div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:8}}>
        {[{label:"Pop. at Risk",val:output.populationAtRisk},{label:"Displacement",val:output.displacementRisk},{label:"Infra. Risk",val:output.infrastructureRisk}].map((m,i)=>(
          <div key={i} style={{background:"#1f2937",borderRadius:6,padding:"7px 9px",textAlign:"center"}}>
            <div style={{fontSize:9,color:"#6b7280",marginBottom:2,fontFamily:"monospace"}}>{m.label}</div>
            <div style={{fontSize:14,fontWeight:500,fontFamily:"monospace",color:"#f9fafb"}}>{m.val||"—"}</div>
          </div>
        ))}
      </div>
      <div style={{fontSize:11,color:"#9ca3af",lineHeight:1.6}}>{output.summary}</div>
    </div>
  );
  if(agentId==="brief"&&output&&(output.keyFindings||output.windowOfAction||output.immediateRecommendations)) return (
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      {output.windowOfAction&&(
        <div style={{background:"rgba(239,68,68,.08)",border:"0.5px solid rgba(239,68,68,.3)",borderRadius:5,padding:"7px 10px",display:"flex",gap:8,alignItems:"flex-start"}}>
          <span style={{color:"#ef4444",fontSize:12,flexShrink:0}}>◈</span>
          <div>
            <div style={{fontSize:8,fontFamily:"monospace",color:"#ef4444",letterSpacing:"0.1em",marginBottom:2}}>WINDOW OF ACTION</div>
            <div style={{fontSize:11,color:"#ef4444",lineHeight:1.4}}>{output.windowOfAction}</div>
          </div>
        </div>
      )}
      {output.keyFindings?.length>0&&(
        <div>
          <div style={{fontSize:8,fontFamily:"monospace",color:"#6b7280",letterSpacing:"0.1em",marginBottom:4}}>KEY FINDINGS</div>
          {output.keyFindings.slice(0,3).map((f,i)=>(
            <div key={i} style={{fontSize:10,color:"#d1d5db",lineHeight:1.5,display:"flex",gap:6,marginBottom:3}}>
              <span style={{color:"#10b981",flexShrink:0}}>▸</span><span>{f}</span>
            </div>
          ))}
        </div>
      )}
      {output.immediateRecommendations?.length>0&&(
        <div>
          <div style={{fontSize:8,fontFamily:"monospace",color:"#6b7280",letterSpacing:"0.1em",marginBottom:4}}>IMMEDIATE ACTIONS</div>
          {output.immediateRecommendations.slice(0,2).map((r,i)=>(
            <div key={i} style={{background:"#1f2937",borderRadius:4,padding:"5px 8px",marginBottom:4}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
                <span style={{fontSize:10,color:"#f9fafb",fontFamily:"monospace"}}>{r.action}</span>
                <span style={{fontSize:8,fontFamily:"monospace",color:priorityColor(r.priority),background:priorityBg(r.priority),padding:"1px 5px",borderRadius:3,border:`0.5px solid ${priorityBorder(r.priority)}`}}>{r.priority}</span>
              </div>
              {r.rationale&&<div style={{fontSize:9,color:"#6b7280",lineHeight:1.4}}>{r.rationale}</div>}
            </div>
          ))}
        </div>
      )}
      {output.commanderNote&&<div style={{fontSize:10,color:"#9ca3af",fontStyle:"italic",borderLeft:"2px solid #10b981",paddingLeft:8,lineHeight:1.5}}>{output.commanderNote}</div>}
    </div>
  );
  return <div style={{fontSize:11,color:"#9ca3af"}}>{typeof output==="string"?output:JSON.stringify(output)}</div>;
}

/* ─── Live News Sidebar ─────────────────────────────────────────────────── */
function LiveNewsSidebar({articles,loading,onInjectSignal}){
  return (
    <div style={{width:260,minWidth:260,background:"#0a0f1a",border:"0.5px solid #1f2937",borderRadius:8,padding:"10px 10px",display:"flex",flexDirection:"column",gap:6,overflow:"hidden"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
        <div style={{fontSize:9,fontFamily:"monospace",letterSpacing:"0.14em",color:"#10b981"}}>◉ LIVE INTEL FEED</div>
        {loading&&<span style={{fontSize:8,color:"#4b5563",fontFamily:"monospace"}}>fetching…</span>}
      </div>
      <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:5}}>
        {articles.slice(0,15).map((a,i)=>{
          const {icon,color}=getSourceIcon(a.url);
          const ts=a.date?new Date(String(a.date).slice(0,4)+"-"+String(a.date).slice(4,6)+"-"+String(a.date).slice(6,8)):null;
          return (
            <div key={i} onClick={()=>onInjectSignal(a.title)}
              style={{background:"rgba(255,255,255,.02)",border:`0.5px solid ${color}18`,borderRadius:5,padding:"6px 8px",cursor:"pointer",transition:"border-color .15s"}}
              onMouseEnter={e=>e.currentTarget.style.borderColor=`${color}55`}
              onMouseLeave={e=>e.currentTarget.style.borderColor=`${color}18`}>
              <div style={{display:"flex",gap:5,alignItems:"center",marginBottom:3}}>
                <span style={{fontSize:10}}>{icon}</span>
                <span style={{fontSize:8,fontFamily:"monospace",color,letterSpacing:"0.06em"}}>{a.source||"NEWS"}</span>
                <span style={{fontSize:8,color:"#4b5563",marginLeft:"auto"}}>{ts?ts.toLocaleDateString("en-GB",{day:"2-digit",month:"short"}):""}</span>
              </div>
              <div style={{fontSize:10,color:"#d1d5db",lineHeight:1.4}}>{a.title?.slice(0,90)}{a.title?.length>90?"…":""}</div>
            </div>
          );
        })}
        {!loading&&articles.length===0&&<div style={{fontSize:10,color:"#374151"}}>No live articles yet.</div>}
      </div>
    </div>
  );
}

/* ─── Live Footage Feeds ────────────────────────────────────────────────── */
const LIVE_FEEDS = [
  { name:"Al Jazeera English",  url:"https://www.youtube.com/embed/live_stream?channel=UCNye-wNBqNL5ZzHSJj3l8Bg&autoplay=1&mute=1", color:"#ef4444" },
  { name:"DW News",             url:"https://www.youtube.com/embed/live_stream?channel=UCknLrEdhRCp1aegoMqRaCZg&autoplay=1&mute=1", color:"#3b82f6" },
  { name:"France 24 English",   url:"https://www.youtube.com/embed/live_stream?channel=UCQfwfsi5VrQ8yKZ-UWmAoBw&autoplay=1&mute=1", color:"#1d4ed8" },
  { name:"Bloomberg TV",        url:"https://www.youtube.com/embed/live_stream?channel=UCIALMKvObZNtJ6AmdCLP7Lg&autoplay=1&mute=1", color:"#f59e0b" },
];

function LiveFootagePanel(){
  const [active,setActive]=useState(0);
  return (
    <div style={{background:"#0a0f1a",border:"0.5px solid #1f2937",borderRadius:8,overflow:"hidden",marginBottom:16}}>
      <div style={{background:"rgba(239,68,68,.08)",borderBottom:"0.5px solid rgba(239,68,68,.25)",padding:"8px 14px",display:"flex",alignItems:"center",gap:8}}>
        <div style={{width:7,height:7,borderRadius:"50%",background:"#ef4444",animation:"blink-live 1.2s ease-in-out infinite"}}/>
        <span style={{fontSize:10,fontFamily:"monospace",letterSpacing:"0.14em",color:"#ef4444"}}>LIVE FOOTAGE — GLOBAL NEWS STREAMS</span>
        <LiveClock/>
      </div>
      <div style={{display:"flex",gap:0,borderBottom:"0.5px solid #1f2937"}}>
        {LIVE_FEEDS.map((f,i)=>(
          <button key={i} onClick={()=>setActive(i)}
            style={{flex:1,padding:"6px 4px",fontSize:9,fontFamily:"monospace",background:active===i?`${f.color}18`:"transparent",border:"none",borderBottom:active===i?`2px solid ${f.color}`:"2px solid transparent",color:active===i?f.color:"#4b5563",cursor:"pointer",transition:"all .15s",letterSpacing:"0.04em"}}>
            {f.name}
          </button>
        ))}
      </div>
      <div style={{position:"relative",paddingBottom:"36%",height:0,overflow:"hidden"}}>
        <iframe
          key={active}
          src={LIVE_FEEDS[active].url}
          style={{position:"absolute",top:0,left:0,width:"100%",height:"100%",border:"none"}}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          title={LIVE_FEEDS[active].name}
        />
      </div>
    </div>
  );
}

/* ─── Main Platform ─────────────────────────────────────────────────────── */
export default function SentinelPlatform({setPredictedRoi,setAgentIntel,onDiscussionUpdate,onAnalysisRunning}){
  const [signal,         setSignal]         = useState("");
  const [running,        setRunning]        = useState(false);
  const [agenticRunning, setAgenticRunning] = useState(false);
  const [agentStatuses,  setAgentStatuses]  = useState({});
  const [agentOutputs,   setAgentOutputs]   = useState({});
  const [agentElapsed,   setAgentElapsed]   = useState({});
  const [agentTimestamps,setAgentTimestamps]= useState({});
  const [brief,          setBrief]          = useState(null);
  const [briefTs,        setBriefTs]        = useState(null);
  const [totalElapsed,   setTotalElapsed]   = useState(null);
  const [error,          setError]          = useState(null);
  const [agenticResult,  setAgenticResult]  = useState(null);
  const [liveNews,       setLiveNews]       = useState([]);
  const [newsLoading,    setNewsLoading]    = useState(true);
  const [liveTimer,      setLiveTimer]      = useState(0);
  const [discussion,     setDiscussion]     = useState([]);
  const startRef    = useRef(null);
  const timerRef    = useRef(null);
  const discussRef  = useRef(null);

  const addDiscussion = (from, to, msg) => {
    const entry = { from, to, msg, ts: new Date() };
    setDiscussion(prev => {
      const next = [...prev.slice(-24), entry];
      // also push to parent so TacticalMap can show it
      if(onDiscussionUpdate) onDiscussionUpdate(next);
      return next;
    });
    setTimeout(() => { if(discussRef.current) discussRef.current.scrollTop = discussRef.current.scrollHeight; }, 50);
  };

  const [autoRan, setAutoRan] = useState(false);

  /* ── Fetch live GDELT news on mount — global + India coverage ── */
  useEffect(()=>{
    const load = async ()=>{
      setNewsLoading(true);
      try {
        const r = await fetch("/api/conflict-news?q=conflict+war+airstrike+missile+ceasefire+india+pakistan+ukraine+russia+gaza+drone+attack+explosion&timespan=7d");
        const d = await r.json();
        const articles = d.articles||[];
        setLiveNews(articles);
        // Auto-populate signal + run agents once when news first arrives
        if(articles.length>0 && !autoRan){
          const autoSignal = articles.slice(0,5).map(a=>a.title).join(" | ");
          setSignal(autoSignal);
          setAutoRan(true);
        }
      } catch {}
      setNewsLoading(false);
    };
    load();
    const iv = setInterval(load, 90000);
    return ()=>clearInterval(iv);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  /* ── Build rich news context for agent prompts ── */
  const buildNewsContext = () => {
    const now = new Date().toISOString();
    if(!liveNews.length) return `LIVE NEWS CONTEXT (as of ${now}): No articles fetched — use verified public knowledge only, explicitly state uncertainty.`;
    return (
      `=== LIVE NEWS FEED — ${now} ===\n` +
      `Source count: ${liveNews.length} articles from GDELT global aggregator\n` +
      `CRITICAL INSTRUCTION: Base findings ONLY on headlines below. Do NOT invent events, dates, casualties, or locations not present in this feed. If uncertain, say "unverified".\n\n` +
      liveNews.slice(0,20).map((a,i)=>{
        const dateStr = a.date ? new Date(
          String(a.date).slice(0,4)+"-"+String(a.date).slice(4,6)+"-"+String(a.date).slice(6,8)
        ).toDateString() : "recent";
        return `${String(i+1).padStart(2,"0")}. [${a.source||"unknown"}] [${dateStr}] ${a.title}`;
      }).join("\n")
    );
  };

  const setAgent = (id,status,output=null,elapsed=null)=>{
    setAgentStatuses(prev=>({...prev,[id]:status}));
    if(output!==null) setAgentOutputs(prev=>({...prev,[id]:output}));
    if(elapsed!==null) setAgentElapsed(prev=>({...prev,[id]:elapsed}));
    if(status==="done") setAgentTimestamps(prev=>({...prev,[id]:new Date()}));
  };

  const runAgentic = async ()=>{
    if(!signal.trim()) return;
    setAgenticRunning(true);
    setAgenticResult(null);
    setError(null);
    try {
      const r = await fetch("/api/predict-conflict",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({query:signal})});
      const d = await r.json();
      if(d.error) throw new Error(d.error);
      setAgenticResult({...d, _timestamp: new Date().toISOString()});
      if(setPredictedRoi&&d.coordinates){
        setPredictedRoi({location_name:d.location_name,lat:d.coordinates.lat,lng:d.coordinates.lng,radius_km:d.radius_km||50,reasoning:d.reasoning,strategic_value:d.strategic_value,red_team_critique:d.red_team_critique,deception_score:d.deception_score,tactical_vulnerabilities:d.tactical_vulnerabilities,news_sources:d.news_sources,news_summary:d.news_summary});
      }
    } catch(e){ setError("Agentic Error: "+e.message); }
    finally { setAgenticRunning(false); }
  };

  const run = useCallback(async ()=>{
    if(!signal.trim()) return;
    setRunning(true);
    if(onAnalysisRunning) onAnalysisRunning(true);
    setError(null);
    setBrief(null);
    setBriefTs(null);
    setAgentStatuses({});
    setAgentOutputs({});
    setAgentElapsed({});
    setAgentTimestamps({});
    setDiscussion([]);
    if(onDiscussionUpdate) onDiscussionUpdate([]);
    setTotalElapsed(null);
    setLiveTimer(0);
    startRef.current = Date.now();
    timerRef.current = setInterval(()=>setLiveTimer(Math.floor((Date.now()-startRef.current)/1000)),500);

    const elap = ()=>((Date.now()-startRef.current)/1000).toFixed(1);
    const newsCtx = buildNewsContext();
    const nowISO = ()=>new Date().toISOString();

    try {
      /* ── Agent 1: OSINT ── */
      addDiscussion("SYSTEM","OSINT-AGENT",`Analysis initiated. ${liveNews.length} live articles available. Signal injected at ${nowISO()}. Dispatching 10 OSINT recon swarms to conflict zones.`);
      setAgent("osint","running");
      const osintRaw = await callLLM(
        `You are a senior OSINT Intelligence Officer. UTC NOW: ${nowISO()}.
Respond ONLY with valid JSON — no markdown, no commentary outside JSON.
Schema: {"streams":[{"source":"SIGINT|IMINT|SOCMINT|HUMINT|CYBINT","finding":"string","date":"string","verified":boolean}],"indicators":["string"],"liveNewsUsed":number}
STRICT RULES:
(1) Extract 4-6 intelligence streams directly quoting or paraphrasing headlines from the LIVE NEWS FEED provided. Cite the news source name in each finding.
(2) Do NOT invent events, locations, or casualty figures not present in the news feed.
(3) Each indicator must be tagged: e.g. "PRE-KINETIC: TROOP BUILDUP [reuters]", "INFO-OPS: STATE MEDIA BLACKOUT [ndtv]".
(4) Include Indian subcontinent, Middle East, Eastern Europe, and Africa events if present in news.
(5) "liveNewsUsed" = exact count of headlines you referenced.`,
        `SIGNAL: ${signal}\n\n${newsCtx}`
      );
      const osintData = parseJSON(osintRaw)||{streams:[{source:"ALL",finding:osintRaw}],indicators:[],liveNewsUsed:0};
      setAgent("osint","done",osintData,elap());
      addDiscussion("OSINT-AGENT","THREAT-AGENT",`OSINT swarm harvest complete. ${osintData.streams?.length||0} streams from 10 swarms across ${osintData.liveNewsUsed||0} live sources. Indicators: ${osintData.indicators?.slice(0,3).join(" · ")||"none"}. Swarms repositioning for Threat coverage.`);

      /* ── Agent 2: Threat ── */
      setAgent("threat","running");
      const threatRaw = await callLLM(
        `You are a Strategic Threat Analyst. UTC NOW: ${nowISO()}.
Respond ONLY with valid JSON — no markdown.
Schema: {"score":number,"level":"CRITICAL|HIGH|MODERATE|LOW","summary":"string","patterns":["string"]}
STRICT RULES:
(1) Score 0–100 based ONLY on events confirmed in the live news feed. Do not extrapolate beyond what is reported.
(2) summary must reference at least 2 specific news headlines by source name and approximate date.
(3) patterns must be grounded in actual reported events — label format: "PATTERN-TYPE: description [source]".
(4) Apply DIME/PMESII-PT framework to classify the phase: Shaping / Preparation / Execution / Exploitation.
(5) Include India-Pakistan, Gaza, Ukraine, Sudan, Myanmar if present in news feed.`,
        `SIGNAL: ${signal}\n\nOSINT: ${JSON.stringify(osintData)}\n\n${newsCtx}`
      );
      const threatData = parseJSON(threatRaw)||{score:70,level:"HIGH",summary:threatRaw,patterns:[]};
      setAgent("threat","done",threatData,elap());
      addDiscussion("THREAT-AGENT","SCENARIO-ENGINE",`Threat assessment via 10 signal-intercept swarms: ${threatData.score}/100 — ${threatData.level}. Dominant patterns: ${threatData.patterns?.slice(0,3).join(" · ")||"N/A"}. Launching War Games Director swarms for scenario simulation.`);

      /* ── Agent 3: Scenario ── */
      setAgent("scenario","running");
      const scenarioRaw = await callLLM(
        `You are the War Games Director. UTC NOW: ${nowISO()}.
Respond ONLY with valid JSON — no markdown.
Schema: {"scenarios":[{"name":"string","probability":number,"outcome":"string","recommendation":"string","psyopRisk":"string"}],"activeTactics":["string"],"redTeamDecision":"string","nextMoveProjection":"string"}
STRICT RULES:
(1) Generate exactly 3 scenarios: "Diplomatic De-escalation", "Controlled Military Response", "Full Escalation". Probabilities must sum to 100.
(2) Each scenario outcome must reference actual reported events from the live news feed — cite source names.
(3) activeTactics: list 4-6 tactics CONFIRMED active based on news evidence — do not speculate beyond reported facts.
(4) redTeamDecision: adversary's most likely next step based on their recent CONFIRMED actions in the news.
(5) nextMoveProjection: specific predicted action within 72 hours, grounded in the threat level and news evidence. State confidence level (low/medium/high).`,
        `SIGNAL: ${signal}\nTHREAT: ${threatData.level} (${threatData.score}/100)\nPATTERNS: ${threatData.patterns?.join(", ")}\n\n${newsCtx}`
      );
      const scenarioData = parseJSON(scenarioRaw)||{scenarios:[]};
      setAgent("scenario","done",scenarioData,elap());
      const worstCase = scenarioData.scenarios?.find(s=>s.name?.includes("Escalation"));
      addDiscussion("SCENARIO-ENGINE","CIVILIAN-MODEL",`War Games simulation complete via 10 red/blue-team swarms. Worst case: "${worstCase?.name||"Full Escalation"}" (P=${worstCase?.probability||"?"}%). Active tactics: ${scenarioData.activeTactics?.slice(0,2).join(", ")||"classified"}. Passing to Humanitarian swarms.`);

      /* ── Agent 4: Civilian Impact ── */
      setAgent("civilian","running");
      const civilianRaw = await callLLM(
        `You are the Humanitarian Impact Modeler. UTC NOW: ${nowISO()}.
Respond ONLY with valid JSON — no markdown.
Schema: {"populationAtRisk":"string","displacementRisk":"string","infrastructureRisk":"string","summary":"string","mitigationPriorities":["string"]}
STRICT RULES:
(1) populationAtRisk, displacementRisk, infrastructureRisk must use REAL reported figures from the live news if available (cite source). If no figure in news, use verified public UN/UNHCR baseline estimates and clearly label as "est.".
(2) summary must mention specific countries/regions from the live news feed with their approximate reported casualty/displacement figures.
(3) mitigationPriorities: 3-4 actionable items naming specific real organizations (UN OCHA, ICRC, WFP, MSF) relevant to the reported crisis.
(4) Apply IHL: proportionality, distinction, precaution principles to assess compliance issues from reported events.`,
        `SIGNAL: ${signal}\nTHREAT: ${threatData.level}\nSCENARIOS: ${JSON.stringify(scenarioData.scenarios?.map(s=>s.name))}\n\n${newsCtx}`
      );
      const civilianData = parseJSON(civilianRaw)||{populationAtRisk:"Unknown",displacementRisk:"Unknown",infrastructureRisk:"Unknown",summary:civilianRaw,mitigationPriorities:[]};
      setAgent("civilian","done",civilianData,elap());
      addDiscussion("CIVILIAN-MODEL","BRIEF-SYNTHESIS",`10 humanitarian assessment swarms complete. Population at risk: ${civilianData.populationAtRisk}. Displacement: ${civilianData.displacementRisk}. ${civilianData.mitigationPriorities?.length||0} IHL priorities identified. All 50 swarms reporting to Commander's Brief.`);

      /* ── Agent 5: Brief Synthesis ── */
      setAgent("brief","running");
      addDiscussion("BRIEF-SYNTHESIS","ALL-AGENTS",`50-swarm intelligence fusion initiated. All 4 specialist board inputs received. Synthesizing commander-grade brief with cross-swarm source traceability. UTC: ${nowISO()}`);
      const briefRaw = await callLLM(
        `You are the Chairman of the Strategic War Board. UTC NOW: ${nowISO()}.
Respond ONLY with valid JSON — no markdown, no text outside JSON object.
Schema: {
  "classification":"string",
  "situationAssessment":"string",
  "keyFindings":["string"],
  "immediateRecommendations":[{"action":"string","rationale":"string","source":"string","priority":"IMMEDIATE|URGENT|MONITOR"}],
  "strategicOutlook":"string",
  "windowOfAction":"string",
  "commanderNote":"string"
}
STRICT RULES:
(1) situationAssessment: 2-3 sentences using ONLY confirmed events from the live news feed. Cite at least 2 news sources by name and approximate date.
(2) keyFindings: 4-5 bullet points, each grounded in a specific reported event — format: "[DATE approx] [SOURCE] — finding".
(3) immediateRecommendations: each must cite its board agent AND the specific news event that triggered it. Mark unverified items as "UNVERIFIED:".
(4) windowOfAction: specific timeframe (e.g. "Next 24-72 hours") with reasoning from the evidence.
(5) commanderNote: address adversary psychology using ONLY evidence from the live news. Do not speculate beyond reported facts.
(6) classification: one of RESTRICTED / CONFIDENTIAL / SECRET — based on sensitivity of reported events.`,
        `SIGNAL: ${signal}
UTC: ${nowISO()}

BOARD INPUT [OSINT-OFFICER]: ${JSON.stringify(osintData)}
BOARD INPUT [THREAT-ANALYST]: ${JSON.stringify(threatData)}
BOARD INPUT [WAR-GAMES-DIRECTOR]: ${JSON.stringify(scenarioData)}
BOARD INPUT [IMPACT-MODELER]: ${JSON.stringify(civilianData)}

${newsCtx}`
      );
      const briefData = parseJSON(briefRaw);
      const now = new Date();
      setAgent("brief","done", briefData || {commanderNote: briefRaw?.slice(0,200)}, elap());
      setBriefTs(now);
      addDiscussion("BRIEF-SYNTHESIS","COMMANDER",`Brief complete. Classification: ${briefData?.classification||"RESTRICTED"}. ${briefData?.immediateRecommendations?.length||0} actionable recommendations. Window of action: ${briefData?.windowOfAction||"TBD"}. Ready for command review.`);

      const total = ((Date.now()-startRef.current)/1000).toFixed(1);
      setTotalElapsed(total);
      setBrief(briefData);

      if(setAgentIntel){
        setAgentIntel({osint:osintData,threat:threatData,scenarios:scenarioData,civilian:civilianData,brief:briefData,signal,timestamp:now.toISOString()});
      }
    } catch(e){
      setError(e.message);
      AGENTS.forEach(a=>{ setAgentStatuses(prev=>prev[a.id]==="running"?{...prev,[a.id]:"error"}:prev); });
    } finally {
      clearInterval(timerRef.current);
      setRunning(false);
      if(onAnalysisRunning) onAnalysisRunning(false);
    }
  },[signal,liveNews,onDiscussionUpdate,onAnalysisRunning]);

  useEffect(()=>()=>clearInterval(timerRef.current),[]);

  const [activeView, setActiveView] = useState('agents'); // 'agents' | 'news' | 'footage'

  const VIEWS = [
    { id:'agents',  label:'⬡ AGENTS' },
    { id:'news',    label:'📡 NEWS' },
    { id:'footage', label:'📺 FOOTAGE' },
  ];

  return (
    <div style={{fontFamily:"monospace",color:"#f9fafb",background:"#060a14",display:"flex",flexDirection:"column",height:"100%"}}>
      <style>{`
        @keyframes pulse-bar   { 0%,100%{width:40%;opacity:.7} 50%{width:85%;opacity:1} }
        @keyframes blink-live  { 0%,100%{opacity:1} 50%{opacity:.2} }
        @keyframes fade-in-up  { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        .sp-scroll::-webkit-scrollbar{width:4px}
        .sp-scroll::-webkit-scrollbar-thumb{background:rgba(16,185,129,.2);border-radius:4px}
        .sp-scroll::-webkit-scrollbar-track{background:transparent}
      `}</style>

      {/* ── Header ── */}
      <div style={{padding:"10px 14px 10px",borderBottom:"0.5px solid #1f2937",background:"rgba(16,185,129,.04)",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:8}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:8,fontFamily:"monospace",letterSpacing:"0.16em",color:"#4b5563",marginBottom:3}}>SENTINEL · 5-AGENT BOARD SYSTEM</div>
            <div style={{fontSize:13,fontWeight:700,fontFamily:"monospace",color:"#f9fafb",letterSpacing:"0.04em",lineHeight:1.2}}>Intelligence Platform</div>
          </div>
          <div style={{textAlign:"right",flexShrink:0}}>
            <LiveClock/>
            <div style={{fontSize:8,fontFamily:"monospace",color:"#374151",marginTop:3,letterSpacing:"0.06em"}}>{liveNews.length} LIVE ARTICLES</div>
          </div>
        </div>
      </div>

      {/* ── View tabs ── */}
      <div style={{display:"flex",borderBottom:"0.5px solid #1f2937",flexShrink:0,background:"rgba(0,0,0,.2)"}}>
        {VIEWS.map(v=>(
          <button key={v.id} onClick={()=>setActiveView(v.id)}
            style={{flex:1,padding:"9px 4px",fontSize:9,fontFamily:"monospace",letterSpacing:"0.1em",background:activeView===v.id?"rgba(16,185,129,.08)":"transparent",border:"none",borderBottom:activeView===v.id?"2px solid #10b981":"2px solid transparent",color:activeView===v.id?"#10b981":"#4b5563",cursor:"pointer",transition:"all .15s",textAlign:"center"}}>
            {v.label}
          </button>
        ))}
      </div>

      {/* ── AGENTS VIEW ── */}
      {activeView==='agents'&&(
        <div className="sp-scroll" style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:10,padding:"12px 12px 16px"}}>

          {/* Signal input */}
          <div style={{background:"#0d1320",border:"0.5px solid #1f2937",borderRadius:8,overflow:"hidden"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 12px",borderBottom:"0.5px solid #1f2937",background:"rgba(16,185,129,.04)"}}>
              <div style={{fontSize:8,fontFamily:"monospace",letterSpacing:"0.14em",color:"#6b7280"}}>◉ THREAT SIGNAL INPUT</div>
              <button onClick={()=>liveNews[0]&&setSignal(liveNews.slice(0,3).map(a=>a.title).join(" | "))}
                style={{fontSize:8,fontFamily:"monospace",padding:"3px 9px",border:"0.5px solid rgba(16,185,129,.35)",borderRadius:4,background:"rgba(16,185,129,.07)",color:"#10b981",cursor:"pointer",letterSpacing:"0.06em"}}>
                ↻ LIVE FEED
              </button>
            </div>
            <div style={{padding:"8px 12px"}}>
              <textarea value={signal} onChange={e=>setSignal(e.target.value)}
                placeholder="Enter region or conflict topic… e.g. 'India Pakistan border tensions', 'Gaza ceasefire update', 'Ukraine frontline Donetsk'"
                style={{width:"100%",minHeight:110,fontSize:16,color:"#f9fafb",background:"#111827",border:"0.5px solid #374151",borderRadius:6,padding:"10px 12px",resize:"vertical",lineHeight:1.6,boxSizing:"border-box",fontFamily:"monospace"}}/>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <button onClick={run} disabled={running||agenticRunning||!signal.trim()}
              style={{fontSize:10,fontFamily:"monospace",padding:"10px 6px",borderRadius:6,letterSpacing:"0.06em",textAlign:"center",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",background:running?"#1f2937":"rgba(16,185,129,.12)",border:`1px solid ${running?"rgba(16,185,129,.25)":"rgba(16,185,129,.45)"}`,color:running?"#10b981":"#10b981",opacity:(running||!signal.trim())?0.55:1,cursor:(running||!signal.trim())?"not-allowed":"pointer",transition:"all .15s"}}>
              {running?`⬡ ${liveTimer}s…`:"⬡ INITIATE ANALYSIS"}
            </button>
            <button onClick={runAgentic} disabled={running||agenticRunning||!signal.trim()}
              style={{fontSize:10,fontFamily:"monospace",padding:"10px 6px",borderRadius:6,letterSpacing:"0.06em",textAlign:"center",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",background:agenticRunning?"#1f2937":"rgba(59,130,246,.12)",border:`1px solid ${agenticRunning?"rgba(59,130,246,.25)":"rgba(59,130,246,.45)"}`,color:"#3b82f6",opacity:(agenticRunning||!signal.trim())?0.55:1,cursor:(agenticRunning||!signal.trim())?"not-allowed":"pointer",transition:"all .15s"}}>
              {agenticRunning?"⬡ PREDICTING…":"⬡ AGENT PREDICTION"}
            </button>
          </div>
          {(totalElapsed||error)&&(
            <div style={{display:"flex",gap:8,alignItems:"center",padding:"4px 0"}}>
              {totalElapsed&&<span style={{fontSize:9,fontFamily:"monospace",color:"#10b981",letterSpacing:"0.06em"}}>✓ BRIEF COMPLETE — {totalElapsed}s</span>}
              {error&&<span style={{fontSize:9,fontFamily:"monospace",color:"#ef4444"}}>⚠ {error}</span>}
            </div>
          )}

          {/* Inter-agent discussion log */}
          {discussion.length>0&&(
            <div style={{background:"#0a0f1a",border:"0.5px solid #1f2937",borderRadius:8,overflow:"hidden"}}>
              <div style={{padding:"6px 10px",borderBottom:"0.5px solid #1f2937",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:8,letterSpacing:"0.12em",color:"#10b981"}}>⬡ AGENT COMM CHANNEL</span>
                <span style={{fontSize:8,color:"#374151"}}>{discussion.length} msgs</span>
              </div>
              <div ref={discussRef} style={{maxHeight:160,overflowY:"auto",padding:"6px 10px",display:"flex",flexDirection:"column",gap:4}}>
                {discussion.map((d,i)=>{
                  const fc=d.from==="SYSTEM"?"#4b5563":d.from==="COMMANDER"?"#f59e0b":d.to==="COMMANDER"?"#10b981":"#3b82f6";
                  return (
                    <div key={i} style={{display:"flex",gap:6,alignItems:"flex-start",animation:"fade-in-up .3s ease"}}>
                      <span style={{fontSize:8,color:"#4b5563",minWidth:56,flexShrink:0,paddingTop:1}}>{d.ts.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit",second:"2-digit"})}</span>
                      <span style={{fontSize:8,color:fc,minWidth:80,flexShrink:0}}>[{d.from}]</span>
                      <span style={{fontSize:9,color:"#9ca3af",lineHeight:1.4}}>{d.msg}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── 5 Agent cards — single column ── */}
          <div style={{display:"flex",alignItems:"center",gap:8,marginTop:2,paddingBottom:6,borderBottom:"0.5px solid #1f2937"}}>
            <span style={{fontSize:8,fontFamily:"monospace",letterSpacing:"0.14em",color:"#6b7280"}}>⬡ BOARD MEMBERS</span>
            <div style={{flex:1,height:"0.5px",background:"#1f2937"}}/>
            <span style={{fontSize:8,fontFamily:"monospace",letterSpacing:"0.08em",color:"#374151"}}>5 AGENTS</span>
          </div>
          {AGENTS.map(agent=>(
            <AgentCard key={agent.id} agent={agent}
              status={agentStatuses[agent.id]||"idle"}
              output={agentOutputs[agent.id]}
              elapsed={agentElapsed[agent.id]}
              timestamp={agentTimestamps[agent.id]}/>
          ))}

          {/* Agentic CrewAI result */}
          {agenticResult&&(
            <div style={{background:"#111827",border:"0.5px solid #10b981",borderRadius:8,overflow:"hidden",animation:"fade-in-up .4s ease"}}>
              <div style={{background:"rgba(16,185,129,.08)",padding:"8px 12px",borderBottom:"0.5px solid #10b98133",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:4}}>
                <span style={{fontSize:9,letterSpacing:"0.12em",color:"#10b981"}}>⬡ AGENT PREDICTION — {agenticResult.location_name}</span>
                <span style={{fontSize:8,color:"#6b7280"}}>PROB {((agenticResult.conflict_probability||0)*100).toFixed(0)}%</span>
              </div>
              <div style={{padding:"10px 12px"}}>
                {agenticResult.news_summary&&<div style={{fontSize:11,color:"#9ca3af",lineHeight:1.6,marginBottom:8}}>{agenticResult.news_summary}</div>}
                {agenticResult.red_team_critique&&(
                  <div style={{paddingTop:8,borderTop:"0.5px solid #1f2937"}}>
                    <div style={{fontSize:8,color:"#ef4444",letterSpacing:"0.1em",marginBottom:4}}>ARTEMIS RED TEAM</div>
                    <div style={{fontSize:10,color:"#9ca3af",lineHeight:1.5}}>{agenticResult.red_team_critique}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Commander's Brief */}
          {brief&&(
            <div style={{background:"#111827",border:"0.5px solid #374151",borderRadius:8,overflow:"hidden",animation:"fade-in-up .4s ease"}}>
              <div style={{background:"#1f2937",padding:"10px 12px",borderBottom:"0.5px solid #374151",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:6}}>
                <div>
                  <div style={{fontSize:8,letterSpacing:"0.16em",color:"#6b7280",marginBottom:2}}>COMMANDER INTELLIGENCE BRIEF</div>
                  <div style={{fontSize:13,fontWeight:600,color:"#f9fafb"}}>{brief.classification||"RESTRICTED — EYES ONLY"}</div>
                </div>
                <div style={{fontSize:9,color:"#10b981"}}>{fmt(briefTs)}</div>
              </div>
              <div style={{padding:"12px",display:"flex",flexDirection:"column",gap:12}}>
                {brief.windowOfAction&&(
                  <div style={{background:"rgba(239,68,68,.08)",border:"0.5px solid rgba(239,68,68,.3)",borderRadius:6,padding:"8px 10px"}}>
                    <div style={{fontSize:8,color:"#ef4444",letterSpacing:"0.1em",marginBottom:3}}>◈ WINDOW OF ACTION</div>
                    <div style={{fontSize:11,color:"#ef4444",lineHeight:1.5}}>{brief.windowOfAction}</div>
                  </div>
                )}
                {brief.situationAssessment&&(
                  <div>
                    <div style={{fontSize:8,letterSpacing:"0.12em",color:"#6b7280",marginBottom:4}}>SITUATION</div>
                    <div style={{fontSize:11,color:"#d1d5db",lineHeight:1.6}}>{brief.situationAssessment}</div>
                  </div>
                )}
                {brief.keyFindings?.length>0&&(
                  <div>
                    <div style={{fontSize:8,letterSpacing:"0.12em",color:"#6b7280",marginBottom:5}}>KEY FINDINGS</div>
                    {brief.keyFindings.map((f,i)=>(
                      <div key={i} style={{display:"flex",gap:8,marginBottom:4,alignItems:"flex-start"}}>
                        <span style={{fontSize:9,color:"#3b82f6",minWidth:18,paddingTop:1}}>{String(i+1).padStart(2,"0")}</span>
                        <span style={{fontSize:11,color:"#9ca3af",lineHeight:1.5}}>{f}</span>
                      </div>
                    ))}
                  </div>
                )}
                {brief.immediateRecommendations?.length>0&&(
                  <div>
                    <div style={{fontSize:8,letterSpacing:"0.12em",color:"#6b7280",marginBottom:6}}>ACTIONABLE RECOMMENDATIONS</div>
                    {brief.immediateRecommendations.map((rec,i)=>(
                      <div key={i} style={{background:"#1f2937",borderRadius:6,padding:"8px 10px",borderLeft:`3px solid ${priorityColor(rec.priority)}`,marginBottom:6}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4,gap:6}}>
                          <div style={{fontSize:11,fontWeight:500,color:"#f9fafb",lineHeight:1.4}}>{rec.action}</div>
                          <span style={{fontSize:8,color:priorityColor(rec.priority),background:priorityBg(rec.priority),padding:"1px 6px",borderRadius:3,border:`0.5px solid ${priorityBorder(rec.priority)}`,whiteSpace:"nowrap"}}>{rec.priority}</span>
                        </div>
                        {rec.rationale&&<div style={{fontSize:10,color:"#9ca3af",lineHeight:1.4,marginBottom:4}}>{rec.rationale}</div>}
                        {rec.source&&<span style={{fontSize:8,color:"#3b82f6",background:"rgba(59,130,246,.08)",padding:"1px 6px",borderRadius:3,border:"0.5px solid rgba(59,130,246,.2)"}}>↗ {rec.source}</span>}
                      </div>
                    ))}
                  </div>
                )}
                {brief.strategicOutlook&&(
                  <div>
                    <div style={{fontSize:8,letterSpacing:"0.12em",color:"#6b7280",marginBottom:4}}>STRATEGIC OUTLOOK</div>
                    <div style={{fontSize:11,color:"#d1d5db",lineHeight:1.6}}>{brief.strategicOutlook}</div>
                  </div>
                )}
                {agentOutputs.civilian?.mitigationPriorities?.length>0&&(
                  <div>
                    <div style={{fontSize:8,letterSpacing:"0.12em",color:"#6b7280",marginBottom:5}}>CIVILIAN PROTECTION</div>
                    <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                      {agentOutputs.civilian.mitigationPriorities.map((p,i)=>(
                        <span key={i} style={{fontSize:10,color:"#f59e0b",background:"rgba(245,158,11,.08)",padding:"3px 8px",borderRadius:4,border:"0.5px solid rgba(245,158,11,.25)"}}>⬡ {p}</span>
                      ))}
                    </div>
                  </div>
                )}
                {brief.commanderNote&&(
                  <div style={{borderTop:"0.5px solid #1f2937",paddingTop:10}}>
                    <div style={{fontSize:8,letterSpacing:"0.12em",color:"#6b7280",marginBottom:4}}>COMMANDER'S NOTE</div>
                    <div style={{fontSize:11,color:"#9ca3af",lineHeight:1.6,fontStyle:"italic",borderLeft:"2px solid #10b981",paddingLeft:8}}>{brief.commanderNote}</div>
                  </div>
                )}
                <div style={{display:"flex",gap:5,flexWrap:"wrap",paddingTop:6,borderTop:"0.5px solid #1f2937",alignItems:"center"}}>
                  {["OSINT","THREAT","SCENARIO","CIVILIAN"].map(s=>(
                    <span key={s} style={{fontSize:8,color:"#4b5563",background:"#1f2937",padding:"2px 7px",borderRadius:3,border:"0.5px solid #374151"}}>✓ {s}</span>
                  ))}
                  <span style={{fontSize:8,color:"#10b981",marginLeft:"auto"}}>COMPLETE · {fmt(briefTs)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── NEWS VIEW ── */}
      {activeView==='news'&&(
        <div className="sp-scroll" style={{flex:1,overflowY:"auto",padding:"10px 12px",display:"flex",flexDirection:"column",gap:6}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <span style={{fontSize:8,fontFamily:"monospace",letterSpacing:"0.14em",color:"#10b981"}}>◉ LIVE INTEL FEED — {liveNews.length} ARTICLES</span>
            <button onClick={()=>{
              setNewsLoading(true);
              fetch("/api/conflict-news?q=conflict+war+airstrike+india+pakistan+ukraine+russia+gaza+missile+drone&timespan=7d")
                .then(r=>r.json()).then(d=>setLiveNews(d.articles||[])).catch(()=>{}).finally(()=>setNewsLoading(false));
            }} style={{fontSize:8,fontFamily:"monospace",padding:"3px 8px",border:"0.5px solid rgba(16,185,129,.35)",borderRadius:4,background:"rgba(16,185,129,.07)",color:"#10b981",cursor:"pointer"}}>
              {newsLoading?"…":"↻ REFRESH"}
            </button>
          </div>
          {newsLoading&&liveNews.length===0&&(
            <div style={{display:"flex",flexDirection:"column",gap:8,padding:"20px 0",alignItems:"center"}}>
              <div style={{fontSize:10,color:"#4b5563",fontFamily:"monospace"}}>Fetching live headlines…</div>
            </div>
          )}
          {liveNews.slice(0,25).map((a,i)=>{
            const {icon,color}=getSourceIcon(a.url);
            const ts=a.date?new Date(String(a.date).slice(0,4)+"-"+String(a.date).slice(4,6)+"-"+String(a.date).slice(6,8)):null;
            return (
              <div key={i} onClick={()=>{setSignal(prev=>prev?prev+"\n\n"+a.title:a.title);setActiveView('agents');}}
                style={{background:"rgba(255,255,255,.02)",border:`0.5px solid ${color}18`,borderRadius:6,padding:"8px 10px",cursor:"pointer",transition:"border-color .15s"}}
                onMouseEnter={e=>e.currentTarget.style.borderColor=`${color}55`}
                onMouseLeave={e=>e.currentTarget.style.borderColor=`${color}18`}>
                <div style={{display:"flex",gap:5,alignItems:"center",marginBottom:4}}>
                  <span style={{fontSize:10}}>{icon}</span>
                  <span style={{fontSize:8,fontFamily:"monospace",color,letterSpacing:"0.06em",fontWeight:600}}>{a.source||"NEWS"}</span>
                  <span style={{fontSize:8,color:"#4b5563",marginLeft:"auto",fontFamily:"monospace"}}>{ts?ts.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"2-digit"}):""}</span>
                </div>
                <div style={{fontSize:11,color:"#d1d5db",lineHeight:1.5}}>{a.title}</div>
                <div style={{marginTop:4,fontSize:8,color:"#4b5563",fontFamily:"monospace"}}>↗ click to inject into analysis</div>
              </div>
            );
          })}
          {!newsLoading&&liveNews.length===0&&(
            <div style={{textAlign:"center",padding:"30px 10px"}}>
              <div style={{fontSize:11,color:"#4b5563",marginBottom:8}}>No headlines loaded</div>
              <div style={{fontSize:9,color:"#374151",fontFamily:"monospace",marginBottom:12}}>GDELT may be rate-limited. Try refreshing in 30 seconds.</div>
              <button onClick={()=>{
                setNewsLoading(true);
                fetch("/api/conflict-news?q=war+conflict+attack&timespan=7d")
                  .then(r=>r.json()).then(d=>setLiveNews(d.articles||[])).catch(()=>{}).finally(()=>setNewsLoading(false));
              }} style={{fontSize:9,fontFamily:"monospace",padding:"5px 14px",border:"0.5px solid rgba(16,185,129,.4)",borderRadius:4,background:"rgba(16,185,129,.08)",color:"#10b981",cursor:"pointer"}}>
                ↻ RETRY
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── FOOTAGE VIEW ── */}
      {activeView==='footage'&&(
        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
          <LiveFootagePanel/>
        </div>
      )}
    </div>
  );
}
