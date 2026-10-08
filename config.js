// ============================================================
//  CONFIG — fill these in before deploying.
//  See README.md for step-by-step setup.
// ============================================================

window.APP_CONFIG = {
  // --- Supabase (free shared storage, no DynamoDB) ---
  // Get these from your Supabase project: Settings > API
  SUPABASE_URL: "YOUR_SUPABASE_URL",       // e.g. https://abcdxyz.supabase.co
  SUPABASE_ANON_KEY: "YOUR_SUPABASE_ANON_KEY",

  // --- Admin password (change this!) ---
  // Note: this is a light client-side gate for a party page, not real security.
  ADMIN_PASSWORD: "ratish-sohani",

  // --- Couple ---
  COUPLE: "Ratish & Sohani",

  // --- Fallback answer if Supabase is not configured yet ---
  // "boy" or "girl". Admin can override this once Supabase is live.
  DEFAULT_ANSWER: "girl",
};
