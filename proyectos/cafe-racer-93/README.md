# Cafe Racer 93 — Synthwave Highway (3D)

Juego web **3D** (three.js / WebGL) tipo *highway racer* con estética **synthwave**. Moto 3D generada con Higgsfield. Sin backend: es un sitio **estático**.

## Jugar
- **Online**: https://tender-beam-198.higgsfield.gg/
- **Local**: servir esta carpeta (los ES modules no cargan por `file://`):
  ```bash
  python3 -m http.server 8791
  # abrir http://localhost:8791   (requiere WebGL2)
  ```

## Controles
←/→ o A/D esquivar · ↑/↓ acelerar/frenar · Espacio reiniciar · tap izq/der en móvil · gamepad.

## Estructura
- `index.html`, `game.js`, `strings.js` — el juego (código propio).
- `assets/` — moto 3D (`bike.glb`), música y SFX.
- `vendor/` — three.js r160 (third-party, vendorizado).
- `logic.js` — stub de la plataforma de deploy de Higgsfield.
- `docs_for_abbi/` — contexto para ABBI (manifest + docs).

## Para ABBI
Es un proyecto **estático** con `index.html` en la raíz: ABBI lo detecta como `static`, lo sirve y lo previsualiza. El contexto para el arquitecto está en `docs_for_abbi/`. Ver `docs_for_abbi/handoff_summary.md`.
