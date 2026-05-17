/**
 * Session-scoped navigation between the app's top-level screens. The
 * router in `app.ts` reads `currentScreen()` on load; screens call
 * `goToScreen()` to navigate (it persists the choice and reloads, so
 * the router re-dispatches). Session-scoped — a fresh launch starts at
 * the menu.
 */

const SCREEN_KEY = 'tactics-screen';

export type Screen =
  | 'menu' | 'battle' | 'map-editor' | 'sprite-editor' | 'campaign' | 'campaign-editor';

export function currentScreen(): Screen {
  const s = sessionStorage.getItem(SCREEN_KEY);
  return s === 'battle' || s === 'map-editor' || s === 'sprite-editor'
    || s === 'campaign' || s === 'campaign-editor'
    ? s : 'menu';
}

export function goToScreen(screen: Screen): void {
  try { sessionStorage.setItem(SCREEN_KEY, screen); } catch { /* ignore */ }
  location.reload();
}
