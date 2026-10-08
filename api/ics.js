import { sql, requireSession, canPath } from "./_lib.js";

// Lê a agenda externa (link iCal) de um atendimento e devolve o .ics para o calendário da página.
export default async function handler(req, res) {
  const me = await requireSession(req, res);
  if (!me) return;
  if (!canPath(me, "config/agenda", false)) return res.status(403).json({ error: "sem_acesso" });
  const nome = String(req.query.nome || "");
  const r = await sql`SELECT data FROM docs WHERE path = 'config/agenda' AND NOT deleted`;
  let url = r[0]?.data?.feeds?.[nome];
  if (!url) return res.status(404).json({ error: "sem_agenda" });
  url = String(url).replace(/^webcal:\/\//i, "https://");
  let u;
  try { u = new URL(url); } catch { return res.status(400).json({ error: "link_invalido" }); }
  const host = u.hostname.toLowerCase();
  if (u.protocol !== "https:" || host === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.startsWith("[") || /\.(local|internal|localhost)$/.test(host)) {
    return res.status(400).json({ error: "link_invalido" });
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 9000);
    const up = await fetch(u, { signal: ctrl.signal, redirect: "follow", headers: { "user-agent": "QuinzeCentral/1.0" } });
    clearTimeout(t);
    if (!up.ok) return res.status(502).json({ error: "agenda_indisponivel", status: up.status });
    const text = await up.text();
    if (text.length > 5_000_000 || !/BEGIN:VCALENDAR/.test(text)) return res.status(502).json({ error: "nao_e_ical" });
    res.setHeader("content-type", "text/calendar; charset=utf-8");
    res.setHeader("cache-control", "private, max-age=120");
    res.statusCode = 200;
    return res.end(text);
  } catch {
    return res.status(502).json({ error: "agenda_indisponivel" });
  }
}
