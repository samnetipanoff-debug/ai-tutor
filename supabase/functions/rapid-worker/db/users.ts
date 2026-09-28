import {
  SUPABASE_URL,
  SERVICE_ROLE_KEY,
} from "../config.ts";

export async function getUserProfile(
  telegramId: number,
) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/users?telegram_id=eq.${telegramId}&select=telegram_id,username,first_name,interface_language,learning_language,level,goal,learning_mode`,
    {
      headers: {
        "apikey": SERVICE_ROLE_KEY,
        "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
      },
    },
  );

  if (!response.ok) {
    console.error(
      "Profile request failed:",
      response.status,
      await response.text(),
    );

    return null;
  }

  const profiles = await response.json();

  return profiles?.[0] ?? null;
}
