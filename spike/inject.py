#!/usr/bin/env python3
"""Injects the #1897 spike bundle into Steam's live SharedJSContext. Stdlib only.

Steam's CEF debugger answers on http://localhost:8080/json. We open a raw
WebSocket to the SharedJSContext target and evaluate a dynamic import() of our
own loopback URL — that import is the whole bootstrap, and everything the spike
does happens inside the bundle.

Default mode stays alive and re-injects when the JS context goes away:
Decky's RestartJSContext() (what `systemctl restart plugin_loader` triggers)
tears the context down and takes us with it.
"""

from __future__ import annotations

import argparse
import base64
import contextlib
import json
import os
import socket
import struct
import sys
import time
import urllib.error
import urllib.request

TARGET_TITLE = "SharedJSContext"
MAX_CONSECUTIVE_FAILURES = 3


# ----------------------------------------------------------------- CDP client
def list_targets(debug_port: int) -> list[dict]:
    with urllib.request.urlopen(f"http://localhost:{debug_port}/json", timeout=5) as resp:
        return json.load(resp)


def find_target(debug_port: int, title: str = TARGET_TITLE) -> dict | None:
    for target in list_targets(debug_port):
        if target.get("title") == title:
            return target
    return None


class Ws:
    """The smallest WebSocket client that can drive Runtime.evaluate."""

    def __init__(self, ws_url: str, timeout: float = 20.0) -> None:
        if not ws_url.startswith("ws://"):
            raise ValueError(f"unexpected debugger url: {ws_url}")
        hostport, _, path = ws_url[5:].partition("/")
        host, _, port = hostport.partition(":")
        self.sock = socket.create_connection((host, int(port or 80)), timeout=timeout)
        key = base64.b64encode(os.urandom(16)).decode()
        request = (
            f"GET /{path} HTTP/1.1\r\nHost: {hostport}\r\nUpgrade: websocket\r\n"
            f"Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n"
        )
        self.sock.sendall(request.encode())
        buf = b""
        while b"\r\n\r\n" not in buf:
            chunk = self.sock.recv(4096)
            if not chunk:
                raise RuntimeError("debugger closed during handshake")
            buf += chunk
        status_line = buf.split(b"\r\n", 1)[0]
        if b"101" not in status_line:
            raise RuntimeError(f"handshake failed: {status_line!r}")
        self._id = 0

    # --- framing
    def _send(self, payload: bytes) -> None:
        mask = os.urandom(4)
        masked = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
        n = len(payload)
        if n < 126:
            header = struct.pack("!BB", 0x81, 0x80 | n)
        elif n < 65536:
            header = struct.pack("!BBH", 0x81, 0x80 | 126, n)
        else:
            header = struct.pack("!BBQ", 0x81, 0x80 | 127, n)
        self.sock.sendall(header + mask + masked)

    def _recv_exact(self, n: int) -> bytes:
        out = b""
        while len(out) < n:
            chunk = self.sock.recv(n - len(out))
            if not chunk:
                raise RuntimeError("debugger closed")
            out += chunk
        return out

    def _recv_frame(self) -> tuple[int, bytes]:
        b0, b1 = self._recv_exact(2)
        n = b1 & 0x7F
        if n == 126:
            n = struct.unpack("!H", self._recv_exact(2))[0]
        elif n == 127:
            n = struct.unpack("!Q", self._recv_exact(8))[0]
        if b1 & 0x80:
            mask = self._recv_exact(4)
            data = bytes(c ^ mask[i % 4] for i, c in enumerate(self._recv_exact(n)))
        else:
            data = self._recv_exact(n)
        return b0 & 0x0F, data

    # --- protocol
    def call(self, method: str, params: dict | None = None) -> dict:
        self._id += 1
        message_id = self._id
        self._send(json.dumps({"id": message_id, "method": method, "params": params or {}}).encode())
        while True:
            opcode, data = self._recv_frame()
            if opcode == 0x8:
                raise RuntimeError("debugger closed the socket")
            if opcode not in (0x1, 0x2):
                continue
            message = json.loads(data)
            if message.get("id") == message_id:
                return message

    def next_event(self, timeout: float | None) -> dict | None:
        """One protocol event, or None on timeout."""
        self.sock.settimeout(timeout)
        try:
            while True:
                opcode, data = self._recv_frame()
                if opcode == 0x8:
                    raise RuntimeError("debugger closed the socket")
                if opcode not in (0x1, 0x2):
                    continue
                message = json.loads(data)
                if "method" in message:
                    return message
        except TimeoutError:
            return None

    def evaluate(self, expression: str, await_promise: bool = True) -> dict:
        return self.call(
            "Runtime.evaluate",
            {
                "expression": expression,
                "awaitPromise": await_promise,
                "returnByValue": True,
                "userGesture": True,
            },
        )

    def close(self) -> None:
        with contextlib.suppress(OSError):
            self.sock.close()


# ------------------------------------------------------------------- payloads
def bootstrap_expression(port: int, icon: str | None) -> str:
    """The one-liner that loads the bundle. The cache-buster is not optional:
    without it CEF serves the module from its own cache and an edited bundle
    never arrives."""
    query = "?t=${Date.now()}"
    if icon:
        query += f"&icon={icon}"
    url = f"http://127.0.0.1:{port}/index.js{query}"
    return (
        "(async () => {"
        f"  await import(`{url}`);"
        "  const s = window.__TENDER_SPIKE;"
        "  return s"
        "    ? { ok: true, version: s.version, loadedAt: s.loadedAt, iconUrl: s.iconUrl,"
        "        moduleFound: s.moduleFound, patchedBrowserView: s.patchedBrowserView,"
        "        patchedEmbedded: s.patchedEmbedded, tabs: s.tabCount(), renders: s.renders,"
        "        deckyBackend: typeof window.DeckyBackend, dfl: typeof window.DFL }"
        "    : { ok: false, reason: 'window.__TENDER_SPIKE missing after import' };"
        "})()"
    )


STATE_EXPRESSION = (
    "(() => { const s = window.__TENDER_SPIKE;"
    " return s ? { present: true, version: s.version, loadedAt: s.loadedAt, iconUrl: s.iconUrl,"
    "   moduleFound: s.moduleFound, patchedBrowserView: s.patchedBrowserView,"
    "   patchedEmbedded: s.patchedEmbedded, tabs: s.tabCount(), renders: s.renders,"
    "   deckyBackend: typeof window.DeckyBackend, dfl: typeof window.DFL,"
    "   tabsHook: typeof window.__TABS_HOOK_INSTANCE }"
    " : { present: false, deckyBackend: typeof window.DeckyBackend, dfl: typeof window.DFL }; })()"
)

# Do NOT drive the Quick Access menu from here. MenuStore.OpenQuickAccessMenu()
# closes windowed Big Picture on this machine — measured three times out of
# three, on the desktop window instance and on GamepadUIMainWindowInstance
# alike, and twice it took the JS context down with it. Opening the menu is the
# operator's job; --selftest below measures the push path without it.

# The push-once guard, measured against a tabs array we hand in ourselves. This
# is the same render() the patch handler calls, so it answers "exactly one
# marked tab, still exactly one after a second render" without touching Steam's
# UI at all.
SELFTEST_EXPRESSION = (
    "(() => { const s = window.__TENDER_SPIKE;"
    " if (!s) return { ok: false, reason: 'not injected' };"
    " const tabs = [{ key: 1, decky: true }, { key: 2 }];"
    " const first = s.driveRender(tabs, true);"
    " const second = s.driveRender(tabs, true);"
    " const third = s.driveRender(tabs, false);"
    " const ours = tabs.filter((t) => t.tender);"
    " return { ok: true, afterFirstRender: first, afterSecondRender: second,"
    "   afterVisibilityChange: third, tabCount: s.tabCount(),"
    "   ourKeys: ours.map((t) => String(t.key)),"
    "   foreignTabsKept: tabs.filter((t) => !t.tender).length,"
    "   deckyTabUntouched: tabs.some((t) => t.decky && !t.tender),"
    "   deckyBackend: typeof window.DeckyBackend, dfl: typeof window.DFL,"
    "   tabsHook: typeof window.__TABS_HOOK_INSTANCE }; })()"
)

PROBE_EXPRESSION = (
    "(() => { const DFL = window.DFL;"
    " const mod = DFL.findModuleByExport((e) => e?.type?.toString?.()?.includes('QuickAccessMenuBrowserView'));"
    " const bv = mod && Object.values(mod).find((e) => e?.type?.toString?.()?.includes('QuickAccessMenuBrowserView'));"
    " const em = mod && Object.values(mod).find((e) => e?.type?.toString?.()?.includes('QuickAccessMenuEmbedded'));"
    " const out = { modFound: !!mod, browserViewRenderer: !!bv, embeddedRenderer: !!em };"
    " const root = DFL.getReactRoot(document.getElementById('root'));"
    " out.reactRoot = !!root;"
    " const node = root && DFL.findInReactTree(root, (n) => n.elementType === bv || (em && n.elementType === em));"
    " out.qamNodeFound = !!node;"
    " if (node) out.nodeTypeIsCurrentPatch = node.type === node.elementType.type;"
    " const tabsNode = root && DFL.findInReactTree(root, (x) => x?.props?.tabs);"
    " out.tabsNodeFound = !!tabsNode;"
    " if (tabsNode) out.tabs = tabsNode.props.tabs.map("
    "   (t) => ({ key: String(t.key), decky: !!t.decky, tender: !!t.tender }));"
    " return out; })()"
)

REMOVE_EXPRESSION = (
    "(() => { const s = window.__TENDER_SPIKE;"
    " if (!s) return { removed: false, reason: 'not injected' };"
    " s.unpatch(); const left = s.tabCount(); delete window.__TENDER_SPIKE;"
    " return { removed: true, tabsLeft: left }; })()"
)


def unwrap(result: dict) -> object:
    """Pull the value out of a Runtime.evaluate reply, or raise on a thrown error."""
    if "error" in result:
        raise RuntimeError(f"CDP error: {result['error']}")
    payload = result.get("result", {})
    if payload.get("exceptionDetails"):
        details = payload["exceptionDetails"]
        text = details.get("exception", {}).get("description") or details.get("text")
        raise RuntimeError(f"evaluate threw: {text}")
    return payload.get("result", {}).get("value")


# --------------------------------------------------------------------- driver
def connect(debug_port: int, title: str = TARGET_TITLE) -> Ws:
    target = find_target(debug_port, title)
    if target is None:
        raise RuntimeError(f"{title} target not found on port {debug_port}")
    return Ws(target["webSocketDebuggerUrl"])


def inject_once(ws: Ws, port: int, icon: str | None) -> object:
    return unwrap(ws.evaluate(bootstrap_expression(port, icon)))


def say(payload: object) -> None:
    print(json.dumps(payload, indent=2, ensure_ascii=False), flush=True)


def run_once(args) -> int:
    ws = connect(args.debug_port)
    try:
        say(inject_once(ws, args.port, args.icon))
    finally:
        ws.close()
    return 0


def run_state(args) -> int:
    ws = connect(args.debug_port)
    try:
        say(unwrap(ws.evaluate(STATE_EXPRESSION)))
    finally:
        ws.close()
    return 0


def run_probe(args) -> int:
    ws = connect(args.debug_port, args.title)
    try:
        say(unwrap(ws.evaluate(PROBE_EXPRESSION)))
    finally:
        ws.close()
    return 0


def run_selftest(args) -> int:
    ws = connect(args.debug_port)
    try:
        say(unwrap(ws.evaluate(SELFTEST_EXPRESSION)))
    finally:
        ws.close()
    return 0


def run_remove(args) -> int:
    ws = connect(args.debug_port)
    try:
        say(unwrap(ws.evaluate(REMOVE_EXPRESSION)))
    finally:
        ws.close()
    return 0


def run_watch(args) -> int:
    """Inject, then re-inject whenever the JS context goes away and comes back."""
    failures = 0
    while failures < MAX_CONSECUTIVE_FAILURES:
        ws = None
        try:
            ws = connect(args.debug_port)
            ws.call("Page.enable")
            ws.call("Inspector.enable")
            say({"event": "injecting", "at": time.strftime("%H:%M:%S")})
            say(inject_once(ws, args.port, args.icon))
            failures = 0
            while True:
                event = ws.next_event(timeout=None)
                if event is None:
                    continue
                method = event.get("method")
                if method in ("Page.domContentEventFired", "Inspector.detached", "Inspector.targetCrashed"):
                    say({"event": method, "at": time.strftime("%H:%M:%S"), "action": "re-inject"})
                    break
        except (RuntimeError, OSError, urllib.error.URLError) as exc:
            failures += 1
            say({"event": "failure", "count": failures, "error": str(exc)})
        finally:
            if ws is not None:
                ws.close()
        if failures >= MAX_CONSECUTIVE_FAILURES:
            say({"event": "giving up", "after": failures})
            return 1
        # The context needs a moment to come back up after a loader restart.
        time.sleep(args.settle)
    return 1


def main() -> int:
    ap = argparse.ArgumentParser(description="Inject the #1897 spike bundle into SharedJSContext")
    ap.add_argument("--port", type=int, default=27737, help="port serve.py listens on")
    ap.add_argument("--debug-port", type=int, default=8080, help="Steam CEF debugger port")
    ap.add_argument("--icon", default=None, help="icon file name, e.g. logo.svg (default: the bundle's own)")
    ap.add_argument("--settle", type=float, default=3.0, help="seconds to wait before a re-inject")
    ap.add_argument("--title", default=TARGET_TITLE, help="CEF target title for --probe (e.g. QuickAccess_uid19)")
    mode = ap.add_mutually_exclusive_group()
    mode.add_argument("--once", action="store_true", help="inject and exit")
    mode.add_argument("--remove", action="store_true", help="unpatch and exit")
    mode.add_argument("--state", action="store_true", help="read the live state and exit")
    mode.add_argument("--probe", action="store_true", help="read the live QAM tab list and exit")
    mode.add_argument("--selftest", action="store_true", help="drive the push path and report the marked-tab count")
    args = ap.parse_args()

    try:
        if args.once:
            return run_once(args)
        if args.remove:
            return run_remove(args)
        if args.state:
            return run_state(args)
        if args.probe:
            return run_probe(args)
        if args.selftest:
            return run_selftest(args)
        return run_watch(args)
    except KeyboardInterrupt:
        return 130
    except (RuntimeError, OSError, urllib.error.URLError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
