import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          position: 'fixed', inset: 0, background: '#030712',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'monospace', color: '#ef4444', padding: 24, zIndex: 9999
        }}>
          <div style={{ maxWidth: 600, textAlign: 'center' }}>
            <div style={{ fontSize: 13, marginBottom: 8, color: '#f59e0b' }}>⬡ SENTINEL — RENDER ERROR</div>
            <div style={{ fontSize: 11, color: '#ef4444', marginBottom: 12 }}>{this.state.error.message}</div>
            <button onClick={() => window.location.reload()}
              style={{ fontSize: 10, padding: '6px 16px', background: 'rgba(16,185,129,.12)',
                border: '0.5px solid rgba(16,185,129,.4)', borderRadius: 4, color: '#10b981', cursor: 'pointer' }}>
              RELOAD
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
