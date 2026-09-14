/**
 * Spike #1866 — everything Tender can reach in Steam's DESKTOP client.
 *
 * THROWAWAY. Nothing here ships. Evaluate it in `SharedJSContext` over the CEF
 * debugger; every function is standalone and re-runnable. Decky may be running
 * or not — `DFL` is used for its finders, so with Decky absent load `@decky/ui`
 * yourself first (see spike/README.md).
 *
 * All seven questions of #1866 were answered YES with this code, on a Steam Deck
 * against Steam build 1788652215 in desktop mode (`m_mainInstanceUIMode === 7`).
 *
 * THE RULE THAT GOVERNS ALL OF IT: the desktop client renders in its own window
 * with its own document. Nodes, constructors and observers must be taken from
 * THAT window, never from SharedJSContext. `deskWin()` below is the only way in.
 */

/** The desktop client's own window. Everything else depends on this. */
function deskWin() {
  const p = Array.from(g_PopupManager.GetPopups()).find((x) => (x.m_strName || '').startsWith('SP Desktop'));
  return p && p.m_popup;
}

/**
 * React's client root factory.
 *
 * NOT on `SP_REACTDOM`: under React 19 `createRoot` lives in its own module and
 * Decky's global does not carry it (measured — `SP_REACTDOM` has createPortal,
 * flushSync, preload… and no createRoot). Reaching for the global is the obvious
 * wrong move, so it is spelled out here.
 */
function reactClient() {
  return DFL.findModule((m) => m && typeof m.createRoot === 'function');
}

/**
 * Cover art for an appId.
 *
 * `GetCustomVerticalCapsuleURLs` answers a CANDIDATE LIST, .jpg before .png, and
 * only one of them exists on disk — on the reference machine the .jpg 404s and
 * the .png is the real file. A consumer that takes [0] and renders it shows an
 * empty box. The caller must fall through the list on error; `gamePanel` does.
 */
function coverCandidates(appId) {
  const ov = appStore.GetAppOverviewByAppID(appId);
  return ((ov && appStore.GetCustomVerticalCapsuleURLs(ov)) || []).map((u) => 'https://steamloopback.host' + u);
}

/** Question 1 + 2 + 5: our own React panel IN PLACE OF Steam's overview panel. */
function mountGamePanel(win, appId) {
  const d = win.document;
  const R = window.SP_REACT;
  const ovClass = DFL.findClassModule((m) => m.AppDetailsOverviewPanel).AppDetailsOverviewPanel;
  const steamPanel = d.getElementsByClassName(ovClass)[0];
  if (!steamPanel) return null; // page not built yet — the DOM observer will call again

  // Hidden, not removed: React keeps owning the node, so this is reversible and
  // survives Steam re-rendering its own subtree.
  steamPanel.style.display = 'none';

  const host = d.createElement('div');
  host.id = 'tender-desktop-substitute';
  host.dataset.appid = String(appId);
  host.style.cssText = 'border-radius:10px;overflow:hidden;background:#16202d;color:#c7d5e0';
  steamPanel.parentElement.insertBefore(host, steamPanel);

  const h = R.createElement;
  const covers = coverCandidates(appId);
  const name = (appStore.GetAppOverviewByAppID(appId) || {}).display_name;
  function Panel() {
    const [i, setI] = R.useState(0);
    const [tab, setTab] = R.useState('game');
    const T = (id, label) =>
      h('button', { key: id, onClick: () => setTab(id) }, label);
    return h('div', null,
      h('div', null, T('game', 'Game'), T('saves', 'Saves'), T('bios', 'BIOS')),
      h('div', { style: { padding: 18, display: 'flex', gap: 18 } },
        covers.length ? h('img', { src: covers[i], onError: () => i + 1 < covers.length && setI(i + 1) }) : null,
        h('div', null, h('div', null, String(name || appId)), h('div', null, 'tab: ' + tab))));
  }
  const root = reactClient().createRoot(host);
  root.render(h(Panel));
  return root;
}

/**
 * Question 6: survive navigation.
 *
 * TWO observers, and both are needed. Watching the address alone is not enough —
 * `m_lastLocation.pathname` flips BEFORE Steam has built the new page, so the
 * panel node is not there yet and a single-shot re-inject finds nothing. The
 * MutationObserver is the net that catches the page once it exists.
 *
 * Measured: 12 re-injections across several page switches, zero errors, correct
 * appId on every one.
 */
function watchNavigation() {
  const win = deskWin();
  const d = win.document;
  if (win.__TENDER_NAV_STOP) win.__TENDER_NAV_STOP();
  const state = { mounts: 0, errors: 0 };
  win.__TENDER_NAV_STATE = state;

  const appIdOf = (p) => { const m = /\/library\/app\/(\d+)/.exec(p || ''); return m ? Number(m[1]) : null; };
  let last = null;

  function reinject() {
    try {
      const path = MainWindowBrowserManager.m_lastLocation && MainWindowBrowserManager.m_lastLocation.pathname;
      const existing = d.getElementById('tender-desktop-substitute');
      const appId = appIdOf(path);
      if (!appId) { if (existing) { try { win.__TENDER_ROOT?.unmount(); } catch (e) {} existing.remove(); } return; }
      if (existing && existing.isConnected && existing.dataset.appid === String(appId)) return;
      if (existing) { try { win.__TENDER_ROOT?.unmount(); } catch (e) {} existing.remove(); }
      const root = mountGamePanel(win, appId);
      if (root) { win.__TENDER_ROOT = root; state.mounts++; }
    } catch (e) { state.errors++; state.lastError = String(e.message); }
  }

  const iv = win.setInterval(() => {
    const p = MainWindowBrowserManager.m_lastLocation && MainWindowBrowserManager.m_lastLocation.pathname;
    if (p !== last) { last = p; win.setTimeout(reinject, 120); win.setTimeout(reinject, 500); }
  }, 250);
  // Constructor from the desktop window, not ours — different realm.
  const mo = new win.MutationObserver(() => reinject());
  mo.observe(d.body, { childList: true, subtree: true });
  win.__TENDER_NAV_STOP = () => { win.clearInterval(iv); mo.disconnect(); };
  reinject();
  return state;
}

/**
 * Question 3: our own entry in the desktop menu bar.
 *
 * THE REACT ROUTE DOES NOT WORK HERE, and the failure is silent. Finding the
 * menu in the fiber tree and `afterPatch`-ing `menuContent.type` patches ONE
 * ELEMENT; Steam builds a fresh element every time the menu opens, so the patch
 * hangs off a dead copy and the handler fires zero times (instrumented and
 * counted: 0 calls across several opens). It is the same class of problem the
 * QAM has, which is what Decky's "patch already rendered qam" line exists for.
 *
 * The DOM route holds, and for a menu it costs nothing: a menu item in the
 * desktop needs no gamepad focus stop.
 *
 * The menu popups are HIDDEN, not destroyed, so a previously inserted item
 * survives and the insert loop sees it and skips — leaving a stale entry that
 * does nothing. Always clear across every popup before re-inserting.
 */
function addMenuEntry(onClick) {
  const win = deskWin();
  if (win.__TENDER_MENU_STOP) win.__TENDER_MENU_STOP();
  for (const p of Array.from(g_PopupManager.GetPopups())) {
    const w = p.m_popup;
    if (w && w.document) w.document.getElementById('tender-menu-item')?.remove();
  }
  const state = { inserted: 0, clicks: 0 };
  win.__TENDER_MENU_STATE = state;

  function tryInsert() {
    for (const p of Array.from(g_PopupManager.GetPopups())) {
      const w = p.m_popup;
      if (!w || !w.document || !/Steam Root Menu/i.test(String(w.document.title || ''))) continue;
      const d = w.document;
      if (d.getElementById('tender-menu-item')) return;
      // Clone a real entry so Steam's own classes carry the styling.
      const items = Array.from(d.querySelectorAll('div,button,a'))
        .filter((e) => e.children.length === 0 && (e.textContent || '').trim().length > 2 && e.getBoundingClientRect().height > 10);
      if (!items.length) return;
      const template = items[items.length - 1];
      const item = template.cloneNode(true);
      item.id = 'tender-menu-item';
      item.textContent = 'Tender';
      item.addEventListener('click', () => { state.clicks++; try { onClick(); } catch (e) { state.lastError = String(e.message); } try { p.Hide && p.Hide(); } catch (e) {} });
      (template.parentElement || d.body).appendChild(item);
      state.inserted++;
      return;
    }
  }
  const iv = win.setInterval(tryInsert, 200);
  win.__TENDER_MENU_STOP = () => win.clearInterval(iv);
  tryInsert();
  return state;
}

/**
 * Question 4, route A: a full-area page of our own, in the MAIN window.
 *
 * Must be mounted in the desktop window, never in the menu popup that opened it
 * — the popup is hidden as soon as the entry is clicked.
 */
function openFullPage(render) {
  const win = deskWin(), d = win.document;
  d.getElementById('tender-page')?.remove();
  const host = d.createElement('div');
  host.id = 'tender-page';
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:#0f1720;color:#c7d5e0;overflow:auto';
  d.body.appendChild(host);
  reactClient().createRoot(host).render(render(() => d.getElementById('tender-page')?.remove()));
  return host;
}

/**
 * Question 4, route B: Steam's own modal, which looks like the client's Settings
 * dialog rather than an overlay. The owner preferred this shape.
 *
 * `window.open` is BLOCKED in this client (returns null, measured), so a real
 * separate OS window is not reachable this way. `SteamClient.Window` offers
 * ResizeTo / MoveTo / ToggleMaximize / SetMinSize / SetModal / SetWindowIcon /
 * Close — but those act on an EXISTING window; what is missing is the creation.
 * Unsolved, not disproven.
 *
 * Steam constrains the modal's size, so `minWidth` on our own content does not
 * win. Sizing is an open styling question.
 */
function openModal(renderBody) {
  const win = deskWin();
  const R = window.SP_REACT, h = R.createElement;
  function Body(props) {
    return h(DFL.ModalRoot, { onCancel: props.closeModal, onEscKeypress: props.closeModal }, renderBody(props));
  }
  DFL.showModal(h(Body), win, { strTitle: 'Tender' });
}

/**
 * Tender's REAL QAM panel, mounted in the desktop. This is what proved a full
 * sync run works with the desktop client open.
 *
 * TWO THINGS BREAK, both measured, both listed because neither is obvious:
 *
 * 1. `WidePage` throws `Cannot read properties of undefined (reading 'm_Opacity')`
 *    inside Steam's own code — it reaches for gamepad-UI state that does not
 *    exist in desktop mode. The Sync page renders; the Library page does not.
 *    So the QAM pages cannot simply be reused here.
 * 2. The panel's current page is a MODULE-LEVEL variable, so once a page throws,
 *    remounting lands on it again and throws again. A fresh element does not
 *    help. `DeckyPluginLoader.importPlugin('Tender')` reloads the plugin's
 *    frontend and resets that state without restarting Steam or the loader.
 */
function mountRealPanel() {
  const win = deskWin(), d = win.document;
  const R = window.SP_REACT;
  const plugins = DeckyPluginLoader.plugins;
  const tender = Array.isArray(plugins) ? plugins.find((p) => p && p.name === 'Tender') : plugins['Tender'];
  if (!tender || !tender.content) return null;
  try { win.__TENDER_QAM_ROOT?.unmount(); } catch (e) {}
  d.getElementById('tender-qam-host')?.remove();
  const host = d.createElement('div');
  host.id = 'tender-qam-host';
  host.style.cssText = 'position:fixed;top:0;right:0;width:420px;height:100vh;overflow:auto;z-index:99999;background:#0e141b';
  d.body.appendChild(host);
  const root = reactClient().createRoot(host);
  root.render(R.createElement(DFL.ErrorBoundary, null, tender.content));
  win.__TENDER_QAM_ROOT = root;
  return root;
}

/**
 * Error listener INSIDE the realm that actually throws.
 *
 * Without this a whole afternoon was spent reading an empty log: the QAM and the
 * desktop client each render in their own browser view, and a listener on
 * SharedJSContext never sees their exceptions. The handle comes from Steam's own
 * nav trees and is public.
 *
 * It dies with its view, so re-attach after every remount — same lifetime rule
 * as the injected panel.
 */
function watchRealmErrors(navTreeId) {
  const tree = DFL.getGamepadNavigationTrees().find((t) => t && t.id === navTreeId);
  const win = tree && tree.m_Root && tree.m_Root.m_element && tree.m_Root.m_element.ownerDocument.defaultView;
  if (!win) return { attached: false };
  win.__TENDER_REALM_ERRORS = win.__TENDER_REALM_ERRORS || [];
  if (!win.__TENDER_REALM_HOOKED) {
    win.addEventListener('error', (e) => win.__TENDER_REALM_ERRORS.push({ msg: String(e.message), stack: String((e.error && e.error.stack) || '') }));
    win.addEventListener('unhandledrejection', (e) => win.__TENDER_REALM_ERRORS.push({ msg: 'rejection: ' + String((e.reason && e.reason.message) || e.reason) }));
    win.__TENDER_REALM_HOOKED = true;
  }
  return { attached: true, doc: win.document.title };
}
