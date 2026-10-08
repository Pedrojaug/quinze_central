// Rota única dos módulos 01 Atendimento (tarefas, relatório, pendências), 02 Aprovação de peças, 03 Administrativo, 04 CS, 05 Políticas e 06 Financeiro: /api/m?r=<modulo>/<acao>
// (uma função só, para caber no limite de funções do plano da Vercel).
// A permissão é sempre conferida aqui no servidor: primeiro o módulo (perfil), depois a ação.
import { requireSession } from "./_lib.js";
import * as adm from "./_adm.js";
import * as cs from "./_cs.js";
import * as pol from "./_pol.js";
import * as fin from "./_fin.js";
import * as pec from "./_pecas.js";
import * as tar from "./_tarefas.js";
import * as pen from "./_pendencias.js";
import * as pop from "./_pop.js";
import * as onb from "./_onb.js";
import * as onbExc from "./_onbexcluir.js";

// pop: "area" null = qualquer pessoa logada (Meu POP); as ações de edição conferem o perfil dentro de _pop.js.
const MODULOS = { pop: { area: null, h: pop }, tar: { area: "atendimento", h: tar }, onb: { area: "atendimento", h: { rotas: { ...onb.rotas, ...onbExc.rotas } } }, pen: { area: "atendimento", h: pen }, pec: { area: "pecas", h: pec }, adm: { area: "administrativo", h: adm }, cs: { area: "cs", h: cs }, pol: { area: "politicas", h: pol }, fin: { area: "financeiro", h: fin } };

export default async function handler(req, res) {
  const r = String(req.query.r || "");
  const i = r.indexOf("/");
  const mod = MODULOS[i > 0 ? r.slice(0, i) : r];
  const acao = i > 0 ? r.slice(i + 1) : "";
  if (!mod || !/^[a-z0-9_.-]{1,40}$/.test(acao)) return res.status(404).json({ code: "rota" });
  // Rotas sem sessão: .ics das férias (token secreto) e rotinas diárias (CRON_SECRET).
  if (mod.h.publicas && mod.h.publicas[acao]) return mod.h.publicas[acao](req, res);
  const u = await requireSession(req, res);
  if (!u) return;
  if (mod.area && !(u.areas || []).includes(mod.area)) return res.status(403).json({ code: "sem_acesso" });
  const fn = mod.h.rotas[acao];
  if (!fn) return res.status(404).json({ code: "rota" });
  try {
    return await fn(u, req, res);
  } catch (e) {
    console.error(`[m] ${r}:`, e && e.message ? e.message.slice(0, 200) : "erro");
    if (!res.headersSent) return res.status(500).json({ code: "erro" });
  }
}
