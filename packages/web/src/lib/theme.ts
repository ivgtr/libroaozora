export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "theme";
export const THEME_COOKIE_NAME = "theme";
export const THEME_ATTRIBUTE = "data-theme";
const COOKIE_MAX_AGE = 31536000; // 1 year

/**
 * FOUC防止用インラインスクリプトを生成する。
 *
 * サーバーが cookie から data-theme を設定済みなら localStorage を同期して終了。
 * 未設定（初回訪問）なら localStorage → システム設定の順でテーマを決定し、
 * data-theme・localStorage・cookie すべてを同期する。
 */
export function generateThemeScript(): string {
  return `(function(){try{var d=document.documentElement,a="${THEME_ATTRIBUTE}",t=d.getAttribute(a);if(t==="light"||t==="dark"){localStorage.setItem("${THEME_STORAGE_KEY}",t);return}t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme:dark)").matches?"dark":"light"}localStorage.setItem("${THEME_STORAGE_KEY}",t);document.cookie="${THEME_COOKIE_NAME}="+t+";path=/;max-age=${COOKIE_MAX_AGE};SameSite=Lax";d.setAttribute(a,t)}catch(e){}})()`;
}
