import { callOpenRouter } from "./ai/openrouter.ts";
import {
  createLearningItem,
  findLearningItemByContent,
  getLearningItems,
  getMistakeSignals,
  getSkillProgress,
  upsertSkillProgress,
  saveLearningMistake,
  type LearningItem,
} from "./db/learning.ts";
import {
  SUPABASE_URL,
  SERVICE_ROLE_KEY,
} from "./config.ts";

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

type Lesson = {
  id: string;
  telegram_id: string;
  lesson_number: number;
  topic: string | null;
  status: string;
  current_step: string;
  current_word: string | null;
  current_translation: string | null;
  current_example: string | null;
  attempts: number;
  correct_attempts: number;
  wrong_attempts: number;
  completed_items: number;
  total_items: number;
  score: number;
  test_items: number;
  test_correct: number;
  test_index: number;
  completed_at: string | null;
  test_data: any[];
};

const LESSON_FIELDS = [
  "id",
  "telegram_id",
  "lesson_number",
  "topic",
  "status",
  "current_step",
  "current_word",
  "current_translation",
  "current_example",
  "attempts",
  "correct_attempts",
  "wrong_attempts",
  "completed_items",
  "total_items",
  "score",
  "test_items",
  "test_correct",
  "test_index",
  "completed_at",
  "test_data",
].join(",");

async function getActiveLesson(telegramId: string) {
  const response = await supabaseRequest(
    `lessons?telegram_id=eq.${encodeURIComponent(telegramId)}&status=eq.active&select=${LESSON_FIELDS}&order=created_at.desc&limit=1`,
  );

  if (!response.ok) {
    throw new Error(`Active lesson lookup failed: ${response.status}`);
  }

  const rows = await response.json();
  return rows?.[0] as Lesson | undefined;
}

async function updateLesson(
  lessonId: string,
  patch: Record<string, unknown>,
) {
  const response = await supabaseRequest(
    `lessons?id=eq.${encodeURIComponent(lessonId)}`,
    {
      method: "PATCH",
      headers: {
        "Prefer": "return=representation",
      },
      body: JSON.stringify(patch),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Lesson update failed: ${response.status} ${await response.text()}`,
    );
  }

  const rows = await response.json();
  return rows?.[0] as Lesson;
}

async function createLesson(
  telegramId: string,
  topic: string | null,
  items: LearningItem[],
) {
  const first = items[0];

  const response = await supabaseRequest("lessons", {
    method: "POST",
    headers: {
      "Prefer": "return=representation",
    },
    body: JSON.stringify({
      telegram_id: telegramId,
      lesson_number: await nextLessonNumber(telegramId),
      topic,
      status: "active",
      current_step: "new_item",
      current_word: first?.content || null,
      current_translation: first?.translation || null,
      current_example: first?.example || null,
      attempts: 0,
      correct_attempts: 0,
      wrong_attempts: 0,
      difficulty: first?.difficulty || 1,
      total_items: items.length,
      completed_items: 0,
      score: 0,
      test_items: 0,
      test_correct: 0,
      test_index: 0,
      completed_at: null,
      test_data: items.map((item) => ({
        learning_item_id: item.id,
        type: item.type,
        content: item.content,
        translation: item.translation,
        example: item.example,
      })),
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Lesson creation failed: ${response.status} ${await response.text()}`,
    );
  }

  const rows = await response.json();
  return rows?.[0] as Lesson;
}

async function nextLessonNumber(telegramId: string) {
  const response = await supabaseRequest(
    `lessons?telegram_id=eq.${encodeURIComponent(telegramId)}&select=lesson_number&order=lesson_number.desc&limit=1`,
  );

  if (!response.ok) {
    throw new Error(`Lesson number lookup failed: ${response.status}`);
  }

  const rows = await response.json();
  return Number(rows?.[0]?.lesson_number || 0) + 1;
}

async function generateLessonItems(
  profile: any,
  topic: string | null,
  existingItems: LearningItem[],
  mistakes: any[],
) {
  const interfaceLanguage = profile?.interface_language || "en";
  const learningLanguage = profile?.learning_language || "en";
  const level = profile?.level || "unknown";
  const goal = profile?.goal || "conversation";

  const known = existingItems
    .slice(0, 30)
    .map((item) => item.content)
    .join(" | ");

  const recurringGrammar = mistakes
    .filter((item) => item.grammar_topic)
    .slice(0, 10)
    .map((item) => item.grammar_topic)
    .join(", ");

  const prompt = `
Create exactly 3 learning items for a foreign-language lesson.

Interface language: ${interfaceLanguage}
Learning language: ${learningLanguage}
Level: ${level}
Goal: ${goal}
Topic: ${topic || "general"}

Prior learned items (do not repeat them):
${known || "none"}

Recurring grammar weaknesses:
${recurringGrammar || "none"}

Return ONLY valid JSON array. Each item must contain:
type, content, translation, example, explanation, topic, grammar_topic, difficulty.

Allowed type values:
word, phrase, sentence, grammar, pattern, pronunciation.

Rules:
- content, example and actual learning material must be in the learning language.
- translation and explanation must be in the interface language.
- Keep difficulty appropriate to the level.
- Prefer practical material connected to the topic and goal.
- Mix item types when useful.
- Do not invent a grammar explanation in the learning language.
`;

  const raw = await callOpenRouter(
    [
      { role: "system", content: prompt },
    ],
    700,
    0,
    "Lesson Generator",
  );

  let parsed: any;
  try {
    parsed = JSON.parse(
      raw.replace(/^\`\`\`json\s*/i, "").replace(/\s*\`\`\`$/i, "").trim(),
    );
  } catch {
    parsed = [];
  }

  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter((item) => item?.content)
    .slice(0, 3);
}

async function chooseItems(
  telegramId: string,
  profile: any,
  topic: string | null,
) {
  const [items, skillProgress, mistakes] = await Promise.all([
    getLearningItems(telegramId, topic),
    getSkillProgress(telegramId),
    getMistakeSignals(telegramId),
  ]);

  const now = Date.now();

  const skillByItem = new Map(
    skillProgress.map((item: any) => [item.learning_item_id, item]),
  );

  const weakItemIds = new Set(
    mistakes
      .map((item: any) => item.learning_item_id)
      .filter(Boolean),
  );

  const weak = items
    .filter((item) => weakItemIds.has(item.id))
    .sort((a, b) =>
      Number(skillByItem.get(a.id)?.mastery || 0) -
      Number(skillByItem.get(b.id)?.mastery || 0)
    );

  const due = items
    .filter((item) => {
      const progress = skillByItem.get(item.id);
      return progress?.next_review_at &&
        new Date(progress.next_review_at).getTime() <= now;
    });

  const selected: LearningItem[] = [];
  const seen = new Set<string>();

  for (const item of [...weak, ...due, ...items]) {
    if (selected.length >= 3) break;
    if (seen.has(item.id)) continue;
    selected.push(item);
    seen.add(item.id);
  }

  if (selected.length >= 3) return selected;

  const generated = await generateLessonItems(
    profile,
    topic,
    items,
    mistakes,
  );

  for (const item of generated) {
    if (selected.length >= 3) break;

    const exists = items.some(
      (known) =>
        known.content.trim().toLowerCase() ===
        String(item.content).trim().toLowerCase(),
    );

    if (exists) continue;

    const created = await createLearningItem(telegramId, item);
    selected.push(created);
  }

  return selected;
}

function lessonPayload(lesson: Lesson | undefined) {
  if (!lesson) return null;

  return {
    id: lesson.id,
    lesson_number: lesson.lesson_number,
    topic: lesson.topic,
    status: lesson.status,
    current_step: lesson.current_step,
    current_word: lesson.current_word,
    current_translation: lesson.current_translation,
    current_example: lesson.current_example,
    attempts: lesson.attempts,
    correct_attempts: lesson.correct_attempts,
    wrong_attempts: lesson.wrong_attempts,
    completed_items: lesson.completed_items,
    total_items: lesson.total_items,
    score: lesson.score,
    test_items: lesson.test_items,
    test_correct: lesson.test_correct,
    test_index: lesson.test_index,
    completed_at: lesson.completed_at,
    test_current: lesson.current_step === "test"
      ? (lesson.test_data || [])[Number(lesson.test_index || 0)] || null
      : null,
  };
}

async function incrementCompletedLessons(telegramId: string) {
  const response = await supabaseRequest(
    `progress?telegram_id=eq.${encodeURIComponent(telegramId)}&select=id,lessons_completed`,
  );

  if (!response.ok) return;

  const rows = await response.json();
  if (!rows?.[0]) {
    await supabaseRequest("progress", {
      method: "POST",
      headers: { "Prefer": "return=representation" },
      body: JSON.stringify({
        telegram_id: telegramId,
        lessons_completed: 1,
        words_learned: 0,
        mistakes_count: 0,
        streak: 0,
        updated_at: new Date().toISOString(),
      }),
    });
    return;
  }

  await supabaseRequest(
    `progress?id=eq.${encodeURIComponent(rows[0].id)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        lessons_completed: Number(rows[0].lessons_completed || 0) + 1,
        updated_at: new Date().toISOString(),
      }),
    },
  );
}

export async function startLesson(
  telegramId: string,
  profile: any,
  topic: string | null,
) {
  const active = await getActiveLesson(telegramId);
  if (active) return lessonPayload(active);

  const items = await chooseItems(telegramId, profile, topic);
  if (!items.length) {
    throw new Error("Could not create learning items");
  }

  const lesson = await createLesson(telegramId, topic, items);
  return lessonPayload(lesson);
}

export async function getCurrentLesson(telegramId: string) {
  return lessonPayload(await getActiveLesson(telegramId));
}

export async function answerLesson(
  telegramId: string,
  answer: string,
) {
  const lesson = await getActiveLesson(telegramId);
  if (!lesson) throw new Error("No active lesson");

  if (lesson.current_step === "test") {
    const testData = (lesson.test_data || []) as any[];
    const index = Number(lesson.test_index || 0);
    const testItem = testData[index];

    if (!testItem) {
      const completed = await updateLesson(lesson.id, {
        status: "completed",
        current_step: "done",
        completed_at: new Date().toISOString(),
      });
      await incrementCompletedLessons(telegramId);
      return {
        correct: true,
        test_complete: true,
        lesson: lessonPayload(completed),
        learning_item: null,
      };
    }

    const correct =
      normalizeLessonAnswer(answer) ===
      normalizeLessonAnswer(String(testItem.content || ""));

    const nextIndex = index + 1;
    const testCorrect = Number(lesson.test_correct || 0) + (correct ? 1 : 0);
    const score = Number(lesson.score || 0) + (correct ? 1 : 0);

    const patch: Record<string, unknown> = {
      test_items: Math.min(3, testData.length),
      test_index: nextIndex,
      test_correct: testCorrect,
      score,
    };

    if (nextIndex >= Math.min(3, testData.length)) {
      patch.status = "completed";
      patch.current_step = "done";
      patch.completed_at = new Date().toISOString();
    }

    const updated = await updateLesson(lesson.id, patch);

    if (!correct) {
      await saveLearningMistake(
        telegramId,
        answer,
        String(testItem.content || ""),
        String(testItem.learning_item_id || ""),
      );
    }

    if (patch.status === "completed") {
      await incrementCompletedLessons(telegramId);
    }

    return {
      correct,
      test_complete: patch.status === "completed",
      lesson: lessonPayload(updated),
      learning_item: testItem,
    };
  }

  const lessonItems = (lesson.test_data || []) as any[];
  const currentIndex = Math.max(0, Number(lesson.completed_items || 0));
  const currentItemData = lessonItems[currentIndex];

  let currentItem: LearningItem | undefined;

  if (currentItemData?.learning_item_id) {
    const items = await getLearningItems(telegramId);
    currentItem = items.find(
      (item) => item.id === String(currentItemData.learning_item_id),
    );
  }

  if (!currentItem) {
    currentItem = await findLearningItemByContent(
      telegramId,
      lesson.current_word || "",
    );
  }

  if (!currentItem) {
    throw new Error("Current learning item not found");
  }

  const normalizedAnswer = normalizeLessonAnswer(answer);
  const normalizedExpected = normalizeLessonAnswer(currentItem.content);
  const correct = normalizedAnswer === normalizedExpected;

  await upsertSkillProgress(
    telegramId,
    currentItem.id,
    correct,
  );

  if (correct) {
    const completedItems = Number(lesson.completed_items || 0) + 1;
    const score = Number(lesson.score || 0) + 1;

    const updated = await updateLesson(
      lesson.id,
      {
        attempts: Number(lesson.attempts || 0) + 1,
        correct_attempts: Number(lesson.correct_attempts || 0) + 1,
        completed_items: completedItems,
        score,
        current_step:
          completedItems >= Number(lesson.total_items || 3)
            ? "test"
            : "example",
        test_items:
          completedItems >= Number(lesson.total_items || 3)
            ? Math.min(3, Number(lesson.total_items || 3))
            : lesson.test_items,
        test_index:
          completedItems >= Number(lesson.total_items || 3)
            ? 0
            : lesson.test_index,
      },
    );

    return {
      correct: true,
      lesson: lessonPayload(updated),
      learning_item: currentItem,
    };
  }

  await saveLearningMistake(
    telegramId,
    answer,
    currentItem.content,
    currentItem.id,
  );

  const updated = await updateLesson(
    lesson.id,
    {
      attempts: Number(lesson.attempts || 0) + 1,
      wrong_attempts: Number(lesson.wrong_attempts || 0) + 1,
      current_step: "repeat",
    },
  );

  return {
    correct: false,
    lesson: lessonPayload(updated),
    learning_item: currentItem,
  };
}

function normalizeLessonAnswer(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[.,!?;:]+$/g, "")
    .replace(/\s+/g, " ");
}

export async function nextLessonStep(
  telegramId: string,
) {
  const lesson = await getActiveLesson(telegramId);
  if (!lesson) throw new Error("No active lesson");

  if (lesson.current_step === "example") {
    const items = (lesson.test_data || []) as any[];
    const nextIndex = Number(lesson.completed_items || 0);
    const next = items[nextIndex];

    if (!next) {
      return lessonPayload(
        await updateLesson(lesson.id, {
          current_step: "test",
          test_items: Math.min(3, items.length),
          test_index: 0,
        }),
      );
    }

    return lessonPayload(
      await updateLesson(lesson.id, {
        current_word: next.content,
        current_translation: next.translation || null,
        current_example: next.example || null,
        current_step: "new_item",
        attempts: 0,
        correct_attempts: 0,
        wrong_attempts: 0,
      }),
    );
  }

  if (lesson.current_step === "repeat") {
    return lessonPayload(lesson);
  }

  if (lesson.current_step === "test") {
    return lessonPayload(lesson);
  }

  return lessonPayload(lesson);
}

export async function completeLesson(
  telegramId: string,
) {
  const lesson = await getActiveLesson(telegramId);
  if (!lesson) throw new Error("No active lesson");

  const updated = await updateLesson(
    lesson.id,
    {
      status: "completed",
      current_step: "done",
      completed_at: new Date().toISOString(),
    },
  );

  await incrementCompletedLessons(telegramId);

  return lessonPayload(updated);
}
