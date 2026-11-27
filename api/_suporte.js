// Módulo de Suporte e Esteira Dev (/suporte e /dev): /api/m?r=sup/<acao>
import crypto from "node:crypto";
import { sql } from "./_lib.js";
import { PERFIS } from "./_modules.js";
import { corpo, exigirMetodo, erro, negado, ok } from "./_http.js";
import { guardar, enviar, apagarArquivos, nomeSeguro } from "./_arquivos.js";
import {
  AREAS_SUPORTE,
  MAX_ANEXOS,
  STATUS_SUPORTE,
  TIPOS_SUPORTE,
  calcularKpis,
  decodificarPrint,
  ehDev,
  filtrarChamadosDev,
  mesSaoPaulo,
  ordenarFilaDev,
  serializarAnexos,
  serializarParaDev,
  serializarParaUsuario,
  validarAtualizacaoDev,
  validarNovoChamado,
  validarReabertura,
} from "./_suporte_regras.js";

function parseIdPositivo(raw) {
  const n = Number.parseInt(String(raw ?? ""), 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function erroStorage(res, e) {
  if (e?.code === "blob_nao_configurado" || e?.status === 503) {
    return erro(res, 503, "storage_indisponivel", "Armazenamento de imagens não configurado no servidor.");
  }
  throw e;
}

export const rotas = {
  async meta(u, req, res) {
    if (!exigirMetodo(req, res, "GET")) return;
    return ok(res, {
      usuario: {
        login: u.login,
        nome: u.nome || u.login,
        funcao: u.funcao,
        perfil: PERFIS[u.funcao] || u.funcao,
      },
      isDev: ehDev(u),
      tipos: TIPOS_SUPORTE,
      areas: AREAS_SUPORTE,
      status: STATUS_SUPORTE,
      maxAnexos: MAX_ANEXOS,
    });
  },

  async meus(u, req, res) {
    if (!exigirMetodo(req, res, "GET")) return;
    const rows = await sql`
      SELECT id, usuario_login, usuario_nome, usuario_funcao, tipo, area, urgente, descricao,
             status, resposta_usuario, reaberturas_count, historico_reaberturas, anexos,
             criado_em, atualizado_em, iniciado_em, finalizado_em, reaberto_em
      FROM suporte_chamados
      WHERE usuario_login = ${u.login}
      ORDER BY criado_em DESC, id DESC
      LIMIT 200
    `;
    return ok(res, { chamados: rows.map(serializarParaUsuario) });
  },

  async criar(u, req, res) {
    if (!exigirMetodo(req, res, "POST")) return;
    const v = validarNovoChamado(corpo(req));
    if (!v.ok) return erro(res, 400, v.code, v.erro, { campo: v.campo });
    const d = v.dados;
    const funcaoRotulo = PERFIS[u.funcao] || u.funcao || "";
    const [row] = await sql`
      INSERT INTO suporte_chamados (
        usuario_login, usuario_nome, usuario_funcao, tipo, area, urgente,
        descricao, status, origem_url, meta_tecnica
      )
      VALUES (
        ${u.login}, ${u.nome || u.login}, ${funcaoRotulo}, ${d.tipo}, ${d.area}, ${d.urgente},
        ${d.descricao}, 'enviado', ${d.origem_url}, ${JSON.stringify(d.meta_tecnica)}::jsonb
      )
      RETURNING id, usuario_login, usuario_nome, usuario_funcao, tipo, area, urgente, descricao,
                status, resposta_usuario, reaberturas_count, historico_reaberturas, anexos,
                criado_em, atualizado_em, iniciado_em, finalizado_em, reaberto_em
    `;
    return ok(res, { chamado: serializarParaUsuario(row) });
  },

  async anexo(u, req, res) {
    if (!exigirMetodo(req, res, ["GET", "POST"])) return;

    if (req.method === "GET") {
      const id = parseIdPositivo(req.query?.id);
      const aid = String(req.query?.aid || "").trim();
      if (!id || !/^[A-Za-z0-9_-]{4,40}$/.test(aid)) {
        return erro(res, 400, "dados_invalidos", "Anexo inválido.");
      }
      const [row] = await sql`
        SELECT id, usuario_login, anexos
        FROM suporte_chamados
        WHERE id = ${id}
        LIMIT 1
      `;
      if (!row) return erro(res, 404, "nao_encontrado", "Chamado não encontrado.");
      if (row.usuario_login !== u.login && !ehDev(u)) return negado(res);
      const anexos = Array.isArray(row.anexos) ? row.anexos : [];
      const item = anexos.find(a => String(a?.id || "") === aid);
      if (!item || !item.chave) return erro(res, 404, "sem_arquivo", "Imagem não encontrada.");
      return await enviar(res, item.chave, item.nome || "print.png", true, { req, cacheavel: true });
    }

    const b = corpo(req);
    const chamadoId = parseIdPositivo(b.chamadoId);
    const nomeOriginal = String(b.nome || "print.png").trim().slice(0, 140);
    if (!chamadoId) return erro(res, 400, "dados_invalidos", "Chamado inválido.");

    const [row] = await sql`
      SELECT id, usuario_login, anexos
      FROM suporte_chamados
      WHERE id = ${chamadoId}
      LIMIT 1
    `;
    if (!row) return erro(res, 404, "nao_encontrado", "Chamado não encontrado.");
    if (row.usuario_login !== u.login && !ehDev(u)) return negado(res);

    const atuais = Array.isArray(row.anexos) ? row.anexos : [];
    if (atuais.length >= MAX_ANEXOS) {
      return erro(res, 400, "limite_anexos", `Máximo de ${MAX_ANEXOS} prints por chamado.`);
    }

    const dec = decodificarPrint(b.base64, nomeOriginal);
    if (dec.erro) {
      const msg = dec.erro === "arquivo_grande"
        ? "Imagem acima do limite (3 MB)."
        : dec.erro === "tipo_invalido" || dec.erro === "imagem_invalida"
          ? "Envie uma imagem PNG, JPG ou WebP válida."
          : "Arquivo de imagem vazio.";
      return erro(res, 400, dec.erro, msg);
    }

    const aid = crypto.randomBytes(6).toString("hex");
    const nomeArquivo = nomeSeguro(nomeOriginal);
    const chave = `suporte/${chamadoId}/${aid}-${nomeArquivo}`;
    let salvo;
    try {
      salvo = await guardar(chave, dec.buf, nomeArquivo, dec.tipo);
    } catch (e) {
      return erroStorage(res, e);
    }

    const novoAnexo = {
      id: aid,
      nome: nomeOriginal || nomeArquivo,
      chave: salvo.chave,
      tamanho: salvo.tamanho,
      tipo: salvo.tipo,
    };
    const novosAnexos = [...atuais, novoAnexo];
    await sql`
      UPDATE suporte_chamados
      SET anexos = ${JSON.stringify(novosAnexos)}::jsonb,
          atualizado_em = now()
      WHERE id = ${chamadoId}
    `;
    const [pub] = serializarAnexos(chamadoId, [novoAnexo]);
    return ok(res, { anexo: pub });
  },

  async reabrir(u, req, res) {
    if (!exigirMetodo(req, res, "POST")) return;
    const b = corpo(req);
    const id = parseIdPositivo(b.id);
    if (!id) return erro(res, 400, "dados_invalidos", "Chamado inválido.");

    const [row] = await sql`
      SELECT id, usuario_login, status, reaberturas_count, historico_reaberturas
      FROM suporte_chamados
      WHERE id = ${id}
      LIMIT 1
    `;
    const v = validarReabertura(row, b, u);
    if (!v.ok) return erro(res, v.statusHttp, v.code, v.erro);
    const d = v.dados;

    const [atualizado] = await sql`
      UPDATE suporte_chamados
      SET status = ${d.status},
          reaberturas_count = ${d.reaberturas_count},
          historico_reaberturas = ${JSON.stringify(d.historico_reaberturas)}::jsonb,
          reaberto_em = ${d.reaberto_em}::timestamptz,
          finalizado_em = NULL,
          atualizado_em = ${d.atualizado_em}::timestamptz
      WHERE id = ${id}
      RETURNING id, usuario_login, usuario_nome, usuario_funcao, tipo, area, urgente, descricao,
                status, resposta_usuario, reaberturas_count, historico_reaberturas, anexos,
                criado_em, atualizado_em, iniciado_em, finalizado_em, reaberto_em
    `;
    return ok(res, { chamado: serializarParaUsuario(atualizado) });
  },

  async "dev.listar"(u, req, res) {
    if (!exigirMetodo(req, res, "GET")) return;
    if (!ehDev(u)) return negado(res, "Acesso exclusivo do Painel Dev.");
    const rows = await sql`
      SELECT id, usuario_login, usuario_nome, usuario_funcao, tipo, area, urgente, descricao,
             status, resposta_usuario, reaberturas_count, historico_reaberturas,
             anexos, origem_url, meta_tecnica,
             criado_em, atualizado_em, iniciado_em, finalizado_em, reaberto_em
      FROM suporte_chamados
      ORDER BY criado_em DESC, id DESC
      LIMIT 500
    `;
    const kpis = calcularKpis(rows, mesSaoPaulo(new Date().toISOString()));
    const statusFiltro = String(req.query?.status || "todos").trim();
    const filtrados = filtrarChamadosDev(rows, { ...(req.query || {}), status: statusFiltro });
    const ordenados = ordenarFilaDev(filtrados, statusFiltro);
    return ok(res, {
      kpis,
      chamados: ordenados.map(serializarParaDev),
      total: ordenados.length,
    });
  },

  async "dev.detalhe"(u, req, res) {
    if (!exigirMetodo(req, res, "GET")) return;
    if (!ehDev(u)) return negado(res, "Acesso exclusivo do Painel Dev.");
    const id = parseIdPositivo(req.query?.id);
    if (!id) return erro(res, 400, "dados_invalidos", "Chamado inválido.");
    const [row] = await sql`
      SELECT id, usuario_login, usuario_nome, usuario_funcao, tipo, area, urgente, descricao,
             status, resposta_usuario, reaberturas_count, historico_reaberturas,
             anexos, origem_url, meta_tecnica,
             criado_em, atualizado_em, iniciado_em, finalizado_em, reaberto_em
      FROM suporte_chamados
      WHERE id = ${id}
      LIMIT 1
    `;
    if (!row) return erro(res, 404, "nao_encontrado", "Chamado não encontrado.");
    return ok(res, { chamado: serializarParaDev(row) });
  },

  async "dev.atualizar"(u, req, res) {
    if (!exigirMetodo(req, res, "POST")) return;
    if (!ehDev(u)) return negado(res, "Acesso exclusivo do Painel Dev.");
    const b = corpo(req);
    const id = parseIdPositivo(b.id);
    if (!id) return erro(res, 400, "dados_invalidos", "Chamado inválido.");

    const [row] = await sql`
      SELECT id, status, resposta_usuario, urgente, iniciado_em, finalizado_em
      FROM suporte_chamados
      WHERE id = ${id}
      LIMIT 1
    `;
    const v = validarAtualizacaoDev(row, b);
    if (!v.ok) return erro(res, v.statusHttp, v.code, v.erro);
    const d = v.dados;

    const [atualizado] = await sql`
      UPDATE suporte_chamados
      SET status = ${d.status},
          resposta_usuario = ${d.resposta_usuario},
          urgente = ${d.urgente},
          iniciado_em = ${d.iniciado_em}::timestamptz,
          finalizado_em = ${d.finalizado_em}::timestamptz,
          atualizado_em = ${d.atualizado_em}::timestamptz
      WHERE id = ${id}
      RETURNING id, usuario_login, usuario_nome, usuario_funcao, tipo, area, urgente, descricao,
                status, resposta_usuario, reaberturas_count, historico_reaberturas,
                anexos, origem_url, meta_tecnica,
                criado_em, atualizado_em, iniciado_em, finalizado_em, reaberto_em
    `;
    return ok(res, { chamado: serializarParaDev(atualizado) });
  },

  async "dev.excluir"(u, req, res) {
    if (!exigirMetodo(req, res, "POST")) return;
    if (!ehDev(u)) return negado(res, "Acesso exclusivo do Painel Dev.");
    const b = corpo(req);
    const id = parseIdPositivo(b.id);
    if (!id) return erro(res, 400, "dados_invalidos", "Chamado inválido.");

    const [removido] = await sql`
      DELETE FROM suporte_chamados
      WHERE id = ${id}
      RETURNING id, anexos
    `;
    if (!removido) return erro(res, 404, "nao_encontrado", "Chamado não encontrado.");

    const chaves = (Array.isArray(removido.anexos) ? removido.anexos : [])
      .map(a => a?.chave)
      .filter(Boolean);
    if (chaves.length) {
      apagarArquivos(chaves).catch(() => {});
    }
    return ok(res, { id: Number(removido.id) });
  },
};
