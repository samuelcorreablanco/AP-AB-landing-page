# Handoff summary — cafe_racer_93_3d → ABBI

## Qué recibís
Un juego web **3D (three.js/WebGL)** ya funcional y desplegado: *Cafe Racer 93*, highway racer synthwave. Carpeta **estática**, lista para ingerir, correr (preview) e iterar.

## Cómo lo detecta/corre ABBI
- **Stack**: Web (HTML/CSS/JS) · three.js. **Sin Python, sin Node, sin backend.**
- **Kind esperado**: `static` (hay `index.html` en la raíz). ABBI debe **servir esta carpeta** y abrir el preview. El juego necesita **WebGL2**.
- No hay build step ni instalación: se sirve tal cual.

## Mapa rápido
- Código propio: `index.html`, `game.js`, `strings.js`.
- Assets: `assets/bike.glb`, `assets/music.m4a`, `assets/crash.mp3`.
- Third-party (NO tocar): `vendor/` (three.js r160) y `logic.js` (stub de deploy Higgsfield).

## Verificado (build actual)
Inicio → conducir → cambiar de carril (con lean) → score/dist/velocidad → colisión → "CHOCASTE" → récord persistido (localStorage) → reintentar. Sin errores de consola. Live: https://tender-beam-198.higgsfield.gg/

## Pedido de mejora pendiente del dueño (siguiente ronda sugerida)
> "implementar físicas en el cual se actualiza el fotograma en base a la posición del obstáculo o el avatar, por lo menos seis fotogramas por avatar/obstáculo."

Interpretación: subir la **fidelidad de la simulación/animación** — sub-stepping de la física y/o interpolación a ≥6 sub-frames por entidad (moto/obstáculos) para colisiones y movimiento más suaves y precisos a alta velocidad. Punto de entrada: el `update(dt)` de `game.js` (ya es timestep fijo; ampliar el sub-stepping y la interpolación de render).

## Para mejorar, leé primero
`docs_for_abbi/architecture_context.md` (cómo está armado) y `docs_for_abbi/known_limitations.md`.
