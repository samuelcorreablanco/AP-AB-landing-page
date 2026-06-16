# Como correr este proyecto

Lo desarrollaste/arreglaste con **ABBI**. Hay UN solo lanzador (el mismo codigo adentro), en 3 archivos -- usa el de TU sistema:

| Tu computadora | Hace esto |
|---|---|
| macOS | Doble clic en `INICIAR-Mac.command` |
| Windows | Doble clic en `INICIAR-Windows.bat` |
| Linux | Doble clic (o `./INICIAR-Linux.sh` en la terminal) |

Se abre una ventana negra: **dejala abierta** mientras uses la app. Ahi aparece la
direccion exacta (http://127.0.0.1:PUERTO/ — el puerto puede variar si el 8000 esta
ocupado). Para apagar: Ctrl+C o cerrar la ventana.

## Windows: 2-3 lineas de 'no se reconoce...' al abrir
Es NORMAL (el archivo es el mismo para los 3 sistemas; Windows saltea las lineas de Mac/Linux). El juego arranca igual unos segundos despues.

## Si macOS no te deja abrirlo (archivo bajado de internet)
Es el aviso normal de seguridad para archivos que llegan por mail/chat/descarga:
1. **Click derecho** (o Ctrl+click) sobre `INICIAR-Mac.command` -> **Abrir** -> **Abrir**.
2. Si dice 'permiso denegado': abri Terminal en esta carpeta y corre `sh INICIAR-Mac.command`.

## Si macOS pide instalar 'herramientas de linea de comandos'
Acepta (es Python de Apple, una sola vez) y volve a abrir el lanzador.

## Windows: si dice que no encuentra Python
Instala Python desde python.org (el instalador trae el 'py launcher' que este proyecto
usa). Si igual falla, reinstala dejando marcado **Add python.exe to PATH**.

## Para mandarselo a alguien
Manda el archivo **`.zip`** (no la carpeta suelta): el zip conserva los permisos que el
doble clic necesita en Mac/Linux.

## Detalles detectados
- Tipo: **static** (static)
- Entry: `index.html`
- UI: `index.html`
- Comando: `(estatico)`
- Puerto preferido: 8000 (si esta ocupado, el launcher elige otro libre y te lo muestra)

Abrir index.html (servido en http://127.0.0.1:8000).
