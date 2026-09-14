/**
 * Spike #1897 — the React/JSX globals, installed by US instead of by Decky.
 *
 * MEASURED 2026-09-14 with `plugin_loader` stopped and Steam freshly started:
 * `SP_REACT`, `SP_JSX` and `SP_REACTDOM` are all `undefined`. Steam does not set
 * them; Decky's loader does, in frontend/src/index.ts. `webpackChunksteamui` is
 * Steam's own and IS present either way.
 *
 * So a bundle that maps `react` onto `SP_REACT` cannot load at all without Decky.
 * That is not a coexistence question — it is the standalone host's own job, and
 * this file is the smallest form of it.
 *
 * Imports ONLY @decky/ui's webpack half, deliberately: the component half would
 * need the very globals this file exists to create. Same partial import Decky
 * makes, for the same reason.
 *
 * THROWAWAY.
 */
import { findModule } from '@decky/ui/dist/webpack';

interface SteamAppInit {
  BFinishedInitBeforeLogin?: () => boolean;
  BFinishedInitStageOne?: () => boolean;
}

const steamReady = () => {
  const app = (window as any).App as SteamAppInit | undefined;
  return app?.BFinishedInitBeforeLogin?.() ?? app?.BFinishedInitStageOne?.() ?? false;
};

export async function installGlobals(): Promise<Record<string, unknown>> {
  const w = window as any;
  if (w.SP_REACT && w.SP_JSX && w.SP_REACTDOM) {
    return { alreadyPresent: true, source: w.DFL ? 'decky' : 'unknown' };
  }

  // Decky waits for this before touching webpack; without the wait the module
  // cache can be incomplete and a finder silently answers undefined.
  const deadline = Date.now() + 30_000;
  while (!steamReady() && Date.now() < deadline) await new Promise((r) => setTimeout(r, 0));
  const readyInTime = steamReady();

  w.SP_REACT ||= findModule((m: any) => m.Component && m.PureComponent && m.useLayoutEffect);
  w.SP_REACTDOM ||=
    findModule((m: any) => m.createPortal && m.createRoot) ||
    findModule((m: any) => m.createPortal && m.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE);

  if (!w.SP_JSX) {
    const jsxModule: any = findModule((m: any) => (m.jsx && m.jsxs) || (m.jsx && Object.keys(m).length === 1));
    w.SP_JSX = jsxModule?.jsxs
      ? jsxModule
      : { jsx: jsxModule?.jsx, jsxs: jsxModule?.jsx, Fragment: w.SP_REACT?.Fragment };
  }

  return {
    readyInTime,
    SP_REACT: typeof w.SP_REACT,
    SP_REACTDOM: typeof w.SP_REACTDOM,
    SP_JSX: typeof w.SP_JSX,
    jsxKeys: w.SP_JSX ? Object.keys(w.SP_JSX) : null,
    reactVersion: w.SP_REACT?.version ?? null,
  };
}

(window as any).__TENDER_INSTALL_GLOBALS = installGlobals;
