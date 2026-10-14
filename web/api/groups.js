// Persistencia de grupos en Vercel Blob (store bc-grupos-lasalle → BLOB_READ_WRITE_TOKEN).
//
// Estructura, pensada para que dos alumnos no se pisen:
//   bc/gen-<ts>.json                      marca de generación; el reset crea una nueva
//   bc/<gen>/registro/<slot>.json         reserva del grupo: se crea una sola vez (sin sobrescribir)
//   bc/<gen>/grupos/<slot>/<ts>-<id>.json cada guardado es un archivo nuevo; se lee el más reciente
//   bc/<gen>/votos/<slot>.json            voto del grupo: también se crea una sola vez
// Como ningún archivo se sobrescribe, nunca se lee una versión vieja desde la caché del CDN.

import { put, list, del } from '@vercel/blob';

const SLOTS = ['g1','g2','g3','g4','g5','g6','g7','g8','g9','g10'];
const ADMIN_PIN = process.env.ADMIN_PIN || 'lasalle26';
const MAX_TEXT = 4000;

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

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const text = (v, max = MAX_TEXT) => String(v ?? '').slice(0, max);
const sameTeam = (a, b) => text(a).trim().toLowerCase().replace(/\s+/g, ' ') === text(b).trim().toLowerCase().replace(/\s+/g, ' ');

async function writeJSON(pathname, data) {
  return put(pathname, JSON.stringify(data), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: false,
  });
}

async function readJSON(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`No se pudo leer ${url} (${r.status})`);
  return r.json();
}

async function listAll(prefix) {
  const blobs = [];
  let cursor;
  do {
    const r = await list({ prefix, cursor, limit: 1000 });
    blobs.push(...r.blobs);
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  return blobs;
}

async function loadState() {
  const blobs = await listAll('bc/');
  const gens = blobs.map(b => b.pathname.match(/^bc\/gen-(\d+)\.json$/)).filter(Boolean).map(m => Number(m[1]));
  const gen = gens.length ? String(Math.max(...gens)) : '0';
  const claims = {}, saves = {}, votes = {};
  for (const b of blobs) {
    if (!b.pathname.startsWith(`bc/${gen}/`)) continue;
    let m;
    if ((m = b.pathname.match(/\/registro\/(g\d+)\.json$/))) claims[m[1]] = b;
    else if ((m = b.pathname.match(/\/grupos\/(g\d+)\/(\d+)-\w+\.json$/))) (saves[m[1]] ||= []).push({ ts: Number(m[2]), blob: b });
    else if ((m = b.pathname.match(/\/votos\/(g\d+)\.json$/))) votes[m[1]] = b;
  }
  Object.values(saves).forEach(arr => arr.sort((a, b) => b.ts - a.ts));
  return { gen, blobs, claims, saves, votes };
}

async function readGroups(state) {
  return Promise.all(SLOTS.map(async slot => {
    const claim = state.claims[slot];
    if (!claim) return EMPTY_GROUP(slot);
    const latest = state.saves[slot]?.[0];
    const [c, s, v] = await Promise.all([
      readJSON(claim.url),
      latest ? readJSON(latest.blob.url) : null,
      state.votes[slot] ? readJSON(state.votes[slot].url) : null,
    ]);
    return { ...EMPTY_GROUP(slot), ...(s || {}), slot, teamName: c.teamName, vote: v?.votedFor || '', timestamp: s?.timestamp || c.timestamp };
  }));
}

async function claimOwner(state, slot) {
  return state.claims[slot] ? (await readJSON(state.claims[slot].url)).teamName : null;
}

// Reserva el grupo para un equipo. Si ya lo tiene otro equipo → 409.
async function register(state, slot, teamName) {
  const owner = await claimOwner(state, slot);
  if (owner !== null) {
    if (sameTeam(owner, teamName)) return owner;
    throw new HttpError(409, `El ${slot.replace('g', 'Grupo ')} ya está registrado por «${owner}». Elige otro número de grupo.`);
  }
  try {
    await writeJSON(`bc/${state.gen}/registro/${slot}.json`, { slot, teamName, timestamp: Date.now() });
    return teamName;
  } catch (e) {
    // Otro equipo lo reservó en el mismo instante: ver quién quedó
    const fresh = await loadState();
    const winner = await claimOwner(fresh, slot);
    if (winner === null) throw e;
    if (sameTeam(winner, teamName)) return winner;
    throw new HttpError(409, `El ${slot.replace('g', 'Grupo ')} acaba de ser registrado por «${winner}». Elige otro número de grupo.`);
  }
}

function sanitizeFinancials(f = {}) {
  const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const revenues = Array.isArray(f.revenues) ? f.revenues.slice(0, 5).map(num) : [0,0,0,0,0];
  while (revenues.length < 5) revenues.push(0);
  return {
    capex: num(f.capex), opex_y1: num(f.opex_y1), investment_total: num(f.investment_total), revenues,
    wacc: num(f.wacc), van: num(f.van), tir: num(f.tir), payback: num(f.payback),
  };
}

async function saveBC(state, body) {
  const teamName = text(body.teamName, 40).trim();
  if (!teamName) throw new HttpError(400, 'Falta el nombre del equipo.');
  const owner = await register(state, body.slot, teamName);
  const ts = Date.now();
  await writeJSON(`bc/${state.gen}/grupos/${body.slot}/${ts}-${Math.random().toString(36).slice(2, 8)}.json`, {
    slot: body.slot,
    teamName: owner,
    summary: text(body.summary),
    problem: text(body.problem),
    alternative: text(body.alternative, 40),
    financials: sanitizeFinancials(body.financials),
    risks: text(body.risks),
    recommendation: text(body.recommendation),
    timestamp: ts,
  });
  // Limpieza: borra los guardados anteriores de este grupo (si falla, no importa: se lee el más reciente)
  const older = (state.saves[body.slot] || []).map(s => s.blob.url);
  if (older.length) await del(older).catch(() => {});
}

async function vote(state, body) {
  const { slot, votedFor } = body;
  if (!SLOTS.includes(votedFor)) throw new HttpError(400, 'Grupo votado no válido.');
  if (votedFor === slot) throw new HttpError(400, 'No puedes votar por tu propio grupo.');
  const owner = await claimOwner(state, slot);
  if (owner === null) throw new HttpError(400, 'Registra tu grupo antes de votar.');
  if (body.teamName && !sameTeam(owner, body.teamName)) throw new HttpError(403, `El ${slot.replace('g', 'Grupo ')} pertenece a «${owner}».`);
  if (!state.claims[votedFor]) throw new HttpError(400, 'Ese grupo no está registrado.');
  if (state.votes[slot]) throw new HttpError(409, 'Tu grupo ya votó. El voto no se puede cambiar.');
  try {
    await writeJSON(`bc/${state.gen}/votos/${slot}.json`, { slot, votedFor, timestamp: Date.now() });
  } catch {
    throw new HttpError(409, 'Tu grupo ya votó. El voto no se puede cambiar.');
  }
}

async function reset(state, pin) {
  if (String(pin ?? '') !== ADMIN_PIN) throw new HttpError(403, 'Clave de administrador incorrecta.');
  const marker = `bc/gen-${Date.now()}.json`;
  await writeJSON(marker, { createdAt: new Date().toISOString() });
  // Borra los datos de generaciones anteriores (la nueva generación ya está activa aunque esto falle)
  const old = state.blobs.map(b => b.url);
  if (old.length) await del(old).catch(() => {});
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      throw new HttpError(500, 'Falta conectar el almacenamiento de grupos (Vercel Blob) a este proyecto.');
    }
    const state = await loadState();

    if (req.method === 'GET') {
      const groups = await readGroups(state);
      return res.status(200).json({ groups, lastUpdated: Date.now(), class: 'BC-CaixaBank-2026' });
    }

    if (req.method === 'PUT') {
      const body = req.body || {};
      if (body.action === 'reset') {
        await reset(state, body.pin);
        return res.status(200).json({ ok: true, message: 'All groups reset' });
      }
      if (!SLOTS.includes(body.slot)) throw new HttpError(400, 'Número de grupo no válido.');
      if (body.action === 'vote') {
        await vote(state, body);
        return res.status(200).json({ ok: true });
      }
      if (body.action === 'register') {
        const teamName = text(body.teamName, 40).trim();
        if (!teamName) throw new HttpError(400, 'Falta el nombre del equipo.');
        const owner = await register(state, body.slot, teamName);
        return res.status(200).json({ ok: true, teamName: owner });
      }
      await saveBC(state, body);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
}
