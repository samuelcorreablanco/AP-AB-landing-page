# Requisitos funcionales — cafe_racer_93_3d

## Núcleo de juego
- **Conducción 3D**: moto del jugador en una autopista nocturna; cámara de persecución detrás.
- **Carriles**: 5 carriles; el jugador cambia de carril (lerp suave + inclinación/lean de la moto).
- **Tráfico**: autos-obstáculo de neón que se acercan; spawn por oleadas, dificultad creciente, **nunca bloquean todos los carriles** (siempre hay un hueco alcanzable).
- **Colisiones**: AABB (caja contra caja). Chocar = game over.
- **Casi-choque**: pasar al lado de un auto sin chocar **sube el multiplicador** y suma bonus.
- **Score**: por distancia recorrida × multiplicador + bonus de casi-choques.
- **Velocidad**: arranca ~46 u/s y sube con el tiempo hasta ~132; acelerar/frenar modulan.
- **Modo infinito** por distancia, reinicio rápido, **récord persistido en localStorage** (`cr93_best`).

## Interfaz
- Pantalla de **inicio** (logo + moto en turntable + controles), **carga**, **pausa** (al perder foco), **game over** (puntos, "¡NUEVO RÉCORD!", récord, reintentar).
- **HUD** en partida: PUNTOS, multiplicador, RÉCORD, DIST, VEL.
- Todos los textos en `strings.js` (cambiar idioma = cambiar datos).

## Controles (todas las plataformas desde el día 1)
- **Teclado**: ←/→ o A/D (carril), ↑/↓ o W/S (acelerar/frenar), Espacio/Enter (confirmar), P/Esc (pausa). Bindings por `event.code` (físico, no por letra).
- **Táctil**: mitad izq/der de la pantalla = carril; tap = confirmar en menús.
- **Gamepad**: D-pad/stick para carril, botón 0 confirmar, botón 9 pausa.

## Audio
- Música synthwave en loop (`assets/music.m4a`), SFX de choque (`assets/crash.mp3`), beeps de UI/near-miss (WebAudio procedural). Botón de mute. Arranca tras el primer gesto del usuario (autoplay policy).

## No-funcionales
- Timestep fijo (1/60) + RNG sembrado → **determinista**. DPR capeado. Pausa en blur. Responsive (resize/orientation). Necesita **WebGL2**.
