# Arquitectura — cafe_racer_93_3d

## Tipo
SPA web **100% cliente**, **sin backend**. Render 3D con **three.js (WebGL2)** sobre un `<canvas>`. Se sirve como **sitio estático** (no hay servidor de aplicación).

## Cómo correr (ABBI / local)
Es estático con `index.html` en la **raíz** → ABBI debe detectar `static` y servir esta carpeta.
```
python3 -m http.server 8791   # servir ESTA carpeta
# abrir http://localhost:8791   (los ES modules NO cargan por file://)
```

## Archivos PROPIOS (lo que se revisa/mejora)
- **`index.html`** — página del juego: `importmap` que mapea `three` → `./vendor/three.module.js`; HUD synthwave en DOM; pantallas inicio/carga/pausa/game-over; estilos CSS (variables de color neón).
- **`game.js`** — el motor (≈740 líneas). Secciones: CONFIG/umbrales · RNG sembrado · DOM refs · renderer/escena/cámara · cielo + env map (PMREM) · luces · sol de neón (ShaderMaterial) · montañas · estrellas · **piso grid (ShaderMaterial scrolleable)** · pilones/dashes · **moto (GLTFLoader + fallback procedural)** · tráfico (pool de autos) · audio · input (teclado/touch/gamepad → comandos) · estado del juego (menu/playing/paused/over) · spawn · **update(dt)** (simulación) · **render()** · loop de timestep fijo.
- **`strings.js`** — textos visibles.

## Assets
- `assets/bike.glb` — moto 3D (Higgsfield `image_to_3d`, ~17MB, normalizada/orientada en runtime con `frameBike()`).
- `assets/music.m4a`, `assets/crash.mp3` — audio.

## THIRD-PARTY (NO auditar/reescribir)
- `vendor/three.module.js` (three.js **r160**), `vendor/GLTFLoader.js`, `vendor/BufferGeometryUtils.js`. Vendorizados (no CDN). `GLTFLoader` importa `./BufferGeometryUtils.js` (por eso los 3 archivos).
- `logic.js` — stub de la plataforma de deploy de Higgsfield (juego solo-jugador). No afecta la lógica.

## Decisiones clave
- **Timestep fijo + RNG sembrado** (determinismo). El *shake* de cámara usa `Math.random()` aparte para no contaminar el RNG de la simulación.
- **Grid y sol por shader** (1 draw call cada uno) en vez de geometría pesada → barato y con el look correcto.
- **Env map vía PMREM** desde un gradiente → la moto cromada refleja el cielo neón.
- **Fallback procedural** de la moto si el GLB no carga (el juego nunca queda sin jugador).
- Rutas **relativas** (`./vendor`, `./assets`) → funciona servido bajo cualquier subpath.
