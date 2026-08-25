import { useState, useEffect, useMemo, useCallback } from 'react';
import { fetchCopilotUsage, calculatePercentage, getStoredToken, storeToken } from './services/copilot';
import { fetchClaudeUsage, getClaudeStatus, primaryWindow, formatResetsAt } from './services/claude';
import { startAuthFlow, completeAuthFlow, closeAuthServer } from './services/auth';
import { openUrl } from '@tauri-apps/plugin-opener';
import { USAGE_SOURCE_LABELS, type ClaudeStatus, type ClaudeUsage, type CopilotUsage } from './types';
import './App.css';
import { useTray } from './contexts/TrayContext';
import ProgressBar from './components/ProgressBar';

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

function App() {
  const { setText, updateMenu, source, setSource } = useTray();

  const [userCode, setUserCode] = useState<string>('');
  const [usage, setUsage] = useState<CopilotUsage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [hasToken, setHasToken] = useState(false);

  // Claude usage comes from the Claude Code login already on this machine, so there is
  // no sign-in flow here - only a status check and the usage fetch.
  const [claudeUsage, setClaudeUsage] = useState<ClaudeUsage | null>(null);
  const [claudeStatus, setClaudeStatus] = useState<ClaudeStatus | null>(null);
  const [claudeLoading, setClaudeLoading] = useState(false);
  const [claudeError, setClaudeError] = useState<string | null>(null);

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

  const loadClaudeUsage = useCallback(async () => {
    setClaudeLoading(true);
    setClaudeError(null);
    try {
      const data = await fetchClaudeUsage();
      setClaudeUsage(data);
    } catch (err) {
      setClaudeUsage(null);
      setClaudeError(err instanceof Error ? err.message : String(err));
    } finally {
      setClaudeLoading(false);
    }
  }, []);

  useEffect(() => {
    const storedToken = getStoredToken();
    if (storedToken) {
      setToken(storedToken);
      setHasToken(true);
      loadUsage(storedToken);
    }

    // Detect the Claude Code login, then pick a source that can actually show something.
    getClaudeStatus()
      .then((status) => {
        setClaudeStatus(status);
        if (status.available) {
          loadClaudeUsage();
          if (!storedToken) setSource('claude');
        } else {
          setSource('copilot');
        }
      })
      .catch(() => {
        setClaudeStatus({ available: false, subscription_type: null, expired: false, reason: null });
        setSource('copilot');
      });
  }, []);

  useEffect(() => {
    if (!hasToken || !token) return;

    const interval = setInterval(() => {
      loadUsage(token);
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [hasToken, token]);

  useEffect(() => {
    if (!claudeStatus?.available) return;

    const interval = setInterval(loadClaudeUsage, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [claudeStatus?.available, loadClaudeUsage]);

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
    if (source === 'claude') {
      loadClaudeUsage();
    } else if (token) {
      loadUsage(token);
    }
  };

  const startPollingForToken = async (
    deviceCode: string,
    intervalSeconds = 5,
    attempts = 0
  ) => {
    try {
      const authToken = await completeAuthFlow(deviceCode);
      setToken(authToken);
      storeToken(authToken);
      setHasToken(true);
      loadUsage(authToken);
      setAuthState(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isPending =
        message.includes('authorization_pending') ||
        message.includes('Authorization is still pending') ||
        message.includes('slow_down');

      if (!isPending) {
        setAuthError(message || 'Authentication failed');
        setAuthState(null);
        return;
      }

      if (attempts >= 30) { // Max 5 minutes (30 attempts at 10 seconds each)
        setAuthError('Authentication timed out after 5 minutes');
        setAuthState(null);
        return;
      }
      setTimeout(() => {
        startPollingForToken(deviceCode, intervalSeconds, attempts + 1);
      }, Math.max(5, intervalSeconds) * 1000);
    }
  };

  const handleStartAuth = async () => {
    setAuthLoading(true);
    setAuthError(null);
    console.log("Starting auth flow");
    try {
      const result = await startAuthFlow();
      console.log("Auth flow started", result);
      setAuthState({
        userCode: result.user_code,
        verificationUri: result.verification_uri,
        deviceCode: result.device_code,
        interval: result.interval,
      });

      // Open the verification URL in default browser
      await openUrl(result.verification_uri);
      setUserCode(result.user_code);

      console.log("Starting polling");
      startPollingForToken(result.device_code, result.interval);
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

  const claudePrimary = useMemo(() => primaryWindow(claudeUsage), [claudeUsage]);

  // The single number the menu bar shows for the selected source.
  const activePercentage = source === 'claude' ? claudePrimary?.percent ?? 0 : premiumPercentage;
  const hasActiveData = source === 'claude' ? claudeUsage !== null : usage !== null;

  useEffect(() => {
    // Create an ascii progress bar like: ▰▰▱▱▱ 45% (respect showBar/showPercent)
    // Inverse experience: start with all full blocks, then empty as usage increases.
    const totalBlocks = 5;
    const pct = Math.max(0, Math.min(100, activePercentage));
    const filledBlocks = Math.round(((100 - pct) / 100) * totalBlocks);
    const emptyBlocks = totalBlocks - filledBlocks;
    const progressBar = '▰'.repeat(filledBlocks) + '▱'.repeat(emptyBlocks);
    const percentText = `${activePercentage}%`;
    let text = '';
    if (showBar) text += progressBar;
    if (showBar && showPercent) text += ' ';
    if (showPercent) text += percentText;
    setText(hasActiveData ? ` ${text}` : ' —');
  }, [activePercentage, hasActiveData, setText, showBar, showPercent]);

  useEffect(() => {
    localStorage.setItem('showBar', showBar ? '1' : '0');
  }, [showBar]);

  useEffect(() => {
    localStorage.setItem('showPercent', showPercent ? '1' : '0');
  }, [showPercent]);

  useEffect(() => {
    updateMenu({
      copilot: usage
        ? {
            premiumUsed: usage.premium_requests_used,
            premiumLimit: usage.premium_requests_limit,
            premiumRemaining: usage.premium_requests_limit - usage.premium_requests_used,
          }
        : null,
      claude: claudeUsage
        ? {
            windows: claudeUsage.windows.map((window) => ({
              label: window.label,
              percent: window.percent,
              resetsAt: formatResetsAt(window.resets_at),
            })),
          }
        : null,
      claudeAvailable: claudeStatus?.available ?? false,
    });
  }, [usage, claudeUsage, claudeStatus?.available, updateMenu]);

  const sourcePicker = (
    <div className="source-picker">
      {(Object.keys(USAGE_SOURCE_LABELS) as Array<keyof typeof USAGE_SOURCE_LABELS>).map((option) => (
        <button
          key={option}
          className={`source-tab ${source === option ? 'active' : ''}`}
          onClick={() => setSource(option)}
          disabled={option === 'claude' && !claudeStatus?.available}
        >
          {USAGE_SOURCE_LABELS[option]}
        </button>
      ))}
    </div>
  );

  const displayOptions = (
    <div className="display-options">
      <label><input type="checkbox" checked={showBar} onChange={(e) => setShowBar(e.target.checked)} /> Show bar</label>
      <label style={{ marginLeft: 12 }}><input type="checkbox" checked={showPercent} onChange={(e) => setShowPercent(e.target.checked)} /> Show percent</label>
    </div>
  );

  if (source === 'claude') {
    return (
      <div className="container">
        <h1>Claude Usage</h1>
        {sourcePicker}

        {claudeStatus && !claudeStatus.available && (
          <div className="token-setup">
            <p>
              No Claude Code login was found on this Mac. Sign in with the Claude Code CLI
              (<code>claude</code> in a terminal, then <code>/login</code>) and refresh.
            </p>
            {claudeStatus?.reason && <div className="error">{claudeStatus.reason}</div>}
          </div>
        )}

        {claudeStatus?.available && claudeStatus.expired && !claudeError && (
          <div className="status">
            The stored Claude login has expired. Run the Claude Code CLI once to refresh it.
          </div>
        )}

        {claudeLoading && <div className="status">Loading...</div>}
        {claudeError && <div className="error">{claudeError}</div>}

        {claudeUsage && (
          <>
            <div className="usage-section">
              {claudeUsage.windows.map((window) => (
                <ProgressBar
                  key={window.key}
                  label={window.label}
                  percent={window.percent}
                  className="claude-window"
                  variant="claude"
                />
              ))}
            </div>

            {displayOptions}

            <div className="billing-info">
              {claudePrimary?.resets_at && (
                <p>{claudePrimary.label} resets: {formatResetsAt(claudePrimary.resets_at)}</p>
              )}
            </div>
          </>
        )}

        <div className="actions">
          <button onClick={handleRefresh} disabled={claudeLoading} className="btn-primary">
            Refresh
          </button>
        </div>
      </div>
    );
  }

  if (!hasToken) {
    return (
      <div className="container">
        <h1>GitHub Copilot Usage</h1>
        {sourcePicker}
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

          {
            userCode && !authState && (
              <div className="auth-code-section">
                <p>If you haven't authorized yet, go to <a href="https://github.com/login/device" target="_blank" rel="noopener noreferrer">https://github.com/login/device</a> and enter the code:</p>
                <div className="user-code">{userCode}</div>
              </div>
            )
          }

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
          <button onClick={() => setToken('')} className="btn-secondary">
            Clear
          </button>
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
      {sourcePicker}

      {loading && <div className="status">Loading...</div>}
      {error && <div className="error">{error}</div>}

      {usage && (
        <>
          <div className="usage-section">
            <ProgressBar label="Premium Requests" percent={premiumPercentage} used={usage.premium_requests_used} limit={usage.premium_requests_limit} />
          </div>

          {displayOptions}

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
