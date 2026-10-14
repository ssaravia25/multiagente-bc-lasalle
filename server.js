/**
 * Servidor local Multi-Agente — Business Case CaixaBank 2026
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
const GROUPS_URL    = process.env.GROUPS_URL || 'https://vercel-deploy-jet-tau.vercel.app'; // grupos: los de la web
const AGENT_TIMEOUT = 5 * 60 * 1000;                                 // corta un agente colgado a los 5 min

// ─── AGENTES: modelo, explicación y prompt ────────────────────────────────────
// Se definen en web/agents.json, que también lee la versión web para mostrar las tarjetas.
// Seis agentes, seis modelos distintos: tres familias (Haiku, Sonnet, Opus) × dos generaciones.
// - `model`:  cualquier ID que acepte `claude --model`.
// - `effort`: cuánto razona el modelo antes de responder (low, medium, high): más esfuerzo = más lento.
//   Sin `effort`, Claude Code usa su nivel por defecto, que es alto: con Opus, el pipeline tarda ~6 min.
//   Haiku 4.5 no admite niveles de esfuerzo (null).

const AGENTS = JSON.parse(fs.readFileSync(path.join(__dirname, 'web', 'agents.json'), 'utf8'));

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

// ─── GRUPOS: los mismos datos que la versión web (Vercel) ─────────────────────
// La versión local no guarda grupos: reenvía /api/groups a Vercel, donde se inscriben los alumnos.
// Así el profesor ve en local exactamente los mismos grupos y votos que en la web.

async function proxyGroups(req, res, body) {
  try {
    const r = await fetch(GROUPS_URL + '/api/groups', {
      method: req.method,
      headers: { 'Content-Type': 'application/json' },
      body: req.method === 'GET' ? undefined : body,
      signal: AbortSignal.timeout(20000),
    });
    res.writeHead(r.status, { 'Content-Type': 'application/json' });
    return res.end(await r.text());
  } catch (e) {
    return json(res, 502, { error: `No se pudo conectar con el servidor de grupos (${GROUPS_URL}): ${e.message}` });
  }
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

  // ── /api/groups  →  Vercel (mismos datos que la web) ──────────────────────
  if (req.url.startsWith('/api/groups')) {
    const body = await readBody(req);
    return proxyGroups(req, res, body);
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log('\nSistema Multi-Agente — Business Case CaixaBank');
  console.log(`URL: http://localhost:${PORT}`);
  console.log(`Grupos: ${GROUPS_URL} (los mismos que en la web)\n`);
  console.log('Agentes (claude CLI, tu suscripción):');
  Object.values(AGENTS).forEach(a => console.log(`  ${a.icon}  ${a.name.padEnd(12)} ${a.modelLabel.padEnd(18)} esfuerzo: ${a.effort || '—'}`));
  console.log('\nCtrl+C para detener.\n');
});
