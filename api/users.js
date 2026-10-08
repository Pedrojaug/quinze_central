import { sql, requireSession, forgetUser, ehGestao, gravarSenha, senhaValida, SENHA_MIN } from "./_lib.js";
import { MODULOS, AREAS, FUNCOES, PERFIS, ESCOLHAS, abasDe, areasDe, perfilDe, publico, ALL_TABS } from "./_modules.js";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USUARIO = /^[a-z0-9][a-z0-9._-]{2,39}$/;
const LEGADO = "atendimentoquinze"; // login compartilhado antigo

// Coloca o primeiro nome da pessoa na lista da equipe da Carteira (Atendimento ou Social media).
async function addToTeam(nome, funcao) {
  const key = funcao === "atendimento" ? "atendimentos" : funcao === "social" ? "socials" : null;
  const first = String(nome || "").trim().split(/\s+/)[0].toUpperCase();
  if (!key || !first || first.includes("@")) return;
  await sql`UPDATE docs SET data = jsonb_set(data, ${"{" + key + "}"}::text[], coalesce(data->${key}, '[]'::jsonb) || to_jsonb(${first}::text), true),
            updated_at = now(), seq = nextval('docs_seq')
            WHERE path = 'config/geral' AND NOT deleted AND NOT (coalesce(data->${key}, '[]'::jsonb) ? ${first})`;
}

// Cadastro de usuários: só Mestre e Gestão (conferido aqui no servidor).
// Ninguém cria outro Mestre; a Gestão não altera o Mestre.
export default async function handler(req, res) {
  const me = await requireSession(req, res);
  if (!me) return;
  if (!ehGestao(me)) return res.status(403).json({ error: "so_gestao" });
  const souMestre = me.funcao === "mestre";

  if (req.method === "GET") {
    const rows = await sql`SELECT u.login, u.nome, u.papel, u.funcao, u.abas, u.ativo, u.auth, u.pode_enviar_pecas, u.criado_em, u.ultimo_acesso,
                                  coalesce(a.trocar, false) AS trocar
                           FROM usuarios u LEFT JOIN app_users a ON u.auth = 'senha' AND lower(a.username) = u.login
                           ORDER BY u.papel = 'master' DESC, u.nome`;
    const users = rows.map(r => ({
      login: r.login, nome: r.nome, papel: r.papel, funcao: perfilDe(r), abas: r.abas, ativo: r.ativo, auth: r.auth,
      podeEnviarPecas: !!r.pode_enviar_pecas, senhaTemporaria: r.auth === "senha" && !!r.trocar,
      criado_em: r.criado_em, ultimo_acesso: r.ultimo_acesso, abasEfetivas: [...abasDe(r), ...areasDe(r).filter(a => !ALL_TABS.includes(a))],
    }));
    return res.status(200).json({
      users, perfis: PERFIS, funcoes: FUNCOES, escolhas: ESCOLHAS, senhaMinima: SENHA_MIN,
      modulos: publico(ALL_TABS),
      areas: AREAS.map(({ id, nome, ordem, restrito, emBreve }) => ({ id, nome, ordem, restrito: !!restrito, emBreve: !!emBreve })),
    });
  }

  if (req.method === "POST") {
    const b = req.body || {};
    const login = String(b.login || "").trim().toLowerCase();
    const cur = (await sql`SELECT login, papel, funcao, auth FROM usuarios WHERE login = ${login}`)[0];
    const alvoMestre = cur && (cur.papel === "master" || cur.funcao === "mestre");
    if (alvoMestre && !souMestre) return res.status(403).json({ error: "Só o Mestre altera o próprio cadastro." });

    // Redefinir senha (usuários sem e-mail). A nova senha é temporária: a pessoa troca no próximo acesso.
    if (b.acao === "senha") {
      if (!cur) return res.status(404).json({ error: "Usuário não encontrado." });
      if (cur.auth !== "senha") return res.status(400).json({ error: "Este usuário entra com o e-mail da Locaweb; a senha é trocada na Locaweb." });
      if (!senhaValida(b.senha)) return res.status(400).json({ error: `A senha precisa ter pelo menos ${SENHA_MIN} caracteres.` });
      await gravarSenha(login, b.senha, !alvoMestre);
      return res.status(200).json({ ok: true });
    }

    const nome = String(b.nome || "").trim().slice(0, 120);
    const ativo = b.ativo !== false;
    const pecas = !!b.podeEnviarPecas;
    let funcao = Object.keys(PERFIS).includes(b.funcao) ? b.funcao : "personalizado";
    if (funcao === "mestre" && !alvoMestre) return res.status(400).json({ error: "Só existe um Mestre." });
    const abas = funcao === "personalizado" && Array.isArray(b.abas) ? [...new Set(b.abas.filter(t => ESCOLHAS.includes(t)))] : [];
    if (funcao === "personalizado" && !abas.length) return res.status(400).json({ error: "Marque pelo menos um módulo ou aba." });

    if (cur) {
      if (alvoMestre) {
        await sql`UPDATE usuarios SET nome = ${nome || login}, pode_enviar_pecas = ${pecas}, atualizado_em = now() WHERE login = ${login}`;
      } else {
        await sql`UPDATE usuarios SET nome = ${nome || login}, funcao = ${funcao}, abas = ${JSON.stringify(abas)}::jsonb, ativo = ${ativo},
                  pode_enviar_pecas = ${pecas}, atualizado_em = now() WHERE login = ${login}`;
        if (funcao !== cur.funcao) await addToTeam(nome, funcao);
      }
      forgetUser(login);
      return res.status(200).json({ ok: true, criado: false });
    }

    // Novo usuário: com e-mail (Locaweb) ou com nome de usuário e senha temporária.
    const comEmail = login.includes("@");
    if (comEmail && !EMAIL.test(login)) return res.status(400).json({ error: "Informe um e-mail válido." });
    if (!comEmail && !USUARIO.test(login)) return res.status(400).json({ error: "O usuário deve ter de 3 a 40 letras minúsculas, números, ponto, hífen ou sublinhado." });
    if (!comEmail && !senhaValida(b.senha)) return res.status(400).json({ error: `Defina uma senha temporária com pelo menos ${SENHA_MIN} caracteres.` });
    await sql`INSERT INTO usuarios (login, nome, papel, funcao, abas, ativo, auth, pode_enviar_pecas, criado_por)
              VALUES (${login}, ${nome || login}, 'usuario', ${funcao}, ${JSON.stringify(abas)}::jsonb, ${ativo}, ${comEmail ? "locaweb" : "senha"}, ${pecas}, ${me.login})`;
    if (!comEmail) await gravarSenha(login, b.senha, true);
    await addToTeam(nome, funcao);
    // Primeiro usuário individual criado: o login compartilhado antigo deixa de funcionar.
    const off = await sql`UPDATE usuarios SET ativo = false, atualizado_em = now() WHERE login = ${LEGADO} AND ativo RETURNING login`;
    off.forEach(r => forgetUser(r.login));
    return res.status(200).json({ ok: true, criado: true, compartilhadoDesativado: off.length > 0 });
  }

  if (req.method === "DELETE") {
    const login = String(req.query.login || "").trim().toLowerCase();
    const cur = (await sql`SELECT papel, funcao FROM usuarios WHERE login = ${login}`)[0];
    if (!cur) return res.status(404).json({ error: "Usuário não encontrado." });
    if (cur.papel === "master" || cur.funcao === "mestre") return res.status(400).json({ error: "O usuário mestre não pode ser removido." });
    await sql`DELETE FROM usuarios WHERE login = ${login}`;
    await sql`DELETE FROM app_users WHERE lower(username) = ${login}`;
    forgetUser(login);
    return res.status(200).json({ ok: true });
  }
  return res.status(405).json({ error: "method" });
}
