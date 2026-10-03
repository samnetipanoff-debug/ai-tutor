/* LESSONS — structured lesson flow */
import telegram from "../telegram.js";
import { api } from "../api.js";
import { getState, setState } from "../state.js";
import { t } from "../i18n.js";
import { navigate, showToast, showLoader, hideLoader } from "../app.js";
import { hydrateIcons } from "../icons.js";
import { fetchTts, playBlob, stopCurrent } from "../audio.js";

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

      ${isRepeat
        ? `<div class="lesson-feedback is-error">${escapeHtml(t("lessons.feedback.incorrect", null, lang))}</div>`
        : ""}

      <div class="lesson-actions">
        <button class="lesson-action lesson-action-secondary" type="button" data-listen>
          ${escapeHtml(t("lessons.actions.listen", null, lang))}
        </button>
        ${step === "example"
          ? `<button class="lesson-action lesson-action-primary" type="button" data-next>
              ${escapeHtml(t("lessons.actions.next", null, lang))}
            </button>`
          : `<div class="lesson-answer-row">
              <input class="lesson-answer" type="text" data-answer
                placeholder="${escapeHtml(t("lessons.actions.repeat", null, lang))}"
                autocomplete="off" />
              <button class="lesson-action lesson-action-primary" type="button" data-answer-submit>
                ${escapeHtml(t("lessons.actions.repeat", null, lang))}
              </button>
            </div>`}
      </div>
    </section>
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
  wrapper.querySelector("[data-listen]")?.addEventListener("click", () => listenCurrentItem(wrapper));
  wrapper.querySelector("[data-next]")?.addEventListener("click", () => nextStep(wrapper));
  wrapper.querySelector("[data-answer-submit]")?.addEventListener("click", () => submitAnswer(wrapper));
  wrapper.querySelector("[data-test-submit]")?.addEventListener("click", () => submitTestAnswer(wrapper));
  wrapper.querySelector("[data-new-lesson]")?.addEventListener("click", () => {
    setState({ currentLesson: null });
    renderLessonsIntoCurrentScreen(wrapper);
  });

  wrapper.querySelector("[data-answer]")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") submitAnswer(wrapper);
  });

  wrapper.querySelector("[data-test-answer]")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") submitTestAnswer(wrapper);
  });
}

async function listenCurrentItem(wrapper) {
  const lesson = getState().currentLesson;
  if (!lesson?.current_word) return;

  const blob = await fetchTts(lesson.current_word);
  if (!blob) {
    showToast(t("errors.network", null, getState().profile?.interface_language || "en"), "error");
    return;
  }

  const actions = wrapper.querySelector(".lesson-actions");
  await playBlob(blob, actions);
}

async function submitAnswer(wrapper) {
  const input = wrapper.querySelector("[data-answer]");
  const answer = input?.value?.trim();
  if (!answer) return;

  setLessonBusy(wrapper, true);

  try {
    const result = await api.answerLesson(answer);
    if (!result?.lesson) throw new Error("Lesson answer failed");

    setState({ currentLesson: result.lesson });

    if (result.correct) {
      telegram.haptic.notification("success");
      renderLessonsIntoCurrentScreen(wrapper);
    } else {
      telegram.haptic.notification("error");
      renderLessonsIntoCurrentScreen(wrapper);
      const lang = getState().profile?.interface_language || "en";
      showToast(t("lessons.feedback.incorrect", null, lang), "error");
    }
  } catch (error) {
    console.error("answerLesson error:", error);
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
  setLessonBusy(wrapper, true);
  try {
    const result = await api.nextLessonStep();
    if (!result?.lesson) throw new Error("No next lesson step");
    setState({ currentLesson: result.lesson });
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

    setState({ currentLesson: result.lesson });
    telegram.haptic.notification("success");
    hideLoader();
    renderLessonsIntoCurrentScreen(wrapper);
  } catch (error) {
    console.error("startLesson error:", error);
    hideLoader();
    showToast(t("errors.network", null, lang), "error");
  }
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
