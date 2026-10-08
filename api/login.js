import { sql, setSession, clientIp, forgetUser, conferirSenha, bloqueado, registrarTentativa } from "./_lib.js";
import { imapLogin } from "./_imap.js";

// Login híbrido:
//  - e-mail da Quinze (auth = 'locaweb'): senha conferida na Locaweb, nada é guardado;
//  - usuário sem e-mail (auth = 'senha'): senha própria, conferida pelo hash bcrypt em app_users.
// 10 senhas erradas em 15 minutos bloqueiam o endereço e o usuário. A senha nunca aparece em log ou resposta.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  const ip = clientIp(req);
  const { user, pass } = req.body || {};
  if (typeof user !== "string" || typeof pass !== "string" || !user.trim() || !pass || user.length > 120 || pass.length > 200 || /[\r\n]/.test(pass)) {
    return res.status(400).json({ error: "invalid" });
  }
  const login = user.trim().toLowerCase();
  if (await bloqueado(ip, login)) return res.status(429).json({ error: "too_many" });
  const u = (await sql`SELECT login, ativo, auth FROM usuarios WHERE login = ${login}`)[0];
  let result = "invalid";
  if (u && u.ativo) {
    result = u.auth === "senha" ? ((await conferirSenha(login, pass)) ? "ok" : "invalid") : await imapLogin(login, pass);
  }
  if (result === "timeout" || result === "error") return res.status(503).json({ error: "locaweb" });
  const ok = result === "ok";
  await registrarTentativa(ip, login, ok);
  if (!ok) return res.status(u && !u.ativo ? 403 : 401).json({ error: u && !u.ativo ? "inativo" : "invalid" });
  await sql`UPDATE usuarios SET ultimo_acesso = now() WHERE login = ${login}`;
  forgetUser(login);
  await setSession(res, login);
  const t = u.auth === "senha" ? (await sql`SELECT trocar FROM app_users WHERE lower(username) = ${login}`)[0] : null;
  return res.status(200).json({ ok: true, trocarSenha: !!(t && t.trocar) });
}
