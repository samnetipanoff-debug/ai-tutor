import {
  SUPABASE_URL,
  SERVICE_ROLE_KEY,
} from "../config.ts";

function pgHeaders(extra: Record<string, string> = {}) {
  return {
    "apikey": SERVICE_ROLE_KEY,
    "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function supabaseRequest(
  path: string,
  options: RequestInit = {},
) {
  return await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: pgHeaders(options.headers as Record<string, string> || {}),
  });
}

export type LearningItem = {
  id: string;
  telegram_id: string;
  type: string;
  content: string;
  translation: string | null;
  example: string | null;
  explanation: string | null;
  topic: string | null;
  grammar_topic: string | null;
  difficulty: number | null;
};

export async function getLearningItems(
  telegramId: string,
  topic: string | null = null,
) {
  const filters = [
    `telegram_id=eq.${encodeURIComponent(telegramId)}`,
  ];

  if (topic) {
    filters.push(`topic=eq.${encodeURIComponent(topic)}`);
  }

  const response = await supabaseRequest(
    `learning_items?${filters.join("&")}&select=*&order=created_at.desc&limit=100`,
  );

  if (!response.ok) {
    throw new Error(`Learning items lookup failed: ${response.status}`);
  }

  return (await response.json()) as LearningItem[];
}

export async function getSkillProgress(
  telegramId: string,
) {
  const response = await supabaseRequest(
    `skill_progress?telegram_id=eq.${encodeURIComponent(telegramId)}&select=*&order=next_review_at.asc.nullsfirst&limit=100`,
  );

  if (!response.ok) {
    throw new Error(`Skill progress lookup failed: ${response.status}`);
  }

  return await response.json();
}

export async function getMistakeSignals(
  telegramId: string,
) {
  const response = await supabaseRequest(
    `mistakes?telegram_id=eq.${encodeURIComponent(telegramId)}&select=error_type,grammar_topic,learning_item_id,created_at&order=created_at.desc&limit=100`,
  );

  if (!response.ok) {
    throw new Error(`Mistake lookup failed: ${response.status}`);
  }

  return await response.json();
}

export async function createLearningItem(
  telegramId: string,
  item: Partial<LearningItem>,
) {
  const payload = {
    telegram_id: telegramId,
    type: item.type || "phrase",
    content: String(item.content || "").trim(),
    translation: item.translation || null,
    example: item.example || null,
    explanation: item.explanation || null,
    topic: item.topic || null,
    grammar_topic: item.grammar_topic || null,
    difficulty: item.difficulty || 1,
  };

  if (!payload.content) {
    throw new Error("Learning item content is empty");
  }

  const response = await supabaseRequest("learning_items", {
    method: "POST",
    headers: {
      "Prefer": "return=representation",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(
      `Learning item creation failed: ${response.status} ${await response.text()}`,
    );
  }

  const rows = await response.json();
  return rows?.[0] as LearningItem;
}

export async function upsertSkillProgress(
  telegramId: string,
  learningItemId: string,
  correct: boolean,
) {
  const existingResponse = await supabaseRequest(
    `skill_progress?telegram_id=eq.${encodeURIComponent(telegramId)}&learning_item_id=eq.${encodeURIComponent(learningItemId)}&select=*&limit=1`,
  );

  if (!existingResponse.ok) {
    throw new Error(`Skill progress lookup failed: ${existingResponse.status}`);
  }

  const existing = await existingResponse.json();
  const current = existing?.[0];

  const attempts = Number(current?.attempts || 0) + 1;
  const correctAttempts =
    Number(current?.correct_attempts || 0) + (correct ? 1 : 0);
  const wrongAttempts =
    Number(current?.wrong_attempts || 0) + (correct ? 0 : 1);

  const previousMastery = Number(current?.mastery || 0);
  const mastery = correct
    ? Math.min(1, previousMastery + 0.25)
    : Math.max(0, previousMastery - 0.15);

  const now = new Date();
  const nextReview = new Date(now);

  if (correct) {
    const days =
      mastery >= 0.9 ? 14 :
      mastery >= 0.7 ? 7 :
      mastery >= 0.4 ? 3 : 1;
    nextReview.setDate(nextReview.getDate() + days);
  } else {
    nextReview.setHours(nextReview.getHours() + 6);
  }

  const status =
    mastery >= 0.9 ? "mastered" :
    mastery >= 0.4 ? "learning" :
    "weak";

  const payload = {
    telegram_id: telegramId,
    learning_item_id: learningItemId,
    status,
    attempts,
    correct_attempts: correctAttempts,
    wrong_attempts: wrongAttempts,
    mastery,
    last_practiced_at: now.toISOString(),
    next_review_at: nextReview.toISOString(),
    updated_at: now.toISOString(),
  };

  if (current?.id) {
    const response = await supabaseRequest(
      `skill_progress?id=eq.${encodeURIComponent(current.id)}`,
      {
        method: "PATCH",
        body: JSON.stringify(payload),
      },
    );

    if (!response.ok) {
      throw new Error(
        `Skill progress update failed: ${response.status} ${await response.text()}`,
      );
    }

    return payload;
  }

  const response = await supabaseRequest("skill_progress", {
    method: "POST",
    headers: {
      "Prefer": "return=representation",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(
      `Skill progress creation failed: ${response.status} ${await response.text()}`,
    );
  }

  return payload;
}

export async function saveLearningMistake(
  telegramId: string,
  originalText: string,
  correctedText: string,
  learningItemId: string,
) {
  const response = await supabaseRequest("mistakes", {
    method: "POST",
    headers: {
      "Prefer": "return=minimal",
    },
    body: JSON.stringify({
      telegram_id: telegramId,
      original_text: originalText,
      corrected_text: correctedText,
      explanation: "Lesson practice correction",
      error_type: "lesson_practice",
      learning_item_id: learningItemId,
    }),
  });

  if (!response.ok) {
    console.error(
      "Learning mistake save failed:",
      response.status,
      await response.text(),
    );
  }
}

export async function findLearningItemByContent(
  telegramId: string,
  content: string,
) {
  const response = await supabaseRequest(
    `learning_items?telegram_id=eq.${encodeURIComponent(telegramId)}&content=eq.${encodeURIComponent(content)}&select=*&limit=1`,
  );

  if (!response.ok) {
    throw new Error(`Learning item lookup failed: ${response.status}`);
  }

  const rows = await response.json();
  return rows?.[0] as LearningItem | undefined;
}
