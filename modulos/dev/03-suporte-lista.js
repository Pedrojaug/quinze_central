// Master-Detail Split Workspace da Esteira de Suporte (/dev)
(function () {
  const DEV = (window.__QZ_DEV = window.__QZ_DEV || {});
  const { esc, tempoRelativo } = DEV;

  const TIPO_ICONE = { bug: "🐞", melhoria: "✨", sugestao: "💡" };

  DEV.montarSuporteLista = function montarSuporteLista(container, state) {
    const ticketInicial = Number.parseInt(new URLSearchParams(location.search).get("ticket") || "", 10) || null;
    const filtros = {
      etapa: "enviado",
      tipo: "",
      area: "",
      urgente: false,
      busca: "",
    };

    let todosChamados = [];
    let kpis = { urgentesPendentes: 0, enviados: 0, emDesenvolvimento: 0, reabertosPendentes: 0, finalizadosMes: 0, total: 0 };
    let selecionadoId = ticketInicial;
    let mobileDetalhe = false;
    let sincronizouTicketInicial = false;

    const tipos = state.meta.tipos || [];
    const areas = state.meta.areas || [];

    // Monta a casca estática uma única vez para não perder foco ao digitar na busca
    container.innerHTML = `
      <div class="dev-rail" role="tablist" aria-label="Etapas da esteira">
        <button type="button" class="dev-rail-btn" data-stage="enviado" role="tab" aria-selected="true">
          <div class="dev-rail-left">
            <span class="dev-rail-num">1</span>
            <div>
              <div class="dev-rail-title">Enviados <span class="dev-rail-dot" id="devDotEnv" hidden title="Há urgentes ou reabertos"></span></div>
              <div class="dev-rail-sub">Novos e reabertos</div>
            </div>
          </div>
          <span class="dev-rail-cnt" id="devCntEnv">0</span>
        </button>

        <button type="button" class="dev-rail-btn" data-stage="em_desenvolvimento" role="tab" aria-selected="false">
          <div class="dev-rail-left">
            <span class="dev-rail-num">2</span>
            <div>
              <div class="dev-rail-title">Em desenvolvimento</div>
              <div class="dev-rail-sub">Em execução pelo dev</div>
            </div>
          </div>
          <span class="dev-rail-cnt" id="devCntDev">0</span>
        </button>

        <button type="button" class="dev-rail-btn" data-stage="finalizado" role="tab" aria-selected="false">
          <div class="dev-rail-left">
            <span class="dev-rail-num">3</span>
            <div>
              <div class="dev-rail-title">Finalizados</div>
              <div class="dev-rail-sub" id="devSubFin">Com resposta enviada</div>
            </div>
          </div>
          <span class="dev-rail-cnt" id="devCntFin">0</span>
        </button>

        <div class="dev-rail-tools">
          <button type="button" class="dev-rail-all" data-stage="todos" role="tab" aria-selected="false">Todos (<span id="devCntAll">0</span>)</button>
        </div>
      </div>

      <div class="dev-subbar">
        <div class="dev-filters">
          <input class="dev-in" id="devBusca" type="search" placeholder="Buscar #ID, solicitante ou relato…">
          <select class="dev-sel" id="devFltTipo" aria-label="Filtrar por tipo">
            <option value="">Todos os tipos</option>
            ${tipos.map(t => `<option value="${esc(t.id)}">${esc(t.rotulo)}</option>`).join("")}
          </select>
          <select class="dev-sel" id="devFltArea" aria-label="Filtrar por área">
            <option value="">Todas as áreas</option>
            ${areas.map(a => `<option value="${esc(a.id)}">${esc(a.rotulo)}</option>`).join("")}
          </select>
          <label class="dev-chk" id="devLblUrg">
            <input type="checkbox" id="devFltUrg">
            🚨 Só urgentes
          </label>
        </div>
        <div class="dev-actions">
          <button type="button" class="btn small" id="devCsv" disabled>⬇ CSV</button>
          <button type="button" class="btn small primary" id="devRefresh">↻ Atualizar</button>
        </div>
      </div>

      <div class="dev-split" id="devSplit">
        <section class="dev-master" id="devMaster" aria-label="Lista de chamados"></section>
        <section class="dev-detail" id="devDetail" aria-label="Detalhe do chamado"></section>
      </div>
    `;

    const splitEl = container.querySelector("#devSplit");
    const masterEl = container.querySelector("#devMaster");
    const detailEl = container.querySelector("#devDetail");
    const btnCsv = container.querySelector("#devCsv");

    function sincronizarUrl(id) {
      try {
        const u = new URL(location.href);
        if (id) u.searchParams.set("ticket", String(id));
        else u.searchParams.delete("ticket");
        history.replaceState(null, "", u.pathname + u.search + u.hash);
      } catch {}
    }

    function listaVisivel() {
      const lista = filtros.etapa === "todos"
        ? todosChamados
        : todosChamados.filter(c => c.status === filtros.etapa);
      if (filtros.etapa === "finalizado") {
        return [...lista].sort((a, b) => {
          const da = new Date(a.finalizado_em || a.atualizado_em || 0).getTime();
          const db = new Date(b.finalizado_em || b.atualizado_em || 0).getTime();
          return db - da || b.id - a.id;
        });
      }
      return lista;
    }

    function atualizarRail() {
      const env = todosChamados.filter(c => c.status === "enviado");
      const dev = todosChamados.filter(c => c.status === "em_desenvolvimento");
      const fin = todosChamados.filter(c => c.status === "finalizado");

      container.querySelector("#devCntEnv").textContent = String(env.length);
      container.querySelector("#devCntDev").textContent = String(dev.length);
      container.querySelector("#devCntFin").textContent = String(fin.length);
      container.querySelector("#devCntAll").textContent = String(todosChamados.length);
      container.querySelector("#devDotEnv").hidden = !env.some(c => c.urgente || c.reaberto);
      container.querySelector("#devSubFin").textContent = `${kpis.finalizadosMes || 0} finalizado${kpis.finalizadosMes === 1 ? "" : "s"} no mês`;

      container.querySelectorAll("[data-stage]").forEach(b => {
        b.setAttribute("aria-selected", String(b.dataset.stage === filtros.etapa));
      });
      btnCsv.disabled = !listaVisivel().length;
    }

    function renderRow(c) {
      const sel = c.id === selecionadoId;
      const anexos = Array.isArray(c.anexos) ? c.anexos : [];
      const dataRef = c.status === "finalizado" ? (c.finalizado_em || c.atualizado_em) : c.criado_em;
      return `
        <div class="dev-row ${sel ? "is-sel" : ""} ${c.urgente && c.status !== "finalizado" ? "is-urg" : ""}" data-id="${c.id}" tabindex="0" role="option" aria-selected="${sel}">
          <div class="dev-row-top">
            <div class="dev-row-left">
              <span class="dev-id">#${c.id}</span>
              ${filtros.etapa === "todos" ? `<span class="dev-tag dev-tag-${esc(c.status)}">${esc(c.status_rotulo)}</span>` : ""}
              ${c.urgente ? `<span class="dev-tag dev-tag-urg">🚨 Urgente</span>` : ""}
              ${c.reaberto ? `<span class="dev-tag dev-tag-reab">🔁 Reaberto</span>` : ""}
            </div>
            <span class="dev-time">${esc(tempoRelativo(dataRef))}</span>
          </div>
          <div class="dev-row-meta">
            <b>${esc(c.usuario_nome)}</b>
            <span>· ${TIPO_ICONE[c.tipo] || "•"} ${esc(c.tipo_rotulo)}</span>
            <span>· ${esc(c.area_rotulo)}</span>
          </div>
          <div class="dev-row-desc">${esc(c.descricao)}</div>
          <div class="dev-row-foot">
            ${anexos.length ? `<span>📸 ${anexos.length} print${anexos.length > 1 ? "s" : ""}</span>` : ""}
            ${c.reaberto ? `<span>${c.reaberturas_count}× reaberto</span>` : ""}
          </div>
        </div>
      `;
    }

    function renderWorkspace() {
      atualizarRail();
      const visivel = listaVisivel();

      if (visivel.length && !visivel.some(c => c.id === selecionadoId)) {
        selecionadoId = visivel[0].id;
      } else if (!visivel.length) {
        selecionadoId = null;
      }

      sincronizarUrl(selecionadoId);
      splitEl.classList.toggle("is-mobile-detail", Boolean(mobileDetalhe && selecionadoId));

      let rowsHtml = "";
      if (!visivel.length) {
        rowsHtml = `<div style="padding:36px 18px;text-align:center;color:var(--ink2);font-size:13.5px">Nenhum chamado nesta visualização.</div>`;
      } else if (filtros.etapa === "enviado") {
        const prio = visivel.filter(c => c.urgente || c.reaberto);
        const norm = visivel.filter(c => !c.urgente && !c.reaberto);
        if (prio.length && norm.length) {
          rowsHtml = `
            <div class="dev-group-lbl">Prioridade · Urgentes e reabertos (${prio.length})</div>
            ${prio.map(renderRow).join("")}
            <div class="dev-group-lbl">Fila normal (${norm.length})</div>
            ${norm.map(renderRow).join("")}
          `;
        } else {
          rowsHtml = visivel.map(renderRow).join("");
        }
      } else {
        rowsHtml = visivel.map(renderRow).join("");
      }

      masterEl.innerHTML = `
        <div class="dev-master-head">
          <span><b>${visivel.length}</b> chamado${visivel.length === 1 ? "" : "s"}</span>
          <span>↑ ↓ para navegar</span>
        </div>
        <div role="listbox" aria-label="Chamados da etapa">${rowsHtml}</div>
      `;

      const atual = visivel.find(c => c.id === selecionadoId) || null;
      if (!atual) {
        const proxEtapa = todosChamados.some(c => c.status === "enviado") && filtros.etapa !== "enviado"
          ? { id: "enviado", label: "Ir para 1 · Enviados →" }
          : todosChamados.some(c => c.status === "em_desenvolvimento") && filtros.etapa !== "em_desenvolvimento"
            ? { id: "em_desenvolvimento", label: "Ir para 2 · Em desenvolvimento →" }
            : null;
        detailEl.innerHTML = `
          <div class="dev-detail-empty">
            <h3>Tudo limpo por aqui</h3>
            <p>Não há chamados para exibir nesta etapa com os filtros atuais.</p>
            ${proxEtapa ? `<button type="button" class="btn small primary" data-jump-stage="${proxEtapa.id}">${esc(proxEtapa.label)}</button>` : ""}
          </div>
        `;
        detailEl.querySelector("[data-jump-stage]")?.addEventListener("click", ev => {
          filtros.etapa = ev.currentTarget.dataset.jumpStage;
          mobileDetalhe = false;
          renderWorkspace();
        });
        return;
      }

      DEV.renderDetalhePainel(detailEl, atual, {
        aoVoltarLista: () => {
          mobileDetalhe = false;
          splitEl.classList.remove("is-mobile-detail");
        },
        aoAtualizarEtapa: async (novoChamado, saiuDaEtapa) => {
          if (saiuDaEtapa) {
            const listaAntes = listaVisivel();
            const idxAtual = listaAntes.findIndex(x => x.id === novoChamado.id);
            const proximo = listaAntes[idxAtual + 1] || listaAntes[idxAtual - 1] || null;
            selecionadoId = proximo ? proximo.id : null;
            mobileDetalhe = false;
          } else {
            selecionadoId = novoChamado.id;
          }
          await carregar({ silencioso: true });
        },
        aoExcluir: async idRemovido => {
          const listaAntes = listaVisivel();
          const idxAtual = listaAntes.findIndex(x => x.id === idRemovido);
          const proximo = listaAntes[idxAtual + 1] || listaAntes[idxAtual - 1] || null;
          selecionadoId = proximo ? proximo.id : null;
          mobileDetalhe = false;
          await carregar({ silencioso: true });
        },
      });
    }

    async function carregar({ silencioso = false } = {}) {
      if (!silencioso) {
        masterEl.innerHTML = `<div class="dev-loading">Carregando fila…</div>`;
        detailEl.innerHTML = `<div class="dev-loading">Carregando…</div>`;
      }
      try {
        const res = await DEV.api("dev.listar", undefined, {
          query: {
            status: "todos",
            tipo: filtros.tipo,
            area: filtros.area,
            urgente: filtros.urgente ? "1" : "",
            busca: filtros.busca,
          },
        });
        kpis = res.kpis || kpis;
        todosChamados = Array.isArray(res.chamados) ? res.chamados : [];

        if (!sincronizouTicketInicial && ticketInicial) {
          sincronizouTicketInicial = true;
          const achado = todosChamados.find(c => c.id === ticketInicial);
          if (achado) {
            filtros.etapa = achado.status;
            selecionadoId = achado.id;
          }
        }
        renderWorkspace();
      } catch (e) {
        masterEl.innerHTML = `<div class="note warn" style="margin:12px">${esc(e.message || "Erro ao carregar chamados.")}</div>`;
      }
    }

    function selecionarPorId(id, abrirMobile = false) {
      if (!id) return;
      selecionadoId = id;
      if (abrirMobile) mobileDetalhe = true;
      renderWorkspace();
      const row = masterEl.querySelector(`.dev-row[data-id="${id}"]`);
      row?.scrollIntoView({ block: "nearest" });
    }

    container.querySelectorAll("[data-stage]").forEach(b => {
      b.addEventListener("click", () => {
        filtros.etapa = b.dataset.stage;
        mobileDetalhe = false;
        selecionadoId = null;
        renderWorkspace();
      });
    });

    const buscaIn = container.querySelector("#devBusca");
    let buscaT = null;
    buscaIn.addEventListener("input", () => {
      filtros.busca = buscaIn.value;
      clearTimeout(buscaT);
      buscaT = setTimeout(() => carregar({ silencioso: true }), 240);
    });

    container.querySelector("#devFltTipo").addEventListener("change", ev => {
      filtros.tipo = ev.target.value;
      carregar({ silencioso: true });
    });
    container.querySelector("#devFltArea").addEventListener("change", ev => {
      filtros.area = ev.target.value;
      carregar({ silencioso: true });
    });
    container.querySelector("#devFltUrg").addEventListener("change", ev => {
      filtros.urgente = ev.target.checked;
      container.querySelector("#devLblUrg").classList.toggle("is-on", filtros.urgente);
      carregar({ silencioso: true });
    });

    container.querySelector("#devRefresh").addEventListener("click", () => carregar({ silencioso: true }));
    btnCsv.addEventListener("click", () => DEV.exportarCsv(listaVisivel()));

    masterEl.addEventListener("click", ev => {
      const row = ev.target.closest(".dev-row[data-id]");
      if (row) selecionarPorId(Number(row.dataset.id), true);
    });
    masterEl.addEventListener("keydown", ev => {
      if (ev.key === "Enter" || ev.key === " ") {
        const row = ev.target.closest(".dev-row[data-id]");
        if (row) {
          ev.preventDefault();
          selecionarPorId(Number(row.dataset.id), true);
        }
      }
    });

    if (DEV._keyHandler) document.removeEventListener("keydown", DEV._keyHandler);
    DEV._keyHandler = ev => {
      if (!document.body.contains(container) || document.getElementById("devLightbox")) return;
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || document.activeElement?.isContentEditable) return;
      const visivel = listaVisivel();
      if (!visivel.length) return;
      if (ev.key === "ArrowDown" || ev.key === "j") {
        ev.preventDefault();
        const idx = visivel.findIndex(c => c.id === selecionadoId);
        const prox = visivel[Math.min(visivel.length - 1, idx + 1)] || visivel[0];
        selecionarPorId(prox.id, false);
      } else if (ev.key === "ArrowUp" || ev.key === "k") {
        ev.preventDefault();
        const idx = visivel.findIndex(c => c.id === selecionadoId);
        const ant = visivel[Math.max(0, idx - 1)] || visivel[0];
        selecionarPorId(ant.id, false);
      }
    };
    document.addEventListener("keydown", DEV._keyHandler);

    carregar();
    return { recarregar: () => carregar({ silencioso: true }) };
  };
})();
