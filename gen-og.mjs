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
  <meta name="apple-itunes-app" content="app-id=6785691522, app-argument=https://app.lamisaexplicada.com/${kind}/${encodeURIComponent(id)}">
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
    .hero {
      width: 100%; aspect-ratio: 2 / 1; object-fit: cover;
      border-radius: 14px; margin-bottom: 22px; display: block;
    }
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
    .cta-row { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin-top: 26px; }
    .cta-row .cta { margin-top: 0; }
  </style>
</head>
<body>
  <div class="card">
${hasOwnImage ? `    <img class="hero" src="og.jpg" alt="">\n` : ""}    <div class="eyebrow">La Misa Explicada</div>
    <h1>${esc(title)}</h1>
    <div class="rule"></div>
    <p>Este contenido vive en la app. Si ya tienes <strong>La Misa Explicada</strong> instalada, el enlace se abre directo en la app; si no, instálala para verlo.</p>
    <div class="cta-row">
      <a class="cta" href="https://apps.apple.com/app/id6785691522">App&nbsp;Store</a>
      <a class="cta" href="https://play.google.com/store/apps/details?id=com.lamisaexplicada.app">Google&nbsp;Play</a>
    </div>
    <p class="note">Disponible para iPhone, iPad y Android.</p>
  </div>
</body>
</html>
`;

// `santo/` solo se rehace si está el espejo de Santo a fondo (si no, se
// conservan las páginas ya publicadas en vez de borrarlas).
const hayEspejoAFondo = existsSync(join(root, "../SANTO_A_FONDO_PUBLICADO/index.json"));
for (const kind of ["art", "grupo", "sm", ...(hayEspejoAFondo ? ["santo"] : [])]) {
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

// --- Santo a fondo: /santo/<MM-DD>-<slug> y /santo/m-<id romcal> ---------------
// (SANTO_A_FONDO_CLIP_DISENO.md, «Liga»). Fuente: el espejo del publicador
// (../SANTO_A_FONDO_PUBLICADO), que debe estar YA SUBIDO a R2: la página usa
// la imagen y el clip desde media.lamisaexplicada.com. Correr después de
// subir-afondo-r2.py.
const MEDIA = "https://media.lamisaexplicada.com/afondo/f/";
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const espejo = join(root, "../SANTO_A_FONDO_PUBLICADO");
const slugify = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const santoId = (dia, name) => (dia.startsWith("@") ? `m-${dia.slice(1)}` : `${dia}-${slugify(name)}`);
const santos = new Map();
if (existsSync(join(espejo, "index.json"))) {
  const index = JSON.parse(readFileSync(join(espejo, "index.json"), "utf8"));
  for (const meta of Object.values(index.meses ?? {})) {
    if (!meta) continue;
    const pack = JSON.parse(readFileSync(join(espejo, meta.file), "utf8"));
    const shaOf = new Map(pack.archivos.map((a) => [a.name, a.sha256]));
    for (const [dia, list] of Object.entries(pack.dias)) for (const s of list) {
      const id = santoId(dia, s.name);
      if (santos.has(id)) continue;
      const a = s.aFondo;
      const bio = a.secciones.find((x) => x.tipo === "biografia");
      const frases = (bio?.paginas ?? []).flatMap((p) => p.bloques.flatMap((b) => (Array.isArray(b.frases) ? b.frases : [b.value ?? ""])));
      const fecha = /^\d\d-\d\d$/.test(dia) ? `${Number(dia.slice(3))} de ${MESES[Number(dia.slice(0, 2)) - 1]}` : null;
      santos.set(id, {
        id, name: s.name, fecha, celebracion: a.celebracion === true,
        intro: frases.slice(0, 2).join(" "),
        hero: a.hero && shaOf.get(a.hero) ? `${MEDIA}${shaOf.get(a.hero)}.jpg` : null,
        clip: s.clip ? `${MEDIA}${s.clip.sha256}.mp4` : null,
        secciones: a.secciones.map((x) => x.nombre).filter(Boolean),
      });
    }
  }
} else console.warn(`  aviso: no hay ${espejo}/index.json -- sin páginas /santo`);

const recorta = (t, n) => (t.length <= n ? t : t.slice(0, t.lastIndexOf(" ", n)) + "…");
const santoPage = (s) => {
  const url = `https://app.lamisaexplicada.com/santo/${s.id}`;
  const title = `${s.name}, a fondo`;
  const desc = recorta(s.intro || DEFAULT_DESC, 200);
  const ceja = `${s.celebracion ? "Celebración" : "Santo"} a fondo${s.fecha ? ` · ${s.fecha}` : ""}`;
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="apple-itunes-app" content="app-id=6785691522, app-argument=${url}">
  <title>${esc(title)} — La Misa Explicada</title>
  <meta property="og:site_name" content="La Misa Explicada">
  <meta property="og:type" content="${s.clip ? "video.other" : "article"}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${s.hero ?? "https://app.lamisaexplicada.com/og-cover.png"}">
${s.clip ? `  <meta property="og:video" content="${s.clip}">\n  <meta property="og:video:type" content="video/mp4">\n  <meta property="og:video:width" content="1080">\n  <meta property="og:video:height" content="1920">\n` : ""}  <meta name="twitter:card" content="${s.hero ? "summary_large_image" : "summary"}">
  <meta name="description" content="${esc(desc)}">
  <style>
    :root { --bg: #F7F3EA; --ink: #2C2419; --muted: #6B5B3E; --gold: #B5922A; --accent: #8B1A1A; }
    @media (prefers-color-scheme: dark) { :root { --bg: #171310; --ink: #EDE5D2; --muted: #A89878; --gold: #C9A94E; --accent: #D96C5F; } }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: var(--bg); color: var(--ink); font-family: Georgia, "Times New Roman", serif; padding: 24px 16px 40px; text-align: center; }
    .card { max-width: 440px; margin: 0 auto; }
    .eyebrow { font-family: -apple-system, system-ui, sans-serif; font-size: 11px; letter-spacing: .18em; color: var(--gold); text-transform: uppercase; margin: 8px 0 12px; }
    h1 { font-size: 28px; font-weight: 500; line-height: 1.2; }
    .rule { width: 48px; height: 3px; background: var(--gold); margin: 16px auto; }
    video, .hero { width: 100%; border-radius: 14px; display: block; margin: 0 auto 18px; background: #000; }
    video { max-height: 78vh; aspect-ratio: 9 / 16; object-fit: contain; }
    .hero { aspect-ratio: 10 / 7; object-fit: cover; }
    p { font-family: -apple-system, system-ui, sans-serif; font-size: 15px; line-height: 1.6; color: var(--muted); }
    .intro { font-family: Georgia, serif; font-size: 17px; color: var(--ink); text-align: left; }
    .cta-row { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin-top: 24px; }
    .cta { display: inline-block; padding: 13px 26px; font-family: -apple-system, system-ui, sans-serif; font-size: 15px; font-weight: 600; color: #fff; background: var(--accent); border-radius: 12px; text-decoration: none; }
    .note { margin-top: 14px; font-size: 12.5px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="eyebrow">${esc(ceja)}</div>
    <h1>${esc(s.name)}</h1>
    <div class="rule"></div>
${s.clip ? `    <video src="${s.clip}" ${s.hero ? `poster="${s.hero}" ` : ""}controls playsinline preload="metadata"></video>\n` : s.hero ? `    <img class="hero" src="${s.hero}" alt="">\n` : ""}    <p class="intro">${esc(s.intro)}</p>
    <p style="margin-top:18px">Su historia completa${s.secciones.length ? ` (${esc(s.secciones.join(" · "))})` : ""}, narrada, está en la app <strong>La Misa Explicada</strong>.</p>
    <div class="cta-row">
      <a class="cta" href="https://apps.apple.com/app/id6785691522">App&nbsp;Store</a>
      <a class="cta" href="https://play.google.com/store/apps/details?id=com.lamisaexplicada.app">Google&nbsp;Play</a>
    </div>
    <p class="note">Disponible para iPhone, iPad y Android.</p>
  </div>
</body>
</html>
`;
};
for (const s of santos.values()) {
  const dir = join(root, "santo", s.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), santoPage(s));
}
console.log(`Generadas ${santos.size} páginas /santo (${[...santos.values()].filter((s) => s.clip).length} con clip) desde ${espejo}`);
