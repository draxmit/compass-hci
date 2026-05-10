import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * Custom HTML wrapper for the WEB build — runs ONCE at build time on
 * the static-export server. Lets us set the <title>, meta tags, and
 * inject any global CSS that needs to land outside the React tree.
 *
 * Native (iOS / Android) ignores this file entirely; the title there
 * comes from app.config.ts > name and the chrome is OS-managed.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="id">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />
        {/* Tab title — was previously falling back to the URL hostname
            because no <title> was set. */}
        <title>Compass — Personal Finance</title>
        <meta
          name="description"
          content="Compass: Indonesian-first personal finance tracker. Catat transaksi, atur budget, lihat insights — semua dalam satu app."
        />
        <meta name="theme-color" content="#059669" />
        {/* Mobile web app capable so iOS PWA add-to-home-screen lands
            in fullscreen mode without browser chrome. */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Compass" />

        {/* Disables overscroll/pull-to-refresh on the body — RN-Web's
            ScrollView handles its own scroll; the browser's native
            overscroll fights the in-app gesture handlers (especially
            the heatmap day-sheet swipe-to-close). */}
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
