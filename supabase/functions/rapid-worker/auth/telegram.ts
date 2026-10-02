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

  // Telegram WebApp secret key:
  // HMAC-SHA256(key = "WebAppData", message = bot token)
  const webAppDataKey = await crypto.subtle.importKey(
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
    webAppDataKey,
    encoder.encode(TELEGRAM_BOT_TOKEN),
  );

  const secretKey = await crypto.subtle.importKey(
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
    secretKey,
    encoder.encode(dataCheckString),
  );

  const calculatedHash = Array.from(
    new Uint8Array(signature),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

if (calculatedHash !== receivedHash) {
  console.error("Telegram auth: HASH_MISMATCH", {
    hasInitData: Boolean(initData),
    initDataLength: initData.length,
    hasHash: Boolean(receivedHash),
    hasUser: Boolean(params.get("user")),
    hasAuthDate: Boolean(params.get("auth_date")),
  });

  return null;
  }

  // Проверка свежести initData — не старше 24 часов.
  const authDate = Number(params.get("auth_date") || 0);

  if (!authDate || Date.now() / 1000 - authDate > 86400) {
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
