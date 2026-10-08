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

// ---------- Usuário da sessão ----------
// Sempre conferido no cadastro: quem for bloqueado perde o acesso em até 15 s.
const cache = new Map();
export async function loadUser(login) {
  const c = cache.get(login);
  if (c && Date.now() - c.at < 15000 && !(c.u && c.u.trocarSenha)) return c.u; // senha temporária: sempre confere de novo
  const r = (await sql`SELECT u.login, u.nome, u.papel, u.funcao, u.abas, u.ativo, u.auth, u.pode_enviar_pecas,
                              coalesce(a.trocar, false) AS trocar
                       FROM usuarios u LEFT JOIN app_users a ON u.auth = 'senha' AND lower(a.username) = u.login
                       WHERE u.login = ${login}`)[0];
  const u = r && r.ativo ? {
    login: r.login, nome: r.nome, papel: r.papel, funcao: perfilDe(r), auth: r.auth,
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
// Hash bcrypt (custo 12) feito no banco (pgcrypto). A senha nunca é gravada nem devolvida em texto.
export const SENHA_MIN = 8;
export const senhaValida = s => typeof s === "string" && s.length >= SENHA_MIN && s.length <= 200 && !/[\r\n]/.test(s);
export async function gravarSenha(login, senha, trocar) {
  await sql`INSERT INTO app_users (username, pass_hash, trocar, atualizada_em) VALUES (${login}, crypt(${senha}, gen_salt('bf', 12)), ${!!trocar}, now())
            ON CONFLICT (username) DO UPDATE SET pass_hash = EXCLUDED.pass_hash, trocar = EXCLUDED.trocar, atualizada_em = now()`;
  forgetUser(login);
}
export async function conferirSenha(login, senha) {
  const r = await sql`SELECT (pass_hash = crypt(${senha}, pass_hash)) AS ok FROM app_users WHERE lower(username) = ${login}`;
  return !!(r[0] && r[0].ok);
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
