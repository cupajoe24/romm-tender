// Spike-only rollup config (#1897). Differs from the repo's build in ONE way
// that is the point of the spike: @decky/ui is BUNDLED, not mapped to the DFL
// global, so the bundle does not depend on Decky's own bundle being present.
// React stays external and is taken from Steam's own globals.
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const worktree = resolve(here, '..');

// The rollup plugins live in @decky/rollup's dependency tree (pnpm), not at the
// worktree root, so resolve them from there rather than pinning a store path.
const req = createRequire(resolve(worktree, 'node_modules/@decky/rollup/src/index.js'));
const load = async (name) => {
  const mod = await import(pathToFileURL(req.resolve(name)).href);
  return mod.default ?? mod;
};

const typescript = await load('@rollup/plugin-typescript');
const nodeResolveMod = await load('@rollup/plugin-node-resolve');
const nodeResolve = nodeResolveMod.nodeResolve ?? nodeResolveMod;
const commonjs = await load('@rollup/plugin-commonjs');
const externalGlobals = await load('rollup-plugin-external-globals');

const common = {
  context: 'window',
  external: ['react', 'react-dom', 'react/jsx-runtime'],
  plugins: [
    typescript({ tsconfig: resolve(here, 'tsconfig.json'), noEmitOnError: false }),
    commonjs(),
    nodeResolve({ browser: true }),
    externalGlobals({
      react: 'SP_REACT',
      'react/jsx-runtime': 'SP_JSX',
      'react-dom': 'SP_REACTDOM',
    }),
  ],
};

// Two entry points, deliberately separate. globals.js imports ONLY @decky/ui's
// webpack half and installs SP_REACT / SP_JSX / SP_REACTDOM; index.js maps react
// onto those globals, so it cannot even load until globals.js has run. Folding
// them into one bundle would not work: ESM hoists the @decky/ui import above any
// setup code in the same module. Decky splits it for the same reason.
export default [
  { ...common, input: resolve(here, 'frontend/globals.ts'),
    output: { file: resolve(here, 'dist/globals.js'), format: 'esm', sourcemap: false } },
  { ...common, input: resolve(here, 'frontend/index.tsx'),
    output: { file: resolve(here, 'dist/index.js'), format: 'esm', sourcemap: false } },

  // Third build, identical source, ONE difference: @decky/ui comes from Decky's
  // own already-loaded copy via the DFL global instead of being bundled again.
  // That removes the second initModuleCache() sweep (webpack.js:4-30), which is
  // the prime suspect for the React #31 that killed the QAM four times beside a
  // running Decky. Only loadable WITH Decky present — DFL is Decky's global.
  { ...common,
    input: resolve(here, 'frontend/index.tsx'),
    external: [...common.external, '@decky/ui'],
    plugins: [
      ...common.plugins,
      externalGlobals({ '@decky/ui': 'DFL' }),
    ],
    output: { file: resolve(here, 'dist/index-dfl.js'), format: 'esm', sourcemap: false } },
];
