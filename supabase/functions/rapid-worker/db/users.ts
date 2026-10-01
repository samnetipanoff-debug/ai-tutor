import {
  SUPABASE_URL,
  SERVICE_ROLE_KEY,
} from "../config.ts";

/* =========================================================
   INTERNAL: базовые заголовки для PostgREST
   ========================================================= */

function pgHeaders(extra: Record<string, string> = {}) {
  return {
    "apikey": SERVICE_ROLE_KEY,
    "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

/* =========================================================
   SELECT FIELDS
   Возвращаем ВСЁ, что нужно фронтенду для профиля,
   онбординга и профиля пользователя.
   ========================================================= */

const USER_FIELDS = [
  "telegram_id",
  "username",
  "first_name",
  "interface_language",
  "native_language",
  "learning_language",
  "level",
  "goal",
  "learning_mode",
  "onboarding_step",
  "created_at",
].join(",");

/* =========================================================
   GET PROFILE (или создать при отсутствии)
   ========================================================= */

export async function getUserProfile(
  telegramId: number,
  telegramUser?: {
    username?: string;
    first_name?: string;
  } | null,
) {
  // 1. Пробуем получить существующего пользователя
  const fetchResponse = await fetch(
    `${SUPABASE_URL}/rest/v1/users?telegram_id=eq.${telegramId}&select=${USER_FIELDS}`,
    {
      headers: pgHeaders(),
    },
  );

  if (!fetchResponse.ok) {
    console.error(
      "Profile request failed:",
      fetchResponse.status,
      await fetchResponse.text(),
    );

    return null;
  }

  const profiles = await fetchResponse.json();

  if (profiles?.[0]) {
    return profiles[0];
  }

  // 2. Пользователя нет — создаём
  return await createUser(telegramId, telegramUser);
}

/* =========================================================
   CREATE USER
   ========================================================= */

async function createUser(
  telegramId: number,
  telegramUser?: {
    username?: string;
    first_name?: string;
  } | null,
) {
  const payload = {
    telegram_id: telegramId,
    username: telegramUser?.username ?? null,
    first_name: telegramUser?.first_name ?? null,
    onboarding_step: "interface_language",
  };

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/users`,
    {
      method: "POST",
      headers: pgHeaders({
        "Prefer": "return=representation",
      }),
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    const errText = await response.text();
    console.error(
      "User creation failed:",
      response.status,
      errText,
    );

    // Если параллельный запрос уже создал — читаем ещё раз
    if (response.status === 409) {
      return await getUserProfile(telegramId, telegramUser);
    }

    return null;
  }

  const created = await response.json();
  return created?.[0] ?? null;
}

/* =========================================================
   UPDATE ONBOARDING STEP
   Сохраняет выбранное значение поля и переводит на
   следующий шаг онбординга.
   ========================================================= */

const ONBOARDING_ORDER = [
  "interface_language",
  "native_language",
  "learning_language",
  "level",
  "goal",
  "done",
];

const ONBOARDING_FIELD_MAP: Record<string, string> = {
  interface_language: "interface_language",
  native_language: "native_language",
  learning_language: "learning_language",
  level: "level",
  goal: "goal",
};

export async function updateOnboardingStep(
  telegramId: number,
  step: string,
  value: string,
) {
  // Валидация шага
  if (!ONBOARDING_ORDER.includes(step)) {
    console.error("Invalid onboarding step:", step);
    return null;
  }

  // Собираем patch
  const patch: Record<string, any> = {};

  if (step !== "done") {
    const field = ONBOARDING_FIELD_MAP[step];
    if (!field) {
      console.error("No field mapping for step:", step);
      return null;
    }
    patch[field] = value;
  }

  // Следующий шаг
  const idx = ONBOARDING_ORDER.indexOf(step);
  const nextStep = ONBOARDING_ORDER[idx + 1] || "done";
  patch.onboarding_step = nextStep;

  // Обновляем
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/users?telegram_id=eq.${telegramId}`,
    {
      method: "PATCH",
      headers: pgHeaders({
        "Prefer": "return=representation",
      }),
      body: JSON.stringify(patch),
    },
  );

  if (!response.ok) {
    console.error(
      "Onboarding update failed:",
      response.status,
      await response.text(),
    );
    return null;
  }

  const updated = await response.json();
  return updated?.[0] ?? null;
}

/* =========================================================
   UPDATE PROFILE (произвольные поля)
   Используется на экране Profile для смены языка,
   уровня, цели и т.п.
   ========================================================= */

const ALLOWED_PROFILE_FIELDS = new Set([
  "interface_language",
  "native_language",
  "learning_language",
  "level",
  "goal",
  "learning_mode",
]);

export async function updateProfile(
  telegramId: number,
  patch: Record<string, unknown>,
) {
  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(patch)) {
    if (!ALLOWED_PROFILE_FIELDS.has(key)) continue;
    sanitized[key] = value;
  }

  if (Object.keys(sanitized).length === 0) {
    console.error("No valid fields to update");
    return null;
  }

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/users?telegram_id=eq.${telegramId}`,
    {
      method: "PATCH",
      headers: pgHeaders({
        "Prefer": "return=representation",
      }),
      body: JSON.stringify(sanitized),
    },
  );

  if (!response.ok) {
    console.error(
      "Profile update failed:",
      response.status,
      await response.text(),
    );
    return null;
  }

  const updated = await response.json();
  return updated?.[0] ?? null;
}
