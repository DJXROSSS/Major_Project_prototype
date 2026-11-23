export type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "placepro-theme";
const CHANGE_EVENT = "placepro-theme-change";

// Apply the saved preference before the body is painted, then follow OS and tab changes.
export const initializeTheme = `(() => {
  const root = document.documentElement;
  const storageKey = ${JSON.stringify(STORAGE_KEY)};
  const changeEvent = ${JSON.stringify(CHANGE_EVENT)};
  const system = window.matchMedia("(prefers-color-scheme: dark)");

  function apply() {
    const theme = root.dataset.theme;
    root.classList.toggle("dark", theme === "dark" || (theme === "system" && system.matches));
  }

  function readPreference() {
    let saved;
    try { saved = localStorage.getItem(storageKey); } catch {}
    root.dataset.theme = saved === "light" || saved === "dark" ? saved : "system";
    apply();
  }

  readPreference();
  system.addEventListener("change", apply);
  window.addEventListener(changeEvent, apply);
  window.addEventListener("storage", (event) => {
    if (event.key === storageKey || event.key === null) readPreference();
  });
})();`;

export function getThemePreference(): ThemePreference {
  const theme = document.documentElement.dataset.theme;
  return theme === "light" || theme === "dark" ? theme : "system";
}

export function setThemePreference(theme: string) {
  if (theme !== "system" && theme !== "light" && theme !== "dark") return;
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* Apply the preference for this tab. */ }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function subscribeToTheme(listener: () => void) {
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}
