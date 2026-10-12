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

En modo local **cada agente usa un modelo Claude distinto**: tres familias (Haiku, Sonnet y Opus) y dos generaciones. Se configuran en el bloque `AGENTS` de `server.js` (`model` y `effort`), y la web muestra el modelo y el prompt de cada agente en su tarjeta. Al hacer clic, la tarjeta se da vuelta.

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
- Los grupos (pestaña Casos Grupales) se guardan en `datos/grupos.json` (no se sube a git).
- Los agentes corren con la cuenta con la que está autenticada la CLI. Si esa cuenta pertenece a una organización con instrucciones propias, esas instrucciones también llegan a los agentes y pueden aparecer en las respuestas. Para la demo conviene una cuenta sin instrucciones de organización.

### Modo Vercel — Claude Haiku API (~4s por agente)

Los 6 agentes usan el mismo modelo (Claude Haiku 4.5). Los grupos se guardan en JSONBlob: los 10 blobs de `api/groups.js` estaban caducados al 12-10-2026 (el keepalive reportaba 10 de 10 caídos), así que antes de usar esta versión hay que crear blobs nuevos y volver a desplegar.

Despliega la carpeta `web/` en Vercel y configura la variable de entorno:

```
ANTHROPIC_API_KEY=sk-ant-...
```

```bash
cd web
vercel --prod
```

---

## Estructura del repositorio

```
├── server.js              # Servidor local: agentes con claude CLI (un modelo por agente) + grupos en datos/
├── web/
│   ├── index.html         # Frontend: 4 tabs (Resumen, Financiero, Grupos, Multi-Agente)
│   ├── vercel.json        # Configuración Vercel
│   └── api/
│       ├── agent.js       # Serverless: llama a Claude Haiku vía API
│       └── groups.js      # Serverless: persistencia de grupos (JSONBlob)
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

Desarrollado con [Claude Code](https://claude.ai/code) · Anthropic 2025
