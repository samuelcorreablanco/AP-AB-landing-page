/**
 * Lógica de Interfaz y Cliente HTTP - APPO Planner Standalone
 * Implementación en Vanilla JavaScript Puro
 */

document.addEventListener('DOMContentLoaded', () => {
    // 1. Inicialización del estado global requerido
    window.masterSummary = window.masterSummary || {};
    window.masterSummary.dra = null;

    // 2. Referencias a nodos del DOM
    const viewInput = document.getElementById('view-input');
    const viewLoading = document.getElementById('view-loading');
    const viewDra = document.getElementById('view-dra');
    
    const btnSubmit = document.getElementById('btn-submit');
    const btnSave = document.getElementById('btn-save');
    const userPromptInput = document.getElementById('user-prompt');
    const draDynamicFields = document.getElementById('dra-dynamic-fields');
    const terminalText = document.querySelector('.terminal-loader .text');

    // Textos rotativos para la fase de espera inmersiva
    const loadingTexts = [
        "Analizando requerimientos",
        "Diseñando arquitectura nativa",
        "Estructurando base de datos",
        "Compilando modelo DRA",
        "Finalizando plan técnico"
    ];
    let loadingInterval = null;

    // 3. Controlador de Vistas SPA
    function switchView(viewId) {
        document.querySelectorAll('.view').forEach(view => {
            view.classList.remove('active');
        });
        document.getElementById(viewId).classList.add('active');
    }

    function startLoadingAnimation() {
        let index = 0;
        terminalText.textContent = loadingTexts[index];
        loadingInterval = setInterval(() => {
            index = (index + 1) % loadingTexts.length;
            terminalText.textContent = loadingTexts[index];
        }, 2500);
    }

    function stopLoadingAnimation() {
        if (loadingInterval) {
            clearInterval(loadingInterval);
            loadingInterval = null;
        }
    }

    // 4. Lógica de Petición HTTP (Fetch)
    btnSubmit.addEventListener('click', async () => {
        const promptText = userPromptInput.value.trim();
        if (!promptText) {
            alert('Por favor, ingrese un requerimiento válido.');
            return;
        }

        // Cambiar a pantalla de carga inmersiva
        switchView('view-loading');
        startLoadingAnimation();

        try {
            // El endpoint FastAPI del microservicio APPO_Planner_Standalone
            const response = await fetch('http://127.0.0.1:8000/generar_plan', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ user_prompt: promptText })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            // Procesar y renderizar la salida
            renderDynamicForm(data);
            
            stopLoadingAnimation();
            switchView('view-dra');

        } catch (error) {
            console.error('Error al comunicarse con APPO Planner:', error);
            stopLoadingAnimation();
            alert('Error de conexión. Asegúrese de que el servidor APPO_Planner_Standalone esté en ejecución en el puerto 8000.');
            switchView('view-input');
        }
    });

    // 5. Motor de Renderizado Dinámico del DRA
    function renderDynamicForm(responseData) {
        draDynamicFields.innerHTML = '';
        
        let draContent = {};
        
        // Estrategia robusta de parseo JSON
        try {
            if (responseData.dra_summary) {
                if (typeof responseData.dra_summary === 'string') {
                    // Intenta extraer JSON si el LLM envolvió la respuesta en texto markdown
                    let cleanStr = responseData.dra_summary;
                    if (cleanStr.includes('```json')) {
                        cleanStr = cleanStr.split('```json')[1].split('```')[0].trim();
                    }
                    try {
                        draContent = JSON.parse(cleanStr);
                    } catch (e) {
                        draContent = { "resumen_tecnico": responseData.dra_summary };
                    }
                } else if (typeof responseData.dra_summary === 'object') {
                    draContent = responseData.dra_summary;
                }
            } else {
                draContent = responseData; // Fallback si la estructura cambia
            }
        } catch (e) {
            draContent = { "contenido_crudo": responseData };
        }

        // Generar campos iterando sobre las claves del JSON parseado
        for (const key in draContent) {
            if (draContent.hasOwnProperty(key)) {
                const groupDiv = document.createElement('div');
                groupDiv.className = 'form-group';
                
                const label = document.createElement('label');
                label.textContent = key.replace(/_/g, ' ');
                
                let inputElement;
                const value = draContent[key];
                
                // Determinación heurística del tipo de control de UI (input vs textarea)
                if (typeof value === 'object' && value !== null) {
                    inputElement = document.createElement('textarea');
                    inputElement.value = JSON.stringify(value, null, 2);
                    inputElement.rows = 5;
                } else if (typeof value === 'string' && (value.length > 80 || value.includes('\n'))) {
                    inputElement = document.createElement('textarea');
                    inputElement.value = value;
                    inputElement.rows = Math.min(Math.max(value.split('\n').length, 3), 10);
                } else {
                    inputElement = document.createElement('input');
                    inputElement.type = 'text';
                    inputElement.value = value !== null ? String(value) : '';
                }
                
                inputElement.dataset.key = key; // Metadata para guardado posterior
                
                groupDiv.appendChild(label);
                groupDiv.appendChild(inputElement);
                draDynamicFields.appendChild(groupDiv);
            }
        }
    }

    // 6. Lógica de Guardado en el Ecosistema ABBI/APPO
    btnSave.addEventListener('click', () => {
        const resultDra = {};
        const inputs = draDynamicFields.querySelectorAll('input, textarea');
        
        inputs.forEach(input => {
            const key = input.dataset.key;
            let value = input.value;
            
            // Revertir parseo si el usuario editó un string de JSON válido
            try {
                if ((value.startsWith('{') && value.endsWith('}')) || (value.startsWith('[') && value.endsWith(']'))) {
                    value = JSON.parse(value);
                }
            } catch(e) {
                // Si el parseo falla, se preserva como string puro
            }
            
            resultDra[key] = value;
        });

        // Actualización estricta de la variable global solicitada
        window.masterSummary.dra = resultDra;
        console.log('[APPO Planner] Guardado exitoso en window.masterSummary.dra:', window.masterSummary.dra);
        
        // Efecto visual de retroalimentación en el botón
        const originalText = btnSave.textContent;
        btnSave.textContent = '¡DRA GUARDADO!';
        btnSave.classList.replace('blue-accent', 'green-accent');
        
        setTimeout(() => {
            btnSave.textContent = originalText;
            btnSave.classList.replace('green-accent', 'blue-accent');
        }, 3000);
    });
});
