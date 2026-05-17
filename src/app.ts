/**
 * App entry / screen router.
 *
 * The app used to boot straight into a battle (`main.ts` ran on import).
 * Now `index.html` loads this router instead: it reads the current
 * screen and dispatches. The battle (`main.ts`) is a dynamically
 * imported effect module — importing it runs its top-level bootstrap
 * exactly as before, and code-splits the heavy Three.js battle bundle
 * off the menu's load path.
 */

import { currentScreen } from './core/Screen';

async function boot(): Promise<void> {
  switch (currentScreen()) {
    case 'battle':
      await import('./main');
      break;
    case 'map-editor':
      (await import('./render/MapEditorScreen')).showMapEditorScreen();
      break;
    default:
      (await import('./render/TitleScreen')).showTitleScreen();
  }
}

boot();
