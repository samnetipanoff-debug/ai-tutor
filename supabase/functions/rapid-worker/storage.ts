import { SUPABASE_URL, SERVICE_ROLE_KEY } from "./config.ts";

const BUCKET = "voice-messages";

async function ensureBucket() {
  const headers = {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  };

  const existing = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: "GET",
    headers,
  });

  if (!existing.ok) {
    throw new Error(`Storage bucket lookup failed: ${existing.status} ${await existing.text().catch(() => "")}`);
  }

  const buckets = await existing.json();
  const found = Array.isArray(buckets)
    ? buckets.some((bucket) => bucket?.id === BUCKET || bucket?.name === BUCKET)
    : false;

  if (found) return;

  const response = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      id: BUCKET,
      name: BUCKET,
      public: false,
      file_size_limit: 10485760,
      allowed_mime_types: ["audio/*"],
    }),
  });

  if (!response.ok && response.status !== 409) {
    throw new Error(
      `Storage bucket creation failed: ${response.status} ${await response.text().catch(() => "")}`,
    );
  }
}

export async function uploadVoice(data: ArrayBuffer, mimeType: string, path: string) {
  await ensureBucket();
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": mimeType || "audio/mpeg", "x-upsert": "false" },
    body: data,
  });
  if (!response.ok) throw new Error(`Voice upload failed: ${response.status} ${await response.text().catch(() => "")}`);
  return path;
}

export async function signVoice(path: string) {
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${BUCKET}/${path}`, {
    method: "POST",
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: 31536000 }),
  });
  if (!response.ok) return null;
  const data = await response.json();
  if (!data?.signedURL) return null;
  return data.signedURL.startsWith("http") ? data.signedURL : `${SUPABASE_URL}/storage/v1${data.signedURL}`;
}
