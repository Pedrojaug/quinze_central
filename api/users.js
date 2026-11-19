import { sql, requireSession, forgetUser, ehGestao, gravarSenha, senhaValida, gerarSenhaTemporaria, SENHA_MIN, carregarMapaAvatares } from "./_lib.js";
import { MODULOS, AREAS, FUNCOES, PERFIS, ESCOLHAS, abasDe, areasDe, perfilDe, publico, ALL_TABS } from "./_modules.js";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USUARIO = /^[a-z0-9][a-z0-9._-]{2,39}$/;
const LEGADO = "atendimentoquinze"; // login compartilhado antigo

// Coloca o primeiro nome da pessoa na lista da equipe da Carteira (Atendimento ou Social media).
async function addToTeam(nome, funcao) {
  const key = funcao === "atendimento" ? "atendimentos" : funcao === "social" ? "socials" : null;
  const first = String(nome || "").trim().split(/\s+/)[0].toUpperCase();
  if (!key || !first || first.includes("@")) return;
  try {
    await sql`UPDATE docs SET data = jsonb_set(data, ${"{" + key + "}"}::text[],
                (CASE WHEN jsonb_typeof(data->${key}) = 'array' THEN data->${key} ELSE '[]'::jsonb END) || to_jsonb(${first}::text), true),
              updated_at = now(), seq = nextval('docs_seq')
              WHERE path = 'config/geral' AND NOT deleted
                AND NOT ((CASE WHEN jsonb_typeof(data->${key}) = 'array' THEN data->${key} ELSE '[]'::jsonb END) ? ${first})`;
  } catch (e) { console.error("[users] addToTeam:", e?.message || e); }
}

// Cadastro de usuários: só Mestre e Gestão (conferido aqui no servidor).
// Ninguém cria outro Mestre; a Gestão não altera o Mestre.
export default async function handler(req, res) {
  const me = await requireSession(req, res);
  if (!me) return;
  if (!ehGestao(me)) return res.status(403).json({ error: "so_gestao" });
  const souMestre = me.funcao === "mestre";

  if (req.method === "GET") {
    const [rows, mapaAv] = await Promise.all([
      sql`SELECT u.login, u.nome, u.papel, u.funcao, u.abas, u.ativo, u.auth, u.pode_enviar_pecas, u.criado_em, u.ultimo_acesso,
                 coalesce(a.trocar, false) AS trocar
          FROM usuarios u LEFT JOIN app_users a ON u.auth = 'senha' AND lower(a.username) = u.login
          ORDER BY u.papel = 'master' DESC, u.nome`,
      carregarMapaAvatares(),
    ]);
    const users = rows.map(r => ({
      login: r.login, nome: r.nome, avatar: mapaAv[r.login] || null, papel: r.papel, funcao: perfilDe(r), abas: r.abas, ativo: r.ativo, auth: r.auth,
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
    res.setHeader("Cache-Control", "no-store"); // a resposta pode trazer a senha temporária gerada
    const b = req.body || {};
    const login = String(b.login || "").trim().toLowerCase();
    const cur = (await sql`SELECT login, papel, funcao, auth FROM usuarios WHERE login = ${login}`)[0];
    const alvoMestre = cur && (cur.papel === "master" || cur.funcao === "mestre");
    if (alvoMestre && !souMestre) return res.status(403).json({ error: "Só o Mestre altera o próprio cadastro." });
    const senhaInvalida = `A senha precisa ter pelo menos ${SENHA_MIN} caracteres e não pode ser uma senha padrão.`;

    // Redefinir/definir senha.
    //  - Mestre: define a própria senha (definitiva), digitada por ele.
    //  - Demais: o servidor gera uma senha temporária aleatória, devolvida só nesta resposta; a pessoa troca no próximo acesso.
    if (b.acao === "senha") {
      if (!cur) return res.status(404).json({ error: "Usuário não encontrado." });
      if (alvoMestre && !senhaValida(b.senha)) return res.status(400).json({ error: senhaInvalida });
      const senhaGerada = alvoMestre ? undefined : gerarSenhaTemporaria();
      if (cur.auth !== "senha") await sql`UPDATE usuarios SET auth = 'senha', atualizado_em = now() WHERE login = ${login}`;
      await gravarSenha(login, alvoMestre ? b.senha : senhaGerada, !alvoMestre);
      return res.status(200).json({ ok: true, senhaGerada });
    }

    const nome = String(b.nome || "").trim().slice(0, 120);
    const ativo = b.ativo !== false;
    const pecas = !!b.podeEnviarPecas;
    let funcao = Object.keys(PERFIS).includes(b.funcao) ? b.funcao : "personalizado";
    if (funcao === "mestre" && !alvoMestre && !souMestre) return res.status(400).json({ error: "Só o Mestre pode definir outro Mestre." });
    const abas = funcao === "personalizado" && Array.isArray(b.abas) ? [...new Set(b.abas.filter(t => ESCOLHAS.includes(t)))] : [];
    if (funcao === "personalizado" && !abas.length) return res.status(400).json({ error: "Marque pelo menos um módulo ou aba." });
    // Senha: só o Mestre digita a própria (b.senha). Para os demais, b.gerarSenha (ou uma senha enviada por cliente antigo)
    // apenas pede uma senha temporária, que é sempre gerada aqui no servidor e devolvida uma única vez em senhaGerada.
    const temSenha = typeof b.senha === "string" && b.senha.trim().length > 0;
    const senhaLimpa = temSenha ? b.senha.trim() : "";
    const querSenha = b.gerarSenha === true || temSenha;

    if (cur) {
      let senhaGerada;
      if (alvoMestre) {
        if (temSenha && !senhaValida(senhaLimpa)) return res.status(400).json({ error: senhaInvalida });
        await sql`UPDATE usuarios SET nome = ${nome || login}, pode_enviar_pecas = ${pecas}, auth = ${temSenha ? "senha" : cur.auth}, atualizado_em = now() WHERE login = ${login}`;
        if (temSenha) await gravarSenha(login, senhaLimpa, false);
      } else {
        await sql`UPDATE usuarios SET nome = ${nome || login}, funcao = ${funcao}, abas = ${JSON.stringify(abas)}::jsonb, ativo = ${ativo},
                  auth = ${querSenha ? "senha" : cur.auth}, pode_enviar_pecas = ${pecas}, atualizado_em = now() WHERE login = ${login}`;
        if (funcao !== cur.funcao) await addToTeam(nome, funcao);
        if (querSenha) { senhaGerada = gerarSenhaTemporaria(); await gravarSenha(login, senhaGerada, true); }
      }
      forgetUser(login);
      return res.status(200).json({ ok: true, criado: false, senhaGerada });
    }

    // Novo usuário: com e-mail da Quinze (Locaweb ou senha própria) ou com usuário/outro e-mail e senha temporária gerada.
    const comEmail = login.includes("@");
    const qzEmail = /@quinzecomunicacao\.com(\.br)?$/i.test(login);
    const usaSenha = !qzEmail || querSenha;
    if (comEmail && !EMAIL.test(login)) return res.status(400).json({ error: "Informe um e-mail válido." });
    if (!comEmail && !USUARIO.test(login)) return res.status(400).json({ error: "O usuário deve ter de 3 a 40 letras minúsculas, números, ponto, hífen ou sublinhado." });
    await sql`INSERT INTO usuarios (login, nome, papel, funcao, abas, ativo, auth, pode_enviar_pecas, criado_por)
              VALUES (${login}, ${nome || login}, 'usuario', ${funcao}, ${JSON.stringify(abas)}::jsonb, ${ativo}, ${usaSenha ? "senha" : "locaweb"}, ${pecas}, ${me.login})`;
    const senhaGerada = usaSenha ? gerarSenhaTemporaria() : undefined;
    if (usaSenha) await gravarSenha(login, senhaGerada, true);
    await addToTeam(nome, funcao);
    // Primeiro usuário individual criado: o login compartilhado antigo deixa de funcionar.
    const off = await sql`UPDATE usuarios SET ativo = false, atualizado_em = now() WHERE login = ${LEGADO} AND ativo RETURNING login`;
    off.forEach(r => forgetUser(r.login));
    return res.status(200).json({ ok: true, criado: true, compartilhadoDesativado: off.length > 0, senhaGerada });
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
