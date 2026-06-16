# AI working notes — cafe_racer_93_3d

Notas técnicas del build (Claude Code + Higgsfield), útiles si ABBI itera.

## Pipeline de assets (Higgsfield)
- Moto: `generate_image` (nano_banana, vista 3/4, fondo blanco) → `generate_3d` modelo `image_to_3d` (`should_texture + enable_pbr + symmetry_mode:on`, sin rigging) → `assets/bike.glb` (~17MB).
- Audio: `sonilo_music` (loop synthwave) → `music.m4a`; `mirelo_text_to_audio` (choque) → `crash.mp3`.
- Thumbnail/favicon de la card se generaron aparte (no viajan en la app).

## Gotchas a NO regresionar
- **`GLTFLoader.js` (examples/jsm) importa `BufferGeometryUtils.js`**: hay que vendorizar TAMBIÉN ese archivo y reapuntar el import a `./BufferGeometryUtils.js`. Si falta, el módulo `game.js` falla en silencio y la página muestra el HTML por defecto (¡el "start screen visible" NO prueba que el juego corrió! verificar el `console.log` propio + que el `.glb` se haya fetcheado).
- **Determinismo**: el `update(dt)` usa el RNG sembrado (mulberry32). El *shake* de cámara en `render()` usa `Math.random()` aparte a propósito, para no consumir el RNG de la simulación entre frames.
- **Materiales metálicos**: la moto cromada necesita `scene.environment` (env map). Se genera con `PMREMGenerator.fromEquirectangular` de un gradiente; sin eso el cromo se ve negro.
- **Rutas relativas** siempre (`./vendor`, `./assets`) → la app anda servida bajo cualquier subpath/subdominio.
- **Verificación visual**: navegadores headless suelen NO tener WebGL → el canvas sale en blanco aunque ande. Verificar en navegador real o por probes DOM/consola, no concluir "roto" por un screenshot en blanco.

## Deploy (Higgsfield games)
- Empaquetado: zip con `index.html` + `logic.js` (stub solo-jugador) + `assets/` + `vendor/` en la **raíz** del zip.
- `deploy_game` → URL `https://<slug>.higgsfield.gg/` + `game_id` (guardarlo para UPDATE in-place). El engine sirve una página contenedora que mete el juego en un `<iframe>`; tu `index.html` real queda en `/index.html`.
- Live actual: https://tender-beam-198.higgsfield.gg/ · game_id `2bda5a8c-9b43-42c2-87e7-e48de1bfe19f`.

## Parámetros del juego (en `game.js`, objeto CFG)
laneCount 5 · laneGap 3.2 · speedStart 46 → speedMax 132 (ramp 0.55/s) · spawn 1.15s → 0.42s · colisión hitHalfX 1.55 / hitHalfZ 2.1 · near-miss 2.7 · score 0.9/m × multiplicador. Todo tuneable como datos.
