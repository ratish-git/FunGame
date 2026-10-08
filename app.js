/* ============================================================
   Ratish & Sohani — Gender Reveal
   Single-page app. Shared data via Supabase (free tier).
   Falls back to localStorage when Supabase isn't configured.
   ============================================================ */

(function () {
  "use strict";

  const CFG = window.APP_CONFIG || {};
  const SETTINGS_ID = 1; // single row holding the current answer

  // ---- Supabase client (optional) ----
  let sb = null;
  const supabaseReady =
    CFG.SUPABASE_URL &&
    CFG.SUPABASE_ANON_KEY &&
    !CFG.SUPABASE_URL.startsWith("YOUR_") &&
    window.supabase;

  if (supabaseReady) {
    sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
  } else {
    console.warn(
      "Supabase not configured — running in local-only mode. " +
        "Wishes and the answer will NOT be shared across devices until you set SUPABASE_URL/KEY in config.js."
    );
  }

  // ---- State ----
  const state = {
    name: "",
    answer: (CFG.DEFAULT_ANSWER || "girl").toLowerCase(),
    revealed: false,
  };

  // ---- Element helpers ----
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const show = (el) => el && el.removeAttribute("hidden");
  const hide = (el) => el && el.setAttribute("hidden", "");

  function showStep(id) {
    $$("#guest-view .step").forEach(hide);
    show($(id));
  }

  // ============================================================
  //  DATA LAYER (Supabase or localStorage fallback)
  // ============================================================

  async function fetchAnswer() {
    if (sb) {
      try {
        const { data, error } = await sb
          .from("settings")
          .select("answer")
          .eq("id", SETTINGS_ID)
          .single();
        if (!error && data && data.answer) return data.answer.toLowerCase();
      } catch (e) {
        console.error("fetchAnswer failed", e);
      }
    }
    const local = localStorage.getItem("gr_answer");
    return (local || CFG.DEFAULT_ANSWER || "girl").toLowerCase();
  }

  async function saveAnswer(answer) {
    answer = answer.toLowerCase();
    localStorage.setItem("gr_answer", answer);
    if (sb) {
      const { error } = await sb
        .from("settings")
        .upsert({ id: SETTINGS_ID, answer }, { onConflict: "id" });
      if (error) {
        console.error("saveAnswer failed", error);
        return false;
      }
    }
    return true;
  }

  async function fetchWishes() {
    if (sb) {
      try {
        const { data, error } = await sb
          .from("wishes")
          .select("name, message, created_at")
          .order("created_at", { ascending: false });
        if (!error && data) return data;
      } catch (e) {
        console.error("fetchWishes failed", e);
      }
    }
    try {
      return JSON.parse(localStorage.getItem("gr_wishes") || "[]");
    } catch {
      return [];
    }
  }

  async function addWish(name, message) {
    const row = { name, message, created_at: new Date().toISOString() };
    // local fallback copy
    try {
      const list = JSON.parse(localStorage.getItem("gr_wishes") || "[]");
      list.unshift(row);
      localStorage.setItem("gr_wishes", JSON.stringify(list));
    } catch {}
    if (sb) {
      const { error } = await sb.from("wishes").insert({ name, message });
      if (error) {
        console.error("addWish failed", error);
        return false;
      }
    }
    return true;
  }

  // ============================================================
  //  GUEST FLOW
  // ============================================================

  function setGreeting() {
    $$(".guest-greet").forEach((el) => (el.textContent = state.name));
  }

  // Step 1: name
  $("#name-continue").addEventListener("click", () => {
    const val = $("#guest-name").value.trim();
    if (!val) {
      show($("#name-error"));
      return;
    }
    hide($("#name-error"));
    state.name = val;
    setGreeting();
    showStep("#step-choose");
  });
  $("#guest-name").addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("#name-continue").click();
  });

  // Step 2: choose reveal mode
  $$("#step-choose .choice").forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.mode;
      if (mode === "balloon") {
        buildBalloons();
        showStep("#step-balloon");
      } else {
        showStep("#step-scratch");
        // build after visible so canvas has size
        requestAnimationFrame(buildScratch);
      }
    });
  });

  // ---- Balloon pop ----
  const BALLOON_COLORS = ["#ff6fa5", "#6fb7ff", "#ffd166", "#8ce99a", "#b197fc", "#ffa94d"];

  function balloonSVG(color) {
    return `
      <svg viewBox="0 0 70 90" xmlns="http://www.w3.org/2000/svg">
        <ellipse cx="35" cy="38" rx="30" ry="36" fill="${color}" />
        <ellipse cx="25" cy="26" rx="8" ry="12" fill="rgba(255,255,255,0.35)" />
        <polygon points="35,72 30,80 40,80" fill="${color}" />
        <line x1="35" y1="80" x2="35" y2="90" stroke="#aaa" stroke-width="1.5" />
      </svg>`;
  }

  function buildBalloons() {
    const field = $("#balloon-field");
    field.innerHTML = "";
    const total = 9;
    const winner = Math.floor(Math.random() * total);
    for (let i = 0; i < total; i++) {
      const b = document.createElement("button");
      b.className = "balloon";
      b.style.animationDelay = (i % 3) * 0.3 + "s";
      b.innerHTML = balloonSVG(BALLOON_COLORS[i % BALLOON_COLORS.length]);
      b.setAttribute("aria-label", "Balloon");
      b.addEventListener("click", () => popBalloon(b, i === winner));
      field.appendChild(b);
    }
  }

  function popBalloon(btn, isWinner) {
    btn.classList.add("popped");
    burstConfetti(40);
    if (isWinner) {
      setTimeout(() => doReveal(), 350);
    }
  }

  // ---- Scratch card ----
  function buildScratch() {
    const canvas = $("#scratch-canvas");
    const result = $("#scratch-result");
    const ctx = canvas.getContext("2d");

    // Match the canvas drawing buffer to its actual rendered size so that
    // touch/mouse coordinates line up exactly on any screen size.
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const cssW = rect.width || 320;
    const cssH = rect.height || 200;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.scale(dpr, dpr); // now we can draw using CSS pixel units

    // Brush radius scales a little with screen size
    const brush = Math.max(18, Math.min(28, cssW / 12));

    // underlying result styled by answer
    const isBoy = state.answer === "boy";
    result.innerHTML = `<div style="font-size:52px">${isBoy ? "👦" : "👧"}</div>
      <div class="${isBoy ? "theme-boy" : "theme-girl"}">${isBoy ? "It's a Boy!" : "It's a Girl!"}</div>`;

    // scratch-off cover (drawn in CSS-pixel coordinates)
    ctx.fillStyle = "#c9a0dc";
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = "bold 20px Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Scratch here!", cssW / 2, cssH / 2);
    ctx.globalCompositeOperation = "destination-out";

    let drawing = false;
    let cleared = false;

    const pos = (e) => {
      const r = canvas.getBoundingClientRect();
      const p = e.touches && e.touches[0] ? e.touches[0] : e;
      // scale pointer position into the canvas's CSS-pixel space
      return {
        x: ((p.clientX - r.left) / r.width) * cssW,
        y: ((p.clientY - r.top) / r.height) * cssH,
      };
    };
    const scratch = (e) => {
      if (!drawing) return;
      const { x, y } = pos(e);
      ctx.beginPath();
      ctx.arc(x, y, brush, 0, Math.PI * 2);
      ctx.fill();
      if (!cleared && clearedEnough(ctx, canvas)) {
        cleared = true;
        setTimeout(() => doReveal(), 300);
      }
    };

    const start = (e) => { drawing = true; scratch(e); };
    const end = () => { drawing = false; };

    canvas.addEventListener("mousedown", start);
    canvas.addEventListener("mousemove", scratch);
    window.addEventListener("mouseup", end);
    canvas.addEventListener("touchstart", (e) => { e.preventDefault(); start(e); });
    canvas.addEventListener("touchmove", (e) => { e.preventDefault(); scratch(e); });
    canvas.addEventListener("touchend", end);
  }

  function clearedEnough(ctx, canvas) {
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let clear = 0;
    for (let i = 3; i < img.length; i += 40) {
      if (img[i] === 0) clear++;
    }
    return clear / (img.length / 40) > 0.5;
  }

  // ---- Reveal ----
  function doReveal() {
    if (state.revealed) return;
    state.revealed = true;
    const isBoy = state.answer === "boy";
    $("#reveal-badge").textContent = isBoy ? "👦" : "👧";
    const title = $("#reveal-title");
    title.textContent = isBoy ? "It's a Boy! 💙" : "It's a Girl! 💗";
    title.className = isBoy ? "theme-boy" : "theme-girl";
    $("#reveal-sub").textContent = "Ratish & Sohani can't wait to meet their little one!";
    showStep("#step-reveal");
    bigCelebration(isBoy);
  }

  $("#to-wish").addEventListener("click", () => showStep("#step-wish"));

  // Step 5: submit wish
  $("#submit-wish").addEventListener("click", async () => {
    const msg = $("#wish-text").value.trim();
    const statusEl = $("#wish-status");
    if (!msg) {
      statusEl.textContent = "Please write a short wish first.";
      statusEl.className = "status error";
      show(statusEl);
      return;
    }
    $("#submit-wish").disabled = true;
    statusEl.textContent = "Sending…";
    statusEl.className = "status";
    show(statusEl);

    const ok = await addWish(state.name, msg);
    $("#submit-wish").disabled = false;
    if (!ok) {
      statusEl.textContent = "Could not save. Please try again.";
      statusEl.className = "status error";
      return;
    }
    await renderWall("#wish-wall");
    showStep("#step-thanks");
    burstConfetti(60);
  });

  async function renderWall(sel) {
    const wall = $(sel);
    wall.innerHTML = "<li class='empty'>Loading wishes…</li>";
    const wishes = await fetchWishes();
    if (!wishes.length) {
      wall.innerHTML = "<li class='empty'>No wishes yet. Be the first! 💌</li>";
      return;
    }
    wall.innerHTML = "";
    wishes.forEach((w) => {
      const li = document.createElement("li");
      const name = document.createElement("span");
      name.className = "wish-name";
      name.textContent = w.name || "Someone";
      const msg = document.createElement("span");
      msg.className = "wish-msg";
      msg.textContent = w.message || "";
      li.appendChild(name);
      li.appendChild(msg);
      wall.appendChild(li);
    });
  }

  // ============================================================
  //  ADMIN
  // ============================================================
  const adminView = $("#admin-view");

  $("#open-admin").addEventListener("click", () => {
    hide($("#guest-view"));
    show(adminView);
  });
  $("#close-admin").addEventListener("click", () => {
    hide(adminView);
    show($("#guest-view"));
  });

  $("#admin-login-btn").addEventListener("click", () => {
    const pass = $("#admin-pass").value;
    if (pass === (CFG.ADMIN_PASSWORD || "")) {
      hide($("#admin-error"));
      hide($("#admin-login"));
      show($("#admin-panel"));
      refreshAdmin();
    } else {
      show($("#admin-error"));
    }
  });
  $("#admin-pass").addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("#admin-login-btn").click();
  });

  $$(".answer-choice").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const answer = btn.dataset.answer;
      $$(".answer-choice").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const ok = await saveAnswer(answer);
      state.answer = answer;
      const statusEl = $("#answer-status");
      $("#current-answer").textContent = answer;
      statusEl.className = ok ? "status" : "status error";
      if (!ok) statusEl.textContent = "Saved locally only (Supabase error).";
    });
  });

  $("#refresh-wishes").addEventListener("click", () => renderWall("#admin-wish-wall"));

  async function refreshAdmin() {
    const answer = await fetchAnswer();
    state.answer = answer;
    $("#current-answer").textContent = answer;
    $$(".answer-choice").forEach((b) =>
      b.classList.toggle("active", b.dataset.answer === answer)
    );
    await renderWall("#admin-wish-wall");
  }

  // ============================================================
  //  CONFETTI
  // ============================================================
  const canvas = $("#confetti-canvas");
  const cctx = canvas.getContext("2d");
  let pieces = [];
  let rafId = null;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener("resize", resize);
  resize();

  function burstConfetti(count) {
    for (let i = 0; i < count; i++) {
      pieces.push({
        x: Math.random() * canvas.width,
        y: -20,
        r: 4 + Math.random() * 6,
        c: BALLOON_COLORS[(Math.random() * BALLOON_COLORS.length) | 0],
        vx: (Math.random() - 0.5) * 4,
        vy: 2 + Math.random() * 4,
        rot: Math.random() * 360,
        vr: (Math.random() - 0.5) * 20,
      });
    }
    if (!rafId) loop();
  }

  function bigCelebration(isBoy) {
    const themed = isBoy
      ? ["#6fb7ff", "#cfe8ff", "#ffffff", "#4dabf7"]
      : ["#ff6fa5", "#ffd1e8", "#ffffff", "#f783ac"];
    for (let i = 0; i < 160; i++) {
      pieces.push({
        x: Math.random() * canvas.width,
        y: -20 - Math.random() * canvas.height,
        r: 4 + Math.random() * 7,
        c: themed[(Math.random() * themed.length) | 0],
        vx: (Math.random() - 0.5) * 5,
        vy: 2 + Math.random() * 5,
        rot: Math.random() * 360,
        vr: (Math.random() - 0.5) * 20,
      });
    }
    if (!rafId) loop();
  }

  function loop() {
    cctx.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      cctx.save();
      cctx.translate(p.x, p.y);
      cctx.rotate((p.rot * Math.PI) / 180);
      cctx.fillStyle = p.c;
      cctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.6);
      cctx.restore();
    });
    pieces = pieces.filter((p) => p.y < canvas.height + 30);
    if (pieces.length) {
      rafId = requestAnimationFrame(loop);
    } else {
      cctx.clearRect(0, 0, canvas.width, canvas.height);
      rafId = null;
    }
  }

  // ============================================================
  //  INIT
  // ============================================================
  (async function init() {
    state.answer = await fetchAnswer();
    showStep("#step-name");
  })();
})();
