// ===== Cotizador: usa el agente APPO (FastAPI) para renderizar la idea =====

// Endpoint del backend APPO.
//  - En local (abriendo el archivo o con run_planner.bat): usa el servidor FastAPI en el puerto 8080.
//  - En producción (Vercel): usa la función serverless /api/generar_plan del mismo sitio.
const IS_LOCAL = ["localhost", "127.0.0.1", ""].includes(location.hostname);
const APPO_ENDPOINT = IS_LOCAL
  ? "http://127.0.0.1:8080/generar_plan"
  : "/api/generar_plan";

const input = document.getElementById("ideaInput");
const body = document.getElementById("renderBody");
const urlEl = document.getElementById("renderUrl");
const genBtn = document.getElementById("genBtn");
const browser = document.getElementById("browser");
const stylePicker = document.getElementById("stylePicker");

// ===== Biblioteca de estilos del render =====
let currentTheme = "t-minimal";
const THEMES = ["t-minimal","t-dark","t-ocean","t-forest","t-candy","t-neon","t-terminal","t-paper","t-custom"];
const customPanel = document.getElementById("customPanel");
const CUSTOM_VARS = ["--t-bg","--t-fg","--t-title","--t-accent","--t-accent-fg","--t-border","--t-card","--t-bar","--t-cta-bg","--t-cta-fg","--t-font","--t-radius","--t-base"];

stylePicker.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-theme]");
  if (!btn) return;
  currentTheme = btn.dataset.theme;
  browser.classList.remove(...THEMES);
  browser.classList.add(currentTheme);
  stylePicker.querySelectorAll("button").forEach(b => b.classList.toggle("is-sel", b === btn));

  const isCustom = currentTheme === "t-custom";
  customPanel.hidden = !isCustom;
  if (isCustom) applyCustom();            // aplica los valores actuales del panel
  else CUSTOM_VARS.forEach(v => browser.style.removeProperty(v));  // limpia overrides inline

  if (lastPlan) renderPlan(lastPlan);     // re-pinta el render con la nueva paleta (sin volver a llamar al modelo)
});

// ===== Tema personalizado: aplicar cada control =====
function setVar(varName, raw){
  let val = raw;
  if (varName === "--t-radius") val = raw + "px";
  if (varName === "--t-base") val = raw + "px";
  browser.style.setProperty(varName, val);
}
function applyCustom(){
  customPanel.querySelectorAll("[data-var]").forEach(el => setVar(el.dataset.var, el.value));
}
customPanel.addEventListener("input", (e) => {
  const el = e.target.closest("[data-var]");
  if (el) setVar(el.dataset.var, el.value);
});
// Re-pintar solo al soltar el control (evita reconstruir el iframe en cada pixel)
customPanel.addEventListener("change", () => { if (lastPlan) renderPlan(lastPlan); });

// ===== Paleta actual -> variables que recibe el iframe del render =====
function getPalette(){
  const s = getComputedStyle(browser);
  const g = v => (s.getPropertyValue(v) || "").trim();
  return {
    bg: g("--t-bg") || "#fff",
    fg: g("--t-fg") || "#111",
    title: g("--t-title") || g("--t-fg") || "#111",
    accent: g("--t-accent") || "#111",
    accentFg: g("--t-accent-fg") || "#fff",
    border: g("--t-border") || "#111",
    card: g("--t-card") || "transparent",
    ctaBg: g("--t-cta-bg") || "#111",
    ctaFg: g("--t-cta-fg") || "#fff",
    radius: g("--t-radius") || "0px",
    font: g("--t-font") || "'Archivo',sans-serif",
    base: g("--t-base") || "16px",
  };
}

// Documento aislado que se inyecta en el iframe (HTML del modelo + paleta del tema)
function buildDoc(innerHtml){
  const p = getPalette();
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root{
    --bg:${p.bg};--fg:${p.fg};--title:${p.title};--accent:${p.accent};--accent-fg:${p.accentFg};
    --border:${p.border};--card:${p.card};--cta-bg:${p.ctaBg};--cta-fg:${p.ctaFg};--radius:${p.radius};
  }
  *{box-sizing:border-box}
  html,body{margin:0}
  body{padding:16px;font-family:${p.font};font-size:${p.base};background:var(--bg);color:var(--fg)}
  h1,h2,h3{color:var(--title)}
  a{color:var(--accent)}
  ::-webkit-scrollbar{width:8px}::-webkit-scrollbar-thumb{background:var(--border);border-radius:6px}
</style></head><body>${innerHtml}</body></html>`;
}

const loadingTexts = [
  "Analizando requerimientos",
  "Diseñando arquitectura",
  "Estructurando secciones",
  "Compilando render",
];

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

function showEmpty(){
  body.innerHTML = '<div class="render-empty">Escribe tu idea y pulsa "Renderizar con APPO"</div>';
  urlEl.textContent = "tu-proyecto.app";
}

function showLoading(){
  let i = 0;
  body.innerHTML = `<div class="render-empty" id="loadTxt">${loadingTexts[0]}…</div>`;
  const el = document.getElementById("loadTxt");
  return setInterval(() => { i = (i + 1) % loadingTexts.length; if (el) el.textContent = loadingTexts[i] + "…"; }, 1600);
}

let lastPlan = null;

function renderPlan(plan){
  lastPlan = plan;
  const nombre = plan.nombre_proyecto || "Tu proyecto";
  const slug = nombre.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 22) || "proyecto";
  urlEl.textContent = slug + ".app";

  // Render principal: el HTML interactivo del modelo dentro de un iframe aislado
  const inner = (plan.html && String(plan.html).trim())
    ? String(plan.html)
    : `<h1>${escapeHtml(nombre)}</h1><p>${escapeHtml(plan.descripcion || "")}</p>`;

  body.innerHTML = '<iframe class="render-frame" sandbox="allow-scripts allow-popups allow-forms"></iframe>';
  const frame = body.querySelector("iframe");
  frame.srcdoc = buildDoc(inner);

  // Fuentes de inspiración debajo del render
  const fuentes = Array.isArray(plan.fuentes) ? plan.fuentes : [];
  if (fuentes.length){
    let s = `<div class="r-sources"><b>Inspirado en:</b>`;
    fuentes.forEach(f => {
      const nom = escapeHtml(f.nombre || f.url || "fuente");
      const idea = f.idea_tomada ? ` — ${escapeHtml(f.idea_tomada)}` : "";
      const url = f.url ? escapeHtml(f.url) : "#";
      s += `<a href="${url}" target="_blank" rel="noopener">${nom}</a><small>${idea}</small>`;
    });
    s += `</div>`;
    body.insertAdjacentHTML("beforeend", s);
  }
}

async function generar(){
  const text = input.value.trim();
  if (!text){ input.focus(); return; }

  genBtn.disabled = true;
  const timer = showLoading();
  try {
    const res = await fetch(APPO_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_prompt: text }),
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    clearInterval(timer);
    renderPlan(data.plan || {});
  } catch (err) {
    clearInterval(timer);
    console.error(err);
    body.innerHTML = `<div class="render-empty">No se pudo conectar con el agente APPO.<br>
      ${IS_LOCAL ? "Asegúrate de ejecutar <b>run_planner.bat</b> (servidor local en el puerto 8080)." : "El backend en Vercel no respondió. Revisa los logs de la función /api/generar_plan."}</div>`;
  } finally {
    genBtn.disabled = false;
  }
}

genBtn.addEventListener("click", generar);
input.addEventListener("keydown", e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) generar(); });

// Prefill desde la landing (?idea=...)
const params = new URLSearchParams(location.search);
if (params.get("idea")) input.value = params.get("idea");

showEmpty();

document.getElementById("finalCta").addEventListener("click", () => {
  try { sessionStorage.setItem("apab_idea", input.value.trim()); } catch (e) {}
});
