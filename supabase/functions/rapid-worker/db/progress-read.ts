import {
  SUPABASE_URL,
  SERVICE_ROLE_KEY,
} from "../config.ts";

async function supabaseRequest(
  url: string,
  options: RequestInit = {},
) {
  return await fetch(url, {
    ...options,
    headers: {
      "apikey": SERVICE_ROLE_KEY,
      "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
}

export async function getProgress(
  telegramId: string,
) {
  try {
    const progressResponse = await supabaseRequest(
      `${SUPABASE_URL}/rest/v1/progress?telegram_id=eq.${encodeURIComponent(
        telegramId,
      )}&select=*`,
    );

    if (!progressResponse.ok) {
      console.error(
        "Progress lookup failed:",
        progressResponse.status,
        await progressResponse.text(),
      );

      return null;
    }

    const progressRows = await progressResponse.json();

    const vocabularyResponse = await supabaseRequest(
      `${SUPABASE_URL}/rest/v1/vocabulary?telegram_id=eq.${encodeURIComponent(
        telegramId,
      )}&select=*`,
    );

    if (!vocabularyResponse.ok) {
      console.error(
        "Vocabulary lookup failed:",
        vocabularyResponse.status,
        await vocabularyResponse.text(),
      );

      return null;
    }

    const vocabulary =
      await vocabularyResponse.json();

    const mistakesResponse = await supabaseRequest(
      `${SUPABASE_URL}/rest/v1/mistakes?telegram_id=eq.${encodeURIComponent(
        telegramId,
      )}&select=*`,
    );

    if (!mistakesResponse.ok) {
      console.error(
        "Mistakes lookup failed:",
        mistakesResponse.status,
        await mistakesResponse.text(),
      );

      return null;
    }

    const mistakes =
      await mistakesResponse.json();

    return {
      progress: progressRows?.[0] || {
        lessons_completed: 0,
        words_learned: 0,
        mistakes_count: 0,
        streak: 0,
      },
      vocabulary: vocabulary || [],
      mistakes: mistakes || [],
    };
  } catch (error) {
    console.error(
      "Get progress failed:",
      error,
    );

    return null;
  }
}
