# Limitaciones conocidas — cafe_racer_93_3d

- **Primer load ~17 MB**: `assets/bike.glb` es pesado (20k tris + texturas PBR). Tarda unos segundos la primera vez. Mejora futura: comprimir con Draco/meshopt (bajaría a ~3-4 MB) — requiere vendorizar el decoder.
- **Moto generada por IA**: la malla viene de `image_to_3d` (Higgsfield). La orientación/escala se normaliza en runtime (`frameBike()`); si en alguna build se ve invertida, es un solo ajuste de yaw. Las partes finas (rayos de rueda) pueden tener topología imperfecta.
- **Sin post-procesado (bloom)**: el glow se logra con materiales emisivos + HTML, no con un pase de bloom (evita vendorizar EffectComposer/UnrealBloomPass). Se ve bien, pero no es bloom "real".
- **Tráfico procedural simple**: los autos-obstáculo son cajas de neón con bordes (no modelos 3D variados). Mejora futura: variedad de vehículos 3D.
- **Necesita WebGL2**: en navegadores sin WebGL2 el canvas queda en negro. (Nota: algunos navegadores headless no tienen WebGL — verificar visual en un navegador real, no por screenshot headless.)
- **Selección de vehículo / ajustes**: el brief original mencionaba selección de vehículo y panel de ajustes (volumen/calidad). Esta build tiene una sola moto y mute; esos menús quedan como mejora.
- **`logic.js`** es un stub de deploy (Higgsfield), no implementa reglas server-side; el juego es solo-jugador y toda la lógica está en el cliente.
