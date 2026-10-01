import { TELEGRAM_BOT_TOKEN } from "../config.ts";

export async function verifyTelegramWebAppData(
  initData: string,
) {
  if (!initData) {
    return null;
  }

  const params = new URLSearchParams(initData);

  const receivedHash = params.get("hash");

  if (!receivedHash) {
    return null;
  }

  params.delete("hash");
  params.delete("signature");

  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const encoder = new TextEncoder();

  const secretKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode("WebAppData"),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );

  const secretKeyBytes = await crypto.subtle.sign(
    "HMAC",
    secretKey,
    encoder.encode(TELEGRAM_BOT_TOKEN),
  );

  const botTokenKey = await crypto.subtle.importKey(
    "raw",
    secretKeyBytes,
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    botTokenKey,
    encoder.encode(dataCheckString),
  );

  const calculatedHash = Array.from(
    new Uint8Array(signature),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (calculatedHash !== receivedHash) {
    return null;
  }

  const userRaw = params.get("user");

  if (!userRaw) {
    return null;
  }

  try {
    return JSON.parse(userRaw);
  } catch {
    return null;
  }
}
