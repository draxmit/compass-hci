const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
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
// pnpm hoists jspdf to the workspace root (not app/node_modules), so
// resolve from workspaceRoot. Existence is checked with `require.resolve`
// at module-load time so a missing file fails loud instead of producing
// an opaque 'Failed to get SHA-1' Metro error at bundle time.
const jspdfBrowserPath = require.resolve('jspdf/dist/jspdf.es.min.js', {
  paths: [
    path.resolve(projectRoot, 'node_modules'),
    path.resolve(workspaceRoot, 'node_modules'),
  ],
});
const previousResolveRequest = finalConfig.resolver.resolveRequest;
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
  if (typeof previousResolveRequest === 'function') {
    return previousResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = finalConfig;
