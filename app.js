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

  // Stable per-device/person id so a guest can see only their own wishes.
  function getDeviceId() {
    let id = localStorage.getItem("gr_device_id");
    if (!id) {
      id =
        (crypto.randomUUID && crypto.randomUUID()) ||
        "d-" + Date.now() + "-" + Math.random().toString(36).slice(2);
      localStorage.setItem("gr_device_id", id);
    }
    return id;
  }

  async function addWish(name, message) {
    const deviceId = getDeviceId();
    const row = {
      name,
      message,
      device_id: deviceId,
      created_at: new Date().toISOString(),
    };
    // local fallback copy
    try {
      const list = JSON.parse(localStorage.getItem("gr_wishes") || "[]");
      list.unshift(row);
      localStorage.setItem("gr_wishes", JSON.stringify(list));
    } catch {}
    if (sb) {
      const { error } = await sb
        .from("wishes")
        .insert({ name, message, device_id: deviceId });
      if (error) {
        console.error("addWish failed", error);
        return false;
      }
    }
    return true;
  }

  // Only the wishes created from THIS device (what a guest may see).
  async function fetchMyWishes() {
    const deviceId = getDeviceId();
    if (sb) {
      try {
        const { data, error } = await sb
          .from("wishes")
          .select("name, message, created_at")
          .eq("device_id", deviceId)
          .order("created_at", { ascending: false });
        if (!error && data) return data;
      } catch (e) {
        console.error("fetchMyWishes failed", e);
      }
    }
    try {
      const list = JSON.parse(localStorage.getItem("gr_wishes") || "[]");
      return list.filter((w) => w.device_id === deviceId);
    } catch {
      return [];
    }
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

  // ---- Kulo / Kalash tap (festive Bengali palette) ----
  // Marigold, maroon, gold, terracotta, green leaf — the colours of a Bengali celebration.
  const BALLOON_COLORS = ["#f5a623", "#e67e22", "#c0392b", "#e9b949", "#2e7d32", "#8e24aa"];

  // A decorated kalash (pot) with mango leaves and a coconut, set on a kulo (fan).
  function balloonSVG(color) {
    return `
      <svg viewBox="0 0 90 110" xmlns="http://www.w3.org/2000/svg">
        <!-- kulo (winnowing fan) backdrop -->
        <ellipse cx="45" cy="70" rx="42" ry="34" fill="#e9c37a" stroke="#b8862f" stroke-width="2"/>
        <ellipse cx="45" cy="70" rx="42" ry="34" fill="none" stroke="#fff3d6" stroke-width="1" stroke-dasharray="3 4"/>
        <!-- kalash (pot) -->
        <path d="M30 58 Q25 40 45 38 Q65 40 60 58 L58 86 Q45 94 32 86 Z" fill="${color}" stroke="#7a0f2b" stroke-width="2"/>
        <rect x="31" y="52" width="28" height="6" rx="3" fill="#e9b949"/>
        <!-- swastika/dot motif on the pot -->
        <circle cx="45" cy="70" r="4" fill="#fff3d6"/>
        <!-- mango leaves around the rim -->
        <path d="M34 40 Q28 30 36 26 Q40 34 38 42 Z" fill="#2e7d32"/>
        <path d="M56 40 Q62 30 54 26 Q50 34 52 42 Z" fill="#2e7d32"/>
        <path d="M45 38 Q45 26 45 22" stroke="#2e7d32" stroke-width="2" fill="none"/>
        <!-- coconut on top -->
        <ellipse cx="45" cy="20" rx="9" ry="10" fill="#8d5a2b" stroke="#5c3a1a" stroke-width="1.5"/>
        <path d="M45 11 Q48 6 45 2 Q42 6 45 11" fill="#5c3a1a"/>
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
      b.setAttribute("aria-label", "Decorated kulo and kalash");
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

    // scratch-off cover styled like a nimontron patra (invitation)
    const grad = ctx.createLinearGradient(0, 0, cssW, cssH);
    grad.addColorStop(0, "#7a0f2b");
    grad.addColorStop(1, "#5c0a20");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, cssW, cssH);
    // gold border hint
    ctx.strokeStyle = "rgba(233,185,73,0.9)";
    ctx.lineWidth = 3;
    ctx.strokeRect(8, 8, cssW - 16, cssH - 16);
    ctx.fillStyle = "#f4d58d";
    ctx.font = "bold 22px 'Noto Serif Bengali', serif";
    ctx.textAlign = "center";
    ctx.fillText("নিমন্ত্রণ", cssW / 2, cssH / 2 - 8);
    ctx.font = "600 14px 'Segoe UI', sans-serif";
    ctx.fillText("Scratch to reveal", cssW / 2, cssH / 2 + 16);
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
    const bn = $("#reveal-bn");
    if (bn) {
      bn.textContent = isBoy ? "চ্ছেলে হবে! 💙" : "মেয়ে হবে! 💗";
      bn.className = "bn-reveal " + (isBoy ? "theme-boy" : "theme-girl");
    }
    $("#reveal-sub").textContent =
      "Ratish & Sohani er ghor alo kore ashche. Shobar aashirbad chai 🙏";
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
    await renderWall("#wish-wall", fetchMyWishes, "Your wish is in. Only you can see it here. 💌");
    showStep("#step-thanks");
    burstConfetti(60);
  });

  async function renderWall(sel, source, emptyMsg) {
    const wall = $(sel);
    source = source || fetchWishes;
    wall.innerHTML = "<li class='empty'>Loading…</li>";
    const wishes = await source();
    if (!wishes.length) {
      wall.innerHTML =
        "<li class='empty'>" + (emptyMsg || "No wishes yet. 💌") + "</li>";
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

  function openAdmin() {
    hide($("#guest-view"));
    show(adminView);
  }
  function closeAdmin() {
    hide(adminView);
    show($("#guest-view"));
    // clear the hash so refreshing doesn't reopen admin
    if (location.hash === "#admin") {
      history.replaceState(null, "", location.pathname + location.search);
    }
  }

  // Hidden entry point: visit the page with #admin in the URL.
  function checkAdminHash() {
    if (location.hash.toLowerCase() === "#admin") openAdmin();
  }
  window.addEventListener("hashchange", checkAdminHash);

  const openAdminBtn = $("#open-admin");
  if (openAdminBtn) openAdminBtn.addEventListener("click", openAdmin);
  $("#close-admin").addEventListener("click", closeAdmin);

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

  $("#refresh-wishes").addEventListener("click", () =>
    renderWall("#admin-wish-wall", fetchWishes, "No wishes yet.")
  );

  async function refreshAdmin() {
    const answer = await fetchAnswer();
    state.answer = answer;
    $("#current-answer").textContent = answer;
    $$(".answer-choice").forEach((b) =>
      b.classList.toggle("active", b.dataset.answer === answer)
    );
    await renderWall("#admin-wish-wall", fetchWishes, "No wishes yet.");
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

  // Marigold (genda phool) petal colours + a few green leaves
  const MARIGOLD = ["#f5a623", "#e67e22", "#ff8c00", "#ffb347", "#e9b949"];
  const LEAF = ["#2e7d32", "#43a047"];

  function burstConfetti(count) {
    for (let i = 0; i < count; i++) {
      const isLeaf = Math.random() < 0.15;
      pieces.push({
        x: Math.random() * canvas.width,
        y: -20,
        r: 5 + Math.random() * 6,
        c: isLeaf
          ? LEAF[(Math.random() * LEAF.length) | 0]
          : MARIGOLD[(Math.random() * MARIGOLD.length) | 0],
        petal: !isLeaf,
        vx: (Math.random() - 0.5) * 4,
        vy: 2 + Math.random() * 3.5,
        rot: Math.random() * 360,
        vr: (Math.random() - 0.5) * 18,
      });
    }
    if (!rafId) loop();
  }

  // A gentle shower of marigold petals (genda phool) for the big reveal.
  function bigCelebration(isBoy) {
    const accent = isBoy ? "#4a7fd1" : "#e85a8a"; // a hint of the reveal colour
    for (let i = 0; i < 180; i++) {
      const roll = Math.random();
      const isLeaf = roll < 0.12;
      const isAccent = !isLeaf && roll > 0.9;
      pieces.push({
        x: Math.random() * canvas.width,
        y: -20 - Math.random() * canvas.height,
        r: 5 + Math.random() * 7,
        c: isLeaf
          ? LEAF[(Math.random() * LEAF.length) | 0]
          : isAccent
          ? accent
          : MARIGOLD[(Math.random() * MARIGOLD.length) | 0],
        petal: !isLeaf,
        vx: (Math.random() - 0.5) * 4.5,
        vy: 2 + Math.random() * 4,
        rot: Math.random() * 360,
        vr: (Math.random() - 0.5) * 16,
      });
    }
    if (!rafId) loop();
  }

  function loop() {
    cctx.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach((p) => {
      p.x += p.vx + Math.sin((p.y + p.rot) / 40) * 0.6; // gentle sway as petals fall
      p.y += p.vy;
      p.rot += p.vr;
      cctx.save();
      cctx.translate(p.x, p.y);
      cctx.rotate((p.rot * Math.PI) / 180);
      cctx.fillStyle = p.c;
      if (p.petal) {
        // marigold petal: a soft rounded oval
        cctx.beginPath();
        cctx.ellipse(0, 0, p.r * 0.65, p.r, 0, 0, Math.PI * 2);
        cctx.fill();
      } else {
        // leaf: a slim ellipse
        cctx.beginPath();
        cctx.ellipse(0, 0, p.r * 0.4, p.r * 1.1, 0, 0, Math.PI * 2);
        cctx.fill();
      }
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
    checkAdminHash(); // open admin if the URL already has #admin
  })();
})();
