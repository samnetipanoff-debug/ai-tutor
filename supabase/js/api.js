/* =========================================================
   API CLIENT for rapid-worker
   ========================================================= */

import telegram from "./telegram.js";

const RAPID_URL =
  "https://qnvuadgqpptazfnuadfe.supabase.co/functions/v1/rapid-worker";

/* =========================================================
   LOW-LEVEL
   ========================================================= */

async function postJson(payload) {
  const response = await fetch(RAPID_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      initData: telegram.initData,
      ...payload,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  return response.json();
}

async function postForm(formData) {
  formData.append("initData", telegram.initData);

  const response = await fetch(RAPID_URL, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  return response.json();
}

async function postBinary(payload) {
  const response = await fetch(RAPID_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      initData: telegram.initData,
      ...payload,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  return response.blob();
}

/* =========================================================
   PUBLIC API
   ========================================================= */

export const api = {
  /* ---------- Profile / Auth ---------- */

  /**
   * Получить профиль пользователя.
   * При первом запуске создаёт запись с onboarding_step='native_language'.
   */
  getProfile() {
    return postJson({});
  },

  /**
   * Сохранить шаг онбординга.
   * step: "interface_language" | "native_language" | "learning_language"
   *       | "level" | "goal" | "done"
   * value: string
   */
  saveOnboardingStep(step, value) {
    return postJson({
      onboarding: { step, value },
    });
  },

  /**
   * Обновить произвольные поля профиля.
   */
  updateProfile(patch) {
    return postJson({ profile_update: patch });
  },

  /* ---------- Chat ---------- */

  /**
   * Загрузить историю чата.
   */
  loadHistory() {
    return postJson({ load_history: true });
  },

  /**
   * Отправить текстовое сообщение.
   */
  sendText(message, isVoice = false) {
    return postJson({ message, voice: isVoice });
  },

  /**
   * Отправить голосовое сообщение (blob).
   * ВАЖНО: ожидается, что бэкенд вернёт { text, answer }.
   * Если сейчас возвращает только { text } — работает в fallback-режиме.
   */
  sendVoice(blob, mimeType = "audio/webm") {
    const formData = new FormData();

    const ext = mimeType.includes("mp4")
      ? "m4a"
      : mimeType.includes("mpeg")
        ? "mp3"
        : "webm";

    formData.append("audio", blob, `voice.${ext}`);
    return postForm(formData);
  },

  /**
   * Сгенерировать TTS. Возвращает Blob (audio/mpeg).
   */
  tts(text) {
    return postBinary({ tts: true, text });
  },

  /* ---------- Lessons ---------- */

  /**
   * Начать новый урок.
   */
  startLesson(topic = null) {
    return postJson({
      lesson: "start",
      topic,
    });
  },

  /**
   * Получить активный урок.
   */
  getCurrentLesson() {
    return postJson({ lesson: "current" });
  },

  /**
   * Ответить на текущий шаг урока.
   */
  answerLesson(answer) {
    return postJson({
      lesson: "answer",
      answer,
    });
  },

  /**
   * Перейти к следующему шагу урока.
   */
  nextLessonStep() {
    return postJson({ lesson: "next" });
  },

  /**
   * Завершить урок.
   */
  completeLesson() {
    return postJson({ lesson: "complete" });
  },

  /* ---------- Progress ---------- */

  /**
   * Получить статистику: progress, vocabulary, mistakes.
   */
  getProgress() {
    return postJson({ progress: true });
  },
};

export default api;
