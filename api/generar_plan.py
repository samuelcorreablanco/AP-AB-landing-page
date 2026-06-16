# ============================================================
#  Función serverless (Vercel) — Backend del cotizador APPO.
#  Recibe la idea del usuario, busca inspiración en internet,
#  llama a la IA (DeepSeek por defecto) y devuelve el prototipo.
#
#  Variables de entorno (Vercel -> Settings -> Environment Variables):
#    DEEPSEEK_API_KEY  -> tu API key de https://platform.deepseek.com
#    PLANNER_MODEL     -> modelo a usar (ej. "deepseek-v4-pro")
#    (OPENAI_API_KEY / GEMINI_API_KEY / ANTHROPIC_API_KEY son opcionales)
#
#  Esto reemplaza, para producción, al servidor FastAPI de
#  APPO_Planner_Standalone/main.py. La carpeta local sigue
#  sirviendo para correr el planner en tu PC con run_planner.bat.
# ============================================================
from http.server import BaseHTTPRequestHandler
import json
import re
import html
import os
import urllib.parse
import urllib.request
import traceback

from openai import OpenAI


# ---------- Registro de modelos (espejo de utils.py) ----------
MODEL_REGISTRY = {
    "gpt-5.5": {"url": None, "key_env": "OPENAI_API_KEY"},
    "deepseek-v4-pro": {"url": "https://api.deepseek.com", "key_env": "DEEPSEEK_API_KEY"},
    "gemini-3.1-pro": {"url": "https://generativelanguage.googleapis.com/v1beta/openai/", "key_env": "GEMINI_API_KEY"},
    "claude-opus-4-7": {"url": "https://api.anthropic.com/v1", "key_env": "ANTHROPIC_API_KEY"},
}


def extract_clean_json(raw_text: str) -> str:
    """Aísla el bloque JSON de la respuesta, quitando markdown y texto fuera de las llaves."""
    if not raw_text:
        return ""
    clean_text = re.sub(r'```[a-zA-Z]*', '', raw_text).replace('```', '')
    start_brace = clean_text.find('{')
    start_bracket = clean_text.find('[')
    if start_brace == -1 and start_bracket == -1:
        return clean_text.strip()
    elif start_brace != -1 and start_bracket != -1:
        start_idx = min(start_brace, start_bracket)
    else:
        start_idx = max(start_brace, start_bracket)
    end_brace = clean_text.rfind('}')
    end_bracket = clean_text.rfind(']')
    if end_brace == -1 and end_bracket == -1:
        end_idx = len(clean_text)
    else:
        end_idx = max(end_brace, end_bracket) + 1
    return clean_text[start_idx:end_idx].strip()


def call_ai_model(system_prompt, user_prompt, model_name, max_tokens=8000):
    """Llama al modelo vía cliente OpenAI-compatible. Hace fallback si falta la key."""
    config = MODEL_REGISTRY.get(model_name)
    key = os.getenv(config["key_env"]) if config else None
    if not config or not key:
        # Fallback: intentar DeepSeek, luego OpenAI
        for fb in ("deepseek-v4-pro", "gpt-5.5"):
            cfg = MODEL_REGISTRY[fb]
            if os.getenv(cfg["key_env"]):
                model_name, config, key = fb, cfg, os.getenv(cfg["key_env"])
                break

    client_kwargs = {"api_key": key or "dummy_key"}
    if config and config["url"]:
        client_kwargs["base_url"] = config["url"]
    client = OpenAI(**client_kwargs)

    response = client.chat.completions.create(
        model=model_name,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        max_tokens=max_tokens,
        response_format={"type": "json_object"},
    )
    return response.choices[0].message.content


def buscar_inspiracion(query: str, n: int = 3):
    """Busca ejemplos reales en DuckDuckGo. Si falla la red, retorna []."""
    try:
        q = urllib.parse.quote(query + " ejemplo sitio web diseño")
        url = f"https://html.duckduckgo.com/html/?q={q}"
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
        request = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(request, timeout=6) as resp:
            page = resp.read().decode("utf-8", errors="ignore")
        pattern = re.compile(r'<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)</a>', re.S)
        fuentes = []
        for m in pattern.finditer(page):
            href = html.unescape(m.group(1))
            titulo = html.unescape(re.sub(r"<[^>]+>", "", m.group(2))).strip()
            real = urllib.parse.parse_qs(urllib.parse.urlparse(href).query).get("uddg", [href])[0]
            if titulo and real.startswith("http"):
                fuentes.append({"titulo": titulo[:90], "url": real})
            if len(fuentes) >= n:
                break
        return fuentes
    except Exception as e:
        print(f"[APPO] Búsqueda de inspiración falló: {e}", flush=True)
        return []


def salvage_plan(clean: str, user_prompt: str):
    """Rescata campos básicos si el JSON viene truncado."""
    def grab(field):
        m = re.search(r'"%s"\s*:\s*"((?:[^"\\]|\\.)*)"' % field, clean, re.S)
        if not m:
            return None
        try:
            return json.loads('"' + m.group(1) + '"')
        except Exception:
            return m.group(1)

    nombre = grab("nombre_proyecto") or "Tu proyecto"
    descripcion = grab("descripcion") or user_prompt
    html_val = grab("html")
    if not html_val:
        m = re.search(r'"html"\s*:\s*"(.*)$', clean, re.S)
        if m:
            partial = m.group(1).rsplit('"', 1)[0]
            try:
                html_val = json.loads('"' + partial + '"')
            except Exception:
                html_val = partial.encode().decode("unicode_escape", "ignore")
    if not html_val:
        html_val = f"<h1>{html.escape(nombre)}</h1><p>{html.escape(descripcion)}</p>"
    return {"nombre_proyecto": nombre, "descripcion": descripcion, "html": html_val}


def generar(user_prompt: str):
    fuentes = buscar_inspiracion(user_prompt)
    ref_text = "\n".join(f"- {f['titulo']} ({f['url']})" for f in fuentes) \
        or "(No se encontraron referencias; usa tu propio criterio de diseño.)"

    system_prompt = (
        "Eres un Diseñador de Producto y Front-end de Ap-Ab. Construyes el prototipo "
        "VISUAL e INTERACTIVO de la idea del usuario, inspirándote en 2 o 3 de las páginas "
        "web reales de referencia que te doy.\n\n"
        "REGLA CLAVE: el layout debe ser RADICALMENTE distinto según el dominio. "
        "Una app de delivery (lista de restaurantes, carrito, mapa, categorías) NO se debe "
        "parecer en nada a un juego (área de juego, marcador, controles), ni a un dashboard "
        "(gráficas, KPIs, tablas), ni a una red social, etc. Tienes LIBERTAD TOTAL de estructura. "
        "Usa contenido de ejemplo realista del dominio (nombres, precios, datos plausibles).\n\n"
        "FUNCIONALIDAD: incluye al menos 2-3 elementos que de verdad FUNCIONEN con JavaScript "
        "(p. ej. pestañas que cambian, botón que agrega al carrito y actualiza un total, filtro "
        "que oculta tarjetas, un contador, un mini-juego con bucle en <canvas>, etc.). "
        "Nada de enlaces muertos: todo lo interactivo debe responder.\n\n"
        "ESTILO: NO inventes colores fijos. Usa SIEMPRE estas variables CSS ya definidas por el "
        "tema del usuario: var(--bg), var(--fg), var(--title), var(--accent), var(--accent-fg), "
        "var(--card), var(--border), var(--cta-bg), var(--cta-fg) y border-radius var(--radius). "
        "Puedes usarlas con opacidad o mezclas, pero no hardcodees hex.\n\n"
        "Responde ÚNICAMENTE con un objeto JSON válido EXACTO:\n"
        "{\n"
        '  "nombre_proyecto": "string corto",\n'
        '  "descripcion": "frase específica del dominio",\n'
        '  "html": "HTML del cuerpo: incluye <style> propio para el layout y <script> para la interactividad. Debe caber en un panel de ~600px de alto y ser responsive al ancho del contenedor. NO incluyas <html>, <head> ni <body>.",\n'
        '  "fuentes": [{"nombre": "string", "url": "string", "idea_tomada": "qué inspiró"}]\n'
        "}\n"
        "IMPORTANTE: sé COMPACTO en el HTML/CSS (sin comentarios, sin saltos de línea "
        "innecesarios, CSS en pocas líneas) para no exceder el límite de tokens y que el "
        "JSON quede COMPLETO y cerrado. "
        "Escapa correctamente las comillas dentro de 'html'. No incluyas texto fuera del JSON."
    )
    user_input = (
        f"Idea del usuario: {user_prompt}\n\n"
        f"Páginas web de referencia encontradas en internet:\n{ref_text}"
    )
    model_name = os.getenv("PLANNER_MODEL", "deepseek-v4-pro")

    raw = call_ai_model(system_prompt, user_input, model_name, max_tokens=8000)
    clean = extract_clean_json(raw)
    try:
        plan = json.loads(clean)
    except Exception:
        plan = salvage_plan(clean, user_prompt)

    if not plan.get("fuentes") and fuentes:
        plan["fuentes"] = [{"nombre": f["titulo"], "url": f["url"], "idea_tomada": ""} for f in fuentes]
    return plan


class handler(BaseHTTPRequestHandler):
    def _send(self, status, payload):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode("utf-8"))

    def do_OPTIONS(self):
        self._send(200, {"ok": True})

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length) if length else b"{}"
            data = json.loads(body or b"{}")
            user_prompt = (data.get("user_prompt") or "").strip()
            if not user_prompt:
                return self._send(400, {"error": "Falta user_prompt"})
            plan = generar(user_prompt)
            return self._send(200, {"status": "success", "plan": plan})
        except Exception as e:
            tb = traceback.format_exc()
            print(f"[APPO] Error: {e}\n{tb}", flush=True)
            return self._send(500, {"error": str(e), "trace": tb})
