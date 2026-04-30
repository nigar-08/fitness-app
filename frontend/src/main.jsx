import React from "react";
import { createRoot } from "react-dom/client";
import { Activity, Brain, LayoutDashboard, LogIn, RefreshCcw, Dumbbell } from "lucide-react";
import "./styles.css";

const APP_CONFIG = {
  gatewayUrl: import.meta.env.VITE_GATEWAY_URL || "http://localhost:8080",
  keycloakUrl: import.meta.env.VITE_KEYCLOAK_URL || "http://localhost:8181",
  realm: import.meta.env.VITE_KEYCLOAK_REALM || "fitness-oauth2",
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID || "fitness-frontend",
};

const ACTIVITY_TYPES = [
  "RUNNING",
  "WALKING",
  "CYCLING",
  "SWIMMING",
  "WEIGHT_TRAINING",
  "YOGA",
  "HIIT",
  "CARDIO",
  "STRETCHING",
  "OTHER",
];

const initialSettings = {
  ...APP_CONFIG,
  accessToken: localStorage.getItem("fitmind.accessToken") || "",
  refreshToken: localStorage.getItem("fitmind.refreshToken") || "",
  tokenExpiresAt: Number(localStorage.getItem("fitmind.tokenExpiresAt") || 0),
  userId: localStorage.getItem("fitmind.userId") || "",
  username: localStorage.getItem("fitmind.username") || "",
  displayName: localStorage.getItem("fitmind.displayName") || "",
};

function App() {
  const [view, setView] = React.useState("dashboard");
  const [settings, setSettings] = React.useState(initialSettings);
  const [activities, setActivities] = React.useState([]);
  const [recommendations, setRecommendations] = React.useState([]);
  const [alert, setAlert] = React.useState(null);
  const [gatewayStatus, setGatewayStatus] = React.useState("unknown");
  const [form, setForm] = React.useState(defaultActivityForm());

  const metrics = React.useMemo(() => ({
    totalActivities: activities.length,
    totalMinutes: activities.reduce((sum, item) => sum + (item.duration || 0), 0),
    totalCalories: activities.reduce((sum, item) => sum + (item.caloriesBurned || 0), 0),
    totalRecommendations: recommendations.length,
  }), [activities, recommendations]);

  const notify = React.useCallback((message, type = "info") => {
    setAlert({ message, type });
    window.setTimeout(() => setAlert(null), 4200);
  }, []);

  const persistSettings = React.useCallback((nextSettings) => {
    setSettings(nextSettings);
    localStorage.setItem("fitmind.accessToken", nextSettings.accessToken);
    localStorage.setItem("fitmind.refreshToken", nextSettings.refreshToken);
    localStorage.setItem("fitmind.tokenExpiresAt", String(nextSettings.tokenExpiresAt || 0));
    localStorage.setItem("fitmind.userId", nextSettings.userId);
    localStorage.setItem("fitmind.username", nextSettings.username || "");
    localStorage.setItem("fitmind.displayName", nextSettings.displayName || "");
  }, []);

  const refreshAccessToken = React.useCallback(async (currentSettings = settings) => {
    if (!currentSettings.refreshToken) return currentSettings;

    const tokens = await fetchToken(currentSettings, {
      grant_type: "refresh_token",
      refresh_token: currentSettings.refreshToken,
    });
    const nextSettings = mergeTokenSettings(currentSettings, tokens);
    persistSettings(nextSettings);
    return nextSettings;
  }, [persistSettings, settings]);

  const getValidSettings = React.useCallback(async () => {
    if (!settings.accessToken || !settings.refreshToken) return settings;
    if (Date.now() < settings.tokenExpiresAt - 30000) return settings;
    return refreshAccessToken(settings);
  }, [refreshAccessToken, settings]);

  const request = React.useCallback(async (path, options = {}) => {
    const activeSettings = await getValidSettings();
    let response = await fetch(`${activeSettings.gatewayUrl}${path}`, {
      ...options,
      headers: {
        ...authHeaders(activeSettings),
        ...(options.headers || {}),
      },
    });

    if (response.status === 401 && activeSettings.refreshToken) {
      const refreshedSettings = await refreshAccessToken(activeSettings);
      response = await fetch(`${refreshedSettings.gatewayUrl}${path}`, {
        ...options,
        headers: {
          ...authHeaders(refreshedSettings),
          ...(options.headers || {}),
        },
      });
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type") || "";
    return contentType.includes("application/json") ? response.json() : null;
  }, [getValidSettings, refreshAccessToken]);

  const checkGateway = React.useCallback(async () => {
    try {
      const activeSettings = await getValidSettings();
      await fetch(`${activeSettings.gatewayUrl}/api/activities`, {
        headers: authHeaders(activeSettings),
      });
      setGatewayStatus("online");
    } catch {
      setGatewayStatus("offline");
    }
  }, [getValidSettings]);

  const loadActivities = React.useCallback(async () => {
    if (!settings.accessToken) {
      notify("Please log in first.", "warn");
      setView("login");
      return;
    }
    const data = await request("/api/activities");
    setActivities(data || []);
    notify("Activities loaded.");
  }, [notify, request, settings.accessToken]);

  const loadRecommendations = React.useCallback(async () => {
    if (!settings.userId) {
      notify("Please log in first.", "warn");
      setView("login");
      return;
    }
    const data = await request(`/api/recommendations/user/${encodeURIComponent(settings.userId)}`);
    setRecommendations(data || []);
    notify("Recommendations loaded.");
  }, [notify, request, settings.userId]);

  const loadActivityRecommendation = async (activityId) => {
    if (!activityId) return;
    try {
      const recommendation = await request(`/api/recommendations/activity/${encodeURIComponent(activityId)}`);
      setRecommendations((current) => [recommendation, ...current.filter((item) => item.id !== recommendation.id)]);
      setView("recommendations");
    } catch (error) {
      notify(error.message, "error");
    }
  };

  const saveActivity = async (event) => {
    event.preventDefault();
    if (!settings.accessToken) {
      notify("Please log in first.", "warn");
      setView("login");
      return;
    }

    const payload = {
      type: form.type,
      duration: Number(form.duration),
      caloriesBurned: Number(form.caloriesBurned),
      startTime: form.startTime,
      additionalMetrics: compact({
        distance: optionalNumber(form.distance),
        averageHeartRate: optionalNumber(form.averageHeartRate),
        pace: form.pace,
        mood: form.mood,
      }),
    };

    try {
      const saved = await request("/api/activities", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setActivities((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      notify("Activity saved. AI recommendation will appear after the AI service consumes the event.");
    } catch (error) {
      notify(error.message, "error");
    }
  };

  const loginWithKeycloak = async () => {
    try {
      const verifier = createCodeVerifier();
      const challenge = await createCodeChallenge(verifier);
      sessionStorage.setItem("fitmind.pkceVerifier", verifier);
      window.location.assign(buildKeycloakLoginUrl(settings, challenge));
    } catch (error) {
      notify(error.message, "error");
    }
  };

  const signOut = () => {
    const nextSettings = {
      ...settings,
      accessToken: "",
      refreshToken: "",
      tokenExpiresAt: 0,
      userId: "",
      displayName: "",
    };
    persistSettings(nextSettings);
    setActivities([]);
    setRecommendations([]);
    window.location.assign(buildKeycloakLogoutUrl(settings));
  };

  React.useEffect(() => {
    checkGateway();
  }, [checkGateway]);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authError = params.get("error_description") || params.get("error");
    const code = params.get("code");

    if (authError) {
      window.history.replaceState({}, document.title, window.location.pathname);
      notify(authError, "error");
      setView("login");
      return;
    }

    if (!code) return;

    let cancelled = false;
    exchangeAuthorizationCode(settings, code)
      .then((tokens) => {
        if (cancelled) return;
        const nextSettings = mergeTokenSettings(settings, tokens);
        persistSettings(nextSettings);
        window.history.replaceState({}, document.title, window.location.pathname);
        setView("dashboard");
        notify("Logged in successfully.");
      })
      .catch((error) => {
        if (cancelled) return;
        window.history.replaceState({}, document.title, window.location.pathname);
        notify(error.message, "error");
        setView("login");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const sortedActivities = activities
    .slice()
    .sort((a, b) => new Date(b.startTime || b.createdAt) - new Date(a.startTime || a.createdAt));

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">F</div>
          <div>
            <h1>FitMind AI</h1>
            <p>Fitness tracking with AI recommendations</p>
          </div>
        </div>

        <nav className="nav-list" aria-label="Primary">
          <NavButton active={view === "dashboard"} icon={LayoutDashboard} label="Dashboard" onClick={() => setView("dashboard")} />
          <NavButton active={view === "activity"} icon={Activity} label="Track Activity" onClick={() => setView("activity")} />
          <NavButton active={view === "recommendations"} icon={Brain} label="AI Recommendations" onClick={() => setView("recommendations")} />
          <NavButton active={view === "login"} icon={LogIn} label={settings.accessToken ? "Profile" : "Login"} onClick={() => setView("login")} />
        </nav>

        <section className="connection-panel">
          <div className="status-row">
            <span className={`status-dot ${gatewayStatus}`} />
            <span>{gatewayStatus === "online" ? "Gateway reachable" : gatewayStatus === "offline" ? "Gateway offline" : "Not checked"}</span>
          </div>
          <button className="secondary-btn" type="button" onClick={checkGateway}>Check Gateway</button>
        </section>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <p className="eyebrow">Microservices Demo</p>
            <h2>{viewTitles[view]}</h2>
          </div>
          <div className="topbar-actions">
            <button className="icon-btn" type="button" title="Refresh data" onClick={() => {
              loadActivities().catch((error) => notify(error.message, "error"));
              if (settings.userId) loadRecommendations().catch((error) => notify(error.message, "error"));
            }}>
              <RefreshCcw size={17} />
              Refresh
            </button>
            <button className="primary-btn" type="button" onClick={() => setView("activity")}>
              <Dumbbell size={17} />
              Track Workout
            </button>
          </div>
        </header>

        <section className="alert-host" aria-live="polite">
          {alert && <div className={`alert ${alert.type}`}>{alert.message}</div>}
        </section>

        {view === "dashboard" && (
          <Dashboard
            metrics={metrics}
            activities={sortedActivities}
            recommendations={recommendations}
            onActivityInsight={loadActivityRecommendation}
            onViewActivity={() => setView("activity")}
            onViewRecommendations={() => setView("recommendations")}
          />
        )}

        {view === "activity" && (
          <ActivityView
            form={form}
            setForm={setForm}
            activities={sortedActivities}
            onSubmit={saveActivity}
            onLoad={() => loadActivities().catch((error) => notify(error.message, "error"))}
            onActivityInsight={loadActivityRecommendation}
          />
        )}

        {view === "recommendations" && (
          <RecommendationsView
            recommendations={recommendations}
            onLoad={() => loadRecommendations().catch((error) => notify(error.message, "error"))}
          />
        )}

        {view === "login" && (
          <LoginView
            settings={settings}
            onLogin={loginWithKeycloak}
            onSignOut={signOut}
          />
        )}
      </main>
    </div>
  );
}

function NavButton({ active, icon: Icon, label, onClick }) {
  return (
    <button className={`nav-item ${active ? "active" : ""}`} type="button" onClick={onClick}>
      <Icon size={18} />
      <span>{label}</span>
    </button>
  );
}

function Dashboard({ metrics, activities, recommendations, onActivityInsight, onViewActivity, onViewRecommendations }) {
  return (
    <section className="view active">
      <div className="metrics-grid">
        <Metric label="Total Activities" value={metrics.totalActivities} />
        <Metric label="Total Minutes" value={metrics.totalMinutes} />
        <Metric label="Calories Burned" value={metrics.totalCalories} />
        <Metric label="AI Insights" value={metrics.totalRecommendations} />
      </div>

      <div className="content-grid">
        <section className="panel">
          <div className="panel-heading">
            <h3>Recent Activities</h3>
            <button className="text-btn" type="button" onClick={onViewActivity}>Add</button>
          </div>
          <ActivityList activities={activities.slice(0, 4)} onActivityInsight={onActivityInsight} />
        </section>

        <section className="panel">
          <div className="panel-heading">
            <h3>Latest AI Insight</h3>
            <button className="text-btn" type="button" onClick={onViewRecommendations}>View</button>
          </div>
          <LatestRecommendation recommendation={recommendations[0]} />
        </section>
      </div>
    </section>
  );
}

function ActivityView({ form, setForm, activities, onSubmit, onLoad, onActivityInsight }) {
  const updateForm = (event) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  };

  return (
    <section className="view active">
      <section className="helper-panel">
        <strong>Workout entry</strong>
        <span>Choose a workout, enter minutes and calories, then save. Distance, heart rate, pace, and mood are optional details.</span>
      </section>

      <form className="form-panel" onSubmit={onSubmit}>
        <div className="form-grid">
          <Field label="Activity Type">
            <select name="type" value={form.type} onChange={updateForm} required>
              {ACTIVITY_TYPES.map((type) => <option key={type} value={type}>{labelize(type)}</option>)}
            </select>
          </Field>
          <Field label="Duration">
            <input name="duration" type="number" min="1" value={form.duration} onChange={updateForm} required aria-describedby="duration-hint" />
            <span id="duration-hint" className="field-hint">Required, in minutes</span>
          </Field>
          <Field label="Calories">
            <input name="caloriesBurned" type="number" min="0" value={form.caloriesBurned} onChange={updateForm} required aria-describedby="calories-hint" />
            <span id="calories-hint" className="field-hint">Required, estimate is fine</span>
          </Field>
          <Field label="Start Time">
            <input name="startTime" type="datetime-local" value={form.startTime} onChange={updateForm} required />
          </Field>
        </div>

        <div className="form-grid">
          <Field label="Distance">
            <input name="distance" type="number" min="0" step="0.1" placeholder="5.0" value={form.distance} onChange={updateForm} />
            <span className="field-hint">Optional, kilometers</span>
          </Field>
          <Field label="Average Heart Rate">
            <input name="averageHeartRate" type="number" min="0" placeholder="135" value={form.averageHeartRate} onChange={updateForm} />
            <span className="field-hint">Optional, leave empty if unknown</span>
          </Field>
          <Field label="Pace">
            <input name="pace" type="text" placeholder="6:10 / km" value={form.pace} onChange={updateForm} />
            <span className="field-hint">Optional</span>
          </Field>
          <Field label="Mood">
            <select name="mood" value={form.mood} onChange={updateForm}>
              <option value="Energized">Energized</option>
              <option value="Steady">Steady</option>
              <option value="Tired">Tired</option>
              <option value="Strong">Strong</option>
            </select>
          </Field>
        </div>

        <div className="form-actions">
          <button className="primary-btn" type="submit">Save Activity</button>
          <button className="secondary-btn" type="button" onClick={onLoad}>Load Activities</button>
        </div>
      </form>

      <section className="panel">
        <div className="panel-heading">
          <h3>Activity History</h3>
          <span className="pill">{activities.length} loaded</span>
        </div>
        <ActivityList activities={activities} onActivityInsight={onActivityInsight} />
      </section>
    </section>
  );
}

function RecommendationsView({ recommendations, onLoad }) {
  return (
    <section className="view active">
      <section className="panel">
        <div className="panel-heading">
          <h3>AI Recommendations</h3>
          <button className="secondary-btn" type="button" onClick={onLoad}>Load Recommendations</button>
        </div>
        {recommendations.length ? (
          <div className="recommendation-list">
            {recommendations.map((recommendation) => <RecommendationCard key={recommendation.id || recommendation.activityId} recommendation={recommendation} />)}
          </div>
        ) : (
          <div className="recommendation-list empty-state">No recommendations loaded yet.</div>
        )}
      </section>
    </section>
  );
}

function LoginView({ settings, onLogin, onSignOut }) {
  return (
    <section className="view active">
      <div className="form-panel narrow">
        {settings.accessToken && (
          <div className="profile-strip">
            <div>
              <span>Signed in as</span>
              <strong>{settings.displayName || settings.username}</strong>
            </div>
            <button className="secondary-btn" type="button" onClick={onSignOut}>Sign Out</button>
          </div>
        )}
        {!settings.accessToken && <p className="login-copy">Sign in with Keycloak to track workouts and load AI recommendations.</p>}
        <div className="form-actions">
          {!settings.accessToken && (
            <button className="primary-btn" type="button" onClick={onLogin}>
              <LogIn size={17} />
              Login with Keycloak
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }) {
  return (
    <article className="metric-card">
      <p>{label}</p>
      <strong>{value}</strong>
    </article>
  );
}

function Field({ label, children }) {
  return (
    <label>
      {label}
      {children}
    </label>
  );
}

function ActivityList({ activities, onActivityInsight }) {
  if (!activities.length) {
    return <div className="list empty-state">No activities loaded yet.</div>;
  }

  return (
    <div className="list">
      {activities.map((activity) => (
        <article className="activity-item" key={activity.id || `${activity.type}-${activity.startTime}`}>
          <div>
            <div className="item-title">
              <span>{activity.type || "Activity"}</span>
              <span className="pill">{formatDate(activity.startTime || activity.createdAt)}</span>
            </div>
            <div className="item-meta">{activityDetails(activity)}</div>
          </div>
          <button className="secondary-btn" type="button" onClick={() => onActivityInsight(activity.id)}>AI Insight</button>
        </article>
      ))}
    </div>
  );
}

function LatestRecommendation({ recommendation }) {
  if (!recommendation) {
    return <div className="insight-box empty-state">No recommendation loaded yet.</div>;
  }

  return (
    <div className="insight-box">
      <strong>{recommendation.activityType || "Activity"}</strong>
      <br />
      {recommendation.recommendation || "No summary available."}
    </div>
  );
}

function RecommendationCard({ recommendation }) {
  return (
    <article className="recommendation-item">
      <h4>{recommendation.activityType || "Activity"} Recommendation</h4>
      <p>{recommendation.recommendation || "No summary available."}</p>
      <div className="recommendation-columns">
        <MiniList title="Improvements" values={recommendation.improvements} />
        <MiniList title="Suggestions" values={recommendation.suggestions} />
        <MiniList title="Safety" values={recommendation.safety} />
      </div>
    </article>
  );
}

function MiniList({ title, values = [] }) {
  const items = values.length ? values : ["No items yet"];
  return (
    <div className="mini-list">
      <strong>{title}</strong>
      <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>
    </div>
  );
}

function authHeaders(settings) {
  const headers = { "Content-Type": "application/json" };
  if (settings.accessToken) {
    headers.Authorization = settings.accessToken.startsWith("Bearer ")
      ? settings.accessToken
      : `Bearer ${settings.accessToken}`;
  }
  if (settings.userId) headers["X-User-ID"] = settings.userId;
  return headers;
}

async function fetchToken(settings, fields) {
  const body = new URLSearchParams({
    client_id: settings.clientId,
    ...fields,
  });

  const response = await fetch(`${settings.keycloakUrl}/realms/${settings.realm}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error_description || data.error || "Keycloak login failed");
  }
  return data;
}

async function exchangeAuthorizationCode(settings, code) {
  const verifier = sessionStorage.getItem("fitmind.pkceVerifier");
  if (!verifier) {
    throw new Error("Login session expired. Please try logging in again.");
  }

  sessionStorage.removeItem("fitmind.pkceVerifier");
  return fetchToken(settings, {
    grant_type: "authorization_code",
    code,
    redirect_uri: getAppRedirectUri(),
    code_verifier: verifier,
  });
}

function buildKeycloakLoginUrl(settings, codeChallenge) {
  const params = new URLSearchParams({
    client_id: settings.clientId,
    redirect_uri: getAppRedirectUri(),
    response_type: "code",
    scope: "openid profile email",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return `${settings.keycloakUrl}/realms/${settings.realm}/protocol/openid-connect/auth?${params}`;
}

function buildKeycloakLogoutUrl(settings) {
  const params = new URLSearchParams({
    client_id: settings.clientId,
    post_logout_redirect_uri: getAppRedirectUri(),
  });

  return `${settings.keycloakUrl}/realms/${settings.realm}/protocol/openid-connect/logout?${params}`;
}

function mergeTokenSettings(settings, tokens) {
  const accessToken = tokens.access_token || settings.accessToken;
  const claims = tokenClaims(accessToken);
  return {
    ...settings,
    accessToken,
    refreshToken: tokens.refresh_token || settings.refreshToken,
    tokenExpiresAt: Date.now() + ((tokens.expires_in || 0) * 1000),
    userId: claims.sub || settings.userId,
    username: claims.preferred_username || settings.username,
    displayName: claims.name || claims.preferred_username || settings.displayName,
  };
}

function defaultActivityForm() {
  return {
    type: "RUNNING",
    duration: 30,
    caloriesBurned: 240,
    startTime: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16),
    distance: "",
    averageHeartRate: "",
    pace: "",
    mood: "Energized",
  };
}

function tokenClaims(token) {
  try {
    const raw = token.replace(/^Bearer\s+/i, "");
    const payload = raw.split(".")[1];
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(normalized));
  } catch {
    return {};
  }
}

function getAppRedirectUri() {
  return window.location.origin;
}

function createCodeVerifier() {
  const bytes = new Uint8Array(64);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function createCodeChallenge(verifier) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

function base64UrlEncode(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function optionalNumber(value) {
  if (value === null || value === "") return undefined;
  return Number(value);
}

function compact(values) {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined && value !== ""));
}

function labelize(value) {
  return value.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value) {
  if (!value) return "No date";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function activityDetails(activity) {
  const metrics = activity.additionalMetrics || {};
  return [
    `${activity.duration || 0} min`,
    `${activity.caloriesBurned || 0} kcal`,
    metrics.distance ? `${metrics.distance} km` : null,
    metrics.averageHeartRate ? `${metrics.averageHeartRate} bpm` : null,
  ].filter(Boolean).join(" · ");
}

const viewTitles = {
  dashboard: "Dashboard",
  activity: "Track Activity",
  recommendations: "AI Recommendations",
  login: "Login",
};

createRoot(document.getElementById("root")).render(<App />);
