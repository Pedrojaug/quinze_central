import { sql, requireSession, canPath } from "./_lib.js";
import { soApi } from "./_modules.js";

// Entrega à página os documentos novos desde a última sincronização (só os que o usuário pode ler).
// Caminhos "só pela API" (m/administrativo/, m/cs/, m/politicas/, m/financeiro/) nunca passam por aqui, para nenhum perfil.
export default async function handler(req, res) {
  const u = await requireSession(req, res);
  if (!u) return;
  const since = Math.max(0, parseInt(req.query.since || "0", 10) || 0);
  if (since === 0) {
    try {
      await sql`UPDATE docs
                SET data = jsonb_set(data, '{socials}', COALESCE((SELECT jsonb_agg(elem) FROM jsonb_array_elements_text(COALESCE(data->'socials', '[]'::jsonb)) AS elem WHERE upper(trim(elem)) <> 'ANDREW'), '[]'::jsonb), true),
                    updated_at = now(), seq = nextval('docs_seq')
                WHERE path = 'config/geral' AND NOT deleted
                  AND jsonb_typeof(data->'socials') = 'array'
                  AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(data->'socials') AS e WHERE upper(trim(e)) = 'ANDREW')`;
      await sql`UPDATE docs
                SET data = jsonb_set(data, '{social}', '""'::jsonb, true),
                    updated_at = now(), seq = nextval('docs_seq')
                WHERE path LIKE 'meses/%/clientes/%' AND NOT deleted
                  AND upper(trim(coalesce(data->>'social', ''))) = 'ANDREW'`;
    } catch (e) { console.error("[sync] cleanup andrew:", e?.message || e); }
  }
  const [{ m }] = await sql`SELECT coalesce(max(seq), 0)::bigint AS m FROM docs`;
  const rows = since === 0
    ? await sql`SELECT path, data, deleted, seq FROM docs WHERE NOT deleted AND path NOT LIKE 'm/administrativo/%' AND path NOT LIKE 'm/cs/%' AND path NOT LIKE 'm/politicas/%' AND path NOT LIKE 'm/financeiro/%' ORDER BY seq`
    : await sql`SELECT path, data, deleted, seq FROM docs WHERE seq > ${since} AND path NOT LIKE 'm/administrativo/%' AND path NOT LIKE 'm/cs/%' AND path NOT LIKE 'm/politicas/%' AND path NOT LIKE 'm/financeiro/%' ORDER BY seq LIMIT 5000`;
  const all = rows.map(r => ({ path: r.path, data: r.data, deleted: r.deleted, seq: Number(r.seq) }));
  const docs = all.filter(d => !soApi(d.path) && canPath(u, d.path, false));
  const seq = Math.max(since, Number(m), ...all.map(d => d.seq));
  return res.status(200).json({ docs, seq });
}
