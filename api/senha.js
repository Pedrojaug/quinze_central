import { requireSession, clientIp, conferirSenha, gravarSenha, senhaValida, bloqueado, registrarTentativa, SENHA_MIN } from "./_lib.js";

// Troca da própria senha (só para quem entra com usuário e senha próprios, sem e-mail).
// Obrigatória no primeiro acesso e depois de uma senha redefinida pela gestão.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  const u = await requireSession(req, res, { permitirTroca: true });
  if (!u) return;
  if (u.auth !== "senha") return res.status(400).json({ error: "A senha deste acesso é a do e-mail da Locaweb. Troque-a na Locaweb." });
  const ip = clientIp(req);
  if (await bloqueado(ip, u.login)) return res.status(429).json({ error: "too_many" });
  const { atual, nova } = req.body || {};
  if (typeof atual !== "string" || !senhaValida(nova)) return res.status(400).json({ error: `A nova senha precisa ter pelo menos ${SENHA_MIN} caracteres.` });
  if (atual === nova) return res.status(400).json({ error: "A nova senha precisa ser diferente da atual." });
  const ok = await conferirSenha(u.login, atual);
  if (!ok) { await registrarTentativa(ip, u.login, false); return res.status(401).json({ error: "A senha atual não confere." }); }
  await gravarSenha(u.login, nova, false);
  return res.status(200).json({ ok: true });
}
