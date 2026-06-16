# Reporte del Coder → Uploader

**Fecha:** 2026-06-16
**Tareas:** (1) Integrar el juego **Cafe Racer 93** (3D, WebGL) a "Nuestros proyectos", jugable en el navegador sin descargar nada y 100% autónomo. (2) **Arreglar el menú móvil** (botón de 3 rayas no desplegaba los botones en vertical).

---

## TAREA 2 — Menú móvil (hamburguesa) arreglado

**Problema reportado:** en móvil vertical los botones de la nav (arriba a la derecha) se colapsan y el ícono de 3 rayas no desplegaba nada. En horizontal/desktop sí funcionaban.

**Qué se hizo:**
- **`index.html`**: el botón ahora usa un ícono de 3 barras dibujadas (no el carácter `≡`, que no renderiza bien) + `aria-expanded`/`aria-controls`.
- **`styles.css`**: ícono hamburguesa con área de toque de 46px que se anima a "X" al abrir; menú desplegable a todo el ancho, fondo oscuro, botones grandes (15px padding), bien por encima de todo (z-index 25).
- **`app.js`**: toggle robusto — abre/cierra al tocar la hamburguesa, cierra al elegir una opción, al tocar fuera o con Esc; sincroniza aria e ícono.

**Verificado** (capturas headless a 390px): el tap abre el menú (`open=true, display=flex`), muestra las 5 opciones (Inicio, Servicios, Nosotros ▾ → Nuestros proyectos, Cotización) con tap targets grandes, y cierra al segundo tap. ✔

**Revisar:** abrir el sitio en un teléfono (o DevTools modo móvil ~390px), tocar las 3 rayas → debe desplegar el menú y cada opción debe navegar igual que en desktop.

---

## TAREA 1 — Juego Cafe Racer 93

---

## Qué se cambió

### 1. Juego nuevo agregado: `proyectos/cafe-racer-93/`
- Es un juego web **estático** (Three.js / WebGL r160). No tiene backend.
- Se renombró la carpeta original `CAFE RRACER 93` → `cafe-racer-93` (sin espacios, URL limpia).
- Vercel lo sirve como archivos estáticos. **El `server.py` / `INICIAR-*.bat` de adentro NO se ejecutan en Vercel** — son solo para correr local; quedan ahí sin uso, no molestan.

### 2. Se hizo 100% independiente del CDN externo
- Archivo: `proyectos/cafe-racer-93/index.html` (bloque `<script type="importmap">`).
- **Antes:** `three.js` se bajaba de `https://unpkg.com/three@0.160.0/...` (dependía de internet externo).
- **Ahora:** apunta a la copia LOCAL `./vendor/three.module.js` (1.25 MB, build válido r160) y `./vendor/` para los addons.
- **Por qué:** si unpkg está caído o el usuario tiene mala conexión, el juego igual carga rápido.
- **Verificado:** probado con `unpkg.com` bloqueado (offline) → el juego carga completo igual. ✔

### 3. Galería mejorada en `proyectos.html` + `proceso.css`
- Antes cada proyecto era un iframe chiquito (malo para un juego con teclado).
- Ahora: **tarjeta con portada** (imagen real de la moto) + botón **JUGAR** → abre el juego **a pantalla completa** en un overlay (con foco de teclado, audio, gamepad, fullscreen, pointer-lock) y botón **✕ CERRAR** (también tecla Esc).
- El juego se registró en `projects.js` (entrada `Cafe Racer 93`, con `url`, `poster` y `desc`).
- Se le puso `id="galeria"` a la sección (deep-link `proyectos.html#galeria`).

### Archivos tocados
- `proyectos/cafe-racer-93/` (carpeta nueva del juego + importmap local)
- `projects.js` (registro del juego)
- `proyectos.html` (galería con portada + overlay de juego)
- `proceso.css` (estilos de tarjeta, portada y overlay)

---

## Qué revisar (checklist para el uploader)

1. **Abrir `proyectos.html` y darle a JUGAR** → el juego debe abrir a pantalla completa y ser jugable (←/→ esquivar, ↑/↓ acelerar, Espacio reiniciar). Probar CERRAR / Esc.
2. **Confirmar que los assets pesados se suben** (`.glb`, `.m4a`, `.mp3`, `.png` dentro de `proyectos/cafe-racer-93/assets/`).
   El `.gitignore` actual NO los excluye ✔, pero verificar que `git add .` los incluya (son ~varios MB).
3. **Probar el juego ya desplegado** en `ap-ab-landing-page.vercel.app/proyectos/cafe-racer-93/index.html`.

---

## Cómo desplegar (Git + Vercel)

PowerShell, en la raíz del proyecto (`Landing page AP-AB`):

```powershell
$env:Path = "C:\Program Files\Git\cmd;" + $env:Path
git add .
git commit -m "Integrar juego Cafe Racer 93 (3D) a Nuestros proyectos, 100% local"
git push
```

- Push a `main` → Vercel redespliega solo (~1-2 min).
- La salida roja de git es stderr normal, NO error. Confirmar con la línea `main -> main`.
- No se tocó nada del backend (`api/`), Supabase ni variables de entorno: **no requiere cambios de config en Vercel**.

---

## Notas
- Verificado todo con capturas (pantalla de inicio del juego, carga offline sin CDN, tarjeta de la galería). Todo OK.
- Para agregar más juegos después: copiar su carpeta a `proyectos/` y registrar una entrada nueva en `projects.js` (`{ nombre, tag, url, poster, desc }`).
