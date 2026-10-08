import { sql, requireSession, checkPath, canPath, ehGestao } from "./_lib.js";
import { soApi } from "./_modules.js";

// Grava (PUT) ou apaga (DELETE) um documento, respeitando as permissões do usuário.
// Caminhos "só pela API" (ex.: m/administrativo/...) são recusados aqui: use a rota do módulo.
export default async function handler(req, res) {
  const u = await requireSession(req, res);
  if (!u) return;
  if (req.method === "PUT") {
    const { path, data, merge } = req.body || {};
    if (!checkPath(path) || !data || typeof data !== "object" || Array.isArray(data)) return res.status(400).json({ code: "bad_request" });
    if (soApi(path) || !canPath(u, path, true)) return res.status(403).json({ code: "invalid_argument" });
    // Equipe e ajustes (config/geral) é do Mestre e da gestão (instrução 10). Os demais só acrescentam nomes às listas
    // de atendimentos e social medias (ex.: ao inserir um cliente na Carteira) e gravam os links do onboarding.
    if (path === "config/geral" && !ehGestao(u)) {
      const atual = (await sql`SELECT data FROM docs WHERE path = 'config/geral' AND NOT deleted`)[0]?.data || {};
      const prox = merge ? { ...atual, ...data } : data;
      const LIVRES = ["marcilioEmail", "propostaUrl"], LISTAS = ["atendimentos", "socials"];
      const igual = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
      const chaves = new Set([...Object.keys(atual), ...Object.keys(prox)]);
      for (const k of chaves) {
        if (LIVRES.includes(k)) continue;
        if (LISTAS.includes(k)) { const a = atual[k] || [], b = prox[k] || []; if (Array.isArray(b) && a.every(x => b.includes(x))) continue; }
        else if (igual(atual[k], prox[k])) continue;
        return res.status(403).json({ code: "sem_acesso", error: "Equipe e ajustes é do Mestre e da gestão." });
      }
    }
    const json = JSON.stringify(data);
    if (json.length > 500000) return res.status(413).json({ code: "too_large" });
    const parts = path.split("/"), id = parts.pop(), parent = parts.join("/");
    if (merge) {
      const r = await sql`UPDATE docs SET data = jsonb_deep_merge(data, ${json}::jsonb), updated_at = now(), seq = nextval('docs_seq')
                          WHERE path = ${path} AND NOT deleted RETURNING data, seq`;
      if (!r.length) return res.status(404).json({ code: "invalid_argument" });
      return res.status(200).json({ data: r[0].data, seq: Number(r[0].seq) });
    }
    const r = await sql`INSERT INTO docs (path, parent, id, data) VALUES (${path}, ${parent}, ${id}, ${json}::jsonb)
                        ON CONFLICT (path) DO UPDATE SET data = EXCLUDED.data, deleted = false, updated_at = now(), seq = nextval('docs_seq')
                        RETURNING data, seq`;
    return res.status(200).json({ data: r[0].data, seq: Number(r[0].seq) });
  }
  if (req.method === "DELETE") {
    const path = req.query.path;
    if (!checkPath(path)) return res.status(400).json({ code: "bad_request" });
    if (soApi(path) || !canPath(u, path, true)) return res.status(403).json({ code: "invalid_argument" });
    // Excluir uma carteira mensal inteira é ajuste de equipe (Mestre e gestão).
    if (/^meses\/\d{4}-\d{2}$/.test(path) && !ehGestao(u)) return res.status(403).json({ code: "sem_acesso" });
    // Onboarding se exclui só pela rota própria (onb/excluir: Mestre e gestão, com cópia restaurável).
    if (/^onboarding\/[^/]+$/.test(path)) return res.status(403).json({ code: "sem_acesso", error: "Use \"Excluir onboarding\" (Mestre e gestão)." });
    await sql`UPDATE docs SET deleted = true, data = '{}'::jsonb, updated_at = now(), seq = nextval('docs_seq') WHERE path = ${path}`;
    return res.status(200).json({ ok: true });
  }
  return res.status(405).json({ code: "method" });
}
