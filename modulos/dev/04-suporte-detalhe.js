// Painel direito de leitura e ação guiada pela esteira (/dev)
(function () {
  const DEV = (window.__QZ_DEV = window.__QZ_DEV || {});
  const { esc, brHora } = DEV;

  const ETAPAS = [
    { id: "enviado", num: "1", rotulo: "Enviado" },
    { id: "em_desenvolvimento", num: "2", rotulo: "Em desenvolvimento" },
    { id: "finalizado", num: "3", rotulo: "Finalizado" },
  ];

  function renderStepper(status) {
    const idxAtual = ETAPAS.findIndex(e => e.id === status);
    return `
      <div class="dev-stepper" aria-label="Progresso na esteira">
        ${ETAPAS.map((e, idx) => {
          const cls = idx < idxAtual || (status === "finalizado" && idx === 2)
            ? "is-done"
            : idx === idxAtual
              ? "is-now"
              : "";
          return `<div class="dev-step ${cls}"><span class="dev-step-n">${idx < idxAtual ? "✓" : e.num}</span><span>${esc(e.rotulo)}</span></div>`;
        }).join("")}
      </div>
    `;
  }

  function renderComposer(c) {
    if (c.status === "enviado") {
      return `
        <div class="dev-composer">
          <div class="dev-composer-title">Etapa 1 · Iniciar desenvolvimento</div>
          <p class="dev-composer-hint">Leu o relato e os prints acima? Ao iniciar, o solicitante passa a ver em <b>Meus chamados</b> que o ticket está em desenvolvimento.</p>
          <div class="dev-err" id="devDetErr" role="alert" hidden></div>
          <div class="dev-composer-foot" style="margin-top:0">
            <span class="muted" style="font-size:12.5px">Etapa 1 de 3 · Triagem e leitura</span>
            <button type="button" class="btn primary dev-composer-cta" id="devBtnIniciar">▶ Iniciar desenvolvimento</button>
          </div>
        </div>
      `;
    }

    if (c.status === "em_desenvolvimento") {
      return `
        <div class="dev-composer">
          <div class="dev-composer-title">Etapa 2 · Responder e finalizar</div>
          <label for="devDetResp" style="display:block;font-weight:600;font-size:13.5px;margin-bottom:7px">
            O que foi feito? (obrigatório antes de finalizar — visível para o solicitante) *
          </label>
          <textarea class="dev-ta" id="devDetResp" maxlength="4000" placeholder="Explique de forma clara o que foi corrigido ou implementado...">${esc(c.resposta_usuario || "")}</textarea>
          <div class="dev-err" id="devDetErr" role="alert" hidden style="margin-top:8px"></div>
          <div class="dev-composer-foot">
            <button type="button" class="btn small" id="devBtnDevolver">↩ Devolver para Enviados</button>
            <button type="button" class="btn primary dev-composer-cta" id="devBtnFinalizar">✓ Enviar resposta e finalizar</button>
          </div>
        </div>
      `;
    }

    return `
      <div class="dev-composer dev-composer-finalizado">
        <div class="dev-sol-box">
          <b>✓ Resposta enviada ao solicitante (${esc(brHora(c.finalizado_em || c.atualizado_em))})</b>
          <div>${esc(c.resposta_usuario || "")}</div>
        </div>
        <div id="devEditRespWrap" hidden style="margin-top:10px">
          <textarea class="dev-ta" id="devDetResp" maxlength="4000">${esc(c.resposta_usuario || "")}</textarea>
          <div class="dev-err" id="devDetErr" role="alert" hidden style="margin-top:8px"></div>
          <div class="dev-composer-foot">
            <button type="button" class="btn small" id="devBtnCancelEditResp">Cancelar</button>
            <button type="button" class="btn small primary" id="devBtnSalvarResp">Salvar ajuste</button>
          </div>
        </div>
        <div class="dev-composer-foot" id="devFinFoot">
          <span class="muted" style="font-size:12.5px">Se o usuário reabrir este chamado, ele volta automaticamente para 1 · Enviados.</span>
          <button type="button" class="btn small" id="devBtnAbrirEditResp">Editar resposta</button>
        </div>
      </div>
    `;
  }

  let seqReq = 0;

  DEV.renderDetalhePainel = async function renderDetalhePainel(paneEl, resumo, callbacks) {
    const reqId = ++seqReq;

    const pintar = c => {
      const anexos = Array.isArray(c.anexos) ? c.anexos : [];
      const hist = Array.isArray(c.historico_reaberturas) ? c.historico_reaberturas : [];
      const metaTec = c.meta_tecnica || {};

      paneEl.innerHTML = `
        <div class="dev-detail-head">
          <div class="dev-detail-title">
            <button type="button" class="btn small dev-back-btn" id="devBtnVoltar">← Lista</button>
            <h2>#${c.id}</h2>
            <span class="dev-tag dev-tag-norm">${esc(c.tipo_rotulo)} · ${esc(c.area_rotulo)}</span>
            ${c.urgente ? `<span class="dev-tag dev-tag-urg">🚨 Urgente</span>` : ""}
            ${c.reaberto ? `<span class="dev-tag dev-tag-reab">🔁 Reaberto (${c.reaberturas_count}×)</span>` : ""}
          </div>
          <div class="dev-detail-acts">
            ${c.status !== "finalizado" ? `<button type="button" class="btn small" id="devBtnUrg">${c.urgente ? "Remover urgência" : "🚨 Marcar urgente"}</button>` : ""}
            <button type="button" class="btn small danger" id="devBtnExcluir">🗑️ Excluir</button>
          </div>
        </div>

        ${renderStepper(c.status)}

        <div class="dev-detail-body">
          ${hist.length ? `
            <div class="dev-reab-banner">
              <b>🔁 Chamado reaberto pelo solicitante (${hist.length}×)</b>
              ${hist.map(h => `<div>• <span>${esc(brHora(h.em))}:</span> ${esc(h.motivo)}</div>`).join("")}
            </div>
          ` : ""}

          <div class="dev-req-strip">
            <div>Solicitante: <b>${esc(c.usuario_nome)}</b> (${esc(c.usuario_login)})${c.usuario_funcao ? ` · ${esc(c.usuario_funcao)}` : ""}</div>
            <div>Enviado: <b>${esc(brHora(c.criado_em))}</b></div>
            ${c.iniciado_em ? `<div>Iniciado: <b>${esc(brHora(c.iniciado_em))}</b></div>` : ""}
          </div>

          <p class="dev-desc">${esc(c.descricao)}</p>

          ${anexos.length ? `
            <div>
              <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--ink2);margin-bottom:8px">Prints anexados (${anexos.length})</div>
              <div class="dev-thumbs" id="devDetThumbs">
                ${anexos.map(a => `
                  <div class="dev-thumb" data-zoom-url="${esc(a.url)}" title="${esc(a.nome)}">
                    <img src="${esc(a.url)}" alt="${esc(a.nome)}">
                  </div>
                `).join("")}
              </div>
            </div>
          ` : ""}

          <details class="dev-tech">
            <summary>Contexto técnico capturado</summary>
            <div class="dev-tech-grid">
              <div><b>URL de origem:</b> ${c.origem_url ? `<code>${esc(c.origem_url)}</code>` : "Não informada"}</div>
              <div><b>Tela / Tema:</b> ${esc(metaTec.viewport || "—")}${metaTec.tema ? ` · ${esc(metaTec.tema)}` : ""}</div>
              <div><b>Navegador:</b> ${esc(metaTec.navegador || "—")}</div>
            </div>
          </details>
        </div>

        ${renderComposer(c)}
      `;

      paneEl.querySelector("#devBtnVoltar")?.addEventListener("click", () => callbacks.aoVoltarLista?.());
      paneEl.querySelector("#devDetThumbs")?.addEventListener("click", ev => {
        const th = ev.target.closest("[data-zoom-url]");
        if (th) DEV.abrirLightbox(th.dataset.zoomUrl);
      });

      const showErr = msg => {
        const errEl = paneEl.querySelector("#devDetErr");
        if (!errEl) return;
        errEl.textContent = msg || "";
        errEl.hidden = !msg;
      };

      async function atualizar(btn, payload, toastMsg, saiuDaEtapa) {
        showErr("");
        if (btn) btn.disabled = true;
        try {
          const r = await DEV.api("dev.atualizar", { id: c.id, ...payload });
          DEV.toast(toastMsg);
          await callbacks.aoAtualizarEtapa?.(r.chamado, saiuDaEtapa);
        } catch (e) {
          showErr(e.message || "Erro ao atualizar chamado.");
          if (!paneEl.querySelector("#devDetErr")) DEV.toast(e.message || "Erro ao atualizar.");
        } finally {
          if (btn) btn.disabled = false;
        }
      }

      const btnUrg = paneEl.querySelector("#devBtnUrg");
      btnUrg?.addEventListener("click", () => {
        atualizar(btnUrg, { urgente: !c.urgente }, !c.urgente ? `Chamado #${c.id} marcado como urgente.` : `Urgência removida do #${c.id}.`, false);
      });

      const btnIniciar = paneEl.querySelector("#devBtnIniciar");
      btnIniciar?.addEventListener("click", () => {
        atualizar(btnIniciar, { status: "em_desenvolvimento" }, `Chamado #${c.id} movido para Em desenvolvimento.`, true);
      });

      const btnFinalizar = paneEl.querySelector("#devBtnFinalizar");
      btnFinalizar?.addEventListener("click", () => {
        const resp = paneEl.querySelector("#devDetResp")?.value.trim() || "";
        if (resp.length < 5) {
          showErr("Escreva uma mensagem explicando o que foi feito antes de finalizar (mínimo 5 caracteres).");
          paneEl.querySelector("#devDetResp")?.focus();
          return;
        }
        atualizar(btnFinalizar, { status: "finalizado", resposta_usuario: resp }, `Chamado #${c.id} finalizado com resposta!`, true);
      });

      const btnDevolver = paneEl.querySelector("#devBtnDevolver");
      btnDevolver?.addEventListener("click", () => {
        atualizar(btnDevolver, { status: "enviado" }, `Chamado #${c.id} devolvido para Enviados.`, true);
      });

      const editWrap = paneEl.querySelector("#devEditRespWrap");
      const finFoot = paneEl.querySelector("#devFinFoot");
      paneEl.querySelector("#devBtnAbrirEditResp")?.addEventListener("click", () => {
        if (editWrap) editWrap.hidden = false;
        if (finFoot) finFoot.hidden = true;
        paneEl.querySelector("#devDetResp")?.focus();
      });
      paneEl.querySelector("#devBtnCancelEditResp")?.addEventListener("click", () => {
        if (editWrap) editWrap.hidden = true;
        if (finFoot) finFoot.hidden = false;
      });
      const btnSalvarResp = paneEl.querySelector("#devBtnSalvarResp");
      btnSalvarResp?.addEventListener("click", () => {
        const resp = paneEl.querySelector("#devDetResp")?.value.trim() || "";
        if (resp.length < 5) {
          showErr("A resposta ao solicitante precisa ter pelo menos 5 caracteres.");
          paneEl.querySelector("#devDetResp")?.focus();
          return;
        }
        atualizar(btnSalvarResp, { status: "finalizado", resposta_usuario: resp }, `Resposta do chamado #${c.id} atualizada.`, false);
      });

      const btnExcluir = paneEl.querySelector("#devBtnExcluir");
      btnExcluir?.addEventListener("click", async () => {
        if (!DEV.armarConfirmacao(btnExcluir, { rotulo: "Confirmar exclusão?" })) return;
        btnExcluir.disabled = true;
        try {
          await DEV.api("dev.excluir", { id: c.id });
          DEV.toast(`Chamado #${c.id} excluído.`);
          await callbacks.aoExcluir?.(c.id);
        } catch (e) {
          DEV.toast(e.message || "Erro ao excluir.");
          btnExcluir.disabled = false;
        }
      });
    };

    pintar(resumo);
    try {
      const r = await DEV.api("dev.detalhe", undefined, { query: { id: resumo.id } });
      if (reqId === seqReq && r.chamado) pintar(r.chamado);
    } catch {}
  };
})();
