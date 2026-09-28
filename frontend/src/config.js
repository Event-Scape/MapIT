const ENV = typeof window !== "undefined" && window.__ENV ? window.__ENV : {};

export const MB_TOK = ENV.MB_TOK || null;
export const SUPABASE_URL = ENV.SUPABASE_URL || null;
export const SUPABASE_ANON_KEY = ENV.SUPABASE_ANON_KEY || null;
export const GOOGLE_KEY = ENV.GOOGLE_KEY || null;
