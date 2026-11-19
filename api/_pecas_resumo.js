// Cálculos puros de resumo mensal, metas da carteira e horários de pico do módulo 02 Aprovação de peças.
export const DECISOES = ["aprovada", "reprovada", "alteracao_solicitada"];

export const diaSP = iso => {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d)) return "";
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
  } catch { return ""; }
};

export const horaSP = iso => {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (isNaN(d)) return null;
    const hStr = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).format(d);
    return parseInt(hStr, 10);
  } catch { return null; }
};

export const calcPct = (num, den) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);

export function resumirMetaCarteira(clientes = [], totalPecas = 0, totalAprovadas = 0) {
  const metaConteudos = clientes.reduce((acc, cl) => acc + (cl.metaConteudos || 0), 0);
  const metaConteudosBase = clientes.reduce((acc, cl) => acc + (cl.conteudos || 0), 0);
  const metaMotions = clientes.reduce((acc, cl) => acc + (cl.motions || 0), 0);
  const clientesComMeta = clientes.filter(cl => (cl.metaConteudos || 0) > 0).length;
  return {
    metaConteudos,
    metaConteudosBase,
    metaMotions,
    clientesComMeta,
    pctCarteira: calcPct(totalPecas, metaConteudos),
    pctCarteiraAprovada: calcPct(totalAprovadas, metaConteudos),
  };
}

// Resumo analítico dinâmico (calculado com base nas peças vivas e arquivadas do banco)
export function resumoDinamico(todasPecas = [], carteira = [], filtroFn = () => true) {
  const nomes = {};
  const porUsuario = {}, porCoord = {}, porCli = {};
  const cliObj = id => (porCli[id] ||= {
    pecas: 0, pecasOnline: 0, pecasOffline: 0,
    versoes: 0, aprovada: 0, aprovadasOnline: 0, aprovadasOffline: 0,
    reprovada: 0, alteracao_solicitada: 0, pendente: 0,
    v1_decididas: 0, v1_aprovadas: 0, porUsuario: {}, porCoord: {},
  });
  const initUserStats = () => ({
    pecas: 0, pecasOnline: 0, pecasOffline: 0,
    versoes: 0,
    aprovadas: 0, aprovadasOnline: 0, aprovadasOffline: 0,
  });

  let totPecas = 0, totPecasOnline = 0, totPecasOffline = 0;
  let totVersoes = 0, totAprovadas = 0, totAprovadasOnline = 0, totAprovadasOffline = 0;
  let totReprovadas = 0, totAlt = 0, totV1d = 0, totV1a = 0;

  for (const p of todasPecas) {
    if (!p.clienteId) continue;
    const cid = p.clienteId;
    if (p.clienteNome && !nomes[`cli:${cid}`]) nomes[`cli:${cid}`] = p.clienteNome;
    const cObj = cliObj(cid);
    const ehOffline = String(p.tipoMidia || "online").toLowerCase() === "offline";

    const rem = p.remetente?.login;
    if (rem) {
      if (p.remetente?.nome && !nomes[rem]) nomes[rem] = p.remetente.nome;
      porUsuario[rem] ||= initUserStats();
    }

    // 1. Envio da peça inicial (versão 1)
    const diaCriacao = diaSP(p.criadoEm || (p.versoes && p.versoes[0]?.enviadaEm));
    if (diaCriacao && filtroFn(diaCriacao)) {
      cObj.pecas++;
      totPecas++;
      if (ehOffline) { cObj.pecasOffline++; totPecasOffline++; }
      else { cObj.pecasOnline++; totPecasOnline++; }
      if (rem) {
        porUsuario[rem].pecas++;
        const uCli = (cObj.porUsuario[rem] ||= initUserStats());
        uCli.pecas++;
        if (ehOffline) { porUsuario[rem].pecasOffline++; uCli.pecasOffline++; }
        else { porUsuario[rem].pecasOnline++; uCli.pecasOnline++; }
      }
    }

    // 2. Versões enviadas
    for (const v of p.versoes || []) {
      const diaV = diaSP(v.enviadaEm);
      if (diaV && filtroFn(diaV)) {
        cObj.versoes++;
        totVersoes++;
        if (rem) {
          porUsuario[rem].versoes++;
          (cObj.porUsuario[rem] ||= initUserStats()).versoes++;
        }
      }
    }

    // 3. Decisões no histórico
    let teveAprovacaoNoHist = false;
    for (const h of p.historico || []) {
      if (DECISOES.includes(h.tipo)) {
        const diaDec = diaSP(h.em);
        if (diaDec && filtroFn(diaDec)) {
          cObj[h.tipo]++;
          if (h.tipo === "aprovada") {
            totAprovadas++;
            if (ehOffline) { cObj.aprovadasOffline++; totAprovadasOffline++; }
            else { cObj.aprovadasOnline++; totAprovadasOnline++; }
            teveAprovacaoNoHist = true;
            if (rem) {
              const u = (porUsuario[rem] ||= initUserStats());
              u.aprovadas = (u.aprovadas || 0) + 1;
              const uCli = (cObj.porUsuario[rem] ||= initUserStats());
              uCli.aprovadas = (uCli.aprovadas || 0) + 1;
              if (ehOffline) { u.aprovadasOffline++; uCli.aprovadasOffline++; }
              else { u.aprovadasOnline++; uCli.aprovadasOnline++; }
            }
          } else if (h.tipo === "reprovada") totReprovadas++;
          else if (h.tipo === "alteracao_solicitada") totAlt++;

          if (h.versao === 1) {
            cObj.v1_decididas++;
            totV1d++;
            if (h.tipo === "aprovada") {
              cObj.v1_aprovadas++;
              totV1a++;
            }
          }

          const ap = h.por?.login;
          if (ap) {
            if (h.por?.nome && !nomes[ap]) nomes[ap] = h.por.nome;
            const coordGlobal = (porCoord[ap] ||= { aprovada: 0, reprovada: 0, alteracao_solicitada: 0 });
            coordGlobal[h.tipo]++;
            const coordCli = (cObj.porCoord[ap] ||= { aprovada: 0, reprovada: 0, alteracao_solicitada: 0 });
            coordCli[h.tipo]++;
          }
        }
      }
    }

    // Caso a peça tenha status aprovada sem histórico correspondente
    if (p.status === "aprovada" && !teveAprovacaoNoHist) {
      const diaAprov = diaSP(p.decididoEm || p.atualizadoEm || p.criadoEm);
      if (diaAprov && filtroFn(diaAprov)) {
        cObj.aprovada++;
        totAprovadas++;
        if (ehOffline) { cObj.aprovadasOffline++; totAprovadasOffline++; }
        else { cObj.aprovadasOnline++; totAprovadasOnline++; }
        if (rem) {
          const u = (porUsuario[rem] ||= initUserStats());
          u.aprovadas = (u.aprovadas || 0) + 1;
          const uCli = (cObj.porUsuario[rem] ||= initUserStats());
          uCli.aprovadas = (uCli.aprovadas || 0) + 1;
          if (ehOffline) { u.aprovadasOffline++; uCli.aprovadasOffline++; }
          else { u.aprovadasOnline++; uCli.aprovadasOnline++; }
        }
      }
    }

    // 4. Pendentes
    if (p.status === "pendente") {
      const diaAtual = diaSP(p.atualizadoEm || p.criadoEm);
      if (diaAtual && filtroFn(diaAtual)) {
        cObj.pendente++;
      }
    }
  }

  const enviadas = Object.entries(porUsuario)
    .filter(([_, x]) => x.pecas > 0 || x.versoes > 0 || (x.aprovadas || 0) > 0)
    .map(([login, x]) => ({ login, nome: nomes[login] || login, aprovadas: x.aprovadas || 0, ...x }))
    .sort((a, b) => b.pecas - a.pecas || (b.aprovadas || 0) - (a.aprovadas || 0) || b.versoes - a.versoes);

  const decisoes = Object.entries(porCoord)
    .map(([login, x]) => ({ login, nome: nomes[login] || login, ...x, total: x.aprovada + x.reprovada + x.alteracao_solicitada }))
    .filter(x => x.total > 0)
    .sort((a, b) => b.total - a.total);

  const mapaCarteira = new Map((carteira || []).map(cl => [cl.id, cl]));
  const idsClientes = new Set([...mapaCarteira.keys(), ...Object.keys(porCli)]);

  const clientes = [...idsClientes].map(id => {
    const meta = mapaCarteira.get(id) || {};
    const st = porCli[id] || { pecas: 0, pecasOnline: 0, pecasOffline: 0, versoes: 0, aprovada: 0, aprovadasOnline: 0, aprovadasOffline: 0, reprovada: 0, alteracao_solicitada: 0, pendente: 0, v1_decididas: 0, v1_aprovadas: 0, porUsuario: {}, porCoord: {} };
    const envCli = Object.entries(st.porUsuario)
      .filter(([_, x]) => x.pecas > 0 || x.versoes > 0 || (x.aprovadas || 0) > 0)
      .map(([login, x]) => ({ login, nome: nomes[login] || login, aprovadas: x.aprovadas || 0, ...x }))
      .sort((a, b) => b.pecas - a.pecas || (b.aprovadas || 0) - (a.aprovadas || 0) || b.versoes - a.versoes);
    const decCli = Object.entries(st.porCoord)
      .map(([login, x]) => ({ login, nome: nomes[login] || login, ...x, total: x.aprovada + x.reprovada + x.alteracao_solicitada }))
      .filter(x => x.total > 0)
      .sort((a, b) => b.total - a.total);

    const conteudos = Number(meta.conteudos) || 0;
    const motions = Number(meta.motions) || 0;
    const metaConteudos = conteudos + motions;
    return {
      id,
      nome: meta.nome || nomes[`cli:${id}`] || id,
      tipo: meta.tipo || "",
      nivel: meta.nivel || "",
      atendimento: meta.atendimento || "",
      social: meta.social || "",
      conteudos,
      motions,
      metaConteudos,
      pecas: st.pecas || 0,
      pecasOnline: st.pecasOnline || 0,
      pecasOffline: st.pecasOffline || 0,
      versoes: st.versoes || 0,
      aprovada: st.aprovada || 0,
      aprovadasOnline: st.aprovadasOnline || 0,
      aprovadasOffline: st.aprovadasOffline || 0,
      reprovada: st.reprovada || 0,
      alteracao_solicitada: st.alteracao_solicitada || 0,
      pendente: st.pendente || 0,
      pctCarteira: calcPct(st.pecas || 0, metaConteudos),
      pctCarteiraAprovada: calcPct(st.aprovada || 0, metaConteudos),
      primeiraDecididas: st.v1_decididas || 0,
      primeiraAprovadas: st.v1_aprovadas || 0,
      taxaPrimeira: st.v1_decididas ? Math.round(st.v1_aprovadas / st.v1_decididas * 1000) / 10 : null,
      enviadas: envCli,
      decisoes: decCli,
    };
  }).sort((a, b) => b.pecas - a.pecas || b.versoes - a.versoes || a.nome.localeCompare(b.nome, "pt-BR"));

  const tiposCliente = [...new Set(clientes.map(x => x.tipo).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const atendimentosCliente = [...new Set(clientes.map(x => x.atendimento).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const metaResumo = resumirMetaCarteira(clientes, totPecas, totAprovadas);

  return {
    enviadas,
    decisoes,
    totais: {
      pecas: totPecas,
      pecasOnline: totPecasOnline,
      pecasOffline: totPecasOffline,
      versoes: totVersoes,
      aprovada: totAprovadas,
      aprovadasOnline: totAprovadasOnline,
      aprovadasOffline: totAprovadasOffline,
      reprovada: totReprovadas,
      alteracao_solicitada: totAlt,
      ...metaResumo,
      primeiraDecididas: totV1d,
      primeiraAprovadas: totV1a,
      taxaPrimeira: totV1d ? Math.round(totV1a / totV1d * 1000) / 10 : null,
    },
    clientes,
    tiposCliente,
    atendimentosCliente,
  };
}

// Resumo analítico por intervalo de datas (Hoje, Ontem, Semana ou Personalizado)
export function resumoPorIntervalo(todasPecas = [], carteira = [], de = null, ate = null) {
  const filtro = dia => (!de || dia >= de) && (!ate || dia <= ate);
  return resumoDinamico(todasPecas, carteira, filtro);
}

export function resumoPorMes(todasPecas = [], carteira = [], mes = diaSP(new Date().toISOString()).slice(0, 7)) {
  const filtro = dia => String(dia || "").slice(0, 7) === mes;
  return resumoDinamico(todasPecas, carteira, filtro);
}

// Horários de pico de envio de material (00:00 até 23:00, fuso de SP)
export function calcularPicosHorario(todasPecas = [], filtroFn = () => true) {
  const horas = Array.from({ length: 24 }, (_, h) => ({
    hora: h,
    rotulo: String(h).padStart(2, "0") + ":00",
    total: 0,
    pecas: 0,
    versoes: 0,
  }));
  const horasPorCli = {};

  for (const p of todasPecas) {
    const cid = p.clienteId || "";
    const cliHoras = cid ? (horasPorCli[cid] ||= Array(24).fill(0)) : null;

    // 1. Envio da peça inicial / versão 1
    const tV1 = p.criadoEm || (p.versoes && p.versoes[0]?.enviadaEm);
    const diaV1 = diaSP(tV1);
    if (diaV1 && filtroFn(diaV1)) {
      const h = horaSP(tV1);
      if (h !== null && h >= 0 && h < 24) {
        horas[h].total++;
        horas[h].pecas++;
        if (cliHoras) cliHoras[h]++;
      }
    }

    // 2. Novas versões subsequentes (v2, v3, ...)
    const versoesExtras = Array.isArray(p.versoes) ? p.versoes.slice(1) : [];
    for (const v of versoesExtras) {
      const tV = v.enviadaEm;
      const diaV = diaSP(tV);
      if (diaV && filtroFn(diaV)) {
        const h = horaSP(tV);
        if (h !== null && h >= 0 && h < 24) {
          horas[h].total++;
          horas[h].versoes++;
          if (cliHoras) cliHoras[h]++;
        }
      }
    }
  }

  return { horas, horasPorCli };
}
