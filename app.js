/* ============================================================
   Ratish & Sohani — Shubho Aagomon (Baby Announcement)
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

  // ============================================================
  //  AUDIO — synthesized, Bengali-themed ambience + effects
  //  (Web Audio API; no files, safe to deploy. Autoplay-safe:
  //   starts only after the first user interaction.)
  // ============================================================
  const audio = (function () {
    let ctx = null;
    let master = null;
    let droneGain = null;
    let muted = false;
    let started = false;
    let scratchLast = 0;

    // A soft raga-like scale (C, D, E, G, A, high C) in Hz — pleasant & Indian-flavoured.
    const SCALE = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25];

    function ensure() {
      if (ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.9;
      master.connect(ctx.destination);
    }

    // Gentle tanpura-like drone (two detuned low notes + slow shimmer).
    function startDrone() {
      if (!ctx || droneGain) return;
      droneGain = ctx.createGain();
      droneGain.gain.value = 0;
      droneGain.connect(master);
      // soft fade-in
      droneGain.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 2.5);

      [130.81, 196.0].forEach((f, i) => {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = f;
        const g = ctx.createGain();
        g.gain.value = i === 0 ? 0.6 : 0.4;
        // slow tremolo for a living, breathing pad
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.12 + i * 0.05;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 0.25;
        lfo.connect(lfoGain);
        lfoGain.connect(g.gain);
        osc.connect(g);
        g.connect(droneGain);
        osc.start();
        lfo.start();
      });
    }

    // A gentle looping melody (soft plucked notes on a raga-like scale) that
    // plays continuously in the background, layered over the drone.
    let melodyTimer = null;
    // Note indices into SCALE (-1 = rest). A calm, lilting phrase that loops.
    const MELODY = [0, 2, 3, 4, 3, 2, 0, -1, 2, 4, 5, 4, 3, 2, -1, 0];
    const NOTE_MS = 620; // tempo (ms per step)

    function pluck(freq, vol) {
      if (!ctx || muted) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = freq;
      // a soft sine sub-layer for warmth
      const osc2 = ctx.createOscillator();
      osc2.type = "sine";
      osc2.frequency.value = freq / 2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(vol, now + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 2200;
      osc.connect(lp);
      osc2.connect(lp);
      lp.connect(g);
      g.connect(master);
      osc.start(now);
      osc2.start(now);
      osc.stop(now + 1.5);
      osc2.stop(now + 1.5);
    }

    function startMelody() {
      if (melodyTimer) return;
      let step = 0;
      melodyTimer = setInterval(() => {
        if (muted) return; // keep the clock, just stay silent while muted
        const idx = MELODY[step % MELODY.length];
        if (idx >= 0) {
          // middle-octave melody, soft
          pluck(SCALE[idx] * 2, 0.045);
          // occasional gentle harmony a third below
          if (step % 4 === 0 && idx > 1) pluck(SCALE[idx - 2], 0.03);
        }
        step++;
      }, NOTE_MS);
    }

    function start() {
      ensure();
      if (!ctx) return;
      if (ctx.state === "suspended") ctx.resume();
      if (!started) {
        started = true;
        startDrone();
        startMelody();
      }
    }

    // Light shimmer while scratching (throttled so it stays soft).
    function scratch() {
      if (!ctx || muted) return;
      const now = ctx.currentTime;
      if (now - scratchLast < 0.05) return; // throttle
      scratchLast = now;
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      const f = SCALE[(Math.random() * SCALE.length) | 0] * 2;
      osc.frequency.setValueAtTime(f + Math.random() * 40, now);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.05, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      osc.connect(g);
      g.connect(master);
      osc.start(now);
      osc.stop(now + 0.2);
    }

    // One soft bell/pluck note.
    function note(freq, when, dur, vol, type) {
      const osc = ctx.createOscillator();
      osc.type = type || "sine";
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(vol, when + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      osc.connect(g);
      g.connect(master);
      osc.start(when);
      osc.stop(when + dur + 0.05);
    }

    // Warm reveal flourish: a shehnai-like swell + an ascending bell cascade.
    function reveal() {
      if (!ctx) return;
      if (ctx.state === "suspended") ctx.resume();
      const now = ctx.currentTime;

      // shehnai-like swell (reedy sawtooth with soft attack/release)
      const swell = ctx.createOscillator();
      swell.type = "sawtooth";
      swell.frequency.setValueAtTime(392.0, now);
      swell.frequency.linearRampToValueAtTime(523.25, now + 0.9);
      const sg = ctx.createGain();
      sg.gain.setValueAtTime(0.0001, now);
      sg.gain.exponentialRampToValueAtTime(0.08, now + 0.25);
      sg.gain.exponentialRampToValueAtTime(0.0001, now + 1.6);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1800;
      swell.connect(lp);
      lp.connect(sg);
      sg.connect(master);
      swell.start(now);
      swell.stop(now + 1.7);

      // ascending bell cascade
      const cascade = [0, 1, 2, 3, 4, 5];
      cascade.forEach((i, idx) => {
        note(SCALE[i] * 2, now + 0.12 + idx * 0.12, 0.9, 0.08, "sine");
      });
      // a couple of sparkly high notes to finish
      note(SCALE[5] * 4, now + 0.9, 1.2, 0.05, "triangle");
      note(SCALE[3] * 4, now + 1.1, 1.2, 0.045, "triangle");
    }

    function toggleMute() {
      muted = !muted;
      if (master) {
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.linearRampToValueAtTime(muted ? 0 : 0.9, ctx.currentTime + 0.2);
      }
      return muted;
    }

    return { start, scratch, reveal, toggleMute, isMuted: () => muted };
  })();

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
    audio.start(); // first user interaction — safe to begin ambient music
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
    audio.scratch(); // soft chime on each pop
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
    ctx.font = "600 18px 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Scratch to reveal", cssW / 2, cssH / 2 + 4);
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
      audio.scratch(); // soft shimmer as they scratch
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
  // Illustrated swaddled baby — blue cap for boy, pink cap + bow & flower for girl.
  function babySVG(isBoy) {
    const blanket = isBoy ? "#4a7fd1" : "#e85a8a";
    const blanketLine = isBoy ? "#2f5fa8" : "#c23a6b";
    const glow = isBoy ? "#eaf2ff" : "#fdeef4";
    const cheek = isBoy ? "#ffb3a1" : "#ff8fb0";
    const girlExtras = isBoy
      ? ""
      : `
        <g transform="translate(0,-50)">
          <path d="M0 0 L-16 -8 L-16 8 Z" fill="#e9b949"/>
          <path d="M0 0 L16 -8 L16 8 Z" fill="#e9b949"/>
          <circle r="5" fill="#d49a2a"/>
        </g>
        <g transform="translate(-22,-30)">
          <circle r="4" fill="#fff"/>
          <circle cx="-5" cy="0" r="3" fill="#ffd1e8"/>
          <circle cx="5" cy="0" r="3" fill="#ffd1e8"/>
          <circle cx="0" cy="-5" r="3" fill="#ffd1e8"/>
          <circle cx="0" cy="5" r="3" fill="#ffd1e8"/>
          <circle r="2" fill="#e9b949"/>
        </g>`;
    const boyPom = isBoy ? `<circle cx="0" cy="-50" r="6" fill="#e9b949"/>` : "";
    return `
      <svg class="baby-svg" viewBox="-80 -80 160 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${isBoy ? "A baby boy" : "A baby girl"}">
        <circle cx="0" cy="0" r="74" fill="${glow}"/>
        <path d="M-54 44 Q-60 -6 0 -14 Q60 -6 54 44 Q0 70 -54 44 Z" fill="${blanket}"/>
        <path d="M-54 44 Q-60 -6 0 -14 Q60 -6 54 44 Q0 70 -54 44 Z" fill="none" stroke="${blanketLine}" stroke-width="2"/>
        <path d="M-40 20 Q0 36 40 20" fill="none" stroke="${blanketLine}" stroke-width="2" opacity="0.6"/>
        <circle cx="0" cy="-8" r="34" fill="#ffd9b8"/>
        <path d="M-34 -10 Q-36 -48 0 -50 Q36 -48 34 -10 Q0 -22 -34 -10 Z" fill="${blanket}"/>
        <path d="M-34 -10 Q0 -22 34 -10" fill="none" stroke="${blanketLine}" stroke-width="2"/>
        ${boyPom}
        ${girlExtras}
        <path d="M-14 -8 q4 4 8 0" fill="none" stroke="#5a3a22" stroke-width="2" stroke-linecap="round"/>
        <path d="M6 -8 q4 4 8 0" fill="none" stroke="#5a3a22" stroke-width="2" stroke-linecap="round"/>
        <circle cx="-18" cy="2" r="5" fill="${cheek}" opacity="0.6"/>
        <circle cx="18" cy="2" r="5" fill="${cheek}" opacity="0.6"/>
        <path d="M-7 8 q7 7 14 0" fill="none" stroke="#5a3a22" stroke-width="2" stroke-linecap="round"/>
      </svg>`;
  }

  function doReveal() {
    if (state.revealed) return;
    state.revealed = true;
    const isBoy = state.answer === "boy";
    const badge = $("#reveal-badge");
    badge.innerHTML = babySVG(isBoy);
    badge.classList.add("baby-badge");
    const title = $("#reveal-title");
    title.textContent = isBoy ? "It's a Boy! 💙" : "It's a Girl! 💗";
    title.className = isBoy ? "theme-boy" : "theme-girl";
    const bn = $("#reveal-bn");
    if (bn) {
      bn.textContent = isBoy ? "ছেলে হয়েছে! 💙" : "মেয়ে হয়েছে! 💗";
      bn.className = "bn-reveal " + (isBoy ? "theme-boy" : "theme-girl");
    }
    $("#reveal-sub").textContent =
      "রতীশ ও সোহানির ঘর আলো করে এসেছে। সবার আশীর্বাদ চাই 🙏";
    showStep("#step-reveal");
    audio.reveal(); // warm shehnai-like flourish + bell cascade
    bigCelebration(isBoy);
  }

  // ---- Pre-written blessing suggestions (English + Bengali) ----
  // Edit this list to change the quick-pick blessings guests can tap.
  const WISH_SUGGESTIONS = [
    { en: "Congratulations! Lots of love for the little one 💕", bn: "অনেক শুভেচ্ছা ও ভালোবাসা ছোট্ট সোনার জন্য 💕" },
    { en: "Welcome to the world, little angel! 👶", bn: "পৃথিবীতে স্বাগতম, ছোট্ট সোনা! 👶" },
    { en: "May the baby be blessed with health & happiness 🙏", bn: "শিশুটি সুস্থ ও সুখী হয়ে উঠুক — এই আশীর্বাদ রইল 🙏" },
    { en: "So happy for you both! God bless the family 🌸", bn: "তোমাদের জন্য ভীষণ আনন্দিত! ঈশ্বর পরিবারকে আশীর্বাদ করুন 🌸" },
    { en: "A new star has arrived in your home ⭐", bn: "তোমাদের ঘরে এক নতুন তারা এসেছে ⭐" },
    { en: "Dugga Dugga! Stay blessed, little one 🪷", bn: "দুগ্গা দুগ্গা! ভালো থেকো সোনা 🪷" },
    { en: "Many many congratulations to the new parents! 🎉", bn: "নতুন বাবা-মাকে অনেক অনেক অভিনন্দন! 🎉" },
    { en: "Lots of bhalobasha for the newest member 💐", bn: "পরিবারের নতুন সদস্যের জন্য অনেক ভালোবাসা 💐" },
  ];

  function renderSuggestions() {
    const box = $("#wish-suggestions");
    if (!box || box.childElementCount) return; // build once
    WISH_SUGGESTIONS.forEach((s) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.innerHTML =
        escapeText(s.en) + '<span class="chip-bn">' + escapeText(s.bn) + "</span>";
      chip.addEventListener("click", () => {
        const ta = $("#wish-text");
        ta.value = s.en + " " + s.bn;
        ta.focus();
        $$("#wish-suggestions .chip").forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
      });
      box.appendChild(chip);
    });
  }

  // Tiny HTML-escaper so suggestion text is inserted safely.
  function escapeText(str) {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  $("#to-wish").addEventListener("click", () => {
    renderSuggestions();
    showStep("#step-wish");
  });

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
    await renderWall("#wish-wall", fetchMyWishes, "Your blessing is in. Only you can see it here. 💌");
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
  // ---- Sound toggle button ----
  const soundBtn = $("#sound-toggle");
  if (soundBtn) {
    soundBtn.addEventListener("click", () => {
      audio.start(); // ensure context exists (also a valid user gesture)
      const nowMuted = audio.toggleMute();
      soundBtn.textContent = nowMuted ? "🔇" : "🔊";
      soundBtn.classList.toggle("muted", nowMuted);
    });
  }

  (async function init() {
    state.answer = await fetchAnswer();
    showStep("#step-name");
    checkAdminHash(); // open admin if the URL already has #admin
  })();
})();
