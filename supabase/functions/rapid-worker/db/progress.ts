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

export async function updateProgress(
  telegramId: string,
  level: string | null,
) {
  try {
    /*
     * Count unique vocabulary items.
     */
    const vocabularyResponse = await supabaseRequest(
      `${SUPABASE_URL}/rest/v1/vocabulary?telegram_id=eq.${encodeURIComponent(
        telegramId,
      )}&select=word`,
    );

    if (!vocabularyResponse.ok) {
      console.error(
        "Vocabulary progress request failed:",
        vocabularyResponse.status,
        await vocabularyResponse.text(),
      );
      return false;
    }

    const vocabulary = await vocabularyResponse.json();

    const uniqueWords = new Set(
      (vocabulary || [])
        .map((item: any) =>
          String(item.word || "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean),
    );

    /*
     * Count mistakes.
     */
    const mistakesResponse = await supabaseRequest(
      `${SUPABASE_URL}/rest/v1/mistakes?telegram_id=eq.${encodeURIComponent(
        telegramId,
      )}&select=id`,
    );

    if (!mistakesResponse.ok) {
      console.error(
        "Mistakes progress request failed:",
        mistakesResponse.status,
        await mistakesResponse.text(),
      );
      return false;
    }

    const mistakes = await mistakesResponse.json();

    /*
     * Get existing progress record.
     */
    const progressResponse = await supabaseRequest(
      `${SUPABASE_URL}/rest/v1/progress?telegram_id=eq.${encodeURIComponent(
        telegramId,
      )}&select=id,lessons_completed,words_learned,mistakes_count`,
    );

    if (!progressResponse.ok) {
      console.error(
        "Progress lookup failed:",
        progressResponse.status,
        await progressResponse.text(),
      );
      return false;
    }

    const existing = await progressResponse.json();

    const progressData = {
      telegram_id: telegramId,
      level: level || null,
      words_learned: uniqueWords.size,
      mistakes_count: mistakes?.length || 0,
      updated_at: new Date().toISOString(),
    };

    /*
     * Create progress record if it doesn't exist.
     */
    if (!existing || existing.length === 0) {
      const createResponse = await supabaseRequest(
        `${SUPABASE_URL}/rest/v1/progress`,
        {
          method: "POST",
          headers: {
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            ...progressData,
            lessons_completed: 0,
          }),
        },
      );

      if (!createResponse.ok) {
        console.error(
          "Progress creation failed:",
          createResponse.status,
          await createResponse.text(),
        );
        return false;
      }

      return true;
    }

    /*
     * Update existing progress record.
     *
     * lessons_completed is intentionally preserved for now.
     * We will connect it to the real lesson system separately.
     */
    const progressId = existing[0].id;

    const updateResponse = await supabaseRequest(
      `${SUPABASE_URL}/rest/v1/progress?id=eq.${progressId}`,
      {
        method: "PATCH",
        body: JSON.stringify(progressData),
      },
    );

    if (!updateResponse.ok) {
      console.error(
        "Progress update failed:",
        updateResponse.status,
        await updateResponse.text(),
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error(
      "Progress update failed:",
      error,
    );

    return false;
  }
}
