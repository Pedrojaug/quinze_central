import { sql, requireSession, canPath } from "./_lib.js";
import { soApi } from "./_modules.js";

// Entrega à página os documentos novos desde a última sincronização (só os que o usuário pode ler).
// Caminhos "só pela API" (m/administrativo/, m/cs/, m/politicas/, m/financeiro/) nunca passam por aqui, para nenhum perfil.
export default async function handler(req, res) {
  const u = await requireSession(req, res);
  if (!u) return;
  const since = Math.max(0, parseInt(req.query.since || "0", 10) || 0);
  const [{ m }] = await sql`SELECT coalesce(max(seq), 0)::bigint AS m FROM docs`;
  const rows = since === 0
    ? await sql`SELECT path, data, deleted, seq FROM docs WHERE NOT deleted AND path NOT LIKE 'm/administrativo/%' AND path NOT LIKE 'm/cs/%' AND path NOT LIKE 'm/politicas/%' AND path NOT LIKE 'm/financeiro/%' ORDER BY seq`
    : await sql`SELECT path, data, deleted, seq FROM docs WHERE seq > ${since} AND path NOT LIKE 'm/administrativo/%' AND path NOT LIKE 'm/cs/%' AND path NOT LIKE 'm/politicas/%' AND path NOT LIKE 'm/financeiro/%' ORDER BY seq LIMIT 5000`;
  const all = rows.map(r => ({ path: r.path, data: r.data, deleted: r.deleted, seq: Number(r.seq) }));
  const docs = all.filter(d => !soApi(d.path) && canPath(u, d.path, false));
  const seq = Math.max(since, Number(m), ...all.map(d => d.seq));
  return res.status(200).json({ docs, seq });
}
