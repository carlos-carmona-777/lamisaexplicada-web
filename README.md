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
este servidor). Sin la app, GitHub Pages sirve `404.html` (= la landing
"este contenido vive en la app") para cualquier path profundo, e
`index.html` (misma landing) en la raíz.

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
