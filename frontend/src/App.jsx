import React, { useState, useCallback, useEffect, lazy, Suspense } from 'react';
import ErrorBoundary from './ErrorBoundary';
import './App.css';

// Lazy-load heavy components. HeroBackground removed — was 880KB three.js/drei
// chunk causing TDZ crash just for a decorative planet. Replaced with CSS gradient.
const TacticalMap     = lazy(() => import('./TacticalMap'));
const SentinelPlatform = lazy(() => import('./SentinelPlatform'));

function App() {
  const [predictedRoi,      setPredictedRoi]      = useState(null);
  const [agentIntel,        setAgentIntel]        = useState(null);
  const [discussion,        setDiscussion]        = useState([]);
  const [analysisRunning,   setAnalysisRunning]   = useState(false);
  const [panelOpen,         setPanelOpen]         = useState(true);
  const [localIntelOverlay, setLocalIntelOverlay] = useState(null);
  const [sarOverlay,        setSarOverlay]        = useState(null);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    setPanelOpen(!mq.matches);
    const handler = (e) => { if (e.matches) setPanelOpen(false); else setPanelOpen(true); };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const onDiscussionUpdate = useCallback((entries) => setDiscussion(entries), []);
  const onAnalysisRunning  = useCallback((running)  => setAnalysisRunning(running), []);
  const onLocalIntelUpdate = useCallback((overlay)  => setLocalIntelOverlay(overlay), []);
  const onSarUpdate        = useCallback((overlay)  => setSarOverlay(overlay), []);

  return (
    <div className="app-root">
      <div className={`map-fullscreen${panelOpen ? ' panel-open' : ''}`}>
        <ErrorBoundary>
          <Suspense fallback={<div style={{ width:'100%', height:'100%', background:'#030712' }} />}>
            <TacticalMap
              predictedRoi={predictedRoi}
              agentIntel={agentIntel}
              discussion={discussion}
              analysisRunning={analysisRunning}
              localIntelOverlay={localIntelOverlay}
              sarOverlay={sarOverlay}
            />
          </Suspense>
        </ErrorBoundary>
      </div>

      <button className="panel-toggle-btn" onClick={() => setPanelOpen(v => !v)}>
        {panelOpen ? '✕ CLOSE' : '⬡ INTEL PANEL'}
      </button>

      {panelOpen && <div className="panel-backdrop" onClick={() => setPanelOpen(false)} />}

      <div className={`intel-panel${panelOpen ? ' intel-panel--open' : ''}`}>
        <div className="intel-panel__header">
          <span className="intel-panel__badge">⬡</span>
          <span className="intel-panel__title">INTELLIGENCE PLATFORM</span>
          <span className="intel-panel__agents" data-active={!!agentIntel}>
            {analysisRunning ? '⬡ ANALYSING…' : agentIntel ? '● ACTIVE' : '○ IDLE'}
          </span>
          <button className="intel-panel__close" onClick={() => setPanelOpen(false)}>✕</button>
        </div>
        <div className="intel-panel__body">
          <ErrorBoundary>
            <Suspense fallback={<div style={{ padding:20, color:'#10b981', fontFamily:'monospace', fontSize:11 }}>⬡ LOADING…</div>}>
              <SentinelPlatform
                setPredictedRoi={setPredictedRoi}
                setAgentIntel={setAgentIntel}
                onDiscussionUpdate={onDiscussionUpdate}
                onAnalysisRunning={onAnalysisRunning}
                onLocalIntelUpdate={onLocalIntelUpdate}
                onSarUpdate={onSarUpdate}
              />
            </Suspense>
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}

export default App;
