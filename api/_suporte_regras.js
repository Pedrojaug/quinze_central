// Regras puras do módulo de Suporte e Esteira Dev (sem acesso direto ao banco).

export const DEV_LOGIN_PADRAO = "inteligentte";
export const DEV_LOGINS_PADRAO = ["inteligentte", "equipe.inteligentte"];

export const TIPOS_SUPORTE = [
  { id: "bug", rotulo: "Bug / erro" },
  { id: "melhoria", rotulo: "Melhoria" },
  { id: "sugestao", rotulo: "Sugestão" },
];

export const STATUS_SUPORTE = [
  { id: "enviado", rotulo: "Enviado" },
  { id: "em_desenvolvimento", rotulo: "Em desenvolvimento" },
  { id: "finalizado", rotulo: "Finalizado" },
];

export const AREAS_SUPORTE = [
  { id: "atendimento", rotulo: "Atendimento" },
  { id: "pecas", rotulo: "Aprovação de peças" },
  { id: "administrativo", rotulo: "Administrativo" },
  { id: "cs", rotulo: "CS / Sucesso do Cliente" },
  { id: "financeiro", rotulo: "Financeiro" },
  { id: "pop", rotulo: "Meu POP" },
  { id: "perfil_acesso", rotulo: "Perfil / Login / Acesso" },
  { id: "inicio_navegacao", rotulo: "Tela inicial / Navegação / Links" },
  { id: "layout_geral", rotulo: "Visual / Layout geral (toda a Central)" },
  { id: "geral", rotulo: "Outro / Geral" },
];

export const MAX_ANEXOS = 5;
export const MAX_BYTES_ANEXO = 3 * 1024 * 1024;
export const MIME_PRINT = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

const TIPOS_SET = new Set(TIPOS_SUPORTE.map(t => t.id));
const STATUS_SET = new Set(STATUS_SUPORTE.map(s => s.id));
const AREAS_SET = new Set(AREAS_SUPORTE.map(a => a.id));

const TRANSICOES_DEV = {
  enviado: new Set(["enviado", "em_desenvolvimento"]),
  em_desenvolvimento: new Set(["em_desenvolvimento", "enviado", "finalizado"]),
  finalizado: new Set(["finalizado"]),
};

const rotuloDe = (lista, id) => lista.find(item => item.id === id)?.rotulo || String(id || "");

export function listarLoginsDev(env = process.env) {
  const bruto = String(env?.DEV_LOGINS || "").trim();
  if (!bruto) return [...DEV_LOGINS_PADRAO];
  const out = [];
  for (const parte of bruto.split(/[,;\n]+/)) {
    const lg = parte.trim().toLowerCase();
    if (lg && !out.includes(lg)) out.push(lg);
  }
  return out.length ? out : [...DEV_LOGINS_PADRAO];
}

export function ehDev(u, env = process.env) {
  const login = String(u?.login || "").trim().toLowerCase();
  if (!login) return false;
  return listarLoginsDev(env).includes(login);
}

export function decodificarPrint(b64, nome) {
  if (typeof b64 !== "string" || !b64.trim()) return { erro: "arquivo_vazio" };
  const ext = (String(nome || "").toLowerCase().match(/\.([a-z0-9]{1,5})$/) || [])[1] || "";
  const tipo = MIME_PRINT[ext];
  if (!tipo) return { erro: "tipo_invalido" };
  const limpo = b64.trim().replace(/^data:[^,]*,/, "");
  const buf = Buffer.from(limpo, "base64");
  if (!buf.length) return { erro: "arquivo_vazio" };
  if (buf.length > MAX_BYTES_ANEXO) return { erro: "arquivo_grande" };

  if (ext === "png") {
    const okPng = buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    if (!okPng) return { erro: "imagem_invalida" };
  } else if (ext === "jpg" || ext === "jpeg") {
    const okJpg = buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    if (!okJpg) return { erro: "imagem_invalida" };
  } else if (ext === "webp") {
    const okWebp = buf.length >= 12 && buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP";
    if (!okWebp) return { erro: "imagem_invalida" };
  }
  return { buf, tipo, ext };
}

export function normalizarOrigemUrl(raw) {
  const s = String(raw || "").trim().slice(0, 300);
  if (!s || !s.startsWith("/") || s.startsWith("//") || /[\r\n\0]/.test(s)) return "";
  return s;
}

export function normalizarMetaTecnica(meta) {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return {};
  const out = {};
  for (const chave of ["navegador", "viewport", "tema"]) {
    const val = meta[chave];
    if (typeof val === "string" && val.trim()) {
      out[chave] = val.trim().slice(0, 160);
    }
  }
  return out;
}

export function validarNovoChamado(body) {
  const src = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const tipo = String(src.tipo || "").trim();
  const area = String(src.area || "").trim();
  const urgente = src.urgente === true || src.urgente === "true" || src.urgente === 1 || src.urgente === "1";
  const descricao = String(src.descricao || "").trim();

  if (!TIPOS_SET.has(tipo)) {
    return { ok: false, code: "dados_invalidos", campo: "tipo", erro: "Selecione o tipo de chamado." };
  }
  if (!AREAS_SET.has(area)) {
    return { ok: false, code: "dados_invalidos", campo: "area", erro: "Selecione onde aconteceu / área." };
  }
  if (descricao.length < 8) {
    return { ok: false, code: "dados_invalidos", campo: "descricao", erro: "Descreva o problema ou sugestão com pelo menos 8 caracteres." };
  }
  if (descricao.length > 4000) {
    return { ok: false, code: "dados_invalidos", campo: "descricao", erro: "A descrição excede o limite de 4000 caracteres." };
  }

  return {
    ok: true,
    dados: {
      tipo,
      area,
      urgente,
      descricao,
      origem_url: normalizarOrigemUrl(src.origemUrl ?? src.origem_url),
      meta_tecnica: normalizarMetaTecnica(src.metaTecnica ?? src.meta_tecnica),
    },
  };
}

export function validarReabertura(chamado, body, usuario, agoraIso = new Date().toISOString()) {
  if (!chamado) {
    return { ok: false, statusHttp: 404, code: "nao_encontrado", erro: "Chamado não encontrado." };
  }
  const login = String(usuario?.login || "").trim().toLowerCase();
  if (String(chamado.usuario_login || "").trim().toLowerCase() !== login) {
    return { ok: false, statusHttp: 403, code: "sem_acesso", erro: "Você só pode reabrir chamados abertos por você." };
  }
  if (chamado.status !== "finalizado") {
    return { ok: false, statusHttp: 409, code: "status_invalido", erro: "Só é possível reabrir um chamado finalizado." };
  }
  const src = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const motivo = String(src.motivo || "").trim();
  if (motivo.length < 5) {
    return { ok: false, statusHttp: 400, code: "dados_invalidos", erro: "Informe o motivo da reabertura (mínimo 5 caracteres)." };
  }
  if (motivo.length > 1000) {
    return { ok: false, statusHttp: 400, code: "dados_invalidos", erro: "O motivo da reabertura excede 1000 caracteres." };
  }

  const anterior = Array.isArray(chamado.historico_reaberturas) ? chamado.historico_reaberturas : [];
  const historico_reaberturas = [
    ...anterior,
    { em: agoraIso, motivo, por: login },
  ];
  return {
    ok: true,
    dados: {
      status: "enviado",
      reaberturas_count: Number(chamado.reaberturas_count || 0) + 1,
      historico_reaberturas,
      reaberto_em: agoraIso,
      finalizado_em: null,
      atualizado_em: agoraIso,
    },
  };
}

export function validarAtualizacaoDev(chamado, body, agoraIso = new Date().toISOString()) {
  if (!chamado) {
    return { ok: false, statusHttp: 404, code: "nao_encontrado", erro: "Chamado não encontrado." };
  }
  const src = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const atual = String(chamado.status || "enviado").trim();
  const status = src.status !== undefined ? String(src.status || "").trim() : atual;
  if (!STATUS_SET.has(status)) {
    return { ok: false, statusHttp: 400, code: "dados_invalidos", erro: "Status inválido." };
  }

  const permitidos = TRANSICOES_DEV[atual];
  if (!permitidos || !permitidos.has(status)) {
    const msg = atual === "enviado" && status === "finalizado"
      ? "Inicie o desenvolvimento do chamado antes de finalizar."
      : "Transição de status não permitida nesta etapa da esteira.";
    return { ok: false, statusHttp: 409, code: "status_transicao_invalida", erro: msg };
  }

  let resposta_usuario = String(chamado.resposta_usuario || "").trim();
  if (src.resposta_usuario !== undefined) {
    resposta_usuario = String(src.resposta_usuario ?? "").trim();
    if (resposta_usuario.length > 4000) {
      return { ok: false, statusHttp: 400, code: "dados_invalidos", erro: "A mensagem ao solicitante excede 4000 caracteres." };
    }
  }

  if (status === "finalizado" && resposta_usuario.length < 5) {
    return {
      ok: false,
      statusHttp: 400,
      code: "resposta_obrigatoria",
      erro: "Antes de finalizar, escreva uma mensagem explicando o que foi feito para o solicitante (mínimo 5 caracteres).",
    };
  }

  const urgente = src.urgente !== undefined
    ? (src.urgente === true || src.urgente === "true" || src.urgente === 1 || src.urgente === "1")
    : Boolean(chamado.urgente);

  let iniciado_em = chamado.iniciado_em || null;
  if (status === "em_desenvolvimento" && !iniciado_em) {
    iniciado_em = agoraIso;
  }

  let finalizado_em = chamado.finalizado_em || null;
  if (status === "finalizado") {
    if (atual !== "finalizado" || !finalizado_em) {
      finalizado_em = agoraIso;
    }
  } else {
    finalizado_em = null;
  }

  return {
    ok: true,
    dados: {
      status,
      resposta_usuario,
      urgente,
      iniciado_em,
      finalizado_em,
      atualizado_em: agoraIso,
    },
  };
}

export function serializarAnexos(chamadoId, anexos) {
  const lista = Array.isArray(anexos) ? anexos : [];
  return lista.map(a => ({
    id: String(a?.id || ""),
    nome: String(a?.nome || "print.png"),
    tamanho: Number(a?.tamanho || 0),
    tipo: String(a?.tipo || "image/png"),
    url: `/api/m?r=sup/anexo&id=${encodeURIComponent(String(chamadoId))}&aid=${encodeURIComponent(String(a?.id || ""))}`,
  }));
}

function baseSerializada(row) {
  const reaberturas = Number(row.reaberturas_count || 0);
  const hist = Array.isArray(row.historico_reaberturas) ? row.historico_reaberturas : [];
  return {
    id: Number(row.id),
    usuario_login: row.usuario_login,
    usuario_nome: row.usuario_nome,
    usuario_funcao: row.usuario_funcao || "",
    tipo: row.tipo,
    tipo_rotulo: rotuloDe(TIPOS_SUPORTE, row.tipo),
    area: row.area,
    area_rotulo: rotuloDe(AREAS_SUPORTE, row.area),
    urgente: Boolean(row.urgente),
    descricao: row.descricao,
    status: row.status,
    status_rotulo: rotuloDe(STATUS_SUPORTE, row.status),
    resposta_usuario: row.resposta_usuario || "",
    reaberturas_count: reaberturas,
    reaberto: reaberturas > 0,
    historico_reaberturas: hist,
    anexos: serializarAnexos(row.id, row.anexos),
    criado_em: row.criado_em,
    atualizado_em: row.atualizado_em,
    iniciado_em: row.iniciado_em || null,
    finalizado_em: row.finalizado_em || null,
    reaberto_em: row.reaberto_em || null,
  };
}

export function serializarParaUsuario(row) {
  return baseSerializada(row);
}

export function serializarParaDev(row) {
  return {
    ...baseSerializada(row),
    origem_url: row.origem_url || "",
    meta_tecnica: row.meta_tecnica && typeof row.meta_tecnica === "object" ? row.meta_tecnica : {},
  };
}

const tsMs = v => {
  if (!v) return 0;
  const n = new Date(v).getTime();
  return Number.isFinite(n) ? n : 0;
};

export function ordenarFilaDev(rows = [], filtroStatus = "todos") {
  const lista = [...rows];
  if (filtroStatus === "finalizado") {
    return lista.sort((a, b) => {
      const diff = tsMs(b.finalizado_em || b.atualizado_em) - tsMs(a.finalizado_em || a.atualizado_em);
      return diff !== 0 ? diff : Number(b.id) - Number(a.id);
    });
  }
  return lista.sort((a, b) => {
    const pendA = a.status !== "finalizado" ? 0 : 1;
    const pendB = b.status !== "finalizado" ? 0 : 1;
    if (pendA !== pendB) return pendA - pendB;
    if (pendA === 0) {
      const urgA = a.urgente ? 0 : 1;
      const urgB = b.urgente ? 0 : 1;
      if (urgA !== urgB) return urgA - urgB;
      const reA = Number(a.reaberturas_count || 0) > 0 ? 0 : 1;
      const reB = Number(b.reaberturas_count || 0) > 0 ? 0 : 1;
      if (reA !== reB) return reA - reB;
    } else {
      const diffFin = tsMs(b.finalizado_em || b.atualizado_em) - tsMs(a.finalizado_em || a.atualizado_em);
      if (diffFin !== 0) return diffFin;
    }
    const diff = tsMs(b.criado_em) - tsMs(a.criado_em);
    return diff !== 0 ? diff : Number(b.id) - Number(a.id);
  });
}

export function mesSaoPaulo(iso) {
  if (!iso) return "";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).format(dt).slice(0, 7);
}

export function calcularKpis(rows = [], ymAtual = mesSaoPaulo(new Date().toISOString())) {
  let urgentesPendentes = 0;
  let enviados = 0;
  let emDesenvolvimento = 0;
  let reabertosPendentes = 0;
  let finalizadosMes = 0;

  for (const r of rows) {
    const pendente = r.status !== "finalizado";
    if (pendente && r.urgente) urgentesPendentes++;
    if (r.status === "enviado") enviados++;
    else if (r.status === "em_desenvolvimento") emDesenvolvimento++;
    if (pendente && Number(r.reaberturas_count || 0) > 0) reabertosPendentes++;
    if (r.status === "finalizado" && mesSaoPaulo(r.finalizado_em || r.atualizado_em) === ymAtual) {
      finalizadosMes++;
    }
  }

  return {
    urgentesPendentes,
    enviados,
    emDesenvolvimento,
    reabertosPendentes,
    finalizadosMes,
    total: rows.length,
  };
}

export function filtrarChamadosDev(rows = [], filtros = {}) {
  const status = String(filtros.status || "todos").trim();
  const tipo = String(filtros.tipo || "").trim();
  const area = String(filtros.area || "").trim();
  const apenasUrgentes = filtros.urgente === true || filtros.urgente === "1" || filtros.urgente === "true";
  const apenasReabertos = filtros.reaberto === true || filtros.reaberto === "1" || filtros.reaberto === "true";
  const busca = String(filtros.busca || "").trim().toLowerCase();

  return rows.filter(r => {
    if (status === "pendentes") {
      if (r.status === "finalizado") return false;
    } else if (status === "reabertos") {
      if (r.status === "finalizado" || Number(r.reaberturas_count || 0) <= 0) return false;
    } else if (status && status !== "todos") {
      if (r.status !== status) return false;
    }

    if (tipo && r.tipo !== tipo) return false;
    if (area && r.area !== area) return false;
    if (apenasUrgentes && !r.urgente) return false;
    if (apenasReabertos && Number(r.reaberturas_count || 0) <= 0) return false;

    if (busca) {
      const idStr = `#${r.id}`;
      const texto = [
        idStr,
        String(r.id),
        r.usuario_login,
        r.usuario_nome,
        r.usuario_funcao,
        r.descricao,
        r.resposta_usuario,
        rotuloDe(AREAS_SUPORTE, r.area),
        rotuloDe(TIPOS_SUPORTE, r.tipo),
      ].join(" ").toLowerCase();
      if (!texto.includes(busca)) return false;
    }
    return true;
  });
}

function celulaCsv(valor) {
  let s = String(valor ?? "").replace(/\r?\n/g, " ");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function gerarCsvChamados(rows = []) {
  const cabecalho = [
    "ID",
    "Status",
    "Urgente",
    "Reaberturas",
    "Tipo",
    "Área",
    "Solicitante",
    "Login",
    "Função",
    "Descrição",
    "Mensagem de resolução",
    "Criado em",
    "Finalizado em",
  ];
  const linhas = [cabecalho.map(celulaCsv).join(";")];
  for (const r of rows) {
    linhas.push([
      `#${r.id}`,
      rotuloDe(STATUS_SUPORTE, r.status),
      r.urgente ? "Sim" : "Não",
      Number(r.reaberturas_count || 0),
      rotuloDe(TIPOS_SUPORTE, r.tipo),
      rotuloDe(AREAS_SUPORTE, r.area),
      r.usuario_nome || "",
      r.usuario_login || "",
      r.usuario_funcao || "",
      r.descricao || "",
      r.resposta_usuario || "",
      r.criado_em || "",
      r.finalizado_em || "",
    ].map(celulaCsv).join(";"));
  }
  return `\uFEFF${linhas.join("\n")}`;
}
