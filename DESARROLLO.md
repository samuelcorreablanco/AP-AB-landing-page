# Guía de desarrollo — Ap-Ab Landing Page

Documento de traspaso para el agente coder. Describe la arquitectura actual, cómo
está desplegado el proyecto y las reglas para seguir construyendo sin romper nada.

---

## 1. Qué es este proyecto

Landing page estática (HTML/CSS/JS puro, sin framework) de la agencia **Ap-Ab**,
con un **cotizador** que usa IA (DeepSeek) para generar un prototipo visual e
interactivo a partir de la idea que escribe el usuario.

Está desplegada en **Vercel**, conectada al repo de GitHub
`samuelcorreablanco/AP-AB-landing-page` (rama `main`). **Cada `git push` a `main`
dispara un redeploy automático.**

URL producción: `https://ap-ab-landing-page.vercel.app`

---

## 2. Estructura de archivos

### Frontend (sitio estático — raíz)
- `index.html` — home / estructura principal con navegación por pestañas.
- `servicios.html`, `proceso.html`, `proyectos.html`, `cotizador.html` — páginas.
- `styles.css`, `cotizador.css`, `proceso.css`, `servicios.css` — estilos.
  Colores y tema en variables CSS (`--orange`, `--ink`, etc.) al inicio de `styles.css`.
- `app.js` — navegación por pestañas + envío del formulario de la landing.
- `cotizador.js` — lógica del cotizador (llama al backend de IA). **Ver sección 4.**
- `projects.js` — render de la galería de proyectos.
- `config.js` — claves de Supabase (frontend). **Hoy tiene valores de ejemplo.**

### Backend (funciones serverless de Vercel — carpeta `api/`)
- `api/generar_plan.py` — **Backend del cotizador.** Función serverless en Python.
  Recibe `{ user_prompt }`, busca inspiración en DuckDuckGo, llama a la IA y devuelve
  `{ status, plan }`. Es un PORT del servidor FastAPI de `APPO_Planner_Standalone/`
  al formato nativo de Vercel (`BaseHTTPRequestHandler`).
- `api/send-lead.js` — Función serverless en Node. Envía un correo de aviso vía
  Resend cuando un usuario termina la cotización. (Opcional, requiere envs.)

### Configuración de despliegue
- `vercel.json` — config Vercel (`cleanUrls`, `trailingSlash`).
- `requirements.txt` (raíz) — dependencias Python que Vercel instala para `api/*.py`.
  Actualmente: `openai>=1.55,<2`. **NO bajar a 1.6.x** (rompe en runtime de Vercel
  por incompatibilidad de httpx/proxies — fue un bug real que ya se corrigió).
- `.gitignore` — excluye `venv/`, `__pycache__/`, `.env`. **No quitar estas reglas.**

### Proyecto local aparte (NO se despliega)
- `APPO_Planner_Standalone/` — servidor FastAPI original para correr el planner en
  la PC con `run_planner.bat` (puerto 8080). Sirve para desarrollo/pruebas locales.
  Su `venv/` y `.env` están ignorados por git. **`api/generar_plan.py` es la versión
  de producción de esta misma lógica — si cambias una, considera reflejarlo en la otra.**

---

## 3. Variables de entorno (configuradas en Vercel → Settings → Environment Variables)

| Variable | Uso | Estado |
|---|---|---|
| `DEEPSEEK_API_KEY` | API de DeepSeek (la IA del cotizador) | ✅ con saldo, EN USO |
| `PLANNER_MODEL` | Modelo a usar. Valor actual: `deepseek-v4-pro` | ✅ EN USO |
| `RESEND_API_KEY` | API de Resend (correo de aviso) | configurada |
| `NOTIFY_EMAIL` | Correo destino de los avisos | configurada |
| `FROM_EMAIL` | Remitente de los correos | configurada |
| `OPENAI_API_KEY`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY` | Modelos alternativos | sin saldo / no usados |

> La única IA con saldo y en uso es **DeepSeek**. El registro de modelos vive en
> `api/generar_plan.py` (`MODEL_REGISTRY`) y en `APPO_Planner_Standalone/utils.py`.

---

## 4. Cómo el frontend habla con el backend del cotizador

En `cotizador.js` el endpoint se elige según el entorno:
```js
const IS_LOCAL = ["localhost", "127.0.0.1", ""].includes(location.hostname);
const APPO_ENDPOINT = IS_LOCAL
  ? "http://127.0.0.1:8080/generar_plan"   // PC con run_planner.bat (FastAPI)
  : "/api/generar_plan";                    // Vercel (función serverless)
```
- **Local:** corre `run_planner.bat` y abre el HTML → usa el FastAPI del puerto 8080.
- **Producción:** usa la función de Vercel automáticamente. Sin tocar código.

Contrato de la API (mismo en ambos entornos):
- Request: `POST` con JSON `{ "user_prompt": "texto del usuario" }`
- Response OK: `{ "status": "success", "plan": { nombre_proyecto, descripcion, html, fuentes } }`
- Response error: HTTP 500 con `{ "error": "...", "trace": "..." }`

---

## 5. Limitaciones / riesgos conocidos

1. **Timeout de Vercel:** las funciones tienen tope de duración (plan Hobby). El backend
   hace búsqueda web + llamada a IA; si una idea tarda demasiado, puede cortarse. Si esto
   se vuelve frecuente, considerar reducir `max_tokens` o mover el backend a Render/Railway.
2. **Nombre del modelo:** el código envía `deepseek-v4-pro` como id de modelo a la API de
   DeepSeek. Si DeepSeek cambia/retira ese nombre, hay que actualizarlo en `MODEL_REGISTRY`.
3. **Supabase sin configurar:** `config.js` tiene placeholders. El formulario funciona
   (abre WhatsApp) pero NO guarda en base de datos hasta poner las claves reales y crear
   la tabla con `supabase_schema.sql`.
4. **CORS:** `api/generar_plan.py` permite `*`. En producción se podría restringir al dominio.

---

## 6. Flujo de trabajo de despliegue (IMPORTANTE)

Este repo se despliega SOLO por git push. Para publicar cualquier cambio:
```bash
git add .
git commit -m "describe el cambio"
git push
```
Vercel detecta el push y redespliega `main` en 1-2 min. No subir archivos a mano por la web.

**Antes de pushear, verificar:**
- No romper el contrato de la API (sección 4).
- No subir secretos (las envs van en Vercel, nunca en el código).
- No reintroducir `openai==1.6.1` ni quitar reglas del `.gitignore`.
- Si tocas la lógica del planner, reflejar el cambio entre `api/generar_plan.py` y
  `APPO_Planner_Standalone/` (main.py / utils.py) para que local y producción coincidan.
