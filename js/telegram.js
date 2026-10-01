/* =========================================================
   TELEGRAM WEBAPP WRAPPER
   ========================================================= */

const tg = window.Telegram?.WebApp || null;

export const telegram = {
  available: Boolean(tg),

  /**
   * Call once on startup.
   */
  init() {
    if (!tg) return;
    try {
      tg.ready();
      tg.expand();
      if (typeof tg.disableVerticalSwipes === "function") {
        tg.disableVerticalSwipes();
      }
    } catch (_) {}
  },

  /**
   * Raw initData string — needed for backend auth.
   */
  get initData() {
    return tg?.initData || "";
  },

  /**
   * Parsed user object.
   */
  get user() {
    return tg?.initDataUnsafe?.user || null;
  },

  /**
   * Current Telegram theme: "light" | "dark"
   */
  get colorScheme() {
    return tg?.colorScheme || "light";
  },

  /**
   * Viewport info (useful for keyboard handling).
   */
  get viewportHeight() {
    return tg?.viewportHeight || window.innerHeight;
  },

  /**
   * Haptic feedback helpers.
   */
  haptic: {
    impact(style = "medium") {
      try {
        tg?.HapticFeedback?.impactOccurred(style);
      } catch (_) {}
    },

    notification(type = "success") {
      try {
        tg?.HapticFeedback?.notificationOccurred(type);
      } catch (_) {}
    },

    selection() {
      try {
        tg?.HapticFeedback?.selectionChanged();
      } catch (_) {}
    },
  },

  /**
   * Close the Mini App.
   */
  close() {
    try {
      tg?.close();
    } catch (_) {}
  },

  /**
   * Subscribe to theme changes.
   */
  onThemeChanged(callback) {
    if (!tg) return;
    try {
      tg.onEvent("themeChanged", callback);
    } catch (_) {}
  },

  /**
   * Subscribe to viewport changes (keyboard open/close).
   */
  onViewportChanged(callback) {
    if (!tg) return;
    try {
      tg.onEvent("viewportChanged", callback);
    } catch (_) {}
  },

  /**
   * Apply Telegram theme params to CSS variables.
   * Called on startup and on themeChanged.
   */
  applyTheme() {
    if (!tg?.themeParams) return;

    const p = tg.themeParams;

    // Опционально: подстраиваем CSS-переменные под тему Telegram.
    // Пока полагаемся на prefers-color-scheme в base.css.
    void p;
  },

  /**
   * Main button (Telegram native).
   */
  mainButton: {
    show(text, onClick) {
      if (!tg?.MainButton) return;
      try {
        tg.MainButton.setText(text);
        tg.MainButton.show();
        tg.MainButton.onClick(onClick);
      } catch (_) {}
    },

    hide() {
      if (!tg?.MainButton) return;
      try {
        tg.MainButton.hide();
        tg.MainButton.offClick();
      } catch (_) {}
    },
  },
};

export default telegram;
