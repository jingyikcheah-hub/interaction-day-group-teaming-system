import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { supabase, isSupabaseConfigured } from "./supabaseClient.js";
import { DEMO_PARTICIPANTS, OFFICIAL_PARTICIPANTS, SYSTEM_NAME, YEAR_OPTIONS } from "./participants.js";
import { createAnnouncementText, createBalancedGroups, sortMembersByYear } from "./teamAlgorithm.js";
import { playPopSound, speakText } from "./audio.js";

const EMPTY_EVENT = {
  id: 1,
  status: "waiting",
  groups: {},
  started_at: null,
  updated_at: null,
  version: 0
};

function getInitialMode() {
  const hashMode = window.location.hash.replace("#", "");
  return ["home", "user", "admin", "demo", "dashboard"].includes(hashMode) ? hashMode : "home";
}

function App() {
  const [mode, setModeState] = useState(getInitialMode);
  const { participants, eventState, loading, error, joinParticipant, adminStart, adminReset, adminRemoveParticipant, adminUpdateParticipantYear } = useRealtimeEvent();
  const autoStartLock = useRef(false);
  const previousParticipantCount = useRef(0);

  const setMode = (nextMode) => {
    setModeState(nextMode);
    const nextHash = nextMode === "home" ? "" : `#${nextMode}`;
    if (window.location.hash !== nextHash) {
      history.replaceState(null, "", `${window.location.pathname}${window.location.search}${nextHash}`);
    }
  };

  useEffect(() => {
    const onHashChange = () => setModeState(getInitialMode());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    if (eventState.status === "waiting" && participants.length < 11) {
      autoStartLock.current = false;
    }
  }, [eventState.status, eventState.version, participants.length]);

  useEffect(() => {
    const justReachedFull = previousParticipantCount.current < 11 && participants.length === 11;
    previousParticipantCount.current = participants.length;

    if (!isSupabaseConfigured) return;
    if (eventState.status !== "waiting") return;
    if (!justReachedFull) return;
    if (autoStartLock.current) return;

    autoStartLock.current = true;
    const groups = createBalancedGroups(participants);
    supabase.rpc("auto_start_when_full", { group_payload: groups }).then(({ error }) => {
      if (error) console.warn("Auto start skipped:", error.message);
    });
  }, [participants, eventState.status]);

  return (
    <main className="app-shell">
      <AnimatedBackground />
      <div className="app-content">
        {mode === "home" && <HomeScreen setMode={setMode} />}
        {mode === "user" && (
          <ParticipantMode
            participants={participants}
            eventState={eventState}
            loading={loading}
            error={error}
            joinParticipant={joinParticipant}
            setMode={setMode}
          />
        )}
        {mode === "admin" && (
          <AdminMode
            participants={participants}
            eventState={eventState}
            loading={loading}
            error={error}
            adminStart={adminStart}
            adminReset={adminReset}
            adminRemoveParticipant={adminRemoveParticipant}
            adminUpdateParticipantYear={adminUpdateParticipantYear}
            setMode={setMode}
          />
        )}
        {mode === "demo" && <DemoMode setMode={setMode} />}
        {mode === "dashboard" && (
          <DashboardMode
            participants={participants}
            eventState={eventState}
            setMode={setMode}
          />
        )}
      </div>
    </main>
  );
}

function useRealtimeEvent() {
  const [participants, setParticipants] = useState([]);
  const [eventState, setEventState] = useState(EMPTY_EVENT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchParticipants = async () => {
    if (!supabase) {
      const localParticipants = JSON.parse(localStorage.getItem("interaction_local_participants") || "[]");
      setParticipants(localParticipants);
      return;
    }
    const { data, error } = await supabase.from("participants").select("id, name, year, joined_at").order("joined_at", { ascending: true });
    if (error) setError(error.message);
    else setParticipants(data || []);
  };

  const fetchEvent = async () => {
    if (!supabase) {
      const localEvent = JSON.parse(localStorage.getItem("interaction_local_event") || "null");
      setEventState(localEvent || EMPTY_EVENT);
      return;
    }
    const { data, error } = await supabase.from("event_state").select("*").eq("id", 1).single();
    if (error) setError(error.message);
    else setEventState({ ...EMPTY_EVENT, ...(data || {}) });
  };

  const refreshAll = async () => {
    setLoading(true);
    setError("");
    await Promise.all([fetchParticipants(), fetchEvent()]);
    setLoading(false);
  };

  useEffect(() => {
    refreshAll();

    if (!supabase) {
      const onStorage = () => refreshAll();
      window.addEventListener("storage", onStorage);
      return () => window.removeEventListener("storage", onStorage);
    }

    const channel = supabase
      .channel("interaction-day-group-nexus")
      .on("postgres_changes", { event: "*", schema: "public", table: "participants" }, () => fetchParticipants())
      .on("postgres_changes", { event: "*", schema: "public", table: "event_state" }, () => fetchEvent())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const joinParticipant = async ({ name, year }) => {
    setError("");
    if (!name || !year) throw new Error("Please choose your name and current year.");

    if (!supabase) {
      const current = JSON.parse(localStorage.getItem("interaction_local_participants") || "[]");
      if (current.some((p) => p.name === name)) throw new Error("This name has already joined the wait list.");
      const next = [...current, { id: `local-${Date.now()}`, name, year, joined_at: new Date().toISOString() }];
      localStorage.setItem("interaction_local_participants", JSON.stringify(next));
      setParticipants(next);
      return;
    }

    const { error } = await supabase.from("participants").insert({ name, year });
    if (error) {
      if (/duplicate|unique/i.test(error.message)) {
        throw new Error("This name has already joined the wait list.");
      }
      throw new Error(error.message);
    }
  };

  const adminStart = async ({ username, password }) => {
    setError("");
    const groups = createBalancedGroups(participants);

    if (!supabase) {
      const nextEvent = {
        ...EMPTY_EVENT,
        status: "completed",
        groups,
        started_at: new Date().toISOString(),
        version: Date.now()
      };
      localStorage.setItem("interaction_local_event", JSON.stringify(nextEvent));
      setEventState(nextEvent);
      return;
    }

    const { error } = await supabase.rpc("admin_start_event", {
      admin_username: username,
      admin_password: password,
      group_payload: groups
    });
    if (error) throw new Error(error.message);
  };

  const adminReset = async ({ username, password }) => {
    setError("");

    if (!supabase) {
      localStorage.removeItem("interaction_local_participants");
      localStorage.removeItem("interaction_local_event");
      setParticipants([]);
      setEventState(EMPTY_EVENT);
      return;
    }

    const { error } = await supabase.rpc("admin_reset_event", {
      admin_username: username,
      admin_password: password
    });
    if (error) throw new Error(error.message);
  };

  const adminRemoveParticipant = async ({ username, password, participantId }) => {
    setError("");
    if (!participantId) throw new Error("Missing participant id.");

    if (!supabase) {
      const current = JSON.parse(localStorage.getItem("interaction_local_participants") || "[]");
      const next = current.filter((p) => p.id !== participantId);
      localStorage.setItem("interaction_local_participants", JSON.stringify(next));
      setParticipants(next);
      const nextEvent = { ...EMPTY_EVENT, version: Date.now(), updated_at: new Date().toISOString() };
      localStorage.setItem("interaction_local_event", JSON.stringify(nextEvent));
      setEventState(nextEvent);
      return;
    }

    const { error } = await supabase.rpc("admin_remove_participant", {
      admin_username: username,
      admin_password: password,
      p_participant_id: participantId
    });
    if (error) throw new Error(error.message);
  };

  const adminUpdateParticipantYear = async ({ username, password, participantId, year }) => {
    setError("");
    if (!participantId || !year) throw new Error("Missing participant or year.");

    if (!supabase) {
      const current = JSON.parse(localStorage.getItem("interaction_local_participants") || "[]");
      const next = current.map((p) => (p.id === participantId ? { ...p, year } : p));
      localStorage.setItem("interaction_local_participants", JSON.stringify(next));
      setParticipants(next);
      const nextEvent = { ...EMPTY_EVENT, version: Date.now(), updated_at: new Date().toISOString() };
      localStorage.setItem("interaction_local_event", JSON.stringify(nextEvent));
      setEventState(nextEvent);
      return;
    }

    const { error } = await supabase.rpc("admin_update_participant_year", {
      admin_username: username,
      admin_password: password,
      p_participant_id: participantId,
      p_participant_year: year
    });
    if (error) throw new Error(error.message);
  };

  return { participants, eventState, loading, error, joinParticipant, adminStart, adminReset, adminRemoveParticipant, adminUpdateParticipantYear };
}

function HomeScreen({ setMode }) {
  return (
    <section className="hero-card entrance-rise">
      <button className="card-nav-button dashboard-nav" onClick={() => setMode("dashboard")}>Dashboard</button>
      <div className="badge">Interaction Day Event</div>
      <h1>{SYSTEM_NAME}</h1>
      <p className="hero-subtitle">Scan, join the wait list, and watch the teams form live with countdown, animation, sound, and voice announcement.</p>


      <div className="mode-grid">
        <button className="mode-card primary" onClick={() => setMode("user")}>
          <span>Participant Mode</span>
          <small>For QR code users</small>
        </button>
        <button className="mode-card" onClick={() => setMode("admin")}>
          <span>Admin Mode</span>
          <small>Cheah Jing Yik only</small>
        </button>
        <button className="mode-card sparkle" onClick={() => setMode("demo")}>
          <span>Demo Workflow</span>
          <small>Auto-simulate 11 people</small>
        </button>
      </div>
    </section>
  );
}

function DashboardMode({ participants, eventState, setMode }) {
  if (eventState.status === "completed") {
    return <RevealExperience eventState={eventState} setMode={setMode} participants={participants} />;
  }

  return (
    <section className="dashboard-stage entrance-rise">
      <div className="panel dashboard-card">
        <BackButton setMode={setMode} />
        <div className="dashboard-header">
          <div>
            <div className="badge">Monitor Dashboard</div>
            <h1>Live Teaming Dashboard</h1>
            <p className="hero-subtitle">Display this screen on the classroom monitor. Participants will appear live before countdown, progress animation, team formation, and voice announcement.</p>
          </div>
          <div className="dashboard-count">
            <strong>{participants.length}</strong>
            <span>/ 11 joined</span>
          </div>
        </div>
        <WaitList participants={participants} dashboard />
      </div>
    </section>
  );
}

function ParticipantMode({ participants, eventState, loading, error, joinParticipant, setMode }) {
  const [name, setName] = useState("");
  const [year, setYear] = useState("");
  const [joined, setJoined] = useState(false);
  const [message, setMessage] = useState("");
  const usedNames = useMemo(() => new Set(participants.map((p) => p.name)), [participants]);

  const submit = async (event) => {
    event.preventDefault();
    try {
      await joinParticipant({ name, year });
      setJoined(true);
      setMessage("Successfully joined the wait list.");
    } catch (err) {
      setMessage(err.message);
    }
  };

  if (eventState.status === "completed") {
    return <RevealExperience eventState={eventState} setMode={setMode} participants={participants} />;
  }

  return (
    <section className="two-column entrance-rise">
      <div className="panel form-panel">
        <BackButton setMode={setMode} />
        <div className="badge">Participant Mode</div>
        <h1>{SYSTEM_NAME}</h1>
        <p className="muted">Choose your official name and current year. Names already in the wait list will be locked.</p>

        <form onSubmit={submit} className="join-form">
          <label>
            Official Name
            <select value={name} onChange={(e) => setName(e.target.value)} disabled={joined || loading}>
              <option value="">Select your name</option>
              {OFFICIAL_PARTICIPANTS.map((participantName) => (
                <option key={participantName} value={participantName} disabled={usedNames.has(participantName)}>
                  {participantName}{usedNames.has(participantName) ? " — Joined" : ""}
                </option>
              ))}
            </select>
          </label>

          <div className="year-selector">
            <span>Which Year Currently?</span>
            <div className="year-options">
              {YEAR_OPTIONS.map((option) => (
                <button
                  type="button"
                  key={option}
                  className={year === option ? "active" : ""}
                  onClick={() => setYear(option)}
                  disabled={joined || loading}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <button className="big-action" type="submit" disabled={joined || !name || !year || loading}>
            Proceed to Wait List
          </button>
        </form>

        {(message || error) && <div className="status-line">{message || error}</div>}
      </div>

      <WaitList participants={participants} />
    </section>
  );
}

function AdminMode({
  participants,
  eventState,
  loading,
  error,
  adminStart,
  adminReset,
  adminRemoveParticipant,
  adminUpdateParticipantYear,
  setMode
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [message, setMessage] = useState("");
  const [busyAction, setBusyAction] = useState("");

  const credentials = useMemo(() => ({ username, password }), [username, password]);

  const runAdminAction = async (actionName, task) => {
    setMessage("");
    setBusyAction(actionName);
    try {
      await task();
    } catch (err) {
      setMessage(err.message || "Action failed.");
    } finally {
      setBusyAction("");
    }
  };

  const localLogin = (event) => {
    event.preventDefault();
    if (username === "jingyikcheah" && password === "jingyik12345") {
      setLoggedIn(true);
      setMessage("Admin access granted.");
    } else {
      setMessage("Invalid admin username or password.");
    }
  };

  const start = async () => {
    if (participants.length !== 11) {
      const confirmed = window.confirm(`Only ${participants.length}/11 participants have joined. Start anyway?`);
      if (!confirmed) return;
    }
    await runAdminAction("start", async () => {
      await adminStart(credentials);
      setMessage("Formation started successfully.");
    });
  };

  const recalculate = async () => {
    if (participants.length !== 11) {
      setMessage("Need exactly 11 participants to form teams.");
      return;
    }
    await runAdminAction("recalculate", async () => {
      await adminStart(credentials);
      setMessage("Teams recalculated successfully.");
    });
  };

  const reset = async () => {
    const confirmed = window.confirm("Reset the entire wait list and team result?");
    if (!confirmed) return;
    await runAdminAction("reset", async () => {
      await adminReset(credentials);
      setMessage("System reset completed.");
    });
  };

  const removeParticipant = async (person) => {
    const confirmed = window.confirm(`Remove ${person.name} from the wait list?`);
    if (!confirmed) return;
    await runAdminAction(`remove-${person.id}`, async () => {
      await adminRemoveParticipant({ ...credentials, participantId: person.id });
      setMessage(`${person.name} removed from the wait list.`);
    });
  };

  const updateYear = async (person, year) => {
    if (person.year === year) return;
    await runAdminAction(`year-${person.id}`, async () => {
      await adminUpdateParticipantYear({ ...credentials, participantId: person.id, year });
      setMessage(`${person.name}'s year updated to ${year}.`);
    });
  };

  const isBusy = Boolean(busyAction);

  if (!loggedIn) {
    return (
      <section className="admin-login panel entrance-rise">
        <BackButton setMode={setMode} />
        <div className="badge">Admin Mode</div>
        <h1>Cheah Jing Yik Control Room</h1>
        <form onSubmit={localLogin} className="join-form">
          <label>
            Username
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Admin username" />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Admin password" />
          </label>
          <button className="big-action" type="submit">Enter Control Room</button>
        </form>
        {message && <div className="status-line">{message}</div>}
      </section>
    );
  }

  return (
    <section className="admin-grid entrance-rise">
      <div className="panel admin-panel">
        <BackButton setMode={setMode} />
        <div className="badge">Live Control Room</div>
        <h1>Admin Control Panel</h1>
        <div className="admin-stats">
          <div>
            <strong>{participants.length}</strong>
            <span>/ 11 joined</span>
          </div>
          <div>
            <strong>{eventState.status}</strong>
            <span>system status</span>
          </div>
        </div>

        <div className="admin-actions">
          <button className="big-action" onClick={start} disabled={loading || isBusy || participants.length === 0 || eventState.status !== "waiting"}>
            {busyAction === "start" ? "Starting..." : "Start Formation"}
          </button>
          <button className="secondary-action no-top-margin" onClick={recalculate} disabled={loading || isBusy}>
            {busyAction === "recalculate" ? "Recalculating..." : "Recalculate Teams"}
          </button>
          <button className="danger-action" onClick={reset} disabled={isBusy}>
            {busyAction === "reset" ? "Resetting..." : "Reset Event"}
          </button>
        </div>

        <p className="muted tiny-note">
          Manage mistaken joins here. Remove and Change Year are handled through admin RPC functions, so you do not need to open Supabase Table Editor during the event.
        </p>
        {(message || error) && <div className="status-line">{message || error}</div>}
      </div>

      <div className="panel admin-management-panel">
        <div className="wait-title-row">
          <div>
            <div className="badge">Wait List Management</div>
            <h2>Current Participants: {participants.length} / 11</h2>
          </div>
          <div className="live-dot"><span /> LIVE</div>
        </div>

        <div className="admin-participant-list">
          {participants.length === 0 && <div className="empty-slot">No participants have joined yet.</div>}
          {participants.map((person, index) => (
            <div className="admin-participant-card" key={person.id || `${person.name}-${person.joined_at || index}`}>
              <div className="admin-participant-main">
                <span className="chip-index">{index + 1}</span>
                <div>
                  <strong>{person.name}</strong>
                  <small>{person.year} • Joined {formatJoinedAt(person.joined_at)}</small>
                </div>
              </div>

              <div className="admin-participant-controls">
                <select
                  aria-label={`Change year for ${person.name}`}
                  value={person.year}
                  onChange={(e) => updateYear(person, e.target.value)}
                  disabled={isBusy}
                >
                  {YEAR_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
                <button
                  className="mini-danger-action"
                  onClick={() => removeParticipant(person)}
                  disabled={isBusy || !person.id}
                >
                  {busyAction === `remove-${person.id}` ? "Removing..." : "Remove"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {eventState.status === "completed" && (
        <div className="admin-results panel">
          <ResultsBoard groups={eventState.groups} />
        </div>
      )}
    </section>
  );
}

function DemoMode({ setMode }) {
  const [demoParticipants, setDemoParticipants] = useState([]);
  const [demoEvent, setDemoEvent] = useState(EMPTY_EVENT);
  const [running, setRunning] = useState(false);

  const runDemo = async () => {
    setRunning(true);
    setDemoParticipants([]);
    setDemoEvent(EMPTY_EVENT);

    for (let i = 0; i < DEMO_PARTICIPANTS.length; i++) {
      await sleep(420);
      setDemoParticipants((prev) => [...prev, { ...DEMO_PARTICIPANTS[i], joined_at: new Date().toISOString() }]);
    }

    await sleep(700);
    const groups = createBalancedGroups(DEMO_PARTICIPANTS);
    setDemoEvent({
      ...EMPTY_EVENT,
      status: "completed",
      groups,
      started_at: new Date().toISOString(),
      version: Date.now()
    });
  };

  if (demoEvent.status === "completed") {
    return <RevealExperience eventState={demoEvent} setMode={setMode} participants={demoParticipants} demoMode />;
  }

  return (
    <section className="two-column entrance-rise">
      <div className="panel form-panel">
        <BackButton setMode={setMode} />
        <div className="badge">Demo Workflow</div>
        <h1>Auto Simulation</h1>
        <p className="muted">Click once and the system will simulate 11 people joining, play pop sounds, count down, form groups, and announce the teams.</p>
        <button className="big-action" onClick={runDemo} disabled={running}>
          {running ? "Demo Running..." : "Run Full Demo"}
        </button>
      </div>
      <WaitList participants={demoParticipants} />
    </section>
  );
}

function RevealExperience({ eventState, setMode, participants, demoMode = false }) {
  const [phase, setPhase] = useState("countdown");
  const [count, setCount] = useState(3);
  const [spoken, setSpoken] = useState(false);
  const groups = eventState.groups || {};
  const announcement = useMemo(() => createAnnouncementText(groups), [groups]);

  useEffect(() => {
    const started = eventState.started_at ? new Date(eventState.started_at).getTime() : Date.now();
    const elapsed = Date.now() - started;

    if (!demoMode && elapsed > 9000) {
      setPhase("results");
      return;
    }

    setPhase("countdown");
    setCount(3);
    const timers = [
      setTimeout(() => setCount(2), 1000),
      setTimeout(() => setCount(1), 2000),
      setTimeout(() => setPhase("progress"), 3000),
      setTimeout(() => setPhase("results"), 6100)
    ];

    return () => timers.forEach(clearTimeout);
  }, [eventState.version, eventState.started_at, demoMode]);

  useEffect(() => {
    if (phase !== "results" || spoken) return;
    const timer = setTimeout(() => {
      speakText(announcement);
      setSpoken(true);
    }, 700);
    return () => clearTimeout(timer);
  }, [phase, spoken, announcement]);

  return (
    <section className="reveal-stage entrance-rise">
      <div className="panel reveal-card">
        <BackButton setMode={setMode} />
        {phase !== "results" && (
          <div className="formation-overlay">
            {phase === "countdown" && <div className="countdown-number" key={count}>{count}</div>}
            {phase === "progress" && (
              <div className="progress-card">
                <h2>Forming Balanced Teams...</h2>
                <div className="progress-track"><div className="progress-fill" /></div>
                <p>Balancing current year distribution and Group 4 compensation</p>
              </div>
            )}
          </div>
        )}

        {phase !== "results" && <WaitList participants={participants} compact />}

        {phase === "results" && (
          <div className="results-panel">
            <div className="success-title">
              <span className="success-pulse" />
              <div>
                <div className="badge">Group Teaming Successful</div>
                <h1>Team Formation Complete</h1>
              </div>
            </div>
            <ResultsBoard groups={groups} />
            <button className="secondary-action" onClick={() => speakText(announcement)}>🔊 Announce Teams Again</button>
          </div>
        )}
      </div>
    </section>
  );
}

function WaitList({ participants, compact = false, dashboard = false }) {
  const previousCount = useRef(participants.length);

  useEffect(() => {
    if (participants.length > previousCount.current) playPopSound();
    previousCount.current = participants.length;
  }, [participants.length]);

  return (
    <div className={`panel wait-panel ${compact ? "compact" : ""} ${dashboard ? "dashboard-wait" : ""}`}>
      <div className="wait-title-row">
        <div>
          <div className="badge">Live Wait List</div>
          <h2>Current Participants: {participants.length} / 11</h2>
        </div>
        <div className="live-dot"><span /> LIVE</div>
      </div>

      <div className="wait-list">
        {participants.length === 0 && <div className="empty-slot">Waiting for participants to scan the QR code...</div>}
        {participants.map((person, index) => (
          <div className="participant-chip" key={`${person.name}-${person.joined_at || index}`} style={{ animationDelay: `${Math.min(index * 70, 650)}ms` }}>
            <span className="chip-index">{index + 1}</span>
            <strong>{person.name}</strong>
            <em>({person.year})</em>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResultsBoard({ groups }) {
  return (
    <div className="groups-grid">
      {Object.entries(groups || {}).map(([groupName, members], groupIndex) => {
        const sortedMembers = sortMembersByYear(members);
        return (
          <div className="group-card" key={groupName} style={{ animationDelay: `${groupIndex * 160}ms` }}>
            <div className="group-header">
              <span>{groupName}</span>
              <small>{sortedMembers.length} members</small>
            </div>
            <div className="member-list">
              {sortedMembers.map((member, memberIndex) => (
                <div className="member-row" key={member.name} style={{ animationDelay: `${groupIndex * 150 + memberIndex * 90}ms` }}>
                  <div className="avatar-glow">{member.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}</div>
                  <div>
                    <strong>{member.name}</strong>
                    <span>{member.year}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BackButton({ setMode }) {
  return <button className="card-nav-button back-button" onClick={() => setMode("home")}>← Home</button>;
}

function formatJoinedAt(value) {
  if (!value) return "just now";
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }).format(new Date(value));
  } catch {
    return "just now";
  }
}

function AnimatedBackground() {
  return (
    <div className="animated-bg" aria-hidden="true">
      <div className="orb orb-one" />
      <div className="orb orb-two" />
      <div className="orb orb-three" />
      <div className="grid-overlay" />
      <div className="scanline" />
    </div>
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

createRoot(document.getElementById("root")).render(<App />);
