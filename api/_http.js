// Helpers HTTP e validação declarativa de payloads para rotas da pasta api/.

export function corpo(req) {
  return req && req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
}

export function exigirMetodo(req, res, metodos) {
  const permitidos = Array.isArray(metodos) ? metodos : [metodos];
  const atual = String(req?.method || "").toUpperCase();
  if (!permitidos.some(m => String(m).toUpperCase() === atual)) {
    res.status(405).json({ code: "method" });
    return false;
  }
  return true;
}

export function erro(res, status, code, msg, extra) {
  const body = { code };
  if (msg) body.msg = msg;
  if (extra && typeof extra === "object") Object.assign(body, extra);
  return res.status(status).json(body);
}

export function negado(res, msg = "Sem permissão.") {
  return erro(res, 403, "sem_acesso", msg);
}

export function ok(res, dados = {}) {
  return res.status(200).json({ ok: true, ...dados });
}

export function quem(u) {
  return { login: u?.login || "", nome: u?.nome || u?.login || "" };
}

export function paginacaoQuery(query = {}, { limitePadrao = 50, limiteMax = 200 } = {}) {
  const rawLim = query?.limite ?? query?.limit;
  const rawOff = query?.offset;
  const rawPag = query?.pagina ?? query?.page;
  const parsedLim = parseInt(rawLim, 10);
  const limite = Number.isFinite(parsedLim) && parsedLim > 0 ? Math.min(limiteMax, parsedLim) : limitePadrao;
  const parsedPag = parseInt(rawPag, 10);
  const pagina = Number.isFinite(parsedPag) && parsedPag > 0 ? parsedPag : 1;
  let offset;
  if (rawOff !== undefined && rawOff !== null && rawOff !== "") {
    const parsedOff = parseInt(rawOff, 10);
    offset = Number.isFinite(parsedOff) && parsedOff >= 0 ? parsedOff : 0;
  } else if (rawPag !== undefined && rawPag !== null && rawPag !== "") {
    offset = (pagina - 1) * limite;
  } else {
    offset = 0;
  }
  return { limite, offset, pagina };
}

function dataRealValida(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function falharCampo(campo, msg) {
  return { ok: false, code: "dados_invalidos", campo, erro: msg };
}

export function validarCampos(body, esquema) {
  const src = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const dados = {};

  for (const [campo, spec] of Object.entries(esquema || {})) {
    const rotulo = spec.rotulo || campo;
    const raw = src[campo];

    if (spec.tipo === "texto") {
      let s = raw === undefined || raw === null ? "" : String(raw).trim();
      if (!s) {
        if (spec.obrigatorio) return falharCampo(campo, `Preencha ${rotulo}.`);
        dados[campo] = spec.padrao !== undefined ? spec.padrao : "";
        continue;
      }
      if (spec.min !== undefined && s.length < spec.min) {
        return falharCampo(campo, `${rotulo} deve ter pelo menos ${spec.min} caracteres.`);
      }
      if (spec.max !== undefined && s.length > spec.max) {
        if (spec.truncar) s = s.slice(0, spec.max);
        else return falharCampo(campo, `${rotulo} excede o limite de ${spec.max} caracteres.`);
      }
      dados[campo] = s;
      continue;
    }

    if (spec.tipo === "numero" || spec.tipo === "inteiro") {
      if (raw === undefined || raw === null || raw === "") {
        if (spec.obrigatorio) return falharCampo(campo, `Informe ${rotulo}.`);
        dados[campo] = spec.padrao !== undefined ? spec.padrao : null;
        continue;
      }
      const norm = typeof raw === "string" ? raw.replace(",", ".").trim() : raw;
      const n = typeof norm === "boolean" ? NaN : Number(norm);
      if (!Number.isFinite(n)) return falharCampo(campo, `${rotulo} deve ser um número válido.`);
      if (spec.tipo === "inteiro" && !Number.isInteger(n)) {
        return falharCampo(campo, `${rotulo} deve ser um número inteiro.`);
      }
      if (spec.min !== undefined && n < spec.min) return falharCampo(campo, `${rotulo} deve ser no mínimo ${spec.min}.`);
      if (spec.max !== undefined && n > spec.max) return falharCampo(campo, `${rotulo} deve ser no máximo ${spec.max}.`);
      dados[campo] = n;
      continue;
    }

    if (spec.tipo === "booleano") {
      if (raw === undefined || raw === null || raw === "") {
        if (spec.obrigatorio) return falharCampo(campo, `Informe ${rotulo}.`);
        dados[campo] = spec.padrao !== undefined ? Boolean(spec.padrao) : false;
        continue;
      }
      if (raw === true || raw === "true" || raw === 1 || raw === "1") { dados[campo] = true; continue; }
      if (raw === false || raw === "false" || raw === 0 || raw === "0") { dados[campo] = false; continue; }
      return falharCampo(campo, `${rotulo} inválido.`);
    }

    if (spec.tipo === "data") {
      const s = raw === undefined || raw === null ? "" : String(raw).trim();
      if (!s) {
        if (spec.obrigatorio) return falharCampo(campo, `Informe ${rotulo}.`);
        dados[campo] = spec.padrao !== undefined ? spec.padrao : "";
        continue;
      }
      if (!dataRealValida(s)) return falharCampo(campo, `${rotulo} deve estar no formato AAAA-MM-DD válido.`);
      dados[campo] = s;
      continue;
    }

    if (spec.tipo === "mes") {
      const s = raw === undefined || raw === null ? "" : String(raw).trim();
      if (!s) {
        if (spec.obrigatorio) return falharCampo(campo, `Informe ${rotulo}.`);
        dados[campo] = spec.padrao !== undefined ? spec.padrao : "";
        continue;
      }
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(s)) return falharCampo(campo, `${rotulo} deve estar no formato AAAA-MM.`);
      dados[campo] = s;
      continue;
    }

    if (spec.tipo === "enum") {
      if (raw === undefined || raw === null || raw === "") {
        if (spec.obrigatorio) return falharCampo(campo, `Selecione ${rotulo}.`);
        dados[campo] = spec.padrao !== undefined ? spec.padrao : "";
        continue;
      }
      if (!Array.isArray(spec.valores) || !spec.valores.includes(raw)) {
        return falharCampo(campo, `Valor inválido para ${rotulo}.`);
      }
      dados[campo] = raw;
      continue;
    }

    if (spec.tipo === "array") {
      if (raw === undefined || raw === null) {
        if (spec.obrigatorio) return falharCampo(campo, `Informe ${rotulo}.`);
        dados[campo] = Array.isArray(spec.padrao) ? spec.padrao : [];
        continue;
      }
      if (!Array.isArray(raw)) return falharCampo(campo, `${rotulo} deve ser uma lista.`);
      if (spec.obrigatorio && raw.length === 0) return falharCampo(campo, `Informe pelo menos um item em ${rotulo}.`);
      if (spec.min !== undefined && raw.length < spec.min) {
        return falharCampo(campo, `${rotulo} exige pelo menos ${spec.min} item(ns).`);
      }
      if (spec.max !== undefined && raw.length > spec.max) {
        return falharCampo(campo, `${rotulo} aceita no máximo ${spec.max} item(ns).`);
      }
      dados[campo] = raw;
      continue;
    }

    return falharCampo(campo, `Tipo de validação desconhecido para ${rotulo}.`);
  }

  return { ok: true, dados };
}
