import { configure } from "./rollup.config.js";

// Dev config with source maps enabled for CEF debugging
// Build-time injection of the desktop surface
// This starts the desktop UI surface without modifying frontend/src/index.tsx on disk
const START_ANCHOR = "mountPruneLeasePlugin();";

const desktopSurfacePlugin = {
  name: "inject-desktop-surface",
  transform(code, id) {
    const normalized = id.replace(/\\/g, "/");
    if (!normalized.endsWith("/src/index.tsx")) return null;
    if (!code.includes(START_ANCHOR)) {
      this.error(`no longer contains ${START_ANCHOR}, so the desktop surface would not start`);
    }
    // No stop call: a JS-context rebuild, not a teardown call, is what ends the panel.
    const transformed = `import { startDesktopSurface } from "./desktop";\n${code.replace(
      START_ANCHOR,
      `${START_ANCHOR}\n  startDesktopSurface();`,
    )}`;
    return { code: transformed, map: null };
  },
};

export default configure({ sourcemap: true }).map((build) => ({
  ...build,
  plugins: [...build.plugins, desktopSurfacePlugin],
}));
