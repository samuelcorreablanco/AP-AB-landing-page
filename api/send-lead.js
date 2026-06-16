// ============================================================
//  Función serverless (Vercel) — envía un correo de aviso cuando
//  un usuario termina la cotización y deja su correo.
//
//  Variables de entorno (Vercel -> Project -> Settings -> Environment Variables):
//    RESEND_API_KEY   -> tu API key de https://resend.com
//    NOTIFY_EMAIL     -> correo donde quieres recibir los avisos (ej. barrerojeronimo@gmail.com)
//    FROM_EMAIL       -> remitente verificado en Resend.
//                        Para pruebas puedes usar: onboarding@resend.dev
//    DEEPSEEK_API_KEY -> API key de DeepSeek (para generar el DRA del proyecto)
//    PLANNER_MODEL    -> modelo a usar (mismo que el cotizador, ej. "deepseek-v4-pro")
// ============================================================

// Registro de modelos (espejo de api/generar_plan.py)
const MODEL_REGISTRY = {
  "gpt-5.5": { url: "https://api.openai.com/v1", keyEnv: "OPENAI_API_KEY" },
  "deepseek-v4-pro": { url: "https://api.deepseek.com", keyEnv: "DEEPSEEK_API_KEY" },
  "gemini-3.1-pro": { url: "https://generativelanguage.googleapis.com/v1beta/openai/", keyEnv: "GEMINI_API_KEY" },
  "claude-opus-4-7": { url: "https://api.anthropic.com/v1", keyEnv: "ANTHROPIC_API_KEY" },
};

// Genera el DRA (Documento de Requerimientos y Arquitectura) COMPLETO a partir de la idea.
// Usa el mismo modelo/credenciales que el cotizador (PLANNER_MODEL + su API key).
// Si no hay API key o falla, devuelve null y el correo se envía igual sin DRA.
async function generarDRA(idea) {
  if (!idea) return null;

  let model = process.env.PLANNER_MODEL || "deepseek-v4-pro";
  let config = MODEL_REGISTRY[model];
  let key = config && process.env[config.keyEnv];

  // Fallback si el modelo configurado no tiene su key
  if (!key) {
    for (const fb of ["deepseek-v4-pro", "gpt-5.5"]) {
      if (process.env[MODEL_REGISTRY[fb].keyEnv]) {
        model = fb; config = MODEL_REGISTRY[fb]; key = process.env[config.keyEnv]; break;
      }
    }
  }
  if (!key) return null;

  try {
    const r = await fetch(config.url.replace(/\/$/, "") + "/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        max_tokens: 4000,
        messages: [
          {
            role: "system",
            content:
              "Eres un Arquitecto de Software de Ap-Ab. A partir de la idea del usuario redacta un " +
              "DRA (Documento de Requerimientos y Arquitectura) COMPLETO y detallado con el concepto " +
              "general del programa a desarrollar. Incluye estas secciones: 1) Concepto general, " +
              "2) Objetivo, 3) Usuarios y casos de uso, 4) Funcionalidades clave (lista detallada), " +
              "5) Arquitectura propuesta (frontend, backend, base de datos, integraciones), " +
              "6) Modelo de datos principal, 7) Alcance inicial (MVP) y 8) Consideraciones. " +
              "Desarrolla cada sección con suficiente detalle. Responde en texto plano, sin markdown.",
          },
          { role: "user", content: "Idea del usuario: " + idea },
        ],
      }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    return data?.choices?.[0]?.message?.content || null;
  } catch (e) {
    return null;
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { email, idea, precio, tiempo } = req.body || {};

    if (!email) {
      return res.status(400).json({ error: "Falta el correo del solicitante" });
    }

    const apiKey = process.env.RESEND_API_KEY;
    const to = process.env.NOTIFY_EMAIL;
    const from = process.env.FROM_EMAIL || "Ap-Ab <onboarding@resend.dev>";

    if (!apiKey || !to) {
      return res.status(500).json({ error: "Faltan RESEND_API_KEY o NOTIFY_EMAIL en el servidor" });
    }

    const esc = (s) =>
      String(s == null ? "" : s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

    // Generar el DRA del proyecto a partir de la idea
    const dra = await generarDRA(idea);
    const draHtml = dra
      ? `<pre style="white-space:pre-wrap;font-family:inherit;background:#f5f5f5;padding:14px;border-radius:6px;margin:0">${esc(dra)}</pre>`
      : "<i>(No se pudo generar el DRA automáticamente)</i>";

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:620px">
        <h2 style="margin:0 0 16px">Nueva cotización · Ap-Ab</h2>
        <p><b>Correo del solicitante:</b> ${esc(email)}</p>
        <p><b>Resumen del proyecto:</b><br>${esc(idea) || "(sin descripción)"}</p>
        <p><b>Precio entregado:</b> ${esc(precio) || "Por definir"}</p>
        <p><b>Tiempo de entrega:</b> ${esc(tiempo) || "Por definir"}</p>
        <h3 style="margin:22px 0 8px">DRA — Documento de Requerimientos y Arquitectura</h3>
        ${draHtml}
      </div>`;

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: email,
        subject: "Nueva cotización en Ap-Ab",
        html,
      }),
    });

    if (!r.ok) {
      const detail = await r.text();
      return res.status(502).json({ error: "Resend falló", detail });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
};
