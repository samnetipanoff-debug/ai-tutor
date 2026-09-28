import {
  SUPABASE_URL,
  SERVICE_ROLE_KEY,
} from "../config.ts";

export async function getOrCreateConversation(
  telegramId: number,
) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/conversations?telegram_id=eq.${telegramId}&select=id,telegram_id,created_at&order=created_at.desc&limit=1`,
    {
      headers: {
        "apikey": SERVICE_ROLE_KEY,
        "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
      },
    },
  );

  if (!response.ok) {
    console.error(
      "Conversation lookup failed:",
      response.status,
      await response.text(),
    );

    return null;
  }

  const conversations = await response.json();

  if (
    conversations &&
    conversations.length > 0
  ) {
    return conversations[0];
  }

  const createResponse = await fetch(
    `${SUPABASE_URL}/rest/v1/conversations`,
    {
      method: "POST",

      headers: {
        "apikey": SERVICE_ROLE_KEY,
        "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation",
      },

      body: JSON.stringify({
        telegram_id: telegramId,
      }),
    },
  );

  if (!createResponse.ok) {
    console.error(
      "Conversation creation failed:",
      createResponse.status,
      await createResponse.text(),
    );

    return null;
  }

  const created = await createResponse.json();

  return created?.[0] ?? null;
}
