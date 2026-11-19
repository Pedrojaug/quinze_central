import { neon } from "@neondatabase/serverless";
import crypto from "node:crypto";
import { abasDe, areasDe, podeCaminho, perfilDe, ehGestao as ehGestaoDe } from "./_modules.js";

// Conexão. Nos deploys de PREVIEW, DB_ENDPOINT_PREVIEW (ex.: "ep-xxx-yyy-123") troca só o
// endereço do banco para um branch de teste do Neon; usuário e senha continuam os da DATABASE_URL.
function dbUrl() {
  const base = process.env.DATABASE_URL;
  const ep = process.env.DB_ENDPOINT_PREVIEW;
  if (process.env.VERCEL_ENV !== "preview" || !ep || !/^ep-[a-z0-9-]+$/.test(ep) || !base) return base;
  const u = new URL(base);
  const host = u.hostname.replace(/^ep-[a-z0-9]+-[a-z0-9]+-[a-z0-9]+/, ep);
  if (!host.startsWith(ep + "-") && !host.startsWith(ep + ".")) throw new Error("DB_ENDPOINT_PREVIEW não aplicado"); // nunca cai no banco principal por engano
  u.hostname = host;
  return u.toString();
}
export const sql = neon(dbUrl());
const COOKIE = "qz_sess";
const DAYS = 30;

// ---------- Sessão ----------
// O segredo das sessões fica no próprio banco (tabela app_secrets), gerado lá dentro.
let secretP = null;
function secret() {
  if (!secretP) secretP = sql`SELECT value FROM app_secrets WHERE key = 'session_secret'`
    .then(r => { const v = r[0]?.value; if (!v) throw new Error("sem segredo de sessão"); return v; })
    .catch(e => { secretP = null; throw e; });
  return secretP;
}
async function hmac(p) { return crypto.createHmac("sha256", await secret()).update(p).digest("base64url"); }
async function sign(payload) { const p = Buffer.from(JSON.stringify(payload)).toString("base64url"); return p + "." + (await hmac(p)); }
async function verify(tok) {
  if (!tok) return null;
  const [p, s] = String(tok).split(".");
  if (!p || !s) return null;
  const e = await hmac(p);
  if (s.length !== e.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(e))) return null;
  try { const d = JSON.parse(Buffer.from(p, "base64url").toString()); return d.exp > Date.now() ? d : null; } catch { return null; }
}
function cookies(req) {
  const out = {};
  (req.headers.cookie || "").split(";").forEach(c => { const i = c.indexOf("="); if (i > 0) out[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim()); });
  return out;
}

// ---------- Contas padrão da equipe (idempotente) ----------
// As contas criadas aqui recebem uma senha aleatória que ninguém conhece: para liberar o acesso,
// a gestão usa "Redefinir senha" e passa à pessoa a senha temporária gerada (mostrada uma única vez).
const CONTAS_EQUIPE = [
  // Suporte
  { login: "equipe.inteligentte", nome: "Equipe Inteligentte", papel: "master", funcao: "mestre" },
  // Sociais
  { login: "francilia.sm", nome: "Francília", papel: "usuario", funcao: "social", socialNome: "FRANCÍLIA" },
  { login: "leticia.sm", nome: "Letícia", papel: "usuario", funcao: "social", socialNome: "LETÍCIA" },
  { login: "mari.sm", nome: "Mari", papel: "usuario", funcao: "social", socialNome: "MARI" },
  // Coordenadores e Mestres
  { login: "igor.calado", nome: "Igor Calado", papel: "usuario", funcao: "coordenador" },
  { login: "well.silva", nome: "Well Silva", papel: "usuario", funcao: "coordenador" },
  { login: "eduardo", nome: "Eduardo", papel: "master", funcao: "mestre" },
  { login: "marcilio", nome: "Marcílio", papel: "master", funcao: "mestre" },
  // Direção de arte
  { login: "gabriel.da", nome: "Gabriel", papel: "usuario", funcao: "diretor_arte" },
  { login: "artur.da", nome: "Artur", papel: "usuario", funcao: "diretor_arte" },
  { login: "math.da", nome: "Math", papel: "usuario", funcao: "diretor_arte" },
  { login: "pablo.da", nome: "Pablo", papel: "usuario", funcao: "diretor_arte" },
  { login: "felipe.da", nome: "Felipe", papel: "usuario", funcao: "diretor_arte" },
];

let seedContasP = null;
export function garantirContasPadrao() {
  if (!seedContasP) {
    seedContasP = (async () => {
      try {
        const flag = await sql`SELECT 1 FROM docs WHERE path = 'config/seed_contas_v2' AND NOT deleted`;
        if (!flag.length) {
          for (const c of CONTAS_EQUIPE) {
            await sql`INSERT INTO usuarios (login, nome, papel, funcao, abas, ativo, auth, pode_enviar_pecas, criado_por)
                      VALUES (${c.login}, ${c.nome}, ${c.papel}, ${c.funcao}, '[]'::jsonb, true, 'senha', true, 'sistema')
                      ON CONFLICT (login) DO UPDATE SET
                        papel = EXCLUDED.papel,
                        funcao = EXCLUDED.funcao,
                        ativo = true,
                        pode_enviar_pecas = true,
                        atualizado_em = now()`;
            // Nunca mexe em senha já existente; conta nova fica com senha aleatória descartada.
            await sql`INSERT INTO app_users (username, pass_hash, trocar, atualizada_em)
                      VALUES (${c.login}, crypt(${crypto.randomBytes(32).toString("base64url")}, gen_salt('bf', 10)), true, now())
                      ON CONFLICT (username) DO NOTHING`;
          }
          // Garante também que contas existentes de Eduardo ou Marcílio (ex.: com e-mail) recebam perfil Mestre
          await sql`UPDATE usuarios SET papel = 'master', funcao = 'mestre', pode_enviar_pecas = true, atualizado_em = now()
                    WHERE lower(login) LIKE 'eduardo@%' OR lower(login) LIKE 'marcilio@%'
                       OR lower(nome) IN ('eduardo', 'marcilio', 'marcílio')`;
          // Inclui as social medias na lista da equipe da Carteira (config/geral)
          for (const sNome of ["FRANCÍLIA", "LETÍCIA", "MARI"]) {
            await sql`UPDATE docs SET data = jsonb_set(data, '{socials}'::text[],
                        (CASE WHEN jsonb_typeof(data->'socials') = 'array' THEN data->'socials' ELSE '[]'::jsonb END) || to_jsonb(${sNome}::text), true),
                      updated_at = now(), seq = nextval('docs_seq')
                      WHERE path = 'config/geral' AND NOT deleted
                        AND NOT ((CASE WHEN jsonb_typeof(data->'socials') = 'array' THEN data->'socials' ELSE '[]'::jsonb END) ? ${sNome})`;
          }
          await sql`INSERT INTO docs (path, parent, id, data)
                    VALUES ('config/seed_contas_v2', 'config', 'seed_contas_v2', '{"ok":true}'::jsonb)
                    ON CONFLICT (path) DO UPDATE SET data = '{"ok":true}'::jsonb, deleted = false, updated_at = now()`;
          cache.clear();
        }
        // Desativa contas redundantes do seed ('eduardo', 'marcilio') quando já existe conta ativa com e-mail (@)
        const dedupFlag = await sql`SELECT 1 FROM docs WHERE path = 'config/dedup_contas_v1' AND NOT deleted`;
        if (!dedupFlag.length) {
          await sql`UPDATE usuarios SET ativo = false, atualizado_em = now()
                    WHERE login = 'eduardo' AND ativo = true
                      AND EXISTS (SELECT 1 FROM usuarios u2 WHERE lower(u2.login) LIKE 'eduardo@%' AND u2.ativo = true)`;
          await sql`UPDATE usuarios SET ativo = false, atualizado_em = now()
                    WHERE login = 'marcilio' AND ativo = true
                      AND EXISTS (SELECT 1 FROM usuarios u2 WHERE lower(u2.login) LIKE 'marcilio@%' AND u2.ativo = true)`;
          await sql`INSERT INTO docs (path, parent, id, data)
                    VALUES ('config/dedup_contas_v1', 'config', 'dedup_contas_v1', '{"ok":true}'::jsonb)
                    ON CONFLICT (path) DO UPDATE SET data = '{"ok":true}'::jsonb, deleted = false, updated_at = now()`;
          cache.clear();
        }
      } catch (e) {
        console.error("[lib] garantirContasPadrao:", e?.message || e);
        seedContasP = null;
      }
    })();
  }
  return seedContasP;
}

// ---------- Usuário da sessão ----------
// Sempre conferido no cadastro: quem for bloqueado perde o acesso em até 15 s.
// Avatares ficam armazenados na tabela docs (m/pecas/config/avatares) para não exigir DDL na tabela usuarios.
const cache = new Map();
let avataresCache = { map: {}, at: 0 };

export async function carregarMapaAvatares(forcar = false) {
  if (!forcar && Date.now() - avataresCache.at < 15000) return avataresCache.map;
  try {
    const r = await sql`SELECT data FROM docs WHERE path = 'm/pecas/config/avatares' AND NOT deleted`;
    const map = (r[0] && r[0].data && typeof r[0].data === "object") ? r[0].data : {};
    avataresCache = { map, at: Date.now() };
    return map;
  } catch {
    return avataresCache.map || {};
  }
}

export async function salvarAvatarUsuario(login, avatarDataUrl) {
  const mapaAtual = { ...(await carregarMapaAvatares(true)) };
  if (avatarDataUrl) mapaAtual[login] = avatarDataUrl;
  else delete mapaAtual[login];
  await sql`INSERT INTO docs (path, parent, id, data)
            VALUES ('m/pecas/config/avatares', 'm/pecas/config', 'avatares', ${JSON.stringify(mapaAtual)}::jsonb)
            ON CONFLICT (path) DO UPDATE SET data = EXCLUDED.data, deleted = false, updated_at = now()`;
  avataresCache = { map: mapaAtual, at: Date.now() };
  forgetUser(login);
}

export async function loadUser(login) {
  await garantirContasPadrao();
  const c = cache.get(login);
  if (c && Date.now() - c.at < 15000 && !(c.u && c.u.trocarSenha)) return c.u; // senha temporária: sempre confere de novo
  const [rows, mapaAv] = await Promise.all([
    sql`SELECT u.login, u.nome, u.papel, u.funcao, u.abas, u.ativo, u.auth, u.pode_enviar_pecas,
               coalesce(a.trocar, false) AS trocar
        FROM usuarios u LEFT JOIN app_users a ON u.auth = 'senha' AND lower(a.username) = u.login
        WHERE u.login = ${login}`,
    carregarMapaAvatares(),
  ]);
  const r = rows[0];
  const u = r && r.ativo ? {
    login: r.login, nome: r.nome, papel: r.papel, funcao: perfilDe(r), auth: r.auth,
    avatar: mapaAv[r.login] || null,
    abas: abasDe(r), areas: areasDe(r), podeEnviarPecas: !!r.pode_enviar_pecas,
    trocarSenha: r.auth === "senha" && !!r.trocar,
  } : null;
  cache.set(login, { u, at: Date.now() });
  return u;
}
export function forgetUser(login) { cache.delete(login); }
export async function session(req) {
  const s = await verify(cookies(req)[COOKIE]);
  return s ? loadUser(s.u) : null;
}
export async function setSession(res, login) {
  res.setHeader("Set-Cookie", `${COOKIE}=${await sign({ u: login, exp: Date.now() + DAYS * 864e5 })}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${DAYS * 86400}`);
}
export function clearSession(res) { res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`); }
// Exige sessão. Quem está com senha temporária só usa as rotas que liberam a troca (opt.permitirTroca).
export async function requireSession(req, res, opt = {}) {
  const u = await session(req);
  if (!u) { res.status(401).json({ error: "unauthorized" }); return null; }
  if (u.trocarSenha && !opt.permitirTroca) { res.status(403).json({ error: "trocar_senha", code: "trocar_senha" }); return null; }
  return u;
}

// ---------- Permissões e validação ----------
export const canPath = podeCaminho;
export const ehGestao = ehGestaoDe;
const SEG = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;
export function checkPath(p) {
  if (typeof p !== "string" || p.length > 1000) return false;
  const parts = p.split("/");
  return parts.length % 2 === 0 && parts.length <= 16 && parts.every(x => SEG.test(x) && x !== "." && x !== "..");
}
export function clientIp(req) { return String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "desconhecido"; }

// ---------- Senhas próprias (usuários sem e-mail) ----------
// Hash bcrypt feito no banco (pgcrypto). A senha nunca é gravada nem devolvida em texto.
export const SENHA_MIN = 6;
// Senhas que já foram padrão (e estão no histórico público do repositório): nunca valem para entrar nem podem ser gravadas.
const SENHAS_PROIBIDAS = new Set(["12345678", "1234578"]);
export const senhaValida = s => typeof s === "string" && s.length >= SENHA_MIN && s.length <= 200 && !/[\r\n]/.test(s) && !SENHAS_PROIBIDAS.has(s);
// Senha temporária aleatória (gerada no servidor ao criar ou redefinir um acesso). Sem caracteres ambíguos (0/O, 1/l/I).
const ALFABETO_TEMP = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function gerarSenhaTemporaria(tamanho = 12) {
  let s = "";
  for (let i = 0; i < tamanho; i++) s += ALFABETO_TEMP[crypto.randomInt(ALFABETO_TEMP.length)];
  return s;
}
export async function gravarSenha(login, senha, trocar) {
  await sql`INSERT INTO app_users (username, pass_hash, trocar, atualizada_em) VALUES (${login}, crypt(${senha}, gen_salt('bf', 12)), ${!!trocar}, now())
            ON CONFLICT (username) DO UPDATE SET pass_hash = EXCLUDED.pass_hash, trocar = EXCLUDED.trocar, atualizada_em = now()`;
  forgetUser(login);
}
export async function conferirSenha(login, senha) {
  if (typeof senha !== "string" || !senha || SENHAS_PROIBIDAS.has(senha)) return false;
  const r = await sql`SELECT (pass_hash = crypt(${senha}, pass_hash)) AS ok FROM app_users WHERE lower(username) = ${login}`;
  return !!(r[0] && r[0].ok);
}

// ---------- Senha mestre (apagar peças, desbloquear edição da Carteira) ----------
// Aceita a senha mestre global OU a senha de qualquer usuário Mestre ativo.
// A senha global fica só como hash bcrypt na variável de ambiente MASTER_PASS_BCRYPT, nunca no código.
// Gere o hash no SQL do Neon com: SELECT crypt('<nova senha>', gen_salt('bf', 12));
// Sem a variável, vale só a senha de um usuário Mestre ativo.
const BCRYPT = /^\$2[abxy]\$\d{2}\$[./A-Za-z0-9]{53}$/;
function hashMestreGlobal() {
  const h = String(process.env.MASTER_PASS_BCRYPT || "").trim();
  if (!h) return null;
  if (!BCRYPT.test(h)) { console.error("[lib] MASTER_PASS_BCRYPT inválida (esperado um hash bcrypt $2a$/$2b$)"); return null; }
  return "$2a$" + h.slice(4); // o pgcrypto confere no formato $2a$ (igual a $2b$/$2y$ para senhas de até 72 bytes)
}
export async function conferirSenhaMestre(senhaRaw) {
  const s = String(senhaRaw || "").trim();
  if (!s || s.length > 200 || SENHAS_PROIBIDAS.has(s)) return false;
  const global = hashMestreGlobal();
  if (global) {
    try {
      const g = await sql`SELECT crypt(${s}, ${global}) = ${global} AS ok`;
      if (g[0] && g[0].ok) return true;
    } catch (e) { console.error("[lib] senha mestre global:", e?.message || e); }
  }
  try {
    const r = await sql`SELECT 1 FROM app_users a
                        JOIN usuarios u ON lower(a.username) = u.login
                        WHERE u.ativo AND (u.papel = 'master' OR u.funcao = 'mestre')
                          AND a.pass_hash = crypt(${s}, a.pass_hash)
                        LIMIT 1`;
    if (r.length > 0) return true;
  } catch {}
  return false;
}
// Mesmo limite do login (10 erros em 15 min, por endereço e por usuário). Devolve "ok", "erro" ou "bloqueado".
export async function conferirSenhaMestreComLimite(req, u, senhaRaw) {
  const ip = clientIp(req);
  if (await bloqueado(ip, u.login)) return "bloqueado";
  const ok = await conferirSenhaMestre(senhaRaw);
  if (!ok) await registrarTentativa(ip, u.login, false);
  return ok ? "ok" : "erro";
}
// Bloqueio por excesso de erros: 10 senhas erradas em 15 minutos, por endereço e por usuário.
export async function bloqueado(ip, login) {
  const [{ n, m }] = await sql`SELECT count(*) FILTER (WHERE ip = ${ip})::int AS n, count(*) FILTER (WHERE login = ${login || ""})::int AS m
                               FROM login_attempts WHERE NOT ok AND at > now() - interval '15 minutes' AND (ip = ${ip} OR login = ${login || ""})`;
  return n >= 10 || (!!login && m >= 10);
}
export async function registrarTentativa(ip, login, ok) {
  await sql`INSERT INTO login_attempts (ip, login, ok) VALUES (${ip}, ${login || null}, ${ok})`;
}
