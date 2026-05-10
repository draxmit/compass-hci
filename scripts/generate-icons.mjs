// Render the Compass logo (SVG-based) to the PNG asset files Expo
// expects: icon.png (main app icon), adaptive-icon.png (Android
// adaptive icon foreground layer), and favicon.png (web tab).
//
// Run with: node scripts/generate-icons.mjs
//
// Outputs land in app/assets/. Re-run whenever the brand color
// (#059669) or the SVG logo geometry changes — the script is
// deterministic so the diffs are clean.

import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT_DIR = join(ROOT, 'app', 'assets');

const BRAND = '#059669';   // emerald-600 — same accent everywhere in the app
const BG = '#000000';      // app icon background (matches splash)

// Compass needle logo, 24x24 viewBox. Mirror of app/src/shared/ui/Logo.tsx
// so the launcher icon, web favicon, and in-app sidebar logo all read
// as the same brand.
function logoSvg({ scale = 0.55, color = BRAND } = {}) {
  // Wrap in a transform so the 24x24 logo is centred + scaled inside
  // the larger square. scale=0.55 ≈ Apple/Google "central 60% safe zone".
  const offset = (24 - 24 * scale) / 2;
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
      <g transform="translate(${offset} ${offset}) scale(${scale})">
        <path d="M12 2 L16 12 L12 13 Z" fill="${color}" />
        <path d="M12 22 L8 12 L12 13 Z" fill="${color}" fill-opacity="0.45" />
        <circle cx="12" cy="12.5" r="1.4" fill="${color}" />
      </g>
    </svg>`;
}

// Favicon-specific design — classic two-tone compass needle: solid
// emerald NORTH half + white SOUTH half, transparent background, no
// surrounding circle (per user feedback through several iterations).
//
// Visibility trick: white-on-transparent disappears on white tab
// themes, so the white south half gets a thin emerald stroke around
// it. On dark tabs the white fill carries; on white tabs the
// emerald outline still describes the shape. Either way the
// compass reads as 'green and white', never 'green and black'.
function faviconSvg() {
  return `
    <svg xmlns="http://www.w3.org/2000/svg"
         viewBox="7 1 10 22"
         preserveAspectRatio="xMidYMid meet"
         fill="none">
      <!-- North half — solid emerald triangle. -->
      <path d="M12 2 L16 12 L12 13 Z" fill="${BRAND}" />
      <!-- South half — WHITE fill with an emerald stroke so it's
           visible on both light and dark tab backgrounds. -->
      <path d="M12 22 L8 12 L12 13 Z"
            fill="#ffffff"
            stroke="${BRAND}"
            stroke-width="0.6"
            stroke-linejoin="round" />
      <!-- Center pivot — solid emerald (matches the north half so
           the centre reads as the 'anchored' point of the needle). -->
      <circle cx="12" cy="12.5" r="1.4" fill="${BRAND}" />
    </svg>`;
}

async function renderToPng({ size, svg, out, background }) {
  let pipeline = sharp(Buffer.from(svg), { density: Math.max(72, size) })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } });
  if (background) {
    pipeline = pipeline.flatten({ background });
  }
  const buf = await pipeline.png().toBuffer();
  await writeFile(out, buf);
  console.log(`  wrote ${out} (${size}×${size}${background ? `, bg ${background}` : ', transparent'})`);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  console.log('Generating Compass icons…');

  // 1. icon.png — main app icon (iOS + fallback Android). Solid black
  //    background with the emerald compass needle centred. 1024×1024
  //    is the canonical size Apple expects; Expo / EAS will downscale
  //    for every other density.
  await renderToPng({
    size: 1024,
    svg: logoSvg({ scale: 0.55 }),
    out: join(OUT_DIR, 'icon.png'),
    background: BG,
  });

  // 2. adaptive-icon.png — Android adaptive icon FOREGROUND. The
  //    backgroundColor already set in app.config.ts (#000000) is
  //    composited behind. Smaller scale (0.42) to give Android
  //    Adaptive Icon the room to crop / round-corner / parallax
  //    without clipping the needle.
  await renderToPng({
    size: 1024,
    svg: logoSvg({ scale: 0.42 }),
    out: join(OUT_DIR, 'adaptive-icon.png'),
    // Transparent: Android composites on top of adaptiveIcon.backgroundColor.
  });

  // 3. favicon.png — browser tab icon. Transparent bg, compass FACE
  //    (circle outline) + needle inside, scaled to fill the frame.
  //    The bare-needle approach left big horizontal margins because
  //    the needle is tall+narrow (aspect ~0.4); adding the encircling
  //    face fills the square AND makes the icon read as a proper
  //    compass at small sizes, not just a green sliver.
  //    64×64 source — modern browsers prefer PNG to ICO and
  //    downscale to 16×16 / 32×32 internally.
  await renderToPng({
    size: 64,
    svg: faviconSvg(),
    out: join(OUT_DIR, 'favicon.png'),
    // Transparent — no background flatten.
  });

  console.log('Done.');
}

await main();
