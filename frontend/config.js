// Frontend configuration (serverless).
// This project is intended to run without a custom backend server.
const API_BASE = "";

const ENV = typeof window !== "undefined" && window.__ENV ? window.__ENV : {};

// Mapbox "public" token (pk...). This will be visible to users; restrict it in Mapbox dashboard.
const MB_TOK = ENV.MB_TOK || null;

// Supabase config (anon key is public by design).
const SUPABASE_URL = ENV.SUPABASE_URL || null;
const SUPABASE_ANON_KEY = ENV.SUPABASE_ANON_KEY || null;

