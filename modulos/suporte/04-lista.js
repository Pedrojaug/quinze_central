// Lista "Meus chamados" e fluxo de reabertura (/suporte)
(function () {
  const SUP = (window.__QZ_SUP = window.__QZ_SUP || {});
  const { esc, brHora } = SUP;

  const TIPO_ICONE = { bug: "🐞", melhoria: "✨", sugestao: "💡" };
  const ETAPAS = [
    { id: "enviado", num: "1", rotulo: "Enviado" },
    { id: "em_desenvolvimento", num: "2", rotulo: "Em desenvolvimento" },
    { id: "finalizado", num: "3", rotulo: "Finalizado" },
  ];

  function renderEsteira(status) {
    const idxAtual = ETAPAS.findIndex(e => e.id === status);
    return `
      <div class="sup-stepper" aria-label="Etapa do chamado">
        ${ETAPAS.map((e, idx) => {
          const cls = idx < idxAtual || (status === "finalizado" && idx === 2)
            ? "is-done"
            : idx === idxAtual
              ? "is-now"
              : "";
          return `<div class="sup-step ${cls}"><span class="sup-step-n">${idx < idxAtual ? "✓" : e.num}</span><span>${esc(e.rotulo)}</span></div>`;
        }).join("")}
      </div>
    `;
  }

  SUP.montarLista = function montarLista(container, state, { aoAtualizar }) {
    let filtroStatus = "todos";
    let chamadoReabrir = null;

    function garantirDialogo() {
      let dlg = document.getElementById("supDlgReabrir");
      if (dlg) return dlg;
      dlg = document.createElement("dialog");
      dlg.id = "supDlgReabrir";
      dlg.className = "sup-dlg";
      dlg.innerHTML = `
        <form method="dialog" id="supFrmReabrir">
          <div class="sup-dlg-body">
            <h3 id="supReabTitulo">Reabrir chamado</h3>
            <p class="sup-hint" style="margin:0 0 12px">Explique rapidamente o que continuou acontecendo para que o chamado volte para a fila do dev.</p>
            <div class="sup-err" id="supReabErr" role="alert" hidden></div>
            <textarea class="sup-textarea" id="supReabMotivo" maxlength="1000" required style="min-height:96px" placeholder="Ex.: Testei hoje e a Consult ainda não aparece na lista..."></textarea>
          </div>
          <div class="sup-dlg-foot">
            <button type="button" class="btn" id="supReabCancel">Cancelar</button>
            <button type="submit" class="btn primary" id="supReabGo">Confirmar reabertura</button>
          </div>
        </form>
      `;
      document.body.appendChild(dlg);

      dlg.querySelector("#supReabCancel").addEventListener("click", () => dlg.close());
      dlg.querySelector("#supFrmReabrir").addEventListener("submit", async ev => {
        ev.preventDefault();
        if (!chamadoReabrir) return;
        const errEl = dlg.querySelector("#supReabErr");
        const motivoEl = dlg.querySelector("#supReabMotivo");
        const goBtn = dlg.querySelector("#supReabGo");
        errEl.hidden = true;
        const motivo = motivoEl.value.trim();
        if (motivo.length < 5) {
          errEl.textContent = "Informe o motivo com pelo menos 5 caracteres.";
          errEl.hidden = false;
          motivoEl.focus();
          return;
        }
        goBtn.disabled = true;
        goBtn.textContent = "Reabrindo…";
        try {
          const res = await SUP.api("reabrir", { id: chamadoReabrir.id, motivo });
          dlg.close();
          SUP.toast(`Chamado #${chamadoReabrir.id} reaberto.`);
          aoAtualizar(res.chamado);
        } catch (e) {
          errEl.textContent = e.message || "Não foi possível reabrir.";
          errEl.hidden = false;
        } finally {
          goBtn.disabled = false;
          goBtn.textContent = "Confirmar reabertura";
        }
      });
      return dlg;
    }

    function render() {
      const todos = state.chamados || [];
      const filtrados = filtroStatus === "todos"
        ? todos
        : todos.filter(c => c.status === filtroStatus);

      const cont = {
        todos: todos.length,
        enviado: todos.filter(c => c.status === "enviado").length,
        em_desenvolvimento: todos.filter(c => c.status === "em_desenvolvimento").length,
        finalizado: todos.filter(c => c.status === "finalizado").length,
      };

      const filtrosHtml = [
        ["todos", `Todos (${cont.todos})`],
        ["enviado", `Enviados (${cont.enviado})`],
        ["em_desenvolvimento", `Em desenvolvimento (${cont.em_desenvolvimento})`],
        ["finalizado", `Finalizados (${cont.finalizado})`],
      ].map(([id, rotulo]) => `
        <button type="button" class="sup-pill" data-st="${id}" aria-pressed="${filtroStatus === id}">${esc(rotulo)}</button>
      `).join("");

      const listaHtml = filtrados.length ? filtrados.map(c => {
        const anexos = Array.isArray(c.anexos) ? c.anexos : [];
        const hist = Array.isArray(c.historico_reaberturas) ? c.historico_reaberturas : [];
        return `
          <article class="sup-ticket ${c.urgente ? "is-urg" : ""}">
            <div class="sup-ticket-top">
              <div class="sup-badges">
                <span class="sup-id">#${c.id}</span>
                <span class="sup-b sup-b-${esc(c.status)}">${esc(c.status_rotulo)}</span>
                ${c.urgente ? `<span class="sup-b sup-b-urg">🚨 Urgente</span>` : ""}
                ${c.reaberto ? `<span class="sup-b sup-b-reab">🔁 Reaberto (${c.reaberturas_count}×)</span>` : ""}
                <span class="sup-b sup-b-meta">${TIPO_ICONE[c.tipo] || "•"} ${esc(c.tipo_rotulo)}</span>
                <span class="sup-b sup-b-meta">${esc(c.area_rotulo)}</span>
              </div>
              <span class="muted" style="font-size:12.5px">${esc(brHora(c.criado_em))}</span>
            </div>

            <p class="sup-desc">${esc(c.descricao)}</p>

            ${renderEsteira(c.status)}

            ${anexos.length ? `
              <div class="sup-thumbs">
                ${anexos.map(a => `
                  <div class="sup-thumb">
                    <img src="${esc(a.url)}" alt="${esc(a.nome)}" data-zoom-url="${esc(a.url)}" loading="lazy">
                  </div>
                `).join("")}
              </div>
            ` : ""}

            ${c.resposta_usuario ? `
              <div class="sup-resp">
                <b>Retorno do desenvolvimento</b>
                <div>${esc(c.resposta_usuario)}</div>
              </div>
            ` : ""}

            ${hist.length ? `
              <div class="sup-hist">
                <b>Histórico de reabertura</b>
                ${hist.map(h => `<div>• ${esc(brHora(h.em))}: ${esc(h.motivo)}</div>`).join("")}
              </div>
            ` : ""}

            <div class="sup-ticket-foot">
              <span>${c.finalizado_em ? `Finalizado em ${esc(brHora(c.finalizado_em))} · Não resolveu? Reabra para voltar à fila do dev.` : c.iniciado_em ? `Em desenvolvimento desde ${esc(brHora(c.iniciado_em))}` : "Enviado · aguardando leitura do dev"}</span>
              ${c.status === "finalizado" ? `<button type="button" class="btn small" data-reabrir="${c.id}">🔁 Reabrir chamado</button>` : ""}
            </div>
          </article>
        `;
      }).join("") : `
        <div class="sup-card" style="text-align:center;padding:34px 20px">
          <b>Nenhum chamado por aqui.</b>
          <div class="sup-hint">Quando você enviar um bug, melhoria ou sugestão, o andamento aparecerá nesta lista.</div>
        </div>
      `;

      container.innerHTML = `
        <div class="sup-filtros" id="supFiltros">${filtrosHtml}</div>
        <div class="sup-lista" id="supLista">${listaHtml}</div>
      `;

      container.querySelector("#supFiltros").addEventListener("click", ev => {
        const b = ev.target.closest("[data-st]");
        if (!b) return;
        filtroStatus = b.dataset.st;
        render();
      });

      container.querySelector("#supLista").addEventListener("click", ev => {
        const img = ev.target.closest("[data-zoom-url]");
        if (img) {
          SUP.abrirLightbox(img.dataset.zoomUrl);
          return;
        }
        const reab = ev.target.closest("[data-reabrir]");
        if (reab) {
          const cid = Number(reab.dataset.reabrir);
          chamadoReabrir = (state.chamados || []).find(x => x.id === cid) || null;
          if (!chamadoReabrir) return;
          const dlg = garantirDialogo();
          dlg.querySelector("#supReabTitulo").textContent = `Reabrir chamado #${chamadoReabrir.id}`;
          dlg.querySelector("#supReabErr").hidden = true;
          dlg.querySelector("#supReabMotivo").value = "";
          dlg.showModal();
          dlg.querySelector("#supReabMotivo").focus();
        }
      });
    }

    render();
    return { render };
  };
})();
