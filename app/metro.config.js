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

module.exports = withNativeWind(config, { input: './global.css' });
