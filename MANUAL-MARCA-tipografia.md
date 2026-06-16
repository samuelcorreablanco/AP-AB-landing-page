# Ap-Ab — Tipografía (sección para el manual de marca)

La identidad usa **dos** familias tipográficas, ambas gratuitas y de uso comercial libre
(Google Fonts / SIL Open Font License). Una para titulares e interfaz, otra para
etiquetas y datos técnicos.

---

## 1. Las dos fuentes

### Archivo — fuente principal (titulares y texto)
- **Uso:** logo, titulares, subtítulos, párrafos, nombres, botones de marca.
- **Carácter:** grotesca condensada, fuerte, geométrica. Da el tono "brutalista" y directo.
- **Pesos usados:** 600 (semibold), 700 (bold), 800 (extrabold), 900 (black).
  - 900 → titulares grandes y logo.
  - 600–700 → texto y subtítulos.

### Space Mono — fuente secundaria (acentos técnicos)
- **Uso:** menú/navegación, etiquetas (`card-tag`), datos de las stats, botones,
  el ticker lateral, mensajes tipo "terminal".
- **Carácter:** monoespaciada, evoca código/consola. Refuerza el "construimos software".
- **Pesos usados:** 400 (regular), 700 (bold).
- **Regla de uso:** casi siempre en MAYÚSCULAS y con un poco de tracking
  (`letter-spacing` ~0.02–0.08em).

> Regla rápida: **Archivo = lo que se lee. Space Mono = lo que etiqueta/mide.**

---

## 2. Cómo se integra (técnico)

### Opción A — Google Fonts (lo que usa la web hoy)
En el `<head>` de cada página:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800;900&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />
```

### Opción B — Auto-alojada (recomendada para el manual / piezas offline)
1. Descarga las familias desde Google Fonts (botón "Get font" → "Download").
2. Súbelas a tu carpeta de marca o al hosting.
3. Decláralas con `@font-face` o el CSS que entrega Google.

### En CSS, los font-family que usa la web
```css
/* Principal */
font-family: "Archivo", system-ui, sans-serif;
/* Secundaria */
font-family: "Space Mono", monospace;
```
Los **fallbacks** importan: si la fuente no carga, `system-ui`/`monospace`
mantienen la jerarquía sin romper el diseño.

---

## 3. Jerarquía de uso (cómo se aplica en la web)

| Elemento                     | Fuente      | Peso | Notas                                   |
|------------------------------|-------------|------|-----------------------------------------|
| Logo "AP-AB"                 | Archivo     | 900  | tracking negativo (-0.02em)             |
| Titulares (h1/h2)            | Archivo     | 900  | line-height ajustado (~0.92)            |
| Subtítulos / lead            | Archivo     | 600  | tamaño fluido                           |
| Párrafos                     | Archivo     | 600  |                                         |
| Cifras destacadas (stats)    | Archivo     | 900  | en blanco hueso (`--off`)               |
| Menú / navegación            | Space Mono  | 700  | MAYÚSCULAS, tracking 0.02em             |
| Etiquetas (`card-tag`)       | Space Mono  | 700  | MAYÚSCULAS, tracking 0.06–0.08em        |
| Botones                      | Space Mono  | 700  | MAYÚSCULAS                              |
| Ticker lateral               | Space Mono  | 700  | vertical, MAYÚSCULAS                    |

---

## 4. Escala tipográfica (responsiva)

La web usa tamaños **fluidos** con `clamp(min, ideal, max)` para que escalen
del móvil al escritorio:

- Titular hero: `clamp(32px, 6.4vw, 92px)`
- Título de sección: `clamp(34px, 6vw, 72px)`
- Cifra grande (stat): `clamp(28px, 4vw, 46px)`
- Lead / subtítulo: `clamp(16px, 2vw, 22px)`
- Etiquetas y mono: 12–14px fijos

Para el manual basta con mostrar 3 escalones: **Display (900)**, **Texto (600/700)**
y **Etiqueta mono (700, mayúsculas)**.

---

## 5. Reglas y "no hacer"

- ✅ Titulares siempre en **Archivo 900**, nunca en Space Mono.
- ✅ Etiquetas/datos/botones en **Space Mono mayúsculas**.
- ✅ Mantener el tracking ligero en Space Mono (mejora legibilidad en mayúsculas).
- ❌ No usar Space Mono para párrafos largos (cansa la lectura).
- ❌ No mezclar más pesos de los listados (600/700/800/900 y 400/700).
- ❌ No sustituir por fuentes "parecidas" del sistema en piezas oficiales.

---

## 6. Licencia

Ambas (**Archivo** y **Space Mono**) están bajo **SIL Open Font License 1.1**:
uso comercial gratuito, se pueden incrustar en web, apps y piezas impresas.
Fuente oficial: Google Fonts.

- Archivo: https://fonts.google.com/specimen/Archivo
- Space Mono: https://fonts.google.com/specimen/Space+Mono
