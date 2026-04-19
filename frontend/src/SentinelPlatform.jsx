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
// Using direct YouTube live video IDs (channel-based embeds are deprecated)
const LIVE_FEEDS = [
  { name:"Al Jazeera",   id:"nU5gyDFyB28", channel:"https://www.youtube.com/@aljazeeraenglish/live", color:"#ef4444", flag:"🌍" },
  { name:"DW News",      id:"phLMo_K5iMo", channel:"https://www.youtube.com/@dwnews/live",           color:"#3b82f6", flag:"🇩🇪" },
  { name:"France 24",    id:"l8PMl7tUDIE", channel:"https://www.youtube.com/@FRANCE24English/live",  color:"#6366f1", flag:"🇫🇷" },
  { name:"Sky News",     id:"9Auq9mYxFEE", channel:"https://www.youtube.com/@SkyNews/live",          color:"#0ea5e9", flag:"🇬🇧" },
  { name:"NDTV India",   id:"qHkqkpP3J0g", channel:"https://www.youtube.com/@ndtv/live",             color:"#f59e0b", flag:"🇮🇳" },
  { name:"Bloomberg",    id:"dp8PhLsUcFE", channel:"https://www.youtube.com/@bloombergtv/live",      color:"#10b981", flag:"📈" },
];

function LiveFootagePanel(){
  const [active, setActive] = useState(0);
  const [errored, setErrored] = useState({});
  const feed = LIVE_FEEDS[active];
  const embedUrl = `https://www.youtube.com/embed/${feed.id}?autoplay=1&mute=1&rel=0&modestbranding=1`;

  return (
    <div style={{background:"#0a0f1a",border:"0.5px solid #1f2937",borderRadius:8,overflow:"hidden",display:"flex",flexDirection:"column"}}>
      {/* Header */}
      <div style={{background:"rgba(239,68,68,.08)",borderBottom:"0.5px solid rgba(239,68,68,.25)",padding:"7px 12px",display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
        <div style={{width:7,height:7,borderRadius:"50%",background:"#ef4444",animation:"blink-live 1.2s ease-in-out infinite",flexShrink:0}}/>
        <span style={{fontSize:9,fontFamily:"monospace",letterSpacing:"0.14em",color:"#ef4444",flex:1}}>LIVE FOOTAGE — GLOBAL NEWS STREAMS</span>
        <LiveClock/>
      </div>

      {/* Channel tabs — scrollable on small screens */}
      <div style={{display:"flex",borderBottom:"0.5px solid #1f2937",overflowX:"auto",flexShrink:0}}>
        {LIVE_FEEDS.map((f,i)=>(
          <button key={i} onClick={()=>{setActive(i);}}
            style={{flexShrink:0,padding:"7px 10px",fontSize:9,fontFamily:"monospace",
              background:active===i?`${f.color}18`:"transparent",
              border:"none",borderBottom:active===i?`2px solid ${f.color}`:"2px solid transparent",
              color:active===i?f.color:"#4b5563",cursor:"pointer",transition:"all .15s",letterSpacing:"0.04em",
              whiteSpace:"nowrap"}}>
            {f.flag} {f.name}
          </button>
        ))}
      </div>

      {/* Video embed */}
      <div style={{position:"relative",paddingBottom:"56.25%",height:0,overflow:"hidden",background:"#000"}}>
        {errored[active] ? (
          /* Fallback when embed is blocked */
          <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12,padding:20}}>
            <div style={{fontSize:11,color:"#6b7280",fontFamily:"monospace",textAlign:"center"}}>
              Embed blocked by {feed.name}
            </div>
            <a href={feed.channel} target="_blank" rel="noopener noreferrer"
              style={{fontSize:10,fontFamily:"monospace",padding:"8px 18px",border:"0.5px solid rgba(239,68,68,.5)",borderRadius:6,
                background:"rgba(239,68,68,.1)",color:"#ef4444",textDecoration:"none",display:"inline-block"}}>
              ▶ Watch {feed.name} Live on YouTube ↗
            </a>
          </div>
        ) : (
          <iframe
            key={active}
            src={embedUrl}
            style={{position:"absolute",top:0,left:0,width:"100%",height:"100%",border:"none"}}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            title={feed.name}
            onError={()=>setErrored(prev=>({...prev,[active]:true}))}
          />
        )}
      </div>

      {/* Direct link row */}
      <div style={{padding:"6px 12px",borderTop:"0.5px solid #1f2937",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
        <span style={{fontSize:8,color:"#374151",fontFamily:"monospace"}}>{feed.flag} {feed.name.toUpperCase()} — 24/7 LIVE</span>
        <a href={feed.channel} target="_blank" rel="noopener noreferrer"
          style={{fontSize:8,fontFamily:"monospace",color:"#10b981",textDecoration:"none",padding:"3px 8px",
            border:"0.5px solid rgba(16,185,129,.3)",borderRadius:3,background:"rgba(16,185,129,.06)"}}>
          ↗ OPEN IN YOUTUBE
        </a>
      </div>
    </div>
  );
}

/* ─── Main Platform ─────────────────────────────────────────────────────── */
export default function SentinelPlatform({setPredictedRoi,setAgentIntel,onDiscussionUpdate,onAnalysisRunning,onLocalIntelUpdate,onSarUpdate,onSarAutoOverlay,mapSearchTarget}){
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

  const [autoRan,       setAutoRan]       = useState(false);
  const [nextRefreshIn, setNextRefreshIn] = useState(60);
  const [agentCycle,    setAgentCycle]    = useState(0);   // increments each auto-run
  const runRef   = useRef(null);    // holds latest `run` so interval can call it
  const newsRef  = useRef([]);      // latest news without re-subscribing

  /* ── Countdown ticker — shows seconds until next news refresh ── */
  useEffect(()=>{
    const t = setInterval(()=>setNextRefreshIn(p=>p<=1?60:p-1),1000);
    return ()=>clearInterval(t);
  },[]);

  /* ── Fetch live GDELT news every 60 s — then auto-run agents ── */
  useEffect(()=>{
    const load = async ()=>{
      setNewsLoading(true);
      try {
        const r = await fetch("/api/conflict-news?q=conflict+war+airstrike+missile+ceasefire+india+pakistan+ukraine+russia+gaza+drone+attack+explosion&timespan=7d");
        const d = await r.json();
        const articles = d.articles||[];
        newsRef.current = articles;
        setLiveNews(articles);
        // First load — seed signal
        if(!autoRan){
          const autoSignal = articles.length>0
            ? articles.slice(0,5).map(a=>a.title).join(" | ")
            : "Ukraine Russia frontline Donetsk conflict | Gaza airstrike humanitarian crisis | India Pakistan border tensions | Sudan civil war RSF | Yemen Houthi Red Sea";
          setSignal(autoSignal);
          setAutoRan(true);
        }
        // Every refresh — update signal with latest headlines and trigger agent cycle
        if(autoRan && articles.length>0){
          setSignal(articles.slice(0,5).map(a=>a.title).join(" | "));
          setNextRefreshIn(60);
          setAgentCycle(c=>c+1); // triggers the agent auto-run effect below
        }
      } catch {}
      setNewsLoading(false);
    };
    load();
    const iv = setInterval(load, 60000);
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

  const run = useCallback(async (overrideSignal)=>{
    const sig = (typeof overrideSignal === 'string' ? overrideSignal : signal).trim();
    if(!sig) return;
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
        `SIGNAL: ${sig}\n\n${newsCtx}`
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
        `SIGNAL: ${sig}\n\nOSINT: ${JSON.stringify(osintData)}\n\n${newsCtx}`
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
        `SIGNAL: ${sig}\nTHREAT: ${threatData.level} (${threatData.score}/100)\nPATTERNS: ${threatData.patterns?.join(", ")}\n\n${newsCtx}`
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
        `SIGNAL: ${sig}\nTHREAT: ${threatData.level}\nSCENARIOS: ${JSON.stringify(scenarioData.scenarios?.map(s=>s.name))}\n\n${newsCtx}`
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
        `SIGNAL: ${sig}
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

  // Keep runRef current so the cycle effect can call latest version
  useEffect(()=>{ runRef.current = run; },[run]);

  // Auto-run 5-agent board whenever news refreshes (agentCycle increments)
  useEffect(()=>{
    if(agentCycle===0) return;               // skip mount
    if(!runRef.current) return;
    if(running||agenticRunning) return;      // already running — skip this tick
    runRef.current();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[agentCycle]);

  const [activeView, setActiveView] = useState('agents'); // 'agents' | 'news' | 'footage' | 'localintel'

  const VIEWS = [
    { id:'agents',     label:'⬡ AGENTS' },
    { id:'news',       label:'📡 NEWS' },
    { id:'footage',    label:'📺 FOOTAGE' },
    { id:'localintel', label:'🛰 LOCAL' },
    { id:'sar',        label:'🛸 SAR' },
    { id:'dcloc',      label:'🏢 DC LOCATOR' },
  ];

  /* ── Local Intelligence state — declared BEFORE SAR callbacks that reference liLocation/liBoundary ── */
  const [liLocation,   setLiLocation]   = useState('');
  const [liInput,      setLiInput]      = useState('');
  const [liBoundary,   setLiBoundary]   = useState(null);
  const [liArticles,   setLiArticles]   = useState([]);
  const [liPrediction, setLiPrediction] = useState(null);
  const [liLoading,    setLiLoading]    = useState(false);
  const [liPredLoading,setLiPredLoading]= useState(false);
  const [liError,      setLiError]      = useState(null);
  const [liHistory,    setLiHistory]    = useState([]);
  const [liAgentStatus,setLiAgentStatus]= useState(null);
  const liTimerRef   = useRef(null);
  const [liAgents,     setLiAgents]     = useState([]);
  const [liSynthesis,  setLiSynthesis]  = useState(null);
  const [liAgentsLoading, setLiAgentsLoading] = useState(false);

  /* ── SAR Satellite state ── */
  const [sarLat,        setSarLat]        = useState('');
  const [sarLng,        setSarLng]        = useState('');
  const [sarRadius,     setSarRadius]     = useState('50');
  const [sarTimespan,   setSarTimespan]   = useState('30d');
  const [sarCollection, setSarCollection] = useState('sentinel-1-grd');
  const [sarPolariz,    setSarPolariz]    = useState('ALL');
  const [sarScenes,     setSarScenes]     = useState([]);
  const [sarLoading,    setSarLoading]    = useState(false);
  const [sarSelected,   setSarSelected]  = useState(null);
  const [sarPreviewUrl, setSarPreviewUrl] = useState(null);
  const [sarPreviewLoading, setSarPreviewLoading] = useState(false);
  const [sarError,      setSarError]      = useState(null);
  const [sarTotal,      setSarTotal]      = useState(0);
  const [sarInfo,       setSarInfo]       = useState(null);
  const [sarStatus,     setSarStatus]     = useState(null);
  const [sarAnalysis,   setSarAnalysis]   = useState(null);
  const [sarAnalysisLoading, setSarAnalysisLoading] = useState(false);
  const [sarAnalysisError,   setSarAnalysisError]   = useState(null);

  /* ── InSAR / DEM state ── */
  const [insarTab,      setInsarTab]      = useState('dem');  // 'dem' | 'change'
  const [insarDemUrl,   setInsarDemUrl]   = useState(null);
  const [insarChgUrl,   setInsarChgUrl]   = useState(null);
  const [insarLoading,  setInsarLoading]  = useState(false);
  const [insarError,    setInsarError]    = useState(null);
  const [insarBbox,     setInsarBbox]     = useState(null);

  /* ── DC Locator state ── */
  const [dcQuery,       setDcQuery]       = useState('');
  const [dcLoading,     setDcLoading]     = useState(false);
  const [dcError,       setDcError]       = useState(null);
  const [dcResults,     setDcResults]     = useState(null);
  const [dcDetailTab,   setDcDetailTab]   = useState('locations'); // 'locations'|'asns'|'prefixes'|'subdomains'

  // Auto-fill lat/lng from Local Intel boundary when switching to SAR tab
  useEffect(() => {
    if (activeView === 'sar' && liBoundary?.lat && !sarLat) {
      setSarLat(liBoundary.lat.toFixed(5));
      setSarLng(liBoundary.lng.toFixed(5));
    }
    if (activeView === 'sar' && !sarStatus) {
      fetch('/api/sar-catalog?action=status').then(r=>r.json()).then(d=>setSarStatus(d)).catch(()=>{});
    }
  }, [activeView, liBoundary, sarLat, sarStatus]);

  // Auto-overlay: fetch most-recent SAR scene for each conflict hotspot on mount
  useEffect(() => {
    if (!onSarAutoOverlay) return;
    const HOTSPOTS = [
      { zone:'Gaza',     lat: 31.5017, lng: 34.4668 },
      { zone:'Donetsk',  lat: 48.0159, lng: 37.8028 },
      { zone:'Kharkiv',  lat: 49.9935, lng: 36.2304 },
      { zone:'Rafah',    lat: 31.2827, lng: 34.2654 },
      { zone:'Khartoum', lat: 15.5007, lng: 32.5599 },
    ];

    async function fetchSceneAndThumb(hotspot) {
      try {
        const params = new URLSearchParams({
          action: 'search', lat: hotspot.lat, lng: hotspot.lng,
          radius_km: '80', timespan: '3d', collection: 'sentinel-1-grd',
          limit: '1',
        });
        const r = await fetch(`/api/sar-catalog?${params}`);
        if (!r.ok) return;
        const d = await r.json();
        const scene = d.scenes?.[0];
        if (!scene?.bbox) return;

        // Try thumbnail, then Process API
        let previewUrl = null;
        if (scene.thumbnail_url) {
          try {
            const tr = await fetch(`/api/sar-catalog?action=thumbnail&url=${encodeURIComponent(scene.thumbnail_url)}`);
            if (tr.ok) {
              const blob = await tr.blob();
              if (blob.size > 500) previewUrl = URL.createObjectURL(blob);
            }
          } catch(_) {}
        }
        if (!previewUrl) {
          try {
            const pol = (scene.polarization.includes('VV') && scene.polarization.includes('VH')) ? 'DV' : (scene.polarization.includes('VH') ? 'SV' : 'SH');
            const pp = new URLSearchParams({ action:'preview', bbox: JSON.stringify(scene.bbox), from_date: scene.preview_from, to_date: scene.preview_to, collection:'sentinel-1-grd', orbit: scene.orbit, polarization: pol });
            const pr = await fetch(`/api/sar-catalog?${pp}`);
            if (pr.ok) { const blob = await pr.blob(); if (blob.size > 500) previewUrl = URL.createObjectURL(blob); }
          } catch(_) {}
        }
        onSarAutoOverlay({ zone: hotspot.zone, sceneName: scene.date_label || scene.date?.slice(0,16), bbox: scene.bbox, previewUrl, footprint: scene.geometry, date: scene.date });
      } catch(_) {}
    }

    // Stagger requests to avoid hammering the API
    HOTSPOTS.forEach((h, i) => setTimeout(() => fetchSceneAndThumb(h), i * 2500));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchSarScenes = useCallback(async () => {
    const lat = parseFloat(sarLat), lng = parseFloat(sarLng);
    if (isNaN(lat) || isNaN(lng)) { setSarError('Enter valid latitude and longitude.'); return; }
    setSarLoading(true); setSarError(null); setSarScenes([]); setSarSelected(null); setSarPreviewUrl(null);
    try {
      const params = new URLSearchParams({
        action:      'search',
        lat:         lat.toString(),
        lng:         lng.toString(),
        radius_km:   sarRadius || '50',
        timespan:    sarTimespan,
        collection:  sarCollection,
        polarization:sarPolariz,
        limit:       '10',
        location:    liLocation || '',
      });
      const r = await fetch(`/api/sar-catalog?${params}`);
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setSarScenes(d.scenes || []);
      setSarTotal(d.total || 0);
      setSarInfo({ location: d.location, datetime: d.datetime });
      if (onSarUpdate) onSarUpdate(null); // clear any previous footprint
    } catch(e) { setSarError(e.message); }
    finally    { setSarLoading(false); }
  }, [sarLat, sarLng, sarRadius, sarTimespan, sarCollection, sarPolariz, liLocation, onSarUpdate]);

  const loadSarPreview = useCallback(async (scene) => {
    if (!scene) return;
    setSarSelected(scene); setSarPreviewUrl(null); setSarPreviewLoading(true);
    if (onSarUpdate) onSarUpdate({ footprint: scene.geometry, bbox: scene.bbox, sceneName: scene.date_label, date: scene.date });

    const pushUrl = (url) => {
      setSarPreviewUrl(url);
      if (onSarUpdate) onSarUpdate({
        footprint: scene.geometry, bbox: scene.bbox,
        sceneName: scene.date_label, date: scene.date, previewUrl: url,
      });
    };

    // Step 1 — try the STAC thumbnail (fast, auth-proxied, always available)
    if (scene.thumbnail_url) {
      try {
        const tr = await fetch(`/api/sar-catalog?action=thumbnail&url=${encodeURIComponent(scene.thumbnail_url)}`);
        if (tr.ok) {
          const blob = await tr.blob();
          if (blob.size > 500) { pushUrl(URL.createObjectURL(blob)); setSarPreviewLoading(false); return; }
        }
      } catch(_) { /* fall through to Process API */ }
    }

    // Step 2 — try Copernicus SentinelHub Process API (false-colour VV/VH)
    try {
      const params = new URLSearchParams({
        action:      'preview',
        bbox:        JSON.stringify(scene.bbox),
        from_date:   scene.preview_from,
        to_date:     scene.preview_to,
        collection:  sarCollection,
        orbit:       scene.orbit,
        polarization:(scene.polarization.includes('VV') && scene.polarization.includes('VH')) ? 'DV' : (scene.polarization.includes('VH') ? 'SV' : 'SH'),
      });
      const r = await fetch(`/api/sar-catalog?${params}`);
      if (!r.ok) {
        // Try to extract error detail from JSON body
        let detail = `HTTP ${r.status}`;
        try { const j = await r.json(); detail = j.details || j.error || detail; } catch(_) {}
        throw new Error(detail);
      }
      const blob = await r.blob();
      if (blob.size < 500) throw new Error('Empty image returned by Process API');
      pushUrl(URL.createObjectURL(blob));
    } catch(e) {
      setSarPreviewUrl('error:' + e.message);
    } finally {
      setSarPreviewLoading(false);
    }
  }, [sarCollection, onSarUpdate]);

  const fetchSarAnalysis = useCallback(async () => {
    if (!sarScenes.length) return;
    setSarAnalysisLoading(true); setSarAnalysis(null); setSarAnalysisError(null);
    const location = sarInfo?.location || liLocation || `${sarLat}, ${sarLng}`;
    const scenesSummary = sarScenes.slice(0, 10).map((s, i) =>
      `Scene ${i+1}: ${s.date_label||s.date?.slice(0,16)} | ${s.orbit} | ${s.polarization} | ${s.mode} | ${s.resolution} | Platform: ${s.platform} | Orbit#: ${s.orbit_number}`
    ).join('\n');
    const systemPrompt = `You are a military intelligence analyst specializing in Synthetic Aperture Radar (SAR) satellite imagery interpretation for conflict zone assessment. You analyze Sentinel-1 SAR scene metadata to infer ground activity, infrastructure changes, and tactical significance. Be precise, structured, and use OSINT-grade analytical language. Return your analysis in this exact JSON format:
{
  "activity_assessment": "2-3 sentences on what the SAR coverage pattern and scene frequency suggests about ground activity",
  "temporal_pattern": "Analysis of the time distribution of scenes — gaps, clusters, revisit frequency and what they imply",
  "orbit_analysis": "Ascending vs descending orbit breakdown and what each viewing geometry reveals about the terrain/targets",
  "polarization_insight": "What VV/VH polarization mix tells us about surface types — buildings, vegetation, water, disturbed soil",
  "key_indicators": ["list", "of", "up to 5 tactical indicators observable from this SAR dataset"],
  "change_detection_potential": "Assessment of whether this scene set supports coherent change detection (InSAR/SBAS)",
  "threat_assessment": "Brief tactical threat assessment based on scene geometry and coverage",
  "recommended_followup": "What additional SAR queries or tasking would sharpen the picture"
}`;
    const userPrompt = `Perform SAR scene-wise intelligence analysis for: ${location}

SEARCH PARAMETERS:
- Timespan: ${sarTimespan}
- Collection: ${sarCollection}
- Polarization filter: ${sarPolariz}
- Radius: ${sarRadius} km
- Total scenes found: ${sarTotal}

SCENE MANIFEST (${sarScenes.length} scenes):
${scenesSummary}

Analyze this SAR dataset and return the JSON intelligence assessment.`;
    // Overlay all scene footprints on the map during analysis
    if (onSarUpdate) onSarUpdate({ allScenes: sarScenes, location });
    try {
      const r = await fetch('/api/gemini-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemPrompt, userPrompt }),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      const raw = d.text || '';
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON in response');
      setSarAnalysis(JSON.parse(jsonMatch[0]));
    } catch(e) {
      setSarAnalysisError(e.message);
    } finally {
      setSarAnalysisLoading(false);
    }
  }, [sarScenes, sarInfo, sarTotal, liLocation, sarLat, sarLng, sarTimespan, sarCollection, sarPolariz, sarRadius, onSarUpdate]);

  /* ── InSAR / DEM fetch callbacks ──────────────────────────────────────── */
  const fetchDem = useCallback(async () => {
    if (!sarLat || !sarLng) return;
    setInsarLoading(true); setInsarError(null);
    try {
      const params = new URLSearchParams({
        action: 'dem', lat: sarLat, lng: sarLng,
        radius_km: sarRadius || '50', dem_instance: 'COPERNICUS_30',
      });
      const r = await fetch(`/api/sar-catalog?${params}`);
      if (!r.ok) {
        const d = await r.json().catch(()=>({error:'DEM fetch failed'}));
        throw new Error(d.error || `HTTP ${r.status}`);
      }
      // Parse bbox from response header
      const bboxHdr = r.headers.get('X-Bbox');
      if (bboxHdr) setInsarBbox(JSON.parse(bboxHdr));
      else {
        const R = (parseFloat(sarRadius)||50) / 111;
        const lat = parseFloat(sarLat), lng = parseFloat(sarLng);
        setInsarBbox([lng-R, lat-R, lng+R, lat+R]);
      }
      const blob = await r.blob();
      if (blob.size < 500) throw new Error('DEM image too small — area may be outside Copernicus coverage');
      setInsarDemUrl(URL.createObjectURL(blob));
    } catch(e) {
      setInsarError(e.message);
    } finally {
      setInsarLoading(false);
    }
  }, [sarLat, sarLng, sarRadius]);

  const fetchInsarChange = useCallback(async () => {
    if (!sarLat || !sarLng) return;
    setInsarLoading(true); setInsarError(null);
    try {
      // Span = sarTimespan converted to from/to dates
      const days = {'1d':1,'3d':3,'7d':7,'14d':14,'30d':30,'90d':90}[sarTimespan] || 30;
      const to   = new Date().toISOString().slice(0,10);
      const from = new Date(Date.now() - days*86400000).toISOString().slice(0,10);
      const params = new URLSearchParams({
        action: 'insar', lat: sarLat, lng: sarLng,
        radius_km: sarRadius || '50',
        from_date: from, to_date: to,
        collection: sarCollection || 'sentinel-1-grd',
      });
      const r = await fetch(`/api/sar-catalog?${params}`);
      if (!r.ok) {
        const d = await r.json().catch(()=>({error:'InSAR fetch failed'}));
        throw new Error(d.error || `HTTP ${r.status}`);
      }
      const bboxHdr = r.headers.get('X-Bbox');
      if (bboxHdr) setInsarBbox(JSON.parse(bboxHdr));
      else {
        const R = (parseFloat(sarRadius)||50) / 111;
        const lat = parseFloat(sarLat), lng = parseFloat(sarLng);
        setInsarBbox([lng-R, lat-R, lng+R, lat+R]);
      }
      const blob = await r.blob();
      if (blob.size < 500) throw new Error('Change map too small — no SAR coverage for this timespan');
      setInsarChgUrl(URL.createObjectURL(blob));
    } catch(e) {
      setInsarError(e.message);
    } finally {
      setInsarLoading(false);
    }
  }, [sarLat, sarLng, sarRadius, sarTimespan, sarCollection]);

  // Fetch all 7 local intel agents — must be defined BEFORE fetchLocalIntel (TDZ guard)
  const fetchLiAgents = useCallback(async (loc) => {
    if (!loc) return;
    setLiAgentsLoading(true);
    try {
      const r = await fetch(`/api/local-intel?action=agents&location=${encodeURIComponent(loc)}`);
      const d = await r.json();
      if (d.agents) setLiAgents(d.agents);
      if (d.synthesis) setLiSynthesis(d.synthesis);
    } catch(e) {
      // silently ignore
    } finally {
      setLiAgentsLoading(false);
    }
  }, []);

  // Fetch Local Intel (boundary + news) — Vercel serverless
  const fetchLocalIntel = useCallback(async (loc) => {
    if (!loc) return;
    setLiLoading(true); setLiError(null);
    try {
      const r = await fetch(`/api/local-intel?action=search&location=${encodeURIComponent(loc)}&timespan=7d`);
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setLiBoundary(d.boundary || null);
      setLiArticles(d.articles || []);
      setLiLocation(loc);
      if (onLocalIntelUpdate) onLocalIntelUpdate({ boundary: d.boundary, location: loc });
      // Kick off 7-agent run in parallel (non-blocking for boundary/news)
      fetchLiAgents(loc);
    } catch(e) {
      setLiError(e.message);
    } finally {
      setLiLoading(false);
    }
  }, [onLocalIntelUpdate, fetchLiAgents]);

  // Fetch AI prediction — calls Vercel local-intel endpoint (uses HF LLM)
  const fetchLiPrediction = useCallback(async (loc) => {
    if (!loc) return;
    setLiPredLoading(true);
    try {
      // Use the same Vercel endpoint — it includes prediction in the search response
      const r = await fetch(`/api/local-intel?action=search&location=${encodeURIComponent(loc)}&timespan=3d`);
      const d = await r.json();
      if (d.prediction) setLiPrediction(d.prediction);
    } catch(e) {
      // silently ignore prediction errors
    } finally {
      setLiPredLoading(false);
    }
  }, []);

  // Auto-refresh Local Intel agents + prediction every 60 s when location is set
  useEffect(() => {
    if (!liLocation) return;
    const tick = () => {
      if (!liLoading)    fetchLocalIntel(liLocation);
      if (!liPredLoading) fetchLiPrediction(liLocation);
    };
    liTimerRef.current = setInterval(tick, 60000);
    return () => clearInterval(liTimerRef.current);
  }, [liLocation, fetchLocalIntel, fetchLiPrediction, liLoading, liPredLoading]);

  // ── Auto 360° analysis triggered by map search ──────────────────────────
  useEffect(() => {
    if (!mapSearchTarget) return;
    const { lat, lng, name } = mapSearchTarget;
    if (!name || isNaN(lat) || isNaN(lng)) return;

    // 1. Switch to agents tab
    setActiveView('agents');
    setSignal(name);
    setLiInput(name);

    // 2. Fetch local intel (news + boundary)
    fetchLocalIntel(name);
    fetchLiPrediction(name);

    // 3. SAR search directly (bypass state-async issue)
    const doSarSearch = async () => {
      setSarLoading(true); setSarError(null); setSarScenes([]);
      setSarLat(String(lat)); setSarLng(String(lng));
      try {
        const params = new URLSearchParams({
          action:'search', lat, lng, radius_km:'80',
          timespan:'14d', collection:'sentinel-1-grd', limit:'5', location: name,
        });
        const r = await fetch(`/api/sar-catalog?${params}`);
        const d = await r.json();
        if (!d.error && d.scenes?.length) {
          setSarScenes(d.scenes);
          setSarTotal(d.total || d.scenes.length);
          setSarInfo({ location: name, datetime: d.datetime });
          // Auto-load and overlay first 2 scenes
          for (let i = 0; i < Math.min(2, d.scenes.length); i++) {
            const scene = d.scenes[i];
            if (!scene?.bbox) continue;
            if (scene.thumbnail_url) {
              try {
                const tr = await fetch(`/api/sar-catalog?action=thumbnail&url=${encodeURIComponent(scene.thumbnail_url)}`);
                if (tr.ok) {
                  const blob = await tr.blob();
                  if (blob.size > 500) {
                    const url = URL.createObjectURL(blob);
                    if (onSarAutoOverlay) onSarAutoOverlay({ zone: name, sceneName: scene.date_label||scene.date?.slice(0,16), bbox: scene.bbox, previewUrl: url, footprint: scene.geometry, date: scene.date });
                    if (i === 0 && onSarUpdate) onSarUpdate({ footprint: scene.geometry, bbox: scene.bbox, sceneName: scene.date_label, date: scene.date, previewUrl: url });
                    continue;
                  }
                }
              } catch(_) {}
            }
            // No thumbnail — push footprint-only overlay
            if (onSarAutoOverlay) onSarAutoOverlay({ zone: name, sceneName: scene.date_label||scene.date?.slice(0,16), bbox: scene.bbox, previewUrl: null, footprint: scene.geometry, date: scene.date });
          }
        } else if (d.error) {
          setSarError(d.error);
        }
      } catch(e) { setSarError(e.message); }
      finally    { setSarLoading(false); }
    };
    doSarSearch();

    // 4. Run 5-agent board with location as signal (delay 800ms to let state settle)
    const t = setTimeout(() => {
      if (!running && !agenticRunning && runRef.current) {
        runRef.current(name);
      }
    }, 800);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapSearchTarget]);

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
            <div style={{display:"flex",alignItems:"center",gap:5,marginTop:3,justifyContent:"flex-end"}}>
              <span style={{width:5,height:5,borderRadius:"50%",background:running||agenticRunning?"#10b981":"#374151",display:"inline-block",animation:running||agenticRunning?"pulse-bar 1s ease-in-out infinite":undefined,flexShrink:0}}/>
              <span style={{fontSize:7,fontFamily:"monospace",color:running||agenticRunning?"#10b981":"#374151",letterSpacing:"0.1em"}}>
                {running||agenticRunning?"AGENTS ACTIVE":"NEXT IN "+nextRefreshIn+"s"}
              </span>
            </div>
            {agentCycle>0&&(
              <div style={{fontSize:7,fontFamily:"monospace",color:"#374151",marginTop:1,letterSpacing:"0.06em"}}>CYCLE #{agentCycle}</div>
            )}
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

          {/* Live auto-cycle status bar */}
          <div style={{background:running||agenticRunning?"rgba(16,185,129,.07)":"rgba(6,10,20,.6)",border:`0.5px solid ${running||agenticRunning?"rgba(16,185,129,.3)":"#1f2937"}`,borderRadius:6,padding:"6px 12px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
            <div style={{display:"flex",alignItems:"center",gap:7}}>
              <span style={{width:7,height:7,borderRadius:"50%",background:running||agenticRunning?"#10b981":"#374151",display:"inline-block",flexShrink:0,animation:running||agenticRunning?"blink-live 0.8s ease-in-out infinite":undefined}}/>
              <span style={{fontSize:8,fontFamily:"monospace",color:running||agenticRunning?"#10b981":"#6b7280",letterSpacing:"0.12em"}}>
                {running?"● 5-AGENT BOARD RUNNING":agenticRunning?"● AGENTIC RUNNING":"○ STANDBY"}
              </span>
              {agentCycle>0&&<span style={{fontSize:7,fontFamily:"monospace",color:"#374151",letterSpacing:"0.08em"}}>· CYCLE #{agentCycle}</span>}
            </div>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:7,fontFamily:"monospace",color:"#374151",letterSpacing:"0.08em"}}>AUTO ↻ {nextRefreshIn}s</span>
              <span style={{fontSize:7,fontFamily:"monospace",color:"#10b981",letterSpacing:"0.08em"}}>60s</span>
            </div>
          </div>

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
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{width:6,height:6,borderRadius:"50%",background:"#10b981",display:"inline-block",animation:"blink-live 1.4s ease-in-out infinite"}}/>
              <span style={{fontSize:8,fontFamily:"monospace",letterSpacing:"0.14em",color:"#10b981"}}>LIVE INTEL FEED — {liveNews.length} ARTICLES</span>
              <span style={{fontSize:7,fontFamily:"monospace",color:"#374151",letterSpacing:"0.08em"}}>↻ {nextRefreshIn}s</span>
            </div>
            <button onClick={()=>{
              setNewsLoading(true);
              fetch("/api/conflict-news?q=conflict+war+airstrike+india+pakistan+ukraine+russia+gaza+missile+drone&timespan=7d")
                .then(r=>r.json()).then(d=>{ newsRef.current=d.articles||[]; setLiveNews(d.articles||[]); }).catch(()=>{}).finally(()=>setNewsLoading(false));
            }} style={{fontSize:8,fontFamily:"monospace",padding:"3px 8px",border:"0.5px solid rgba(16,185,129,.35)",borderRadius:4,background:"rgba(16,185,129,.07)",color:"#10b981",cursor:"pointer"}}>
              {newsLoading?"…":"↻ NOW"}
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

      {/* ── LOCAL INTELLIGENCE VIEW ── */}
      {activeView==='localintel'&&(
        <div className="sp-scroll" style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:10,padding:"12px 12px 16px"}}>

          {/* Search bar */}
          <div style={{background:"#0d1320",border:"0.5px solid #1f2937",borderRadius:8,overflow:"hidden"}}>
            <div style={{padding:"7px 12px",borderBottom:"0.5px solid #1f2937",background:"rgba(16,185,129,.04)",fontSize:8,fontFamily:"monospace",letterSpacing:"0.14em",color:"#6b7280"}}>
              🛰 LOCAL INTELLIGENCE — LOCATION SEARCH
            </div>
            <div style={{padding:"10px 12px",display:"flex",gap:8,alignItems:"center"}}>
              <input
                value={liInput}
                onChange={e=>setLiInput(e.target.value)}
                onKeyDown={e=>{if(e.key==='Enter'&&liInput.trim()){fetchLocalIntel(liInput.trim());fetchLiPrediction(liInput.trim());}}}
                placeholder="Enter location: Kashmir, Donetsk, Gaza, Manipur…"
                style={{flex:1,background:"#0a0f1a",border:"0.5px solid #374151",borderRadius:5,padding:"8px 10px",color:"#f9fafb",fontSize:12,fontFamily:"monospace",outline:"none",minWidth:0}}
              />
              <button
                onClick={()=>{if(liInput.trim()){fetchLocalIntel(liInput.trim());fetchLiPrediction(liInput.trim());}}}
                disabled={liLoading||!liInput.trim()}
                style={{padding:"8px 14px",background:"rgba(16,185,129,.12)",border:"0.5px solid rgba(16,185,129,.45)",borderRadius:5,color:"#10b981",fontSize:9,fontFamily:"monospace",fontWeight:700,cursor:"pointer",letterSpacing:"0.1em",flexShrink:0}}>
                {liLoading?"…":"SEARCH"}
              </button>
            </div>
            {/* Quick picks */}
            <div style={{padding:"0 12px 10px",display:"flex",flexWrap:"wrap",gap:5}}>
              {["Kashmir","Gaza Strip","Donetsk","Kharkiv","Rafah","Manipur","Khyber Pakhtunkhwa","Zaporizhzhia","Darfur"].map(loc=>(
                <button key={loc} onClick={()=>{setLiInput(loc);fetchLocalIntel(loc);fetchLiPrediction(loc);}}
                  style={{fontSize:8,padding:"3px 9px",border:"0.5px solid #374151",borderRadius:4,background:"#111827",color:"#9ca3af",cursor:"pointer",fontFamily:"monospace"}}>
                  {loc}
                </button>
              ))}
            </div>
          </div>

          {/* Error banner */}
          {liError&&(
            <div style={{background:"rgba(239,68,68,.08)",border:"0.5px solid rgba(239,68,68,.3)",borderRadius:6,padding:"8px 12px",fontSize:10,color:"#ef4444",fontFamily:"monospace"}}>
              ⚠ {liError}
            </div>
          )}

          {/* Location found — boundary info */}
          {liBoundary&&(
            <div style={{background:"#0d1320",border:"0.5px solid rgba(16,185,129,.2)",borderRadius:8,padding:"10px 12px"}}>
              <div style={{fontSize:8,color:"#6b7280",fontFamily:"monospace",letterSpacing:"0.12em",marginBottom:5}}>📍 LOCATION RESOLVED</div>
              <div style={{fontSize:12,color:"#10b981",fontFamily:"monospace",fontWeight:600,marginBottom:3}}>{liLocation.toUpperCase()}</div>
              <div style={{fontSize:9,color:"#9ca3af",lineHeight:1.6,marginBottom:4}}>{liBoundary.display_name}</div>
              <div style={{display:"flex",gap:12,fontSize:8,color:"#4b5563",fontFamily:"monospace"}}>
                <span>LAT {liBoundary.lat?.toFixed(4)}</span>
                <span>LNG {liBoundary.lng?.toFixed(4)}</span>
                <span>TYPE {(liBoundary.type||'').toUpperCase()}</span>
              </div>
              {liBoundary.geojson&&(
                <div style={{marginTop:6,fontSize:8,color:"#10b981",fontFamily:"monospace"}}>
                  ◉ BOUNDARY POLYGON OVERLAID ON MAP
                </div>
              )}
            </div>
          )}

          {/* AI Prediction card */}
          {(liPrediction||liPredLoading)&&(
            <div style={{background:"#0d1320",border:`0.5px solid ${liPredLoading?"#f59e0b33":liPrediction?.risk_level==="CRITICAL"?"rgba(239,68,68,.35)":liPrediction?.risk_level==="HIGH"?"rgba(245,158,11,.35)":"rgba(16,185,129,.25)"}`,borderRadius:8,overflow:"hidden",position:"relative"}}>
              {liPredLoading&&<div style={{position:"absolute",top:0,left:0,right:0,height:2,background:"#f59e0b",animation:"pulse-bar 1.5s ease-in-out infinite"}}/>}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 12px",borderBottom:"0.5px solid #1f2937",background:"rgba(16,185,129,.04)"}}>
                <div style={{fontSize:8,fontFamily:"monospace",letterSpacing:"0.14em",color:"#6b7280"}}>
                  ⬡ AI PREDICTION ENGINE {liPredLoading?"· UPDATING…":""}
                </div>
                {liPrediction&&(
                  <span style={{fontSize:8,color:"#4b5563",fontFamily:"monospace"}}>
                    {liPrediction.source==="llm"?"🤖 LLM":"📊 RULE"} · {liPrediction.articles_analyzed||0} ARTICLES
                  </span>
                )}
              </div>
              {liPrediction&&!liPredLoading&&(
                <div style={{padding:"10px 12px",display:"flex",flexDirection:"column",gap:8}}>
                  {/* Probability bar */}
                  <div>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                      <span style={{fontSize:10,color:"#9ca3af"}}>Activity Probability (next {liPrediction.timeframe_minutes}min)</span>
                      <span style={{fontSize:14,fontWeight:700,color:liPrediction.risk_level==="CRITICAL"?"#ef4444":liPrediction.risk_level==="HIGH"?"#f59e0b":liPrediction.risk_level==="MODERATE"?"#3b82f6":"#10b981",fontFamily:"monospace"}}>
                        {Math.round(liPrediction.activity_probability*100)}%
                      </span>
                    </div>
                    <div style={{height:6,background:"#1f2937",borderRadius:3,overflow:"hidden"}}>
                      <div style={{height:"100%",width:`${Math.round(liPrediction.activity_probability*100)}%`,background:liPrediction.risk_level==="CRITICAL"?"#ef4444":liPrediction.risk_level==="HIGH"?"#f59e0b":"#10b981",transition:"width .5s ease",borderRadius:3}}/>
                    </div>
                  </div>
                  {/* Risk + direction + confidence row */}
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    <span style={{fontSize:9,padding:"2px 8px",borderRadius:3,fontFamily:"monospace",fontWeight:600,
                      background:liPrediction.risk_level==="CRITICAL"?"rgba(239,68,68,.12)":liPrediction.risk_level==="HIGH"?"rgba(245,158,11,.12)":liPrediction.risk_level==="MODERATE"?"rgba(59,130,246,.12)":"rgba(16,185,129,.12)",
                      color:liPrediction.risk_level==="CRITICAL"?"#ef4444":liPrediction.risk_level==="HIGH"?"#f59e0b":liPrediction.risk_level==="MODERATE"?"#3b82f6":"#10b981",
                      border:`0.5px solid ${liPrediction.risk_level==="CRITICAL"?"rgba(239,68,68,.3)":liPrediction.risk_level==="HIGH"?"rgba(245,158,11,.3)":liPrediction.risk_level==="MODERATE"?"rgba(59,130,246,.3)":"rgba(16,185,129,.3)"}`}}>
                      {liPrediction.risk_level}
                    </span>
                    <span style={{fontSize:9,padding:"2px 8px",borderRadius:3,background:"rgba(59,130,246,.08)",color:"#60a5fa",border:"0.5px solid rgba(59,130,246,.25)",fontFamily:"monospace"}}>
                      ↗ {liPrediction.predicted_direction}
                    </span>
                    <span style={{fontSize:9,padding:"2px 8px",borderRadius:3,background:"#111827",color:"#6b7280",border:"0.5px solid #1f2937",fontFamily:"monospace"}}>
                      CONF {Math.round(liPrediction.confidence*100)}%
                    </span>
                  </div>
                  {/* Hotspot areas */}
                  {liPrediction.hotspot_areas?.length>0&&(
                    <div>
                      <div style={{fontSize:8,color:"#6b7280",fontFamily:"monospace",letterSpacing:"0.1em",marginBottom:4}}>PREDICTED HOTSPOT AREAS</div>
                      {liPrediction.hotspot_areas.map((h,i)=>(
                        <div key={i} style={{fontSize:10,color:"#d1d5db",padding:"3px 0",borderLeft:"2px solid #f59e0b",paddingLeft:8,marginBottom:3,lineHeight:1.4}}>{h}</div>
                      ))}
                    </div>
                  )}
                  {/* Reasoning */}
                  {liPrediction.reasoning&&(
                    <div style={{fontSize:10,color:"#9ca3af",lineHeight:1.6,borderTop:"0.5px solid #1f2937",paddingTop:8,fontStyle:"italic"}}>
                      {liPrediction.reasoning}
                    </div>
                  )}
                  {/* Movement types */}
                  {liPrediction.movement_types?.length>0&&(
                    <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                      {liPrediction.movement_types.map((m,i)=>(
                        <span key={i} style={{fontSize:8,padding:"2px 7px",borderRadius:3,background:"rgba(239,68,68,.08)",color:"#fca5a5",border:"0.5px solid rgba(239,68,68,.2)",fontFamily:"monospace"}}>
                          {m==="vehicle"?"🚛 VEHICLE":m==="troops"?"👥 TROOPS":m==="naval"?"⚓ NAVAL":m==="drone"?"🛸 DRONE":m==="construct"?"🏗 CONSTRUCTION":"⚡ ACTIVITY"}
                        </span>
                      ))}
                    </div>
                  )}
                  {/* Agent intelligence level */}
                  <div style={{borderTop:"0.5px solid #1f2937",paddingTop:8}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                      <span style={{fontSize:8,color:"#6b7280",fontFamily:"monospace",letterSpacing:"0.1em"}}>AGENT INTELLIGENCE LEVEL</span>
                      <span style={{fontSize:10,color:"#10b981",fontFamily:"monospace",fontWeight:700}}>LVL {liPrediction.intelligence_level||1}</span>
                    </div>
                    <div style={{height:4,background:"#1f2937",borderRadius:2,overflow:"hidden"}}>
                      <div style={{height:"100%",width:`${Math.min(100,liPrediction.intelligence_level||1)}%`,background:"linear-gradient(90deg,#10b981,#3b82f6)",borderRadius:2}}/>
                    </div>
                    <div style={{fontSize:8,color:"#374151",fontFamily:"monospace",marginTop:4}}>
                      AUTO-REFRESHES EVERY 2 MIN · {liPrediction.timestamp?new Date(liPrediction.timestamp).toLocaleTimeString("en-GB"):""}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── 7 Local Intelligence Agents ── */}
          {(liAgents.length>0||liAgentsLoading)&&(
            <div style={{background:"#0d1320",border:"0.5px solid #1f2937",borderRadius:8,overflow:"hidden"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 12px",borderBottom:"0.5px solid #1f2937",background:"rgba(16,185,129,.04)"}}>
                <span style={{fontSize:8,fontFamily:"monospace",letterSpacing:"0.14em",color:"#10b981"}}>
                  ⬡ 7-AGENT LOCAL INTELLIGENCE BOARD
                </span>
                <span style={{fontSize:8,color:"#4b5563",fontFamily:"monospace"}}>
                  {liAgentsLoading?"PROCESSING…":`${liAgents.length} AGENTS ACTIVE`}
                </span>
              </div>
              {/* Combined synthesis */}
              {liSynthesis&&(
                <div style={{padding:"9px 12px",borderBottom:"0.5px solid #1f2937",background:"rgba(16,185,129,.03)"}}>
                  <div style={{fontSize:8,color:"#6b7280",fontFamily:"monospace",letterSpacing:"0.1em",marginBottom:4}}>⬡ COMBINED SYNTHESIS</div>
                  <div style={{fontSize:10,color:"#d1d5db",lineHeight:1.6,fontStyle:"italic"}}>{liSynthesis}</div>
                </div>
              )}
              {/* Agent cards */}
              <div style={{padding:"8px 12px",display:"flex",flexDirection:"column",gap:6}}>
                {liAgentsLoading&&liAgents.length===0&&(
                  <div style={{textAlign:"center",padding:"16px 0",fontSize:10,color:"#4b5563",fontFamily:"monospace"}}>
                    <span style={{display:"inline-block",animation:"pulse-bar 1.5s ease-in-out infinite"}}>Running 7 agents in parallel…</span>
                  </div>
                )}
                {liAgents.map((agent,i)=>(
                  <div key={agent.id} style={{background:"#111827",border:`0.5px solid ${agent.status==="done"?`${agent.color}28`:"#1f2937"}`,borderRadius:6,padding:"8px 10px",position:"relative",overflow:"hidden"}}>
                    {agent.status==="done"&&<div style={{position:"absolute",top:0,left:0,height:2,width:"100%",background:agent.color,opacity:0.5}}/>}
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                      <div style={{display:"flex",gap:8,alignItems:"flex-start",minWidth:0}}>
                        <span style={{fontSize:14,flexShrink:0}}>{agent.icon}</span>
                        <div style={{minWidth:0}}>
                          <div style={{fontSize:11,fontWeight:600,color:"#f9fafb",fontFamily:"monospace",letterSpacing:"0.02em",marginBottom:2}}>{agent.label}</div>
                          <div style={{fontSize:9,color:"#6b7280",marginBottom:5}}>{agent.desc}</div>
                          <div style={{fontSize:10,color:"#9ca3af",lineHeight:1.5}}>{agent.brief}</div>
                        </div>
                      </div>
                      <div style={{flexShrink:0,textAlign:"right"}}>
                        <span style={{fontSize:8,padding:"2px 7px",borderRadius:3,fontFamily:"monospace",fontWeight:600,
                          background:agent.risk==="CRITICAL"?"rgba(239,68,68,.12)":agent.risk==="HIGH"?"rgba(245,158,11,.12)":agent.risk==="MODERATE"?"rgba(59,130,246,.12)":"rgba(16,185,129,.12)",
                          color:agent.risk==="CRITICAL"?"#ef4444":agent.risk==="HIGH"?"#f59e0b":agent.risk==="MODERATE"?"#3b82f6":"#10b981",
                          border:`0.5px solid ${agent.risk==="CRITICAL"?"rgba(239,68,68,.3)":agent.risk==="HIGH"?"rgba(245,158,11,.3)":agent.risk==="MODERATE"?"rgba(59,130,246,.3)":"rgba(16,185,129,.3)"}`}}>
                          {agent.risk||"LOW"}
                        </span>
                        {agent.articles?.length>0&&(
                          <div style={{fontSize:8,color:"#4b5563",fontFamily:"monospace",marginTop:3}}>{agent.articles.length} SRC</div>
                        )}
                      </div>
                    </div>
                    {/* Top article links */}
                    {agent.articles?.slice(0,2).map((a,j)=>(
                      <div key={j} onClick={()=>{setSignal(prev=>prev?prev+"\n\n"+a.title:a.title);setActiveView('agents');}}
                        style={{marginTop:5,fontSize:9,color:agent.color,cursor:"pointer",borderLeft:`2px solid ${agent.color}`,paddingLeft:6,lineHeight:1.4,opacity:.8}}
                        onMouseEnter={e=>e.currentTarget.style.opacity="1"}
                        onMouseLeave={e=>e.currentTarget.style.opacity="0.8"}>
                        {a.title?.slice(0,80)}{a.title?.length>80?"…":""}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Local news feed */}
          {liLocation&&(
            <div style={{background:"#0d1320",border:"0.5px solid #1f2937",borderRadius:8,overflow:"hidden"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 12px",borderBottom:"0.5px solid #1f2937",background:"rgba(16,185,129,.04)"}}>
                <span style={{fontSize:8,fontFamily:"monospace",letterSpacing:"0.14em",color:"#10b981"}}>
                  📡 LOCAL NEWS — {liArticles.length} ARTICLES — {liLocation.toUpperCase()}
                </span>
                <button
                  onClick={()=>fetchLocalIntel(liLocation)}
                  disabled={liLoading}
                  style={{fontSize:8,fontFamily:"monospace",padding:"3px 8px",border:"0.5px solid rgba(16,185,129,.35)",borderRadius:4,background:"rgba(16,185,129,.07)",color:"#10b981",cursor:"pointer"}}>
                  {liLoading?"…":"↻ REFRESH"}
                </button>
              </div>
              <div style={{padding:"8px 12px",display:"flex",flexDirection:"column",gap:5,maxHeight:340,overflowY:"auto"}}>
                {liLoading&&liArticles.length===0&&(
                  <div style={{textAlign:"center",padding:"20px 0",fontSize:10,color:"#4b5563",fontFamily:"monospace"}}>Fetching local intelligence…</div>
                )}
                {liArticles.slice(0,20).map((a,i)=>(
                  <div key={i}
                    onClick={()=>{setSignal(prev=>prev?prev+"\n\n"+a.title:a.title);setActiveView('agents');}}
                    style={{background:"rgba(255,255,255,.02)",border:"0.5px solid rgba(16,185,129,.1)",borderRadius:5,padding:"7px 9px",cursor:"pointer",transition:"border-color .15s"}}
                    onMouseEnter={e=>e.currentTarget.style.borderColor="rgba(16,185,129,.35)"}
                    onMouseLeave={e=>e.currentTarget.style.borderColor="rgba(16,185,129,.1)"}>
                    <div style={{display:"flex",gap:5,alignItems:"center",marginBottom:3}}>
                      <span style={{fontSize:8,fontFamily:"monospace",color:"#60a5fa",letterSpacing:"0.06em",fontWeight:600}}>{a.source||"NEWS"}</span>
                      <span style={{fontSize:8,color:"#4b5563",marginLeft:"auto",fontFamily:"monospace"}}>{a.date||""}</span>
                    </div>
                    <div style={{fontSize:11,color:"#d1d5db",lineHeight:1.5}}>{a.title}</div>
                    <div style={{marginTop:3,fontSize:8,color:"#374151",fontFamily:"monospace"}}>↗ inject into agent analysis</div>
                  </div>
                ))}
                {!liLoading&&liArticles.length===0&&liLocation&&(
                  <div style={{textAlign:"center",padding:"20px 0",fontSize:10,color:"#4b5563",fontFamily:"monospace"}}>
                    No local articles found. GDELT may not cover this location at this timespan.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Refresh intelligence button */}
          {liLocation&&(
            <button
              onClick={()=>{fetchLocalIntel(liLocation);fetchLiPrediction(liLocation);fetchLiAgents(liLocation);}}
              disabled={liLoading||liPredLoading||liAgentsLoading}
              style={{padding:"10px 16px",background:"rgba(16,185,129,.1)",border:"0.5px solid rgba(16,185,129,.4)",borderRadius:6,color:"#10b981",fontSize:10,fontFamily:"monospace",fontWeight:700,cursor:"pointer",letterSpacing:"0.1em",width:"100%",textAlign:"center"}}>
              {(liLoading||liPredLoading||liAgentsLoading)?"⬡ UPDATING INTELLIGENCE…":"⬡ REFRESH INTELLIGENCE + 7 AGENTS + PREDICT"}
            </button>
          )}

          {/* Empty state */}
          {!liLocation&&!liLoading&&(
            <div style={{textAlign:"center",padding:"40px 10px"}}>
              <div style={{fontSize:24,marginBottom:12,opacity:.4}}>🛰</div>
              <div style={{fontSize:11,color:"#4b5563",fontFamily:"monospace",marginBottom:6}}>No location selected</div>
              <div style={{fontSize:9,color:"#374151",fontFamily:"monospace",lineHeight:1.8}}>
                Search a location above to fetch:<br/>
                • Exact boundary polygon on the map<br/>
                • Live local news from GDELT<br/>
                • AI movement & threat prediction<br/>
                • Auto-evolving intelligence every 2 min
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── SAR SATELLITE VIEW ── */}
      {activeView==='sar'&&(
        <div className="sp-scroll" style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:10,padding:"12px 12px 16px"}}>

          {/* Header + status */}
          <div style={{background:"#0d1320",border:"0.5px solid rgba(16,185,129,.2)",borderRadius:8,padding:"10px 12px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <div>
                <div style={{fontSize:8,color:"#6b7280",fontFamily:"monospace",letterSpacing:"0.14em",marginBottom:2}}>🛸 SENTINEL-1 SAR SATELLITE DATA</div>
                <div style={{fontSize:11,color:"#f9fafb",fontFamily:"monospace"}}>Copernicus Data Space Ecosystem</div>
              </div>
              <span style={{fontSize:8,padding:"2px 8px",borderRadius:3,fontFamily:"monospace",
                background:sarStatus?.authenticated?"rgba(16,185,129,.12)":"rgba(107,114,128,.1)",
                color:sarStatus?.authenticated?"#10b981":"#6b7280",
                border:`0.5px solid ${sarStatus?.authenticated?"rgba(16,185,129,.3)":"rgba(107,114,128,.2)"}`}}>
                {sarStatus?.authenticated?"◉ CONNECTED":"○ CHECKING…"}
              </span>
            </div>
            {liBoundary&&(
              <div style={{fontSize:9,color:"#3b82f6",fontFamily:"monospace"}}>
                ↳ Auto-using Local Intel coords: {liBoundary.lat?.toFixed(4)}, {liBoundary.lng?.toFixed(4)}
              </div>
            )}
          </div>

          {/* Search form */}
          <div style={{background:"#0d1320",border:"0.5px solid #1f2937",borderRadius:8,overflow:"hidden"}}>
            <div style={{padding:"7px 12px",borderBottom:"0.5px solid #1f2937",background:"rgba(16,185,129,.04)",fontSize:8,fontFamily:"monospace",letterSpacing:"0.14em",color:"#6b7280"}}>
              AREA OF INTEREST
            </div>
            <div style={{padding:"10px 12px",display:"flex",flexDirection:"column",gap:8}}>
              <div style={{display:"flex",gap:6}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:8,color:"#4b5563",fontFamily:"monospace",marginBottom:3}}>LATITUDE</div>
                  <input value={sarLat} onChange={e=>setSarLat(e.target.value)} placeholder="34.4668"
                    style={{width:"100%",background:"#0a0f1a",border:"0.5px solid #374151",borderRadius:4,padding:"6px 8px",color:"#f9fafb",fontSize:11,fontFamily:"monospace",outline:"none",boxSizing:"border-box"}}/>
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:8,color:"#4b5563",fontFamily:"monospace",marginBottom:3}}>LONGITUDE</div>
                  <input value={sarLng} onChange={e=>setSarLng(e.target.value)} placeholder="31.5017"
                    style={{width:"100%",background:"#0a0f1a",border:"0.5px solid #374151",borderRadius:4,padding:"6px 8px",color:"#f9fafb",fontSize:11,fontFamily:"monospace",outline:"none",boxSizing:"border-box"}}/>
                </div>
                <div style={{width:64}}>
                  <div style={{fontSize:8,color:"#4b5563",fontFamily:"monospace",marginBottom:3}}>RADIUS km</div>
                  <input value={sarRadius} onChange={e=>setSarRadius(e.target.value)} placeholder="50"
                    style={{width:"100%",background:"#0a0f1a",border:"0.5px solid #374151",borderRadius:4,padding:"6px 8px",color:"#f9fafb",fontSize:11,fontFamily:"monospace",outline:"none",boxSizing:"border-box"}}/>
                </div>
              </div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                <div style={{flex:1,minWidth:90}}>
                  <div style={{fontSize:8,color:"#4b5563",fontFamily:"monospace",marginBottom:3}}>TIMESPAN</div>
                  <select value={sarTimespan} onChange={e=>setSarTimespan(e.target.value)}
                    style={{width:"100%",background:"#0a0f1a",border:"0.5px solid #374151",borderRadius:4,padding:"6px 8px",color:"#f9fafb",fontSize:10,fontFamily:"monospace",outline:"none"}}>
                    <option value="1d">Last 24h</option>
                    <option value="7d">Last 7 days</option>
                    <option value="30d">Last 30 days</option>
                    <option value="90d">Last 90 days</option>
                  </select>
                </div>
                <div style={{flex:1,minWidth:90}}>
                  <div style={{fontSize:8,color:"#4b5563",fontFamily:"monospace",marginBottom:3}}>PRODUCT TYPE</div>
                  <select value={sarCollection} onChange={e=>setSarCollection(e.target.value)}
                    style={{width:"100%",background:"#0a0f1a",border:"0.5px solid #374151",borderRadius:4,padding:"6px 8px",color:"#f9fafb",fontSize:10,fontFamily:"monospace",outline:"none"}}>
                    <option value="sentinel-1-grd">GRD (standard)</option>
                    <option value="sentinel-1-slc">SLC (coherence)</option>
                  </select>
                </div>
                <div style={{flex:1,minWidth:80}}>
                  <div style={{fontSize:8,color:"#4b5563",fontFamily:"monospace",marginBottom:3}}>POLARIZATION</div>
                  <select value={sarPolariz} onChange={e=>setSarPolariz(e.target.value)}
                    style={{width:"100%",background:"#0a0f1a",border:"0.5px solid #374151",borderRadius:4,padding:"6px 8px",color:"#f9fafb",fontSize:10,fontFamily:"monospace",outline:"none"}}>
                    <option value="ALL">All</option>
                    <option value="VV VH">VV+VH (dual)</option>
                    <option value="VV">VV only</option>
                    <option value="VH">VH only</option>
                  </select>
                </div>
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                {[
                  {name:"Gaza",    lat:"31.5017",lng:"34.4668"},
                  {name:"Donetsk", lat:"48.0159",lng:"37.8028"},
                  {name:"Kharkiv", lat:"49.9935",lng:"36.2304"},
                  {name:"Rafah",   lat:"31.2827",lng:"34.2654"},
                  {name:"Sanaa",   lat:"15.3694",lng:"44.1910"},
                  {name:"Khartoum",lat:"15.5007",lng:"32.5599"},
                ].map(p=>(
                  <button key={p.name} onClick={()=>{setSarLat(p.lat);setSarLng(p.lng);}}
                    style={{fontSize:8,padding:"3px 9px",border:"0.5px solid #374151",borderRadius:4,background:"#111827",color:"#9ca3af",cursor:"pointer",fontFamily:"monospace"}}>
                    {p.name}
                  </button>
                ))}
                {liBoundary&&(
                  <button onClick={()=>{setSarLat(liBoundary.lat.toFixed(5));setSarLng(liBoundary.lng.toFixed(5));}}
                    style={{fontSize:8,padding:"3px 9px",border:"0.5px solid rgba(16,185,129,.4)",borderRadius:4,background:"rgba(16,185,129,.08)",color:"#10b981",cursor:"pointer",fontFamily:"monospace"}}>
                    ↳ Use Local Intel
                  </button>
                )}
              </div>
              <button onClick={fetchSarScenes} disabled={sarLoading||!sarLat||!sarLng}
                style={{padding:"9px 14px",background:"rgba(16,185,129,.12)",border:"0.5px solid rgba(16,185,129,.45)",borderRadius:6,color:"#10b981",fontSize:10,fontFamily:"monospace",fontWeight:700,cursor:"pointer",letterSpacing:"0.1em"}}>
                {sarLoading?"⬡ SEARCHING SAR ARCHIVE…":"🛸 SEARCH SENTINEL-1 SCENES"}
              </button>
            </div>
          </div>

          {sarError&&(
            <div style={{background:"rgba(239,68,68,.08)",border:"0.5px solid rgba(239,68,68,.3)",borderRadius:6,padding:"8px 12px",fontSize:10,color:"#ef4444",fontFamily:"monospace"}}>
              ⚠ {sarError}
            </div>
          )}

          {/* ── InSAR / DEM Terrain Analysis ── */}
          <div style={{background:"#0d1320",border:"0.5px solid rgba(99,102,241,.3)",borderRadius:8,overflow:"hidden"}}>
            <div style={{padding:"7px 12px",borderBottom:"0.5px solid rgba(99,102,241,.18)",background:"rgba(99,102,241,.07)",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:6}}>
              <div>
                <div style={{fontSize:8,color:"#818cf8",fontFamily:"monospace",letterSpacing:"0.14em"}}>📡 InSAR / DEM TERRAIN ANALYSIS</div>
                <div style={{fontSize:7.5,color:"#4b5563",fontFamily:"monospace",marginTop:1}}>Digital Elevation · Change Detection · InSAR</div>
              </div>
              <div style={{display:"flex",gap:4}}>
                {[{id:'dem',label:'DEM'},{id:'change',label:'CHANGE'}].map(t=>(
                  <button key={t.id} onClick={()=>setInsarTab(t.id)}
                    style={{fontSize:7.5,padding:"3px 10px",border:`0.5px solid ${insarTab===t.id?"rgba(99,102,241,.7)":"rgba(99,102,241,.2)"}`,borderRadius:3,background:insarTab===t.id?"rgba(99,102,241,.18)":"transparent",color:insarTab===t.id?"#a5b4fc":"#4b5563",cursor:"pointer",fontFamily:"monospace",letterSpacing:"0.08em",fontWeight:insarTab===t.id?700:400}}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{padding:"10px 12px"}}>
              {insarTab==='dem'&&(
                <div>
                  {/* Elevation legend */}
                  <div style={{display:"flex",gap:3,marginBottom:8,alignItems:"center"}}>
                    {[
                      {c:"#0a1f80",l:"Sea"},
                      {c:"#478a3d",l:"Low"},
                      {c:"#b3c851",l:"Plain"},
                      {c:"#cc8530",l:"Hill"},
                      {c:"#ad6620",l:"High"},
                      {c:"#d9cead",l:"Alpine"},
                      {c:"#f5f5f5",l:"Snow"},
                    ].map(e=>(
                      <div key={e.l} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                        <div style={{width:14,height:8,borderRadius:2,background:e.c}}/>
                        <span style={{fontSize:6,color:"#4b5563",fontFamily:"monospace"}}>{e.l}</span>
                      </div>
                    ))}
                    <span style={{fontSize:7,color:"#374151",fontFamily:"monospace",marginLeft:4}}>Copernicus GLO-30 · 30m res</span>
                  </div>
                  <button onClick={fetchDem} disabled={insarLoading||!sarLat||!sarLng}
                    style={{width:"100%",padding:"9px 12px",background:"rgba(99,102,241,.12)",border:"0.5px solid rgba(99,102,241,.45)",borderRadius:6,color:"#a5b4fc",fontSize:10,fontFamily:"monospace",fontWeight:700,cursor:"pointer",letterSpacing:"0.1em",opacity:(!sarLat||!sarLng)?0.4:1}}>
                    {insarLoading?'⬡ GENERATING DEM…':'🏔 GENERATE ELEVATION MAP'}
                  </button>
                  {insarDemUrl&&!insarLoading&&(
                    <div style={{marginTop:8}}>
                      <img src={insarDemUrl} alt="DEM elevation" style={{width:"100%",borderRadius:6,border:"0.5px solid rgba(99,102,241,.35)",display:"block"}}/>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:5}}>
                        <span style={{fontSize:7.5,color:"#6b7280",fontFamily:"monospace"}}>
                          DEM GLO-30 · {parseFloat(sarLat).toFixed(3)}°N {parseFloat(sarLng).toFixed(3)}°E
                        </span>
                        <button onClick={()=>insarBbox&&onSarUpdate&&onSarUpdate({bbox:insarBbox,previewUrl:insarDemUrl,sceneName:'DEM-GLO30',footprint:null})}
                          style={{fontSize:7.5,padding:"2px 9px",border:"0.5px solid rgba(99,102,241,.5)",borderRadius:3,background:"rgba(99,102,241,.12)",color:"#a5b4fc",cursor:"pointer",fontFamily:"monospace",letterSpacing:"0.06em"}}>
                          ⬡ OVERLAY MAP
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {insarTab==='change'&&(
                <div>
                  {/* Change legend */}
                  <div style={{display:"flex",gap:3,marginBottom:8,alignItems:"center",flexWrap:"wrap"}}>
                    {[
                      {c:"#dc2626",l:"↑ Activity"},
                      {c:"#2563eb",l:"↓ Flood/Demo"},
                      {c:"#374151",l:"Stable"},
                    ].map(e=>(
                      <div key={e.l} style={{display:"flex",alignItems:"center",gap:3}}>
                        <div style={{width:10,height:10,borderRadius:2,background:e.c}}/>
                        <span style={{fontSize:7,color:"#6b7280",fontFamily:"monospace"}}>{e.l}</span>
                      </div>
                    ))}
                    <span style={{fontSize:6.5,color:"#374151",fontFamily:"monospace",marginLeft:4}}>SAR backscatter Δ · {sarTimespan} window</span>
                  </div>
                  <div style={{fontSize:7.5,color:"#4b5563",fontFamily:"monospace",marginBottom:8,lineHeight:1.7,background:"rgba(239,68,68,.04)",border:"0.5px solid rgba(239,68,68,.12)",borderRadius:4,padding:"5px 8px"}}>
                    InSAR-style change detection: compares earliest vs latest Sentinel-1 pass<br/>
                    Red = new rubble/construction/vehicle activity · Blue = demolition/flooding · Green = stable
                  </div>
                  <button onClick={fetchInsarChange} disabled={insarLoading||!sarLat||!sarLng}
                    style={{width:"100%",padding:"9px 12px",background:"rgba(239,68,68,.1)",border:"0.5px solid rgba(239,68,68,.4)",borderRadius:6,color:"#f87171",fontSize:10,fontFamily:"monospace",fontWeight:700,cursor:"pointer",letterSpacing:"0.1em",opacity:(!sarLat||!sarLng)?0.4:1}}>
                    {insarLoading?'⬡ COMPUTING CHANGE MAP…':'📡 GENERATE InSAR CHANGE MAP'}
                  </button>
                  {insarChgUrl&&!insarLoading&&(
                    <div style={{marginTop:8}}>
                      <img src={insarChgUrl} alt="SAR change detection" style={{width:"100%",borderRadius:6,border:"0.5px solid rgba(239,68,68,.3)",display:"block"}}/>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:5}}>
                        <span style={{fontSize:7.5,color:"#6b7280",fontFamily:"monospace"}}>
                          Change detection · {sarTimespan} · {parseFloat(sarLat).toFixed(3)}°N
                        </span>
                        <button onClick={()=>insarBbox&&onSarUpdate&&onSarUpdate({bbox:insarBbox,previewUrl:insarChgUrl,sceneName:'SAR-CHANGE',footprint:null})}
                          style={{fontSize:7.5,padding:"2px 9px",border:"0.5px solid rgba(239,68,68,.4)",borderRadius:3,background:"rgba(239,68,68,.1)",color:"#f87171",cursor:"pointer",fontFamily:"monospace",letterSpacing:"0.06em"}}>
                          ⬡ OVERLAY MAP
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {insarError&&(
                <div style={{marginTop:8,fontSize:9,color:"#ef4444",fontFamily:"monospace",background:"rgba(239,68,68,.06)",border:"0.5px solid rgba(239,68,68,.2)",borderRadius:4,padding:"6px 8px"}}>
                  ⚠ {insarError}
                </div>
              )}

              {!sarLat&&!sarLng&&(
                <div style={{marginTop:4,fontSize:8,color:"#374151",fontFamily:"monospace",textAlign:"center",padding:"4px 0"}}>
                  Enter coordinates above to enable terrain analysis
                </div>
              )}
            </div>
          </div>

          {sarScenes.length>0&&sarInfo&&(
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 4px"}}>
              <span style={{fontSize:8,color:"#10b981",fontFamily:"monospace",letterSpacing:"0.12em"}}>
                🛸 {sarScenes.length} SCENES · {sarInfo.datetime}
              </span>
              <span style={{fontSize:8,color:"#4b5563",fontFamily:"monospace"}}>{sarInfo.location}</span>
            </div>
          )}

          {/* SAR Scene-wise Analysis */}
          {sarScenes.length>0&&(
            <div style={{background:"#0d1320",border:"0.5px solid rgba(168,85,247,.25)",borderRadius:8,overflow:"hidden"}}>
              <div style={{padding:"7px 12px",borderBottom:"0.5px solid rgba(168,85,247,.15)",background:"rgba(168,85,247,.05)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{fontSize:8,fontFamily:"monospace",letterSpacing:"0.14em",color:"#a855f7"}}>⬡ SAR SCENE-WISE ANALYSIS</div>
                <button onClick={fetchSarAnalysis} disabled={sarAnalysisLoading}
                  style={{fontSize:8,padding:"3px 10px",background:sarAnalysisLoading?"rgba(168,85,247,.06)":"rgba(168,85,247,.14)",border:"0.5px solid rgba(168,85,247,.45)",borderRadius:4,color:"#a855f7",cursor:"pointer",fontFamily:"monospace",fontWeight:700,letterSpacing:"0.08em"}}>
                  {sarAnalysisLoading?"⬡ ANALYSING…":"⬡ ANALYSE SCENES"}
                </button>
              </div>

              {sarAnalysisError&&(
                <div style={{padding:"8px 12px",fontSize:9,color:"#ef4444",fontFamily:"monospace"}}>⚠ {sarAnalysisError}</div>
              )}

              {sarAnalysisLoading&&!sarAnalysis&&(
                <div style={{padding:"16px 12px",textAlign:"center"}}>
                  <div style={{fontSize:9,color:"#a855f7",fontFamily:"monospace",animation:"pulse-bar 1.5s ease-in-out infinite",marginBottom:4}}>Processing {sarScenes.length} SAR scenes…</div>
                  <div style={{fontSize:8,color:"#4b5563",fontFamily:"monospace"}}>Llama-3.3-70B · SAR Intelligence Engine</div>
                </div>
              )}

              {sarAnalysis&&!sarAnalysisLoading&&(
                <div style={{padding:"12px"}}>

                  {/* Activity + Temporal row */}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                    <div style={{background:"#111827",border:"0.5px solid #1f2937",borderRadius:6,padding:"8px 10px"}}>
                      <div style={{fontSize:7,color:"#a855f7",fontFamily:"monospace",letterSpacing:"0.12em",marginBottom:4}}>ACTIVITY ASSESSMENT</div>
                      <div style={{fontSize:9,color:"#e5e7eb",fontFamily:"monospace",lineHeight:1.6}}>{sarAnalysis.activity_assessment}</div>
                    </div>
                    <div style={{background:"#111827",border:"0.5px solid #1f2937",borderRadius:6,padding:"8px 10px"}}>
                      <div style={{fontSize:7,color:"#6366f1",fontFamily:"monospace",letterSpacing:"0.12em",marginBottom:4}}>TEMPORAL PATTERN</div>
                      <div style={{fontSize:9,color:"#e5e7eb",fontFamily:"monospace",lineHeight:1.6}}>{sarAnalysis.temporal_pattern}</div>
                    </div>
                  </div>

                  {/* Orbit + Polarization row */}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                    <div style={{background:"#111827",border:"0.5px solid #1f2937",borderRadius:6,padding:"8px 10px"}}>
                      <div style={{fontSize:7,color:"#3b82f6",fontFamily:"monospace",letterSpacing:"0.12em",marginBottom:4}}>ORBIT ANALYSIS</div>
                      <div style={{fontSize:9,color:"#e5e7eb",fontFamily:"monospace",lineHeight:1.6}}>{sarAnalysis.orbit_analysis}</div>
                    </div>
                    <div style={{background:"#111827",border:"0.5px solid #1f2937",borderRadius:6,padding:"8px 10px"}}>
                      <div style={{fontSize:7,color:"#10b981",fontFamily:"monospace",letterSpacing:"0.12em",marginBottom:4}}>POLARIZATION INSIGHT</div>
                      <div style={{fontSize:9,color:"#e5e7eb",fontFamily:"monospace",lineHeight:1.6}}>{sarAnalysis.polarization_insight}</div>
                    </div>
                  </div>

                  {/* Key Indicators */}
                  {sarAnalysis.key_indicators?.length>0&&(
                    <div style={{background:"#111827",border:"0.5px solid rgba(251,191,36,.2)",borderRadius:6,padding:"8px 10px",marginBottom:8}}>
                      <div style={{fontSize:7,color:"#f59e0b",fontFamily:"monospace",letterSpacing:"0.12em",marginBottom:6}}>KEY TACTICAL INDICATORS</div>
                      <div style={{display:"flex",flexDirection:"column",gap:3}}>
                        {sarAnalysis.key_indicators.map((ind,i)=>(
                          <div key={i} style={{display:"flex",gap:6,alignItems:"flex-start"}}>
                            <span style={{fontSize:7,color:"#f59e0b",fontFamily:"monospace",marginTop:1,flexShrink:0}}>▸</span>
                            <span style={{fontSize:9,color:"#e5e7eb",fontFamily:"monospace",lineHeight:1.5}}>{ind}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Change detection + Threat row */}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                    <div style={{background:"#111827",border:"0.5px solid rgba(239,68,68,.2)",borderRadius:6,padding:"8px 10px"}}>
                      <div style={{fontSize:7,color:"#ef4444",fontFamily:"monospace",letterSpacing:"0.12em",marginBottom:4}}>THREAT ASSESSMENT</div>
                      <div style={{fontSize:9,color:"#e5e7eb",fontFamily:"monospace",lineHeight:1.6}}>{sarAnalysis.threat_assessment}</div>
                    </div>
                    <div style={{background:"#111827",border:"0.5px solid #1f2937",borderRadius:6,padding:"8px 10px"}}>
                      <div style={{fontSize:7,color:"#6b7280",fontFamily:"monospace",letterSpacing:"0.12em",marginBottom:4}}>CHANGE DETECTION POTENTIAL</div>
                      <div style={{fontSize:9,color:"#e5e7eb",fontFamily:"monospace",lineHeight:1.6}}>{sarAnalysis.change_detection_potential}</div>
                    </div>
                  </div>

                  {/* Recommended followup */}
                  {sarAnalysis.recommended_followup&&(
                    <div style={{background:"rgba(16,185,129,.05)",border:"0.5px solid rgba(16,185,129,.2)",borderRadius:6,padding:"8px 10px"}}>
                      <div style={{fontSize:7,color:"#10b981",fontFamily:"monospace",letterSpacing:"0.12em",marginBottom:4}}>RECOMMENDED FOLLOWUP TASKING</div>
                      <div style={{fontSize:9,color:"#d1fae5",fontFamily:"monospace",lineHeight:1.6}}>{sarAnalysis.recommended_followup}</div>
                    </div>
                  )}

                </div>
              )}

              {!sarAnalysis&&!sarAnalysisLoading&&!sarAnalysisError&&(
                <div style={{padding:"10px 12px",fontSize:9,color:"#4b5563",fontFamily:"monospace",lineHeight:1.7}}>
                  AI-powered scene-wise analysis: orbit patterns · polarization signatures · temporal change detection · tactical threat assessment
                </div>
              )}
            </div>
          )}

          {sarScenes.map((scene,i)=>(
            <div key={scene.id} onClick={()=>loadSarPreview(scene)}
              style={{background:sarSelected?.id===scene.id?"#0d1320":"#111827",
                border:`0.5px solid ${sarSelected?.id===scene.id?"rgba(251,191,36,.5)":"#1f2937"}`,
                borderRadius:8,padding:"10px 12px",cursor:"pointer",transition:"border-color .15s",position:"relative",overflow:"hidden"}}>
              {sarSelected?.id===scene.id&&<div style={{position:"absolute",top:0,left:0,right:0,height:2,background:"#f59e0b"}}/>}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                <div style={{minWidth:0}}>
                  <div style={{fontSize:10,fontWeight:600,color:"#f9fafb",fontFamily:"monospace",marginBottom:3}}>
                    Scene #{i+1} · {scene.date_label||scene.date?.slice(0,16)}
                  </div>
                  <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:4}}>
                    <span style={{fontSize:8,padding:"1px 6px",borderRadius:3,background:"rgba(59,130,246,.12)",color:"#60a5fa",border:"0.5px solid rgba(59,130,246,.25)",fontFamily:"monospace"}}>{scene.orbit}</span>
                    <span style={{fontSize:8,padding:"1px 6px",borderRadius:3,background:"rgba(168,85,247,.12)",color:"#c084fc",border:"0.5px solid rgba(168,85,247,.25)",fontFamily:"monospace"}}>{scene.polarization}</span>
                    <span style={{fontSize:8,padding:"1px 6px",borderRadius:3,background:"rgba(16,185,129,.08)",color:"#10b981",border:"0.5px solid rgba(16,185,129,.2)",fontFamily:"monospace"}}>{scene.mode} · {scene.resolution}</span>
                  </div>
                  <div style={{fontSize:9,color:"#6b7280",fontFamily:"monospace"}}>{scene.platform} · Orbit #{scene.orbit_number}</div>
                </div>
                <span style={{fontSize:8,color:"#f59e0b",fontFamily:"monospace",flexShrink:0}}>
                  {sarSelected?.id===scene.id?"▼ SELECTED":"▶ VIEW"}
                </span>
              </div>

              {sarSelected?.id===scene.id&&(
                <div style={{marginTop:10,borderTop:"0.5px solid #1f2937",paddingTop:10}}>
                  <div style={{borderRadius:6,overflow:"hidden",background:"#0a0f1a",border:"0.5px solid #374151",marginBottom:8,minHeight:180,display:"flex",alignItems:"center",justifyContent:"center",position:"relative"}}>
                    {sarPreviewLoading&&(
                      <div style={{textAlign:"center"}}>
                        <div style={{fontSize:9,color:"#4b5563",fontFamily:"monospace",marginBottom:4,animation:"pulse-bar 1.5s ease-in-out infinite"}}>Loading SAR image…</div>
                        <div style={{fontSize:8,color:"#374151",fontFamily:"monospace"}}>Trying STAC thumbnail → Process API</div>
                      </div>
                    )}
                    {sarPreviewUrl&&!sarPreviewUrl.startsWith('error:')&&!sarPreviewLoading&&(
                      <img src={sarPreviewUrl} alt="SAR Preview" style={{width:"100%",display:"block",borderRadius:4}}/>
                    )}
                    {sarPreviewUrl?.startsWith('error:')&&!sarPreviewLoading&&(
                      <div style={{textAlign:"center",padding:"16px 12px"}}>
                        <div style={{fontSize:9,color:"#ef4444",fontFamily:"monospace",marginBottom:4}}>⚠ Image load failed</div>
                        <div style={{fontSize:8,color:"#6b7280",fontFamily:"monospace",lineHeight:1.6,wordBreak:"break-word"}}>{sarPreviewUrl.slice(6)}</div>
                      </div>
                    )}
                    {!sarPreviewUrl&&!sarPreviewLoading&&(
                      <div style={{textAlign:"center",padding:"20px 0"}}>
                        <div style={{fontSize:9,color:"#374151",fontFamily:"monospace"}}>No image returned.</div>
                        <div style={{fontSize:8,color:"#374151",fontFamily:"monospace",marginTop:3}}>Scene may have no data in this time window.</div>
                      </div>
                    )}
                    {sarPreviewUrl&&!sarPreviewUrl.startsWith('error:')&&(
                      <div style={{position:"absolute",bottom:6,right:6,fontSize:8,color:"rgba(16,185,129,.7)",fontFamily:"monospace",background:"rgba(0,0,0,.6)",padding:"2px 6px",borderRadius:3}}>
                        SAR · VV/VH
                      </div>
                    )}
                  </div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    <a href={scene.copernicus_url} target="_blank" rel="noopener noreferrer"
                      style={{fontSize:9,padding:"5px 10px",background:"rgba(59,130,246,.1)",border:"0.5px solid rgba(59,130,246,.35)",borderRadius:4,color:"#60a5fa",fontFamily:"monospace",textDecoration:"none"}}>
                      ↗ Copernicus Browser
                    </a>
                    <button onClick={e=>{e.stopPropagation();setSarSelected(null);if(onSarUpdate)onSarUpdate(null);}}
                      style={{fontSize:9,padding:"5px 10px",background:"rgba(107,114,128,.08)",border:"0.5px solid #374151",borderRadius:4,color:"#6b7280",fontFamily:"monospace",cursor:"pointer"}}>
                      ✕ Collapse
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {!sarLoading&&sarScenes.length===0&&!sarError&&(
            <div style={{textAlign:"center",padding:"40px 10px"}}>
              <div style={{fontSize:28,marginBottom:12,opacity:.35}}>🛸</div>
              <div style={{fontSize:11,color:"#4b5563",fontFamily:"monospace",marginBottom:6}}>No SAR scenes loaded</div>
              <div style={{fontSize:9,color:"#374151",fontFamily:"monospace",lineHeight:1.8}}>
                Enter coordinates → Search Sentinel-1 scenes<br/>
                Supports GRD / SLC · IW mode · VV+VH<br/>
                Scene footprint auto-overlaid on map<br/>
                SAR preview generated via Copernicus Process API
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
           DC LOCATOR PANEL
          ══════════════════════════════════════════════════════════ */}
      {activeView==='dcloc'&&(
        <div className="sp-scroll" style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:10,padding:"12px 12px 16px"}}>

          {/* Header */}
          <div style={{background:"#0d1320",border:"0.5px solid rgba(59,130,246,.2)",borderRadius:8,padding:"10px 12px"}}>
            <div style={{fontSize:8,color:"#6b7280",fontFamily:"monospace",letterSpacing:"0.14em",marginBottom:3}}>🏢 DATA CENTER LOCATOR — OSINT INFRASTRUCTURE MAPPING</div>
            <div style={{fontSize:11,color:"#f9fafb",fontFamily:"monospace",marginBottom:4}}>Discover physical DC locations for any organisation</div>
            <div style={{fontSize:9,color:"#4b5563",fontFamily:"monospace",lineHeight:1.7}}>
              Sources: BGPView · PeeringDB · RIPE Stat · ARIN RDAP · crt.sh · OpenStreetMap
            </div>
          </div>

          {/* Search box */}
          <div style={{background:"#0d1320",border:"0.5px solid rgba(59,130,246,.15)",borderRadius:8,padding:"10px 12px"}}>
            <div style={{fontSize:8,color:"#6b7280",fontFamily:"monospace",letterSpacing:"0.12em",marginBottom:6}}>SEARCH TARGET</div>
            <div style={{display:"flex",gap:6}}>
              <input
                value={dcQuery}
                onChange={e=>setDcQuery(e.target.value)}
                onKeyDown={e=>{if(e.key==='Enter'&&dcQuery.trim()){
                  setDcLoading(true);setDcError(null);setDcResults(null);
                  fetch(`/api/datacenter-locator?query=${encodeURIComponent(dcQuery.trim())}`)
                    .then(r=>r.json())
                    .then(d=>{setDcResults(d);setDcLoading(false);})
                    .catch(err=>{setDcError(err.message);setDcLoading(false);});
                }}}
                placeholder="Company, domain, or ASN — e.g. Google / amazon.com / AS15169"
                style={{flex:1,background:"#060b12",border:"0.5px solid rgba(59,130,246,.25)",borderRadius:4,
                  padding:"6px 10px",color:"#e5e7eb",fontFamily:"monospace",fontSize:11,outline:"none"}}
              />
              <button
                disabled={dcLoading||!dcQuery.trim()}
                onClick={()=>{
                  setDcLoading(true);setDcError(null);setDcResults(null);
                  fetch(`/api/datacenter-locator?query=${encodeURIComponent(dcQuery.trim())}`)
                    .then(r=>r.json())
                    .then(d=>{setDcResults(d);setDcLoading(false);})
                    .catch(err=>{setDcError(err.message);setDcLoading(false);});
                }}
                style={{padding:"6px 14px",background:dcLoading?"rgba(59,130,246,.1)":"rgba(59,130,246,.2)",
                  border:"0.5px solid rgba(59,130,246,.4)",borderRadius:4,color:"#93c5fd",
                  fontFamily:"monospace",fontSize:10,cursor:dcLoading?"wait":"pointer",whiteSpace:"nowrap"}}>
                {dcLoading?'SCANNING…':'LOCATE ▶'}
              </button>
            </div>
            <div style={{fontSize:8,color:"#374151",fontFamily:"monospace",marginTop:5,lineHeight:1.6}}>
              Examples: &nbsp;
              {['Google','microsoft.com','AS15169','US Department of Defense','Rostelecom'].map(ex=>(
                <span key={ex}
                  onClick={()=>setDcQuery(ex)}
                  style={{color:"#3b82f6",cursor:"pointer",marginRight:8,textDecoration:"underline",textDecorationStyle:"dotted"}}>
                  {ex}
                </span>
              ))}
            </div>
          </div>

          {/* Error */}
          {dcError&&(
            <div style={{background:"rgba(239,68,68,.08)",border:"0.5px solid rgba(239,68,68,.25)",borderRadius:6,padding:"8px 12px",fontSize:10,color:"#fca5a5",fontFamily:"monospace"}}>
              ⚠ {dcError}
            </div>
          )}

          {/* Loading spinner */}
          {dcLoading&&(
            <div style={{textAlign:"center",padding:"30px 10px"}}>
              <div style={{fontSize:22,marginBottom:8,opacity:.5}}>🏢</div>
              <div style={{fontSize:10,color:"#3b82f6",fontFamily:"monospace",animation:"blink 1s ease-in-out infinite"}}>
                SCANNING OSINT SOURCES…
              </div>
              <div style={{fontSize:8,color:"#374151",fontFamily:"monospace",marginTop:4}}>
                BGPView · PeeringDB · RIPE Stat · crt.sh · Overpass
              </div>
            </div>
          )}

          {/* Results */}
          {dcResults&&!dcLoading&&(
            <>
              {/* Summary bar */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
                {[
                  {n:dcResults.summary?.asn_count||0,      l:'ASNs',       c:'#3b82f6'},
                  {n:dcResults.summary?.location_count||0, l:'Locations',  c:'#10b981'},
                  {n:dcResults.summary?.prefix_count||0,   l:'IP Prefixes',c:'#f59e0b'},
                  {n:dcResults.summary?.subdomain_count||0,l:'Subdomains', c:'#a855f7'},
                ].map(s=>(
                  <div key={s.l} style={{background:"#0d1320",border:`0.5px solid ${s.c}33`,borderRadius:6,padding:"8px 10px",textAlign:"center"}}>
                    <div style={{fontSize:20,fontWeight:700,color:s.c,fontFamily:"monospace"}}>{s.n}</div>
                    <div style={{fontSize:8,color:"#6b7280",fontFamily:"monospace"}}>{s.l}</div>
                  </div>
                ))}
              </div>

              {/* Detail tab bar */}
              <div style={{display:"flex",gap:4}}>
                {[
                  {id:'locations', label:`📍 Locations (${(dcResults.locations||[]).length})`},
                  {id:'asns',      label:`⬡ ASNs (${(dcResults.asns||[]).length})`},
                  {id:'prefixes',  label:`🌐 Prefixes (${(dcResults.prefixes||[]).length})`},
                  {id:'subdomains',label:`🔍 Subdomains (${(dcResults.subdomains||[]).length})`},
                ].map(t=>(
                  <button key={t.id} onClick={()=>setDcDetailTab(t.id)}
                    style={{padding:"4px 10px",borderRadius:4,fontSize:9,fontFamily:"monospace",cursor:"pointer",
                      background:dcDetailTab===t.id?"rgba(59,130,246,.2)":"rgba(255,255,255,.03)",
                      color:dcDetailTab===t.id?"#93c5fd":"#4b5563",
                      border:`0.5px solid ${dcDetailTab===t.id?"rgba(59,130,246,.4)":"rgba(255,255,255,.07)"}`}}>
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Locations tab */}
              {dcDetailTab==='locations'&&(
                <div style={{display:"flex",flexDirection:"column",gap:4}}>
                  {(dcResults.locations||[]).length===0?(
                    <div style={{textAlign:"center",padding:"20px",fontSize:10,color:"#4b5563",fontFamily:"monospace"}}>
                      No physical locations found. Try adding a domain with --domain flag or check ASN coverage.
                    </div>
                  ):(dcResults.locations||[]).map((loc,i)=>{
                    const confColor = loc.confidence==='high'?'#10b981':loc.confidence==='medium'?'#f59e0b':'#6b7280';
                    const srcColor  = loc.source==='peeringdb'?'#3b82f6':loc.source==='osm'?'#a78bfa':'#f97316';
                    return (
                      <div key={i} style={{background:"#0b1119",border:"0.5px solid rgba(59,130,246,.12)",borderRadius:6,padding:"8px 10px"}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
                          <div style={{fontSize:11,color:"#e5e7eb",fontFamily:"monospace",fontWeight:600}}>{loc.name||'Unknown'}</div>
                          <div style={{display:"flex",gap:4}}>
                            <span style={{fontSize:8,padding:"1px 6px",borderRadius:3,background:`${confColor}18`,color:confColor,border:`0.5px solid ${confColor}44`,fontFamily:"monospace"}}>{(loc.confidence||'').toUpperCase()}</span>
                            <span style={{fontSize:8,padding:"1px 6px",borderRadius:3,background:`${srcColor}18`,color:srcColor,border:`0.5px solid ${srcColor}44`,fontFamily:"monospace"}}>{(loc.source||'').toUpperCase()}</span>
                          </div>
                        </div>
                        <div style={{fontSize:9,color:"#6b7280",fontFamily:"monospace",lineHeight:1.6}}>
                          {loc.city&&<span>{loc.city}{loc.country?`, ${loc.country}`:''} &nbsp;·&nbsp; </span>}
                          {loc.lat&&<span>📍 {Number(loc.lat).toFixed(4)}, {Number(loc.lng).toFixed(4)}</span>}
                          {loc.address&&<div style={{marginTop:2,color:"#4b5563"}}>{loc.address}</div>}
                          {loc.website&&<a href={loc.website} target="_blank" rel="noreferrer" style={{color:"#3b82f6",fontSize:8}}>{loc.website}</a>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ASNs tab */}
              {dcDetailTab==='asns'&&(
                <div style={{display:"flex",flexDirection:"column",gap:4}}>
                  {(dcResults.asns||[]).map((a,i)=>(
                    <div key={i} style={{background:"#0b1119",border:"0.5px solid rgba(59,130,246,.1)",borderRadius:6,padding:"8px 10px"}}>
                      <div style={{display:"flex",justifyContent:"space-between"}}>
                        <span style={{fontSize:11,color:"#60a5fa",fontFamily:"monospace",fontWeight:600}}>AS{a.asn}</span>
                        <span style={{fontSize:8,color:"#4b5563",fontFamily:"monospace"}}>{a.source}</span>
                      </div>
                      <div style={{fontSize:10,color:"#d1d5db",fontFamily:"monospace",marginTop:2}}>{a.name}</div>
                      {a.description&&<div style={{fontSize:9,color:"#6b7280",fontFamily:"monospace",marginTop:1}}>{a.description}</div>}
                      {a.country&&<div style={{fontSize:9,color:"#4b5563",fontFamily:"monospace"}}>Country: {a.country}</div>}
                    </div>
                  ))}
                </div>
              )}

              {/* Prefixes tab */}
              {dcDetailTab==='prefixes'&&(
                <div style={{display:"flex",flexDirection:"column",gap:3}}>
                  {(dcResults.prefixes||[]).map((p,i)=>(
                    <div key={i} style={{background:"#0b1119",border:"0.5px solid rgba(245,158,11,.08)",borderRadius:4,padding:"6px 10px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{fontSize:10,color:"#fbbf24",fontFamily:"monospace"}}>{p.prefix}</span>
                      <span style={{fontSize:8,color:"#6b7280",fontFamily:"monospace",maxWidth:"55%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.description||p.name}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Subdomains tab */}
              {dcDetailTab==='subdomains'&&(
                <div style={{display:"flex",flexDirection:"column",gap:3}}>
                  {(dcResults.subdomains||[]).map((s,i)=>(
                    <div key={i} style={{background:"#0b1119",border:"0.5px solid rgba(168,85,247,.08)",borderRadius:4,padding:"5px 10px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{fontSize:9,color:"#c084fc",fontFamily:"monospace"}}>{s.subdomain}</span>
                      <span style={{fontSize:8,color:"#4b5563",fontFamily:"monospace"}}>{s.not_before?.slice(0,10)}</span>
                    </div>
                  ))}
                  {(dcResults.subdomains||[]).length===0&&(
                    <div style={{textAlign:"center",padding:"20px",fontSize:10,color:"#4b5563",fontFamily:"monospace"}}>
                      No subdomains found — provide a domain name (e.g. google.com) to harvest CT logs.
                    </div>
                  )}
                </div>
              )}

              {/* Elapsed */}
              <div style={{fontSize:8,color:"#1f2937",fontFamily:"monospace",textAlign:"right"}}>
                Query completed in {dcResults.elapsed_ms}ms · {new Date().toISOString().slice(0,19)} UTC
              </div>
            </>
          )}

          {/* Empty state */}
          {!dcResults&&!dcLoading&&!dcError&&(
            <div style={{textAlign:"center",padding:"40px 10px"}}>
              <div style={{fontSize:28,marginBottom:12,opacity:.3}}>🏢</div>
              <div style={{fontSize:11,color:"#4b5563",fontFamily:"monospace",marginBottom:6}}>Data Center Locator</div>
              <div style={{fontSize:9,color:"#374151",fontFamily:"monospace",lineHeight:1.9}}>
                Enter a company name, domain, or ASN above<br/>
                Resolves ASNs → BGP prefixes → physical facilities<br/>
                PeeringDB colocations · OSM buildings · CT subdomains<br/>
                Offline mode: use <code style={{color:"#f59e0b"}}>datacenter_locator.py --help</code>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
