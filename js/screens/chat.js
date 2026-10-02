/* CHAT — guided voice conversation */
import { api } from "../api.js";
import { getState, setState } from "../state.js";
import { t } from "../i18n.js";
import { showToast, setHeaderStatus, clearHeaderStatus } from "../app.js";
import { hydrateIcons } from "../icons.js";
import { fetchTts, playBlob, stopCurrent } from "../audio.js";

let sending = false;
let mediaRecorder = null;
let recordingStream = null;
let recordingChunks = [];
let recordingStartedAt = 0;
let recordingTimer = null;
let pendingVoiceBlob = null;
let pendingVoiceMime = "audio/webm";
let inactivityTimer = null;
let inactivityPromptShown = false;
let awaitingCorrectionRepeat = false;

const TOPICS = [
  { code: "work", emoji: "💼" },
  { code: "food", emoji: "🍽" },
  { code: "travel", emoji: "✈️" },
  { code: "family", emoji: "👨‍👩‍👧" },
  { code: "hobby", emoji: "🎨" },
  { code: "shopping", emoji: "🛍" },
];

export function renderChat() {
  resetRecordingState();
  clearInactivityTimer();

  const state = getState();
  const session = state.voiceSession;

  const wrapper = document.createElement("div");
  wrapper.className = "chat";

  if (!session) {
    renderSessionChooser(wrapper);
    return wrapper;
  }

  renderConversation(wrapper, session);
  return wrapper;
}

function renderSessionChooser(wrapper) {
  const { profile, currentLesson } = getState();
  const lang = profile?.interface_language || "en";

  wrapper.innerHTML = `
    <div class="voice-session-scroll">
      <section class="voice-session-hero">
        <div class="voice-session-kicker">${escapeHtml(t("chat.voice_mode", null, lang))}</div>
        <h1>${escapeHtml(t("chat.session_question", null, lang))}</h1>
        <p>${escapeHtml(t("chat.session_subtitle", null, lang))}</p>
      </section>

      <div class="voice-session-options">
        <button class="voice-session-option" type="button" data-session="continue">
          <span class="voice-session-option-icon">▶</span>
          <span><strong>${escapeHtml(t("chat.continue_lesson", null, lang))}</strong><small>${currentLesson ? escapeHtml(t("chat.current_lesson", null, lang)) : escapeHtml(t("chat.no_current_lesson", null, lang))}</small></span>
        </button>
        <button class="voice-session-option" type="button" data-session="repeat">
          <span class="voice-session-option-icon">↻</span>
          <span><strong>${escapeHtml(t("chat.repeat_lesson", null, lang))}</strong><small>${escapeHtml(t("chat.choose_lesson", null, lang))}</small></span>
        </button>
        <button class="voice-session-option is-wide" type="button" data-session="free">
          <span class="voice-session-option-icon">◌</span>
          <span><strong>${escapeHtml(t("chat.free_conversation", null, lang))}</strong><small>${escapeHtml(t("chat.free_conversation_hint", null, lang))}</small></span>
        </button>
      </div>
    </div>
  `;

  wrapper.querySelector('[data-session="continue"]')?.addEventListener("click", () => {
    if (currentLesson) {
      beginSession(wrapper, { mode: "lesson", lessonTopic: currentLesson.topic || "" });
    } else {
      showLessonPicker(wrapper);
    }
  });

  wrapper.querySelector('[data-session="repeat"]')?.addEventListener("click", () => showLessonPicker(wrapper));
  wrapper.querySelector('[data-session="free"]')?.addEventListener("click", () => {
    beginSession(wrapper, { mode: "free", lessonTopic: "" });
  });
}

function showLessonPicker(wrapper) {
  const { profile } = getState();
  const lang = profile?.interface_language || "en";

  wrapper.innerHTML = `
    <div class="voice-session-scroll">
      <section class="voice-session-hero compact">
        <div class="voice-session-kicker">${escapeHtml(t("chat.repeat_lesson", null, lang))}</div>
        <h1>${escapeHtml(t("chat.choose_lesson", null, lang))}</h1>
      </section>
      <div class="voice-lesson-grid">
        ${TOPICS.map((topic) => `
          <button class="voice-lesson-card" type="button" data-topic="${topic.code}">
            <span>${topic.emoji}</span>
            <strong>${escapeHtml(t(`lessons.topics.${topic.code}`, null, lang))}</strong>
          </button>
        `).join("")}
      </div>
      <button class="voice-back-choice" type="button" data-back-choice>${escapeHtml(t("chat.back_to_choices", null, lang))}</button>
    </div>
  `;

  wrapper.querySelectorAll("[data-topic]").forEach((button) => {
    button.addEventListener("click", async () => {
      const topic = button.getAttribute("data-topic");
      const old = button.innerHTML;
      button.disabled = true;
      button.innerHTML = `<strong>${escapeHtml(t("chat.loading_lesson", null, lang))}</strong>`;
      try {
        const result = await api.startLesson(topic);
        if (!result?.lesson) throw new Error("Lesson was not returned");
        setState({ currentLesson: result.lesson });
        beginSession(wrapper, { mode: "lesson", lessonTopic: topic });
      } catch (error) {
        console.error(error);
        button.disabled = false;
        button.innerHTML = old;
        showToast(t("errors.network", null, lang), "error");
      }
    });
  });

  wrapper.querySelector("[data-back-choice]")?.addEventListener("click", () => renderSessionChooser(wrapper));
}

function beginSession(wrapper, session) {
  setState({
    voiceSession: {
      mode: session.mode,
      lessonTopic: session.lessonTopic || "",
    },
  });
  renderConversation(wrapper, getState().voiceSession);
}

function renderConversation(wrapper, session) {
  const { profile, history } = getState();
  const lang = profile?.interface_language || "en";

  wrapper.innerHTML = `
    <div class="chat-scroll" id="chatScroll">
      <div class="chat-messages" id="chatMessages"></div>
    </div>

    <div class="voice-preview-wrap" id="voicePreviewWrap" hidden></div>

    <div class="chat-input">
      <input class="chat-input-field" id="chatInput" type="text" placeholder="${t("chat.placeholder", null, lang)}" autocomplete="off" />
      <button class="chat-input-btn" id="chatMic" type="button" aria-label="${t("chat.record_voice", null, lang)}">
        <span class="icon" data-icon="mic"></span>
      </button>
      <button class="chat-input-btn" id="chatSend" type="button" aria-label="${t("chat.send", null, lang)}">
        <span class="icon" data-icon="check"></span>
      </button>
    </div>
  `;

  hydrateIcons(wrapper);

  const messages = wrapper.querySelector("#chatMessages");
  const input = wrapper.querySelector("#chatInput");
  const sendBtn = wrapper.querySelector("#chatSend");
  const micBtn = wrapper.querySelector("#chatMic");
  const scroll = wrapper.querySelector("#chatScroll");

  renderHistory(messages, history);

  sendBtn.addEventListener("click", () => sendTextMessage(input.value, messages, input, sendBtn));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendTextMessage(input.value, messages, input, sendBtn);
    }
  });

  micBtn.addEventListener("click", () => {
    if (mediaRecorder?.state === "recording") stopRecording();
    else startRecording(wrapper);
  });

  scrollToBottom(scroll);

  if (!history?.length) {
    requestTutorOpening(wrapper);
  } else {
    armInactivityTimer(wrapper);
  }
}

async function requestTutorOpening(wrapper) {
  const messages = wrapper.querySelector("#chatMessages");
  const session = getState().voiceSession;
  if (!messages || !session) return;

  const lang = getState().profile?.interface_language || "en";
  const text = session.mode === "lesson"
    ? t("chat.lesson_opening", null, lang)
    : t("chat.free_opening", null, lang);

  // The opening is intentionally a UI prompt only. The first learner voice message
  // goes through the normal tutor pipeline so the conversation remains persistent.
  appendMessage(messages, "bot", text);
  armInactivityTimer(wrapper);
}

function renderHistory(messages, history) {
  if (!Array.isArray(history)) return;
  for (const message of history) {
    if (!message?.role || !message?.content) continue;
    if (typeof message.content === "object" && message.content.type === "voice") {
      appendVoiceMessage(messages, message.role === "user" ? "user" : "bot", message.content);
    } else {
      appendMessage(messages, message.role === "user" ? "user" : "bot", String(message.content));
    }
  }
}

function appendMessage(container, role, text) {
  const empty = container.querySelector(".chat-empty");
  if (empty) empty.remove();

  const wrapper = document.createElement("div");
  wrapper.className = `msg is-${role}`;
  const bubble = document.createElement("div");
  bubble.className = "msg-bubble";
  bubble.textContent = text;
  wrapper.appendChild(bubble);
  container.appendChild(wrapper);
  scrollToBottom(container.closest(".chat-scroll"));
  return bubble;
}

function appendVoiceMessage(container, role, voice) {
  const wrapper = document.createElement("div");
  wrapper.className = `msg is-${role}`;
  const bubble = document.createElement("div");
  bubble.className = "msg-voice";

  const audio = document.createElement("audio");
  audio.controls = true;
  audio.preload = "metadata";
  if (voice.audio_url) audio.src = voice.audio_url;

  const meta = document.createElement("div");
  meta.className = "msg-voice-label";
  meta.textContent = role === "user"
    ? t("chat.you_voice", null, getState().profile?.interface_language || "en")
    : t("chat.tutor_voice", null, getState().profile?.interface_language || "en");

  bubble.append(meta, audio);

  if (voice.transcript) {
    const transcript = document.createElement("div");
    transcript.className = "msg-voice-transcript";
    transcript.textContent = voice.transcript;
    bubble.appendChild(transcript);
  }

  if (voice.text) {
    const text = document.createElement("div");
    text.className = "msg-voice-text";
    text.textContent = voice.text;
    bubble.appendChild(text);
  }

  if (voice.translation) {
    const translation = document.createElement("div");
    translation.className = "msg-voice-translation";
    translation.textContent = voice.translation;
    bubble.appendChild(translation);
  }

  wrapper.appendChild(bubble);
  container.appendChild(wrapper);

  if (voice.correction?.corrected) {
    appendCorrection(container, voice.correction);
  }

  scrollToBottom(container.closest(".chat-scroll"));
  return bubble;
}

function appendCorrection(container, correction) {
  if (!correction?.corrected) return;

  const wrapper = document.createElement("div");
  wrapper.className = "msg is-bot";
  const card = document.createElement("div");
  card.className = "msg-correction";

  const label = document.createElement("div");
  label.className = "msg-correction-label";
  label.textContent = t("chat.correction", null, getState().profile?.interface_language || "en");

  const corrected = document.createElement("div");
  corrected.className = "msg-correction-text";
  corrected.textContent = correction.corrected;

  card.append(label, corrected);

  if (correction.explanation) {
    const explanation = document.createElement("div");
    explanation.className = "msg-correction-explanation";
    explanation.textContent = correction.explanation;
    card.appendChild(explanation);
  }

  wrapper.appendChild(card);
  container.appendChild(wrapper);
  scrollToBottom(container.closest(".chat-scroll"));
}

function appendThinking(container) {
  const wrapper = document.createElement("div");
  wrapper.className = "msg is-bot";
  const bubble = document.createElement("div");
  bubble.className = "msg-bubble";
  const thinking = document.createElement("div");
  thinking.className = "msg-thinking";
  thinking.innerHTML = "<span></span><span></span><span></span>";
  bubble.appendChild(thinking);
  wrapper.appendChild(bubble);
  container.appendChild(wrapper);
  scrollToBottom(container.closest(".chat-scroll"));
  return wrapper;
}

async function sendTextMessage(raw, messages, input, sendBtn) {
  const text = (raw || "").trim();
  if (!text || sending) return;

  sending = true;
  sendBtn.disabled = true;
  input.value = "";
  stopCurrent();
  clearInactivityTimer();

  appendMessage(messages, "user", text);
  const thinking = appendThinking(messages);

  try {
    const data = await api.sendText(text);
    thinking.remove();
    if (!data?.answer) throw new Error("No answer");
    const bubble = appendMessage(messages, "bot", data.answer);
    const { history } = getState();
    setState({ history: [...(history || []), { role: "user", content: text }, { role: "assistant", content: data.answer }] });
    await playAnswer(data.answer, bubble);
    armInactivityTimer(messages.closest(".chat"));
  } catch (error) {
    console.error(error);
    thinking.remove();
    appendMessage(messages, "bot", t("chat.error_send", null, getState().profile?.interface_language || "en"));
  } finally {
    sending = false;
    sendBtn.disabled = false;
  }
}

async function startRecording(wrapper) {
  if (sending || mediaRecorder) return;

  const lang = getState().profile?.interface_language || "en";
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    showToast(t("chat.error_voice", null, lang), "error");
    return;
  }

  try {
    recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = getRecordingMimeType();
    mediaRecorder = new MediaRecorder(recordingStream, mimeType ? { mimeType } : undefined);
    recordingChunks = [];
    recordingStartedAt = Date.now();
    pendingVoiceBlob = null;
    pendingVoiceMime = mediaRecorder.mimeType || mimeType || "audio/webm";

    mediaRecorder.addEventListener("dataavailable", (event) => {
      if (event.data?.size) recordingChunks.push(event.data);
    });

    mediaRecorder.addEventListener("stop", () => {
      const blob = new Blob(recordingChunks, { type: pendingVoiceMime });
      releaseRecordingStream();
      mediaRecorder = null;
      recordingChunks = [];

      if (!blob.size) {
        resetRecordingUI(wrapper);
        showToast(t("chat.error_voice", null, lang), "error");
        return;
      }

      pendingVoiceBlob = blob;
      showVoicePreview(wrapper);
    });

    mediaRecorder.start(250);
    setRecordingUI(wrapper, true);
    setHeaderStatus("chat.recording", "listening");
  } catch (error) {
    console.error(error);
    releaseRecordingStream();
    mediaRecorder = null;
    showToast(t("chat.hint_microphone_denied", null, lang), "error");
  }
}

function stopRecording() {
  if (!mediaRecorder || mediaRecorder.state !== "recording") return;
  mediaRecorder.stop();
  setHeaderStatus("chat.processing_recording", "thinking");
}

function getRecordingMimeType() {
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]
    .find((type) => {
      try { return MediaRecorder.isTypeSupported(type); } catch { return false; }
    }) || "";
}

function releaseRecordingStream() {
  if (!recordingStream) return;
  recordingStream.getTracks().forEach((track) => track.stop());
  recordingStream = null;
}

function setRecordingUI(wrapper, active) {
  const micBtn = wrapper.querySelector("#chatMic");
  const input = wrapper.querySelector("#chatInput");
  const sendBtn = wrapper.querySelector("#chatSend");
  if (!micBtn) return;

  if (active) {
    micBtn.classList.add("is-recording");
    micBtn.innerHTML = '<span class="voice-recording-time">00:00</span>';
    input.disabled = true;
    sendBtn.disabled = true;
    startRecordingTimer(wrapper);
  } else {
    micBtn.classList.remove("is-recording");
    micBtn.innerHTML = '<span class="icon" data-icon="mic"></span>';
    hydrateIcons(micBtn);
    input.disabled = false;
    sendBtn.disabled = false;
    stopRecordingTimer();
  }
}

function startRecordingTimer(wrapper) {
  stopRecordingTimer();
  const micBtn = wrapper.querySelector("#chatMic");
  recordingTimer = setInterval(() => {
    if (!micBtn) return;
    const seconds = Math.floor((Date.now() - recordingStartedAt) / 1000);
    micBtn.querySelector(".voice-recording-time").textContent = formatDuration(seconds);
  }, 250);
}

function stopRecordingTimer() {
  if (recordingTimer) clearInterval(recordingTimer);
  recordingTimer = null;
}

function formatDuration(seconds) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function showVoicePreview(wrapper) {
  setRecordingUI(wrapper, false);
  const wrap = wrapper.querySelector("#voicePreviewWrap");
  if (!wrap) return;

  const lang = getState().profile?.interface_language || "en";
  const duration = Math.max(1, Math.round((Date.now() - recordingStartedAt) / 1000));

  wrap.hidden = false;
  wrap.innerHTML = `
    <div class="voice-preview">
      <div class="voice-preview-icon"><span class="icon" data-icon="mic"></span></div>
      <div class="voice-preview-info"><strong>${t("chat.voice_ready", null, lang)}</strong><span>${formatDuration(duration)}</span></div>
      <div class="voice-preview-actions">
        <button class="voice-preview-cancel" type="button">${t("chat.delete_voice", null, lang)}</button>
        <button class="voice-preview-send" type="button"><span class="icon" data-icon="check"></span><span>${t("chat.send_voice", null, lang)}</span></button>
      </div>
    </div>`;

  hydrateIcons(wrap);
  wrap.querySelector(".voice-preview-cancel")?.addEventListener("click", () => {
    pendingVoiceBlob = null;
    wrap.hidden = true;
    wrap.innerHTML = "";
    clearHeaderStatus();
  });
  wrap.querySelector(".voice-preview-send")?.addEventListener("click", () => sendPendingVoice(wrapper));
  clearHeaderStatus();
}

async function sendPendingVoice(wrapper) {
  if (!pendingVoiceBlob || sending) return;

  const blob = pendingVoiceBlob;
  const mimeType = pendingVoiceMime;
  pendingVoiceBlob = null;

  const wrap = wrapper.querySelector("#voicePreviewWrap");
  if (wrap) { wrap.hidden = true; wrap.innerHTML = ""; }

  const messages = wrapper.querySelector("#chatMessages");
  if (!messages) return;

  sending = true;
  clearInactivityTimer();
  stopCurrent();
  const thinking = appendThinking(messages);
  const session = getState().voiceSession || { mode: "free", lessonTopic: "" };

  try {
    const data = await api.sendVoice(blob, mimeType, {
      mode: session.mode,
      lessonTopic: session.lessonTopic,
      retryingCorrection: awaitingCorrectionRepeat,
    });

    thinking.remove();

    if (!data?.user_voice?.audio_url || !data?.bot_voice?.audio_url) {
      throw new Error("Persistent voice audio is missing");
    }

    appendVoiceMessage(messages, "user", {
      audio_url: data.user_voice.audio_url,
      transcript: data.user_voice.transcript || data.text,
      correction: data.correction,
    });

    appendVoiceMessage(messages, "bot", {
      audio_url: data.bot_voice.audio_url,
      text: data.bot_voice.text || data.answer,
      translation: data.bot_voice.translation || data.translation,
    });

    awaitingCorrectionRepeat = Boolean(data.requires_repeat);

    const { history } = getState();
    const userContent = {
      type: "voice",
      audio_url: data.user_voice.audio_url,
      transcript: data.user_voice.transcript || data.text,
    };
    const botContent = {
      type: "voice",
      audio_url: data.bot_voice.audio_url,
      text: data.bot_voice.text || data.answer,
      translation: data.bot_voice.translation || data.translation,
      correction: data.correction,
      requires_repeat: data.requires_repeat,
    };

    setState({
      history: [...(history || []), { role: "user", content: userContent }, { role: "assistant", content: botContent }],
    });

    armInactivityTimer(wrapper);
  } catch (error) {
    console.error("voice error:", error);
    thinking.remove();
    appendMessage(messages, "bot", t("chat.error_voice", null, getState().profile?.interface_language || "en"));
    setHeaderStatus("chat.error_voice", "error");
    setTimeout(clearHeaderStatus, 3000);
  } finally {
    sending = false;
  }
}

function armInactivityTimer(wrapper) {
  clearInactivityTimer();
  if (!wrapper || !getState().voiceSession) return;

  inactivityTimer = setTimeout(() => {
    if (sending || mediaRecorder || pendingVoiceBlob || inactivityPromptShown) return;

    inactivityPromptShown = true;
    const messages = wrapper.querySelector("#chatMessages");
    if (!messages) return;

    const card = document.createElement("div");
    card.className = "voice-inactivity";
    card.innerHTML = `
      <div class="voice-inactivity-text">${escapeHtml(getInactivityQuestion())}</div>
      <div class="voice-inactivity-actions">
        <button type="button" data-continue>${escapeHtml(t("chat.continue", null, getState().profile?.interface_language || "en"))}</button>
        <button type="button" data-finish>${escapeHtml(t("chat.finish", null, getState().profile?.interface_language || "en"))}</button>
      </div>`;

    messages.appendChild(card);
    scrollToBottom(messages.closest(".chat-scroll"));

    card.querySelector("[data-continue]")?.addEventListener("click", () => {
      inactivityPromptShown = false;
      card.remove();
      armInactivityTimer(wrapper);
    });

    card.querySelector("[data-finish]")?.addEventListener("click", () => {
      card.remove();
      clearInactivityTimer();
      setState({ voiceSession: null });
      renderSessionChooser(wrapper);
    });
  }, 45000);
}

function getInactivityQuestion() {
  const lang = getState().profile?.learning_language || "en";
  const questions = {
    en: "Shall we continue or finish for today?",
    ru: "Продолжим или закончим на сегодня?",
    sr: "Da li nastavljamo ili završavamo za danas?",
    de: "Machen wir weiter oder beenden wir für heute?",
    es: "¿Continuamos o terminamos por hoy?",
    fr: "On continue ou on s’arrête pour aujourd’hui?",
  };
  return questions[lang] || questions.en;
}

function clearInactivityTimer() {
  if (inactivityTimer) clearTimeout(inactivityTimer);
  inactivityTimer = null;
}

function resetRecordingState() {
  stopRecordingTimer();
  releaseRecordingStream();
  mediaRecorder = null;
  recordingChunks = [];
  pendingVoiceBlob = null;
}

function resetRecordingUI(wrapper) {
  const wrap = wrapper.querySelector("#voicePreviewWrap");
  if (wrap) { wrap.hidden = true; wrap.innerHTML = ""; }
  setRecordingUI(wrapper, false);
  clearHeaderStatus();
}

async function playAnswer(text, bubble) {
  setHeaderStatus("chat.hint_speaking", "speaking");
  const blob = await fetchTts(text);
  if (blob) await playBlob(blob, bubble);
  clearHeaderStatus();
}

function scrollToBottom(scroll) {
  if (!scroll) return;
  requestAnimationFrame(() => { scroll.scrollTop = scroll.scrollHeight; });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
