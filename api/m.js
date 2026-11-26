// Rota única dos módulos 01 Atendimento (tarefas, relatório, pendências), 02 Aprovação de peças, 03 Administrativo, 04 CS, 05 Políticas e 06 Financeiro: /api/m?r=<modulo>/<acao>
// (uma função só, para caber no limite de funções do plano da Vercel).
// A permissão é sempre conferida aqui no servidor: primeiro o módulo (perfil), depois a ação.
// Os módulos usam import() com literais estáticos para o empacotador da Vercel incluir todos no bundle mantendo lazy-loading.
import { requireSession } from "./_lib.js";

// pop: "area" null = qualquer pessoa logada (Meu POP); as ações de edição conferem o perfil dentro de _pop.js.
export const MODULOS_DEF = {
  pop: { area: null, carregar: () => import("./_pop.js") },
  tar: { area: "atendimento", carregar: () => import("./_tarefas.js") },
  onb: {
    area: "atendimento",
    carregar: async () => {
      const [onb, onbExc] = await Promise.all([import("./_onb.js"), import("./_onbexcluir.js")]);
      return {
        rotas: { ...(onb.rotas || {}), ...(onbExc.rotas || {}) },
        publicas: { ...(onb.publicas || {}), ...(onbExc.publicas || {}) },
      };
    },
  },
  pen: { area: "atendimento", carregar: () => import("./_pendencias.js") },
  pec: { area: "pecas", carregar: () => import("./_pecas.js") },
  adm: { area: "administrativo", carregar: () => import("./_adm.js") },
  cs: { area: "cs", carregar: () => import("./_cs.js") },
  pol: { area: "politicas", carregar: () => import("./_pol.js") },
  fin: { area: "financeiro", carregar: () => import("./_fin.js") },
};

const cacheModulos = new Map();
export async function carregarModulo(chave) {
  const def = MODULOS_DEF[chave];
  if (!def) return null;
  let prom = cacheModulos.get(chave);
  if (!prom) {
    prom = Promise.resolve()
      .then(() => def.carregar())
      .catch(err => {
        cacheModulos.delete(chave);
        throw err;
      });
    cacheModulos.set(chave, prom);
  }
  return prom;
}

export function criarHandler({ exigirSessao = requireSession, resolverModulo = carregarModulo } = {}) {
  return async function handler(req, res) {
    if (typeof res.setHeader === "function") {
      res.setHeader("Cache-Control", "no-store");
    }
    const r = String(req.query?.r || "");
    const i = r.indexOf("/");
    const chave = i > 0 ? r.slice(0, i) : r;
    const def = MODULOS_DEF[chave];
    const acao = i > 0 ? r.slice(i + 1) : "";
    if (!def || !/^[a-zA-Z0-9_.-]{1,40}$/.test(acao)) return res.status(404).json({ code: "rota" });
    try {
      const h = await resolverModulo(chave);
      // Rotas sem sessão: .ics das férias (token secreto) e rotinas diárias (CRON_SECRET).
      if (h?.publicas && h.publicas[acao]) return await h.publicas[acao](req, res);
      const u = await exigirSessao(req, res);
      if (!u) return;
      if (def.area && !(u.areas || []).includes(def.area)) return res.status(403).json({ code: "sem_acesso" });
      const fn = h?.rotas?.[acao];
      if (!fn) return res.status(404).json({ code: "rota" });
      return await fn(u, req, res);
    } catch (e) {
      console.error(`[m] ${r}:`, e && e.message ? e.message.slice(0, 200) : "erro");
      if (!res.headersSent) return res.status(500).json({ code: "erro" });
    }
  };
}

export default criarHandler();
