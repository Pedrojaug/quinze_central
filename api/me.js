import { session, sql, forgetUser, salvarAvatarUsuario, ehGestao, conferirSenhaMestre, clientIp, bloqueado, registrarTentativa } from "./_lib.js";
import { publico, areasPublicas, PERFIS } from "./_modules.js";
import { eticaPendente } from "./_pol.js";

const AVATAR_DATA_RE = /^data:image\/(webp|jpeg|jpg|png);base64,[A-Za-z0-9+/=]{20,120000}$/;

// Quem está logado, que módulos e abas pode usar (monta a tela de módulos e o menu).
// POST /api/me permite que a própria pessoa atualize seu Nome de exibição e Foto de perfil (avatar),
// ou valide a senha mestre no servidor para desbloquear edição da Carteira.
export default async function handler(req, res) {
  const u = await session(req);
  if (!u) return res.status(401).json({ error: "unauthorized" });

  if (req.method === "POST") {
    if (u.trocarSenha) return res.status(403).json({ error: "trocar_senha", code: "trocar_senha" });
    const b = req.body && typeof req.body === "object" ? req.body : {};
    if (b.acao === "desbloquear_edicao") {
      if (ehGestao(u)) return res.status(200).json({ ok: true });
      const ip = clientIp(req);
      if (await bloqueado(ip, u.login)) {
        return res.status(429).json({ ok: false, error: "Muitas tentativas incorretas. Aguarde alguns minutos." });
      }
      const ok = await conferirSenhaMestre(b.senha);
      await registrarTentativa(ip, u.login, ok);
      if (!ok) return res.status(403).json({ ok: false, error: "Senha incorreta. Tente de novo." });
      return res.status(200).json({ ok: true });
    }
    const temNome = typeof b.nome === "string";
    const nome = temNome ? b.nome.trim().replace(/\s+/g, " ").slice(0, 80) : u.nome;
    if (temNome && nome.length < 2) {
      return res.status(400).json({ error: "O nome precisa ter pelo menos 2 caracteres." });
    }
    let avatar = u.avatar || null;
    let alterouAvatar = false;
    if (b.avatar === null || b.avatar === "") {
      avatar = null;
      alterouAvatar = true;
    } else if (typeof b.avatar === "string") {
      const av = b.avatar.trim();
      if (!AVATAR_DATA_RE.test(av)) {
        return res.status(400).json({ error: "Formato de imagem inválido ou imagem muito grande. Escolha outra foto." });
      }
      avatar = av;
      alterouAvatar = true;
    }
    await sql`UPDATE usuarios SET nome = ${nome || u.login}, atualizado_em = now() WHERE login = ${u.login}`;
    if (alterouAvatar) {
      await salvarAvatarUsuario(u.login, avatar);
    } else {
      forgetUser(u.login);
    }
    return res.status(200).json({
      ok: true,
      login: u.login,
      nome: nome || u.login,
      avatar,
      perfil: PERFIS[u.funcao] || u.funcao,
    });
  }

  let pendencias = {};
  try { if (!u.trocarSenha && await eticaPendente(u)) pendencias.etica = true; } catch { /* aviso é opcional */ }
  return res.status(200).json({
    login: u.login, nome: u.nome, avatar: u.avatar || null, papel: u.papel, funcao: u.funcao, perfil: PERFIS[u.funcao] || u.funcao,
    auth: u.auth, trocarSenha: u.trocarSenha, podeEnviarPecas: u.podeEnviarPecas,
    abas: u.trocarSenha ? [] : u.abas,
    modulos: u.trocarSenha ? [] : publico(u.abas),
    areas: u.trocarSenha ? [] : areasPublicas(u.areas, u.abas),
    pendencias,
  });
}
