// ============================================================
//  Función serverless (Vercel) — envía un correo de aviso cuando
//  un usuario termina la cotización y deja su correo.
//
//  Variables de entorno (Vercel -> Project -> Settings -> Environment Variables):
//    RESEND_API_KEY   -> tu API key de https://resend.com
//    NOTIFY_EMAIL     -> correo donde quieres recibir los avisos (ej. barrerojeronimo@gmail.com)
//    FROM_EMAIL       -> remitente verificado en Resend.
//                        Para pruebas puedes usar: onboarding@resend.dev
// ============================================================

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

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:560px">
        <h2 style="margin:0 0 16px">Nueva cotización · Ap-Ab</h2>
        <p><b>Correo del solicitante:</b> ${esc(email)}</p>
        <p><b>Resumen del proyecto:</b><br>${esc(idea) || "(sin descripción)"}</p>
        <p><b>Precio entregado:</b> ${esc(precio) || "Por definir"}</p>
        <p><b>Tiempo de entrega:</b> ${esc(tiempo) || "Por definir"}</p>
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
