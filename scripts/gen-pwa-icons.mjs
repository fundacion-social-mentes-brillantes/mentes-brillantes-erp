// Genera los iconos de la PWA (Android/iOS) a partir del logo.
// Uso: node scripts/gen-pwa-icons.mjs
// Requiere "sharp" (ya presente en node_modules).
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const SRC = "public/logo-mentes-brillantes.png";
const OUT = "public/icons";

// Fondo de marca: azul muy oscuro con un brillo dorado, igual que el panel lateral de la app.
function background(size) {
  const svg = `
  <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#0f1c25"/>
        <stop offset="100%" stop-color="#060c11"/>
      </linearGradient>
      <radialGradient id="glow" cx="76%" cy="20%" r="62%">
        <stop offset="0%" stop-color="#d3b657" stop-opacity="0.38"/>
        <stop offset="55%" stop-color="#bf953f" stop-opacity="0.10"/>
        <stop offset="100%" stop-color="#bf953f" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${size}" height="${size}" fill="url(#bg)"/>
    <rect width="${size}" height="${size}" fill="url(#glow)"/>
  </svg>`;
  return Buffer.from(svg);
}

// Compone el logo centrado sobre el fondo de marca.
// inner = fracción del ancho que ocupa el logo (deja margen alrededor).
async function makeIcon(size, inner, outFile, { flatten = false } = {}) {
  const logoW = Math.round(size * inner);
  const logo = await sharp(SRC)
    .resize({ width: logoW, fit: "inside", withoutEnlargement: false })
    .toBuffer();
  const logoMeta = await sharp(logo).metadata();
  const left = Math.round((size - logoMeta.width) / 2);
  const top = Math.round((size - logoMeta.height) / 2);

  let img = sharp(background(size))
    .composite([{ input: logo, left, top }])
    .png();

  if (flatten) img = img.flatten({ background: "#0a1016" });

  await img.toFile(outFile);
  console.log("✓", outFile, `${size}x${size}`);
}

await mkdir(OUT, { recursive: true });

// Iconos estándar (purpose: any) — algo de margen.
await makeIcon(192, 0.82, `${OUT}/icon-192.png`);
await makeIcon(512, 0.82, `${OUT}/icon-512.png`);

// Iconos "maskable" — el logo debe quedar dentro de la zona segura (~80%),
// por eso usamos menos escala para que Android no lo recorte.
await makeIcon(192, 0.62, `${OUT}/icon-maskable-192.png`);
await makeIcon(512, 0.62, `${OUT}/icon-maskable-512.png`);

// Icono de iOS (Apple touch icon): sin transparencia, 180x180.
await makeIcon(180, 0.80, "public/apple-touch-icon.png", { flatten: true });

// Favicon PNG (lo usa Next desde /icon si existe; aquí lo dejamos en public).
await makeIcon(64, 0.86, "public/favicon-64.png", { flatten: true });

console.log("Listo: iconos PWA generados.");
