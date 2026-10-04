/* =========================================================
   PROGRESS SCREEN
   ========================================================= */

import { api } from "../api.js";
import { getState, setState } from "../state.js";
import { t } from "../i18n.js";
import { showToast } from "../app.js";
import { hydrateIcons } from "../icons.js";

export function renderProgress() {
  const wrapper = document.createElement("div");
  wrapper.className = "progress";

  wrapper.innerHTML = `
    <div class="progress-scroll" id="progressScroll">
      <div class="empty">
        <div class="empty-icon">📊</div>
        <div class="empty-title">…</div>
      </div>
    </div>
  `;

  // Асинхронная загрузка — рисуем после ответа
  loadAndRender(wrapper);

  return wrapper;
}

/* =========================================================
   LOAD
   ========================================================= */

async function loadAndRender(wrapper) {
  const lang = getState().profile?.interface_language || "en";
  const scroll = wrapper.querySelector("#progressScroll");

  try {
    const data = await api.getProgress();

    const progress = data?.progress || {};
    const vocabulary = data?.vocabulary || [];
    const mistakes = data?.mistakes || [];
    const skillProgress = data?.skill_progress || [];
    const learningItems = data?.learning_items || [];
    const lessons = data?.lessons || [];

    setState({
      progress,
      vocabulary,
      mistakes,
      skillProgress,
      learningItems,
      lessons,
    });

    scroll.innerHTML = renderContent(
      progress,
      vocabulary,
      mistakes,
      skillProgress,
      learningItems,
      lessons,
      lang,
    );
  } catch (error) {
    console.error("progress load error:", error);

    // Показываем дефолтные нули, если бэкенд не отвечает
    scroll.innerHTML = renderContent({}, [], [], [], [], [], lang);
    showToast(t("errors.network", null, lang), "error");
  }

  hydrateIcons(wrapper);
}

/* =========================================================
   CONTENT
   ========================================================= */

function renderContent(progress, vocabulary, mistakes, skillProgress, learningItems, lessons, lang) {
  const lessonsCount = progress.lessons_completed || 0;
  const wordsCount = progress.words_learned || 0;
  const mistakesCount = progress.mistakes_count || 0;
  const streak = progress.streak || 0;

  return `
    <section class="progress-hero"><div class="progress-hero-kicker">${t("progress.title",null,lang)}</div><div class="progress-hero-title">${t("progress.title",null,lang)}</div><div class="progress-hero-sub">${t("progress.lessons_completed",null,lang)} · ${lessonsCount}</div></section>

    <div class="progress-stats">
      ${statCard("book", lessonsCount, t("progress.lessons_completed", null, lang))}
      ${statCard("sparkles", wordsCount, t("progress.words_learned", null, lang))}
      ${statCard("check", mistakesCount, t("progress.mistakes_count", null, lang))}
      ${statCard("flame", streak, t("progress.streak", null, lang))}
    </div>

    <div class="progress-section">
      <div class="progress-section-title">
        ${t("progress.learning_progress", null, lang)}
      </div>
      ${renderLearningProgress(skillProgress, learningItems, lang)}
    </div>

    <div class="progress-section">
      <div class="progress-section-title">
        ${t("progress.test_statistics", null, lang)}
      </div>
      ${renderTestStatistics(lessons, lang)}
    </div>

    <div class="progress-section">
      <div class="progress-section-title">
        ${t("progress.lesson_history", null, lang)}
      </div>
      ${renderLessonHistory(lessons, lang)}
    </div>

    <div class="progress-section">
      <div class="progress-section-title">
        ${t("progress.weak_spots", null, lang)}
      </div>
      ${renderWeakSpots(mistakes, lang)}
    </div>

    <div class="progress-section">
      <div class="progress-section-title">
        ${t("progress.recent_mistakes", null, lang)}
      </div>
      ${renderMistakes(mistakes, lang)}
    </div>

    <div class="progress-section">
      <div class="progress-section-title">
        ${t("progress.vocabulary", null, lang)}
      </div>
      ${renderVocabulary(vocabulary, lang)}
    </div>
  `;
}

function renderLessonHistory(lessons, lang) {
  if (!lessons || lessons.length === 0) {
    return `<div class="progress-empty">${t("progress.no_lesson_history", null, lang)}</div>`;
  }

  return `
    <div class="progress-list">
      ${lessons
        .slice(0, 10)
        .map((lesson) => {
          const completed = lesson.status === "completed";
          const testTotal = Number(lesson.test_items || 0);
          const testCorrect = Number(lesson.test_correct || 0);
          const score = testTotal > 0
            ? `${testCorrect}/${testTotal}`
            : `${Number(lesson.score || 0)}/${Number(lesson.total_items || 0)}`;
          const percentage = testTotal > 0
            ? Math.round((testCorrect / testTotal) * 100)
            : 0;

          return `
            <div class="progress-list-item">
              <div class="progress-list-item-row">
                <div class="progress-list-item-word">
                  #${Number(lesson.lesson_number || 0)} ${escapeHtml(lesson.topic || t("progress.general_lesson", null, lang))}
                </div>
                <div class="progress-list-item-translation">
                  ${completed ? t("progress.completed", null, lang) : t("progress.in_progress", null, lang)}
                </div>
              </div>
              <div class="progress-list-item-sub">
                ${t("progress.test_result_short", { score }, lang)}${testTotal > 0 ? ` · ${percentage}%` : ""}
              </div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderTestStatistics(lessons, lang) {
  const testedLessons = (lessons || []).filter(
    (lesson) => Number(lesson.test_items || 0) > 0,
  );

  const testsCount = testedLessons.length;
  const correctAnswers = testedLessons.reduce(
    (sum, lesson) => sum + Number(lesson.test_correct || 0),
    0,
  );
  const totalAnswers = testedLessons.reduce(
    (sum, lesson) => sum + Number(lesson.test_items || 0),
    0,
  );
  const percentage = totalAnswers > 0
    ? Math.round((correctAnswers / totalAnswers) * 100)
    : 0;

  if (testsCount === 0) {
    return `<div class="progress-empty">${t("progress.no_test_statistics", null, lang)}</div>`;
  }

  return `
    <div class="progress-stats progress-test-stats">
      ${statCard("check", testsCount, t("progress.tests_completed", null, lang))}
      ${statCard("sparkles", `${correctAnswers}/${totalAnswers}`, t("progress.correct_answers", null, lang))}
      ${statCard("chart", `${percentage}%`, t("progress.test_accuracy", null, lang))}
    </div>
  `;
}
function renderLearningProgress(skillProgress, learningItems, lang) {
  if (!skillProgress || skillProgress.length === 0) {
    return `<div class="progress-empty">${t("progress.no_learning_progress", null, lang)}</div>`;
  }

  const itemsById = new Map(
    (learningItems || []).map((item) => [String(item.id), item]),
  );

  return `
    <div class="progress-list">
      ${skillProgress
        .slice()
        .sort((a, b) => Number(b.mastery || 0) - Number(a.mastery || 0))
        .slice(0, 10)
        .map((skill) => {
          const item = itemsById.get(String(skill.learning_item_id));
          if (!item) return "";

          const mastery = Math.max(
            0,
            Math.min(100, Math.round(Number(skill.mastery || 0) * 100)),
          );
          const statusKey =
            skill.status === "mastered"
              ? "mastered"
              : skill.status === "weak"
                ? "weak"
                : "learning";

          return `
            <div class="progress-list-item progress-learning-item">
              <div class="progress-learning-head">
                <div>
                  <div class="progress-list-item-word">${escapeHtml(item.content || "")}</div>
                  ${item.translation ? `<div class="progress-list-item-sub">${escapeHtml(item.translation)}</div>` : ""}
                </div>
                <div class="progress-learning-percent">${mastery}%</div>
              </div>
              <div class="progress-learning-bar">
                <div class="progress-learning-fill" style="width:${mastery}%"></div>
              </div>
              <div class="progress-learning-meta">
                <span>${t(`progress.status_${statusKey}`, null, lang)}</span>
                <span>${Number(skill.attempts || 0)} ${t("progress.attempts", null, lang)}</span>
              </div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderWeakSpots(mistakes, lang) {
  const topics = new Map();

  (mistakes || []).forEach((mistake) => {
    const topic = String(mistake.grammar_topic || "").trim();
    if (!topic) return;
    topics.set(topic, (topics.get(topic) || 0) + 1);
  });

  if (topics.size === 0) {
    return `<div class="progress-empty">${t("progress.no_weak_spots", null, lang)}</div>`;
  }

  return `
    <div class="progress-list">
      ${Array.from(topics.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(
          ([topic, count]) => `
            <div class="progress-list-item progress-weak-item">
              <div class="progress-list-item-main">${escapeHtml(topic)}</div>
              <div class="progress-list-item-sub">${count} ${t("progress.mistake_label", null, lang)}</div>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function statCard(icon, value, label) {
  return `
    <div class="progress-stat">
      <div class="progress-stat-icon">
        <span class="icon" data-icon="${icon}"></span>
      </div>
      <div class="progress-stat-value">${value}</div>
      <div class="progress-stat-label">${label}</div>
    </div>
  `;
}

function renderMistakes(mistakes, lang) {
  if (!mistakes || mistakes.length === 0) {
    return `<div class="progress-empty">${t("progress.no_mistakes", null, lang)}</div>`;
  }

  return `
    <div class="progress-list">
      ${mistakes
        .slice(0, 5)
        .map(
          (m) => `
            <div class="progress-list-item">
              <div class="progress-list-item-main">
                <span style="color: var(--c-danger); text-decoration: line-through;">
                  ${escapeHtml(m.original_text || "")}
                </span>
                 / 
                <span style="color: var(--green);">
                  ${escapeHtml(m.corrected_text || "")}
                </span>
              </div>
              ${
                m.explanation
                  ? `<div class="progress-list-item-sub">${escapeHtml(m.explanation)}</div>`
                  : ""
              }
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderVocabulary(vocabulary, lang) {
  if (!vocabulary || vocabulary.length === 0) {
    return `<div class="progress-empty">${t("progress.no_vocabulary", null, lang)}</div>`;
  }

  return `
    <div class="progress-list">
      ${vocabulary
        .slice(0, 20)
        .map(
          (v) => `
            <div class="progress-list-item">
              <div class="progress-list-item-row">
                <div class="progress-list-item-word">${escapeHtml(v.word || "")}</div>
                <div class="progress-list-item-translation">${escapeHtml(v.translation || "")}</div>
              </div>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
