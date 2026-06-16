// ============================================================================
// CAFE RACER 93 — synthwave highway racer (Three.js, WebGL)
// Loop de timestep fijo + RNG sembrado (determinista). Toda la lógica es cliente.
// ============================================================================
import * as THREE from "three";
import { GLTFLoader } from "./vendor/GLTFLoader.js";
import { STR } from "./strings.js";

// Boot real verificable: si esto aparece en consola, el módulo arrancó OK.
console.log("ABBI game boot OK — Cafe Racer 93");

// ----------------------------- CONFIG / UMBRALES ----------------------------
const CFG = {
  laneCount: 5,
  laneGap: 3.2,           // separación entre carriles (unidades de mundo)
  roadHalf: 8.4,          // semiancho jugable
  bikeLen: 4.0,           // largo objetivo de la moto tras normalizar
  camBack: 8.5,           // cámara detrás de la moto
  camHeight: 3.6,
  camLook: 9.0,           // hacia dónde mira (adelante)
  speedStart: 46,         // u/s al arrancar
  speedMax: 132,          // tope
  speedRamp: 0.55,        // u/s ganadas por segundo de juego
  boost: 1.35,            // multiplicador de acelerar
  brake: 0.55,            // multiplicador de frenar
  laneLerp: 9.0,          // qué tan rápido cambia de carril
  spawnStart: 1.15,       // s entre tandas al inicio
  spawnMin: 0.42,         // s entre tandas a dificultad máxima
  hitHalfX: 1.55,         // colisión: medio ancho combinado
  hitHalfZ: 2.1,          // colisión: medio largo combinado
  nearHalfX: 2.7,         // ventana de "casi-choque"
  fogNear: 22, fogFar: 150,
  scoreDistK: 0.9,        // puntos por metro
  nearBonus: 60,          // puntos por casi-choque (x multiplicador)
};

// pos. X de cada carril, centrado
const LANES = (() => {
  const a = [], n = CFG.laneCount, mid = (n - 1) / 2;
  for (let i = 0; i < n; i++) a.push((i - mid) * CFG.laneGap);
  return a;
})();

// ----------------------------- RNG SEMBRADO ---------------------------------
function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
let rng = mulberry32(0xC0FFEE);

// ----------------------------- DOM ------------------------------------------
const $ = (id) => document.getElementById(id);
const dom = {
  hud: $("hud"), score: $("score"), best: $("best"), dist: $("dist"),
  speed: $("speed"), mult: $("mult"),
  start: $("screen-start"), load: $("screen-load"), pause: $("screen-pause"), over: $("screen-over"),
  loadingfill: $("loadingfill"),
  overScore: $("over-score"), overBest: $("over-best"), newbest: $("newbest"),
  busters: $("busters"), overBusters: $("over-busters"), recordHoy: $("hud-record-hoy"),
  btnStart: $("btn-start"), btnRetry: $("btn-retry"), mute: $("mutebtn"), dev: $("dev"),
};
// textos
$("t-title").textContent = STR.title; $("t-sub").textContent = STR.subtitle;
$("btn-start").textContent = STR.start; $("t-starthint").textContent = STR.startHint;
$("t-controls").textContent = STR.controls; $("t-loading").textContent = STR.loading;
$("t-paused").textContent = STR.paused; $("t-resume").textContent = STR.resumeHint;
$("t-over").textContent = STR.gameOver; $("t-final").textContent = STR.finalScore;
$("newbest").textContent = STR.newBest; $("btn-retry").textContent = STR.retry;
$("t-retryhint").textContent = STR.retryHint;
$("l-score").textContent = STR.hudScore; $("l-best").textContent = STR.hudBest;
$("l-dist").textContent = STR.hudDist; $("l-speed").textContent = STR.hudSpeed;
// HUD i18n por datos: labels de busters / multiplicador / récord-hoy desde strings.js
if ($("l-busters")) $("l-busters").textContent = STR.hudBusters;
if ($("l-mult")) $("l-mult").textContent = STR.hudMult;
if ($("l-record-hoy")) $("l-record-hoy").textContent = STR.hudRecordHoy;
// Exponer STR a la logica inline de la TIENDA (no-modulo) para textos por datos.
window.CR93_STR = STR;
// Botones de tienda i18n por datos
if ($("btn-shop-open")) $("btn-shop-open").textContent = STR.shopOpen || "TIENDA";
if ($("btn-shop-open-2")) $("btn-shop-open-2").textContent = STR.shopOpen || "TIENDA";
if ($("btn-shop-close")) $("btn-shop-close").textContent = STR.shopBack || "VOLVER";
{ const sl=$("shop-balance-line"); if (sl) sl.firstChild && (sl.childNodes[0].textContent = (STR.shopBalance || "BUSTERS DISPONIBLES") + ": "); }
{ const slog=document.querySelector(".shop-logo"); if (slog) slog.textContent = STR.shopTitle || "TIENDA"; }
{ const cats=document.querySelectorAll(".shop-cat-title"); if (cats[0]) cats[0].textContent = STR.shopSkins || "SKINS"; if (cats[1]) cats[1].textContent = STR.shopTracks || "SOUNDTRACKS"; }

// ----------------------------- THREE: render / escena -----------------------
const canvas = $("c");

// ----------------------------- WEBGL GUARD (arranque a prueba de headless) ---
// Detecta si el navegador puede crear un contexto WebGL ANTES de instanciar el
// renderer. En entornos headless/sin GPU ('Could not create a WebGL context'),
// instanciar THREE.WebGLRenderer tira un Error NO capturado que CONGELA el
// arranque. Por eso: si no hay contexto, NO creamos el renderer y entramos en
// MODO DEGRADADO -> el boot log aparece, el botón ACELERAR funciona y el loop
// corre sin pintar 3D (renderer = null). Jamás propagamos un Uncaught Error.
function webglAvailable() {
  try {
    const tc = document.createElement("canvas");
    const gl = tc.getContext("webgl2") || tc.getContext("webgl") || tc.getContext("experimental-webgl");
    return !!gl;
  } catch (e) { return false; }
}
let renderer = null;
const WEBGL_OK = webglAvailable();
if (WEBGL_OK) {
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
  } catch (e) {
    console.warn("[CafeRacer93] WebGLRenderer falló -> modo degradado:", e && e.message);
    renderer = null;
  }
}
if (!renderer) {
  console.warn("[CafeRacer93] sin contexto WebGL: arranco en MODO DEGRADADO (sin render 3D). GET / responde, boot log presente y ACELERAR transiciona sin freeze.");
}
const DPR_CAP = 2;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x1a0030, CFG.fogNear, CFG.fogFar);

const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 400);
camera.position.set(0, CFG.camHeight, CFG.camBack);
camera.lookAt(0, 1.2, -CFG.camLook);

function resize() {
  if (renderer) {
    const dpr = Math.min(devicePixelRatio || 1, DPR_CAP);
    renderer.setPixelRatio(dpr);
    renderer.setSize(innerWidth, innerHeight, false);
  }
  camera.aspect = innerWidth / Math.max(1, innerHeight);
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize); addEventListener("orientationchange", resize); resize();

// ----------------------------- CIELO + ENTORNO (env map) --------------------
function skyGradientTexture() {
  const cv = document.createElement("canvas"); cv.width = 16; cv.height = 256;
  const g = cv.getContext("2d").createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0.0, "#08010f");   // cenit
  g.addColorStop(0.45, "#1b0136");
  g.addColorStop(0.72, "#52067a");
  g.addColorStop(0.86, "#b3146e");
  g.addColorStop(1.0, "#ff5fa2");   // horizonte
  const ctx = cv.getContext("2d"); ctx.fillStyle = g; ctx.fillRect(0, 0, 16, 256);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.mapping = THREE.EquirectangularReflectionMapping;
  return tex;
}
const skyTex = skyGradientTexture();
scene.background = skyTex;
// env map para reflejos del cromo de la moto (solo si hay renderer/WebGL real)
if (renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromEquirectangular(skyTex).texture;
}

// ----------------------------- LUCES ----------------------------------------
scene.add(new THREE.HemisphereLight(0xff4fd2, 0x10112b, 0.8));
const key = new THREE.DirectionalLight(0xffd0f5, 1.1); key.position.set(-6, 12, -4); scene.add(key);
const cyanL = new THREE.PointLight(0x22e1ff, 2.4, 60); cyanL.position.set(5, 5, 4); scene.add(cyanL);
const pinkL = new THREE.PointLight(0xff2d95, 2.4, 60); pinkL.position.set(-5, 5, 2); scene.add(pinkL);
// foco que sigue a la moto para que el cromo synthwave destaque
const bikeLamp = new THREE.PointLight(0xffe8ff, 2.0, 16); bikeLamp.position.set(0, 4.5, 3.5); scene.add(bikeLamp);
const bikeRim = new THREE.PointLight(0x22e1ff, 1.4, 12); bikeRim.position.set(0, 2.0, -3.0); scene.add(bikeRim);

// ----------------------------- SOL DE NEÓN (shader) -------------------------
const sunMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, fog: false,
  uniforms: { uPink: { value: new THREE.Color(0xff2d95) }, uYellow: { value: new THREE.Color(0xffd24a) } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader: `
    varying vec2 vUv; uniform vec3 uPink; uniform vec3 uYellow;
    void main(){
      vec2 p = vUv*2.0-1.0;
      float r = length(p);
      if(r>1.0) discard;
      vec3 col = mix(uYellow, uPink, clamp(vUv.y,0.0,1.0));   // gradiente vertical
      // bandas horizontales (scanlines clásicas) en la mitad inferior
      float band = step(0.5, fract(vUv.y*16.0));
      float lower = step(vUv.y, 0.5);
      float a = 1.0 - lower*(1.0-band);
      float edge = smoothstep(1.0, 0.86, r);
      gl_FragColor = vec4(col, a*edge);
    }`,
});
const sun = new THREE.Mesh(new THREE.PlaneGeometry(70, 70), sunMat);
sun.position.set(0, 20, -180); scene.add(sun);
// halo aditivo del sol
const halo = new THREE.Mesh(new THREE.PlaneGeometry(120, 120),
  new THREE.MeshBasicMaterial({ color: 0xff2d95, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
halo.position.copy(sun.position); halo.position.z += 1; scene.add(halo);

// ----------------------------- MONTAÑAS DE HORIZONTE ------------------------
function buildMountains(z, height, color, fill) {
  const W = 360, segs = 40, half = W / 2;
  const top = []; // perfil superior
  let h = height * 0.4;
  for (let i = 0; i <= segs; i++) {
    h += (rng() - 0.5) * height * 0.6; h = Math.max(height * 0.15, Math.min(height, h));
    top.push(h);
  }
  // relleno (triángulos) entre y=0 y el perfil
  const pos = [];
  for (let i = 0; i < segs; i++) {
    const x0 = -half + (i / segs) * W, x1 = -half + ((i + 1) / segs) * W;
    const y0 = top[i], y1 = top[i + 1];
    pos.push(x0, 0, 0, x1, 0, 0, x0, y0, 0);
    pos.push(x1, 0, 0, x1, y1, 0, x0, y0, 0);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: fill, fog: false }));
  m.position.set(0, 0, z); scene.add(m);
  // línea neón en la cresta
  const lp = []; for (let i = 0; i <= segs; i++) lp.push(-half + (i / segs) * W, top[i], 0);
  const lg = new THREE.BufferGeometry(); lg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(lp), 3));
  const line = new THREE.Line(lg, new THREE.LineBasicMaterial({ color, fog: false }));
  line.position.set(0, 0, z + 0.1); scene.add(line);
}
buildMountains(-178, 46, 0xb026ff, 0x1a0033);
buildMountains(-168, 30, 0x22e1ff, 0x12012b);

// ----------------------------- ESTRELLAS ------------------------------------
(() => {
  const N = 360, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i*3] = (rng()*2-1)*260;
    pos[i*3+1] = 25 + rng()*120;
    pos[i*3+2] = -60 - rng()*260;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0x9fd0ff, size: 0.9, sizeAttenuation: true, transparent: true, opacity: 0.85, fog: false })));
})();

// ----------------------------- PISO GRID (shader, scroll) -------------------
const gridUniforms = {
  uScroll: { value: 0 },
  uCyan: { value: new THREE.Color(0x18d9ff) },
  uPink: { value: new THREE.Color(0xff2d95) },
  uRoadHalf: { value: CFG.roadHalf },
  uFogCol: { value: new THREE.Color(0x140026) },
};
const gridMat = new THREE.ShaderMaterial({
  uniforms: gridUniforms, fog: false,
  vertexShader: `
    varying vec3 vW;
    void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW=w.xyz;
      gl_Position=projectionMatrix*viewMatrix*w; }`,
  fragmentShader: `
    varying vec3 vW; uniform float uScroll; uniform vec3 uCyan; uniform vec3 uPink;
    uniform float uRoadHalf; uniform vec3 uFogCol;
    float line(float coord, float w){ float g=abs(fract(coord)-0.5); return smoothstep(w, 0.0, g-0.5+w); }
    void main(){
      float cell = 2.6;
      float gx = abs(fract(vW.x/cell - 0.5)-0.5);
      float gz = abs(fract((vW.z + uScroll)/cell - 0.5)-0.5);
      float fw = fwidth(vW.x/cell)*1.2 + 0.002;
      float lx = smoothstep(fw, 0.0, gx);
      float lz = smoothstep(fw, 0.0, gz);
      // las líneas a lo ancho (transversales) en cyan, las longitudinales en magenta
      vec3 col = vec3(0.0);
      col += uCyan * lz;
      col += uPink * lx * 0.9;
      // resalto los bordes de la pista
      float edge = smoothstep(0.18,0.0,abs(abs(vW.x)-uRoadHalf));
      col += uPink * edge * 1.4;
      // base oscura de la calzada dentro de la pista
      float onRoad = step(abs(vW.x), uRoadHalf);
      vec3 base = mix(vec3(0.02,0.0,0.05), vec3(0.05,0.0,0.10), onRoad);
      col += base;
      // fade por distancia hacia el color de niebla
      float d = clamp((-vW.z - 10.0)/130.0, 0.0, 1.0);
      col = mix(col, uFogCol, d*0.92);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), gridMat);
ground.rotation.x = -Math.PI / 2; ground.position.y = 0; scene.add(ground);

// ----------------------------- PILONES DE NEÓN (cue de velocidad) -----------
const pylons = [];
{
  const geo = new THREE.BoxGeometry(0.18, 2.0, 0.18);
  const matC = new THREE.MeshBasicMaterial({ color: 0x22e1ff, fog: true });
  const matP = new THREE.MeshBasicMaterial({ color: 0xff2d95, fog: true });
  const COUNT = 16, SPAN = 16; // separación en z
  for (let i = 0; i < COUNT; i++) {
    for (const side of [-1, 1]) {
      const m = new THREE.Mesh(geo, side < 0 ? matC : matP);
      m.position.set(side * (CFG.roadHalf + 0.5), 1.0, -i * SPAN);
      m.userData.span = COUNT * SPAN;
      scene.add(m); pylons.push(m);
    }
  }
}

// ----------------------------- DASHES DE CARRIL (scroll) --------------------
const dashes = [];
{
  const geo = new THREE.PlaneGeometry(0.26, 2.4);
  const mat = new THREE.MeshBasicMaterial({ color: 0xfff2c2, transparent: true, opacity: 0.85, fog: true });
  const COUNT = 10, SPAN = 9;
  for (let li = 0; li < CFG.laneCount - 1; li++) {
    const x = (LANES[li] + LANES[li + 1]) / 2;
    for (let i = 0; i < COUNT; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.03, -i * SPAN);
      m.userData.span = COUNT * SPAN;
      scene.add(m); dashes.push(m);
    }
  }
}

// ----------------------------- MOTO (GLB + fallback) ------------------------
const bike = new THREE.Group(); scene.add(bike);
const bikePivot = new THREE.Group(); bike.add(bikePivot); // turntable (rotation.y) + lean (rotation.z)
// Grupo CONTENEDOR de orientación: lleva la corrección de yaw CONSTANTE para que el morro
// de la moto apunte a -Z (sentido de la pista). El turntable y el lean rotan el PADRE
// (bikePivot) y se componen SOBRE este offset sin pisarlo; resetRun resetea bikePivot, no esto.
const bikeOrient = new THREE.Group(); bikeOrient.rotation.y += Math.PI; bikePivot.add(bikeOrient);
let bikeReady = false;

function buildProceduralBike() {
  // Café racer procedural (fallback si el GLB no carga). Apunta a +Z local; el grupo
  // `bikeOrient` lo gira 180°, así el MORRO (faro) queda mirando a -Z = sentido de marcha.
  // Corrige el "al revés": faro/horquilla ADELANTE y luz trasera ATRÁS, sin ambigüedad,
  // y las ruedas con eje en X (Torus rotado 90°) para que rueden a lo largo de Z.
  const g = new THREE.Group();
  const chrome = (c, e) => new THREE.MeshStandardMaterial({ color: c, metalness: 0.9, roughness: 0.22, emissive: e, emissiveIntensity: 0.5 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 2.3), chrome(0xff2d95, 0x5a0030));
  body.position.y = 0.95; g.add(body);
  const tank = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 12), chrome(0x22e1ff, 0x004055));
  tank.scale.set(1, 0.7, 1.3); tank.position.set(0, 1.12, 0.4); g.add(tank);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.85),
    new THREE.MeshStandardMaterial({ color: 0x14001f, metalness: 0.3, roughness: 0.7 }));
  seat.position.set(0, 1.16, -0.8); g.add(seat);
  // faro delantero (+Z) — define inequívocamente el frente de la moto
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.16, 16),
    new THREE.MeshStandardMaterial({ color: 0xffe85c, emissive: 0xffe85c, emissiveIntensity: 1.3, metalness: 0.4, roughness: 0.3 }));
  head.rotation.x = Math.PI / 2; head.position.set(0, 1.0, 1.3); g.add(head);
  // ruedas con eje en X (ruedan a lo largo de Z); delante +Z, detrás -Z
  const wheelGeo = new THREE.TorusGeometry(0.5, 0.16, 12, 24);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0a0a12, metalness: 0.6, roughness: 0.45, emissive: 0x22e1ff, emissiveIntensity: 0.4 });
  for (const z of [1.2, -1.2]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat); w.rotation.y = Math.PI / 2; w.position.set(0, 0.5, z); g.add(w);
  }
  // luz trasera roja (atrás, -Z)
  const tail = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.14),
    new THREE.MeshBasicMaterial({ color: 0xff2233, transparent: true, opacity: 0.95 }));
  tail.position.set(0, 1.0, -1.25); tail.rotation.y = Math.PI; g.add(tail);
  return g;
}

function buildPlaceholderBike() {
  // Placeholder PROVISIONAL (caja neón simple) que ocupa el lugar de la moto al
  // instante mientras el GLB carga en segundo plano. Es barato de crear y NO
  // bloquea el arranque; se reemplaza cuando loadBike() resuelve.
  const g = new THREE.Group();
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.8, CFG.bikeLen),
    new THREE.MeshStandardMaterial({ color: 0x22e1ff, metalness: 0.6, roughness: 0.4, emissive: 0x0a2a40, emissiveIntensity: 0.6, transparent: true, opacity: 0.65 })
  );
  m.position.y = 0.9; g.add(m);
  return g;
}

function frameBike(obj) {
  // normalizar: centrar, escalar a CFG.bikeLen y apoyar en y=0
  const box = new THREE.Box3().setFromObject(obj);
  const size = new THREE.Vector3(); box.getSize(size);
  const center = new THREE.Vector3(); box.getCenter(center);
  // alinear el eje más largo (horizontal) a Z
  if (size.x > size.z) { obj.rotation.y = Math.PI / 2; }
  // ORIENTACIÓN: el giro de 180° lo aplica UNA sola vez el grupo `bikeOrient`. Antes había
  // aquí un SEGUNDO `obj.rotation.y += Math.PI` que se cancelaba con aquel (360°=0) y dejaba
  // la moto AL REVÉS; removido -> giro neto de 180° -> el morro mira a -Z (sentido de marcha).
  // recomputar tras rotar
  const box2 = new THREE.Box3().setFromObject(obj);
  const s2 = new THREE.Vector3(); box2.getSize(s2);
  const c2 = new THREE.Vector3(); box2.getCenter(c2);
  const len = Math.max(s2.z, s2.x, 0.001);
  const scl = CFG.bikeLen / len;
  obj.scale.setScalar(scl);
  const box3 = new THREE.Box3().setFromObject(obj);
  const s3 = new THREE.Vector3(); box3.getSize(s3);
  const c3 = new THREE.Vector3(); box3.getCenter(c3);
  obj.position.x -= c3.x; obj.position.z -= c3.z;
  obj.position.y -= box3.min.y; // apoyar ruedas en el piso
  // mejorar materiales para el look synthwave (sin romper texturas PBR)
  obj.traverse((o) => {
    if (o.isMesh && o.material) {
      o.castShadow = false; o.receiveShadow = false;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => { if (m.envMapIntensity !== undefined) m.envMapIntensity = 1.4; m.needsUpdate = true; });
    }
  });
  return obj;
}

function loadBike() {
  // ITER 2: cada skin tiene su propio GLB (color horneado). loadBike delega en setBikeModel
  // (definido mas abajo), que carga el GLB de la skin EQUIPADA con carga perezosa + cache, y cae
  // LIMPIAMENTE a moto_hi.glb + tint (o a la moto procedural) si el GLB no resuelve. GLTFLoader
  // usa BufferGeometryUtils del vendor -> NO tocar ese import (gotcha conocido). frameBike()
  // normaliza la malla y le sube envMapIntensity para reflejar el env map PM (scene.environment).
  return setBikeModel(localStorage.getItem("cr93_skin") || "skin_default");
}

// ----------------------------- TRÁFICO (autos neón) -------------------------
const carBodyGeo = new THREE.BoxGeometry(2.2, 1.25, 3.9);   // carro un poco MÁS GRANDE (balance)
const carCabinGeo = new THREE.BoxGeometry(1.9, 0.85, 2.0);
const carEdgeGeo = new THREE.EdgesGeometry(carBodyGeo);
const NEON = [0x22e1ff, 0xff2d95, 0xb026ff, 0xffe85c, 0x39ff88];
// Half-extent de la MOTO para la colisión AABB (se combina con el half-extent de cada
// obstáculo). Calibrado para CONSERVAR EXACTO el alcance previo de los autos (1.55 X / 2.1 Z).
const BIKE_HALF = { x: 0.55, z: 0.4 };
function buildCar(colorHex) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(carBodyGeo, new THREE.MeshStandardMaterial({ color: 0x0a0a16, metalness: 0.7, roughness: 0.35, emissive: new THREE.Color(colorHex), emissiveIntensity: 0.25 }));
  body.position.y = 0.65; g.add(body);
  const cabin = new THREE.Mesh(carCabinGeo, new THREE.MeshStandardMaterial({ color: 0x05050c, metalness: 0.4, roughness: 0.2, emissive: new THREE.Color(colorHex), emissiveIntensity: 0.15 }));
  cabin.position.set(0, 1.45, -0.1); g.add(cabin);
  const edges = new THREE.LineSegments(carEdgeGeo, new THREE.LineBasicMaterial({ color: colorHex }));
  edges.position.y = 0.65; g.add(edges);
  // luces traseras (miran a +Z, hacia el jugador que se acerca por detrás)
  const tl = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.28), new THREE.MeshBasicMaterial({ color: 0xff2233, transparent: true, opacity: 0.95, fog: true }));
  tl.position.set(0, 0.85, 1.96); g.add(tl);
  g.userData.color = colorHex;
  return g;
}

// ----------------------------- TRÁFICO: BUS (caja larga/alta, neón synthwave) ----
// Caja MÁS ANCHA / ALTA / LARGA que el auto. Ventanas, faros y neón resueltos por
// material/emissive (MeshStandardMaterial con emissive cyan/magenta) — SIN imágenes.
const busBodyGeo = new THREE.BoxGeometry(2.5, 3.0, 14.0);   // half = (1.25, 1.5, 7.0) — ALTO (montable, ~ápice 3.47), LARGO, un poco más ancho
const busEdgeGeo = new THREE.EdgesGeometry(busBodyGeo);
const busWindowGeo = new THREE.PlaneGeometry(0.6, 0.7);
function buildBus() {
  const g = new THREE.Group();
  // carrocería oscura con emisión cyan synthwave
  const body = new THREE.Mesh(busBodyGeo, new THREE.MeshStandardMaterial({
    color: 0x0a0a18, metalness: 0.65, roughness: 0.35,
    emissive: new THREE.Color(0x22e1ff), emissiveIntensity: 0.32 }));
  body.position.y = 1.5; g.add(body);
  // contorno neón magenta (líneas del chasis)
  const edges = new THREE.LineSegments(busEdgeGeo, new THREE.LineBasicMaterial({ color: 0xff2d95 }));
  edges.position.y = 1.5; g.add(edges);
  // dos franjas de ventanas iluminadas (planos emissive) a ambos lados (bus más alto -> 2 filas)
  const winMat = new THREE.MeshStandardMaterial({ color: 0x041018, emissive: new THREE.Color(0x22e1ff), emissiveIntensity: 1.1, metalness: 0.2, roughness: 0.4 });
  for (const side of [-1, 1]) {
    for (let i = 0; i < 11; i++) {                // 11 columnas por lado cubren el Z (14) sin estirarse
      for (const wy of [1.45, 2.25]) {            // dos alturas: bus más alto
        const w = new THREE.Mesh(busWindowGeo, winMat);
        w.position.set(side * 1.26, wy, -6.0 + i * 1.2);   // a lo largo del nuevo Z (±6.0)
        w.rotation.y = side < 0 ? -Math.PI / 2 : Math.PI / 2;
        g.add(w);
      }
    }
  }
  // luces traseras rojas (miran a +Z, hacia el jugador) — al extremo trasero del nuevo Z
  const tl = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.32), new THREE.MeshBasicMaterial({ color: 0xff2233, transparent: true, opacity: 0.95, fog: true }));
  tl.position.set(0, 0.8, 7.01); g.add(tl);
  // faros delanteros amarillos (miran a -Z) — al nuevo morro
  const hl = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 0.28), new THREE.MeshBasicMaterial({ color: 0xfff2c2, transparent: true, opacity: 0.9, fog: true }));
  hl.position.set(0, 0.9, -7.01); hl.rotation.y = Math.PI; g.add(hl);
  g.userData.color = 0x22e1ff;
  return g;
}

// ----------------------------- MODELOS 3D DE OBSTÁCULOS (carros + buses) -----
// "Skins 3D" de los obstáculos: GLB generados con Higgsfield (image_to_3d). Se cargan UNA vez,
// se normalizan al largo de su caja de colisión y se CLONAN por spawn (comparten geometría/
// materiales -> barato). El AABB de colisión NO cambia (se setea en getCar/getBus igual que
// antes) => jugabilidad idéntica. Fallback: si los GLB no cargan, se usan las cajas neón
// procedurales existentes. Todo cosmético.
const OBST_GLB = {
  car: ["./assets/obstacles/car_cyan.glb", "./assets/obstacles/car_magenta.glb"],
  bus: ["./assets/obstacles/bus_cyan.glb", "./assets/obstacles/bus_magenta.glb"],
};
const _obstPrepared = { car: [], bus: [] };   // prototipos normalizados (Group) listos para clonar
function frameVehicle(model, dims) {
  // alinear el eje horizontal más largo a Z (largo), ESCALAR POR ALTURA a dims.h (así el bus 3D
  // queda exactamente tan alto como su caja -> montable; ancho/largo siguen las proporciones del
  // modelo), centrar en x/z y apoyar en y=0. Devuelve un WRAP Group (lo que el spawn clona y
  // posiciona) con el modelo ya centrado adentro, para que setear wrap.position NO descentre.
  const box = new THREE.Box3().setFromObject(model); const size = new THREE.Vector3(); box.getSize(size);
  if (size.x > size.z) model.rotation.y = Math.PI / 2;
  let b = new THREE.Box3().setFromObject(model); const s = new THREE.Vector3(); b.getSize(s);
  model.scale.setScalar(dims.h / Math.max(s.y, 0.001));
  b = new THREE.Box3().setFromObject(model); const c = new THREE.Vector3(); b.getCenter(c);
  model.position.x -= c.x; model.position.z -= c.z; model.position.y -= b.min.y;
  // vibrancia synthwave: bajar metalness + glow del propio color (igual que la moto), para que el
  // neón lea en la escena nocturna y el metálico no se vea negro.
  model.traverse((o) => {
    if (o.isMesh && o.material) { o.castShadow = false; o.receiveShadow = false;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => { if (m.metalness !== undefined) m.metalness = Math.min(m.metalness, 0.5);
        if (m.emissive && m.color) { m.emissive.copy(m.color).multiplyScalar(0.22); m.emissiveIntensity = Math.max(m.emissiveIntensity || 0, 0.28); }
        if (m.envMapIntensity !== undefined) m.envMapIntensity = 1.3; m.needsUpdate = true; });
    }
  });
  const wrap = new THREE.Group(); wrap.add(model); return wrap;
}
function loadObstacleModels() {
  const loader = new GLTFLoader();
  const one = (path, kind, dims) => loader.load(path,
    (g) => { _obstPrepared[kind].push(frameVehicle(g.scene, dims)); console.log("[CafeRacer93] obstáculo 3D:", path); },
    null,
    (err) => console.warn("[CafeRacer93] obstáculo no cargó (fallback procedural):", path, err && err.message));
  OBST_GLB.car.forEach((p) => one(p, "car", { w: 2.2, h: 1.25, l: 3.9 }));
  OBST_GLB.bus.forEach((p) => one(p, "bus", { w: 2.5, h: 3.0, l: 14.0 }));
}

const carPool = [];
const busPool = [];
const activeCars = [];   // lista MEZCLADA autos + buses; cada uno lleva su AABB en userData
function getCar() {
  let c = carPool.pop();
  if (!c) { const P = _obstPrepared.car; c = P.length ? P[(rng() * P.length) | 0].clone() : buildCar(NEON[(rng() * NEON.length) | 0]); }
  // AABB half-extent derivado de la geometría del auto (2.2 x 1.25 x 3.9 -> 1.1 / 0.625 / 1.95)
  c.userData.hx = 1.1; c.userData.hy = 0.625; c.userData.hz = 1.95; c.userData.topY = 1.95; c.userData.type = "car";
  c.visible = true; scene.add(c); activeCars.push(c); return c;
}
function getBus() {
  let b = busPool.pop();
  if (!b) { const P = _obstPrepared.bus; b = P.length ? P[(rng() * P.length) | 0].clone() : buildBus(); }
  // AABB half-extent derivado de la geometría del bus (2.5 x 3.0 x 14.0 -> 1.25 / 1.5 / 7.0).
  // topY = 3.0 (= alto del bus): la moto debe SALTAR (ápice 3.47) para montarse encima.
  b.userData.hx = 1.25; b.userData.hy = 1.5; b.userData.hz = 7.0; b.userData.topY = 3.0; b.userData.type = "bus";
  b.visible = true; scene.add(b); activeCars.push(b); return b;
}
function freeCar(c) {
  c.visible = false; scene.remove(c);
  const i = activeCars.indexOf(c); if (i >= 0) activeCars.splice(i, 1);
  if (c.userData.type === "bus") busPool.push(c); else carPool.push(c);
}

// ----------------------------- RAMPAS DE SALTO (neón synthwave) -------------
// ITER 1 (solo VISIBILIDAD): rampa como superficie inclinada con gradiente EMISSIVE
// magenta(#ff2bd6)->cyan(#27e7ff) via CanvasTexture (SIN imágenes), bordes glow
// (LineSegments cyan) y rieles magenta. Se cablea al MISMO scheduler de tráfico
// (spawnWave), scrollea con el mismo 'move' del mundo y se recicla al pasar la cámara.
// El trigger de salto y la estética del tráfico NO se tocan: esto solo AÑADE geometría.
function rampGradientTexture() {
  const cv = document.createElement("canvas"); cv.width = 128; cv.height = 256;
  const ctx = cv.getContext("2d");
  const g = ctx.createLinearGradient(0, 256, 0, 0);   // longitudinal: base magenta -> punta cyan
  g.addColorStop(0.0, "#ff2bd6"); g.addColorStop(1.0, "#27e7ff");
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 256);
  // chevrons glow dibujados por path (banda en V), brillo via shadowBlur
  ctx.strokeStyle = "rgba(255,255,255,0.92)"; ctx.lineWidth = 11;
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  ctx.shadowColor = "#ffffff"; ctx.shadowBlur = 16;
  for (let y = 236; y > 8; y -= 46) {
    ctx.beginPath(); ctx.moveTo(14, y); ctx.lineTo(64, y - 30); ctx.lineTo(114, y); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const rampTex = rampGradientTexture();
const RAMP = { w: 2.8, len: 6.0, h: 1.7 };
RAMP.angle = Math.atan2(RAMP.h, RAMP.len);
RAMP.slope = Math.hypot(RAMP.len, RAMP.h);
function buildRamp() {
  const g = new THREE.Group();
  // superficie inclinada: el morro (lado -Z) sube h; material emissive (auto-iluminado synthwave)
  const surf = new THREE.Mesh(
    new THREE.PlaneGeometry(RAMP.w, RAMP.slope),
    new THREE.MeshStandardMaterial({
      color: 0x05020a, emissive: 0xffffff, emissiveMap: rampTex, emissiveIntensity: 1.3,
      metalness: 0.2, roughness: 0.5, side: THREE.DoubleSide, fog: true,
    }));
  surf.rotation.x = -Math.PI / 2 + RAMP.angle;   // tendida sobre el carril + inclinación de rampa
  surf.position.y = RAMP.h / 2;
  g.add(surf);
  // borde neón glow (líneas cyan) sobre el contorno de la superficie inclinada
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(surf.geometry),
    new THREE.LineBasicMaterial({ color: 0x27e7ff }));
  edges.rotation.copy(surf.rotation); edges.position.copy(surf.position);
  g.add(edges);
  // rieles laterales magenta para dar volumen (alineados con la pendiente)
  const railGeo = new THREE.BoxGeometry(0.18, 0.18, RAMP.slope);
  const railMat = new THREE.MeshBasicMaterial({ color: 0xff2bd6, fog: true });
  for (const side of [-1, 1]) {
    const r = new THREE.Mesh(railGeo, railMat);
    r.rotation.x = RAMP.angle; r.position.set(side * (RAMP.w / 2), RAMP.h / 2, 0);
    g.add(r);
  }
  return g;
}
const rampPool = [];
const activeRamps = [];   // rampas en pista; scrollean con 'move' y se reciclan al pasar la cámara
function getRamp() {
  let r = rampPool.pop();
  if (!r) r = buildRamp();
  r.visible = true; scene.add(r); activeRamps.push(r); return r;
}
function freeRamp(r) {
  r.visible = false; scene.remove(r);
  const i = activeRamps.indexOf(r); if (i >= 0) activeRamps.splice(i, 1);
  rampPool.push(r);
}

// ----------------------------- BUSTERS (monedas) ----------------------------
const coinDiscGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.12, 20);
const coinMat = new THREE.MeshStandardMaterial({ color: 0xffe85c, metalness: 0.95, roughness: 0.2, emissive: 0xff9500, emissiveIntensity: 0.85 });
const coinPool = [];
const activeCoins = [];
const BUSTER_BONUS = 35; // puntos por buster (x multiplicador)
function getCoin() {
  let c = coinPool.pop();
  if (!c) {
    c = new THREE.Group();
    const disc = new THREE.Mesh(coinDiscGeo, coinMat);
    disc.rotation.x = Math.PI / 2;            // cara plana hacia el jugador
    c.add(disc);
  }
  c.visible = true; scene.add(c); activeCoins.push(c); return c;
}
function freeCoin(c) {
  c.visible = false; scene.remove(c);
  const i = activeCoins.indexOf(c); if (i >= 0) activeCoins.splice(i, 1);
  coinPool.push(c);
}
function spawnBusters() {
  // soltar una hilera de busters en un carril alcanzable
  const li = (rng() * CFG.laneCount) | 0;
  const n = 3 + ((rng() * 4) | 0);
  for (let i = 0; i < n; i++) {
    const c = getCoin();
    c.position.set(LANES[li], 1.15, -138 - i * 4.2);
    c.userData.taken = false;
  }
}

// ----------------------------- MONEDAS AZULES (flotantes, valen 5) ----------
// Spawner SEPARADO de las amarillas: REUTILIZA la MISMA forma (coinDiscGeo) con un
// material AZUL synthwave (#00eaff). NO toca las amarillas, su spawn ni su valor.
// Flotan a una altura ALCANZABLE por el salto (por debajo del ápice ~3.47) y SOLO se
// recolectan DURANTE un salto (G.enElAire). Todo vectorial/canvas -> CERO créditos.
const blueCoinMat = new THREE.MeshStandardMaterial({ color: 0x00eaff, metalness: 0.95, roughness: 0.2, emissive: 0x00a2ff, emissiveIntensity: 0.95 });
const blueCoinPool = [];
const activeBlueCoins = [];
const BLUE_COIN_VALUE = 5;                 // cada moneda azul vale 5 busters
const BLUE_COIN_Y = 2.4;                   // altura flotante: bajo el ápice del salto (~3.47) -> alcanzable
let blueCoinT = 2.4;                        // timer de spawn aleatorio (reseteado en resetRun)
function getBlueCoin() {
  let c = blueCoinPool.pop();
  if (!c) {
    c = new THREE.Group();
    const disc = new THREE.Mesh(coinDiscGeo, blueCoinMat);   // MISMA geometría, tinte azul
    disc.rotation.x = Math.PI / 2;            // cara plana hacia el jugador
    c.add(disc);
  }
  c.visible = true; scene.add(c); activeBlueCoins.push(c); return c;
}
function freeBlueCoin(c) {
  c.visible = false; scene.remove(c);
  const i = activeBlueCoins.indexOf(c); if (i >= 0) activeBlueCoins.splice(i, 1);
  blueCoinPool.push(c);
}
function spawnBlueCoins() {
  // hilera corta de monedas AZULES en X aleatoria (carril), FLOTANDO a BLUE_COIN_Y
  const li = (rng() * CFG.laneCount) | 0;
  const n = 1 + ((rng() * 3) | 0);
  for (let i = 0; i < n; i++) {
    const c = getBlueCoin();
    c.position.set(LANES[li], BLUE_COIN_Y, -140 - i * 4.4);
    c.userData.taken = false;
  }
}
// Recolectar una moneda AZUL: suma +5, persiste el total y dispara el audio.coin() actual.
function collectBlueCoin() {
  G.coins += BLUE_COIN_VALUE;                // +5 al contador de la partida
  G.busters = G.coins;                       // el HUD/contador lee G.busters
  G.bustersTotal += BLUE_COIN_VALUE;         // acumulado histórico persistido
  audio.coin();                              // MISMO sfx que las amarillas
  persistBusters();                          // persistir durante la recolección (misma clave)
  refreshBusters(true);                      // refresco instantáneo del HUD + pulse
  refreshRecordHoy();
}

// Persistencia de busters (frontend, sin backend): escribe los totales en localStorage.
// busters_total = acumulado histórico; busters_best = máximo recogido en un solo run.
function persistBusters() {
  if (G.coins > G.bustersBest) G.bustersBest = G.coins;
  localStorage.setItem("busters_total", String(G.bustersTotal));
  localStorage.setItem("busters_best", String(G.bustersBest));
}

// ----------------------------- HABILIDADES POR MOTO -------------------------
// Cada moto (skin equipada, leida de localStorage clave EXISTENTE "cr93_skin") tiene
// una habilidad unica. ITER 1: solo 'Monedas X2' (duplica cada buster en HUD + billetera);
// 'Invencible' y 'Vida Extra' quedan como puntos de enganche no-op para proximas iters.
const MOTO_ABILITY = {
  skin_default: null,            // moto base: sin habilidad
  skin_cyan:    "Monedas X2",
  skin_magenta: "Invencible",
  skin_gold:    "Vida Extra",
  skin_violet:  "Invencible",    // skin extra de la tienda (preview cr93-bike-5)
  skin_aqua:    "Monedas X2",    // skin extra de la tienda (preview cr93-bike-6)
};
function selectedMoto() {
  // clave EXISTENTE de la moto/skin equipada; default a la moto base si no existe
  return localStorage.getItem("cr93_skin") || "skin_default";
}
function abilityForSelectedMoto() { return MOTO_ABILITY[selectedMoto()] || null; }
// multiplicador de busters: UNICO punto donde vive el x2 (1 por defecto, 2 con 'Monedas X2')
let coinMultiplier = 1;
// --- Estado de habilidades por partida (reseteado en applyAbility() desde startRun()) ---
const INVINCIBLE_MS = 15000;   // 'Invencible': el escudo neon dura 15s
const GRACE_MS = 1000;         // 'Vida Extra': invulnerabilidad de gracia ~1s tras absorber
let invincibleUntil = 0;       // now() < invincibleUntil => escudo activo (evita choque trafico)
let extraLifeAvail = false;    // true solo si la moto equipada tiene 'Vida Extra'
let extraLifeUsed = false;     // se consume con el PRIMER choque de la partida
let graceUntil = 0;            // ventana de gracia para no re-chocar el mismo objeto
// Engancha la habilidad de la moto UNA vez por partida (se llama desde startRun()).
function applyAbility(ability) {
  coinMultiplier = 1;            // reset por partida: no acumular entre runs
  invincibleUntil = 0;           // reset escudo de invencibilidad
  extraLifeAvail = false; extraLifeUsed = false; graceUntil = 0;  // reset 'Vida Extra'
  if (ability === "Monedas X2") {
    coinMultiplier = 2;          // cada buster suma x2 (HUD + billetera persistida)
  } else if (ability === "Invencible") {
    // escudo neon procedural 15s desde el arranque del run (render por CSS en updateShield)
    invincibleUntil = performance.now() + INVINCIBLE_MS;
  } else if (ability === "Vida Extra") {
    // habilita absorber UN (1) choque por partida y reanudar desde el impacto
    extraLifeAvail = true;
  }
}
// Escudo de invencibilidad: anillo/glow neon synthwave PROCEDURAL (CSS), sobre la moto.
// Fade-out en los ultimos ~2s; se apaga al expirar o fuera de 'playing'. delta-time via rAF.
const shieldEl = $("shield");
function updateShield(now) {
  if (!shieldEl) return;
  const remain = invincibleUntil - now;
  if (state === "playing" && remain > 0) {
    if (!shieldEl.classList.contains("on")) shieldEl.classList.add("on");
    const FADE = 2000;                                  // fade-out suave en los ultimos 2s
    shieldEl.style.opacity = String(remain < FADE ? Math.max(0, remain / FADE) : 1);
  } else if (shieldEl.classList.contains("on")) {
    shieldEl.classList.remove("on"); shieldEl.style.opacity = "0";
  }
}
// Destello CSS al gastar 'Vida Extra' (feedback visual del choque absorbido).
const flashEl = $("flash");
function triggerExtraLifeFlash() {
  if (!flashEl) return;
  flashEl.classList.remove("on"); void flashEl.offsetWidth; flashEl.classList.add("on");
}

// Recolectar un buster: actualiza INMEDIATAMENTE coins/score/bonus y persiste.
function collectBuster() {
  G.coins += coinMultiplier;
  G.busters = G.coins;                                  // el HUD/contador lee G.busters
  G.bonusMultiplier = Math.min(8, G.bonusMultiplier + 0.25);
  G.bonusT = 4.0;                                        // reinicia ventana de decay
  G.score += BUSTER_BONUS * G.mult * G.bonusMultiplier;  // valor * multiplicadores
  G.bustersTotal += coinMultiplier;                      // acumulado histórico (x2 con 'Monedas X2')
  audio.coin();
  persistBusters();                                      // persistir durante la recolección
  // HUD INSTANTÁNEO: refrescar el contador EN EL MISMO FRAME del pickup + micro-pulse synthwave
  refreshBusters(true);
  refreshRecordHoy();
}

// ----------------------------- AUDIO ----------------------------------------
// MUTE PERSISTENTE: el estado vive en localStorage ("cr93_muted") y se rehidrata al cargar.
// Beeps de gameplay (pickup/near/ui) por WebAudio (Oscillator+Gain); música por <audio>.
// Al mutear se SUSPENDE el AudioContext (ahorra CPU); al desmutear se REANUDA.
const audio = (() => {
  let ctx, started = false, fadeRAF = 0;
  let muted = localStorage.getItem("cr93_muted") === "1";   // rehidratar estado guardado (MISMA clave)
  let MUSIC_VOL = 0.55;

  // ---- PLAYLIST ENCADENADA (no se detiene tras la primera) -----------------
  // playlist[0] = base synthwave (music.m4a, INTACTA: mismo HTMLAudioElement de siempre).
  // Siguientes = pistas que el jugador POSEE (cr93_owned_tracks). Cada pista es un
  // HTMLAudioElement con loop=false y un listener 'ended' que arranca la SIGUIENTE, asi
  // la reproduccion encadena y NO para tras la primera. Modo 'secuencial' (idx+1 con wrap
  // al 0) o 'aleatorio' (idx random distinto al actual) segun la flag interna `shuffle`.
  const ALL_TRACKS = ["music", "track_01", "track_02", "track_03", "track_04", "track_05"];
  let playlist = ["music"];
  let idx = 0;
  let musicEl = null;       // HTMLAudioElement actualmente sonando (compat: setMuted/setTrack lo usan)
  let shuffle = false;      // flag interna: false=secuencial, true=aleatorio

  function ownedTracks() {
    try { var a = JSON.parse(localStorage.getItem("cr93_owned_tracks") || "[]"); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  }
  function rebuildPlaylist() {
    // base SIEMPRE primero (intacta) + las pistas compradas, en orden de catalogo
    var own = ownedTracks();
    playlist = ALL_TRACKS.filter(function (id) { return id === "music" || own.indexOf(id) >= 0; });
    if (playlist.length === 0) playlist = ["music"];
  }
  function nextIndex() {
    if (playlist.length <= 1) return idx;          // una sola pista -> reencadena la misma
    if (shuffle) {
      var n = idx;
      while (n === idx) n = (Math.random() * playlist.length) | 0;   // aleatorio distinto al actual
      return n;
    }
    return (idx + 1) % playlist.length;            // secuencial con wrap al 0
  }
  function makeEl(id) {
    var el = new Audio("./assets/" + id + ".m4a");
    el.loop = false;                               // NO loop por pista: encadenamos con 'ended'
    el.muted = muted; el.volume = MUSIC_VOL; el._trackId = id;
    el.addEventListener("ended", playNext);        // al terminar una pista -> arranca la siguiente
    return el;
  }
  function playCurrent() {
    var id = playlist[idx] || "music";
    if (musicEl) { try { musicEl.pause(); musicEl.removeEventListener("ended", playNext); } catch (e) {} }
    musicEl = makeEl(id);
    musicEl.play().catch(() => {});
  }
  function playNext() {
    var curId = musicEl ? musicEl._trackId : (playlist[idx] || "music");
    rebuildPlaylist();                             // recoger compras recientes
    var cur = playlist.indexOf(curId); idx = cur >= 0 ? cur : 0;
    idx = nextIndex();
    playCurrent();
  }
  function ensure() {
    if (started) return; started = true;
    try {
      rebuildPlaylist();
      var eq = localStorage.getItem("cr93_track") || "music";
      var p = playlist.indexOf(eq); idx = p >= 0 ? p : 0;   // arrancar por la pista equipada
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (muted && ctx.suspend) ctx.suspend();
      playCurrent();                                        // primera pista (encadena al terminar)
    } catch (e) {}
  }
  // SWAP DE SOUNDTRACK EN VIVO (equipar desde la tienda): salta a la pista elegida y SIGUE la
  // playlist encadenada desde ahi (crossfade ~600ms, delta-time via rAF). RESPETA el mute.
  function setTrack(id) {
    if (!id || !started) return;            // antes del primer arranque, ensure() ya lee cr93_track
    if (musicEl && musicEl._trackId === id) return;
    try {
      rebuildPlaylist();
      var p = playlist.indexOf(id); if (p < 0) return;   // solo pistas en la playlist (poseidas)
      idx = p;
      var nu = makeEl(id);
      nu.volume = muted ? MUSIC_VOL : 0.0001;
      nu.play().catch(() => {});            // reproduce siempre (muteado o no), igual que ensure()
      var old = musicEl; musicEl = nu;
      cancelAnimationFrame(fadeRAF);
      if (muted) { if (old) { try { old.pause(); old.removeEventListener("ended", playNext); } catch (e) {} } return; }
      var t0 = performance.now(), DUR = 600, target = MUSIC_VOL;
      (function step(now){
        var k = Math.min(1, (now - t0) / DUR);
        nu.volume = target * k; if (old) old.volume = target * (1 - k);
        if (k < 1) { fadeRAF = requestAnimationFrame(step); }
        else if (old) { try { old.pause(); old.removeEventListener("ended", playNext); } catch (e) {} }
      })(performance.now());
    } catch (e) {}
  }
  function setShuffle(on) { shuffle = !!on; }     // flag interna secuencial<->aleatorio
  // VOLUMEN de la musica (slider de Ajustes): v01 en 0..1; usa el HTMLAudioElement YA presente
  // (no inventa pipeline). Persiste el nivel en MUSIC_VOL para las pistas encadenadas futuras.
  function setVolume(v01) {
    MUSIC_VOL = Math.max(0, Math.min(1, Number(v01) || 0));
    if (musicEl && !muted) musicEl.volume = MUSIC_VOL;
  }
  // SFX cortos de la tienda (compra/equip): one-shot via new Audio(); respeta mute.
  function sfx(name) {
    if (muted || !name) return;
    // SFX cortos viven como .mp3 (sfx_equip.mp3 / sfx_purchase.mp3): wire correcto de extension.
    try { var a = new Audio("./assets/" + name + ".mp3"); a.volume = 0.6; a.play().catch(() => {}); } catch (e) {}
  }
  function beep(freq, dur, type = "square", gain = 0.06) {
    if (!ctx || muted) return;
    if (ctx.state === "suspended" && ctx.resume) ctx.resume();   // por si quedó suspendido
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq; g.gain.value = gain;
    o.connect(g); g.connect(ctx.destination);
    const t = ctx.currentTime; o.start(t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.stop(t + dur);
  }
  function crash() {
    if (muted) return;
    // sin archivo de choque dedicado: sintetizamos el impacto con un beep grave (sin 404).
    beep(90, 0.4, "sawtooth", 0.12);
  }
  function setMuted(m) {
    muted = !!m;
    localStorage.setItem("cr93_muted", muted ? "1" : "0");      // PERSISTIR
    if (musicEl) musicEl.muted = muted;
    if (ctx) { if (muted) { ctx.suspend && ctx.suspend(); } else { ctx.resume && ctx.resume(); } }
  }
  return {
    start: ensure,
    near() { beep(880, 0.08, "square", 0.05); },
    ui() { beep(660, 0.06, "triangle", 0.06); },
    coin() { beep(1318, 0.06, "square", 0.05); beep(1760, 0.07, "square", 0.04); },
    crash, setMuted, setTrack, sfx, setShuffle, setVolume,
    get muted() { return muted; },
    get volume() { return MUSIC_VOL; },
  };
})();

// ----------------------------- SKIN EQUIPADA (tint de la moto) --------------
// La skin equipada (cr93_skin) tinta el material de la moto al iniciar cada run.
// Es cosmetico: NO altera la fisica ni el RNG. La skin base usa el arte existente.
// SKIN_TINT = color EMISSIVE (glow neon) por skin; SKIN_BODY = color de CARROCERIA (albedo).
// Juntas dan las 3 variantes synthwave de DOS TONOS: MAGENTA-CIAN, NARANJA-VIOLETA, VERDE-AZUL.
// Reutiliza el mecanismo de tint existente (cosmetico: NO toca geometria, colisiones ni el env map PM).
const SKIN_TINT = {
  skin_default: null,                        // arte original, sin tint
  skin_cyan:    new THREE.Color(0x2bb8ff),   // AZUL ELECTRICO: glow azul brillante (repintada)
  skin_magenta: new THREE.Color(0xff2d95),
  skin_gold:    new THREE.Color(0xffe85c),
  skin_violet:  new THREE.Color(0xb026ff),   // cuerpo naranja + glow violeta -> NARANJA-VIOLETA
  skin_aqua:    new THREE.Color(0x22e1ff),   // cuerpo verde + glow azul      -> VERDE-AZUL
};
const SKIN_BODY = {
  skin_default: null,                        // albedo original (sin tinte de carroceria)
  skin_cyan:    new THREE.Color(0x1e5bff),   // AZUL ELECTRICO: carroceria azul intenso (repintada)
  skin_magenta: new THREE.Color(0xff2d95),
  skin_gold:    new THREE.Color(0xffae00),
  skin_violet:  new THREE.Color(0xff7a00),
  skin_aqua:    new THREE.Color(0x39ff88),
};
function applyEquippedSkin() {
  const id = localStorage.getItem("cr93_skin") || "skin_default";
  const tint = SKIN_TINT[id];
  const body = SKIN_BODY[id];
  bikeOrient.traverse((o) => {
    if (o.isMesh && o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => {
        if (!m.userData) m.userData = {};
        // backup UNA sola vez de los valores ORIGINALES (para poder volver a la skin base)
        if (m.userData._baseEmissive === undefined && m.emissive) m.userData._baseEmissive = m.emissive.getHex();
        if (m.userData._baseColor === undefined && m.color) m.userData._baseColor = m.color.getHex();
        // EMISSIVE = glow neon synthwave
        if (m.emissive) {
          if (tint) { m.emissive.copy(tint); m.emissiveIntensity = Math.max(m.emissiveIntensity || 0.5, 0.7); }
          else if (m.userData._baseEmissive !== undefined) { m.emissive.setHex(m.userData._baseEmissive); }
        }
        // ALBEDO (carroceria) = hace MUY visible el cambio de skin en vivo
        if (m.color) {
          if (body) { m.color.copy(body); }
          else if (m.userData._baseColor !== undefined) { m.color.setHex(m.userData._baseColor); }
        }
        m.needsUpdate = true;
      });
    }
  });
}
// ----------------------------- MODELO 3D POR SKIN (lazy + cache) ------------
// ITER 2: cada skin de COLOR tiene su PROPIO GLB (color horneado en la textura, generado con
// Higgsfield image_to_3d desde su render). La base (skin_default) usa moto_hi.glb. Carga
// PEREZOSA: solo se baja el GLB de la skin equipada y se CACHEA para swaps instantaneos. Si un
// GLB falla/no existe -> fallback LIMPIO a moto_hi.glb + el tint cosmetico (applyEquippedSkin).
// Los GLB dedicados NO se tintan (ya vienen con su color); solo el fallback moto_hi se tinta.
const SKIN_GLB = {
  skin_default: null,                          // base -> moto_hi.glb (sin tint extra)
  skin_cyan:    "./assets/skins/azul.glb",     // AZUL ELECTRICO
  skin_magenta: "./assets/skins/magenta.glb",  // MAGENTA HEAT
  skin_gold:    "./assets/skins/oro.glb",      // ORO BUSTER
  skin_violet:  "./assets/skins/violeta.glb",  // VIOLETA NOVA
  skin_aqua:    "./assets/skins/aqua.glb",     // AQUA GRID
};
const MOTO_HI = "./assets/moto_hi.glb";
const _modelCache = {};   // path -> Object3D (ya normalizado por frameBike)
let _modelToken = 0;      // una carga lenta NO debe pisar una eleccion mas nueva
function _clearBikeOrient() { for (let i = bikeOrient.children.length - 1; i >= 0; i--) bikeOrient.remove(bikeOrient.children[i]); }
function _resetTint(root) {  // dedicado: volver al color HORNEADO (por si applyEquippedSkin lo tinto antes)
  root.traverse((o) => {
    if (o.isMesh && o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => {
        if (m.userData && m.userData._baseColor !== undefined && m.color) m.color.setHex(m.userData._baseColor);
        if (m.userData && m.userData._baseEmissive !== undefined && m.emissive) m.emissive.setHex(m.userData._baseEmissive);
        if (m) m.needsUpdate = true;
      });
    }
  });
}
function _vibrantizeDedicated(root) {
  // En la escena nocturna un material METALICO refleja el env oscuro y se ve NEGRO (le pasaba al
  // oro). Para que el color HORNEADO de cada skin SIEMPRE lea: bajo el metalness y agrego un
  // emissive suave del propio albedo (glow synthwave). Cosmetico; no toca geometria ni colisiones.
  root.traverse((o) => {
    if (o.isMesh && o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => {
        if (m.metalness !== undefined) m.metalness = Math.min(m.metalness, 0.4);
        if (m.emissive && m.color) { m.emissive.copy(m.color).multiplyScalar(0.28); m.emissiveIntensity = Math.max(m.emissiveIntensity || 0, 0.32); }
        m.needsUpdate = true;
      });
    }
  });
}
function _mount(obj, dedicated) {
  _clearBikeOrient(); bikeOrient.add(obj); bikeReady = true;
  if (dedicated) { _resetTint(obj); _vibrantizeDedicated(obj); } else applyEquippedSkin();   // dedicado=color horneado; base=tint
}
// Carga (o reusa de cache) el GLB de la skin dada y lo monta en la moto. Devuelve Promise.
function setBikeModel(skinId) {
  skinId = skinId || (localStorage.getItem("cr93_skin") || "skin_default");
  const path = SKIN_GLB[skinId] || MOTO_HI;
  const dedicated = !!SKIN_GLB[skinId];
  const tok = ++_modelToken;
  if (_modelCache[path]) { _mount(_modelCache[path], dedicated); return Promise.resolve("cache"); }
  return new Promise((resolve) => {
    new GLTFLoader().load(path,
      (gltf) => { if (tok !== _modelToken) return resolve("stale"); const m = frameBike(gltf.scene); _modelCache[path] = m; _mount(m, dedicated); resolve("glb"); },
      (ev) => { if (ev.total) dom.loadingfill.style.width = Math.round(ev.loaded / ev.total * 90) + "%"; },
      (err) => {  // el GLB de la skin no resolvio -> fallback a moto_hi + tint (nunca rompe)
        console.warn("[CafeRacer93] GLB de", skinId, "fallo -> fallback moto_hi:", err && err.message);
        if (tok !== _modelToken) return resolve("stale");
        if (_modelCache[MOTO_HI]) { _mount(_modelCache[MOTO_HI], false); return resolve("fallback"); }
        new GLTFLoader().load(MOTO_HI,
          (g) => { const m = frameBike(g.scene); _modelCache[MOTO_HI] = m; _mount(m, false); resolve("fallback"); },
          null,
          () => { _clearBikeOrient(); bikeOrient.add(buildProceduralBike()); bikeReady = true; applyEquippedSkin(); resolve("procedural"); });
      });
  });
}

// VERIFICACION MINIMA (PASO 5): confirmar que existen >=3 variantes de skin con tint y que el
// mecanismo de aplicacion esta cableado. Log explicito para el smoke/eyes; jamas rompe el arranque.
(function verifySkinVariants(){
  const variantIds = Object.keys(SKIN_TINT).filter((k) => k !== "skin_default" && SKIN_TINT[k]);
  const ok = variantIds.length >= 3 && typeof applyEquippedSkin === "function";
  console.log("[CafeRacer93] skins:", variantIds.length, "variantes tint ->", ok ? "OK" : "FALTAN", variantIds.join(","));
  if (!ok) console.warn("[CafeRacer93] se esperaban >=3 variantes de skin con tint");
  window.__CR93_SKIN_VARIANTS = variantIds;   // expuesto para asercion externa
})();

// ----------------------------- SWATCHES DE SKIN (pantalla de inicio) --------
// Selector rapido de las 3 variantes synthwave desde el menu, con PREVIEW EN VIVO sobre la
// moto del turntable. Persiste la eleccion en cr93_skin. Respeta la economia de la tienda:
// una skin NO comprada aparece bloqueada y, al click, abre la TIENDA para comprarla.
// Los DOS avatares destacados del inicio (skins existentes, NINGUNO es el base gratis):
// MAGENTA HEAT + AZUL ELECTRICO (esta ultima = skin_cyan repintada). El resto de skins
// siguen disponibles en la TIENDA; este selector rapido del menu muestra estos dos.
const SWATCH_SET = [
  { id: "skin_magenta", sw: "#ff2d95", label: "MAGENTA HEAT" },
  { id: "skin_cyan",    sw: "#1e5bff", label: "AZUL ELECTRICO" },
];
function ownedSkins() {
  try { const a = JSON.parse(localStorage.getItem("cr93_owned_skins") || "[]"); return Array.isArray(a) ? a : []; }
  catch (e) { return []; }
}
function skinOwned(id) { return id === "skin_default" || ownedSkins().indexOf(id) >= 0; }
// FEATURE: los dos avatares destacados (MAGENTA HEAT + AZUL ELECTRICO) quedan disponibles y
// uno equipado en el PRIMER arranque, para que el render mostrado NO sea la moto base gratis.
// Solo siembra una vez (flag cr93_avatars_seed); no pisa elecciones/compras posteriores del usuario.
(function featureTwoAvatars() {
  try {
    if (localStorage.getItem("cr93_avatars_seed") === "1") return;
    const FEATURED = ["skin_magenta", "skin_cyan"];
    const owned = ownedSkins();
    for (const id of FEATURED) if (owned.indexOf(id) < 0) owned.push(id);
    localStorage.setItem("cr93_owned_skins", JSON.stringify(owned));
    const eq = localStorage.getItem("cr93_skin");
    if (!eq || eq === "skin_default") localStorage.setItem("cr93_skin", "skin_magenta");
    localStorage.setItem("cr93_avatars_seed", "1");
  } catch (e) { /* localStorage no disponible: el juego sigue con la base */ }
})();
function buildSkinSwatches() {
  const host = $("skin-swatches"); if (!host) return;
  const eq = localStorage.getItem("cr93_skin") || "skin_default";
  host.innerHTML = "";
  for (const s of SWATCH_SET) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "skin-sw" + (skinOwned(s.id) ? "" : " locked");
    b.style.setProperty("--sw", s.sw);
    b.title = s.label; b.setAttribute("aria-label", s.label);
    b.setAttribute("aria-pressed", String(s.id === eq));
    b.onclick = () => {
      if (!skinOwned(s.id)) {                       // skin bloqueada -> ir a la tienda a comprarla
        audio.ui(); const open = $("btn-shop-open"); if (open) open.click(); return;
      }
      localStorage.setItem("cr93_skin", s.id);      // persistir eleccion
      setBikeModel(s.id);                           // PREVIEW EN VIVO: carga el GLB propio de la skin
      audio.sfx("sfx_equip"); audio.ui();
      buildSkinSwatches();                          // refrescar estado (aria-pressed)
    };
    host.appendChild(b);
  }
}
buildSkinSwatches();
// Resincronizar swatches cuando la TIENDA compra/equipa una skin (ownership + equipado).
addEventListener("cr93-equip", (e) => { if (e && e.detail && e.detail.key === "cr93_skin") buildSkinSwatches(); });
// Reaccionar al equipar/comprar desde la tienda (evento de la logica inline):
//  - skin  -> re-aplicar tint cosmetico a la moto (sin tocar geometria/colisiones/fisica)
//  - track -> swap del soundtrack activo (crossfade), respetando el mute persistente
//  - SFX de feedback: compra (sfx_purchase) vs equip (sfx_equip)
addEventListener("cr93-equip", (e) => {
  if (!e.detail) return;
  if (e.detail.key === "cr93_skin") setBikeModel(e.detail.id);
  else if (e.detail.key === "cr93_track") audio.setTrack(e.detail.id);
  audio.sfx(e.detail.purchased ? "sfx_purchase" : "sfx_equip");
});

// ----------------------------- CATÁLOGO DE SOUNDTRACKS (tienda) -------------
// Declarado para la tienda: la base 'music.m4a' YA viene desbloqueada (owned) y se
// reproduce como ahora; los 5 tracks track_01..track_05 (assets/<id>.m4a) los genera
// el pipeline determinista a partir del assets_manifest y se compran/equipan en la
// iteración 2 (shop UI). Esto es solo DATO inerte: no altera el arranque ni el audio.
const SOUNDTRACKS = [
  { id: "music",    label: "NEON BASE",       src: "./assets/music.m4a",    price: 0,   owned: true },
  { id: "track_01", label: "NIGHT DRIVE",     src: "./assets/track_01.m4a", price: 50,  owned: false },
  { id: "track_02", label: "MIDNIGHT CRUISE", src: "./assets/track_02.m4a", price: 75,  owned: false },
  { id: "track_03", label: "OUTRUN CHASE",    src: "./assets/track_03.m4a", price: 100, owned: false },
  { id: "track_04", label: "SUNSET DREAM",    src: "./assets/track_04.m4a", price: 125, owned: false },
  { id: "track_05", label: "TURBO BOOST",     src: "./assets/track_05.m4a", price: 150, owned: false },
];
// Rehidratar el botón con el estado persistido ANTES del primer input del usuario.
dom.mute.textContent = audio.muted ? "🔇" : "♪";
dom.mute.setAttribute("aria-pressed", String(audio.muted));
dom.mute.onclick = () => {
  audio.setMuted(!audio.muted);
  dom.mute.textContent = audio.muted ? "🔇" : "♪";
  dom.mute.setAttribute("aria-pressed", String(audio.muted));
};

// ----------------------------- INPUT ----------------------------------------
const BIND = { ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right",
               ArrowUp: "boost", KeyW: "boost", ArrowDown: "brake", KeyS: "brake",
               Space: "confirm", Enter: "confirm", KeyP: "pause", Escape: "pause" };
const held = new Set();
const pressed = new Set(); // edge (una vez por pulsación)
addEventListener("keydown", (e) => {
  const c = BIND[e.code]; if (!c) return;
  if (!held.has(c)) pressed.add(c);
  held.add(c);
  if (["left","right","boost","brake","confirm","pause"].includes(c)) e.preventDefault();
});
addEventListener("keyup", (e) => { const c = BIND[e.code]; if (c) held.delete(c); });

// ----------------------------- SALTO: control (edge inmediato) --------------
// Constantes del arco de salto (arcade): gravedad fuerte y un impulso inicial visible.
// La fisica se integra por delta-time dentro de update() a 60fps (sin setInterval).
const JUMP = { g: -52, impulse: 19 };    // g (u/s^2, negativa) e IMPULSO_INICIAL (u/s)
let jumpQueued = false;                  // edge de salto consumido por update() en el paso fijo
function requestJump() { if (state === "playing" && !G.enElAire) jumpQueued = true; }
addEventListener("keydown", (e) => {
  // Espacio o Flecha-arriba: salto con respuesta inmediata (ignora el auto-repeat del SO).
  if ((e.code === "Space" || e.code === "ArrowUp") && !e.repeat) requestJump();
});

// touch: mitad izq/der mueve carril; tap confirma en menús
let touchSteer = 0;
addEventListener("touchstart", (e) => {
  for (const t of e.changedTouches) {
    if (state === "playing") {
      const cx = innerWidth / 2, band = innerWidth * 0.14;
      if (Math.abs(t.clientX - cx) < band) { requestJump(); }   // tap central = salto
      else { touchSteer = t.clientX < cx ? -1 : 1; pressed.add(touchSteer < 0 ? "left" : "right"); }
    } else pressed.add("confirm");
  }
  e.preventDefault();
}, { passive: false });
addEventListener("touchend", (e) => { touchSteer = 0; e.preventDefault(); }, { passive: false });

let padPrev = {};
function pollPad() {
  const out = { held: new Set(), pressed: new Set() };
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const gp of pads) {
    if (!gp) continue;
    const ax = gp.axes[0] || 0;
    if (ax < -0.4) out.held.add("left"); if (ax > 0.4) out.held.add("right");
    const map = { 14: "left", 15: "right", 12: "boost", 13: "brake", 0: "confirm", 9: "pause" };
    gp.buttons.forEach((b, i) => {
      const c = map[i]; if (!c) return;
      if (b.pressed) { out.held.add(c); if (!padPrev[i]) out.pressed.add(c); }
      padPrev[i] = b.pressed;
    });
    if (gp.axes[0] !== undefined) { // edge para ejes
      if (ax < -0.4 && !padPrev.axl) out.pressed.add("left"); padPrev.axl = ax < -0.4;
      if (ax > 0.4 && !padPrev.axr) out.pressed.add("right"); padPrev.axr = ax > 0.4;
    }
  }
  return out;
}

// ----------------------------- ESTADO DEL JUEGO -----------------------------
let state = "menu"; // menu | playing | paused | over
const best = { v: Number(localStorage.getItem("cr93_best") || 0) };
dom.best.textContent = Math.round(best.v);
const G = {
  lane: 2, x: 0, targetX: 0,
  speed: CFG.speedStart, baseSpeed: CFG.speedStart,
  dist: 0, score: 0, mult: 1, comboT: 0,
  spawnT: 0, coinT: 0, time: 0, lean: 0, shake: 0,
  busters: 0,
  // --- Salto: estado vertical de la moto (fisica por delta-time) ---
  y: 0, vy: 0, enElAire: false, prevY: 0,
  // Interpolación de render (timestep fijo): prev/curr de la moto para alpha-lerp
  prevX: 0, prevLean: 0, prevPitch: 0, pitch: 0,
  // --- Sistema de monedas (busters) y bonificaciones: cimientos en memoria ---
  coins: 0,              // busters recogidas en la partida actual
  bonusMultiplier: 1,    // multiplicador de bonificación al recoger busters
  bonusT: 0,             // ventana de decay del multiplicador de bonificación
  // Totales persistidos (frontend, sin backend) leídos con parseo numérico seguro
  bustersTotal: Number(localStorage.getItem("busters_total")) || 0,
  bustersBest: Number(localStorage.getItem("busters_best")) || 0,
};
// Si los totales aún no existían en localStorage, inicializarlos en 0 (cimientos de persistencia)
if (localStorage.getItem("busters_total") === null) localStorage.setItem("busters_total", String(G.bustersTotal));
if (localStorage.getItem("busters_best") === null) localStorage.setItem("busters_best", String(G.bustersBest));

function showScreen(name) {
  for (const s of [dom.start, dom.load, dom.pause, dom.over]) s.classList.add("hidden");
  if (name) ({ start: dom.start, load: dom.load, pause: dom.pause, over: dom.over })[name].classList.remove("hidden");
}

function resetRun() {
  rng = mulberry32(0xC0FFEE ^ (Date.now() & 0xffff));
  for (const c of activeCars.slice()) freeCar(c);
  G.lane = (CFG.laneCount - 1) >> 1; G.x = LANES[G.lane]; G.targetX = G.x;
  G.speed = CFG.speedStart; G.baseSpeed = CFG.speedStart;
  G.dist = 0; G.score = 0; G.mult = 1; G.comboT = 0; G.spawnT = 0.6; G.coinT = 1.0; G.time = 0; G.lean = 0; G.shake = 0;
  G.busters = 0; G.coins = 0; G.bonusMultiplier = 1; G.bonusT = 0;
  G.prevX = G.x; G.lean = 0; G.prevLean = 0; G.pitch = 0; G.prevPitch = 0;
  G.y = 0; G.vy = 0; G.enElAire = false; G.prevY = 0;
  hudLast.score = hudLast.dist = hudLast.speed = hudLast.busters = hudLast.recordHoy = -1; hudLast.mult = "";
  if (dom.busters) dom.busters.textContent = "0";
  refreshRecordHoy();
  for (const c of activeCoins.slice()) freeCoin(c);
  for (const c of activeBlueCoins.slice()) freeBlueCoin(c);   // limpiar monedas azules al reiniciar el run
  blueCoinT = 2.4;                                            // reset del timer de spawn de azules
  for (const r of activeRamps.slice()) freeRamp(r);   // limpiar rampas activas al reiniciar el run
  bike.position.set(G.x, 0, 0);
  bikePivot.rotation.set(0, 0, 0); // deshace el turntable del menú
}

function startRun() {
  // Resync de la billetera (busters_total) desde localStorage: las compras de la TIENDA
  // ocurren en el menu / game-over y descuentan saldo. Sin esto, persistBusters al final del
  // run reescribiria busters_total con un total en memoria viejo y "devolveria" lo gastado.
  G.bustersTotal = Number(localStorage.getItem("busters_total")) || 0;
  resetRun();
  setBikeModel();                      // montar el GLB propio de la skin equipada (lazy+cache; cae a moto_hi+tint)
  applyAbility(abilityForSelectedMoto());  // habilidad unica de la moto leida de localStorage (iter 1)
  state = "playing"; showScreen(null); dom.hud.classList.remove("hidden");
  audio.start(); audio.ui();
}

function gameOver() {
  state = "over";
  audio.crash();
  const sc = Math.round(G.score);
  let nb = false;
  if (sc > best.v) { best.v = sc; localStorage.setItem("cr93_best", String(sc)); nb = true; }
  dom.overScore.textContent = sc;
  dom.overBest.textContent = Math.round(best.v);
  dom.best.textContent = Math.round(best.v);
  persistBusters();                 // asegurar totales de busters persistidos al cerrar el run
  if (dom.overBusters) dom.overBusters.textContent = G.coins;
  dom.newbest.classList.toggle("hidden", !nb);
  showScreen("over"); dom.hud.classList.add("hidden");
}

dom.btnStart.onclick = () => startRun();
dom.btnRetry.onclick = () => startRun();

// ----------------------------- VOLVER AL MENÚ (Game Over) -------------------
// Botón synthwave que devuelve de la pantalla de Game Over a la de INICIO SIN recargar
// la página. Reutiliza resetRun() (el MISMO reset del reinicio rápido) y deja state="menu",
// de modo que render() reactiva por sí solo el turntable de la moto (requestAnimationFrame,
// NUNCA setInterval). NO rompe el reinicio rápido: btn-retry sigue llamando startRun().
function backToMenu() {
  resetRun();                          // mismo reset que usa el reinicio rápido
  state = "menu";                      // estado global del run -> 'menu'
  dom.hud.classList.add("hidden");     // ocultar HUD del juego
  showScreen("start");                 // ocultar #screen-over y mostrar #screen-start
  buildSkinSwatches();                 // resync de swatches del menú
  audio.ui();
}
// Crear el botón #btn-menu DENTRO de #screen-over (sin tocar index.html, mismo patrón que el
// modal de Ajustes / la sombra ya construidos por JS), con el MISMO lenguaje visual synthwave
// del botón de reinicio (hereda su className + glow CSS). Defensivo: no rompe el arranque.
(function injectBackToMenuButton(){
  if (!dom.over || document.getElementById("btn-menu")) return;
  const css = document.createElement("style");
  css.textContent = "#btn-menu{margin-top:12px;}";
  document.head.appendChild(css);
  const btn = document.createElement("button");
  btn.id = "btn-menu";
  btn.type = "button";
  btn.className = (dom.btnRetry && dom.btnRetry.className) || "";   // mismo estilo neón que el reinicio
  btn.textContent = (STR && STR.backToMenu) || "VOLVER AL MENÚ";
  if (dom.btnRetry && dom.btnRetry.parentNode) {                   // mismo grupo visual, debajo de RETRY
    dom.btnRetry.parentNode.insertBefore(btn, dom.btnRetry.nextSibling);
  } else {
    dom.over.appendChild(btn);
  }
  btn.addEventListener("click", () => backToMenu());
  dom.btnMenu = btn;
})();

// ----------------------------- SPAWN DE TRÁFICO -----------------------------
function spawnWave() {
  // dificultad 0..1
  const diff = Math.min(1, G.time / 70);
  const nCars = 1 + (rng() < (0.35 + diff * 0.5) ? 1 : 0) + (rng() < diff * 0.35 ? 1 : 0);
  // elegir carriles dejando SIEMPRE al menos un hueco alcanzable
  const lanesIdx = [...Array(CFG.laneCount).keys()];
  for (let i = lanesIdx.length - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0; [lanesIdx[i], lanesIdx[j]] = [lanesIdx[j], lanesIdx[i]]; }
  const blocked = Math.min(nCars, CFG.laneCount - 1);
  const occupied = lanesIdx.slice(0, blocked);   // carriles bloqueados esta tanda
  const freeLanes = lanesIdx.slice(blocked);     // carriles libres (siempre >= 1)
  // ¿esta tanda trae un BUS? La probabilidad crece con la dificultad. Usa el MISMO rng()
  // sembrado (determinismo intacto, sin Math.random). El bus es MÁS ANCHO: solo se ubica en
  // un carril que deje un hueco lateral pasable -> hay >= 2 carriles libres, o existe un
  // libre NO adyacente al del bus. Si ningún carril cumple, la tanda queda solo de autos.
  let busLane = -1;
  if (rng() < (0.12 + diff * 0.33) && occupied.length > 0) {
    for (const cand of occupied) {
      const reachable = freeLanes.length >= 2 || freeLanes.some((f) => Math.abs(f - cand) >= 2);
      if (reachable) { busLane = cand; break; }
    }
  }
  for (let k = 0; k < blocked; k++) {
    const li = lanesIdx[k];
    if (li === busLane) {
      const b = getBus();
      b.position.set(LANES[li], 0, -150 - rng() * 25);   // más lejos: el bus es ~1.8x más largo
      b.userData.lane = li; b.userData.scored = false;
    } else {
      const c = getCar();
      c.position.set(LANES[li], 0, -135 - rng() * 25);
      c.userData.lane = li; c.userData.scored = false;
    }
  }
  // RAMPA (iter 1, solo visibilidad): cableada al MISMO scheduler de tráfico. Se ubica en un
  // carril LIBRE (no pisa autos/buses) usando el rng() sembrado (determinismo intacto) y
  // loguea su z de spawn. El trigger de salto se implementa en iteraciones siguientes.
  if (rng() < 0.55 && freeLanes.length > 0) {
    const rl = freeLanes[(rng() * freeLanes.length) | 0];
    const rmp = getRamp();
    const rz = -150 - rng() * 28;
    rmp.position.set(LANES[rl], 0, rz);
    rmp.userData.lane = rl; rmp.userData.type = "ramp"; rmp.userData.triggered = false;
    console.log("ramp spawn @z=" + rz.toFixed(1) + " lane=" + rl);
  }
}

// ----------------------------- SIMULACIÓN -----------------------------------
function update(dtMs) {
  const dt = dtMs / 1000;

  // entrada de gamepad (edge + held) integrada con teclado/touch
  const pad = pollPad();
  const isHeld = (c) => held.has(c) || pad.held.has(c);
  const took = (c) => { const p = pressed.has(c) || pad.pressed.has(c); return p; };

  if (state === "menu") {
    if (took("confirm")) startRun();
    pressed.clear(); return;
  }
  if (state === "paused") {
    if (took("pause") || took("confirm")) { state = "playing"; showScreen(null); dom.hud.classList.remove("hidden"); }
    pressed.clear(); return;
  }
  if (state === "over") {
    if (took("confirm")) startRun();
    pressed.clear(); return;
  }
  // ---- playing ----
  // Si la TIENDA esta abierta (overlay inline), congelar la simulacion: no procesar inputs
  // del juego mientras el modal esta visible. El loop de render sigue vivo; al cerrar se reanuda.
  if (window.__CR93_SHOP_OPEN) { pressed.clear(); return; }
  if (took("pause")) { state = "paused"; showScreen("pause"); pressed.clear(); return; }

  G.time += dt;

  // snapshot del estado anterior de la moto para interpolar en render (alpha)
  G.prevX = G.x; G.prevLean = G.lean; G.prevPitch = G.pitch; G.prevY = G.y;

  // cambio de carril (edge)
  if (took("left")) { G.lane = Math.max(0, G.lane - 1); audio.ui(); }
  if (took("right")) { G.lane = Math.min(CFG.laneCount - 1, G.lane + 1); audio.ui(); }
  G.targetX = LANES[G.lane];
  const prevX = G.x;
  G.x += (G.targetX - G.x) * Math.min(1, CFG.laneLerp * dt);
  const vx = (G.x - prevX) / Math.max(dt, 1e-4);
  G.lean = THREE.MathUtils.lerp(G.lean, THREE.MathUtils.clamp(-vx * 0.06, -0.5, 0.5), Math.min(1, 10 * dt));

  // velocidad: rampa + boost/freno
  G.baseSpeed = Math.min(CFG.speedMax, CFG.speedStart + G.time * CFG.speedRamp);
  let target = G.baseSpeed;
  if (isHeld("boost")) target = Math.min(CFG.speedMax * 1.12, G.baseSpeed * CFG.boost);
  if (isHeld("brake")) target = G.baseSpeed * CFG.brake;
  G.speed += (target - G.speed) * Math.min(1, 3 * dt);

  const move = G.speed * dt;
  G.dist += move;

  // scroll del mundo (shaders + props)
  gridUniforms.uScroll.value += move;
  for (const p of pylons) { p.position.z += move; if (p.position.z > CFG.camBack + 4) p.position.z -= p.userData.span; }
  for (const d of dashes) { d.position.z += move; if (d.position.z > CFG.camBack + 4) d.position.z -= d.userData.span; }

  // tráfico
  G.spawnT -= dt;
  const diff = Math.min(1, G.time / 70);
  const interval = CFG.spawnStart - (CFG.spawnStart - CFG.spawnMin) * diff;
  if (G.spawnT <= 0) { spawnWave(); G.spawnT = interval * (0.75 + rng() * 0.5); }

  // busters (monedas) + bonificaciones
  G.coinT -= dt;
  if (G.coinT <= 0) { spawnBusters(); G.coinT = 1.6 + rng() * 1.6; }
  for (const coin of activeCoins.slice()) {
    coin.position.z += move;
    coin.rotation.y += dt * 4.2;              // giro brillante
    const cdx = coin.position.x - G.x, cdz = coin.position.z;
    // AABB PROPIA moto-vs-buster (independiente de la de autos): recoger NO termina la
    // partida, solo desactiva la moneda y la devuelve al pool.
    if (!coin.userData.taken && Math.abs(cdz) < 1.9 && Math.abs(cdx) < 1.35) {
      coin.userData.taken = true;
      collectBuster();                        // coins/score/bonusMultiplier + persistencia
      freeCoin(coin); continue;
    }
    if (coin.position.z > CFG.camBack + 8) freeCoin(coin);
  }

  // MONEDAS AZULES (flotantes, valen 5): spawner SEPARADO, MISMO scroll/delta-time del mundo.
  // Solo se recolectan DURANTE un salto (G.enElAire, normal o por rampa) -> +5, persistencia y audio.coin().
  blueCoinT -= dt;
  if (blueCoinT <= 0) { spawnBlueCoins(); blueCoinT = 2.6 + rng() * 2.4; }
  for (const bcoin of activeBlueCoins.slice()) {
    bcoin.position.z += move;                                   // mismo scroll del mundo
    bcoin.rotation.y += dt * 4.2;                              // giro brillante
    bcoin.position.y = BLUE_COIN_Y + Math.sin((G.time * 2.2) + bcoin.position.z * 0.12) * 0.16;  // flotación sutil
    const bdx = bcoin.position.x - G.x, bdz = bcoin.position.z, bdy = bcoin.position.y - G.y;
    // Colisión SOLO válida durante un salto (normal o por rampa): exige G.enElAire.
    if (!bcoin.userData.taken && G.enElAire && Math.abs(bdz) < 1.9 && Math.abs(bdx) < 1.4 && Math.abs(bdy) < 1.25) {
      bcoin.userData.taken = true;
      collectBlueCoin();                                        // +5 al contador, persiste y audio.coin()
      freeBlueCoin(bcoin); continue;
    }
    if (bcoin.position.z > CFG.camBack + 8) freeBlueCoin(bcoin);
  }

  // RAMPAS (iter 2): scrollean con el MISMO 'move' del mundo (misma velocidad de scroll que el
  // tráfico) y se reciclan al pasar la cámara. AHORA con TRIGGER DE SALTO: cuando la z de una
  // rampa activa cruza la posición de la moto (z=0) Y coincide el carril, encola el salto
  // parabólico (lo consume la física vertical de delta-time más abajo, sin setInterval).
  for (const rmp of activeRamps.slice()) {
    const prevZ = rmp.position.z;
    rmp.position.z += move;
    // cruce de la moto (z=0) en el MISMO carril (o solape en X como respaldo) -> dispara el salto
    if (!rmp.userData.triggered && prevZ < 0 && rmp.position.z >= 0 &&
        (rmp.userData.lane === G.lane || Math.abs(rmp.position.x - G.x) < RAMP.w * 0.7)) {
      rmp.userData.triggered = true;
      console.log("ramp trigger lane=" + rmp.userData.lane + " @z=" + rmp.position.z.toFixed(1));
      if (!G.enElAire) jumpQueued = true;   // encola el impulso (lo aplica la física de salto)
    }
    if (rmp.position.z > CFG.camBack + 8) freeRamp(rmp);
  }

  // Habilidades defensivas: 'Invencible' (escudo neon 15s) y la gracia de 'Vida Extra'
  // hacen que la deteccion de colision con trafico devuelva SIN impacto (early-return logico).
  const nowMs = performance.now();
  const shielded = nowMs < invincibleUntil || nowMs < graceUntil;
  let crashed = false;
  for (const c of activeCars.slice()) {
    c.position.z += move; // los autos/buses vienen hacia el jugador
    const dz = c.position.z - 0, dx = c.position.x - G.x;
    // Colisión AABB POR OBSTÁCULO: half-extent (hx/hz) leído de userData + half de la moto.
    const hz = (c.userData.hz || 1.7) + BIKE_HALF.z;
    const hx = (c.userData.hx || 1.0) + BIKE_HALF.x;
    // Colisión consciente de la ALTURA: si la moto va por ENCIMA del techo (saltando o ya
    // apoyada sobre el bus), NO choca — el techo es superficie de aterrizaje (encadenar saltos).
    const topY = c.userData.topY || 1.5;
    if (!shielded && Math.abs(dz) < hz && Math.abs(dx) < hx && G.y < topY - 0.2) { crashed = true; }
    // casi-choque: pasó al lado sin chocar
    if (!c.userData.scored && c.position.z > 1.5) {
      c.userData.scored = true;
      if (Math.abs(dx) < CFG.nearHalfX) {
        G.mult = Math.min(9.9, G.mult + 0.3); G.comboT = 2.2;
        G.score += CFG.nearBonus * G.mult; G.shake = 0.25; audio.near();
        refreshMult(true);                  // bonus/combo: refrescar multiplicador + pulse synthwave
      }
    }
    if (c.position.z > CFG.camBack + 8) freeCar(c);
  }

  // combo decae
  G.comboT -= dt; if (G.comboT <= 0) { G.mult = Math.max(1, G.mult - dt * 0.6); }

  // decay del multiplicador de bonificación de busters (vuelve a 1 si dejás de juntar)
  G.bonusT -= dt; if (G.bonusT <= 0) { G.bonusMultiplier = Math.max(1, G.bonusMultiplier - dt * 0.5); }

  // puntaje por distancia
  G.score += move * CFG.scoreDistK * G.mult;

  // estado actual de la moto: se aplica al objeto 3D en render(alpha), interpolado.
  G.pitch = (G.speed > G.baseSpeed) ? -0.04 : 0; // leve cabeceo al acelerar

  // --- SALTO: fisica vertical por delta-time (gravedad + impulso, 60fps via rAF) ---
  // PISO DINÁMICO: si la moto está sobre el footprint de un bus/auto, el TECHO de ese obstáculo
  // (userData.topY) actúa como superficie de aterrizaje. Con el bus ~1.8x más largo (hz=6.0) ese
  // techo es una pista larga para aterrizar y ENCADENAR saltos a lo largo del nuevo Z.
  let floorY = 0;
  for (const c of activeCars) {
    const topY = c.userData.topY || 0;
    if (topY <= 0) continue;
    const fdx = c.position.x - G.x;
    const fhz = (c.userData.hz || 1.7);
    const fhx = (c.userData.hx || 1.0) + BIKE_HALF.x;
    if (Math.abs(c.position.z) < fhz && Math.abs(fdx) < fhx && topY > floorY) floorY = topY;
  }
  // Edge de salto (Espacio/Flecha-arriba o tap central) consumido aqui: impulso SOLO si pisa suelo/techo.
  if (jumpQueued && !G.enElAire) { G.enElAire = true; G.vy = JUMP.impulse; audio.ui(); console.log("bike jump vy=" + JUMP.impulse.toFixed(1)); }
  jumpQueued = false;
  if (G.enElAire) {
    G.vy += JUMP.g * dt;     // gravedad arcade (g negativa) integrada por delta-time
    G.y  += G.vy * dt;       // integrar la posicion vertical de la moto
    if (G.vy <= 0 && G.y <= floorY) { G.y = floorY; G.vy = 0; G.enElAire = false; }   // aterriza en suelo o techo
  } else if (G.y > floorY + 0.001) {
    G.enElAire = true; G.vy = 0;   // el techo que la sostenía se alejó -> empieza a caer
  } else if (G.y !== floorY) {
    G.y = floorY;                  // pegada al piso/techo actual
  }

  G.shake = Math.max(0, G.shake - dt);

  if (crashed) {
    // 'Vida Extra': absorber el PRIMER choque y REANUDAR desde el impacto (conserva estado).
    if (extraLifeAvail && !extraLifeUsed) {
      extraLifeUsed = true;
      graceUntil = performance.now() + GRACE_MS;   // gracia ~1s: no re-chocar el mismo objeto
      triggerExtraLifeFlash();                     // feedback visual del choque absorbido
      audio.crash();                               // sfx de impacto, pero la corrida sigue
    } else {
      gameOver(); pressed.clear(); return;         // el siguiente choque es game-over normal
    }
  }
  pressed.clear();
}

// ----------------------------- HUD: helpers de refresco (sin writes redundantes) -------
// Guardamos el último valor escrito para NO tocar el DOM si no cambió (evita reflows).
const hudLast = { score: -1, dist: -1, speed: -1, mult: "", busters: -1, recordHoy: -1 };
// Re-dispara la micro-animación synthwave 'hud-pulse' en cada cambio (reflow mínimo y puntual).
function bump(el) {
  if (!el) return;
  el.classList.remove("hud-bump");
  void el.offsetWidth;            // fuerza reflow para reiniciar la animación
  el.classList.add("hud-bump");
}
function refreshBusters(doBump) {
  if (G.busters !== hudLast.busters) {
    hudLast.busters = G.busters;
    if (dom.busters) dom.busters.textContent = G.busters;
    if (doBump) bump(dom.busters);
  }
}
function refreshMult(doBump) {
  const s = "x" + G.mult.toFixed(1);
  if (s !== hudLast.mult) { hudLast.mult = s; if (dom.mult) dom.mult.textContent = s; }
  if (doBump) bump(dom.mult);
}
function refreshRecordHoy() {
  const v = Math.max(G.bustersBest || 0, G.busters || 0);
  if (v !== hudLast.recordHoy) { hudLast.recordHoy = v; if (dom.recordHoy) dom.recordHoy.textContent = v; }
}

// ----------------------------- SOMBRA PROYECTADA (CSS, no imagen) -----------
// Elipse synthwave bajo la moto que se achica y atenua cuanto mas alto salta (G.y).
// Es puramente CSS (radial-gradient) -> NO es imagen, NO se declara asset.
const bikeShadowEl = (function(){
  const el = document.createElement("div");
  el.id = "bike-shadow";
  const st = document.createElement("style");
  st.textContent = "#bike-shadow{position:fixed;left:50%;bottom:12%;width:170px;height:46px;margin-left:-85px;border-radius:50%;background:radial-gradient(ellipse at center,rgba(6,0,14,.66),rgba(6,0,14,.30) 52%,rgba(6,0,14,0) 72%);filter:blur(2px);pointer-events:none;z-index:5;opacity:0;will-change:transform,opacity;}";
  document.head.appendChild(st);
  document.body.appendChild(el);
  return el;
})();
const JUMP_APEX = (JUMP.impulse * JUMP.impulse) / (2 * Math.abs(JUMP.g)); // altura maxima teorica del arco
function updateBikeShadow() {
  if (!bikeShadowEl) return;
  if (state !== "playing") { bikeShadowEl.style.opacity = "0"; return; }
  const k = Math.max(0, Math.min(1, G.y / JUMP_APEX));   // 0 = suelo, 1 = apice del salto
  const scale = (1 - 0.5 * k).toFixed(3);                // la sombra se achica con la altura
  const op = (0.8 * (1 - 0.78 * k)).toFixed(3);          // y se atenua con la altura
  bikeShadowEl.style.transform = "scale(" + scale + ")";
  bikeShadowEl.style.opacity = op;
}

// ----------------------------- RENDER ---------------------------------------
function render(alpha) {
  const a = (alpha === undefined) ? 1 : alpha;   // fracción de paso pendiente (0..1)
  // turntable de showroom en el menú (revela la moto; no afecta la simulación)
  if (state === "menu" && bikeReady) { bikePivot.rotation.y += 0.012; bikePivot.rotation.z = 0; }
  else {
    // interpolación visual de la moto entre el estado previo y el actual (timestep fijo)
    bikePivot.rotation.z = G.prevLean + (G.lean - G.prevLean) * a;
    bikePivot.rotation.x = G.prevPitch + (G.pitch - G.prevPitch) * a;
  }
  bike.position.x = G.prevX + (G.x - G.prevX) * a;
  bike.position.y = G.prevY + (G.y - G.prevY) * a;   // salto: desplazamiento vertical interpolado (la moto sube)
  // cámara sigue suavemente en X + shake (Math.random: cosmético, no contamina el RNG sembrado)
  const sx = (Math.random() - 0.5) * G.shake, sy = (Math.random() - 0.5) * G.shake;
  camera.position.x += (G.x * 0.5 + sx - camera.position.x) * 0.12;
  camera.position.y = CFG.camHeight + sy;
  camera.lookAt(G.x * 0.6, 1.2, -CFG.camLook);
  // sol/halo/luces siguen al jugador en x para que el horizonte no se "despegue"
  sun.position.x = halo.position.x = G.x * 0.3;
  bikeLamp.position.x = G.x; bikeRim.position.x = G.x;
  // HUD: escritura directa de textContent dentro del rAF, SOLO cuando el valor cambió
  if (state === "playing") {
    const sc = Math.round(G.score);
    if (sc !== hudLast.score) { hudLast.score = sc; dom.score.textContent = sc; }
    const di = Math.round(G.dist);
    if (di !== hudLast.dist) { hudLast.dist = di; dom.dist.textContent = di; }
    const sp = Math.round(G.speed * 1.7);              // a "km/h" de fantasía
    if (sp !== hudLast.speed) { hudLast.speed = sp; dom.speed.textContent = sp; }
    refreshMult(false);                                // mantiene el texto del mult al día (sin pulse)
    refreshBusters(false);                             // red de seguridad; el pulse va en el pickup
  }
  updateShield(performance.now());                // escudo de invencibilidad (CSS, fade-out)
  updateBikeShadow();                             // sombra proyectada de la moto (CSS, segun G.y)
  if (renderer) renderer.render(scene, camera);   // en modo degradado no se pinta, pero NO crashea
}

// ----------------------------- LOOP MAESTRO (único, timestep fijo) ----------
// UN solo requestAnimationFrame: sin setInterval ni rAF paralelos. update() corre
// a paso FIJO (acumulador delta-time) para 60fps deterministas; render(alpha)
// interpola la posición visual de la moto entre el estado previo y el actual.
const FIXED_DT = 1000 / 60;          // ~16.6ms por paso de simulación
const MAX_STEPS = 5;                 // tope de pasos por frame (anti spiral-of-death)
const MAX_ACC = FIXED_DT * MAX_STEPS;
let acc = 0, last = performance.now(), paused = false;
let frames = 0, fpsAt = last, fps = 0;
const dev = new URLSearchParams(location.search).has("dev");
if (dev) dom.dev.style.display = "block";

// Pausa por ventana sin foco: NO se recrea el loop, solo se gatea el update.
addEventListener("blur", () => { if (state === "playing") { state = "paused"; showScreen("pause"); } paused = true; });
addEventListener("focus", () => { paused = false; last = performance.now(); acc = 0; });
// Tab oculto: pausar y, al volver, resetear el reloj para NO inyectar un delta gigante.
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { if (state === "playing") { state = "paused"; showScreen("pause"); } }
  else { last = performance.now(); acc = 0; }
});

function frame(now) {
  requestAnimationFrame(frame);            // el loop NUNCA se detiene ni se recrea
  // Ventana sin foco: mantener el reloj al día y dibujar el frame congelado.
  if (paused) { last = now; render(1); return; }
  // TIENDA abierta: pausa el gameplay (update NO avanza) pero el rAF sigue vivo y
  // render() sigue dibujando el frame congelado. Reseteamos last/acc cada frame
  // mientras está abierta -> al cerrar NO hay salto temporal acumulado.
  if (window.__CR93_SHOP_OPEN) { last = now; acc = 0; pressed.clear(); render(1); return; }
  acc += now - last; last = now;
  if (acc > MAX_ACC) acc = MAX_ACC;        // clamp anti spiral-of-death tras pausas/tab oculto
  let steps = 0;
  while (acc >= FIXED_DT && steps < MAX_STEPS) { update(FIXED_DT); acc -= FIXED_DT; steps++; }
  render(acc / FIXED_DT);                   // alpha = fracción de paso pendiente, para interpolar
  if (dev) { frames++; if (now - fpsAt >= 500) { fps = Math.round(frames * 1000 / (now - fpsAt)); frames = 0; fpsAt = now;
    dom.dev.textContent = fps + " fps · cars " + activeCars.length + " · " + Math.round(G.speed); } }
}

// ----------------------------- ARRANQUE -------------------------------------
// Arranque DESACOPLADO del GLB: mostramos el menú y prendemos el loop de render YA,
// sin bloquear a la espera del modelo. El loop corre con la moto vacía (bikeReady=false)
// y la malla se puebla cuando el GLTFLoader resuelve (o cae al fallback procedural). Así
// el click en ACELERAR transiciona a la autopista SIN congelarse aunque bike.glb tarde.
bike.position.set(LANES[(CFG.laneCount - 1) >> 1], 0, 0);
state = "menu"; showScreen("start");
requestAnimationFrame(frame);            // loop arranca AHORA, no espera al GLB
console.log("[CafeRacer93] boot -> menú listo, cargando moto en segundo plano");

if (WEBGL_OK) {
  // placeholder provisional: ocupa el lugar de la moto al instante mientras el GLB
  // carga en segundo plano. El arranque NUNCA espera (sin await bloqueante).
  const placeholder = buildPlaceholderBike();
  bikeOrient.add(placeholder); bikeReady = true;
  // carga asíncrona del modelo: no bloquea el arranque ni el primer input del usuario
  loadBike().then((src) => {
    // setBikeModel ya limpio el placeholder (clearBikeOrient) y aplico color (horneado o tint).
    dom.loadingfill.style.width = "100%";
    bike.position.set(LANES[(CFG.laneCount - 1) >> 1], 0, 0);
    buildSkinSwatches();                    // sincronizar el estado de los swatches con el modelo cargado
    console.log("[CafeRacer93] bike:", src, "| WebGL ok");
  });
  loadObstacleModels();                     // skins 3D de carros/buses en background (fallback procedural mientras cargan)
} else {
  // modo degradado (sin WebGL): omito la carga 3D LIMPIAMENTE; el juego sigue
  // respondiendo y el botón ACELERAR transiciona a la autopista sin congelarse.
  bikeReady = false;
  console.warn("[CafeRacer93] modo degradado: omito carga 3D de la moto (sin contexto WebGL).");
}

// ============================================================================
// AJUSTES — modal synthwave (SONIDO + CONTROLES), persistido en localStorage.
// Se construye por JS sobre el index.html canonico (sin archivos paralelos) y se
// cablea a audio.setMuted/setVolume/setShuffle y al objeto BIND existente. NO toca
// fisica ni gameplay: abre desde INICIO y PAUSA (ya detenidos) y rehidrata estado.
// ============================================================================
(function setupSettings(){
  const KEY = "abbi_settings";
  // Acciones remapeables: tecla PRIMARIA por accion. Los alternos (WASD) y
  // confirm/pause quedan intactos en BIND; aqui solo se reasigna la principal.
  const REMAP = [
    { action: "boost", label: "ACELERAR",  def: "ArrowUp" },
    { action: "brake", label: "FRENAR",    def: "ArrowDown" },
    { action: "left",  label: "IZQUIERDA", def: "ArrowLeft" },
    { action: "right", label: "DERECHA",   def: "ArrowRight" },
  ];
  // Mapa BASE original (igual al BIND inicial) para reconstruir de forma determinista.
  const BASE_BIND = {
    ArrowLeft:"left", KeyA:"left", ArrowRight:"right", KeyD:"right",
    ArrowUp:"boost", KeyW:"boost", ArrowDown:"brake", KeyS:"brake",
    Space:"confirm", Enter:"confirm", KeyP:"pause", Escape:"pause",
  };
  const DEFAULT_BINDS = {};
  REMAP.forEach(function (r) { DEFAULT_BINDS[r.action] = r.def; });

  function load(){
    var s = {};
    try { s = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch(e){ s = {}; }
    return {
      muted:   typeof s.muted === "boolean" ? s.muted : !!audio.muted,
      volume:  (typeof s.volume === "number" && isFinite(s.volume)) ? Math.max(0, Math.min(100, s.volume)) : 80,
      shuffle: typeof s.shuffle === "boolean" ? s.shuffle : false,
      binds:   Object.assign({}, DEFAULT_BINDS, (s.binds && typeof s.binds === "object") ? s.binds : {}),
    };
  }
  function save(){ try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch(e){} }

  let settings = load();

  // --- aplicacion a los sistemas existentes (audio + BIND) ------------------
  function applyBinds(){
    for (var k in BIND) { if (Object.prototype.hasOwnProperty.call(BIND, k)) delete BIND[k]; }
    Object.assign(BIND, BASE_BIND);                 // reconstruir desde la base original
    REMAP.forEach(function (r) {
      var code = settings.binds[r.action] || r.def;
      if (code !== r.def) { delete BIND[r.def]; BIND[code] = r.action; }
    });
  }
  function applyAll(){
    audio.setMuted(settings.muted);
    if (audio.setVolume) audio.setVolume(settings.volume / 100);
    audio.setShuffle(settings.shuffle);
    applyBinds();
    syncMuteBtn();
  }

  // --- iconos SVG inline (currentColor + glow) ------------------------------
  function gearSVG(){
    return '<svg class="ic-gear" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3.1"/><path d="M19.3 13.1a7.4 7.4 0 0 0 0-2.2l2-1.5-2-3.4-2.3 1a7.4 7.4 0 0 0-1.9-1.1L14.7 3h-4l-.4 2.4a7.4 7.4 0 0 0-1.9 1.1l-2.3-1-2 3.4 2 1.5a7.4 7.4 0 0 0 0 2.2l-2 1.5 2 3.4 2.3-1a7.4 7.4 0 0 0 1.9 1.1l.4 2.4h4l.4-2.4a7.4 7.4 0 0 0 1.9-1.1l2.3 1 2-3.4z"/></svg>';
  }
  function speakerSVG(muted){
    var base = '<path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" stroke="none"/>';
    var waves = muted
      ? '<path d="M16 9.2l5.2 5.6M21.2 9.2L16 14.8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
      : '<path d="M16.5 8.6a5 5 0 0 1 0 6.8M19 6.2a8.2 8.2 0 0 1 0 11.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';
    return '<svg class="ic-spk" viewBox="0 0 24 24" aria-hidden="true">' + base + waves + '</svg>';
  }
  function keyName(code){
    if (!code) return "\u2014";
    if (code.indexOf("Key") === 0) return code.slice(3);
    if (code.indexOf("Digit") === 0) return code.slice(5);
    var m = { ArrowUp:"\u2191", ArrowDown:"\u2193", ArrowLeft:"\u2190", ArrowRight:"\u2192",
              Space:"ESPACIO", Enter:"ENTER", Escape:"ESC" };
    return m[code] || code;
  }

  // --- estilos (derivados de las variables CSS synthwave del :root) ---------
  var css = document.createElement("style");
  css.textContent = [
    '#settings-modal{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;}',
    '#settings-modal.hidden{display:none;}',
    '#settings-modal .modal-backdrop{position:absolute;inset:0;background:rgba(6,0,16,.78);backdrop-filter:blur(3px);}',
    '#settings-modal .modal-card{position:relative;z-index:1;width:min(92vw,520px);max-height:88vh;overflow-y:auto;background:linear-gradient(160deg,rgba(24,0,40,.96),rgba(10,0,20,.96));border:2px solid var(--cyan);border-radius:14px;padding:24px 22px 26px;box-shadow:0 0 36px rgba(34,225,255,.45),inset 0 0 22px rgba(176,38,255,.18);}',
    '#settings-modal .modal-x{position:absolute;top:12px;right:14px;background:none;border:none;cursor:pointer;color:var(--pink);font-size:22px;font-family:inherit;text-shadow:0 0 10px var(--pink);line-height:1;}',
    '#settings-modal .modal-x:hover{color:#fff;}',
    '#settings-modal .modal-title{font-size:clamp(1.6rem,5vw,2.4rem);font-weight:900;letter-spacing:.18em;text-align:center;background:linear-gradient(90deg,var(--pink),var(--purple) 50%,var(--cyan));-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;filter:drop-shadow(0 0 14px rgba(255,45,149,.6));margin-bottom:18px;}',
    '#settings-modal .set-sec{border:1px solid rgba(176,38,255,.5);border-radius:10px;padding:12px 14px;margin-bottom:16px;background:rgba(20,0,32,.4);box-shadow:inset 0 0 14px rgba(176,38,255,.12);}',
    '#settings-modal .set-h{font-size:.85rem;letter-spacing:.26em;color:var(--cyan);text-shadow:0 0 10px var(--cyan);font-weight:900;margin-bottom:12px;}',
    '#settings-modal .set-row{display:flex;align-items:center;gap:12px;margin:10px 0;}',
    '#settings-modal .set-lbl{flex:1 1 auto;display:flex;align-items:center;gap:8px;font-size:.82rem;letter-spacing:.12em;color:var(--ink);}',
    '#settings-modal .set-val{min-width:2.4em;text-align:right;color:var(--yellow);font-weight:900;text-shadow:0 0 8px var(--yellow);}',
    '#settings-modal .set-toggle{position:relative;width:54px;height:28px;border-radius:999px;cursor:pointer;border:2px solid var(--cyan);background:rgba(34,225,255,.12);flex:none;transition:background .2s,border-color .2s;}',
    '#settings-modal .set-toggle .knob{position:absolute;top:2px;left:2px;width:20px;height:20px;border-radius:50%;background:var(--cyan);box-shadow:0 0 10px var(--cyan);transition:left .18s,background .18s;}',
    '#settings-modal .set-toggle.on{border-color:var(--pink);background:rgba(255,45,149,.18);}',
    '#settings-modal .set-toggle.on .knob{left:30px;background:var(--pink);box-shadow:0 0 10px var(--pink);}',
    '#settings-modal .set-range{flex:1 1 auto;-webkit-appearance:none;appearance:none;height:6px;border-radius:4px;background:linear-gradient(90deg,var(--pink),var(--cyan));box-shadow:0 0 10px rgba(34,225,255,.4);outline:none;}',
    '#settings-modal .set-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:18px;height:18px;border-radius:50%;background:var(--yellow);box-shadow:0 0 10px var(--yellow);cursor:pointer;border:none;}',
    '#settings-modal .set-range::-moz-range-thumb{width:18px;height:18px;border-radius:50%;background:var(--yellow);box-shadow:0 0 10px var(--yellow);cursor:pointer;border:none;}',
    '#settings-modal .set-mode{cursor:pointer;border:2px solid var(--cyan);background:rgba(34,225,255,.1);color:#fff;font-family:inherit;font-weight:900;letter-spacing:.12em;font-size:.78rem;padding:7px 16px;border-radius:6px;text-shadow:0 0 8px var(--cyan);min-width:120px;}',
    '#settings-modal .set-mode[aria-pressed="true"]{border-color:var(--pink);text-shadow:0 0 8px var(--pink);background:rgba(255,45,149,.12);}',
    '#settings-modal .set-binds{display:flex;flex-direction:column;gap:8px;}',
    '#settings-modal .bind-row{display:flex;align-items:center;gap:10px;padding:6px 10px;border-radius:6px;border:1px solid rgba(255,45,149,.4);background:rgba(255,45,149,.05);}',
    '#settings-modal .bind-name{flex:1 1 auto;font-size:.8rem;letter-spacing:.1em;color:#fff;text-shadow:0 0 6px var(--pink);}',
    '#settings-modal .bind-key{min-width:3.4em;text-align:center;font-weight:900;color:var(--yellow);text-shadow:0 0 8px var(--yellow);border:1px solid var(--yellow);border-radius:5px;padding:3px 8px;font-size:.85rem;}',
    '#settings-modal .bind-btn{cursor:pointer;border:2px solid var(--purple);background:rgba(176,38,255,.12);color:#fff;font-family:inherit;font-weight:900;letter-spacing:.1em;font-size:.72rem;padding:5px 12px;border-radius:5px;text-shadow:0 0 8px var(--purple);white-space:nowrap;}',
    '#settings-modal .bind-btn.listening{border-color:var(--yellow);color:var(--yellow);text-shadow:0 0 8px var(--yellow);animation:pulse .6s infinite;}',
    '#settings-modal .set-hint{font-size:.68rem;letter-spacing:.08em;color:#c8a9ff;opacity:.8;margin-top:10px;}',
    '#settings-modal .ic-spk{width:18px;height:18px;display:inline-block;vertical-align:middle;color:var(--cyan);filter:drop-shadow(0 0 6px var(--cyan));}',
    '#settings-modal .set-toggle:focus-visible,#settings-modal .set-mode:focus-visible,#settings-modal .bind-btn:focus-visible,#settings-modal .modal-x:focus-visible,#settings-modal .set-range:focus-visible{outline:2px solid var(--cyan);outline-offset:3px;}',
    '.settings-gear{position:absolute;top:max(12px,env(safe-area-inset-top));left:14px;z-index:25;pointer-events:auto;cursor:pointer;background:rgba(34,225,255,.08);border:2px solid var(--cyan);border-radius:50%;width:46px;height:46px;display:flex;align-items:center;justify-content:center;color:var(--cyan);box-shadow:0 0 16px rgba(34,225,255,.45);transition:transform .12s,box-shadow .2s,border-color .2s,color .2s;}',
    '.settings-gear:hover{transform:rotate(35deg) scale(1.05);border-color:var(--pink);color:var(--pink);box-shadow:0 0 22px rgba(255,45,149,.6);}',
    '.settings-gear .ic-gear{width:24px;height:24px;display:block;filter:drop-shadow(0 0 6px currentColor);}',
    '.settings-gear:focus-visible{outline:2px solid var(--cyan);outline-offset:3px;}',
    '@media (prefers-reduced-motion:reduce){#settings-modal .bind-btn.listening{animation:none;}.settings-gear:hover{transform:none;}}',
  ].join("");
  document.head.appendChild(css);

  // --- markup del modal -----------------------------------------------------
  var modal = document.createElement("div");
  modal.id = "settings-modal";
  modal.className = "modal hidden";
  modal.innerHTML =
    '<div class="modal-backdrop" data-close="1"></div>' +
    '<div class="modal-card" role="dialog" aria-modal="true" aria-label="Ajustes">' +
      '<button class="modal-x" data-close="1" aria-label="Cerrar">\u2715</button>' +
      '<h2 class="modal-title">AJUSTES</h2>' +
      '<section class="set-sec">' +
        '<h3 class="set-h">SONIDO</h3>' +
        '<div class="set-row"><span class="set-lbl"><span id="set-spk"></span>SILENCIAR</span>' +
          '<button id="set-mute" class="set-toggle" role="switch" aria-checked="false" aria-label="Silenciar"><span class="knob"></span></button></div>' +
        '<div class="set-row"><span class="set-lbl">VOLUMEN</span>' +
          '<input id="set-vol" class="set-range" type="range" min="0" max="100" value="80" aria-label="Volumen">' +
          '<span id="set-vol-val" class="set-val">80</span></div>' +
        '<div class="set-row"><span class="set-lbl">REPRODUCCI\u00d3N</span>' +
          '<button id="set-shuffle" class="set-mode" aria-pressed="false">SECUENCIAL</button></div>' +
      '</section>' +
      '<section class="set-sec">' +
        '<h3 class="set-h">CONTROLES</h3>' +
        '<div id="set-binds" class="set-binds"></div>' +
        '<p class="set-hint">Puls\u00e1 \u00abREMAPEAR\u00bb y luego la tecla nueva \u00b7 ESC cancela</p>' +
      '</section>' +
    '</div>';
  document.body.appendChild(modal);

  var elMute = modal.querySelector("#set-mute");
  var elVol  = modal.querySelector("#set-vol");
  var elVolV = modal.querySelector("#set-vol-val");
  var elShuf = modal.querySelector("#set-shuffle");
  var elSpk  = modal.querySelector("#set-spk");
  var elBinds = modal.querySelector("#set-binds");

  function renderBinds(){
    elBinds.innerHTML = "";
    REMAP.forEach(function (r) {
      var code = settings.binds[r.action] || r.def;
      var row = document.createElement("div");
      row.className = "bind-row";
      row.innerHTML =
        '<span class="bind-name">' + r.label + '</span>' +
        '<span class="bind-key">' + keyName(code) + '</span>' +
        '<button class="bind-btn" type="button" data-remap="' + r.action + '">REMAPEAR</button>';
      elBinds.appendChild(row);
    });
  }
  function syncUI(){
    elMute.setAttribute("aria-checked", String(settings.muted));
    elMute.classList.toggle("on", settings.muted);
    elSpk.innerHTML = speakerSVG(settings.muted);
    elVol.value = String(settings.volume);
    elVolV.textContent = String(settings.volume);
    elShuf.setAttribute("aria-pressed", String(settings.shuffle));
    elShuf.textContent = settings.shuffle ? "ALEATORIO" : "SECUENCIAL";
    renderBinds();
  }
  function syncMuteBtn(){
    if (dom.mute){ dom.mute.textContent = audio.muted ? "\ud83d\udd07" : "\u266a"; dom.mute.setAttribute("aria-pressed", String(audio.muted)); }
  }

  // --- wiring de los controles ----------------------------------------------
  elMute.addEventListener("click", function () {
    settings.muted = !settings.muted;
    audio.setMuted(settings.muted);
    elMute.setAttribute("aria-checked", String(settings.muted));
    elMute.classList.toggle("on", settings.muted);
    elSpk.innerHTML = speakerSVG(settings.muted);
    syncMuteBtn(); save(); audio.ui();
  });
  elVol.addEventListener("input", function () {
    settings.volume = Math.max(0, Math.min(100, parseInt(elVol.value, 10) || 0));
    elVolV.textContent = String(settings.volume);
    if (audio.setVolume) audio.setVolume(settings.volume / 100);
    save();
  });
  elShuf.addEventListener("click", function () {
    settings.shuffle = !settings.shuffle;
    audio.setShuffle(settings.shuffle);
    elShuf.setAttribute("aria-pressed", String(settings.shuffle));
    elShuf.textContent = settings.shuffle ? "ALEATORIO" : "SECUENCIAL";
    save(); audio.ui();
  });

  // remapeo: capturar la PROXIMA tecla
  var capturing = null;
  elBinds.addEventListener("click", function (e) {
    var b = e.target.closest("[data-remap]"); if (!b) return;
    capturing = { action: b.getAttribute("data-remap"), btn: b };
    b.textContent = "PULS\u00c1\u2026"; b.classList.add("listening");
    audio.ui();
  });

  // --- apertura / cierre ----------------------------------------------------
  function openModal(){ modal.classList.remove("hidden"); syncUI(); audio.ui(); }
  function closeModal(){
    modal.classList.add("hidden");
    if (capturing){ capturing = null; renderBinds(); }
  }
  modal.addEventListener("click", function (e) {
    if (e.target && e.target.getAttribute && e.target.getAttribute("data-close")) closeModal();
  });

  // teclado en fase de CAPTURA (corre ANTES del handler del juego: lo intercepta)
  addEventListener("keydown", function (e) {
    if (capturing){
      e.preventDefault(); e.stopImmediatePropagation();
      var code = e.code, btn = capturing.btn, action = capturing.action;
      capturing = null; if (btn) btn.classList.remove("listening");
      if (code === "Escape"){ renderBinds(); return; }   // cancelar
      // evitar que dos acciones compartan la MISMA tecla primaria
      REMAP.forEach(function (r) { if (r.action !== action && (settings.binds[r.action] || r.def) === code) settings.binds[r.action] = r.def; });
      settings.binds[action] = code;
      applyBinds(); save(); renderBinds();
      return;
    }
    if (!modal.classList.contains("hidden")){
      if (e.code === "Escape"){ e.preventDefault(); e.stopImmediatePropagation(); closeModal(); return; }
      if (BIND[e.code]){ e.preventDefault(); e.stopImmediatePropagation(); }  // congelar inputs del juego mientras Ajustes esta abierto
    }
  }, true);

  // --- botones de acceso (engranaje SVG) en INICIO y PAUSA ------------------
  function makeGear(){
    var b = document.createElement("button");
    b.type = "button"; b.className = "settings-gear";
    b.setAttribute("aria-label", "Ajustes");
    b.innerHTML = gearSVG();
    b.addEventListener("click", function (e) { e.stopPropagation(); openModal(); });
    b.addEventListener("touchstart", function (e) { e.stopPropagation(); }, { passive: true });
    return b;
  }
  if (dom.start) dom.start.appendChild(makeGear());
  if (dom.pause) dom.pause.appendChild(makeGear());

  // El boton de mute global (#mutebtn) tambien refleja/escribe los Ajustes.
  if (dom.mute){
    dom.mute.onclick = function () {
      settings.muted = !audio.muted;
      audio.setMuted(settings.muted);
      syncMuteBtn(); save();
      if (!modal.classList.contains("hidden")) syncUI();
    };
  }

  // --- REHIDRATACION: aplicar el estado guardado al cargar ------------------
  applyAll();
  console.log("[CafeRacer93] Ajustes listos \u2014 muted:", settings.muted, "vol:", settings.volume, "shuffle:", settings.shuffle);
})();
