# Sistema Multi-Agente IA — Business Case

Pipeline de 6 agentes Claude para generar Business Cases bancarios. Desarrollado para el Programa Certificado en Project Management.

**Demo en producción:** https://vercel-deploy-jet-tau.vercel.app

---

## Arquitectura

```
Idea de proyecto
      │
      ▼
┌─────────────┐
│ Orquestador │  desglosa en hipótesis
└──────┬──────┘
       │
  ┌────┴──────────────────────────┐
  │         (en paralelo)         │
  ▼          ▼          ▼         ▼
Research   Finanzas   Legal    Riesgos
  │          │          │         │
  └────┬─────┴──────────┴─────────┘
       │
       ▼
┌─────────────┐
│  Redactor   │  Business Case ejecutivo
└─────────────┘
```

**Tiempo total (modo local, medido el 12-10-2026):** ~2,5 min. Orquestador 14 s, los 4 especialistas en paralelo (el más lento, Legal, 73 s) y el Redactor 57 s.

---

## Modos de ejecución

### Para alumnos: ejecútalo en tu computador

Cada alumno usa su propia cuenta de Claude. Los agentes consumen el uso de esa cuenta (una ejecución completa tarda unos 2,5 min).

1. Instala [Node.js](https://nodejs.org) 18 o superior y Claude Code: `npm install -g @anthropic-ai/claude-code`
2. Ejecuta `claude` una vez e inicia sesión con tu cuenta de Claude.
3. Descarga el proyecto y arranca el servidor:
   ```bash
   git clone https://github.com/ssaravia25/multiagente-bc-lasalle.git
   cd multiagente-bc-lasalle
   node server.js
   ```
4. Abre http://localhost:3001 y entra en la pestaña **Multi-Agente IA**.

### Modo local — Claude Code CLI (sin costo adicional)

Usa tu suscripción de Claude Code existente. No necesita API key.

**Requisitos:**
- Node.js ≥ 18
- [Claude Code CLI](https://claude.ai/code) instalado y autenticado

```bash
node server.js
# Abre http://localhost:3001
```

En modo local **cada agente usa un modelo Claude distinto**: tres familias (Haiku, Sonnet y Opus) y dos generaciones. Se configuran en `web/agents.json` (`model`, `effort`, explicación y prompt), que leen tanto `server.js` como la web. Cada tarjeta muestra el modelo del agente y, al hacer clic, se da vuelta y enseña su prompt.

| Agente | Modelo | Esfuerzo | Por qué |
|--------|--------|----------|---------|
| Orquestador | Claude Haiku 5.5 | bajo | Tarea corta (JSON) que bloquea a todo el pipeline: prima la velocidad |
| Research | Claude Sonnet 5.5 | bajo | Análisis amplio de mercado: equilibrio entre calidad, velocidad y costo |
| Finanzas | Claude Opus 5 | bajo | Razonamiento cuantitativo encadenado: gama alta (generación anterior) |
| Legal | Claude Sonnet 4.6 | bajo | Normativa conocida y estable (generación anterior) |
| Riesgos | Claude Haiku 4.5 | — | Salida acotada y con formato fijo; el mismo modelo de la versión Vercel |
| Redactor | Claude Opus 5.5 | medio | El documento que decide: el modelo más capaz del sistema |

- Cada agente se ejecuta con `claude --print --model <modelo> --effort <nivel> --system-prompt <prompt> --tools ""`: el prompt del agente reemplaza al de Claude Code y el agente no usa herramientas.
- Sin `--effort`, Claude Code razona con su nivel por defecto (alto) y el pipeline tarda ~6 min.
- Al terminar el agente Finanzas se dibuja el gráfico **Flujo de caja del proyecto** (antes, la tarjeta muestra un aviso): barras con el flujo de cada año y la curva del flujo acumulado descontado, que termina en el VAN y marca el payback. Los datos salen de un bloque `json` que el agente agrega al final de su respuesta; el VAN del gráfico se recalcula con esos flujos.
- Los grupos (pestaña Casos Grupales) son los mismos de la web: el servidor local los lee y guarda en Vercel (`GROUPS_URL` para apuntar a otro despliegue).
- Los agentes corren con la cuenta con la que está autenticada la CLI. Si esa cuenta pertenece a una organización con instrucciones propias, esas instrucciones también llegan a los agentes y pueden aparecer en las respuestas. Para la demo conviene una cuenta sin instrucciones de organización.

### Versión web (Vercel) — inscripción de grupos

https://vercel-deploy-jet-tau.vercel.app es la página que usan los alumnos para inscribir su grupo, guardar su Business Case y votar. Muestra las tarjetas de los agentes (modelo y prompt), pero el pipeline multi-agente se ejecuta en local.

- **Grupos:** se guardan en Vercel Blob (store `bc-grupos-lasalle`, conectado al proyecto; Vercel crea solo la variable `BLOB_READ_WRITE_TOKEN`). Cada número de grupo se reserva una sola vez: si otro equipo ya lo tiene, la página lo avisa. Cada grupo vota una sola vez y su voto no se pierde al volver a guardar.
- **Reset de datos:** pide la clave de administrador, que verifica el servidor. Configúrala en Vercel con `vercel env add ADMIN_PIN production`; si no existe, se usa la clave por defecto del código.
- **Desplegar:** siempre desde `web/`:
  ```bash
  cd web
  vercel --prod
  ```

---

## Estructura del repositorio

```
├── server.js              # Servidor local: agentes con claude CLI (un modelo por agente); grupos vía Vercel
├── web/
│   ├── index.html         # Frontend: 4 tabs (Resumen, Financiero, Grupos, Multi-Agente)
│   ├── agents.json        # Modelo, esfuerzo, explicación y prompt de cada agente
│   ├── package.json       # Dependencia de Vercel Blob
│   ├── vercel.json        # Configuración Vercel
│   └── api/
│       ├── agent.js       # Serverless: desactivado en la web (solo responde si hay ANTHROPIC_API_KEY)
│       └── groups.js      # Serverless: grupos, votos y reset en Vercel Blob
└── scripts/
    └── financial_module.gs  # Google Apps Script: módulo financiero interactivo (VAN/TIR/ROI/Payback)
```

---

## Agentes

| Agente | Rol | Input | Output |
|--------|-----|-------|--------|
| **Orquestador** | Desglosa la idea en hipótesis | Idea libre | JSON con 5 hipótesis |
| **Research** | Análisis de mercado y competencia | Hipótesis de mercado | Markdown estructurado |
| **Finanzas** | Proyección financiera | Hipótesis financiera | VAN, TIR, ROI, Payback |
| **Legal** | Marco regulatorio (PSD2, GDPR, DORA…) | Hipótesis legal | Normativas y riesgos |
| **Riesgos** | Evaluación de riesgos | Hipótesis de riesgo | Top 5 riesgos + mitigantes |
| **Redactor** | Síntesis ejecutiva | Todos los outputs | Business Case completo |

---

## Módulo Financiero (Google Sheets)

El archivo `scripts/financial_module.gs` genera un Google Sheet interactivo con fórmulas dinámicas:

1. Abre [script.google.com](https://script.google.com) → Nuevo proyecto
2. Pega el contenido de `financial_module.gs`
3. Ejecuta `createFinancialModule()`
4. Edita las celdas amarillas en la hoja **VAN** → todo se recalcula automáticamente

Hojas generadas: Dashboard · VAN · TIR · ROI · Payback · Sensibilidad · Comparativa

---

## Caso práctico: Banco SIV

El sistema viene preconfigurado con el caso del Banco SIV (pérdida de clientes Gen Z). Tres alternativas:

| Alternativa | Inversión | WACC |
|-------------|-----------|------|
| App Fintech Gen Z | €8M | 12% |
| Alianza Neobank | €3M | 10% |
| Rediseño Digital | €5M | 11% |

---

Desarrollado con [Claude Code](https://claude.ai/code) · Anthropic 2026
