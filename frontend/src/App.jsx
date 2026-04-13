import React, { useState, useCallback, useEffect } from 'react';
import HeroBackground from './HeroBackground';
import SentinelPlatform from './SentinelPlatform';
import TacticalMap from './TacticalMap';
import './App.css';

function App() {
  const [predictedRoi,      setPredictedRoi]      = useState(null);
  const [agentIntel,        setAgentIntel]        = useState(null);
  const [discussion,        setDiscussion]        = useState([]);
  const [analysisRunning,   setAnalysisRunning]   = useState(false);
  const [panelOpen,         setPanelOpen]         = useState(true);
  const [localIntelOverlay, setLocalIntelOverlay] = useState(null); // {boundary, location}
  const [sarOverlay,        setSarOverlay]        = useState(null); // {bbox, geojson, sceneName}

  // lg+ (≥1024px): panel always open. Below 1024px: closed by default, user toggles.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    setPanelOpen(!mq.matches);
    const handler = (e) => { if (e.matches) setPanelOpen(false); else setPanelOpen(true); };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const onDiscussionUpdate  = useCallback((entries) => setDiscussion(entries), []);
  const onAnalysisRunning   = useCallback((running)  => setAnalysisRunning(running), []);
  const onLocalIntelUpdate  = useCallback((overlay)  => setLocalIntelOverlay(overlay), []);
  const onSarUpdate         = useCallback((overlay)  => setSarOverlay(overlay),        []);

  return (
    <div className="app-root">
      <HeroBackground />

      {/* Map — shrinks when panel is open on desktop */}
      <div className={`map-fullscreen${panelOpen ? ' panel-open' : ''}`}>
        <TacticalMap
          predictedRoi={predictedRoi}
          agentIntel={agentIntel}
          discussion={discussion}
          analysisRunning={analysisRunning}
          localIntelOverlay={localIntelOverlay}
          sarOverlay={sarOverlay}
        />
      </div>

      {/* Floating toggle button — visible on tablet + mobile only */}
      <button className="panel-toggle-btn" onClick={() => setPanelOpen(v => !v)}>
        {panelOpen ? '✕ CLOSE' : '⬡ INTEL PANEL'}
      </button>

      {/* Tap-outside backdrop on mobile */}
      {panelOpen && <div className="panel-backdrop" onClick={() => setPanelOpen(false)} />}

      {/* Intelligence Panel */}
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
          <SentinelPlatform
            setPredictedRoi={setPredictedRoi}
            setAgentIntel={setAgentIntel}
            onDiscussionUpdate={onDiscussionUpdate}
            onAnalysisRunning={onAnalysisRunning}
            onLocalIntelUpdate={onLocalIntelUpdate}
            onSarUpdate={onSarUpdate}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
