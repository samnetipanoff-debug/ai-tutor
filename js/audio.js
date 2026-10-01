/* =========================================================
   AUDIO — TTS player + voice-engine bridge
   ========================================================= */

import { api } from "./api.js";
import { getState, setState } from "./state.js";

/* =========================================================
   STATE
   ========================================================= */

let currentAudio = null;
let currentUrl = null;

/* =========================================================
   VOICE ENGINE BRIDGE
   ========================================================= */

function engineNotifyStart() {
  const engine = getState().voiceEngine;
  if (engine) engine.notifyTtsStart();
}

function engineNotifyEnd() {
  const engine = getState().voiceEngine;
  if (engine) engine.notifyTtsEnd();
}

/* =========================================================
   FETCH TTS
   ========================================================= */

/**
 * Получить TTS как Blob (audio/mpeg).
 * Поддерживает оба формата: сырой mp3 и {audio: base64}.
 */
export async function fetchTts(text) {
  if (!text) return null;

  try {
    const result = await api.tts(text);

    // api.tts возвращает Blob (по нашей текущей реализации)
    if (result instanceof Blob) return result;

    // fallback: если вернулся объект с base64
    if (result?.audio) {
      return base64ToBlob(result.audio, "audio/mpeg");
    }

    return null;
  } catch (err) {
    console.error("TTS fetch error:", err);
    return null;
  }
}

/* =========================================================
   PLAY BLOB
   ========================================================= */

/**
 * Проиграть Blob. Возвращает Promise<boolean>:
 *   true  — воспроизведение завершилось нормально
 *   false — autoplay заблокирован, ошибка, или прервано
 *
 * ВАЖНО: вызывать engineNotifyStart до play и engineNotifyEnd
 * после ended/error. Иначе VAD будет воспринимать эхо
 * от колонок как речь пользователя.
 */
export function playBlob(blob, container) {
  return new Promise((resolve) => {
    stopCurrent();

    const url = URL.createObjectURL(blob);
    const audio = document.createElement("audio");
    audio.controls = true;
    audio.className = "chat-audio";
    audio.src = url;

    if (container) container.appendChild(audio);

    currentAudio = audio;
    currentUrl = url;

    setState({
      currentAudio: audio,
      currentAudioUrl: url,
    });

    engineNotifyStart();

    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;

      if (currentUrl === url) {
        URL.revokeObjectURL(url);
        currentUrl = null;
        currentAudio = null;
        setState({ currentAudio: null, currentAudioUrl: null });
      }

      engineNotifyEnd();
      resolve(result);
    };

    audio.addEventListener("ended", () => finish(true), { once: true });
    audio.addEventListener("error", () => finish(false), { once: true });

    audio.play()
      .then(() => {
        // autoplay ok — ждём ended/error
      })
      .catch((err) => {
        console.warn("Autoplay blocked:", err);
        // Останавливаем и резолвим сразу — пользователь нажмёт play сам
        finish(false);
      });
  });
}

/* =========================================================
   STOP
   ========================================================= */

export function stopCurrent() {
  if (currentAudio) {
    try { currentAudio.pause(); } catch (_) {}
    try { currentAudio.currentTime = 0; } catch (_) {}
    currentAudio = null;
  }

  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
    currentUrl = null;
  }

  setState({ currentAudio: null, currentAudioUrl: null });

  // Сообщаем движку, что TTS закончился (даже если его не было — no-op)
  engineNotifyEnd();
}

export function getCurrentAudio() {
  return currentAudio;
}

/* =========================================================
   HELPERS
   ========================================================= */

function base64ToBlob(base64, mime) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}
