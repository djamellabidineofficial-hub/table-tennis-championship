const IS_STATIC_HOST = window.location.hostname.endsWith("github.io") || window.location.protocol === "file:";
const API_BASE = IS_STATIC_HOST ? "" : "/api";

const CLIENT_DB_KEY = "pingpong_championship_db_v1";

const DEFAULT_LOCAL_CLUBS = [];

const clientStore = {
  getDb() {
    try {
      // Clear legacy storage keys from previous tests
      localStorage.removeItem("chess_championship_db_v3");
      localStorage.removeItem("chess_championship_db_v2");
      localStorage.removeItem("chess_championship_db");
    } catch {}

    try {
      const data = localStorage.getItem(CLIENT_DB_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed.clubs)) return parsed;
      }
    } catch {}
    const initDb = {
      clubs: [],
      scans: [],
      sessions: {}
    };
    this.saveDb(initDb);
    return initDb;
  },
  saveDb(db) {
    try {
      localStorage.setItem(CLIENT_DB_KEY, JSON.stringify(db));
    } catch {}
  },
  handle(path, { method = "GET", body = {} } = {}) {
    const db = this.getDb();
    const cleanPath = path.replace(/^\/?api\/?/, "").split("?")[0];

    // 1. REGISTER
    if (cleanPath === "register" && method === "POST") {
      const rawName = (body.name || "").trim();
      const rawUser = (body.username || "").trim();
      const password = (body.password || "").trim();
      const slot = (body.slot || "").trim().toUpperCase();

      if (!rawName || !rawUser || !password) {
        throw new Error("All fields are required.");
      }
      if (password.length < 4) {
        throw new Error("Password must be at least 4 characters.");
      }

      const username = rawUser.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_.-]/g, "");
      if (!username) throw new Error("Invalid username.");

      if (db.clubs.some(c => (c.username || "").toLowerCase() === username || (c.id || "").toLowerCase() === username)) {
        throw new Error("Username already taken. Please choose another.");
      }

      if (slot && ["T1","T2","T3","T4","T5","T6"].includes(slot)) {
        const taken = db.clubs.find(c => c.slot === slot && !c.id.startsWith("club"));
        if (taken) {
          throw new Error(`Slot ${slot} is already assigned to ${taken.name}.`);
        }
      }

      const newClub = {
        id: username,
        username: username,
        name: rawName,
        password: password,
        slot: slot || "",
        points: 0,
        wins: 0,
        played: 0,
        registeredAt: new Date().toISOString()
      };

      db.clubs.push(newClub);
      const token = "local_tok_" + Math.random().toString(36).slice(2) + Date.now();
      db.sessions[token] = { clubId: username, username, expiresAt: Date.now() + 86400000 * 7 };
      this.saveDb(db);

      return {
        token,
        user: username,
        username: username,
        club: newClub
      };
    }

    // 2. LOGIN
    if (cleanPath === "login" && method === "POST") {
      const rawUser = (body.username || "").trim();
      const pass = (body.password || "").trim();
      const username = rawUser.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_.-]/g, "");

      const club = db.clubs.find(c => 
        (c.username || "").toLowerCase() === username || 
        (c.id || "").toLowerCase() === username || 
        (c.username || "").toLowerCase() === rawUser.toLowerCase()
      );

      if (!club || club.password !== pass) {
        throw new Error("Invalid club username or password.");
      }

      const token = "local_tok_" + Math.random().toString(36).slice(2) + Date.now();
      db.sessions[token] = { clubId: club.id, username: club.username || club.id, expiresAt: Date.now() + 86400000 * 7 };
      this.saveDb(db);

      return {
        token,
        user: club.username || club.id,
        username: club.username || club.id,
        club: {
          id: club.id,
          name: club.name,
          username: club.username || club.id,
          slot: club.slot || "",
          points: club.points || 0,
          wins: club.wins || 0,
          played: club.played || 0
        }
      };
    }

    // 3. ME (Profile - Only CONFIRMED matches award points)
    if (cleanPath === "me") {
      const tok = session.token;
      const sess = tok ? db.sessions[tok] : null;
      const clubId = sess ? (sess.clubId || sess.username) : session.user;
      const club = (db.clubs || []).find(c => c.id === clubId || c.username === clubId) || session.club;
      if (!club) throw new Error("No active club session.");
      const confirmedScans = (db.scans || []).filter(s => s.status === "confirmed");
      const clubScans = confirmedScans.filter(s => s.clubId === club.id || s.username === club.username || s.clubId === club.username);
      const pts = clubScans.reduce((sum, s) => sum + (Number(s.points) || 0), 0);
      const wins = clubScans.filter(s => s.outcome === "win" || s.points === 1 || s.points === 2).length;
      const played = clubScans.length;
      const clubInfo = {
        id: club.id || clubId,
        username: club.username || club.id || clubId,
        name: club.name || club.username || "My Club",
        slot: club.slot || "",
        points: pts,
        wins: wins,
        played: played
      };
      return {
        user: clubInfo,
        club: clubInfo
      };
    }

    // 4. LEADERBOARD (Only CONFIRMED matches award points)
    if (cleanPath === "leaderboard") {
      const confirmedScans = (db.scans || []).filter(s => s.status === "confirmed");
      const rows = db.clubs.map(c => {
        const clubScans = confirmedScans.filter(s => s.clubId === c.id || s.username === c.username || s.clubId === c.username);
        const pts = clubScans.reduce((sum, s) => sum + (Number(s.points) || 0), 0);
        const wins = clubScans.filter(s => s.outcome === "win" || s.points === 1 || s.points === 2).length;
        const played = clubScans.length;
        return {
          id: c.id,
          name: c.name,
          username: c.username || c.id,
          slot: c.slot || "",
          points: pts,
          wins: wins,
          played: played
        };
      });
      rows.sort((a, b) => b.points - a.points || b.wins - a.wins || a.name.localeCompare(b.name));
      return {
        rows: rows.map((r, i) => ({ ...r, rank: i + 1, place: i + 1 }))
      };
    }

    // 5. MY SCANS
    if (cleanPath === "my-scans") {
      const tok = session.token;
      const sess = tok ? db.sessions[tok] : null;
      const clubId = sess ? (sess.clubId || sess.username) : session.user;
      const clubScans = (db.scans || []).filter(s => s.clubId === clubId || s.username === clubId);
      return { scans: clubScans };
    }

    // 6. SCAN (Always PENDING until Admin confirms! Ping pong = 1 point per win)
    if (cleanPath === "scan" && method === "POST") {
      const code = (body.code || "").trim();
      const tok = session.token;
      const sess = tok ? db.sessions[tok] : null;
      const clubId = sess ? (sess.clubId || sess.username) : session.user;
      const club = db.clubs.find(c => c.id === clubId || c.username === clubId);
      if (!club) throw new Error("Please log in with your club account before scanning.");

      const pts = 1;

      if (!db.scans) db.scans = [];

      const myClubScans = db.scans.filter(s => (s.clubId === club.id || s.username === club.username) && s.status !== "rejected");
      if (myClubScans.length >= 5) {
        throw new Error(`Your club (${club.name}) has already recorded results for all 5 rounds! (5/5 matches recorded).`);
      }

      const roundNum = myClubScans.length + 1;
      const challengeTitle = `Round ${roundNum} Victory (+1 pt)`;

      const scanRec = {
        id: "scan_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
        clubId: club.id,
        username: club.username || club.id,
        clubName: club.name,
        challenge: challengeTitle,
        outcome: "win",
        points: pts,
        status: "pending", // PENDING until confirmed by referee
        createdAt: new Date().toISOString()
      };

      db.scans.push(scanRec);
      this.saveDb(db);

      return {
        ok: true,
        win: scanRec,
        outcome: scanRec.outcome,
        points: pts,
        challenge: challengeTitle,
        status: "pending",
        message: "Match victory recorded! 1 Point will appear on the leaderboard once confirmed by the referee."
      };
    }

    // 7. CLUBS
    if (cleanPath === "clubs") {
      return { clubs: db.clubs };
    }

    // 8. ADMIN ACTIONS
    if (cleanPath.startsWith("admin/")) {
      if (cleanPath === "admin/challenges") {
        return { challenges: [] };
      }
      if (cleanPath === "admin/wins") {
        const filterStatus = path.includes("status=") ? (new URLSearchParams(path.split("?")[1])).get("status") : "";
        const wins = (db.scans || []).filter(s => !filterStatus || s.status === filterStatus);
        return { wins };
      }
      if (cleanPath === "admin/wins-approve-all" && method === "POST") {
        let approvedCount = 0;
        (db.scans || []).forEach(s => {
          if (s.status === "pending") {
            s.status = "confirmed";
            approvedCount++;
          }
        });
        this.saveDb(db);
        return { ok: true, approvedCount };
      }
      if (cleanPath.startsWith("admin/wins/") && method === "POST") {
        const winId = cleanPath.split("/")[2];
        const status = body.status || "confirmed";
        const scan = (db.scans || []).find(s => s.id === winId);
        if (scan) {
          scan.status = status;
          this.saveDb(db);
        }
        return { ok: true, status };
      }
      if (cleanPath.startsWith("admin/wins/") && method === "DELETE") {
        const winId = cleanPath.split("/")[2];
        db.scans = (db.scans || []).filter(s => s.id !== winId);
        this.saveDb(db);
        return { ok: true };
      }
      if (cleanPath === "admin/reset" && method === "POST") {
        db.clubs = [];
        db.scans = [];
        db.sessions = {};
        this.saveDb(db);
        return { ok: true, message: "Tournament reset. All clubs and match results cleared." };
      }
    }

    return { ok: true };
  }
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// Enforce Dark Navy theme
document.documentElement.setAttribute("data-theme", "navy");

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

function formatPoints(pts) {
  return Number(pts).toLocaleString("en-US");
}

const session = {
  get token() { try { return localStorage.getItem("pingpong_token") || localStorage.getItem("chess_token"); } catch { return null; } },
  set token(v) {
    try {
      if (v) {
        localStorage.setItem("pingpong_token", v);
      } else {
        localStorage.removeItem("pingpong_token");
        localStorage.removeItem("chess_token");
      }
    } catch {}
  },
  get user() { try { return localStorage.getItem("pingpong_user") || localStorage.getItem("chess_user"); } catch { return null; } },
  set user(v) {
    try {
      if (v) {
        localStorage.setItem("pingpong_user", v);
      } else {
        localStorage.removeItem("pingpong_user");
        localStorage.removeItem("chess_user");
      }
    } catch {}
  },
  get club() {
    try {
      const c = localStorage.getItem("pingpong_club_info") || localStorage.getItem("chess_club_info");
      return c ? JSON.parse(c) : null;
    } catch { return null; }
  },
  set club(v) {
    try {
      if (v) {
        localStorage.setItem("pingpong_club_info", JSON.stringify(v));
      } else {
        localStorage.removeItem("pingpong_club_info");
        localStorage.removeItem("chess_club_info");
      }
    } catch {}
  },
};

const adminToken = {
  get() { try { return sessionStorage.getItem("pingpong_admin_token") || localStorage.getItem("pingpong_admin_token") || sessionStorage.getItem("chess_admin_token") || localStorage.getItem("chess_admin_token"); } catch { return null; } },
  set(v) {
    try {
      if (v) {
        sessionStorage.setItem("pingpong_admin_token", v);
        localStorage.setItem("pingpong_admin_token", v);
      } else {
        sessionStorage.removeItem("pingpong_admin_token");
        localStorage.removeItem("pingpong_admin_token");
        sessionStorage.removeItem("chess_admin_token");
        localStorage.removeItem("chess_admin_token");
      }
    } catch {}
  },
};

async function api(path, { method = "GET", body, headers = {} } = {}) {
  // If explicitly hosted on static provider (GitHub Pages or local file), route directly to local store
  if (IS_STATIC_HOST) {
    return clientStore.handle(path, { method, body });
  }

  const reqHeaders = { "Content-Type": "application/json", ...headers };
  if (session.token) {
    reqHeaders["Authorization"] = `Bearer ${session.token}`;
  }
  if (adminToken.get()) {
    reqHeaders["x-admin-token"] = adminToken.get();
  }

  try {
    const res = await fetch(`${API_BASE}/${path}`, {
      method,
      headers: reqHeaders,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (res.ok) {
      return await res.json();
    }

    // 404 or 405 means API route is not served on this host -> fall back to clientStore
    if (res.status === 404 || res.status === 405) {
      return clientStore.handle(path, { method, body });
    }

    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Something went wrong.");
  } catch (err) {
    // Network failure or static host blocking POST -> fall back to clientStore
    if (err.name === "TypeError" || String(err.message).includes("fetch") || String(err.message).includes("NetworkError")) {
      return clientStore.handle(path, { method, body });
    }
    throw err;
  }
}

function setMsg(el, text, ok = false) {
  if (!el) return;
  el.textContent = text;
  el.className = "msg " + (text ? (ok ? "ok" : "err") : "");
  el.style.display = text ? "block" : "none";
}

// ========================================================
// 3-DOTS KEBAB MENU (ADMIN ACCESS)
// ========================================================
const kebabBtn = $("#kebab-btn");
const kebabMenu = $("#kebab-menu");

if (kebabBtn && kebabMenu) {
  kebabBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isHidden = kebabMenu.hidden;
    kebabMenu.hidden = !isHidden;
    kebabBtn.setAttribute("aria-expanded", String(isHidden));
  });

  document.addEventListener("click", (e) => {
    if (!kebabMenu.contains(e.target) && !kebabBtn.contains(e.target)) {
      kebabMenu.hidden = true;
      kebabBtn.setAttribute("aria-expanded", "false");
    }
  });
}

$("#menu-admin-btn")?.addEventListener("click", () => {
  activateTab("admin");
});

// ========================================================
// TABS & NAVIGATION
// ========================================================
function activateTab(tabId) {
  // If navigating away from scanner, always close camera automatically
  if (tabId !== "scan") {
    stopScanner();
  }

  // If attempting to scan while not logged in, direct to login
  if (tabId === "scan" && !session.token) {
    tabId = "visitor";
    setMsg(authMsg, "Please sign in to scan match QR codes.", false);
  }

  $$(".tabs .tab").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === tabId);
  });
  $$(".panel").forEach((p) => {
    p.classList.toggle("active", p.id === tabId);
  });

  if (kebabBtn) {
    kebabBtn.classList.toggle("on", tabId === "admin");
    kebabBtn.setAttribute("aria-expanded", "false");
  }
  if (kebabMenu) {
    kebabMenu.hidden = true;
  }

  if (tabId === "admin") checkAdminAuth();
  if (tabId === "leaderboard") loadLeaderboard();
  if (tabId === "visitor") checkClubSession();
  if (tabId === "scan") updateScanClubBadge();
}

$$(".tab").forEach((btn) => {
  btn.addEventListener("click", () => activateTab(btn.dataset.tab));
});

// Conditions language switcher (English or Arabic in corner)
function switchConditionsLang(lang) {
  const enBox = document.getElementById("conditions-content-en");
  const arBox = document.getElementById("conditions-content-ar");
  const btnEn = document.getElementById("lang-btn-en");
  const btnAr = document.getElementById("lang-btn-ar");

  if (!enBox || !arBox) return;

  btnEn?.classList.toggle("active", lang === "en");
  btnAr?.classList.toggle("active", lang === "ar");

  if (lang === "ar") {
    enBox.hidden = true;
    arBox.hidden = false;
  } else {
    enBox.hidden = false;
    arBox.hidden = true;
  }
}
window.switchConditionsLang = switchConditionsLang;

document.getElementById("lang-btn-en")?.addEventListener("click", () => switchConditionsLang("en"));
document.getElementById("lang-btn-ar")?.addEventListener("click", () => switchConditionsLang("ar"));

// Password toggles
$$(".toggle-pass").forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = $(`#${btn.dataset.target}`);
    if (target) {
      const isPass = target.type === "password";
      target.type = isPass ? "text" : "password";
      const eyeOpen = btn.querySelector(".eye-open");
      const eyeClosed = btn.querySelector(".eye-closed");
      if (eyeOpen && eyeClosed) {
        eyeOpen.classList.toggle("hidden", !isPass);
        eyeClosed.classList.toggle("hidden", isPass);
      }
    }
  });
});

// ========================================================
// 1. VISITOR / CLUB LOGIN & DASHBOARD
// ========================================================
const mainNav = $("#main-nav");
const authBox = $("#auth");
const clubDashBox = $("#club-dashboard-area");
const loginView = $("#login-view");
const registerView = $("#register-view");
const authMsg = $("#auth-msg");

const tabBtnSignIn = $("#tab-btn-signin");
const tabBtnSignUp = $("#tab-btn-signup");

function showSignInMode() {
  if (loginView) loginView.hidden = false;
  if (registerView) registerView.hidden = true;
  tabBtnSignIn?.classList.add("active");
  tabBtnSignUp?.classList.remove("active");
  setMsg(authMsg, "");
}

function showSignUpMode() {
  if (loginView) loginView.hidden = true;
  if (registerView) registerView.hidden = false;
  tabBtnSignUp?.classList.add("active");
  tabBtnSignIn?.classList.remove("active");
  setMsg(authMsg, "");
}

tabBtnSignIn?.addEventListener("click", showSignInMode);
tabBtnSignUp?.addEventListener("click", showSignUpMode);
$("#go-to-register")?.addEventListener("click", showSignUpMode);
$("#go-to-login")?.addEventListener("click", showSignInMode);

// Slot auto-hint
async function checkClubSession() {
  if (!session.token) {
    if (authBox) authBox.hidden = false;
    if (clubDashBox) clubDashBox.hidden = true;
    return;
  }

  try {
    const me = await api("me");
    const clubUser = me?.user || me?.club || session.club || {};
    if (!clubUser.name && !clubUser.username) {
      throw new Error("No club profile found");
    }
    await renderClubDash(clubUser);
  } catch (err) {
    console.warn("Session check fallback:", err);
    if (session.club) {
      await renderClubDash(session.club);
    } else {
      session.token = null;
      session.user = null;
      session.club = null;
      if (authBox) authBox.hidden = false;
      if (clubDashBox) clubDashBox.hidden = true;
    }
  }
}

async function renderClubDash(data) {
  const user = data?.user || data?.club || data || {};
  if (!user || (!user.name && !user.username)) return;

  if (authBox) authBox.hidden = true;
  if (clubDashBox) clubDashBox.hidden = false;

  const displayName = user.name || user.username || "My Club";
  const uname = user.username || user.id || "club";

  $("#club-display-name").textContent = displayName;
  $("#who").textContent = `@${uname}`;
  $("#club-dash-pts").textContent = user.points || 0;

  // Standings rank
  try {
    const lb = await api("leaderboard");
    const rankInfo = lb.rows?.find((r) => r.username === uname || r.id === uname || r.id === user.id);
    if (rankInfo) {
      const place = rankInfo.rank || rankInfo.place || (lb.rows.indexOf(rankInfo) + 1);
      $("#club-dash-rank").textContent = `#${place}`;
      $("#club-dash-wins").textContent = rankInfo.wins ?? 0;
      if ($("#club-dash-played")) $("#club-dash-played").textContent = rankInfo.played ?? (rankInfo.wins ?? 0);
    }
  } catch {}

  loadClubScansLog();
}

async function loadClubScansLog() {
  const container = $("#club-scans-log");
  if (!container) return;

  try {
    const data = await api("my-scans");
    const scans = data.scans || [];
    if (scans.length === 0) {
      container.innerHTML = `<p class="hint" style="text-align: center; margin: 8px 0;">No matches recorded yet. Call the referee after your match and scan your result!</p>`;
      return;
    }

    container.innerHTML = scans
      .map((s) => {
        const timeStr = s.createdAt ? new Date(s.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
        return `
        <div class="win">
          <div>
            <strong>WIN (+1 PT) - ${escapeHtml(s.challenge || "Match")}</strong>
            <div style="font-size: 11px; color: var(--muted);">${timeStr}</div>
          </div>
          <span class="badge ${s.status === "confirmed" ? "confirmed" : s.status === "rejected" ? "rejected" : "pending"}">${escapeHtml(s.status || "confirmed")}</span>
        </div>
      `;
      })
      .join("");
  } catch {}
}

$("#login-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  let username = form.username.value.trim().toLowerCase();
  username = username.replace(/\s+/g, "_").replace(/[^a-z0-9_.-]/g, "");
  const password = form.password.value;

  if (!username) {
    setMsg(authMsg, "Please enter your club username.", false);
    return;
  }
  if (!password) {
    setMsg(authMsg, "Please enter your password.", false);
    return;
  }

  setMsg(authMsg, "Authenticating club...", true);

  try {
    const data = await api("login", { method: "POST", body: { username, password } });
    session.token = data.token;
    session.user = data.username || data.user || username;
    session.club = data.club || { id: username, username, name: data.username || username, slot: "", points: 0, wins: 0, played: 0 };
    setMsg(authMsg, "");

    // Reveal main tabs
    if (mainNav) mainNav.hidden = false;
    await renderClubDash(session.club);

    // Stay on My Club section and show active dashboard with welcome message!
    activateTab("visitor");
    const dashMsg = $("#club-dash-msg");
    if (dashMsg) {
      setMsg(dashMsg, `Welcome back, ${session.club?.name || session.user}! You are signed in.`, true);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (err) {
    setMsg(authMsg, err.message, false);
    authMsg?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
});

$("#register-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  let username = form.username.value.trim().toLowerCase();
  username = username.replace(/\s+/g, "_").replace(/[^a-z0-9_.-]/g, "");
  const name = form.name.value.trim();
  const password = form.password.value;
  const slot = form.slot ? form.slot.value : "";

  if (!name) {
    setMsg(authMsg, "Please enter your club name.", false);
    authMsg?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  if (!username) {
    setMsg(authMsg, "Please enter a club username (letters, numbers, _).", false);
    authMsg?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  if (!password || password.length < 4) {
    setMsg(authMsg, "Password must be at least 4 characters.", false);
    authMsg?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  setMsg(authMsg, "Creating club account...", true);

  try {
    const data = await api("register", { method: "POST", body: { username, name, password, slot } });
    session.token = data.token;
    session.user = data.username || data.user || username;
    session.club = data.club || { id: username, username, name, slot, points: 0, wins: 0, played: 0 };
    setMsg(authMsg, "");

    // Reveal main tabs
    if (mainNav) mainNav.hidden = false;
    await renderClubDash(session.club);

    // Stay on My Club section and display the newly created account dashboard!
    activateTab("visitor");
    const dashMsg = $("#club-dash-msg");
    if (dashMsg) {
      setMsg(dashMsg, `Club account "${session.club?.name || session.user}" created successfully! Welcome to the championship.`, true);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (err) {
    setMsg(authMsg, err.message, false);
    authMsg?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
});

$("#logout")?.addEventListener("click", () => {
  session.token = null;
  session.user = null;
  session.club = null;
  if (authBox) authBox.hidden = false;
  if (clubDashBox) clubDashBox.hidden = true;
  showSignInMode();
  activateTab("visitor");
  setMsg(authMsg, "You have been logged out.", true);
});

// ========================================================
// 2. SCANNER ENGINE
// ========================================================
const startScanBtn = $("#start-scan");
const stopScanBtn = $("#stop-scan");
const videoWrap = $(".video-wrap");
const video = $("#video");
const manualSubmit = $("#manual-submit");
const manualCode = $("#manual-code");
const scanMsg = $("#scan-msg");

const codeResult = $("#code-result");
const resultSuccess = $("#result-success");
const resultError = $("#result-error");
const successTitle = $("#success-title");
const successDesc = $("#success-desc");
const successPoints = $("#success-points");
const errorDesc = $("#error-desc");
const closeResultBtn = $("#close-result");

function updateScanClubBadge() {
  const badge = $("#scanner-club-badge");
  if (badge) badge.remove();
}

closeResultBtn?.addEventListener("click", () => {
  if (codeResult) codeResult.hidden = true;
  stopScanner();
});

function showScanSuccess(win, pts, challengeName) {
  if (!codeResult) return;
  codeResult.hidden = false;
  if (resultError) resultError.hidden = true;
  if (resultSuccess) resultSuccess.hidden = false;

  const isPending = win?.status === "pending";

  const resultTag = resultSuccess.querySelector(".result-tag");
  if (resultTag) {
    resultTag.textContent = isPending ? "SUBMISSION PENDING REFEREE CONFIRMATION" : "CODE VERIFIED";
  }

  if (successTitle) {
    successTitle.textContent = isPending ? "VICTORY SUBMITTED!" : "VICTORY VERIFIED!";
  }
  if (successDesc) {
    successDesc.textContent = isPending
      ? `Match recorded for ${challengeName || "Ping Pong Match"}. Points will appear on the Leaderboard once confirmed by the Referee.`
      : `Match points successfully recorded for ${challengeName || "Ping Pong Match"}!`;
  }
  if (successPoints) {
    successPoints.textContent = isPending ? `+${pts || 1} Point (Pending Approval)` : `+${pts || 1} Point Added to Leaderboard!`;
  }

  codeResult.scrollIntoView({ behavior: "smooth", block: "center" });
}

function showScanError(msg) {
  if (!codeResult) return;
  codeResult.hidden = false;
  if (resultSuccess) resultSuccess.hidden = true;
  if (resultError) resultError.hidden = false;

  if (errorDesc) errorDesc.textContent = msg || "The entered code does not match any active game challenge or was already claimed.";
  codeResult.scrollIntoView({ behavior: "smooth", block: "center" });
}

let scanStream = null;
let scanTimer = null;

function stopScanner() {
  if (scanTimer) {
    clearInterval(scanTimer);
    scanTimer = null;
  }
  if (scanStream) {
    try {
      scanStream.getTracks().forEach((track) => {
        track.stop();
        track.enabled = false;
      });
    } catch {}
    scanStream = null;
  }
  if (video) {
    try {
      video.pause();
      video.srcObject = null;
    } catch {}
  }
  if (videoWrap) {
    videoWrap.hidden = true;
    videoWrap.style.display = "none";
  }
  if (startScanBtn) {
    startScanBtn.style.display = "";
    startScanBtn.disabled = false;
  }
}

startScanBtn?.addEventListener("click", async () => {
  if (!session.token) {
    setMsg(scanMsg, "Please log in with your club account first before scanning.", false);
    activateTab("visitor");
    return;
  }

  setMsg(scanMsg, "");
  if (!navigator.mediaDevices?.getUserMedia) {
    setMsg(scanMsg, "Camera access not supported on this browser. Please paste the code below.");
    return;
  }

  try {
    stopScanner();

    scanStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
    });
    if (video) {
      video.srcObject = scanStream;
      video.setAttribute("playsinline", "true");
      await video.play().catch(() => {});
    }
    if (videoWrap) {
      videoWrap.hidden = false;
      videoWrap.style.display = "block";
    }
    if (startScanBtn) {
      startScanBtn.style.display = "none";
    }

    scanTimer = setInterval(() => {
      if (video && video.readyState === video.HAVE_ENOUGH_DATA && window.jsQR) {
        const c = document.createElement("canvas");
        c.width = video.videoWidth;
        c.height = video.videoHeight;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(video, 0, 0, c.width, c.height);
        const imgData = ctx.getImageData(0, 0, c.width, c.height);
        const found = window.jsQR(imgData.data, imgData.width, imgData.height, {
          inversionAttempts: "dontInvert",
        });
        if (found && found.data) {
          // Immediately close camera automatically after scanning QR code
          stopScanner();
          submitScanCode(found.data);
        }
      }
    }, 200);
  } catch (err) {
    stopScanner();
    setMsg(scanMsg, "Could not open camera. Please allow permissions or paste code below.");
  }
});

stopScanBtn?.addEventListener("click", stopScanner);

manualSubmit?.addEventListener("click", () => {
  const code = manualCode ? manualCode.value.trim() : "";
  if (!code) {
    setMsg(scanMsg, "Please paste or type a code first.");
    return;
  }
  if (!session.token) {
    setMsg(scanMsg, "Please log in with your club account first.");
    activateTab("visitor");
    return;
  }
  stopScanner();
  submitScanCode(code);
  if (manualCode) manualCode.value = "";
});

async function submitScanCode(code) {
  // Ensure camera is fully stopped and hardware released immediately
  stopScanner();
  setMsg(scanMsg, "Verifying match code with arbiter...", true);
  try {
    const data = await api("scan", { method: "POST", body: { code } });
    stopScanner();
    setMsg(scanMsg, "");
    showScanSuccess(data.win, data.points, data.challenge);
    checkClubSession();
    loadLeaderboard();
  } catch (err) {
    stopScanner();
    setMsg(scanMsg, err.message, false);
    showScanError(err.message);
  }
}

$("#check-win")?.addEventListener("click", () => {
  activateTab("visitor");
});

// ========================================================
// 3. LEADERBOARD & PODIUM
// ========================================================
async function loadLeaderboard() {
  const podiumEl = $("#podium-area");
  const listEl = $("#ranking-list");
  const countEl = $("#members-count");
  const msgEl = $("#leaderboard-msg");

  try {
    const data = await api("leaderboard").catch(() => ({ rows: [] }));
    const rows = (data && data.rows && Array.isArray(data.rows)) ? data.rows : [];

    setMsg(msgEl, "");
    if (countEl) {
      countEl.textContent = rows.length === 0 ? "0 clubs registered" : `${rows.length} ${rows.length === 1 ? "club" : "clubs"} competing`;
    }

    const hasPoints = rows.some((r) => (Number(r.points) || 0) > 0);
    const top1 = rows[0] || null;
    const top2 = rows.length > 1 ? rows[1] : null;
    const top3 = rows.length > 2 ? rows[2] : null;

    if (podiumEl) {
      if (!hasPoints || rows.length === 0) {
        podiumEl.innerHTML = "";
        podiumEl.hidden = true;
        podiumEl.style.display = "none";
      } else {
        podiumEl.hidden = false;
        podiumEl.style.display = "flex";
        podiumEl.innerHTML = `
          <!-- 2nd Place: Left (Snow White) -->
          <div class="podium-col col-2">
            <div class="podium-user">
              <b class="user-name">${top2 ? escapeHtml(top2.name) : "-"}</b>
              <span class="user-pts">${top2 ? formatPoints(top2.points) : "0"} pts</span>
            </div>
            <div class="podium-pillar pillar-2">2</div>
          </div>

          <!-- 1st Place: Center (Leaf Green) -->
          <div class="podium-col col-1">
            <div class="podium-user">
              <b class="user-name">${top1 ? escapeHtml(top1.name) : "-"}</b>
              <span class="user-pts">${top1 ? formatPoints(top1.points) : "0"} pts</span>
            </div>
            <div class="podium-pillar pillar-1">1</div>
          </div>

          <!-- 3rd Place: Right (Fire Red) -->
          <div class="podium-col col-3">
            <div class="podium-user">
              <b class="user-name">${top3 ? escapeHtml(top3.name) : "-"}</b>
              <span class="user-pts">${top3 ? formatPoints(top3.points) : "0"} pts</span>
            </div>
            <div class="podium-pillar pillar-3">3</div>
          </div>
        `;
      }
    }

    // Complete clubs ranking list (places 1 through N in sequential / tied competition order)
    if (listEl) {
      if (rows.length === 0) {
        listEl.innerHTML = `
          <div style="text-align: center; padding: 42px 18px;">
            <p style="font-size: 16px; color: var(--snow); font-weight: 700; margin: 0 0 6px;">No Clubs Registered Yet</p>
            <p style="font-size: 13px; color: var(--muted); margin: 0; line-height: 1.6;">The tournament leaderboard is currently empty.<br>Clubs will appear here as soon as they sign up and record match results.</p>
          </div>
        `;
      } else {
        const maxPts = Math.max(1, ...rows.map(r => Number(r.points) || 0));

        // Compute official competition ranking with tied ranks for equal score and wins
        let currentRank = 1;
        rows.forEach((r, idx) => {
          if (idx > 0) {
            const prev = rows[idx - 1];
            const isTied = (Number(r.points) || 0) === (Number(prev.points) || 0) &&
                           (Number(r.wins) || 0) === (Number(prev.wins) || 0);
            if (!isTied) {
              currentRank = idx + 1;
            }
          }
          r.computedRank = currentRank;
        });

        listEl.innerHTML = rows
          .map((r) => {
            const placeNum = r.computedRank;
            const pts = Number(r.points) || 0;
            const pct = maxPts > 0 ? Math.min(100, Math.round((pts / maxPts) * 100)) : 0;
            const rankClass = placeNum === 1 && pts > 0 ? "rank-gold" : placeNum === 2 && pts > 0 ? "rank-silver" : placeNum === 3 && pts > 0 ? "rank-bronze" : "rank-standard";
            return `
            <div class="rank-item ${rankClass}">
              <div class="rank-num"><bdi dir="ltr">${placeNum}</bdi></div>
              <div class="rank-info">
                <div class="rank-header">
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <span class="rank-name">${escapeHtml(r.name)}</span>
                    ${r.slot ? `<span class="badge" style="font-size: 10px; padding: 1px 6px;">${escapeHtml(r.slot)}</span>` : ""}
                  </div>
                  <span class="rank-pts">${formatPoints(pts)} PTS</span>
                </div>
                <div class="rank-bar-track">
                  <div class="rank-bar-fill" style="width: ${pct}%;"></div>
                </div>
              </div>
            </div>
          `;
          })
          .join("");
      }
    }
  } catch (err) {
    setMsg(msgEl, "Could not load standings.");
  }
}

$("#refresh-leaderboard")?.addEventListener("click", loadLeaderboard);

// ========================================================
// 4. ADMIN & ARBITER SECTION (ACCESSED VIA 3-POINTS)
// ========================================================
const adminLoginBox = $("#admin-login");
const adminAreaBox = $("#admin-area");
const adminLoginMsg = $("#admin-login-msg");
const adminPass = $("#admin-pass");

function checkAdminAuth() {
  const token = adminToken.get();
  if (!token) {
    if (adminLoginBox) adminLoginBox.hidden = false;
    if (adminAreaBox) adminAreaBox.hidden = true;
  } else {
    if (adminLoginBox) adminLoginBox.hidden = true;
    if (adminAreaBox) adminAreaBox.hidden = false;
    loadAdmin();
  }
}

$("#admin-login-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const token = adminPass ? adminPass.value.trim() : "";
  if (!token) return;

  adminToken.set(token);
  setMsg(adminLoginMsg, "Verifying token...", true);

  try {
    await api("admin/challenges");
    setMsg(adminLoginMsg, "");
    checkAdminAuth();
  } catch {
    adminToken.set(null);
    setMsg(adminLoginMsg, "Invalid password. Enter the arbiter admin password.", false);
  }
});

$("#admin-logout")?.addEventListener("click", () => {
  adminToken.set(null);
  checkAdminAuth();
});

$("#refresh-admin")?.addEventListener("click", loadAdmin);

// Standard Tournament QR Codes (For all rounds)
const STD_WIN_CODE = "PINGPONG-WIN-1PT";

// Universal QR Code renderer (works with window.qrcode or SVG fallback)
function renderQRToElement(el, text, size = 190) {
  if (typeof el === "string") el = document.getElementById(el);
  if (!el || !text) return;
  if (typeof window.qrcode === "function") {
    try {
      const qr = window.qrcode(0, "M");
      qr.addData(String(text));
      qr.make();
      const cellSize = Math.max(3, Math.floor(size / 30));
      el.innerHTML = qr.createSvgTag(cellSize, 8);
      const svg = el.querySelector("svg");
      if (svg) {
        svg.style.width = size + "px";
        svg.style.height = size + "px";
        svg.style.display = "block";
        svg.style.margin = "0 auto";
      }
      return;
    } catch (e) {
      console.warn("QR SVG render error:", e);
    }
  }
  // Static SVG fallback
  if (text === STD_WIN_CODE || text === "CHESS-WIN-2PTS") {
    el.innerHTML = `<img src="./win_qr.svg" alt="Winner QR (+1 pt)" style="width:${size}px; height:${size}px; display:block; margin:0 auto;"/>`;
    return;
  }
}

// Global window.QRCode constructor compatibility
window.QRCode = function (holder, options) {
  const text = typeof options === "string" ? options : options?.text || "";
  const size = options?.width || 190;
  renderQRToElement(holder, text, size);
};
window.QRCode.CorrectLevel = { L: "L", M: "M", Q: "Q", H: "H" };

function renderStandardQRs() {
  const winHolder = document.getElementById("standard-win-holder");
  const projWin = document.getElementById("projector-win-holder");

  if (winHolder && !winHolder.querySelector("img") && !winHolder.querySelector("svg")) {
    renderQRToElement(winHolder, STD_WIN_CODE, 190);
  }
  if (projWin && !projWin.querySelector("img") && !projWin.querySelector("svg")) {
    renderQRToElement(projWin, STD_WIN_CODE, 220);
  }
}

function downloadQRFromHolder(holderId, filename) {
  const holder = document.getElementById(holderId);
  if (!holder) return;
  const canvas = holder.querySelector("canvas");
  const img = holder.querySelector("img");
  let url = "";
  if (canvas) {
    url = canvas.toDataURL("image/png");
  } else if (img && img.src) {
    url = img.src;
  }
  if (!url) return;
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "pingpong_qr.png";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// Copy and Download Event Listeners for Standard Station
document.getElementById("btn-copy-std-win")?.addEventListener("click", () => {
  navigator.clipboard?.writeText(STD_WIN_CODE);
  const btn = document.getElementById("btn-copy-std-win");
  if (btn) {
    btn.textContent = "Copied!";
    setTimeout(() => (btn.textContent = "Copy Code"), 2000);
  }
});

document.getElementById("btn-download-std-win")?.addEventListener("click", () => {
  downloadQRFromHolder("standard-win-holder", "pingpong_winner_qr_1pt.png");
});

// Fullscreen Projector Modal controls
const projModal = document.getElementById("tournament-projector-modal");
document.getElementById("btn-project-qrs")?.addEventListener("click", () => {
  if (projModal) {
    projModal.hidden = false;
    renderStandardQRs();
  }
});

document.getElementById("close-projector-modal")?.addEventListener("click", () => {
  if (projModal) projModal.hidden = true;
});

async function loadAdmin() {
  renderStandardQRs();
  await Promise.all([loadAdminChallenges(), loadAdminWins(), loadAdminClubs()]);
}

// Dynamic Round Matchups for Admin Generator (Single Table: 3 Sequential Matches per Round)
const ROUND_MATCHUPS = {
  "Round 1 (Opening Clash)": ["Match 1 (T1 vs T6)", "Match 2 (T2 vs T5)", "Match 3 (T3 vs T4)"],
  "Round 2 (Rotation Stage)": ["Match 1 (T5 vs T3)", "Match 2 (T1 vs T2)", "Match 3 (T6 vs T4)"],
  "Round 3 (Mid-Tournament Battle)": ["Match 1 (T4 vs T2)", "Match 2 (T5 vs T6)", "Match 3 (T3 vs T1)"],
  "Round 4 (Championship Push)": ["Match 1 (T2 vs T6)", "Match 2 (T1 vs T4)", "Match 3 (T3 vs T5)"],
  "Round 5 (The Grand Finale)": ["Match 1 (T1 vs T5)", "Match 2 (T6 vs T3)", "Match 3 (T4 vs T2)"],
};

const roundSelect = $("#admin-round-select");
const matchSelect = $("#admin-match-select");

roundSelect?.addEventListener("change", () => {
  const round = roundSelect.value;
  const matches = ROUND_MATCHUPS[round] || ["Match 1 (T1 vs T6)", "Match 2 (T2 vs T5)", "Match 3 (T3 vs T4)"];
  if (matchSelect) {
    matchSelect.innerHTML = matches.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("");
  }
});

// Quick 1-click generator for Match Winner (+1 pt)
$("#btn-admin-win-qr")?.addEventListener("click", () => {
  const round = roundSelect?.value || "Round 1 (Opening Clash)";
  const match = matchSelect?.value || "Match 1 (T1 vs T6)";
  createAdminChallenge(`${round} - ${match} (WIN)`, 1, "win");
});

async function createAdminChallenge(name, points, outcome) {
  const msgEl = $("#challenge-msg");
  try {
    const data = await api("admin/generate-qr", {
      method: "POST",
      body: { title: name, outcome, points },
    });
    setMsg(msgEl, `QR Generated for ${name} (+${points} pt)!`, true);
    displayAdminLiveQR(data.challenge, data.qrPayload);
    loadAdminChallenges();
  } catch (err) {
    setMsg(msgEl, err.message, false);
  }
}

function displayAdminLiveQR(challenge, payload) {
  const card = $("#admin-live-qr-card");
  const holder = $("#admin-qr-holder");
  const title = $("#live-qr-title");
  const badge = $("#live-qr-badge");
  const code = $("#live-qr-code");

  if (!card || !holder) return;

  if (badge) {
    badge.className = "badge confirmed";
    badge.textContent = "+1 Point Winner";
  }
  if (title) title.textContent = challenge.name;
  if (code) code.textContent = challenge.id;

  holder.innerHTML = "";
  if (window.QRCode) {
    new window.QRCode(holder, {
      text: payload || challenge.payload || challenge.id,
      width: 220,
      height: 220,
      colorDark: "#171A1F",
      colorLight: "#FFFFFF",
      correctLevel: window.QRCode.CorrectLevel.H,
    });
  }

  card.hidden = false;
  card.scrollIntoView({ behavior: "smooth", block: "center" });
}

$("#close-live-qr")?.addEventListener("click", () => {
  const card = $("#admin-live-qr-card");
  if (card) card.hidden = true;
});

async function loadAdminChallenges() {
  const list = $("#challenge-list");
  if (!list) return;

  try {
    const data = await api("admin/challenges");
    const challenges = data.challenges || [];

    if (challenges.length === 0) {
      list.innerHTML = `<p class="hint">No match QR codes generated yet.</p>`;
      return;
    }

    list.innerHTML = challenges
      .slice(0, 8)
      .map((c) => {
        const isWin = c.outcome === "win";
        return `
        <div class="card" style="padding: 14px; margin-bottom: 8px;">
          <div class="row between">
            <div>
              <strong style="color: var(--snow); font-size: 14px;">${escapeHtml(c.name)}</strong>
              <div style="font-size: 11px; color: var(--muted);">ID: <code>${escapeHtml(c.id)}</code> &bull; Claims: ${c.claimedCount || 0} / ${c.maxClaims || 1}</div>
            </div>
            <div style="display: flex; gap: 6px;">
              <button type="button" class="chip" onclick='showQRCard(${JSON.stringify(JSON.stringify(c))})'>Show QR</button>
              <button type="button" class="chip" onclick="deleteQR('${c.id}')">&times;</button>
            </div>
          </div>
        </div>
      `;
      })
      .join("");
  } catch {}
}

window.showQRCard = function (cJson) {
  try {
    const c = JSON.parse(cJson);
    displayAdminLiveQR(c, c.payload);
  } catch {}
};

window.deleteQR = async function (id) {
  if (!confirm("Delete this match code?")) return;
  try {
    await api(`admin/challenges/${id}`, { method: "DELETE" });
    loadAdminChallenges();
  } catch (err) {
    alert(err.message);
  }
};

// Wins / Scans Log
async function loadAdminWins() {
  const list = $("#win-list");
  const filter = $("#win-filter")?.value || "";
  const msgEl = $("#win-msg");
  if (!list) return;

  try {
    const data = await api(`admin/wins?status=${encodeURIComponent(filter)}`);
    const wins = data.wins || [];

    // Also check total pending wins to show batch approve button
    const allWinsData = filter === "" ? data : await api("admin/wins").catch(() => ({ wins: [] }));
    const allPending = (allWinsData.wins || []).filter((w) => w.status === "pending");
    const approveAllBtn = $("#btn-approve-all-pending");
    if (approveAllBtn) {
      if (allPending.length > 0) {
        approveAllBtn.hidden = false;
        approveAllBtn.textContent = `Approve All Pending (${allPending.length})`;
      } else {
        approveAllBtn.hidden = true;
      }
    }

    if (wins.length === 0) {
      list.innerHTML = `<p class="hint" style="padding: 12px 0;">No match submissions found${filter ? ` with status '${filter}'` : ""}.</p>`;
      return;
    }

    list.innerHTML = wins
      .map((w) => {
        const timeStr = w.createdAt ? new Date(w.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
        const isPending = w.status === "pending";
        return `
        <div class="win" style="${isPending ? "background: rgba(245, 158, 11, 0.08); border-left: 3px solid #f59e0b; padding: 12px 14px; border-radius: 12px; margin-bottom: 8px;" : "padding: 12px 0; border-bottom: 1px solid var(--line);"}">
          <div>
            <strong style="color: var(--snow); font-size: 14px;">${escapeHtml(w.clubName || w.username)}</strong>: ${escapeHtml(w.challenge || "Match")} (+${w.points} pts)
            <div style="font-size: 11px; color: var(--muted); margin-top: 3px;">${timeStr} &bull; Status: <span class="badge ${w.status}">${w.status}</span></div>
          </div>
          <div class="win-actions">
            ${
              w.status !== "confirmed"
                ? `<button type="button" class="chip" style="background: var(--green); color: var(--navy); font-weight: 800; border: none; padding: 5px 14px;" onclick="setWinStatus('${w.id}', 'confirmed')" title="Confirm & Award Points to Leaderboard">Approve</button>`
                : ""
            }
            ${
              w.status !== "rejected"
                ? `<button type="button" class="chip" style="color: var(--red); border-color: rgba(223, 51, 49, 0.4); padding: 5px 12px;" onclick="setWinStatus('${w.id}', 'rejected')" title="Reject">Reject</button>`
                : ""
            }
            <button type="button" class="chip" style="padding: 5px 10px;" onclick="deleteWin('${w.id}')" title="Delete">&times;</button>
          </div>
        </div>
      `;
      })
      .join("");
  } catch (err) {
    setMsg(msgEl, "Could not load wins.");
  }
}

$("#win-filter")?.addEventListener("change", loadAdminWins);
$("#refresh-wins")?.addEventListener("click", loadAdminWins);

window.approveAllPendingWins = async function () {
  if (!confirm("Confirm and approve all pending match submissions? Points will be added to the leaderboard.")) return;
  try {
    const res = await api("admin/wins-approve-all", { method: "POST" });
    setMsg($("#win-msg"), `Approved ${res.approvedCount || 0} match submissions! Points updated.`, true);
    loadAdminWins();
    loadLeaderboard();
  } catch (err) {
    alert(err.message);
  }
};

window.setWinStatus = async function (id, status) {
  try {
    await api(`admin/wins/${id}`, { method: "POST", body: { status } });
    loadAdminWins();
    loadLeaderboard();
  } catch (err) {
    alert(err.message);
  }
};

window.deleteWin = async function (id) {
  if (!confirm("Delete this submission?")) return;
  try {
    await api(`admin/wins/${id}`, { method: "DELETE" });
    loadAdminWins();
    loadLeaderboard();
  } catch (err) {
    alert(err.message);
  }
};

// 6 Clubs Manager
async function loadAdminClubs() {
  const container = $("#admin-clubs-list");
  if (!container) return;

  try {
    const data = await api("clubs");
    const clubs = data.clubs || [];

    if (clubs.length === 0) {
      container.innerHTML = `<p class="hint" style="grid-column: 1 / -1; padding: 14px 0; text-align: center;">No clubs registered yet.</p>`;
      return;
    }

    container.innerHTML = clubs
      .map(
        (c) => `
      <div style="background: rgba(248, 250, 249, 0.04); border: 1px solid var(--line); border-radius: 14px; padding: 12px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
          <strong style="color: var(--snow);">${escapeHtml(c.name)}</strong>
          <span style="font-size: 11px; color: var(--muted);">@${escapeHtml(c.username)}</span>
        </div>
        <div style="display: flex; gap: 6px; margin-bottom: 6px;">
          <input type="text" id="rename-${c.id}" value="${escapeHtml(c.name)}" style="flex: 1; padding: 6px 10px; background: rgba(0,0,0,0.3); border: 1px solid var(--line); border-radius: 8px; color: var(--snow); font-size: 12px;">
          <button type="button" class="chip" onclick="renameClub('${c.id}')" style="padding: 4px 10px; font-size: 11px;">Rename</button>
        </div>
        <div style="display: flex; gap: 6px;">
          <input type="password" id="pass-${c.id}" placeholder="New Password" style="flex: 1; padding: 6px 10px; background: rgba(0,0,0,0.3); border: 1px solid var(--line); border-radius: 8px; color: var(--snow); font-size: 12px;">
          <button type="button" class="chip" onclick="setClubPass('${c.id}')" style="padding: 4px 10px; font-size: 11px;">Set Pass</button>
        </div>
      </div>
    `
      )
      .join("");
  } catch {}
}

window.renameClub = async function (id) {
  const input = $(`#rename-${id}`);
  const name = input ? input.value.trim() : "";
  if (!name) return;

  try {
    await api("admin/clubs", { method: "POST", body: { id, name } });
    alert("Club renamed!");
    loadAdminClubs();
    loadLeaderboard();
  } catch (err) {
    alert(err.message);
  }
};

window.setClubPass = async function (id) {
  const input = $(`#pass-${id}`);
  const pass = input ? input.value.trim() : "";
  if (!pass || pass.length < 5) {
    alert("Password must be at least 5 characters.");
    return;
  }

  try {
    await api("admin/clubs", { method: "POST", body: { id, password: pass } });
    alert("Password updated!");
    if (input) input.value = "";
  } catch (err) {
    alert(err.message);
  }
};

$("#btn-reset-tournament")?.addEventListener("click", async () => {
  if (!confirm("Reset ALL scores and match scans to 0?")) return;
  try {
    await api("admin/reset", { method: "POST" });
    alert("Tournament scores reset to 0!");
    loadAdmin();
    loadLeaderboard();
  } catch (err) {
    alert(err.message);
  }
});

// ========================================================
// 5. ATMOSPHERE PARTICLES CANVAS (ORIGINAL THEME PRESERVED)
// ========================================================
(function initAtmosphere() {
  const canvas = $("#atmosphere-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  let width = 0;
  let height = 0;

  function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener("resize", resize);

  const EMBER_COUNT = Math.max(70, Math.round(window.innerWidth / 16));
  const TYPES = ["ember", "spark", "wisp"];

  function pickColor() {
    const roll = Math.random();
    if (roll < 0.55) return { r: 121, g: 174, b: 68 }; // Green
    if (roll < 0.85) return { r: 223, g: 51, b: 49 }; // Red
    return { r: 248, g: 250, b: 249 }; // Snow White
  }

  class Particle {
    constructor(initialSpread) { this.reset(initialSpread); }

    reset(initialSpread = false) {
      this.type = TYPES[Math.floor(Math.random() * TYPES.length)];
      this.x = Math.random() * width;
      this.y = initialSpread ? Math.random() * height : height + Math.random() * 40;

      if (this.type === "wisp") {
        this.radius = 2.5 + Math.random() * 3.5;
        this.speedY = 0.15 + Math.random() * 0.3;
        this.baseAlpha = 0.25 + Math.random() * 0.3;
        this.shadowBlur = 18;
        this.wanderAmp = 0.5 + Math.random() * 1.0;
      } else if (this.type === "spark") {
        this.radius = 0.6 + Math.random() * 1.0;
        this.speedY = 0.5 + Math.random() * 0.9;
        this.baseAlpha = 0.7 + Math.random() * 0.3;
        this.shadowBlur = 5;
        this.wanderAmp = 0.2 + Math.random() * 0.5;
      } else {
        this.radius = 1.0 + Math.random() * 2.2;
        this.speedY = 0.25 + Math.random() * 0.55;
        this.baseAlpha = 0.55 + Math.random() * 0.4;
        this.shadowBlur = 10;
        this.wanderAmp = 0.35 + Math.random() * 0.75;
      }

      this.wanderSpeed = 0.003 + Math.random() * 0.009;
      this.flickerSpeed = 0.025 + Math.random() * 0.06;
      this.phase = Math.random() * Math.PI * 2;
      this.step = Math.random() * 200;
      this.flick = Math.random() * 200;
      this.driftX = (Math.random() - 0.5) * 0.06;

      const c = pickColor();
      this.r = c.r; this.g = c.g; this.b = c.b;
    }

    update() {
      this.step += this.wanderSpeed;
      this.flick += this.flickerSpeed;
      this.y -= this.speedY;
      this.x += Math.sin(this.step + this.phase) * this.wanderAmp + this.driftX;
      if (this.y < -20 || this.x < -40 || this.x > width + 40) this.reset();
    }

    draw() {
      const flicker = 0.8 + Math.sin(this.flick + this.phase) * 0.2;
      const topFade = Math.min(1, this.y / (height * 0.10));
      const bottomFade = Math.min(1, (height - this.y) / (height * 0.03));
      const fade = Math.min(topFade, bottomFade);

      const a = Math.max(0, Math.min(1, this.baseAlpha * flicker * fade));
      if (a < 0.01) return;

      ctx.save();
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${this.r},${this.g},${this.b},${a})`;
      ctx.shadowBlur = this.shadowBlur;
      ctx.shadowColor = `rgba(${this.r},${this.g},${this.b},${a * 0.9})`;
      ctx.fill();
      ctx.restore();
    }
  }

  let particles = Array.from({ length: EMBER_COUNT }, () => new Particle(true));

  window.addEventListener("resize", () => {
    resize();
    const newCount = Math.max(60, Math.round(window.innerWidth / 18));
    if (Math.abs(newCount - particles.length) > 10) {
      particles = Array.from({ length: newCount }, () => new Particle(true));
    }
  });

  function animate() {
    ctx.clearRect(0, 0, width, height);
    for (const p of particles) { p.update(); p.draw(); }
    requestAnimationFrame(animate);
  }
  animate();
})();

// ========================================================
// INITIAL LOAD
// ========================================================
window.addEventListener("DOMContentLoaded", () => {
  checkClubSession();
  loadLeaderboard();
  checkAdminAuth();
  activateTab("conditions");
});
