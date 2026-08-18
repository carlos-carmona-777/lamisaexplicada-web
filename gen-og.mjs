#!/usr/bin/env node
// Genera páginas estáticas /art/<id>/ /grupo/<id>/ /sm/<id>/ con metadatos
// Open Graph por destino, para que WhatsApp/iMessage/Telegram muestren el
// TÍTULO del artículo en la vista previa del link compartido desde la app
// (ShareToolbarButton en iOS/Android) en vez del nombre genérico del sitio.
//
// Fuente de verdad: el content_bundle.json empacado en la app iOS (mismo
// contenido que Android via sync). Correr DESPUÉS de cambiar contenido y
// commitear el resultado:
//
//   node gen-og.mjs [ruta/al/content_bundle.json]
//
// Filtros (mismo criterio que las apps):
//   - Secciones Master con `pruebas: true` u `oculta: true` no se publican,
//     ni nada de sus árboles propios.
//   - Nodos con `pruebas: true` en cualquier árbol se saltan completos.
//
// GitHub Pages sirve /art/<id>/index.html para /art/<id>; cualquier id que
// no tenga página cae al 404.html genérico (que también trae OG de marca).

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const bundlePath =
  process.argv[2] ??
  join(root, "../LaMisaExplicada/LaMisaExplicada/Resources/content_bundle.json");
// Las imágenes del contenido viven junto al bundle (`Resources/Images/`) --
// mismo layout que empaca la app iOS.
const imagesDir = join(dirname(bundlePath), "Images");

const bundle = JSON.parse(readFileSync(bundlePath, "utf8"));

const esc = (s) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const DEFAULT_DESC =
  "Conoce la belleza y verdad de la Liturgia Católica en La Misa Explicada.";

// (kind, id) -> { title, desc, image }
const pages = new Map();
const add = (kind, id, title, desc, image) => {
  if (!id || !title) return;
  pages.set(`${kind}/${id}`, {
    kind,
    id,
    title,
    desc: desc || DEFAULT_DESC,
    image: image || null,
  });
};

const walk = (nodes) => {
  for (const node of nodes ?? []) {
    if (node.pruebas === true) continue;
    if (node.type === "article") {
      add("art", node.id, node.title, node.subtitle, node.image || node.cardImage);
    }
    if (node.type === "section") {
      add("grupo", node.id, node.title, node.subtitle, node.image || node.cardImage);
      walk(node.subsections);
    }
  }
};

walk(bundle.sections);
for (const sm of bundle.masterSections ?? []) {
  if (sm.pruebas === true || sm.oculta === true) continue;
  add("sm", sm.id, sm.name, sm.homeCard?.subtitle, sm.homeCard?.image);
  walk(sm.sections);
}

// Redimensiona la imagen del destino a JPEG <=1200px de ancho (tarjeta
// grande de WhatsApp/iMessage; su hero ~2:1 ya casi calza el 1.91:1 ideal)
// con `sips` (viene con macOS). Devuelve true si dejó `<dir>/og.jpg`;
// false (fallback al og-cover.png genérico) si la imagen no existe en
// `Resources/Images/` -- p.ej. contenido nuevo por OTA aún no sincronizado
// al repo de la app.
const makeOgImage = (entry, dir) => {
  if (!entry.image) return false;
  const src = join(imagesDir, entry.image);
  if (!existsSync(src)) {
    console.warn(`  aviso: ${entry.kind}/${entry.id} referencia imagen inexistente "${entry.image}" -- usa portada genérica`);
    return false;
  }
  const width = parseInt(
    spawnSync("sips", ["-g", "pixelWidth", src], { encoding: "utf8" })
      .stdout?.match(/pixelWidth: (\d+)/)?.[1] ?? "0",
    10,
  );
  const args = width > 1200 ? ["--resampleWidth", "1200"] : [];
  const result = spawnSync(
    "sips",
    [...args, "-s", "format", "jpeg", "-s", "formatOptions", "78", src, "--out", join(dir, "og.jpg")],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    console.warn(`  aviso: sips falló con "${entry.image}" -- usa portada genérica`);
    return false;
  }
  return true;
};

const page = ({ kind, id, title, desc }, hasOwnImage) => `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)} — La Misa Explicada</title>
  <meta property="og:site_name" content="La Misa Explicada">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:url" content="https://app.lamisaexplicada.com/${kind}/${encodeURIComponent(id)}">
  <meta property="og:image" content="https://app.lamisaexplicada.com/${hasOwnImage ? `${kind}/${encodeURIComponent(id)}/og.jpg` : "og-cover.png"}">
  <meta name="twitter:card" content="${hasOwnImage ? "summary_large_image" : "summary"}">
  <meta name="description" content="${esc(desc)}">
  <style>
    :root {
      --bg: #F7F3EA; --ink: #2C2419; --muted: #6B5B3E; --gold: #B5922A; --accent: #8B1A1A;
    }
    @media (prefers-color-scheme: dark) {
      :root { --bg: #171310; --ink: #EDE5D2; --muted: #A89878; --gold: #C9A94E; --accent: #D96C5F; }
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: var(--bg); color: var(--ink);
      font-family: Georgia, "Times New Roman", serif;
      min-height: 100vh; display: flex; align-items: center; justify-content: center;
      padding: 24px; text-align: center;
    }
    .card { max-width: 420px; }
    .eyebrow {
      font-family: -apple-system, system-ui, sans-serif; font-size: 11px;
      letter-spacing: .18em; color: var(--gold); text-transform: uppercase; margin-bottom: 14px;
    }
    h1 { font-size: 30px; font-weight: 500; line-height: 1.2; }
    .rule { width: 48px; height: 3px; background: var(--gold); margin: 18px auto; }
    p { font-family: -apple-system, system-ui, sans-serif; font-size: 15px; line-height: 1.6; color: var(--muted); }
    .cta {
      display: inline-block; margin-top: 26px; padding: 13px 26px;
      font-family: -apple-system, system-ui, sans-serif; font-size: 15px; font-weight: 600;
      color: #fff; background: var(--accent); border-radius: 12px; text-decoration: none;
    }
    .note { margin-top: 16px; font-size: 12.5px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="eyebrow">La Misa Explicada</div>
    <h1>${esc(title)}</h1>
    <div class="rule"></div>
    <p>Este contenido vive en la app. Si ya tienes <strong>La Misa Explicada</strong> instalada, el enlace se abre directo en la app; si no, instálala para verlo.</p>
    <!-- TODO: al publicar en las tiendas, apuntar a la URL real de App Store / Play Store -->
    <a class="cta" href="/">Descargar la app</a>
    <p class="note">Muy pronto en App Store y Google Play.</p>
  </div>
</body>
</html>
`;

for (const kind of ["art", "grupo", "sm"]) {
  rmSync(join(root, kind), { recursive: true, force: true });
}
let withImage = 0;
for (const entry of pages.values()) {
  const dir = join(root, entry.kind, entry.id);
  mkdirSync(dir, { recursive: true });
  const hasOwnImage = makeOgImage(entry, dir);
  if (hasOwnImage) withImage += 1;
  writeFileSync(join(dir, "index.html"), page(entry, hasOwnImage));
}

console.log(`Generadas ${pages.size} páginas OG (${withImage} con imagen propia) desde ${bundlePath}`);
