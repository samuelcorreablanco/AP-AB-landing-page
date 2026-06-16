# Cargar variables de entorno ANTES de importar utils (el registro de modelos
# lee las API keys en tiempo de importación).
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import json
import re
import html
import urllib.parse
import urllib.request
import utils
import os

app = FastAPI(title="APPO Planner - Standalone Server")

# Permitir que la landing (Vercel / localhost) llame a este servidor desde el navegador.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # en producción puedes restringir a tu dominio
    allow_methods=["*"],
    allow_headers=["*"],
)


class PlannerRequest(BaseModel):
    user_prompt: str


def buscar_inspiracion(query: str, n: int = 3):
    """
    Busca en internet (DuckDuckGo HTML) ejemplos reales relacionados con la idea
    y devuelve hasta `n` fuentes [{titulo, url}]. Si falla la red, retorna [].
    No requiere API key ni dependencias extra (urllib es stdlib).
    """
    try:
        q = urllib.parse.quote(query + " ejemplo sitio web diseño")
        url = f"https://html.duckduckgo.com/html/?q={q}"
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
        request = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(request, timeout=8) as resp:
            page = resp.read().decode("utf-8", errors="ignore")

        # Extraer titulo + enlace de los resultados
        pattern = re.compile(r'<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)</a>', re.S)
        fuentes = []
        for m in pattern.finditer(page):
            href = html.unescape(m.group(1))
            titulo = html.unescape(re.sub(r"<[^>]+>", "", m.group(2))).strip()
            # DuckDuckGo envuelve la URL real en ?uddg=
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
    """
    Si el JSON viene truncado (p. ej. por límite de tokens), intenta rescatar
    los campos básicos y el HTML parcial para no caer al fallback genérico.
    """
    def grab(field):
        m = re.search(r'"%s"\s*:\s*"((?:[^"\\]|\\.)*)"' % field, clean, re.S)
        if not m:
            return None
        try:
            return json.loads('"' + m.group(1) + '"')  # desescapa \n \" etc.
        except Exception:
            return m.group(1)

    nombre = grab("nombre_proyecto") or "Tu proyecto"
    descripcion = grab("descripcion") or user_prompt
    html_val = grab("html")

    if not html_val:
        # Intentar tomar el HTML aunque la cadena haya quedado sin cerrar
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


@app.post("/generar_plan")
async def generar_plan(req: PlannerRequest):
    try:
        # 1) Buscar inspiración real en internet
        fuentes = buscar_inspiracion(req.user_prompt)
        ref_text = "\n".join(
            f"- {f['titulo']} ({f['url']})" for f in fuentes
        ) or "(No se encontraron referencias; usa tu propio criterio de diseño.)"

        # 2) Pedir el render como HTML interactivo, inspirado en las fuentes
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
            f"Idea del usuario: {req.user_prompt}\n\n"
            f"Páginas web de referencia encontradas en internet:\n{ref_text}"
        )
        model_name = os.getenv("PLANNER_MODEL", "gpt-5.5")

        raw = utils.call_ai_model(
            system_prompt=system_prompt,
            user_prompt=user_input,
            model_name=model_name,
            force_json=True,
            max_tokens=8000,
        )

        # 3) Parseo robusto (con rescate si el JSON viene truncado)
        clean = utils.extract_clean_json(raw)
        plan = None
        try:
            plan = json.loads(clean)
        except Exception:
            plan = salvage_plan(clean, req.user_prompt)

        # Garantizar que las fuentes reales viajen al frontend
        if not plan.get("fuentes") and fuentes:
            plan["fuentes"] = [{"nombre": f["titulo"], "url": f["url"], "idea_tomada": ""} for f in fuentes]

        return {"status": "success", "plan": plan}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
