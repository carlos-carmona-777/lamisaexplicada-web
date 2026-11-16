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

// --- Pregunta de la semana: /pregunta/<id> y /pregunta/ -------------------------
// («Retar a alguien», PREGUNTA_SEMANA_DISENO.md › "Compartir la pregunta").
// Fuente: `weeklyQuestions` del bundle (solo aprobadas con semana). Quien no
// tiene la app CONTESTA aquí (choice, truefalse, fill, image); `order` y
// `place` muestran la pregunta y mandan a la app. Antes de su lunes la página
// no la muestra (la respuesta sí viaja en el HTML: es un juego, no un examen).
// `/pregunta/` (la liga corta que se lee en la imagen) brinca a la de la
// semana en curso.
const preguntas = (bundle.weeklyQuestions ?? []).filter((q) => q?.id && /^\d{4}-\d{2}-\d{2}$/.test(q.week ?? ""));
rmSync(join(root, "pregunta"), { recursive: true, force: true });
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const rangoSemana = (week) => {
  const [y, m, d] = week.split("-").map(Number);
  const lun = new Date(Date.UTC(y, m - 1, d));
  const dom = new Date(lun.getTime() + 6 * 86400000);
  const a = `${lun.getUTCDate()}${lun.getUTCMonth() === dom.getUTCMonth() ? "" : ` ${MESES_CORTOS[lun.getUTCMonth()]}`}`;
  return `${a} – ${dom.getUTCDate()} ${MESES_CORTOS[dom.getUTCMonth()]}`;
};
// Imagen <=640px para la página (sips, como og.jpg). Devuelve el nombre o null.
const imagenPregunta = (file, dir, out) => {
  const src = join(imagesDir, file ?? "");
  if (!file || !existsSync(src)) {
    console.warn(`  aviso: pregunta usa imagen inexistente "${file}"`);
    return null;
  }
  const r = spawnSync("sips", ["--resampleWidth", "640", "-s", "format", "jpeg", "-s", "formatOptions", "75", src, "--out", join(dir, out)], { encoding: "utf8" });
  return r.status === 0 ? out : null;
};
const STORE_LINKS = `<div class="cta-row">
        <a class="cta" href="https://apps.apple.com/app/id6785691522">App&nbsp;Store</a>
        <a class="cta" href="https://play.google.com/store/apps/details?id=com.lamisaexplicada.app">Google&nbsp;Play</a>
      </div>`;
const preguntaPage = (q, imgs) => {
  const url = `https://app.lamisaexplicada.com/pregunta/${encodeURIComponent(q.id)}`;
  const enWeb = ["choice", "truefalse", "fill", "image"].includes(q.type);
  // Lo que necesita el JS de la página (sin campos de editor).
  const data = {
    id: q.id, week: q.week, type: q.type, options: q.options ?? [], images: imgs.options,
    template: q.template ?? null, answer: q.answer, explanation: q.explanation ?? "",
    source: q.explanationSource ?? "", scene: imgs.scene,
    slots: (q.slots ?? []).filter((s) => !s.prefilled).map((s) => ({ label: s.label, x: s.x, y: s.y })),
  };
  const titulo = q.type === "truefalse" ? "¿Verdadero o falso?" : q.question;
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="apple-itunes-app" content="app-id=6785691522, app-argument=${url}">
  <title>Pregunta de la semana — La Misa Explicada</title>
  <meta property="og:site_name" content="La Misa Explicada">
  <meta property="og:type" content="website">
  <meta property="og:title" content="Pregunta de la semana: ¿te animas?">
  <meta property="og:description" content="${esc(q.question)}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="https://app.lamisaexplicada.com/og-cover.png">
  <meta name="twitter:card" content="summary">
  <meta name="description" content="${esc(q.question)}">
  <style>
    :root { --bg: #F7F2E7; --ink: #1A1A18; --muted: #5C574C; --gold: #8A6A12; --accent: #8B1A1A; --soft: #F0E8E8;
      --card: #FFFFFF; --line: #E2D8C2; --ok: #1F6A2E; --okbg: #E6F3E8; --bad: #A0221B; --badbg: #F8E4E2; }
    @media (prefers-color-scheme: dark) { :root { --bg: #171310; --ink: #EDE5D2; --muted: #A89878; --gold: #C9A94E; --accent: #D96C5F;
      --soft: #332020; --card: #231F19; --line: #3D3931; --ok: #74C293; --okbg: #1E2C23; --bad: #F08A80; --badbg: #3A1F1C; } }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: var(--bg); color: var(--ink); font-family: -apple-system, system-ui, sans-serif; padding: 22px 16px 40px; }
    .card { max-width: 480px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }
    .brand { display: flex; align-items: center; gap: 10px; }
    .brand img { width: 36px; height: 36px; border-radius: 8px; }
    .brand b { display: block; font-size: 14px; }
    .eyebrow { font-size: 11px; font-weight: 700; letter-spacing: .14em; color: var(--gold); text-transform: uppercase; }
    h1 { font-family: Georgia, "Times New Roman", serif; font-size: 26px; font-weight: 700; line-height: 1.18; }
    .stmt { font-family: Georgia, serif; font-size: 21px; line-height: 1.35; }
    .hint { font-size: 13px; color: var(--muted); }
    .opts { display: flex; flex-direction: column; gap: 8px; }
    .opts.grid { display: grid; grid-template-columns: 1fr 1fr; }
    .opt { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 52px; padding: 10px 14px; border-radius: 12px;
      border: 1.5px solid var(--line); background: var(--card); color: var(--ink); font: 500 16px -apple-system, system-ui, sans-serif; text-align: left; cursor: pointer; }
    .opt:disabled { cursor: default; }
    .opt .badge { width: 28px; height: 28px; border-radius: 14px; background: var(--soft); color: var(--accent); font-weight: 700; font-size: 13px;
      display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .opt .mark { margin-left: auto; font-size: 12px; font-weight: 700; }
    .opt.ok { background: var(--okbg); border-color: var(--ok); } .opt.ok .mark { color: var(--ok); }
    .opt.bad { background: var(--badbg); border-color: var(--bad); } .opt.bad .mark { color: var(--bad); }
    .opt.img { flex-direction: column; align-items: stretch; padding: 6px; gap: 6px; position: relative; }
    .opt.img img { width: 100%; aspect-ratio: 2 / 1; object-fit: cover; border-radius: 8px; display: block; }
    .opt.img .badge { position: absolute; top: 10px; left: 10px; background: #fff; }
    .opt.img .mark { margin: 0; text-align: center; }
    .tpl { font-family: Georgia, serif; font-style: italic; font-size: 19px; line-height: 1.4; }
    .scene { position: relative; } .scene img { width: 100%; border-radius: 12px; display: block; }
    .scene span { position: absolute; transform: translate(-50%, -50%); width: 30px; height: 30px; border-radius: 15px; background: var(--accent);
      color: #fff; font-weight: 700; display: flex; align-items: center; justify-content: center; border: 2px solid #fff; }
    .verdict { font-family: Georgia, serif; font-size: 24px; font-weight: 700; }
    .expl { background: var(--card); border-radius: 12px; padding: 12px 14px; font-family: Georgia, serif; font-size: 15px; line-height: 1.5; }
    .expl small { display: block; margin-top: 6px; font-family: -apple-system, system-ui, sans-serif; font-size: 12px; color: var(--muted); }
    .promo { background: #8B1A1A; color: #fff; border-radius: 14px; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
    .promo h2 { font-family: Georgia, serif; font-size: 21px; line-height: 1.2; }
    .promo p { font-size: 13.5px; line-height: 1.5; color: #F3DCDC; }
    .cta-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .cta { display: flex; align-items: center; justify-content: center; min-height: 46px; border-radius: 10px; background: #fff; color: #1A1A18;
      font-weight: 700; font-size: 14px; text-decoration: none; }
    #quiz, #result { display: flex; flex-direction: column; gap: 12px; }
    [hidden] { display: none !important; }
  </style>
</head>
<body>
  <main class="card">
    <div class="brand">
      <img src="/og-cover.png" alt="">
      <div><b>La Misa Explicada</b><div class="eyebrow">Pregunta de la semana · ${esc(rangoSemana(q.week))}</div></div>
    </div>
    <h1>${esc(titulo)}</h1>
    <div id="quiz">
${q.type === "truefalse" ? `      <p class="stmt">${esc(q.question)}</p>\n` : ""}${q.type === "fill" && q.template ? `      <p class="tpl">${esc(q.template.replace("___", "______"))}</p>\n` : ""}      <p class="hint" id="hint">${enWeb ? "Toca tu respuesta. Tienes un solo intento." : "Esta se contesta en la app: hay que mover las piezas con el dedo."}</p>
      <div id="opts" class="opts"></div>
    </div>
    <p class="hint" id="soon" hidden>Esta pregunta se abre el lunes. Mientras, descarga la app para no perdértela.</p>
    <div id="result" hidden>
      <p class="verdict" id="verdict"></p>
      <div class="expl"><span id="expl"></span><small id="src"></small></div>
    </div>
    <section class="promo" id="promo" ${enWeb ? "hidden" : ""}>
      <h2 id="promoTitle">${enWeb ? "Cada lunes, una pregunta nueva sobre la Misa" : "Contéstala en la app"}</h2>
      <p>Con La Misa Explicada aprendes el porqué de cada parte de la Misa, las lecturas del día y la Liturgia de las Horas. Gratis.</p>
      ${STORE_LINKS}
    </section>
  </main>
  <script>
  (function () {
    var Q = ${JSON.stringify(data).replace(/</g, "\\u003c")};
    var $ = function (id) { return document.getElementById(id); };
    var parts = Q.week.split("-").map(Number);
    if (new Date() < new Date(parts[0], parts[1] - 1, parts[2])) {
      $("quiz").hidden = true; $("soon").hidden = false; $("promo").hidden = false;
      $("promoTitle").textContent = "Cada lunes, una pregunta nueva sobre la Misa"; return;
    }
    var KEY = "lme_pregunta_" + Q.id;
    var opts = $("opts");
    var labels, correct;
    if (Q.type === "truefalse") { labels = ["Verdadero", "Falso"]; correct = Q.answer === true ? 0 : 1; }
    else if (Q.type === "fill") { labels = Q.options; correct = Q.options.indexOf(Q.answer); }
    else { labels = Q.options; correct = typeof Q.answer === "number" ? Q.answer : -1; }
    var buttons = [];
    function reveal(picked) {
      buttons.forEach(function (b, i) {
        b.disabled = true;
        var mark = b.querySelector(".mark");
        if (i === correct) { b.classList.add("ok"); mark.textContent = "Correcta"; if (Q.type === "image") b.querySelector(".lbl").hidden = false; }
        else if (i === picked) { b.classList.add("bad"); mark.textContent = "Tu respuesta"; }
      });
      $("hint").hidden = true;
      var ok = picked === correct;
      $("verdict").textContent = ok ? "¡Correcto!" : "Casi… era «" + labels[correct] + "».";
      $("verdict").style.color = ok ? "var(--ok)" : "var(--accent)";
      $("expl").textContent = Q.explanation;
      $("src").textContent = Q.source ? "— " + Q.source : "";
      $("result").hidden = false; $("promo").hidden = false;
    }
    if (Q.type === "order") {
      Q.options.forEach(function (t) {
        var d = document.createElement("div"); d.className = "opt"; d.textContent = t; opts.appendChild(d);
      });
      return;
    }
    if (Q.type === "place") {
      if (Q.scene) {
        var sc = document.createElement("div"); sc.className = "scene";
        var im = document.createElement("img"); im.src = Q.scene; im.alt = ""; sc.appendChild(im);
        Q.slots.forEach(function (s) { var m = document.createElement("span"); m.textContent = "?"; m.style.left = s.x + "%"; m.style.top = s.y + "%"; sc.appendChild(m); });
        opts.appendChild(sc);
      }
      var l = document.createElement("p"); l.className = "hint"; l.textContent = Q.slots.map(function (s) { return s.label; }).join(" · "); opts.appendChild(l);
      return;
    }
    if (Q.type === "image") opts.className = "opts grid";
    labels.forEach(function (t, i) {
      var b = document.createElement("button"); b.type = "button";
      b.className = Q.type === "image" ? "opt img" : "opt";
      var badge = document.createElement("span"); badge.className = "badge"; badge.textContent = "ABCDEF"[i] || String(i + 1);
      b.appendChild(badge);
      if (Q.type === "image") {
        var img = document.createElement("img"); img.src = Q.images[i] || ""; img.alt = "Opción " + "ABCDEF"[i]; b.appendChild(img);
      }
      var lbl = document.createElement("span"); lbl.className = "lbl"; lbl.textContent = t;
      if (Q.type === "image") lbl.hidden = true;
      b.appendChild(lbl);
      var mark = document.createElement("span"); mark.className = "mark"; b.appendChild(mark);
      b.addEventListener("click", function () {
        try { localStorage.setItem(KEY, String(i)); } catch (e) {}
        reveal(i);
      });
      buttons.push(b); opts.appendChild(b);
    });
    var saved = null;
    try { saved = localStorage.getItem(KEY); } catch (e) {}
    if (saved !== null && buttons[Number(saved)]) reveal(Number(saved));
  })();
  </script>
</body>
</html>
`;
};
for (const q of preguntas) {
  const dir = join(root, "pregunta", q.id);
  mkdirSync(dir, { recursive: true });
  const imgs = {
    options: q.type === "image" ? (q.images ?? []).map((f, i) => imagenPregunta(f, dir, `op${i}.jpg`)) : [],
    scene: q.type === "place" ? imagenPregunta(q.scene, dir, "escena.jpg") : null,
  };
  writeFileSync(join(dir, "index.html"), preguntaPage(q, imgs));
}
// /pregunta/: brinca a la de esta semana (o a la más reciente ya abierta).
const semanas = preguntas.map((q) => ({ id: q.id, week: q.week })).sort((a, b) => a.week.localeCompare(b.week));
mkdirSync(join(root, "pregunta"), { recursive: true });
writeFileSync(join(root, "pregunta", "index.html"), `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Pregunta de la semana — La Misa Explicada</title>
  <meta property="og:site_name" content="La Misa Explicada">
  <meta property="og:title" content="Pregunta de la semana: ¿te animas?">
  <meta property="og:description" content="Cada lunes, una pregunta nueva sobre la Misa.">
  <meta property="og:image" content="https://app.lamisaexplicada.com/og-cover.png">
  <style>body{margin:0;font-family:-apple-system,system-ui,sans-serif;background:#F7F2E7;color:#1A1A18;padding:40px 16px;text-align:center}a{color:#8B1A1A}</style>
</head>
<body>
  <p>Abriendo la pregunta de esta semana…</p>
  <noscript><p><a href="https://apps.apple.com/app/id6785691522">Descarga La Misa Explicada</a></p></noscript>
  <script>
  (function () {
    var S = ${JSON.stringify(semanas)};
    var now = new Date(), pick = null;
    S.forEach(function (s) { var p = s.week.split("-").map(Number); if (new Date(p[0], p[1] - 1, p[2]) <= now) pick = s; });
    location.replace(pick ? "/pregunta/" + pick.id + "/" : "/");
  })();
  </script>
</body>
</html>
`);
console.log(`Generadas ${preguntas.length} páginas /pregunta desde ${bundlePath}`);
