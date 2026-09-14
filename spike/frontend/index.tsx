/**
 * Tender spike #1897 — a second top-level Quick Access tab, injected into the
 * live SharedJSContext beside Decky's own, without going through Decky at all.
 *
 * THROWAWAY. Nothing here ships.
 *
 * Hard rules this file obeys (each has a known failure behind it):
 *   - never touches window.__TABS_HOOK_INSTANCE (Decky's constructor deinits it)
 *   - marks its own tab entries `tender: true`, never `decky: true`
 *   - uses its own tab key "tender-spike", never Decky's 999
 *   - imports nothing from @decky/api (it throws without Decky's init global)
 */
import {
  ButtonItem,
  ErrorBoundary,
  Focusable,
  PanelSection,
  PanelSectionRow,
  afterPatch,
  createReactTreePatcher,
  findInReactTree,
  findModuleByExport,
  getReactRoot,
  setReactPatcherLoggingEnabled,
  type Patch,
} from '@decky/ui';
import { type FC, type PropsWithChildren, createContext, useContext, useState } from 'react';

const setPatcherLogging = (on = true) => setReactPatcherLoggingEnabled(on);

const VERSION = '1897-spike';
const TAB_KEY = 'tender-spike';
const MARKER = 'tender';
const LOADED_AT = new Date();

declare global {
  interface Window {
    __TENDER_SPIKE?: TenderSpike;
    __TENDER_SPIKE_ICON?: string;
    DeckyBackend?: unknown;
  }
}

interface TenderSpike {
  version: string;
  loadedAt: string;
  iconUrl: string;
  moduleFound: boolean;
  patchedBrowserView: boolean;
  patchedEmbedded: boolean;
  renders: number;
  tabCount: () => number;
  positions: () => { len: number; ourIndexes: number[]; deckyIndexes: number[] }[];
  debugMoveToFront: () => number;
  probe: { outerCalls: number; resolverHits: number; tabsSeen: number; lastArgKeys: string[] | null; probeError: string | null };
  setPatcherLogging: (on?: boolean) => void;
  unpatch: () => void;
  /** Diagnostics only: run the real push path against a caller-supplied tabs
   *  array. It is the same `render()` the patch handler calls, so it measures
   *  the push-once guard without opening the Quick Access menu — which on this
   *  machine closes windowed Big Picture. Never called by the patch itself. */
  driveRender: (tabs: unknown[], visible: boolean) => number;
}

// ---------------------------------------------------------------- icon source
// Switchable on the device without a rebuild: either ?icon=logo.svg on the
// import() URL, or window.__TENDER_SPIKE_ICON set before the import.
const moduleUrl = new URL(import.meta.url);
const iconName = moduleUrl.searchParams.get('icon') ?? window.__TENDER_SPIKE_ICON ?? 'logo-animated.gif';
const ICON_URL = new URL(iconName, moduleUrl).href;
const ICON_SIZE = moduleUrl.searchParams.get('iconsize') ?? '1.4em';

// ------------------------------------------------------- visibility provider
// Our own copy of Decky's QuickAccessVisibleState — we must not share theirs.
const VisibleState = createContext<boolean>(false);
export const useQuickAccessVisible = () => useContext(VisibleState);

const VisibleStateProvider: FC<PropsWithChildren<{ tab: any }>> = ({ children, tab }) => {
  const [visible, setVisible] = useState<boolean>(tab.initialVisibility);
  tab.qAMVisibilitySetter = (val: boolean) => {
    if (val !== visible) setVisible(val);
  };
  return <VisibleState.Provider value={visible}>{children}</VisibleState.Provider>;
};

// ------------------------------------------------------------------ the panel
const TabIcon: FC = () => (
  <img
    src={ICON_URL}
    alt="Tender"
    style={{ width: ICON_SIZE, height: ICON_SIZE, objectFit: 'contain', display: 'block' }}
  />
);

const SpikePanel: FC = () => {
  const [count, setCount] = useState(0);
  const visible = useQuickAccessVisible();
  const backend = typeof window.DeckyBackend;
  return (
    <PanelSection title="Tender Spike #1897">
      <PanelSectionRow>
        <Focusable style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '4px 0' }}>
          <div style={{ fontSize: '1.1em', fontWeight: 'bold' }}>Tender lebt im QAM.</div>
          <div style={{ fontSize: '0.8em', opacity: 0.8 }}>bundle {VERSION}</div>
          <div style={{ fontSize: '0.8em', opacity: 0.8 }}>geladen: {LOADED_AT.toLocaleTimeString()}</div>
          <div style={{ fontSize: '0.8em', opacity: 0.8 }}>icon: {iconName}</div>
        </Focusable>
      </PanelSectionRow>
      <PanelSectionRow>
        <ButtonItem layout="below" onClick={() => setCount((c) => c + 1)}>
          Zähler +1 — steht bei {count}
        </ButtonItem>
      </PanelSectionRow>
      <PanelSectionRow>
        <Focusable style={{ padding: '4px 0' }}>
          <div style={{ fontSize: '0.9em' }}>
            window.DeckyBackend: <b>{backend === 'object' ? 'da (object)' : backend}</b>
          </div>
          <div style={{ fontSize: '0.8em', opacity: 0.8 }}>QAM sichtbar: {visible ? 'ja' : 'nein'}</div>
        </Focusable>
      </PanelSectionRow>
    </PanelSection>
  );
};

// ------------------------------------------------------------------ the patch
// Every tabs array we have ever pushed into, so unpatch() can take our entries
// back out again. Decky does not do this; we must, or a re-import stacks tabs.
const touchedArrays = new Set<any[]>();
let renders = 0;
let outerCalls = 0;
let resolverHits = 0;
let tabsSeen = 0;
let lastArgKeys: string[] | null = null;
let probeError: string | null = null;

function countOurTabs(): number {
  let n = 0;
  for (const arr of touchedArrays) for (const t of arr) if (t?.[MARKER]) n++;
  return n;
}

function render(existingTabs: any[], visible: boolean) {
  renders++;
  touchedArrays.add(existingTabs);
  const ours = existingTabs.filter((t: any) => t?.[MARKER]);
  if (ours.length > 0) {
    for (const t of ours) {
      if (t.qAMVisibilitySetter) t.qAMVisibilitySetter(visible);
      else t.initialVisibility = visible;
    }
    keepLast(existingTabs);
    return;
  }
  const tab: any = {
    key: TAB_KEY,
    title: 'Tender',
    tab: <TabIcon />,
    [MARKER]: true,
    initialVisibility: visible,
  };
  tab.panel = (
    <ErrorBoundary>
      <VisibleStateProvider tab={tab}>
        <SpikePanel />
      </VisibleStateProvider>
    </ErrorBoundary>
  );
  existingTabs.push(tab);
  keepLast(existingTabs);
}

/**
 * Our entries sit at the END of the tab array, on EVERY pass rather than only
 * when they are created. The owner wants Tender below Decky whichever of the two
 * started first, and install order alone cannot deliver that.
 *
 * Why order is not ours to choose: `afterPatch` runs the previous value first and
 * the new handler second (patcher.js:18-19), so whoever patches LAST pushes LAST
 * and lands lowest. Measured both ways on the device — patched before Decky
 * booted we came out above it, re-patched beside a running Decky we came out
 * below. Install order is a property of who starts first, which we do not decide.
 *
 * So the placement is re-asserted instead of relied upon. When Decky pushes after
 * us in a pass we are momentarily above; the next pass moves us back down, and
 * the QAM re-renders often (33 passes over a few opens, measured). Moving an
 * entry is invisible to Decky's own guard, which counts `decky`-marked entries
 * against its own list length (tabs-hook.tsx:101-102) and is unaffected by where
 * they sit.
 *
 * Deliberately reads no Decky marker: "last" is a statement about our own entry,
 * so it holds against any number of other tab providers, not just Decky.
 */
function keepLast(tabs: any[]) {
  for (let i = tabs.length - 2; i >= 0; i--) {
    if (tabs[i]?.[MARKER]) tabs.push(tabs.splice(i, 1)[0]);
  }
}

// A previous instance of this very bundle must go before we patch again.
try {
  window.__TENDER_SPIKE?.unpatch?.();
} catch (e) {
  console.error('[TenderSpike] previous unpatch failed', e);
}

let browserViewPatch: Patch | undefined;
let embeddedPatch: Patch | undefined;
let moduleFound = false;

try {
  const qamModule = findModuleByExport((e: any) => e?.type?.toString?.()?.includes('QuickAccessMenuBrowserView'));
  const browserViewRenderer =
    qamModule && Object.values(qamModule).find((e: any) => e?.type?.toString?.()?.includes('QuickAccessMenuBrowserView'));
  const embeddedRenderer =
    qamModule && Object.values(qamModule).find((e: any) => e?.type?.toString?.()?.includes('QuickAccessMenuEmbedded'));
  moduleFound = Boolean(browserViewRenderer);

  // Counted ONE LEVEL ABOVE the tree patcher. `renders` only counts the END
  // handler, and `handleStep` returns the tree WITHOUT calling it whenever its
  // resolver finds no node (treepatcher.js:46-51) — so `renders: 0` cannot tell
  // "the component never rendered" apart from "it rendered and the resolver
  // missed". These two counters separate them.
  const treeHandler = createReactTreePatcher(
    [(tree: any) => findInReactTree(tree, (node: any) => node?.props?.onFocusNavDeactivated)],
    (args: any[], ret: any) => {
      const tabs = findInReactTree(ret, (x: any) => x?.props?.tabs);
      if (tabs) render(tabs.props.tabs, args[0]?.visible);
      return ret;
    },
    'TenderSpike',
  );

  const handler = (args: any[], ret: any) => {
    outerCalls++;
    lastArgKeys = args && args[0] ? Object.keys(args[0]).slice(0, 12) : null;
    try {
      const hit = findInReactTree(ret, (n: any) => n?.props?.onFocusNavDeactivated);
      if (hit) resolverHits++;
      const tabsNode = findInReactTree(ret, (x: any) => x?.props?.tabs);
      if (tabsNode) tabsSeen++;
    } catch (e) {
      probeError = String((e as Error)?.message ?? e);
    }
    return treeHandler(args, ret);
  };

  if (browserViewRenderer) browserViewPatch = afterPatch(browserViewRenderer, 'type', handler);
  if (embeddedRenderer) embeddedPatch = afterPatch(embeddedRenderer, 'type', handler);

  // Adopting the ALREADY-MOUNTED QAM is opt-in, and off by default.
  //
  // Decky does this unconditionally (tabs-hook.tsx, "Patch already rendered qam"):
  // rewrite the live fiber's `type` so the mounted subtree picks the patch up
  // without a reopen. It runs at IMPORT time, not when the menu is opened.
  //
  // On this machine that line is the prime suspect for three Steam failures on
  // 2026-09-14 — the main window or windowed Big Picture went away while the
  // process lived. What points at it: after the third failure the still-live
  // injection reported `renders: 0`, so the patch handler had never run and the
  // menu had never been opened. Whatever broke, broke at import.
  //
  // UNPROVEN. It is a suspicion from reading, not a measurement, and Decky
  // running the same line for years argues against it. So it is kept, behind
  // ?adopt=1, to be tried on its own with the error capture running — one
  // variable per attempt. Without it the tab appears once the QAM remounts.
  const adoptMounted = moduleUrl.searchParams.get('adopt') === '1';
  if (adoptMounted) {
    const root = getReactRoot(document.getElementById('root') as any);
    const qamNode =
      root &&
      findInReactTree(
        root,
        (n: any) =>
          n.elementType === browserViewRenderer || (embeddedRenderer != null && n.elementType === embeddedRenderer),
      );
    if (qamNode) {
      qamNode.type = qamNode.elementType.type;
      if (qamNode.alternate) qamNode.alternate.type = qamNode.type;
    }
  }
  console.log('[TenderSpike] patched', { moduleFound, browserView: !!browserViewPatch, embedded: !!embeddedPatch });
} catch (e) {
  console.error('[TenderSpike] patch failed', e);
}

function unpatch() {
  browserViewPatch?.unpatch();
  embeddedPatch?.unpatch();
  browserViewPatch = undefined;
  embeddedPatch = undefined;
  for (const arr of touchedArrays) {
    for (let i = arr.length - 1; i >= 0; i--) if (arr[i]?.[MARKER]) arr.splice(i, 1);
  }
  touchedArrays.clear();
  console.log('[TenderSpike] unpatched');
}

const api: TenderSpike = {
  version: VERSION,
  loadedAt: LOADED_AT.toISOString(),
  iconUrl: ICON_URL,
  moduleFound,
  patchedBrowserView: !!browserViewPatch,
  patchedEmbedded: !!embeddedPatch,
  get renders() {
    return renders;
  },
  get probe() {
    return { outerCalls, resolverHits, tabsSeen, lastArgKeys, probeError };
  },
  /** Diagnostics: report where our entry sits in each tab array we have touched. */
  positions() {
    const out: { len: number; ourIndexes: number[]; deckyIndexes: number[] }[] = [];
    for (const arr of touchedArrays) {
      out.push({
        len: arr.length,
        ourIndexes: arr.map((t: any, i: number) => (t?.[MARKER] ? i : -1)).filter((i: number) => i >= 0),
        deckyIndexes: arr.map((t: any, i: number) => (t?.decky ? i : -1)).filter((i: number) => i >= 0),
      });
    }
    return out;
  },
  /** Diagnostics: shove our entry to the FRONT, so the next pass can be observed
   *  putting it back. Proves `keepLast` re-asserts rather than merely appending. */
  debugMoveToFront() {
    let moved = 0;
    for (const arr of touchedArrays) {
      for (let i = arr.length - 1; i >= 1; i--) {
        if (arr[i]?.[MARKER]) {
          arr.unshift(arr.splice(i, 1)[0]);
          moved++;
        }
      }
    }
    return moved;
  },
  setPatcherLogging,
  tabCount: countOurTabs,
  unpatch,
  driveRender: (tabs: unknown[], visible: boolean) => {
    render(tabs as any[], visible);
    return (tabs as any[]).filter((t: any) => t?.[MARKER]).length;
  },
};
window.__TENDER_SPIKE = api;

export default api;
