import re
import os
import logging
import asyncio
from openai import OpenAI

logger = logging.getLogger("appo.utils")

# ============================================================
# UNIVERSAL MODEL REGISTRY
# ============================================================
# Map everything to OpenAI-compatible endpoints.
# This eliminates all provider-specific conditional spaghetti.
# ============================================================
MODEL_REGISTRY = {
    "gpt-5.5": {
        "url": None, # OpenAI uses default URL if None
        "key": os.getenv("OPENAI_API_KEY")
    },
    "deepseek-v4-pro": {
        "url": "https://api.deepseek.com",
        "key": os.getenv("DEEPSEEK_API_KEY")
    },
    "gemini-3.1-pro": {
        "url": "https://generativelanguage.googleapis.com/v1beta/openai/",
        "key": os.getenv("GEMINI_API_KEY")
    },
    "claude-opus-4-7": {
        "url": "https://api.anthropic.com/v1", # Replace with your OpenRouter/Proxy URL if needed
        "key": os.getenv("ANTHROPIC_API_KEY")
    }
}


def extract_clean_json(raw_text: str) -> str:
    """
    Extrae limpiamente el JSON contenido en una respuesta, eliminando etiquetas
    markdown (como ```json) y texto alucinado que esté fuera de las llaves principales.
    """
    if not raw_text:
        return ""
        
    # Paso 1: Eliminar las etiquetas típicas de markdown
    clean_text = re.sub(r'```[a-zA-Z]*', '', raw_text)
    clean_text = clean_text.replace('```', '')
    
    # Paso 2: Aislar el bloque JSON principal
    start_brace = clean_text.find('{')
    start_bracket = clean_text.find('[')
    
    # Determinar dónde empieza el JSON
    if start_brace == -1 and start_bracket == -1:
        return clean_text.strip()
    elif start_brace != -1 and start_bracket != -1:
        start_idx = min(start_brace, start_bracket)
    else:
        start_idx = max(start_brace, start_bracket)
        
    end_brace = clean_text.rfind('}')
    end_bracket = clean_text.rfind(']')
    
    # Determinar dónde termina
    if end_brace == -1 and end_bracket == -1:
        end_idx = len(clean_text)
    elif end_brace != -1 and end_bracket != -1:
        end_idx = max(end_brace, end_bracket) + 1
    else:
        end_idx = max(end_brace, end_bracket) + 1
        
    extracted = clean_text[start_idx:end_idx].strip()
    print(f'--- [JSON LIMPIO] ---\n{extracted}', flush=True)
    return extracted


def sanitize_folder_name(raw_name: str) -> str:
    """
    Sanitiza un nombre de carpeta para que sea válido en Windows.
    - Reemplaza espacios por guiones bajos
    - Elimina caracteres inválidos en Windows: \\ / : * ? " < > |
    - Elimina puntos iniciales/finales
    - Si queda vacío, retorna 'Proyecto_Sin_Nombre'
    
    NO añade timestamps, UUIDs ni contadores. El nombre resultante
    es EXACTAMENTE lo que el usuario escribió, sanitizado.
    """
    if not raw_name or not raw_name.strip():
        return "Proyecto_Sin_Nombre"
    
    # Reemplazar espacios por guiones bajos
    sanitized = raw_name.strip().replace(" ", "_")
    
    # Eliminar caracteres inválidos en Windows
    sanitized = re.sub(r'[\\/:*?"<>|]', '', sanitized)
    
    # Eliminar puntos iniciales/finales (Windows los odia)
    sanitized = sanitized.strip('.')
    
    # Si después de sanitizar quedó vacío
    if not sanitized:
        return "Proyecto_Sin_Nombre"
    
    return sanitized


def call_ai_model(
    system_prompt: str,
    user_prompt: str,
    model_name: str = "gpt-5.5",
    force_json: bool = True,
    max_tokens: int = 10200,
    emit_fn = None,
    loop = None,
    image_base64: str = None
) -> str:
    """
    FACTORY CENTRAL: Llama al modelo de IA usando el cliente unificado de OpenAI.
    """
    print(f"[APPO] Llamando a: model={model_name}", flush=True)
    
    # 1. Buscar credenciales
    config = MODEL_REGISTRY.get(model_name)
    if not config or not config["key"]:
        print(f"[WARNING] Fallback a modelo seguro por falta de credenciales o configuración: {model_name}", flush=True)
        model_name = "gpt-5.5" # Fallback por defecto
        config = MODEL_REGISTRY.get(model_name, {"url": None, "key": ""})
    
    # 2. Instanciar cliente único
    client_kwargs = {"api_key": config["key"] or "dummy_key"}
    if config["url"]:
        client_kwargs["base_url"] = config["url"]
        
    client = OpenAI(**client_kwargs)
    
    # 3. Llamada estandarizada
    try:
        user_content = user_prompt
        if image_base64:
            user_content = [
                {"type": "text", "text": user_prompt},
                {"type": "image_url", "image_url": {"url": image_base64}}
            ]
            
        kwargs = {
            "model": model_name,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content}
            ],
            "max_tokens": max_tokens,
        }
        if force_json:
            kwargs["response_format"] = {"type": "json_object"}
            
        response = client.chat.completions.create(**kwargs)
        content = response.choices[0].message.content
        print(f"[APPO] Respuesta recibida de {model_name}. Largo: {len(content)} chars", flush=True)
        return content
            
    except Exception as e:
        logger.error(f"Falló el modelo {model_name}: {e}")
        if emit_fn and loop:
            error_msg = f"Error crítico llamando a {model_name}: {e}"
            asyncio.run_coroutine_threadsafe(
                emit_fn({"type": "chat_message", "tab": "Terminal", "message": error_msg}), 
                loop
            )
        raise e


def call_ai_model_raw(
    model_name: str,
    messages: list,
    tools: list = None,
    max_tokens: int = 8192,
    temperature: float = 0.0,
):
    """
    Llamada de bajo nivel para el Action-Observation Loop de appo_brain.py.
    Soporta tool calling y retorna el objeto message completo.
    """
    config = MODEL_REGISTRY.get(model_name)
    if not config or not config["key"]:
        model_name = "gpt-5.5"
        config = MODEL_REGISTRY.get(model_name, {"url": None, "key": ""})
        
    client_kwargs = {"api_key": config["key"] or "dummy_key"}
    if config["url"]:
        client_kwargs["base_url"] = config["url"]
        
    client = OpenAI(**client_kwargs)
    
    kwargs = {
        "model": model_name,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if tools:
        kwargs["tools"] = tools
    
    response = client.chat.completions.create(**kwargs)
    choice = response.choices[0]
    usage = response.usage
    input_t = usage.prompt_tokens if usage else 0
    output_t = usage.completion_tokens if usage else 0
    
    return {
        "message": choice.message,
        "input_tokens": input_t,
        "output_tokens": output_t,
    }
