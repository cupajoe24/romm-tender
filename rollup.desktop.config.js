import config from "./rollup.config.js";

// Dev config with source maps enabled for CEF debugging
config.output.sourcemap = true;

// Build-time injection of desktop navigation watcher
// This mounts the desktop UI surface without modifying frontend/src/index.tsx on disk
config.plugins.push({
  name: "inject-desktop-watcher",
  transform(code, id) {
    const normalized = id.replace(/\\/g, "/");
    if (normalized.endsWith("frontend/src/index.tsx")) {
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
});

export default config;
