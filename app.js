// ===== Navegación por pestañas (sin scroll) =====
const tabs = document.querySelectorAll("[data-tab]");
const panels = document.querySelectorAll(".panel");
const tabsNav = document.getElementById("tabs");
const menuToggle = document.getElementById("menuToggle");

function setMenu(open) {
  tabsNav.classList.toggle("open", open);
  menuToggle?.classList.toggle("is-open", open);
  menuToggle?.setAttribute("aria-expanded", open ? "true" : "false");
}
function closeMenu() { setMenu(false); }

function activate(id) {
  panels.forEach(p => p.classList.toggle("is-active", p.id === id));
  document.querySelectorAll(".tab").forEach(t =>
    t.classList.toggle("is-active", t.dataset.tab === id)
  );
  closeMenu();
}

tabs.forEach(el => {
  el.addEventListener("click", () => activate(el.dataset.tab));
  el.addEventListener("keypress", e => { if (e.key === "Enter") activate(el.dataset.tab); });
});

// Cerrar el menú al tocar cualquier enlace de la nav (Servicios, Cotización, subtabs)
tabsNav?.querySelectorAll("a").forEach(a => a.addEventListener("click", closeMenu));

// Abrir/cerrar con el botón hamburguesa
menuToggle?.addEventListener("click", (e) => {
  e.stopPropagation();
  setMenu(!tabsNav.classList.contains("open"));
});

// Cerrar al tocar fuera del menú o con Escape
document.addEventListener("click", (e) => {
  if (!tabsNav.classList.contains("open")) return;
  if (!tabsNav.contains(e.target) && !menuToggle.contains(e.target)) closeMenu();
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });

// ===== Supabase (opcional) =====
let supabase = null;
if (window.supabase && window.SUPABASE_URL && !window.SUPABASE_URL.includes("TU-PROYECTO")) {
  supabase = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
}

// ===== Formulario de cotización =====
const form = document.getElementById("quoteForm");
const msg = document.getElementById("formMsg");
const submitBtn = document.getElementById("submitBtn");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());
  submitBtn.disabled = true;
  msg.style.color = "#0c0c0c";
  msg.textContent = "Enviando…";

  try {
    if (supabase) {
      const { error } = await supabase.from("quotes").insert([{
        name: data.name,
        email: data.email,
        company: data.company || null,
        message: data.message
      }]);
      if (error) throw error;
    }
    // Siempre ofrecemos también WhatsApp como respaldo
    const wa = `https://wa.me/573185990793?text=${encodeURIComponent(
      `Hola Ap-Ab, soy ${data.name}. ${data.message}`
    )}`;
    msg.textContent = supabase
      ? "¡Recibido! Abriendo WhatsApp para continuar…"
      : "Abriendo WhatsApp…";
    window.open(wa, "_blank");
    form.reset();
  } catch (err) {
    console.error(err);
    msg.style.color = "#0c0c0c";
    msg.textContent = "No se pudo guardar. Escríbenos por WhatsApp: +57 318 599 0793";
  } finally {
    submitBtn.disabled = false;
  }
});
