const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const fs = require('fs');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// 1. Watch all files in the monorepo
config.watchFolders = [workspaceRoot];

// 2. Resolve modules from app/node_modules first, then workspace root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// 3. Force a single React instance (pnpm hoisting can produce dupes)
config.resolver.disableHierarchicalLookup = true;

// 4. Disable package.json `exports` field resolution for now.
// Zustand 4.5+'s ESM build uses `import.meta.env.MODE` for dev warnings; with
// exports enabled, Metro picks the ESM path and ships untransformed `import.meta`
// to the web dev runtime, which loads bundles as classic scripts → SyntaxError.
// Falling back to CJS resolution avoids this without per-package shims.
config.resolver.unstable_enablePackageExports = false;

// 5. Apply NativeWind FIRST so its own resolver wrapping is in place,
// then layer our redirect on top so we have the outermost word on
// `resolveRequest`. (Earlier draft wrapped before NativeWind and the
// override was clobbered.)
const finalConfig = withNativeWind(config, { input: './global.css' });

// 6. Redirect jspdf / jspdf-autotable cleanly per platform.
//
// jspdf has three dist variants: `dist/jspdf.es.min.js` (browser ESM),
// `dist/jspdf.node.min.js` (Node, with AMD-style `require([...])` calls
// Metro can't handle), and the UMD bundle. With
// `unstable_enablePackageExports = false` (set above for Zustand)
// Metro's main-field resolution lands on the Node variant — even on
// web — and the bundle fails with:
//   Invalid call at line 303: require(["html2canvas"], t)
//
// Fix: explicitly resolve `jspdf` to the browser ESM file on web,
// and to the empty shim on native (the runtime Platform.OS guard
// keeps the code path off native, so the shim never executes).
// `jspdf-autotable` has only one `main` entry and is fine to bundle
// directly on web; on native it's redirected to the same empty shim.
const emptyShimPath = path.resolve(projectRoot, 'src/shared/utils/empty-module.js');
// pnpm hoists these to the workspace root (not app/node_modules), so
// resolve from workspaceRoot. Existence is checked with `require.resolve`
// at module-load time so a missing file fails loud instead of producing
// an opaque 'Failed to get SHA-1' Metro error at bundle time.
const candidatePaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

function findFirstExisting(relPath) {
  for (const base of candidatePaths) {
    const full = path.join(base, relPath);
    if (fs.existsSync(full)) return full;
  }
  throw new Error(`metro.config.js: cannot find ${relPath} in any of: ${candidatePaths.join(', ')}`);
}

const jspdfBrowserPath = findFirstExisting('jspdf/dist/jspdf.es.min.js');
// docx ships several dist variants. The default `main` (`index.umd.cjs`)
// has internal patterns Metro can't statically resolve and crashes
// at runtime with `Requiring unknown module N`.
//
// We point at `index.cjs` (plain CommonJS, single file). Resolved
// via filesystem walk because docx's package.json `exports` field
// blocks subpath access (`require.resolve('docx/dist/...')` throws
// 'Package subpath ... is not defined by exports'). Walking the
// candidate node_modules dirs sidesteps the exports restriction.
const docxBrowserPath = findFirstExisting('docx/dist/index.cjs');
const previousResolveRequest = finalConfig.resolver.resolveRequest;
// jspdf has internal AMD-style require() calls for optional features
// we never use (HTML-to-PDF needs html2canvas, sanitization needs
// dompurify, SVG rendering needs canvg). Metro's static analysis
// picks these up and assigns module IDs that fail at runtime with
// "Requiring unknown module N". Redirect each to the empty shim
// universally — jspdf catches the missing module and degrades
// gracefully when those features are invoked, which we don't.
const JSPDF_OPTIONAL_DEPS = new Set(['html2canvas', 'dompurify', 'canvg']);

finalConfig.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'jspdf') {
    return {
      type: 'sourceFile',
      filePath: platform === 'web' ? jspdfBrowserPath : emptyShimPath,
    };
  }
  if (moduleName === 'jspdf-autotable' && platform !== 'web') {
    return { type: 'sourceFile', filePath: emptyShimPath };
  }
  if (JSPDF_OPTIONAL_DEPS.has(moduleName)) {
    return { type: 'sourceFile', filePath: emptyShimPath };
  }
  if (moduleName === 'docx') {
    return {
      type: 'sourceFile',
      filePath: platform === 'web' ? docxBrowserPath : emptyShimPath,
    };
  }
  if (typeof previousResolveRequest === 'function') {
    return previousResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = finalConfig;
