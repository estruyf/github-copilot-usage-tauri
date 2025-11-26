import { useState, useEffect, useMemo } from 'react';
import { fetchCopilotUsage, calculatePercentage, getStoredToken, storeToken } from './services/copilot';
import { startAuthFlow, completeAuthFlow, closeAuthServer } from './services/auth';
import type { CopilotUsage } from './types';
import './App.css';
import { useTray } from './contexts/TrayContext';
import ProgressBar from './components/ProgressBar';

function App() {
  const [usage, setUsage] = useState<CopilotUsage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [hasToken, setHasToken] = useState(false);
  const { setText } = useTray();
  const [showBar, setShowBar] = useState<boolean>(() => {
    const v = localStorage.getItem('showBar');
    return v === null ? true : v === '1';
  });
  const [showPercent, setShowPercent] = useState<boolean>(() => {
    const v = localStorage.getItem('showPercent');
    return v === null ? true : v === '1';
  });

  // Auth flow state
  const [authState, setAuthState] = useState<{
    userCode: string;
    verificationUri: string;
    deviceCode: string;
    interval: number;
  } | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const storedToken = getStoredToken();
    if (storedToken) {
      setToken(storedToken);
      setHasToken(true);
      loadUsage(storedToken);
    }
  }, []);

  useEffect(() => {
    if (!hasToken || !token) return;

    const interval = setInterval(() => {
      loadUsage(token);
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [hasToken, token]);

  const loadUsage = async (authToken: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCopilotUsage(authToken);
      setUsage(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch usage data');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveToken = async () => {
    if (token.trim()) {
      storeToken(token);
      setHasToken(true);
      loadUsage(token);
      // Close the auth server if it's running
      try {
        await closeAuthServer();
      } catch {
        // Ignore errors - server might not be running
      }
      setAuthState(null);
    }
  };

  const handleRefresh = () => {
    if (token) {
      loadUsage(token);
    }
  };

  const handleStartAuth = async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const result = await startAuthFlow();
      setAuthState({
        userCode: result.user_code,
        verificationUri: result.verification_uri,
        deviceCode: result.device_code,
        interval: result.interval,
      });
      
      // Open the verification URL in default browser
      window.open(result.verification_uri, '_blank');
      
      // Start polling for the token in the background
      completeAuthFlow(result.device_code, result.interval)
        .then((serverUrl) => {
          // Open the token server page
          window.open(serverUrl, '_blank');
          setAuthState(null);
        })
        .catch((err) => {
          setAuthError(err instanceof Error ? err.message : String(err));
          setAuthState(null);
        });
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Failed to start authentication');
    } finally {
      setAuthLoading(false);
    }
  };

  const premiumPercentage = useMemo(() => {
    const value = usage ? calculatePercentage(usage.premium_requests_used, usage.premium_requests_limit) : 0;
    return value;
  }, [usage?.premium_requests_used, usage?.premium_requests_limit]);

  useEffect(() => {
    // Create an ascii progress bar like: ▰▰▱▱▱ 45% (respect showBar/showPercent)
    const totalBlocks = 5;
    const filledBlocks = Math.round((premiumPercentage / 100) * totalBlocks);
    const emptyBlocks = totalBlocks - filledBlocks;
    const progressBar = '▰'.repeat(filledBlocks) + '▱'.repeat(emptyBlocks);
    const percentText = `${premiumPercentage}%`;
    let text = '';
    if (showBar) text += progressBar;
    if (showBar && showPercent) text += ' ';
    if (showPercent) text += percentText;
    setText(` ${text}`);
  }, [premiumPercentage, setText, showBar, showPercent]);

  useEffect(() => {
    localStorage.setItem('showBar', showBar ? '1' : '0');
  }, [showBar]);

  useEffect(() => {
    localStorage.setItem('showPercent', showPercent ? '1' : '0');
  }, [showPercent]);

  if (!hasToken) {
    return (
      <div className="container">
        <h1>GitHub Copilot Usage</h1>
        <div className="token-setup">
          <p>Enter your GitHub Personal Access Token or use the GitHub login</p>
          
          <button 
            onClick={handleStartAuth} 
            disabled={authLoading || authState !== null}
            className="btn-github"
          >
            {authLoading ? 'Starting...' : '🔑 Login with GitHub'}
          </button>
          
          {authState && (
            <div className="auth-code-section">
              <p>Enter this code at <a href={authState.verificationUri} target="_blank" rel="noopener noreferrer">{authState.verificationUri}</a>:</p>
              <div className="user-code">{authState.userCode}</div>
              <p className="auth-status">Waiting for authorization...</p>
            </div>
          )}
          
          {authError && <div className="error">{authError}</div>}
          
          <div className="divider">
            <span>or enter token manually</span>
          </div>
          
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="ghp_..."
            className="token-input"
          />
          <button onClick={handleSaveToken} className="btn-primary">
            Save Token
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <h1>GitHub Copilot Usage</h1>

      {loading && <div className="status">Loading...</div>}
      {error && <div className="error">{error}</div>}

      {usage && (
        <>
          <div className="usage-section">
            <ProgressBar label="Premium Requests" percent={premiumPercentage} used={usage.premium_requests_used} limit={usage.premium_requests_limit} />
          </div>

          <div className="display-options">
            <label><input type="checkbox" checked={showBar} onChange={(e) => setShowBar(e.target.checked)} /> Show bar</label>
            <label style={{ marginLeft: 12 }}><input type="checkbox" checked={showPercent} onChange={(e) => setShowPercent(e.target.checked)} /> Show percent</label>
          </div>

          <div className="billing-info">
            <p>Billing: {new Date(usage.billing_cycle_end).toLocaleDateString()}</p>
          </div>
        </>
      )}

      <div className="actions">
        <button onClick={handleRefresh} disabled={loading} className="btn-primary">
          Refresh
        </button>
        <button onClick={() => { localStorage.removeItem('github_token'); setHasToken(false); setUsage(null); }} className="btn-secondary">
          Change Token
        </button>
      </div>
    </div>
  );
}

export default App;
