/* =========================================================
   GLOBAL STATE
   ========================================================= */

const state = {
  // Пользователь и профиль
  user: null,
  profile: null,

  // Куда идти после bootstrap
  // "loading" | "onboarding" | "app"
  phase: "loading",

  // Текущий экран: "chat" | "lessons" | "progress" | "profile" | "menu"
  screen: "menu",

  // История чата
  history: [],

  // Активный урок (объект из БД или null)
  currentLesson: null,
  voiceSession: null,

  // Прогресс
  progress: null,
  vocabulary: [],
  mistakes: [],

  // Голосовой движок
  voiceEngine: null,

  // Текущее аудио (TTS)
  currentAudio: null,
  currentAudioUrl: null,

  // Флаги занятости
  busy: {
    sending: false,
    thinking: false,
    speaking: false,
  },
};

/* =========================================================
   SUBSCRIBERS
   ========================================================= */

const listeners = new Set();

/**
 * Подписка на изменения state.
 * Возвращает unsubscribe-функцию.
 */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  for (const fn of listeners) {
    try {
      fn(state);
    } catch (err) {
      console.error("state listener error:", err);
    }
  }
}

/* =========================================================
   GET / SET
   ========================================================= */

export function getState() {
  return state;
}

export function setState(patch) {
  Object.assign(state, patch);
  notify();
}

export function updateState(updater) {
  const next = updater(state);
  if (next) Object.assign(state, next);
  notify();
}

/* =========================================================
   HELPERS
   ========================================================= */

export function isOnboarded() {
  return state.profile?.onboarding_step === "done";
}

export function getInterfaceLanguage() {
  return (
    state.profile?.interface_language ||
    state.user?.language_code ||
    "en"
  );
}

export function getNativeLanguage() {
  return state.profile?.native_language || getInterfaceLanguage();
}

export function getLearningLanguage() {
  return state.profile?.learning_language || "en";
}

export function setBusy(key, value) {
  state.busy[key] = Boolean(value);
  notify();
}

export default state;
