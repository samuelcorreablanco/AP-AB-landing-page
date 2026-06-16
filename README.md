# Ap-Ab — Landing page

Sitio de una sola pantalla (sin scroll), con navegación por pestañas. Estilo brutalist
naranja inspirado en tus referencias. Estático (HTML/CSS/JS) + Supabase para guardar
las cotizaciones. Listo para desplegar en Vercel.

## Archivos
- `index.html` — estructura y contenido
- `styles.css` — estilos
- `app.js` — pestañas + envío del formulario
- `config.js` — **aquí pones tus claves de Supabase**
- `supabase_schema.sql` — crea la tabla `quotes`
- `vercel.json` — config de despliegue

## 1) Configurar Supabase
1. Crea un proyecto en https://supabase.com
2. Ve a **SQL Editor → New query**, pega el contenido de `supabase_schema.sql` y ejecútalo.
3. Ve a **Project Settings → API** y copia:
   - **Project URL**
   - **anon public key**
4. Pégalos en `config.js`:
   ```js
   window.SUPABASE_URL = "https://xxxx.supabase.co";
   window.SUPABASE_ANON_KEY = "eyJ...";
   ```
> Si dejas `config.js` sin tocar, el formulario funciona igual pero solo abre WhatsApp
> (no guarda en base de datos).

Las cotizaciones recibidas se ven en **Table Editor → quotes**. La anon key solo puede
INSERTAR, no leer, así nadie puede robar tus contactos desde el navegador.

## 2) Desplegar en Vercel
**Opción A — desde la web (recomendada):**
1. Sube esta carpeta a un repo de GitHub.
2. En https://vercel.com → **Add New → Project** → importa el repo.
3. Framework Preset: **Other**. Sin build command. Deploy.

**Opción B — desde la terminal:**
```bash
npm i -g vercel
vercel        # primer deploy (preview)
vercel --prod # producción
```

## 3) Probar localmente
Abre `index.html` directo en el navegador, o sirve la carpeta:
```bash
npx serve .
```

## Correo de aviso al terminar la cotización
Cuando el usuario deja su correo y pulsa "Empecemos", la página llama a la función
serverless `api/send-lead.js`, que te envía un correo con el resumen del proyecto,
el correo del solicitante y el precio entregado.

Para activarlo (en Vercel → Project → Settings → Environment Variables):
1. Crea una cuenta en https://resend.com y genera una **API key**.
2. Agrega estas variables de entorno:
   - `RESEND_API_KEY` = tu API key de Resend
   - `NOTIFY_EMAIL` = el correo donde quieres recibir los avisos (ej. barrerojeronimo@gmail.com)
   - `FROM_EMAIL` = remitente. Para pruebas: `onboarding@resend.dev` (en producción, un dominio verificado en Resend)
3. Redeploy.

> Nota 1: esto **solo funciona desplegado en Vercel** (o con `vercel dev`), no abriendo el HTML directo.
> Nota 2: el "precio" enviado es por ahora "Por definir", porque aún no se estipuló. Cuando lo definas,
> el correo lo incluirá automáticamente.

## Personalizar
- Teléfono de WhatsApp: busca `573185990793` en `index.html` y `app.js`.
- Email: `abbiappo8@gmail.com` en `index.html`.
- Colores: variables `--orange` / `--ink` al inicio de `styles.css`.
- Textos: directamente en `index.html`.
