  // ======================================================================
  // FILA DE APROVAÇÃO (coordenador, mestre e gestão decidem)
  // ======================================================================
  function fila(ctx) {
    const el = ctx.el;
    el.innerHTML = `<div class="pc-h"><div><h2>Fila de aprovação</h2><div class="pc-sub" data-box="sub"></div></div><span class="sp"></span>
      <button class="btn" type="button" data-x="apagar-fila" style="color:var(--danger);border-color:rgba(192,39,26,.35)">🗑️ Apagar fila (Senha mestre)</button></div>
      <div data-box="notif-mencoes"></div>
      <div class="pc-filtros">
        <label>Status<select data-x="st"><option value="pendente">Pendentes (inclui reenviadas)</option><option value="">Todas</option>
          <option value="aprovada">Aprovadas</option><option value="alteracao_solicitada">Alteração solicitada</option><option value="reprovada">Reprovadas</option></select></label>
        <label>Menções<select data-x="f-mencao">
          <option value="">Todas as peças</option>
          <option value="nao_lidas">🔔 Marcado para mim (não lidas)</option>
          <option value="mencionado">💬 Marcado com @mim (todas)</option>
        </select></label>
        <label>Tipo de peça<select data-x="f-midia"><option value="">Todos os tipos (Qualquer)</option><option value="online">🌐 Apenas Online</option><option value="offline">📦 Apenas Offline</option></select></label>
        <label>Período<select data-x="f-per"><option value="">Todas as datas</option><option value="hoje">Hoje</option><option value="ontem">Ontem</option><option value="semana">Essa semana</option><option value="mes">Esse mês</option><option value="custom">Personalizado…</option></select></label>
        <label data-box="wrap-de" hidden>Data inicial<input type="date" data-x="f-de" style="padding:4px 8px;font-size:13px"></label>
        <label data-box="wrap-ate" hidden>Data final<input type="date" data-x="f-ate" style="padding:4px 8px;font-size:13px"></label>
        <label>Cliente<select data-x="cli"><option value="">Todos</option></select></label>
        <label>Remetente<select data-x="rem"><option value="">Todos</option></select></label>
        <button class="btn small" type="button" data-x="limpar-filtros-fila" style="align-self:flex-end">Limpar filtros</button>
      </div>
      <div data-box="lista"><div class="pc-vazio">Carregando…</div></div>`;
    const box = n => el.querySelector(`[data-box="${n}"]`), fv = n => el.querySelector(`[data-x="${n}"]`)?.value || "";
    let lista = [], limite = LIMITE_PAGINA_PECAS, ultAssinatura = null;
    const opcoes = (sel, pares) => { const v = sel.value; sel.innerHTML = sel.options[0].outerHTML + pares.map(([k, n]) => `<option value="${esc(k)}">${esc(n)}</option>`).join(""); sel.value = pares.some(([k]) => k === v) ? v : ""; };
    const obterIntervaloFila = () => {
      const p = fv("f-per");
      if (p === "custom") {
        return { de: fv("f-de") || null, ate: fv("f-ate") || null };
      }
      return intervaloPeriodo(p);
    };
    const filtradasAtuais = () => {
      const { de, ate } = obterIntervaloFila();
      const st = fv("st");
      const fMidia = fv("f-midia");
      const fMencao = fv("f-mencao");
      return lista.filter(p =>
        (!st || p.status === st) &&
        (!fMidia || (p.tipoMidia || "online") === fMidia) &&
        (!fMencao || (fMencao === "nao_lidas" ? mencoesNaoLidasDaPecaNoCliente(p).length > 0 : usuarioFoiMencionadoNaPeca(p))) &&
        (!fv("cli") || p.clienteId === fv("cli")) &&
        (!fv("rem") || (p.remetente && p.remetente.login) === fv("rem")) &&
        pecaBatePeriodo(p, st, de, ate)
      );
    };
    function aplicarDados(todasPecas, { silencioso = false } = {}) {
      atualizarBadgeFila(todasPecas);
      verificarNovasMencoesNotificar(todasPecas, ctx.toast);
      const novas = todasPecas || [];
      const sig = assinaturaListaPecas(novas);
      if (silencioso && sig === ultAssinatura) return;
      if (silencioso && usuarioInteragindoEm(el)) return;
      lista = novas;
      ultAssinatura = sig;
      box("sub").textContent = base.podeDecidir ? "Coordenadores e gestão podem aprovar, pedir alteração ou reprovar qualquer peça." : "Acompanhamento das peças.";
      const apagarBtn = el.querySelector('[data-x="apagar-fila"]');
      if (apagarBtn) apagarBtn.hidden = !(base && (base.ehGestao || base.funcao === "mestre"));
      const uniq = f => [...new Map(lista.map(f)).entries()].sort((a, b) => (a[1] || "").localeCompare(b[1] || "", "pt-BR"));
      opcoes(el.querySelector('[data-x="cli"]'), uniq(p => [p.clienteId || "", p.clienteNome || ""]));
      opcoes(el.querySelector('[data-x="rem"]'), uniq(p => [p.remetente?.login || "", p.remetente?.nome || p.remetente?.login || ""]).filter(x => x[0]));
      render();
    }
    async function carregar(opcoesCarga) {
      const silencioso = !!(opcoesCarga && opcoesCarga.silencioso);
      if (Array.isArray(opcoesCarga?.pecas)) {
        try { await carregarBase(); } catch { return; }
        if (opcoesCarga.perfis) atualizarMapaPerfis(opcoesCarga.perfis);
        aplicarDados(opcoesCarga.pecas, { silencioso });
        return;
      }
      let r;
      try {
        await carregarBase();
        r = await api(ultVersaoAvatares ? `pecas&av=${encodeURIComponent(ultVersaoAvatares)}` : "pecas");
      } catch (e) { if (!silencioso) box("lista").innerHTML = `<div class="note warn">${esc(e.message)}</div>`; return; }
      if (r.versao) ultVersaoPecas = r.versao;
      if (r.avVersao) ultVersaoAvatares = r.avVersao;
      if (r.perfis) atualizarMapaPerfis(r.perfis);
      aplicarDados(r.pecas, { silencioso });
    }
    function render() {
      const l = filtradasAtuais()
        .sort((a, b) => fv("st") === "pendente" ? a.atualizadoEm.localeCompare(b.atualizadoEm) : b.atualizadoEm.localeCompare(a.atualizadoEm));
      const visiveis = l.slice(0, limite);
      if (box("notif-mencoes")) box("notif-mencoes").innerHTML = renderPainelNotificacoesMencoes(lista);
      renderizarListaPecasIncremental(box("lista"), visiveis, {
        montarCard: p => {
          const souAprovador = (p.aprovadores || []).some(a => a.login === base.login);
          const ehBloqueado = ["social", "atendimento"].includes(base && base.funcao);
          const podeDecidirEsta = !ehBloqueado && (base.podeDecidir || base.ehGestao || souAprovador);
          const souRemetente = !!(p.minha || (base && p.remetente && p.remetente.login === base.login));
          const podeEditarEsta = !ehBloqueado && (souRemetente || base.podeDecidir || base.ehGestao || base.funcao === "mestre");

          let acoesHtml = "";
          if (podeDecidirEsta && p.status === "pendente") {
            acoesHtml = `<div class="pc-dec">
            <textarea data-c="com" data-dec-coment="${esc(p.id)}" placeholder="Comentário / parecer (obrigatório para reprovar ou pedir alteração · use @ para marcar alguém)"></textarea>
            <div class="pc-bar" style="margin-top:8px"><button class="btn primary" type="button" data-d="aprovada">Aprovar</button>
            <button class="btn" type="button" data-d="alteracao_solicitada">Pedir alteração</button><button class="btn" type="button" data-d="reprovada" style="color:var(--danger)">Reprovar</button>
            <span class="pc-sub" data-c="msg"></span></div></div>`;
          } else if (podeEditarEsta && p.status === "aprovada") {
            acoesHtml = `<div class="pc-bar" style="margin-top:10px">
              <button class="btn" type="button" data-x="editar-peca" data-id="${esc(p.id)}" style="display:inline-flex;align-items:center;gap:6px">✏️ Editar material aprovado (Nova versão v${p.versao + 1})</button>
            </div>`;
          }
          return cartao(p, acoesHtml);
        },
        extraSigFn: () => `${base?.login || ""}:${base?.funcao || ""}:${base?.podeDecidir ? 1 : 0}:${base?.ehGestao ? 1 : 0}`,
        rodapeHtml: rodapePaginacao(l.length, visiveis.length),
        vazioHtml: `<div class="pc-card pc-vazio">${
            lista.length
              ? (fv("st") === "pendente" && !fv("f-per") && !fv("cli") && !fv("rem") && !fv("f-mencao")
                  ? `Não há peças pendentes de aprovação no momento. <div style="margin-top:10px"><button class="btn small" type="button" data-x="ver-todas">Ver todas as peças da fila (${lista.length})</button></div>`
                  : `Nenhuma peça encontrada com esses filtros. <div style="margin-top:10px"><button class="btn small" type="button" data-x="limpar-filtros-fila">Limpar filtros</button></div>`)
              : "Nenhuma peça na fila."
          }</div>`,
      });
      resolverMetadadosDrivePendentes(visiveis, el);
    }
    el.addEventListener("click", async ev => {
      const btnIrPeca = ev.target.closest("[data-ir-peca]");
      if (btnIrPeca) {
        const pid = btnIrPeca.dataset.irPeca;
        let card = el.querySelector(`#peca-card-${CSS.escape(pid)}`);
        if (!card) {
          el.querySelector('[data-x="st"]').value = "";
          const mEl = el.querySelector('[data-x="f-mencao"]'); if (mEl) mEl.value = "";
          limite = Math.max(limite, lista.length);
          render();
          card = el.querySelector(`#peca-card-${CSS.escape(pid)}`);
        }
        if (card) card.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      const btnLerMencao = ev.target.closest("[data-marcar-mencao-lida]");
      if (btnLerMencao) {
        const pid = btnLerMencao.dataset.marcarMencaoLida;
        btnLerMencao.disabled = true;
        try { await api("mencao.ler", { pecaId: pid }); carregar(); if (window.QZ_atualizarNotificacoesGlobais) window.QZ_atualizarNotificacoesGlobais(); } catch (e) { ctx.toast(e.message); }
        return;
      }
      if (ev.target.closest('[data-x="ler-todas-mencoes"]')) {
        try { await api("mencao.ler", { todas: true }); ctx.toast("Menções marcadas como vistas"); carregar(); if (window.QZ_atualizarNotificacoesGlobais) window.QZ_atualizarNotificacoesGlobais(); } catch (e) { ctx.toast(e.message); }
        return;
      }
      if (ev.target.closest('[data-x="ativar-notif-nav"]')) {
        if ("Notification" in window) {
          const p = await Notification.requestPermission();
          ctx.toast(p === "granted" ? "Alertas do navegador ativados!" : "Permissão de notificação não concedida.");
          render();
        }
        return;
      }
      const editBtn = ev.target.closest('[data-x="editar-peca"]');
      if (editBtn) {
        const id = editBtn.dataset.id || editBtn.closest("[data-id]")?.dataset.id;
        const p = lista.find(q => q.id === id);
        if (!p) return;
        const alvo = el.querySelector(`[data-box="edit-${CSS.escape(id)}"]`);
        if (!alvo) return;
        if (alvo.children.length > 0) { alvo.innerHTML = ""; return; }
        await carregarBase();
        formEnvio(alvo, {
          titulo: `Editar material - ${p.titulo} (v${p.versao + 1})`,
          peca: p,
          aoEnviar: (novaPeca) => {
            ctx.toast(`Nova versão (v${novaPeca?.versao || (p.versao + 1)}) enviada para a fila de aprovação`);
            carregar();
            if (window.QZ_atualizarNotificacoesGlobais) window.QZ_atualizarNotificacoesGlobais();
          },
          aoCancelar: () => { alvo.innerHTML = ""; }
        });
        return;
      }
      const comentBtn = ev.target.closest("[data-enviar-coment]");
      if (comentBtn) {
        const id = comentBtn.dataset.enviarComent;
        const card = ev.target.closest(".pc-card");
        const ta = card ? card.querySelector(`[data-inp-coment="${CSS.escape(id)}"]`) : null;
        const texto = (ta ? ta.value : "").trim();
        if (!texto) { ctx.toast("Escreva um comentário antes de enviar."); ta?.focus(); return; }
        const mencoes = coletarMencoesDoTextarea(ta);
        comentBtn.disabled = true;
        try {
          await api("peca.comentar", { id, comentario: texto, mencoes });
          ctx.toast("Comentário adicionado");
          carregar();
          if (window.QZ_atualizarNotificacoesGlobais) window.QZ_atualizarNotificacoesGlobais();
        } catch (e) {
          ctx.toast(e.message || "Erro ao adicionar comentário");
          comentBtn.disabled = false;
        }
        return;
      }
      const delBtn = ev.target.closest("[data-del-peca]");
      if (delBtn) {
        const id = delBtn.dataset.delPeca;
        const p = lista.find(q => q.id === id);
        const senhaMestre = await pedirSenhaMestre("Apagar peça", `Confirme a senha mestre para apagar "${p?.titulo || id}".`);
        if (!senhaMestre) return;
        try { await api("peca.excluir", { id, senhaMestre }); ctx.toast("Peça apagada"); carregar(); if (window.QZ_atualizarNotificacoesGlobais) window.QZ_atualizarNotificacoesGlobais(); }
        catch (e) { ctx.toast(e.message); }
        return;
      }
      if (ev.target.closest('[data-x="mostrar-mais"]')) {
        limite += LIMITE_PAGINA_PECAS;
        render();
        return;
      }
      if (ev.target.closest('[data-x="apagar-fila"]')) {
        const visiveis = filtradasAtuais();
        if (!visiveis.length) { ctx.toast("Não há peças listadas para apagar."); return; }
        const senhaMestre = await pedirSenhaMestre("Apagar fila de peças", `Você está prestes a apagar ${visiveis.length} peça(s) da fila filtrada atual. Digite a senha mestre para confirmar.`);
        if (!senhaMestre) return;
        try {
          const r = await api("fila.apagar", { ids: visiveis.map(p => p.id), senhaMestre });
          ctx.toast(`${r.apagadas} peça(s) apagada(s) da fila`);
          carregar();
          if (window.QZ_atualizarNotificacoesGlobais) window.QZ_atualizarNotificacoesGlobais();
        } catch (e) { ctx.toast(e.message); }
        return;
      }
      if (ev.target.closest('[data-x="ver-todas"]')) {
        el.querySelector('[data-x="st"]').value = "";
        limite = LIMITE_PAGINA_PECAS;
        render();
        return;
      }
      if (ev.target.closest('[data-x="limpar-filtros-fila"]')) {
        el.querySelector('[data-x="st"]').value = "";
        const mEl = el.querySelector('[data-x="f-midia"]'); if (mEl) mEl.value = "";
        const mcEl = el.querySelector('[data-x="f-mencao"]'); if (mcEl) mcEl.value = "";
        el.querySelector('[data-x="f-per"]').value = "";
        const deEl = el.querySelector('[data-x="f-de"]'); if (deEl) deEl.value = "";
        const ateEl = el.querySelector('[data-x="f-ate"]'); if (ateEl) ateEl.value = "";
        const wDe = box("wrap-de"); if (wDe) wDe.hidden = true;
        const wAte = box("wrap-ate"); if (wAte) wAte.hidden = true;
        el.querySelector('[data-x="cli"]').value = "";
        el.querySelector('[data-x="rem"]').value = "";
        limite = LIMITE_PAGINA_PECAS;
        render();
        return;
      }
      const d = ev.target.dataset.d; if (!d) return;
      const card = ev.target.closest("[data-id]"), taDec = card.querySelector('[data-c="com"]'), com = taDec.value.trim(), msg = card.querySelector('[data-c="msg"]');
      if (d !== "aprovada" && !com) { msg.textContent = "Escreva o comentário."; taDec.focus(); return; }
      const mencoes = coletarMencoesDoTextarea(taDec);
      card.querySelectorAll("[data-d]").forEach(b => { b.disabled = true; });
      try { await api("peca.decidir", { id: card.dataset.id, decisao: d, comentario: com, mencoes }); ctx.toast(ST[d]); carregar(); if (window.QZ_atualizarNotificacoesGlobais) window.QZ_atualizarNotificacoesGlobais(); }
      catch (e) { msg.textContent = e.message; card.querySelectorAll("[data-d]").forEach(b => { b.disabled = false; }); }
    });
    el.addEventListener("change", ev => {
      if (ev.target.dataset.x === "f-per") {
        const ehCustom = ev.target.value === "custom";
        const wDe = box("wrap-de"), wAte = box("wrap-ate");
        if (wDe) wDe.hidden = !ehCustom;
        if (wAte) wAte.hidden = !ehCustom;
      }
      if (ev.target.dataset.x) { limite = LIMITE_PAGINA_PECAS; render(); }
    });
    return carregar;
  }
