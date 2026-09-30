/* =========================================================
   AUDIO — TTS player + queue
   ========================================================= */

import { api } from "./api.js";
import { getState, setState } from "./state.js";

/* =========================================================
   SINGLE AUDIO ELEMENT
   ========================================================= */

let currentAudio = null;
let currentUrl = null;

/* =========================================================
   PLAY TTS
   ========================================================= */

/**
 * Получить аудио для текста (Blob).
 */
export async function fetchTts(text) {
  if (!text) return null;
  try {
    const blob = await api.tts(text);
    return blob;
  } catch (err) {
    console.error("TTS fetch error:", err);
    return null;
  }
}

/**
 * Проиграть Blob в чате.
 * container — DOM-узел, к которому крепится <audio>.
 * Возвращает Promise, который завершается когда воспроизведение закончилось
 * (или сразу — если autoplay заблокирован).
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

    const cleanup = () => {
      if (currentUrl === url) {
        URL.revokeObjectURL(url);
        currentUrl = null;
        currentAudio = null;
        setState({ currentAudio: null, currentAudioUrl: null });
      }
    };

    audio.addEventListener("ended", () => {
      cleanup();
      resolve(true);
    }, { once: true });

    audio.addEventListener("error", () => {
      cleanup();
      resolve(false);
    }, { once: true });

    audio.play()
      .then(() => {
        // autoplay ok
      })
      .catch((err) => {
        console.warn("Autoplay blocked:", err);
        // Резолвим сразу — пользователь нажмёт play вручную
        resolve(false);
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
}

export function getCurrentAudio() {
  return currentAudio;
}
