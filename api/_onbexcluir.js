// Excluir e restaurar onboarding (pedido do Eduardo em 08/10/2026). Só Mestre e gestão (conferido aqui).
// Rotas na mesma área do onboarding: /api/m?r=onb/excluir | onb/excluidos | onb/restaurar.
import { sql } from "./_lib.js";
import { perfilDe } from "./_modules.js";
import { auditar, criarSeNovo, listar, ler, gravar, apagar } from "./_mdados.js";

const corpo = req => (req.body && typeof req.body === "object" ? req.body : {});
const so = (req, res, metodo) => { if (req.method !== metodo) { res.status(405).json({ code: "method" }); return false; } return true; };
const quem = u => ({ login: u.login, nome: u.nome || u.login });
const agora = () => new Date().toISOString();
async function lerOnb(id) {
  if (typeof id !== "string" || !/^[A-Za-z0-9_\-.]{1,120}$/.test(id)) return null;
  const r = await sql`SELECT data FROM docs WHERE path = ${"onboarding/" + id} AND NOT deleted`;
  return r[0] ? { ...r[0].data, id } : null;
}
// Contrato que veio do onboarding (mesmo id usado em _adm.js: "onb-<onboarding>").
const idOnb = onbId => "onb-" + String(onbId).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 100);
async function excluirContratoDoOnboarding(onbId, u) {
  const id = idOnb(onbId), c = await ler("administrativo", "contratos", id);
  if (!c) return { acao: "nao_existe" };
  if (c.conferido || c.origem !== "onboarding") return { acao: "mantido_conferido" };
  await apagar("administrativo", "contratos", id);
  await auditar(u, "administrativo", "contrato.excluir.onboarding", id, { onboarding: onbId });
  return { acao: "excluido", registro: c };
}
async function restaurarContratoDoOnboarding(onbId, registro, u) {
  const id = idOnb(onbId);
  if (!registro || (await ler("administrativo", "contratos", id))) return false;
  await gravar("administrativo", "contratos", id, { ...registro, id });
  await auditar(u, "administrativo", "contrato.restaurar.onboarding", id, { onboarding: onbId });
  return true;
}

// Nada é apagado de vez: antes de sair da lista, o onboarding é copiado para m/atendimento/onboarding_excluidos/<id>__<n>
// (fora da sincronização), de onde a gestão pode restaurar. Na confirmação, a pessoa escolhe se também:
//  - retira o cliente da Carteira (status "retirado", a partir do mês em que foi inserido; reativável pela própria Carteira);
//  - exclui o contrato que veio do onboarding, só se ainda estiver "a conferir" (contrato já conferido pela gestão fica).
const ehGestao = u => ["mestre", "gestao"].includes(perfilDe(u));
const soGestao = res => res.status(403).json({ code: "sem_acesso", msg: "Só o Mestre e a gestão excluem ou restauram onboardings." });
async function excluir(u, req, res) {
  if (!so(req, res, "POST")) return;
  if (!ehGestao(u)) return soGestao(res);
  const b = corpo(req), o = await lerOnb(b.id);
  if (!o) return res.status(404).json({ code: "nao_encontrado", msg: "Onboarding não encontrado (talvez já tenha sido excluído)." });
  const em = agora(), copiaId = `${o.id}__${Date.now().toString(36)}`;
  const opcoes = { retirarCarteira: !!b.retirarCarteira, excluirContrato: !!b.excluirContrato };
  // 1. Cópia completa primeiro (se algo falhar depois, o onboarding continua salvo).
  await criarSeNovo("atendimento", "onboarding_excluidos", copiaId, { onboardingId: o.id, nome: o.nome || o.id, onboarding: o, excluidoEm: em, excluidoPor: quem(u), opcoes });
  const resultado = { carteira: "nao_pedido", contrato: "nao_pedido", meses: [] };
  // 2. Carteira: marca como retirado (não apaga) nos meses a partir do de inserção.
  if (opcoes.retirarCarteira) {
    const ins = o.carteira?.inserido;
    if (!ins?.id) resultado.carteira = "nao_estava";
    else {
      const desde = `meses/${ins.mes || "0000-00"}/clientes`;
      const r = await sql`UPDATE docs SET data = data || ${JSON.stringify({ status: "retirado", motivo: "Onboarding excluído", atualizadoEm: em })}::jsonb,
                            updated_at = now(), seq = nextval('docs_seq')
                          WHERE parent LIKE 'meses/%/clientes' AND parent >= ${desde} AND id = ${ins.id} AND NOT deleted AND coalesce(data->>'status', '') <> 'retirado'
                          RETURNING parent`;
      resultado.meses = r.map(x => x.parent.split("/")[1]).sort();
      resultado.carteira = r.length ? "retirado" : "ja_retirado";
    }
  }
  // 3. Contrato "a conferir".
  let contratoRemovido = null;
  if (opcoes.excluirContrato) {
    const c = await excluirContratoDoOnboarding(o.id, u);
    resultado.contrato = c.acao; contratoRemovido = c.registro || null;
  }
  if (contratoRemovido || resultado.carteira !== "nao_pedido")
    await sql`UPDATE docs SET data = data || ${JSON.stringify({ resultado, contratoRemovido })}::jsonb WHERE path = ${`m/atendimento/onboarding_excluidos/${copiaId}`}`;
  // 4. Sai da lista (a página recebe a exclusão pela sincronização).
  await sql`UPDATE docs SET deleted = true, data = '{}'::jsonb, updated_at = now(), seq = nextval('docs_seq') WHERE path = ${"onboarding/" + o.id}`;
  await auditar(u, "atendimento", "onboarding.excluir", o.id, { ...opcoes, carteira: resultado.carteira, contrato: resultado.contrato });
  const partes = [`Onboarding de ${o.nome || o.id} excluído.`];
  if (resultado.carteira === "retirado") partes.push(`Cliente retirado da Carteira (${resultado.meses.join(", ")}).`);
  if (resultado.carteira === "nao_estava") partes.push("O cliente não estava na Carteira.");
  if (resultado.contrato === "excluido") partes.push("Contrato a conferir excluído.");
  if (resultado.contrato === "mantido_conferido") partes.push("O contrato já tinha sido conferido pela gestão e continua em Contratos.");
  return res.json({ ok: true, resultado, msg: partes.join(" ") });
}
async function excluidos(u, req, res) {
  if (!ehGestao(u)) return soGestao(res);
  const lista = (await listar("atendimento", "onboarding_excluidos")).filter(x => !x.restauradoEm)
    .map(x => ({ id: x.id, onboardingId: x.onboardingId, nome: x.nome, inicio: x.onboarding?.inicio || "", atendimento: x.onboarding?.atendimento || "",
      status: x.onboarding?.status || "", excluidoEm: x.excluidoEm, excluidoPor: x.excluidoPor, opcoes: x.opcoes, resultado: x.resultado || null }))
    .sort((a, b) => (b.excluidoEm || "").localeCompare(a.excluidoEm || ""));
  return res.json({ excluidos: lista });
}
async function restaurar(u, req, res) {
  if (!so(req, res, "POST")) return;
  if (!ehGestao(u)) return soGestao(res);
  const x = await ler("atendimento", "onboarding_excluidos", String(corpo(req).id || ""));
  if (!x || x.restauradoEm) return res.status(404).json({ code: "nao_encontrado", msg: "Não está na lista de excluídos." });
  const { id: _i, ...dados } = x.onboarding || {};
  if (await lerOnb(x.onboardingId)) return res.status(409).json({ code: "existe", msg: "Já existe um onboarding ativo com este mesmo nome. Exclua ou renomeie o atual antes de restaurar." });
  const em = agora();
  await sql`INSERT INTO docs (path, parent, id, data) VALUES (${"onboarding/" + x.onboardingId}, 'onboarding', ${x.onboardingId}, ${JSON.stringify(dados)}::jsonb)
            ON CONFLICT (path) DO UPDATE SET data = EXCLUDED.data, deleted = false, updated_at = now(), seq = nextval('docs_seq')`;
  const contrato = x.contratoRemovido ? await restaurarContratoDoOnboarding(x.onboardingId, x.contratoRemovido, u) : false;
  await gravar("atendimento", "onboarding_excluidos", x.id, { ...x, restauradoEm: em, restauradoPor: quem(u) });
  await auditar(u, "atendimento", "onboarding.restaurar", x.onboardingId, { contrato });
  return res.json({ ok: true, onboardingId: x.onboardingId, msg: `Onboarding de ${x.nome} restaurado.` + (contrato ? " O contrato a conferir voltou para Contratos." : "")
    + (x.resultado?.carteira === "retirado" ? " Na Carteira o cliente continua como retirado: reative por lá, se for o caso." : "") });
}

export const rotas = { excluir, excluidos, restaurar };
