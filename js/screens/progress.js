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

    setState({ progress, vocabulary, mistakes });

    scroll.innerHTML = renderContent(progress, vocabulary, mistakes, lang);
  } catch (error) {
    console.error("progress load error:", error);

    // Показываем дефолтные нули, если бэкенд не отвечает
    scroll.innerHTML = renderContent({}, [], [], lang);
    showToast(t("errors.network", null, lang), "error");
  }

  hydrateIcons(wrapper);
}

/* =========================================================
   CONTENT
   ========================================================= */

function renderContent(progress, vocabulary, mistakes, lang) {
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
