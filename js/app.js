/* =========================================================
   APP BOOTSTRAP + ROUTER
   ========================================================= */

import telegram from "./telegram.js";
import { api } from "./api.js";
import {
  getState,
  setState,
  isOnboarded,
  getInterfaceLanguage,
} from "./state.js";
import { t, getSupportedLanguages } from "./i18n.js";
import { hydrateIcons } from "./icons.js";

// Screens
import { renderOnboarding } from "./screens/onboarding.js";
import { renderMenu } from "./screens/menu.js";
import { renderChat } from "./screens/chat.js";
import { renderLessons } from "./screens/lessons.js";
import { renderProgress } from "./screens/progress.js";
import { renderProfile } from "./screens/profile.js";

/* =========================================================
   DOM REFS
   ========================================================= */

const screenEl = document.getElementById("screen");
const headerTitle = document.getElementById("headerTitle");
const headerStatus = document.getElementById("headerStatus");
const headerBack = document.getElementById("headerBack");
const headerClose = document.getElementById("headerClose");
const tabbarEl = document.getElementById("tabbar");
const toastEl = document.getElementById("toast");
const loaderEl = document.getElementById("loader");

/* =========================================================
   SCREEN REGISTRY
   ========================================================= */

const SCREENS = {
  onboarding: {
    render: renderOnboarding,
    title: null,           // onboarding управляет заголовком сам
    showBack: false,
    showTabbar: false,
  },
  menu: {
    render: renderMenu,
    titleKey: "menu.title",
    showBack: false,
    showTabbar: true,
    tab: "chat",
  },
  chat: {
    render: renderChat,
    titleKey: "chat.title",
    showBack: true,
    showTabbar: true,
    tab: "chat",
  },
  lessons: {
    render: renderLessons,
    titleKey: "lessons.title",
    showBack: true,
    showTabbar: true,
    tab: "lessons",
  },
  progress: {
    render: renderProgress,
    titleKey: "progress.title",
    showBack: true,
    showTabbar: true,
    tab: "progress",
  },
  profile: {
    render: renderProfile,
    titleKey: "profile.title",
    showBack: true,
    showTabbar: true,
    tab: "profile",
  },
};

/* =========================================================
   PUBLIC NAVIGATION API
   ========================================================= */

/**
 * Перейти на экран по имени.
 * screenName: "onboarding" | "menu" | "chat" | "lessons" | "progress" | "profile"
 */
export function navigate(screenName) {
  const config = SCREENS[screenName];

  if (!config) {
    console.warn(`[navigate] Unknown screen: ${screenName}`);
    return;
  }

  setState({ screen: screenName });

  // Header
  if (config.titleKey) {
    headerTitle.textContent = t(
      config.titleKey,
      null,
      getInterfaceLanguage(),
    );
  } else {
    headerTitle.textContent = "AI Tutor";
  }

  // Back button
  headerBack.hidden = !config.showBack;

  // Tabbar
  tabbarEl.hidden = !config.showTabbar;

  // Highlight active tab
  if (config.showTabbar) {
    tabbarEl.querySelectorAll(".tabbar-item").forEach((el) => {
      const tab = el.getAttribute("data-tab");
      el.classList.toggle("is-active", tab === config.tab);
    });
  }

  // Clear screen
  screenEl.innerHTML = "";

  // Render
  const result = config.render();

  if (result instanceof HTMLElement) {
    screenEl.appendChild(result);
  } else if (typeof result === "string") {
    screenEl.innerHTML = result;
  }

  // Hydrate icons in the newly rendered screen
  hydrateIcons(screenEl);
  hydrateIcons(tabbarEl);

  // Scroll to top
  screenEl.scrollTop = 0;
}

/* =========================================================
   HEADER STATUS
   ========================================================= */

export function setHeaderStatus(key, className = "") {
  if (!key) {
    headerStatus.textContent = "";
    headerStatus.className = "header-status";
    return;
  }

  headerStatus.textContent = t(key, null, getInterfaceLanguage());
  headerStatus.className = "header-status" + (className ? ` is-${className}` : "");
}

export function clearHeaderStatus() {
  headerStatus.textContent = "";
  headerStatus.className = "header-status";
}

/* =========================================================
   TOAST
   ========================================================= */

let toastTimer = null;

export function showToast(message, variant = "") {
  if (!message) return;

  toastEl.hidden = false;
  toastEl.textContent = message;
  toastEl.className = "toast is-visible" + (variant ? ` is-${variant}` : "");

  if (toastTimer) clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    toastEl.classList.remove("is-visible");
    toastEl.hidden = true;
  }, 3200);
}

/* =========================================================
   LOADER
   ========================================================= */

export function showLoader() {
  loaderEl.hidden = false;
}

export function hideLoader() {
  loaderEl.hidden = true;
}

/* =========================================================
   TABBAR
   ========================================================= */

function bindTabbar() {
  tabbarEl.querySelectorAll(".tabbar-item").forEach((el) => {
    el.addEventListener("click", () => {
      const tab = el.getAttribute("data-tab");
      if (!tab) return;
      telegram.haptic.selection();
      navigate(tab);
    });
  });
}

/* =========================================================
   HEADER BACK
   ========================================================= */

function bindHeader() {
  headerBack.addEventListener("click", () => {
    telegram.haptic.impact("light");
    navigate("menu");
  });

  headerClose.addEventListener("click", () => {
    telegram.haptic.impact("light");
    telegram.close();
    setTimeout(() => {
      try { window.close(); } catch (_) {}
      if (document.visibilityState === "visible" && history.length > 1) history.back();
    }, 120);
  });
}

/* =========================================================
   BOOTSTRAP
   ========================================================= */

async function bootstrap() {
  telegram.init();
  telegram.applyTheme();

  hydrateIcons(document);

  bindTabbar();
  bindHeader();

  // No initData — открыто вне Telegram
  if (!telegram.initData) {
    hideLoader();
    renderBootMessage("Open AI Tutor inside Telegram to continue.");
    return;
  }

  showLoader();

  try {
    const data = await api.getProfile();

    if (!data?.user || !data?.profile) {
      throw new Error("Invalid profile response");
    }

    setState({
      user: data.user,
      profile: data.profile,
      phase: isOnboardedFromProfile(data.profile) ? "app" : "onboarding",
    });

    hideLoader();

    if (getState().phase === "onboarding") {
      navigate("onboarding");
    } else {
      navigate("menu");
    }
  } catch (error) {
    console.error("bootstrap error:", error);
    hideLoader();
    renderBootMessage("Could not load your profile. Please reopen the Mini App from Telegram.");
    showToast(t("errors.network", null, getInterfaceLanguage()), "error");
  }
}

function renderBootMessage(message) {
  screenEl.innerHTML = `<div class="boot-message"><div class="boot-icon">AI</div><h1>AI Tutor</h1><p>${message}</p><button class="btn btn-primary btn-block" type="button" id="bootRetry">Try again</button></div>`;
  screenEl.querySelector("#bootRetry")?.addEventListener("click", () => location.reload());
}

bootstrap();

/* =========================================================
   HELPERS
   ========================================================= */

function isOnboardedFromProfile(profile) {
  return (
    profile?.onboarding_step === "done" ||
    profile?.onboarding_step === "completed"
  );
}

// Экспортируем хелперы, чтобы экраны могли их использовать
export {
  telegram,
  api,
  t,
  getSupportedLanguages,
  getState,
  setState,
  isOnboarded,
  getInterfaceLanguage,
};
