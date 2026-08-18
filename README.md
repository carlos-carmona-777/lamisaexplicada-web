# lamisaexplicada-web — app.lamisaexplicada.com

Sitio mínimo servido por **GitHub Pages** en el subdominio dedicado
`app.lamisaexplicada.com`, cuyo único trabajo es hacer funcionar los
**universal links** (iOS) y **App Links** (Android) de La Misa Explicada.
El sitio real sigue en Google Sites (`www.lamisaexplicada.com`), que no
puede servir estos archivos — por eso existe este subdominio.

## Contrato de URLs

Espejo 1:1 del esquema interno `misa://`, sin prefijo (subdominio dedicado):

- `https://app.lamisaexplicada.com/art/{id}[?t=Título&occ=N]`
- `https://app.lamisaexplicada.com/grupo/{id}[?t=&occ=]`
- `https://app.lamisaexplicada.com/sm/{id}`

Con la app instalada, iOS/Android abren el link directo en la app (sin tocar
este servidor). Sin la app, GitHub Pages sirve la página estática generada
`/{art|grupo|sm}/{id}/index.html` (con metadatos Open Graph del destino: los
crawlers de WhatsApp/iMessage/Telegram muestran el TÍTULO del artículo en la
vista previa), y `404.html` (landing genérica con OG de marca) para ids sin
página; `index.html` (misma landing) en la raíz.

## Páginas OG por destino (`gen-og.mjs`)

Las carpetas `art/`, `grupo/` y `sm/` son GENERADAS — no editarlas a mano.
Tras cambiar contenido en la app (títulos/subtítulos/artículos nuevos):

```bash
node gen-og.mjs   # lee ../LaMisaExplicada/.../Resources/content_bundle.json
git add -A art grupo sm && git commit && git push
```

Filtra `pruebas: true` y SMs `oculta: true` con el mismo criterio que las
apps. Cada página lleva ADEMÁS su `og.jpg` propio: la imagen de cabecera
del artículo/grupo/SM redimensionada a <=1200px con `sips` (por eso el
script requiere macOS), leída de `Resources/Images/` junto al bundle.
`og-cover.png` (ícono de la app a 600px) queda solo como fallback para
destinos sin imagen o cuya imagen no esté en el repo de la app, y para
`index.html`/`404.html`.

OJO con el caché de WhatsApp: la vista previa de una URL ya compartida
puede tardar días en refrescarse tras cambiar su `og:*`.

## Archivos

| Archivo | Para qué |
|---|---|
| `CNAME` | Dominio custom de GitHub Pages (`app.lamisaexplicada.com`) |
| `.nojekyll` | Sin esto, Jekyll NO publica `.well-known/` (carpeta con punto) |
| `.well-known/apple-app-site-association` | iOS: Team `5L8Y7BS832`, bundle `com.lamisaexplicada.app`, paths art/grupo/sm |
| `.well-known/assetlinks.json` | Android (PENDIENTE: applicationId + SHA-256 del keystore de release — encargo #24 del chat Android) |
| `index.html` / `404.html` | Landing para quien no tiene la app (404 = fallback de paths profundos) |

## DNS (una sola vez, en el registrador del dominio)

Registro **CNAME**: host `app` → `<usuario-github>.github.io`
(el `www` y el apex NO se tocan).

En el repo de GitHub: Settings → Pages → custom domain
`app.lamisaexplicada.com` + "Enforce HTTPS" (el certificado tarda unos
minutos tras propagar el DNS).

## Verificación una vez vivo

```bash
curl -sI https://app.lamisaexplicada.com/.well-known/apple-app-site-association
```

Debe responder 200 (sin redirect). Vista de Apple CDN:
`https://app-site-association.cdn-apple.com/a/v1/app.lamisaexplicada.com`.
Apple cachea el AASA al instalar la app — tras publicarlo o cambiarlo,
reinstalar la app en el dispositivo de prueba.
