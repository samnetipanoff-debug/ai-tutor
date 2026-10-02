import { TELEGRAM_BOT_TOKEN } from "../config.ts";

export async function verifyTelegramWebAppData(
  initData: string,
) {
  console.log("Telegram auth started", {
    hasInitData: Boolean(initData),
    initDataLength: initData.length,
  });

  if (!initData) {
    return null;
  }

  // Временно проверяем, какой Telegram-бот использует токен
  // из Secrets Supabase. Токен нигде не выводится.
  try {
    const telegramCheck = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe`,
    );

    const telegramData = await telegramCheck.json();

    console.log("Telegram token check", {
      ok: telegramData?.ok,
      botId: telegramData?.result?.id || null,
      botUsername: telegramData?.result?.username || null,
    });
  } catch (error) {
    console.error("Telegram token check failed", {
      error: String(error),
    });
  }

  const params = new URLSearchParams(initData);

  const receivedHash = params.get("hash");

  if (!receivedHash) {
    console.error("Telegram auth: HASH_MISSING");
    return null;
  }

  /*
   * Telegram Web App validation:
   *
   * data_check_string =
   * all received parameters except "hash",
   * sorted alphabetically and joined with "\n".
   *
   * ВАЖНО:
   * "signature" НЕ удаляем.
   * Он является частью полученных параметров.
   */
  params.delete("hash");

  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const encoder = new TextEncoder();

  /*
   * Step 1:
   * secret_key = HMAC-SHA256(
   *   key = "WebAppData",
   *   message = bot_token
   * )
   */
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

  /*
   * Step 2:
   * calculated_hash = HMAC-SHA256(
   *   key = secret_key,
   *   message = data_check_string
   * )
   */
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
      hasSignature: Boolean(params.get("signature")),
      hasUser: Boolean(params.get("user")),
      hasAuthDate: Boolean(params.get("auth_date")),
      receivedHashPrefix: receivedHash.slice(0, 8),
      calculatedHashPrefix: calculatedHash.slice(0, 8),
    });

    return null;
  }

  // Проверяем свежесть initData — не старше 24 часов.
  const authDate = Number(params.get("auth_date") || 0);

  if (!authDate) {
    console.error("Telegram auth: AUTH_DATE_MISSING");
    return null;
  }

  if (Date.now() / 1000 - authDate > 86400) {
    console.error("Telegram auth: INIT_DATA_EXPIRED");
    return null;
  }

  const userRaw = params.get("user");

  if (!userRaw) {
    console.error("Telegram auth: USER_MISSING");
    return null;
  }

  try {
    const user = JSON.parse(userRaw);

    console.log("Telegram auth: SUCCESS", {
      telegramUserId: user?.id || null,
      username: user?.username || null,
    });

    return user;
  } catch (error) {
    console.error("Telegram auth: USER_JSON_INVALID", {
      error: String(error),
    });

    return null;
  }
}
