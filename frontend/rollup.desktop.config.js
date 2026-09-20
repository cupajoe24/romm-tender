import builds from "./rollup.config.js";

// Dev config with source maps enabled for CEF debugging
// Build-time injection of desktop navigation watcher
// This mounts the desktop UI surface without modifying frontend/src/index.tsx on disk
const desktopWatcherPlugin = {
  name: "inject-desktop-watcher",
  transform(code, id) {
    const normalized = id.replace(/\\/g, "/");
    if (normalized.endsWith("/src/index.tsx")) {
      let transformed = `import { startDesktopNavigationWatcher, stopDesktopNavigationWatcher } from "./desktop";\n${code}`;
      transformed = transformed.replace(
        "mountPruneLeasePlugin();",
        "mountPruneLeasePlugin();\n  startDesktopNavigationWatcher();",
      );
      transformed = transformed.replace(
        "collapseQamOnDismount();",
        "collapseQamOnDismount();\n      stopDesktopNavigationWatcher();",
      );
      return {
        code: transformed,
        map: null,
      };
    }
  },
};

export default builds.map((build) => ({
  ...build,
  output: { ...build.output, sourcemap: true },
  plugins: [...build.plugins, desktopWatcherPlugin],
}));
