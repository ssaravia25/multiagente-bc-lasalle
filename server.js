/**
 * Servidor local Multi-Agente — Business Case CaixaBank 2025
 *
 * Usa tu cuenta de Claude Code (sin API key extra, sin costo adicional).
 * Cada agente se ejecuta con `claude --print --model <modelo>` usando tu suscripción,
 * y cada uno usa un modelo Claude distinto (ver AGENTS más abajo).
 *
 * Requisitos:
 *   - Node.js >= 18
 *   - Claude Code CLI instalado y autenticado  (npm install -g @anthropic-ai/claude-code)
 *
 * Uso:
 *   node server.js
 *   Abre:  http://localhost:3001
 */

const http  = require('http');
const fs    = require('fs');
const os    = require('os');
const path  = require('path');
const { spawn } = require('child_process');

const PORT          = 3001;
const HTML_FILE     = path.join(__dirname, 'web', 'index.html');
const GROUPS_FILE   = path.join(__dirname, 'datos', 'grupos.json'); // grupos guardados en local
const AGENT_TIMEOUT = 5 * 60 * 1000;                                 // corta un agente colgado a los 5 min

// ─── AGENTES: modelo, explicación y prompt ────────────────────────────────────
// Seis agentes, seis modelos distintos: tres familias (Haiku, Sonnet, Opus) × dos generaciones.
// Para cambiar el modelo de un agente basta con editar `model` (cualquier ID que acepte `claude --model`).
// `effort` controla cuánto razona el modelo antes de responder (low, medium, high): más esfuerzo = más lento.
// Sin `effort`, Claude Code usa su nivel por defecto, que es alto: con Opus, el pipeline completo tarda ~6 min.
// Haiku 4.5 no admite niveles de esfuerzo (null).
// Todo lo de este bloque se muestra en las tarjetas de la web (frente y reverso).

const AGENTS = {
  orchestrator: {
    name: 'Orquestador', icon: '🎯', color: '#3b82f6',
    model: 'claude-haiku-5-5', modelLabel: 'Claude Haiku 5.5', family: 'Haiku', generation: 'actual', effort: 'low',
    short: 'Descompone la idea',
    role: 'Lee la idea de proyecto y la convierte en un plan: un título y cuatro preguntas clave (mercado, finanzas, legal y riesgo), una para cada especialista. Es el punto de entrada: sin su plan, nadie más trabaja.',
    why: 'Tarea corta y muy estructurada (un JSON) que bloquea a todo el pipeline: aquí manda la velocidad. Haiku es el modelo más rápido y económico.',
    prompt: `Eres el Orquestador de un sistema multi-agente de Business Case para el sector bancario español.
Tu tarea: dado una idea de proyecto o iniciativa bancaria, desglósala en hipótesis clave que los agentes especializados deberán investigar.
Responde en español, de forma estructurada con estas 4 dimensiones (formato JSON):
{
  "titulo": "nombre del proyecto",
  "hipotesis_mercado": "pregunta clave para el agente de research",
  "hipotesis_financiera": "pregunta clave para el agente financiero",
  "hipotesis_legal": "pregunta clave para el agente legal",
  "hipotesis_riesgo": "pregunta clave para el agente de riesgos",
  "contexto_general": "resumen de 2-3 líneas del proyecto"
}
Sé preciso y relevante para banca/fintech española.`,
  },

  research: {
    name: 'Research', icon: '🔍', color: '#8b5cf6',
    model: 'claude-sonnet-5-5', modelLabel: 'Claude Sonnet 5.5', family: 'Sonnet', generation: 'actual', effort: 'low',
    short: 'Mercado y competencia',
    role: 'Analiza el tamaño del mercado, los competidores (fintechs y neobancos) y las tendencias del sector, y explica por qué ahora es el momento de actuar.',
    why: 'Análisis amplio, con mucho contexto de mercado: Sonnet equilibra calidad, velocidad y costo.',
    prompt: `Eres el Agente de Research de un sistema multi-agente de Business Case bancario.
Analiza el mercado, competencia y tendencias relevantes para la iniciativa propuesta.
Responde en español con estas secciones:

**ANÁLISIS DE MERCADO**
- Tamaño del mercado y segmento objetivo
- Principales competidores (fintechs y neobancos)
- Tendencias clave (Gen Z, digitalización, open banking)

**OPORTUNIDAD**
- Por qué ahora es el momento correcto
- Ventaja competitiva potencial

**DATOS RELEVANTES**
- 2-3 métricas o estadísticas del sector bancario español/europeo`,
  },

  finance: {
    name: 'Finanzas', icon: '💰', color: '#10b981',
    model: 'claude-opus-5', modelLabel: 'Claude Opus 5', family: 'Opus', generation: 'anterior', effort: 'low',
    short: 'VAN, TIR, ROI y payback',
    role: 'Propone los supuestos (inversión, ingresos a 5 años, WACC) y estima VAN, TIR, ROI y payback, con escenarios optimista, base y pesimista. Son estimaciones del modelo: hay que validarlas con el Módulo Financiero.',
    why: 'Razonamiento cuantitativo encadenado: conviene un modelo de gama alta. Usa Opus 5, la generación anterior de Opus.',
    prompt: `Eres el Agente Financiero de un sistema multi-agente de Business Case bancario.
Proyecta los indicadores financieros clave de la iniciativa propuesta.
Responde en español con estas secciones:

**SUPUESTOS BASE**
- Inversión estimada (CapEx + OpEx año 1)
- Ingresos proyectados años 1-5 (con justificación)
- Tasa de descuento (WACC) sugerida para banca española

**INDICADORES FINANCIEROS**
- VAN estimado (Valor Actual Neto)
- TIR estimada (Tasa Interna de Retorno)
- ROI aproximado
- Payback period

**ESCENARIOS**
- Optimista / Base / Pesimista (1 línea cada uno)`,
  },

  legal: {
    name: 'Legal', icon: '⚖️', color: '#f59e0b',
    model: 'claude-sonnet-4-6', modelLabel: 'Claude Sonnet 4.6', family: 'Sonnet', generation: 'anterior', effort: 'low',
    short: 'Regulación y cumplimiento',
    role: 'Identifica el marco regulatorio aplicable en España y Europa (PSD2, RGPD, DORA, Basilea III), las licencias necesarias, las obligaciones ante el Banco de España y el BCE, y los principales riesgos legales.',
    why: 'Normativa conocida y estable: no necesita el modelo más nuevo. Usa Sonnet 4.6, de la generación anterior.',
    prompt: `Eres el Agente Legal y Regulatorio de un sistema multi-agente de Business Case bancario.
Identifica el marco regulatorio aplicable en España/Europa.
Responde en español con estas secciones:

**MARCO REGULATORIO APLICABLE**
- Normativas clave (PSD2, GDPR, DORA, Basilea III, etc.)
- Licencias o permisos necesarios

**CONSIDERACIONES DE CUMPLIMIENTO**
- Requisitos de protección de datos
- Obligaciones de reporte al Banco de España / BCE
- Restricciones o limitaciones relevantes

**RIESGOS LEGALES**
- 2-3 riesgos legales principales y cómo mitigarlos`,
  },

  risk: {
    name: 'Riesgos', icon: '⚠️', color: '#ef4444',
    model: 'claude-haiku-4-5', modelLabel: 'Claude Haiku 4.5', family: 'Haiku', generation: 'anterior', effort: null,
    short: 'Top 5 riesgos',
    role: 'Arma la matriz de los cinco riesgos principales (tipo, probabilidad, impacto y mitigante) y describe el escenario catastrófico con su plan de contingencia.',
    why: 'Salida acotada y con formato fijo: basta un modelo pequeño. Usa Haiku 4.5, el mismo modelo que usa la versión web en Vercel.',
    prompt: `Eres el Agente de Riesgos de un sistema multi-agente de Business Case bancario.
Identifica y evalúa los principales riesgos de la iniciativa.
Responde en español con:

**TOP 5 RIESGOS**
Para cada riesgo:
- Riesgo: descripción
- Tipo: [Operacional / Financiero / Regulatorio / Tecnológico / Reputacional]
- Probabilidad: [Alta / Media / Baja]
- Impacto: [Alto / Medio / Bajo]
- Mitigante: acción concreta

**RIESGO TAIL (Escenario catastrófico)**
- Qué pasaría si el proyecto fracasa completamente
- Plan de contingencia mínimo`,
  },

  report: {
    name: 'Redactor', icon: '📄', color: '#06b6d4',
    model: 'claude-opus-5-5', modelLabel: 'Claude Opus 5.5', family: 'Opus', generation: 'actual', effort: 'medium',
    short: 'Business Case final',
    role: 'Lee el trabajo de los otros cinco agentes y redacta el Business Case ejecutivo: resumen, problema, alternativa, tabla financiera, riesgos y la decisión final (aprobar o no aprobar).',
    why: 'Es el documento que lee el comité y el que toma la decisión: va el modelo más capaz del sistema, Opus 5.5.',
    prompt: `Eres el Agente Redactor de un sistema multi-agente de Business Case bancario.
Sintetiza los outputs de todos los agentes anteriores en un Business Case ejecutivo.
Responde en español con el siguiente formato:

# BUSINESS CASE — [TÍTULO]

## 1. RESUMEN EJECUTIVO
[2-3 oraciones: qué se propone, cuánto cuesta, qué se gana]

## 2. PROBLEMA / OPORTUNIDAD
[Descripción del problema y la oportunidad de mercado]

## 3. ALTERNATIVA RECOMENDADA
[La opción propuesta y por qué es la mejor]

## 4. ANÁLISIS FINANCIERO
| Métrica | Valor |
|---------|-------|
| Inversión total | |
| VAN | |
| TIR | |
| ROI | |
| Payback | |

## 5. RIESGOS PRINCIPALES
[Top 3 riesgos y sus mitigantes]

## 6. RECOMENDACIÓN FINAL
**DECISIÓN: APROBAR / NO APROBAR**
[Justificación en 2-3 líneas]`,
  },
};

// ─── LLAMADA A CLAUDE CLI ─────────────────────────────────────────────────────
// --system-prompt: el prompt del agente reemplaza al de Claude Code (es exactamente el que se ve en la web)
// --tools "":      el agente solo razona y escribe; no lee archivos ni ejecuta comandos
// cwd = tmpdir:    no carga los CLAUDE.md de este proyecto como contexto

function callClaude(model, effort, systemPrompt, userMessage) {
  return new Promise((resolve, reject) => {
    const proc = spawn('claude', [
      '--print',
      '--model', model,
      ...(effort ? ['--effort', effort] : []),
      '--system-prompt', systemPrompt,
      '--tools', '',
      '--no-session-persistence',
      '--output-format', 'json',
    ], { cwd: os.tmpdir(), stdio: ['pipe', 'pipe', 'pipe'] });

    let output = '';
    let errOut = '';
    const timer = setTimeout(() => proc.kill('SIGTERM'), AGENT_TIMEOUT);

    proc.stdout.on('data', chunk => { output += chunk.toString(); });
    proc.stderr.on('data', chunk => { errOut += chunk.toString(); });

    proc.on('close', code => {
      clearTimeout(timer);
      let data;
      try { data = JSON.parse(output); } catch {
        return reject(new Error(errOut.trim() || output.trim() || `claude terminó con código ${code}`));
      }
      if (data.is_error || code !== 0) {
        return reject(new Error(data.result || errOut.trim() || `claude terminó con código ${code}`));
      }
      // Modelo que realmente respondió (el que más tokens generó en la sesión)
      const usage = Object.entries(data.modelUsage || {})
        .sort((a, b) => (b[1].outputTokens || 0) - (a[1].outputTokens || 0));
      resolve({
        text: (data.result || '').trim(),
        modelUsed: usage.length ? usage[0][0] : null,
        outputTokens: usage.length ? usage[0][1].outputTokens : null,
      });
    });

    proc.on('error', err => { clearTimeout(timer); reject(new Error(`No se pudo ejecutar claude: ${err.message}`)); });

    proc.stdin.write(userMessage);
    proc.stdin.end();
  });
}

// ─── GRUPOS (archivo local datos/grupos.json) ─────────────────────────────────
// Misma API que web/api/groups.js (Vercel), pero sin depender de JSONBlob.

const SLOTS = ['g1','g2','g3','g4','g5','g6','g7','g8','g9','g10'];

const EMPTY_GROUP = (slot) => ({
  slot,
  teamName: '',
  summary: '',
  problem: '',
  alternative: '',
  financials: { capex: 0, opex_y1: 0, investment_total: 0, revenues: [0,0,0,0,0], wacc: 10, van: 0, tir: 0, payback: 0 },
  risks: '',
  recommendation: '',
  vote: '',
  timestamp: 0,
});

function readGroups() {
  let stored = {};
  try { stored = JSON.parse(fs.readFileSync(GROUPS_FILE, 'utf8')); } catch { /* aún no hay datos */ }
  const groups = {};
  SLOTS.forEach(s => { groups[s] = stored[s] || EMPTY_GROUP(s); });
  return groups;
}

function writeGroups(groups) {
  fs.mkdirSync(path.dirname(GROUPS_FILE), { recursive: true });
  const tmp = GROUPS_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(groups, null, 2));
  fs.renameSync(tmp, GROUPS_FILE);
}

function handleGroups(req, res, body) {
  if (req.method === 'GET') {
    const groups = readGroups();
    return json(res, 200, { groups: SLOTS.map(s => groups[s]), lastUpdated: Date.now(), class: 'BC-CaixaBank-2025' });
  }

  let data;
  try { data = JSON.parse(body || '{}'); } catch { return json(res, 400, { error: 'JSON inválido' }); }
  const groups = readGroups();

  if (req.method === 'PUT') {
    if (data.action === 'vote') {
      if (!groups[data.slot]) return json(res, 400, { error: 'Invalid slot' });
      groups[data.slot].vote = data.votedFor;
      groups[data.slot].timestamp = Date.now();
      writeGroups(groups);
      return json(res, 200, { ok: true });
    }
    if (data.action === 'reset') {
      SLOTS.forEach(s => { groups[s] = EMPTY_GROUP(s); });
      writeGroups(groups);
      return json(res, 200, { ok: true, message: 'All groups reset' });
    }
    const { slot, teamName, summary, problem, alternative, financials, risks, recommendation } = data;
    if (!slot || !groups[slot]) return json(res, 400, { error: 'Invalid slot' });
    groups[slot] = { slot, teamName, summary, problem, alternative, financials, risks, recommendation, vote: '', timestamp: Date.now() };
    writeGroups(groups);
    return json(res, 200, { ok: true });
  }

  if (req.method === 'DELETE') {
    if (!groups[data.slot]) return json(res, 400, { error: 'Invalid slot' });
    groups[data.slot] = EMPTY_GROUP(data.slot);
    writeGroups(groups);
    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: 'Method not allowed' });
}

// ─── HELPERS HTTP ─────────────────────────────────────────────────────────────

function readBody(req) {
  return new Promise(resolve => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => resolve(body));
  });
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// ─── SERVIDOR ─────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  // ── Servir HTML con la configuración de los agentes inyectada ──
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    try {
      const html = fs.readFileSync(HTML_FILE, 'utf8');
      const config = { mode: 'local', agents: AGENTS };
      const script = `<script>window.AGENT_CONFIG = ${JSON.stringify(config).replace(/</g, '\\u003c')};</script>\n</head>`;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html.replace('</head>', () => script));
    } catch (e) {
      res.writeHead(500); return res.end('Error leyendo index.html: ' + e.message);
    }
  }

  // ── /api/agent  →  claude CLI local, con el modelo de cada agente ──────────
  if (req.url === '/api/agent' && req.method === 'POST') {
    const body = await readBody(req);
    let parsed;
    try { parsed = JSON.parse(body); } catch { return json(res, 400, { error: 'JSON inválido' }); }

    const { agent, idea, context } = parsed;
    const cfg = AGENTS[agent];
    if (!cfg) return json(res, 400, { error: `Agente desconocido: ${agent}` });

    let userMessage = idea || '';
    if (context && Object.keys(context).length) {
      userMessage += '\n\nCONTEXTO DE AGENTES ANTERIORES:\n' + JSON.stringify(context, null, 2);
    }

    console.log(`🤖 [${cfg.name}] ${cfg.modelLabel} trabajando...`);
    const t0 = Date.now();

    try {
      const r = await callClaude(cfg.model, cfg.effort, cfg.prompt, userMessage);
      const seconds = (Date.now() - t0) / 1000;
      console.log(`   ✅ [${cfg.name}] listo en ${seconds.toFixed(1)} s · modelo: ${r.modelUsed} · ${r.outputTokens} tokens`);
      return json(res, 200, { agent, output: r.text, model: r.modelUsed, modelLabel: cfg.modelLabel, seconds, outputTokens: r.outputTokens });
    } catch (e) {
      console.error(`   ❌ [${cfg.name}] error: ${e.message}`);
      return json(res, 500, { error: e.message });
    }
  }

  // ── /api/groups  →  archivo local ─────────────────────────────────────────
  if (req.url.startsWith('/api/groups')) {
    const body = await readBody(req);
    try { return handleGroups(req, res, body); }
    catch (e) { return json(res, 500, { error: e.message }); }
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log('\nSistema Multi-Agente — Business Case CaixaBank');
  console.log(`URL: http://localhost:${PORT}`);
  console.log(`Grupos: ${path.relative(__dirname, GROUPS_FILE)}\n`);
  console.log('Agentes (claude CLI, tu suscripción):');
  Object.values(AGENTS).forEach(a => console.log(`  ${a.icon}  ${a.name.padEnd(12)} ${a.modelLabel.padEnd(18)} esfuerzo: ${a.effort || '—'}`));
  console.log('\nCtrl+C para detener.\n');
});
