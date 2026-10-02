const runtimeSecretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");

function resolveAdminKey() {
  if (runtimeSecretKeys) {
    try {
      const parsed = JSON.parse(runtimeSecretKeys);
      if (parsed?.default) return parsed.default;
    } catch (_) {
      // Fall back to the explicitly configured legacy key below.
    }
  }

  return (
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    Deno.env.get("SERVICE_ROLE_KEY") ||
    ""
  );
}

export const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
export const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
export const SERVICE_ROLE_KEY = resolveAdminKey();
export const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY")!;

if (!SERVICE_ROLE_KEY) {
  throw new Error("Supabase admin key is not configured");
}

export const APP_ORIGIN = "https://ai-tutor-chi-sand.vercel.app";

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": APP_ORIGIN,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
