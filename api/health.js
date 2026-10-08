import { sql } from "./_lib.js";

// Verificação rápida de que o site e o banco estão no ar (não mostra dados).
export default async function handler(req, res) {
  try {
    const [{ v }] = await sql`SELECT coalesce(max(versao), 0)::int AS v FROM schema_migrations`;
    return res.status(200).json({ ok: true, banco: "ok", versaoBanco: v });
  } catch {
    return res.status(503).json({ ok: false, banco: "indisponivel" });
  }
}
