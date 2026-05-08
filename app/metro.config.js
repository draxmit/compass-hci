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

// 6. Redirect web-only packages to an empty shim on native bundles.
// jspdf + jspdf-autotable are browser-targeted (jspdf's `main` resolves
// to `dist/jspdf.node.min.js` which has internal `require([...])` calls
// Metro can't handle). The PDF export code path is gated by
// `Platform.OS === 'web'` at runtime, so a no-op shim on native is
// sufficient — and required, since Metro's static graph walk would
// otherwise try to bundle jspdf for native and fail.
//
// Also alias via `resolver.extraNodeModules` as a belt-and-braces
// fallback in case `resolveRequest` doesn't fire for transitive
// imports inside Metro's caching layer.
const WEB_ONLY_PACKAGES = new Set(['jspdf', 'jspdf-autotable']);
const emptyShimPath = path.resolve(projectRoot, 'src/shared/utils/empty-module.js');
const previousResolveRequest = finalConfig.resolver.resolveRequest;
finalConfig.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform !== 'web' && WEB_ONLY_PACKAGES.has(moduleName)) {
    return { type: 'sourceFile', filePath: emptyShimPath };
  }
  if (typeof previousResolveRequest === 'function') {
    return previousResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = finalConfig;
