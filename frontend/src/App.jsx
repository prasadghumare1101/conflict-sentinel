import React, { useState, useCallback } from 'react';
import HeroBackground from './HeroBackground';
import SentinelPlatform from './SentinelPlatform';
import TacticalMap from './TacticalMap';
import './App.css';

function App() {
  const [predictedRoi,    setPredictedRoi]    = useState(null);
  const [agentIntel,      setAgentIntel]      = useState(null);
  const [discussion,      setDiscussion]      = useState([]);
  const [analysisRunning, setAnalysisRunning] = useState(false);

  // Called by SentinelPlatform whenever a new discussion entry is added
  const onDiscussionUpdate = useCallback((entries) => {
    setDiscussion(entries);
  }, []);

  const onAnalysisRunning = useCallback((running) => {
    setAnalysisRunning(running);
  }, []);

  return (
    <div className="app-root">
      <HeroBackground />

      {/* Full-screen tactical map with discussion overlay */}
      <div className="map-fullscreen" style={{ right: 390 }}>
        <TacticalMap
          predictedRoi={predictedRoi}
          agentIntel={agentIntel}
          discussion={discussion}
          analysisRunning={analysisRunning}
        />
      </div>

      {/* Right-side Intelligence Platform — always visible */}
      <div className="intel-panel">
        <div className="intel-panel__header">
          <span className="intel-panel__badge">⬡</span>
          <span className="intel-panel__title">INTELLIGENCE PLATFORM</span>
          <span className="intel-panel__agents" data-active={!!agentIntel}>
            {analysisRunning ? '⬡ ANALYSING…' : agentIntel ? '● ACTIVE' : '○ IDLE'}
          </span>
        </div>
        <div className="intel-panel__body">
          <SentinelPlatform
            setPredictedRoi={setPredictedRoi}
            setAgentIntel={setAgentIntel}
            onDiscussionUpdate={onDiscussionUpdate}
            onAnalysisRunning={onAnalysisRunning}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
