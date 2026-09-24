// ── src/components/APITab.jsx ────────────────────────────────────────────────
// Broker API connection hub. Phase 1 of the API integration roadmap.
// Branch: feature/api-integration
//
// States:
//   - No broker connected → broker grid with Connect CTAs
//   - Setup in progress   → step-by-step credential entry + OAuth flow
//   - Connected           → status banner, account switcher, live indicators
//
// Supports: Charles Schwab (Phase 1), E*TRADE / Tastytrade / IBKR (Phase 2+)
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback } from "react";
import { useTheme } from "../contexts/ThemeContext";
import { useBrokerConnection } from "../hooks/useBrokerConnection";
import { schwabInitiateOAuth, schwabExchangeToken } from "../services/schwabApi";

// ── Local shared components ───────────────────────────────────────────────────

const Card = ({ children, style }) => {
  const { T } = useTheme();
  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r,
      padding: "20px 24px", marginBottom: 16, ...style,
    }}>
      {children}
    </div>
  );
};

const Badge = ({ children, color }) => {
  const { T } = useTheme();
  return (
    <span style={{
      padding: "3px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700,
      fontFamily: T.fontMono, letterSpacing: 0.5, background: color + "18", color,
    }}>
      {children}
    </span>
  );
};

const StatusDot = ({ status }) => {
  const { T } = useTheme();
  const colors = {
    connected: T.success,
    pending:   T.warn,
    expired:   T.danger,
    offline:   T.textMuted,
  };
  const color = colors[status] || colors.offline;
  return (
    <span style={{
      display: "inline-block", width: 8, height: 8, borderRadius: "50%",
      background: color, marginRight: 6, flexShrink: 0,
      boxShadow: status === "connected" ? `0 0 6px ${color}88` : "none",
    }} />
  );
};

// ── PIICallout ────────────────────────────────────────────────────────────────
// Renders a broker-specific security callout inside the setup flow and
// coming-soon broker cards. Reads from broker.piiNote — safe to skip if absent.

function PIICallout({ broker }) {
  const note = broker.piiNote;
  if (!note) return null;

  const variants = {
    safe:    { bg: "#0d2018", border: "#1a4530", text: "#86efac", icon: "🛡" },
    warning: { bg: "#251a06", border: "#3d2a0a", text: "#fcd34d", icon: "⚠" },
    caution: { bg: "#270d0d", border: "#3d1515", text: "#fca5a5", icon: "⚠" },
    info:    { bg: "#0d1a2e", border: "#1a2e4a", text: "#93c5fd", icon: "ℹ" },
  };
  const v = variants[note.level] || variants.info;

  return (
    <div style={{
      background: v.bg,
      border: `1px solid ${v.border}`,
      borderRadius: 10,
      padding: "14px 16px",
      marginBottom: 16,
      display: "flex",
      gap: 10,
      alignItems: "flex-start",
    }}>
      <span style={{ fontSize: 15, flexShrink: 0, marginTop: 1 }}>{v.icon}</span>
      <div>
        <div style={{ fontWeight: 700, fontSize: 12, color: v.text, marginBottom: 5, letterSpacing: 0.3 }}>
          {note.title}
        </div>
        <div style={{ fontSize: 12.5, color: v.text, opacity: 0.85, lineHeight: 1.6, marginBottom: note.items ? 8 : 0 }}>
          {note.body}
        </div>
        {note.items && (
          <ul style={{ paddingLeft: 14, margin: 0 }}>
            {note.items.map((item, i) => (
              <li key={i} style={{ fontSize: 12, color: v.text, opacity: 0.75, marginBottom: 3, lineHeight: 1.5 }}>
                {item}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── Broker definitions ────────────────────────────────────────────────────────

const BROKERS = [
  {
    id: "schwab",
    name: "Charles Schwab",
    sub: "ThinkOrSwim · developer.schwab.com",
    color: "#00a3e0",
    phase: "Phase 1",
    phaseLabel: "Available now",
    available: true,
    requiresAppKey: true,

    piiNote: {
      level: "safe",
      title: "Callback URL & PII — what Schwab sees",
      body: "The callback URL shown above contains no personal data. Schwab appends a one-time auth code (?code=…) that expires in ~30 seconds. Our server validates and discards it immediately — it is never logged or stored.",
      items: [
        "✓  HTTPS required for production — localhost is fine for local dev only",
        "✓  No PII in the URL path — copy-paste the callback exactly as shown, don't modify it",
        "✓  App Type: Individual Use — limits the OAuth scope to your account only",
        "✓  We store: App Key, App Secret, access token, refresh token — all encrypted in Firestore",
        "✗  We never store: your Schwab password, full account numbers, or SSN",
      ],
    },

    steps: [
      {
        title: "Create a Schwab Developer account",
        detail: "Go to developer.schwab.com and sign up. This is a separate account from your regular Schwab brokerage login — you'll link them in step 4.",
        link: "https://developer.schwab.com",
        linkLabel: "developer.schwab.com →",
      },
      {
        title: "Register a new app in the Developer Portal",
        detail: "In the Dashboard click \"Create App\". Select both \"Market Data Production\" and \"Accounts and Trading Production\". Set the callback URL exactly as shown above.",
        code: null,
      },
      {
        title: "Wait 2–5 business days for approval",
        detail: "Status will show \"Approved — Pending\" initially. You'll receive an email when your app is approved. Come back here once approved to complete setup.",
      },
      {
        title: "Enter your App Key and App Secret below",
        detail: "Copy both from your approved app in the Schwab Developer Portal. These are stored encrypted and never exposed to the browser.",
        isForm: true,
      },
      {
        title: "Complete the OAuth flow",
        detail: "Click \"Connect Schwab Account\" below. A Schwab login window will open — sign in with your regular brokerage credentials and select which accounts to authorize.",
        isConnect: true,
      },
      {
        title: "Select your default account",
        detail: "Once connected, you'll see your linked accounts. Pick your default. You can switch accounts any time from the dropdown in the app header.",
      },
    ],
  },
  {
    id: "etrade",
    name: "E*TRADE",
    sub: "Morgan Stanley · developer.etrade.com",
    color: "#6b21a8",
    phase: "Phase 2",
    phaseLabel: "Coming soon",
    available: false,

    piiNote: {
      level: "warning",
      title: "OAuth 1.0a — signed requests, no PII in callback",
      body: "E*TRADE uses OAuth 1.0a. The callback URL contains no personal data — it receives only an oauth_token and oauth_verifier. All requests are HMAC-SHA1 signed server-side so credentials never appear in a URL or browser request.",
      items: [
        "✓  Callback URL contains no PII — clean path only",
        "✓  Consumer Secret used for signing, never transmitted in plain text",
        "⚠  E*TRADE access tokens don't auto-expire — revoke in your E*TRADE account when disconnecting",
        "✗  We never store: your E*TRADE password or account numbers",
      ],
    },
  },
  {
    id: "tastytrade",
    name: "Tastytrade",
    sub: "api.tastyworks.com · No approval wait",
    color: "#f97316",
    phase: "Phase 2",
    phaseLabel: "Coming soon",
    available: false,

    piiNote: {
      level: "caution",
      title: "Session auth — no OAuth, no callback URL",
      body: "Tastytrade uses session-based authentication, not OAuth. There is no callback URL. Credentials are submitted server-side (Cloud Function only) and exchanged for a session token — your username and password are never stored or logged by our app.",
      items: [
        "✓  No callback URL — no redirect chain to intercept",
        "✓  Credentials handled exclusively in Cloud Function, never touch the browser",
        "⚠  Session tokens expire every ~24 hours — you'll be prompted to re-authenticate",
        "⚠  Use a unique Tastytrade password not shared with other accounts",
        "✗  We never store: your Tastytrade username or password",
      ],
    },
  },
  {
    id: "ibkr",
    name: "Interactive Brokers",
    sub: "Client Portal API · TWS REST API",
    color: "#dc2626",
    phase: "Phase 3",
    phaseLabel: "Planned",
    available: false,

    piiNote: {
      level: "info",
      title: "OAuth 2.0 via Client Portal — standard redirect, session keep-alive",
      body: "IBKR's Client Portal API uses standard OAuth 2.0, similar to Schwab. The callback URL contains no PII. Sessions require periodic keep-alive pings — our Cloud Function handles this automatically while the app is in use.",
      items: [
        "✓  Callback URL contains no PII — receives only a one-time auth code",
        "✓  HTTPS required for all production callbacks",
        "⚠  Sessions expire after ~24hrs of inactivity (shorter than Schwab's 7-day refresh token)",
        "⚠  TWS REST requires Trader Workstation running locally — we use Client Portal API only",
        "✗  We never store: your IBKR password or full account numbers",
      ],
    },
  },
];

// What the API powers inside the app
const DATA_FEATURES = [
  { icon: "📊", label: "Live Quotes", desc: "Real-time underlying prices feed into the B-S calculator" },
  { icon: "📋", label: "Option Chains", desc: "Browse strikes and expirations without leaving the app" },
  { icon: "💼", label: "Your Positions", desc: "Auto-import open covered call positions from your account" },
  { icon: "💰", label: "Buying Power", desc: "Account cash & margin available for sizing new positions" },
];

// ── Schwab connection flow ────────────────────────────────────────────────────

function SchwabSetupFlow({ broker, onClose }) {
  const { T } = useTheme();
  const [appKey, setAppKey]         = useState("");
  const [appSecret, setAppSecret]   = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [step, setStep]             = useState(0);
  const [connecting, setConnecting] = useState(false);
  const [error, setError]           = useState(null);

  const REDIRECT_URI = `${window.location.origin}/api/schwab/callback`;

  const handleConnect = useCallback(async () => {
    if (!appKey.trim() || !appSecret.trim()) {
      setError("Both App Key and App Secret are required.");
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      // Credentials go straight to the Cloud Function over HTTPS — the browser
      // never writes them to Firestore. The function encrypts + stores them.
      const result = await schwabInitiateOAuth({ appKey: appKey.trim(), appSecret: appSecret.trim(), redirectUri: REDIRECT_URI });
      const { authUrl } = result.data;
      window.open(authUrl, "_blank", "width=600,height=700,noopener");
    } catch (err) {
      setError(err.message || "Failed to initiate connection. Check your App Key and Secret.");
    } finally {
      setConnecting(false);
    }
  }, [appKey, appSecret, REDIRECT_URI]);

  const inputStyle = {
    width: "100%", boxSizing: "border-box",
    background: T.card, border: `1px solid ${T.border}`,
    borderRadius: 8, padding: "10px 14px",
    fontSize: 13, color: T.text, outline: "none",
    fontFamily: T.fontMono,
    transition: "border-color 0.2s",
  };

  return (
    <div>
      {/* Callback URL notice */}
      <Card style={{ background: T.accentDim, borderColor: T.accent + "33" }}>
        <div style={{ fontSize: 10, color: T.accent, fontFamily: T.fontMono, fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>
          YOUR CALLBACK URL — paste this into Schwab Developer Portal
        </div>
        <div style={{
          fontFamily: T.fontMono, fontSize: 12, color: T.text,
          background: T.surface, borderRadius: 6, padding: "8px 12px",
          wordBreak: "break-all", border: `1px solid ${T.border}`,
        }}>
          {REDIRECT_URI}
        </div>
      </Card>

      {/* ── PII & Security callout — inserted after callback URL box ── */}
      <PIICallout broker={broker} />

      {/* Step list */}
      {broker.steps.map((s, i) => (
        <Card
          key={i}
          style={{ padding: "16px 20px", cursor: s.isForm || s.isConnect ? "default" : "pointer", transition: "border-color 0.2s" }}
          onClick={() => !s.isForm && !s.isConnect && setStep(step === i ? -1 : i)}
          onMouseEnter={(e) => { if (!s.isForm && !s.isConnect) e.currentTarget.style.borderColor = T.borderActive; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.border; }}
        >
          <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
            {/* Step number */}
            <div style={{
              width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
              background: broker.color + "22", color: broker.color,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 700, fontFamily: T.fontMono,
            }}>
              {i + 1}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ color: T.text, fontSize: 13, fontWeight: 600, marginBottom: s.isForm || s.isConnect || step === i ? 10 : 0 }}>
                {s.title}
              </div>

              {(s.isForm || s.isConnect || step === i) && (
                <div>
                  {s.detail && (
                    <div style={{ color: T.textDim, fontSize: 12, lineHeight: 1.65, marginBottom: 12 }}>
                      {s.detail}
                    </div>
                  )}
                  {s.link && (
                    <a
                      href={s.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: 12, color: broker.color, fontFamily: T.fontMono, textDecoration: "none" }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {s.linkLabel}
                    </a>
                  )}
                  {s.isForm && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <div>
                        <label style={{ display: "block", fontSize: 10, color: T.textDim, fontFamily: T.fontMono, marginBottom: 5, letterSpacing: "0.8px", textTransform: "uppercase" }}>
                          App Key
                        </label>
                        <input
                          type="text"
                          value={appKey}
                          onChange={(e) => setAppKey(e.target.value)}
                          placeholder="Your Schwab App Key (client_id)"
                          style={inputStyle}
                          onFocus={(e) => e.target.style.borderColor = broker.color}
                          onBlur={(e) => e.target.style.borderColor = T.border}
                        />
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: 10, color: T.textDim, fontFamily: T.fontMono, marginBottom: 5, letterSpacing: "0.8px", textTransform: "uppercase" }}>
                          App Secret
                        </label>
                        <div style={{ position: "relative" }}>
                          <input
                            type={showSecret ? "text" : "password"}
                            value={appSecret}
                            onChange={(e) => setAppSecret(e.target.value)}
                            placeholder="Your Schwab App Secret"
                            style={{ ...inputStyle, paddingRight: 80 }}
                            onFocus={(e) => e.target.style.borderColor = broker.color}
                            onBlur={(e) => e.target.style.borderColor = T.border}
                          />
                          <button
                            onClick={() => setShowSecret(!showSecret)}
                            style={{
                              position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                              background: "none", border: "none", cursor: "pointer",
                              color: T.textDim, fontSize: 11, fontFamily: T.fontMono,
                            }}
                          >
                            {showSecret ? "Hide" : "Show"}
                          </button>
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: T.textMuted, fontFamily: T.fontMono }}>
                        🔒 Stored encrypted in Firestore. Never exposed to the browser.
                      </div>
                    </div>
                  )}
                  {s.isConnect && (
                    <div>
                      {error && (
                        <div style={{
                          padding: "10px 14px", borderRadius: 8, marginBottom: 12,
                          background: T.dangerDim, border: `1px solid ${T.danger}33`,
                          color: "#fca5a5", fontSize: 12,
                        }}>
                          {error}
                        </div>
                      )}
                      <button
                        onClick={handleConnect}
                        disabled={connecting || !appKey || !appSecret}
                        style={{
                          padding: "12px 24px", borderRadius: 8, border: "none",
                          cursor: (connecting || !appKey || !appSecret) ? "default" : "pointer",
                          background: (connecting || !appKey || !appSecret) ? T.accentDim : broker.color,
                          color: (connecting || !appKey || !appSecret) ? T.textDim : "#fff",
                          fontSize: 13, fontWeight: 700, fontFamily: T.fontBody,
                          transition: "all 0.2s",
                        }}
                      >
                        {connecting ? "Opening Schwab..." : "🔗 Connect Schwab Account"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </Card>
      ))}

      {/* Cancel */}
      <button onClick={onClose} style={{
        padding: "10px 20px", borderRadius: 8, border: `1px solid ${T.border}`,
        background: "transparent", color: T.textDim, cursor: "pointer",
        fontSize: 13, fontFamily: T.fontBody, marginTop: 4,
      }}>
        ← Back to broker list
      </button>
    </div>
  );
}

// ── Connected state — account switcher ────────────────────────────────────────

function ConnectedPanel({ broker, connection, accounts, activeAccount, onSetDefault, onDisconnect }) {
  const { T } = useTheme();
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  return (
    <div>
      {/* Status card */}
      <Card style={{ background: T.successDim, borderColor: T.success + "33" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <StatusDot status="connected" />
            <div>
              <div style={{ color: T.text, fontSize: 14, fontWeight: 700 }}>{broker.name} — Connected</div>
              <div style={{ color: T.textDim, fontSize: 11, fontFamily: T.fontMono, marginTop: 2 }}>
                {accounts.length} account{accounts.length !== 1 ? "s" : ""} linked · Live data active
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Badge color={T.success}>LIVE</Badge>
          </div>
        </div>
      </Card>

      {/* What's powered by this connection */}
      <Card>
        <div style={{ color: T.accent, fontSize: 10, fontFamily: T.fontMono, fontWeight: 700, letterSpacing: 1, marginBottom: 14 }}>
          LIVE DATA POWERING THE APP
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          {DATA_FEATURES.map((f) => (
            <div key={f.label} style={{
              background: T.card, border: `1px solid ${T.border}`, borderRadius: 8,
              padding: "12px 14px",
            }}>
              <div style={{ fontSize: 18, marginBottom: 6 }}>{f.icon}</div>
              <div style={{ color: T.text, fontSize: 12, fontWeight: 600, marginBottom: 3 }}>{f.label}</div>
              <div style={{ color: T.textDim, fontSize: 11, lineHeight: 1.5 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Account list */}
      {accounts.length > 0 && (
        <Card>
          <div style={{ color: T.accent, fontSize: 10, fontFamily: T.fontMono, fontWeight: 700, letterSpacing: 1, marginBottom: 14 }}>
            LINKED ACCOUNTS — select your default
          </div>
          {accounts.map((account) => {
            const isActive = activeAccount?.id === account.id;
            return (
              <div
                key={account.id}
                onClick={() => onSetDefault(account.id)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "12px 14px", borderRadius: 8, cursor: "pointer",
                  background: isActive ? T.accentDim : T.card,
                  border: `1px solid ${isActive ? T.accent + "44" : T.border}`,
                  marginBottom: 8, transition: "all 0.15s",
                }}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.borderColor = T.borderActive; }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.borderColor = T.border; }}
              >
                <div>
                  <div style={{ color: T.text, fontSize: 13, fontWeight: 600, fontFamily: T.fontMono }}>
                    ····{account.accountId?.slice(-4) || account.id?.slice(-4)}
                  </div>
                  <div style={{ color: T.textDim, fontSize: 11, marginTop: 2 }}>
                    {account.accountType || "Brokerage Account"} · {broker.name}
                  </div>
                </div>
                {isActive && <Badge color={T.accent}>DEFAULT</Badge>}
              </div>
            );
          })}
        </Card>
      )}

      {/* Token health */}
      <Card>
        <div style={{ color: T.accent, fontSize: 10, fontFamily: T.fontMono, fontWeight: 700, letterSpacing: 1, marginBottom: 12 }}>
          CONNECTION HEALTH
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <TokenRow label="Access Token"  expires={connection.expiresAt}        warnHours={0.5} />
          <TokenRow label="Refresh Token" expires={connection.refreshExpiresAt} warnHours={24} />
        </div>
        <div style={{ color: T.textMuted, fontSize: 11, fontFamily: T.fontMono, marginTop: 10 }}>
          Tokens refresh automatically. If the refresh token expires, you'll be prompted to reconnect.
        </div>
      </Card>

      {/* Disconnect */}
      <Card style={{ padding: "14px 20px" }}>
        {confirmDisconnect ? (
          <div>
            <div style={{ color: T.text, fontSize: 13, marginBottom: 12 }}>
              Disconnect {broker.name}? Live data will stop. Your transaction history is preserved.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={onDisconnect} style={{
                padding: "10px 20px", borderRadius: 8, border: "none",
                background: T.dangerDim, color: T.danger,
                fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: T.fontBody,
              }}>
                Yes, disconnect
              </button>
              <button onClick={() => setConfirmDisconnect(false)} style={{
                padding: "10px 20px", borderRadius: 8, border: `1px solid ${T.border}`,
                background: "transparent", color: T.textDim,
                fontSize: 13, cursor: "pointer", fontFamily: T.fontBody,
              }}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setConfirmDisconnect(true)} style={{
            padding: "8px 16px", borderRadius: 8, border: `1px solid ${T.border}`,
            background: "transparent", color: T.textDim, fontSize: 12,
            cursor: "pointer", fontFamily: T.fontBody,
          }}>
            Disconnect {broker.name}
          </button>
        )}
      </Card>
    </div>
  );
}

function TokenRow({ label, expires, warnHours }) {
  const { T } = useTheme();
  if (!expires) return null;
  const now      = Date.now();
  const msLeft   = expires - now;
  const hoursLeft = msLeft / (1000 * 60 * 60);
  const isExpired = msLeft <= 0;
  const isWarning = hoursLeft < warnHours;

  const color  = isExpired ? T.danger : isWarning ? T.warn : T.success;
  const label2 = isExpired     ? "Expired"
    : hoursLeft < 1  ? `${Math.round(hoursLeft * 60)}m remaining`
    : hoursLeft < 24 ? `${Math.round(hoursLeft)}h remaining`
    :                  `${Math.round(hoursLeft / 24)}d remaining`;

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <span style={{ color: T.textDim, fontSize: 12, fontFamily: T.fontMono }}>{label}</span>
      <span style={{ color, fontSize: 12, fontFamily: T.fontMono, fontWeight: 700 }}>
        <StatusDot status={isExpired ? "expired" : isWarning ? "pending" : "connected"} />
        {label2}
      </span>
    </div>
  );
}

// ── Broker card (not expanded) ────────────────────────────────────────────────

function BrokerCard({ broker, connection, onSelect }) {
  const { T }    = useTheme();
  const isConnected = connection?.status === "connected";
  const isPending   = connection?.status === "pending";

  return (
    <div
      style={{
        background: T.surface, border: `1px solid ${isConnected ? broker.color + "44" : T.border}`,
        borderRadius: T.r, padding: "18px 20px", marginBottom: 12,
        opacity: broker.available ? 1 : 0.55,
        transition: "border-color 0.2s",
      }}
      onMouseEnter={(e) => { if (broker.available && !isConnected) e.currentTarget.style.borderColor = broker.color + "55"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = isConnected ? broker.color + "44" : T.border; }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        {/* Left: broker info */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 10, flexShrink: 0,
            background: broker.color + "18", color: broker.color,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 700, fontFamily: T.fontMono,
          }}>
            {broker.id === "schwab"     ? "SCH"  :
             broker.id === "etrade"     ? "ETO"  :
             broker.id === "tastytrade" ? "TSTY" : "IBKR"}
          </div>
          <div>
            <div style={{ color: T.text, fontSize: 14, fontWeight: 700 }}>{broker.name}</div>
            <div style={{ color: T.textDim, fontSize: 11, fontFamily: T.fontMono, marginTop: 2 }}>{broker.sub}</div>
          </div>
        </div>

        {/* Right: status + action */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {isConnected && (
            <>
              <StatusDot status="connected" />
              <Badge color={T.success}>Connected</Badge>
            </>
          )}
          {isPending && <Badge color={T.warn}>Pending OAuth</Badge>}
          {!isConnected && !isPending && (
            <Badge color={broker.available ? broker.color : T.textMuted}>
              {broker.phaseLabel}
            </Badge>
          )}
          {broker.available && (
            <button
              onClick={() => onSelect(broker.id)}
              style={{
                padding: "8px 18px", borderRadius: 8, border: `1px solid ${broker.color}44`,
                background: isConnected ? T.accentDim : broker.color + "18",
                color: isConnected ? T.accent : broker.color,
                fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: T.fontBody,
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = broker.color + "28"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = isConnected ? T.accentDim : broker.color + "18"; }}
            >
              {isConnected ? "Manage" : "Connect"}
            </button>
          )}
        </div>
      </div>

      {/* ── PII callout shown inline on coming-soon broker cards ── */}
      {!broker.available && broker.piiNote && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${T.border}` }}>
          <PIICallout broker={broker} />
        </div>
      )}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function APITab() {
  const { T } = useTheme();
  const {
    connections, accounts, activeConnection, activeAccount,
    deleteConnection, setDefaultAccount,
  } = useBrokerConnection();

  const [selectedBroker, setSelectedBroker] = useState(null);

  const handleSelectBroker = (brokerId) => setSelectedBroker(brokerId);

  const handleDisconnect = async () => {
    if (!selectedBroker) return;
    await deleteConnection(selectedBroker);
    setSelectedBroker(null);
  };

  const activeBrokerDef    = BROKERS.find((b) => b.id === selectedBroker) || null;
  const selectedConnection = connections.find((c) => c.broker === selectedBroker) || null;
  const isConnected        = selectedConnection?.status === "connected";
  const hasAnyConnection   = connections.some((c) => c.status === "connected");

  return (
    <div role="region" aria-label="Broker API connections">

      {/* ── Global live data banner ── */}
      {hasAnyConnection && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "10px 18px", borderRadius: T.r, marginBottom: 16,
          background: T.successDim, border: `1px solid ${T.success}33`,
        }}>
          <StatusDot status="connected" />
          <span style={{ color: T.text, fontSize: 13, fontWeight: 600 }}>Live data active</span>
          <span style={{ color: T.textDim, fontSize: 12 }}>·</span>
          <span style={{ color: T.textDim, fontSize: 12 }}>
            {connections.filter((c) => c.status === "connected").map((c) => c.broker).join(", ")} connected
          </span>
          {activeAccount && (
            <>
              <span style={{ color: T.textDim, fontSize: 12 }}>·</span>
              <span style={{ color: T.textDim, fontSize: 12, fontFamily: T.fontMono }}>
                ····{activeAccount.accountId?.slice(-4) || "—"}
              </span>
            </>
          )}
        </div>
      )}

      {/* ── Header ── */}
      {!selectedBroker && (
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 16 }}>🔌</span>
            <h3 style={{ color: T.text, fontFamily: T.fontDisplay, fontSize: 16, margin: 0 }}>Broker API Connections</h3>
          </div>
          <div style={{ color: T.textDim, fontSize: 13, lineHeight: 1.7, marginBottom: 16 }}>
            Connect your broker account to pull live quotes, option chains, and positions directly into the app.
            Manual entry continues to work — the API is additive, not a replacement.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
            {DATA_FEATURES.map((f) => (
              <div key={f.label} style={{
                background: T.card, border: `1px solid ${T.border}`, borderRadius: 8,
                padding: "10px 12px", display: "flex", alignItems: "flex-start", gap: 8,
              }}>
                <span style={{ fontSize: 14, flexShrink: 0 }}>{f.icon}</span>
                <div>
                  <div style={{ color: T.text, fontSize: 11, fontWeight: 600 }}>{f.label}</div>
                  <div style={{ color: T.textDim, fontSize: 10, lineHeight: 1.5, marginTop: 2 }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── Broker list ── */}
      {!selectedBroker && (
        <div>
          <div style={{
            color: T.textDim, fontSize: 10, fontFamily: T.fontMono, letterSpacing: 1,
            textTransform: "uppercase", marginBottom: 10,
          }}>
            Available Brokers
          </div>
          {BROKERS.map((broker) => (
            <BrokerCard
              key={broker.id}
              broker={broker}
              connection={connections.find((c) => c.broker === broker.id)}
              onSelect={handleSelectBroker}
            />
          ))}

          {/* Historical data note */}
          <Card style={{ background: T.card, marginTop: 8 }}>
            <div style={{ display: "flex", gap: 10 }}>
              <span style={{ fontSize: 14, flexShrink: 0 }}>ℹ️</span>
              <div>
                <div style={{ color: T.text, fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Historical options data</div>
                <div style={{ color: T.textDim, fontSize: 12, lineHeight: 1.65 }}>
                  Broker APIs don't provide historical options pricing. The educational and backtesting features
                  continue to use Yahoo Finance and CBOE free data as they do today — unaffected by this integration.
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ── Broker detail: connected or setup flow ── */}
      {selectedBroker && activeBrokerDef && (
        <div>
          {/* Broker header */}
          <Card style={{ padding: "16px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button onClick={() => setSelectedBroker(null)} style={{
                padding: "6px 12px", borderRadius: 6, border: `1px solid ${T.border}`,
                background: "transparent", color: T.textDim, fontSize: 12,
                cursor: "pointer", fontFamily: T.fontMono,
              }}>
                ← Back
              </button>
              <div style={{ width: 1, height: 24, background: T.border }} />
              <div>
                <div style={{ color: activeBrokerDef.color, fontSize: 14, fontWeight: 700 }}>
                  {activeBrokerDef.name}
                </div>
                <div style={{ color: T.textDim, fontSize: 11, fontFamily: T.fontMono }}>
                  {activeBrokerDef.sub}
                </div>
              </div>
              {isConnected && <Badge color={T.success}>Connected</Badge>}
            </div>
          </Card>

          {isConnected ? (
            <ConnectedPanel
              broker={activeBrokerDef}
              connection={selectedConnection}
              accounts={accounts.filter((a) => a.broker === selectedBroker)}
              activeAccount={activeAccount}
              onSetDefault={setDefaultAccount}
              onDisconnect={handleDisconnect}
            />
          ) : (
            <SchwabSetupFlow
              broker={activeBrokerDef}
              onClose={() => setSelectedBroker(null)}
            />
          )}
        </div>
      )}
    </div>
  );
}
