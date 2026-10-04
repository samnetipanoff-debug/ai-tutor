/* LESSONS — structured lesson flow */
import telegram from "../telegram.js";
import { api } from "../api.js";
import { getState, setState } from "../state.js";
import { t } from "../i18n.js";
import { navigate, showToast, showLoader, hideLoader } from "../app.js";
import { hydrateIcons } from "../icons.js";
import { fetchTts, playBlob, stopCurrent } from "../audio.js";

let lessonRecorder = null;
let lessonRecordingStream = null;
let lessonRecordingChunks = [];
let lessonRecordingStartedAt = 0;
let lessonRecordingTimer = null;

// Visual history for the Lessons tab. It never rewinds saved server progress.
let lessonViewHistory = [];
let lessonLiveSnapshot = null;
let lessonViewingHistory = false;

const TOPICS = [
  { code: "work", emoji: "💼" },
  { code: "food", emoji: "🍽" },
  { code: "travel", emoji: "✈️" },
  { code: "family", emoji: "👨‍👩‍👧" },
  { code: "hobby", emoji: "🎨" },
  { code: "shopping", emoji: "🛍" },
];

export function renderLessons() {
  const { profile, currentLesson } = getState();
  const lang = profile?.interface_language || "en";

  if (!currentLesson) {
    lessonViewHistory = [];
  }
  const wrapper = document.createElement("div");
  wrapper.className = "lessons";

  wrapper.innerHTML = `
    <div class="lessons-scroll">
      ${currentLesson
        ? renderLesson(currentLesson, lang)
        : renderLessonIntro(lang)}
    </div>
  `;

  hydrateIcons(wrapper);
  bindLessonEvents(wrapper);

  if (!currentLesson) {
    wrapper.querySelectorAll("[data-topic]").forEach((el) => {
      el.addEventListener("click", () => startLesson(el.getAttribute("data-topic"), wrapper));
    });
  }

  return wrapper;
}

function renderLesson(lesson, lang) {
  if (lesson.status === "completed" || lesson.current_step === "done") {
    return renderCompletedLesson(lesson, lang);
  }

  if (lesson.current_step === "test") {
    return renderTest(lesson, lang);
  }

  return renderLearningItem(lesson, lang);
}

function renderLessonIntro(lang) {
  return `
    <section class="lessons-intro">
      <span class="lessons-intro-icon"><span class="icon" data-icon="book"></span></span>
      <span class="lessons-intro-copy">
        <span class="lessons-intro-kicker">${escapeHtml(t("lessons.title", null, lang))}</span>
        <span class="lessons-intro-title">${escapeHtml(t("lessons.choose_topic", null, lang))}</span>
      </span>
    </section>
    <div class="lessons-section-title">${escapeHtml(t("lessons.choose_topic", null, lang))}</div>
    <div class="lessons-list">
      ${TOPICS.map((topic) => renderTopicItem(topic, lang)).join("")}
    </div>
  `;
}

function renderTopicItem(topic, lang) {
  const label = t(`lessons.topics.${topic.code}`, null, lang);
  return `
    <button class="lessons-item" type="button" data-topic="${topic.code}">
      <span class="lessons-item-emoji">${topic.emoji}</span>
      <span class="lessons-item-body">
        <span class="lessons-item-title">${escapeHtml(label)}</span>
      </span>
      <span class="lessons-item-status"><span class="icon" data-icon="check"></span></span>
    </button>
  `;
}

function renderLearningItem(lesson, lang) {
  const step = lesson.current_step || "new_item";
  const done = Number(lesson.completed_items || 0);
  const total = Number(lesson.total_items || 3);
  const isRepeat = step === "repeat";
  const voiceFeedback = getState().lessonVoiceFeedback;

  return `
    <section class="lesson-card">
      <div class="lesson-card-top">
        <span class="lesson-kicker">${escapeHtml(t("lessons.title", null, lang))}</span>
        <span class="lesson-counter">${done + 1} / ${total}</span>
      </div>

      <div class="lesson-progress"><span style="width:${Math.min(100, (done / total) * 100)}%"></span></div>

      <div class="lesson-item-type">${escapeHtml(lesson.current_step === "example"
        ? t("lessons.steps.example", null, lang)
        : t("lessons.steps.new_item", null, lang))}</div>

      <div class="lesson-item-content">${escapeHtml(lesson.current_word || "")}</div>

      ${lesson.current_translation
        ? `<div class="lesson-item-translation">${escapeHtml(lesson.current_translation)}</div>`
        : ""}

      ${lesson.current_example && step === "example"
        ? `<div class="lesson-example">${escapeHtml(lesson.current_example)}</div>`
        : ""}

      ${isRepeat && voiceFeedback
        ? `<div class="lesson-feedback is-error">${escapeHtml(t("lessons.feedback.incorrect", null, lang))}<br><span class="lesson-feedback-heard">${escapeHtml(voiceFeedback.heard)}</span>${voiceFeedback.explanation ? `<br><span>${escapeHtml(voiceFeedback.explanation)}</span>` : ""}<br><strong>${escapeHtml(voiceFeedback.correct || lesson.current_word || "")}</strong></div>`
        : ""}

      <div class="lesson-actions">
        ${lessonViewingHistory
          ? `<button class="lesson-action lesson-action-primary" type="button" data-lesson-current>
              ${escapeHtml(t("lessons.actions.current", null, lang))}
            </button>`
          : `
            ${lessonViewHistory.length
              ? `<button class="lesson-action lesson-action-secondary" type="button" data-lesson-back>
                  ${escapeHtml(t("lessons.actions.back", null, lang))}
                </button>`
              : ""}
            <button class="lesson-action lesson-action-secondary" type="button" data-listen>
              ${escapeHtml(t("lessons.actions.listen", null, lang))}
            </button>
            ${step === "example"
              ? `<button class="lesson-action lesson-action-primary" type="button" data-next>
                  ${escapeHtml(t("lessons.actions.next", null, lang))}
                </button>`
              : `<button class="lesson-action lesson-action-primary lesson-voice-answer" type="button" data-lesson-voice>
                  <span class="icon" data-icon="mic"></span>
                  <span data-lesson-voice-label>${escapeHtml(t("chat.record_voice", null, lang))}</span>
                </button>`}
          `}
      </div>   </section>
  `;
}

function renderTest(lesson, lang) {
  const item = lesson.test_current;
  if (!item) return renderCompletedLesson(lesson, lang);

  return `
    <section class="lesson-card">
      <div class="lesson-card-top">
        <span class="lesson-kicker">${escapeHtml(t("lessons.steps.test", null, lang))}</span>
        <span class="lesson-counter">${Number(lesson.test_index || 0) + 1} / ${Number(lesson.test_items || 3)}</span>
      </div>

      <div class="lesson-progress"><span style="width:${Math.min(100, (Number(lesson.test_index || 0) / Math.max(1, Number(lesson.test_items || 3))) * 100)}%"></span></div>

      <div class="lesson-test-prompt">${escapeHtml(item.translation || "")}</div>

      <div class="lesson-answer-row">
        <input class="lesson-answer" type="text" data-test-answer
          placeholder="${escapeHtml(t("lessons.actions.repeat", null, lang))}"
          autocomplete="off" />
        <button class="lesson-action lesson-action-primary" type="button" data-test-submit>
          ${escapeHtml(t("lessons.actions.next", null, lang))}
        </button>
      </div>
    </section>
  `;
}

function renderCompletedLesson(lesson, lang) {
  const total = Number(lesson.test_items || lesson.total_items || 0);
  const correct = Number(lesson.test_correct || 0);

  return `
    <section class="lesson-card lesson-complete-card">
      <div class="lesson-complete-icon">✓</div>
      <div class="lesson-item-type">${escapeHtml(t("lessons.feedback.lesson_done", null, lang))}</div>
      <div class="lesson-result">${escapeHtml(
        t("lessons.feedback.test_result", { correct, total }, lang),
      )}</div>
      <button class="lesson-action lesson-action-primary" type="button" data-new-lesson>
        ${escapeHtml(t("lessons.start_new", null, lang))}
      </button>
    </section>
    <div class="lessons-section-title">${escapeHtml(t("lessons.choose_topic", null, lang))}</div>
    <div class="lessons-list">
      ${TOPICS.map((topic) => renderTopicItem(topic, lang)).join("")}
    </div>
  `;
}

function bindLessonEvents(wrapper) {
  wrapper.querySelector("[data-lesson-back]")?.addEventListener("click", () => goBackLessonView(wrapper));
  wrapper.querySelector("[data-lesson-current]")?.addEventListener("click", () => returnToCurrentLessonView(wrapper));
  wrapper.querySelector("[data-listen]")?.addEventListener("click", () => listenCurrentItem(wrapper));
  wrapper.querySelector("[data-next]")?.addEventListener("click", () => nextStep(wrapper));
  wrapper.querySelector("[data-lesson-voice]")?.addEventListener("click", () => toggleLessonRecording(wrapper));
  wrapper.querySelector("[data-test-submit]")?.addEventListener("click", () => submitTestAnswer(wrapper));
  wrapper.querySelector("[data-new-lesson]")?.addEventListener("click", async () => {
    const lang = getState().profile?.interface_language || "en";
    setState({ lessonVoiceFeedback: null });

    try {
      showLoader();
      const result = await api.startLesson(null, true);
      lessonViewHistory = [];
      setState({ currentLesson: result.lesson, lessonVoiceFeedback: null });
      renderLessonsIntoCurrentScreen(wrapper);
    } catch (error) {
      console.error("new lesson error:", error);
      showToast(t("errors.network", null, lang), "error");
    } finally {
      hideLoader();
    }
  });

  wrapper.querySelector("[data-test-answer]")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") submitTestAnswer(wrapper);
  });
}

async function listenCurrentItem(wrapper) {
  const lesson = getState().currentLesson;
  if (!lesson?.current_word) return;

  const learningLanguage = getState().profile?.learning_language || "en";
  const blob = await fetchTts(lesson.current_word, learningLanguage);
  if (!blob) {
    showToast(t("errors.network", null, getState().profile?.interface_language || "en"), "error");
    return;
  }

  await playBlob(blob, null);
}

async function toggleLessonRecording(wrapper) {
  if (lessonRecorder?.state === "recording") {
    lessonRecorder.stop();
    return;
  }

  if (lessonRecorder) return;

  const lang = getState().profile?.interface_language || "en";
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    showToast(t("chat.error_voice", null, lang), "error");
    return;
  }

  try {
    lessonRecordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = getLessonRecordingMimeType();
    lessonRecorder = new MediaRecorder(
      lessonRecordingStream,
      mimeType ? { mimeType } : undefined,
    );
    lessonRecordingChunks = [];
    lessonRecordingStartedAt = Date.now();

    lessonRecorder.addEventListener("dataavailable", (event) => {
      if (event.data?.size) lessonRecordingChunks.push(event.data);
    });

    lessonRecorder.addEventListener("stop", async () => {
      const recorder = lessonRecorder;
      const blob = new Blob(lessonRecordingChunks, {
        type: recorder?.mimeType || mimeType || "audio/webm",
      });
      releaseLessonRecording();

      if (!blob.size) {
        resetLessonVoiceButton(wrapper);
        showToast(t("chat.error_voice", null, lang), "error");
        return;
      }

      await submitLessonVoice(wrapper, blob, blob.type || "audio/webm");
    });

    lessonRecorder.start(250);
    setLessonVoiceButton(wrapper, true);
  } catch (error) {
    console.error("lesson recording error:", error);
    releaseLessonRecording();
    resetLessonVoiceButton(wrapper);
    showToast(t("chat.hint_microphone_denied", null, lang), "error");
  }
}

function getLessonRecordingMimeType() {
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]
    .find((type) => {
      try { return MediaRecorder.isTypeSupported(type); } catch { return false; }
    }) || "";
}

function setLessonVoiceButton(wrapper, recording) {
  const button = wrapper.querySelector("[data-lesson-voice]");
  if (!button) return;

  if (recording) {
    button.classList.add("is-recording");
    button.innerHTML = '<span class="lesson-voice-dot"></span><span data-lesson-voice-label>00:00</span>';
    startLessonRecordingTimer(wrapper);
  } else {
    button.classList.remove("is-recording");
    const lang = getState().profile?.interface_language || "en";
    button.innerHTML = '<span class="icon" data-icon="mic"></span><span data-lesson-voice-label>' + escapeHtml(t("chat.record_voice", null, lang)) + '</span>';
    hydrateIcons(button);
    stopLessonRecordingTimer();
  }
}

function startLessonRecordingTimer(wrapper) {
  stopLessonRecordingTimer();
  const button = wrapper.querySelector("[data-lesson-voice]");
  lessonRecordingTimer = setInterval(() => {
    const label = button?.querySelector("[data-lesson-voice-label]");
    if (!label) return;
    const seconds = Math.floor((Date.now() - lessonRecordingStartedAt) / 1000);
    label.textContent = formatLessonDuration(seconds);
  }, 250);
}

function stopLessonRecordingTimer() {
  if (lessonRecordingTimer) clearInterval(lessonRecordingTimer);
  lessonRecordingTimer = null;
}

function formatLessonDuration(seconds) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function releaseLessonRecording() {
  stopLessonRecordingTimer();
  if (lessonRecordingStream) {
    lessonRecordingStream.getTracks().forEach((track) => track.stop());
    lessonRecordingStream = null;
  }
  lessonRecorder = null;
  lessonRecordingChunks = [];
}

function resetLessonVoiceButton(wrapper) {
  setLessonVoiceButton(wrapper, false);
}

async function submitLessonVoice(wrapper, blob, mimeType) {
  if (!blob?.size) return;

  setLessonBusy(wrapper, true);

  try {
    const result = await api.answerLessonVoice(blob, mimeType);
    if (!result?.lesson) throw new Error("Lesson voice answer failed");

    const feedback = result.correct
      ? null
      : {
          heard: result.text || "",
          correct: result.feedback?.corrected_text || result.lesson?.current_word || "",
          explanation: result.feedback?.explanation || "",
        };

    if (result.correct) {
      pushLessonViewHistory();
    }

    setState({
      currentLesson: result.lesson,
      lessonVoiceFeedback: feedback,
    });

    if (result.correct) telegram.haptic.notification("success");
    else telegram.haptic.notification("error");

    renderLessonsIntoCurrentScreen(wrapper);
  } catch (error) {
    console.error("lesson voice answer error:", error);
    showToast(t("errors.network", null, getState().profile?.interface_language || "en"), "error");
  } finally {
    setLessonBusy(wrapper, false);
  }
}

async function submitTestAnswer(wrapper) {
  const input = wrapper.querySelector("[data-test-answer]");
  const answer = input?.value?.trim();
  if (!answer) return;

  setLessonBusy(wrapper, true);

  try {
    const result = await api.answerLesson(answer);
    if (!result?.lesson) throw new Error("Test answer failed");

    setState({ currentLesson: result.lesson });

    if (result.correct) telegram.haptic.notification("success");
    else telegram.haptic.notification("error");

    renderLessonsIntoCurrentScreen(wrapper);
  } catch (error) {
    console.error("test answer error:", error);
    showToast(t("errors.network", null, getState().profile?.interface_language || "en"), "error");
  } finally {
    setLessonBusy(wrapper, false);
  }
}

async function nextStep(wrapper) {
  pushLessonViewHistory();
  setLessonBusy(wrapper, true);
  try {
    const result = await api.nextLessonStep();
    if (!result?.lesson) throw new Error("No next lesson step");
    setState({ currentLesson: result.lesson, lessonVoiceFeedback: null });
    renderLessonsIntoCurrentScreen(wrapper);
  } catch (error) {
    console.error("nextLessonStep error:", error);
    showToast(t("errors.network", null, getState().profile?.interface_language || "en"), "error");
  } finally {
    setLessonBusy(wrapper, false);
  }
}

async function startLesson(topic, wrapper) {
  showLoader();
  const lang = getState().profile?.interface_language || "en";

  try {
    const result = await api.startLesson(topic);
    if (!result?.lesson) throw new Error("No lesson returned");

    lessonViewHistory = [];
    setState({ currentLesson: result.lesson, lessonVoiceFeedback: null });
    telegram.haptic.notification("success");
    hideLoader();
    renderLessonsIntoCurrentScreen(wrapper);
  } catch (error) {
    console.error("startLesson error:", error);
    hideLoader();
    showToast(t("errors.network", null, lang), "error");
  }
}

function pushLessonViewHistory() {
  const lesson = getState().currentLesson;
  if (!lesson) return;

  lessonViewHistory.push({
    lesson: JSON.parse(JSON.stringify(lesson)),
    lessonVoiceFeedback: getState().lessonVoiceFeedback
      ? JSON.parse(JSON.stringify(getState().lessonVoiceFeedback))
      : null,
  });
}

function goBackLessonView(wrapper) {
  const previous = lessonViewHistory.pop();
  if (!previous) return;

  setState({
    currentLesson: previous.lesson,
    lessonVoiceFeedback: previous.lessonVoiceFeedback,
  });

  renderLessonsIntoCurrentScreen(wrapper);
}

function goBackLessonView(wrapper) {
  const current = getState().currentLesson;
  const previous = lessonViewHistory.pop();
  if (!previous) return;

  if (!lessonLiveSnapshot && current) {
    lessonLiveSnapshot = {
      lesson: JSON.parse(JSON.stringify(current)),
      lessonVoiceFeedback: getState().lessonVoiceFeedback
        ? JSON.parse(JSON.stringify(getState().lessonVoiceFeedback))
        : null,
    };
  }

  lessonViewingHistory = true;

  setState({
    currentLesson: previous.lesson,
    lessonVoiceFeedback: previous.lessonVoiceFeedback,
  });

  renderLessonsIntoCurrentScreen(wrapper);
}

function returnToCurrentLessonView(wrapper) {
  if (!lessonLiveSnapshot) return;

  const live = lessonLiveSnapshot;
  lessonLiveSnapshot = null;
  lessonViewHistory = [];
  lessonViewingHistory = false;

  setState({
    currentLesson: live.lesson,
    lessonVoiceFeedback: live.lessonVoiceFeedback,
  });

  renderLessonsIntoCurrentScreen(wrapper);
}

function renderLessonsIntoCurrentScreen(wrapper) {
  const parent = wrapper.parentElement;
  if (!parent) return;
  const next = renderLessons();
  parent.replaceChild(next, wrapper);
}

function setLessonBusy(wrapper, busy) {
  wrapper.querySelectorAll("button, input").forEach((el) => {
    el.disabled = busy;
  });
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
