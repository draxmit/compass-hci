// Empty module shim. Used by metro.config.js to redirect web-only
// package imports (jspdf / jspdf-autotable) away from the native
// bundle graph. The native code path that calls these is gated by
// `Platform.OS === 'web'` and never executes at runtime, so the
// shim just satisfies Metro's static graph traversal.
module.exports = {};
