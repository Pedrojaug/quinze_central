  // ======================================================================
  // ENVIO (remetente: vê e reenvia só as suas)
  // ======================================================================
  function envio(ctx) {
    const el = ctx.el;
    el.innerHTML = `<div class="pc-h"><div><h2>Envio de peças</h2><div class="pc-sub">Escolha o cliente, anexe o material (ou link de Reels do Google Drive) e envie para a fila de aprovação.</div></div><span class="sp"></span>
      <button class="btn primary" type="button" data-x="nova">Nova peça</button></div>
      <div data-box="notif-mencoes"></div>
      <div data-box="form"></div>
      <div class="pc-filtros"><label>Status<select data-x="st"><option value="">Todas</option>${Object.entries(ST).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></label>
        <label>Tipo de peça<select data-x="f-midia"><option value="">Todos os tipos</option><option value="online">🌐 Online</option><option value="offline">📦 Offline</option></select></label>
        <label>Cliente<select data-x="cli"><option value="">Todos</option></select></label></div>
      <div data-box="lista"><div class="pc-vazio">Carregando…</div></div>`;
    const box = n => el.querySelector(`[data-box="${n}"]`), fv = n => el.querySelector(`[data-x="${n}"]`).value;
    let lista = [], limite = LIMITE_PAGINA_PECAS, ultAssinatura = null;
    const opcoes = (sel, pares) => { const v = sel.value; sel.innerHTML = sel.options[0].outerHTML + pares.map(([k, n]) => `<option value="${esc(k)}">${esc(n)}</option>`).join(""); sel.value = pares.some(([k]) => k === v) ? v : ""; };
    function aplicarDados(todasPecas, { silencioso = false } = {}) {
      atualizarBadgeFila(todasPecas);
      verificarNovasMencoesNotificar(todasPecas, ctx.toast);
      const minhas = (todasPecas || []).filter(p => p.minha);
      const sig = assinaturaListaPecas(minhas);
      if (silencioso && sig === ultAssinatura) return;
      if (silencioso && usuarioInteragindoEm(el)) return;
      lista = minhas;
      ultAssinatura = sig;
      const uniq = f => [...new Map(lista.map(f)).entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
      opcoes(el.querySelector('[data-x="cli"]'), uniq(p => [p.clienteId, p.clienteNome]));
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
      try { await carregarBase(); r = await api("pecas"); } catch (e) { if (!silencioso) box("lista").innerHTML = `<div class="note warn">${esc(e.message)}</div>`; return; }
      if (r.versao) ultVersaoPecas = r.versao;
      if (r.perfis) atualizarMapaPerfis(r.perfis);
      aplicarDados(r.pecas, { silencioso });
    }
    function render() {
      const fMidia = fv("f-midia");
      const l = lista.filter(p => (!fv("st") || p.status === fv("st")) && (!fMidia || (p.tipoMidia || "online") === fMidia) && (!fv("cli") || p.clienteId === fv("cli")));
      const visiveis = l.slice(0, limite);
      if (box("notif-mencoes")) box("notif-mencoes").innerHTML = renderPainelNotificacoesMencoes(lista);
      box("lista").innerHTML = l.length ? visiveis.map(p => cartao(p, ["aprovada", "reprovada", "alteracao_solicitada"].includes(p.status)
        ? `<div class="pc-bar"><button class="btn primary" type="button" data-x="reenviar" data-id="${esc(p.id)}">${p.status === "aprovada" ? "✏️ Editar material (Nova versão v" + (p.versao + 1) + ")" : "Enviar nova versão (v" + (p.versao + 1) + ")"}</button></div><div data-box="re-${esc(p.id)}"></div>` : "")).join("") + rodapePaginacao(l.length, visiveis.length)
        : `<div class="pc-card pc-vazio">${lista.length ? "Nenhuma peça com esses filtros." : "Você ainda não enviou peças (ou as enviadas já passaram de " + (base?.retencaoDias || 7) + " dias)."}</div>`;
      el.querySelectorAll(".pc-card[data-id]").forEach(c => { c._pecaRef = lista.find(q => q.id === c.dataset.id) || null; });
    }
    el.addEventListener("click", async ev => {
      if (ev.target.closest('[data-x="mostrar-mais"]')) { limite += LIMITE_PAGINA_PECAS; render(); return; }
      const btnIrPeca = ev.target.closest("[data-ir-peca]");
      if (btnIrPeca) {
        const pid = btnIrPeca.dataset.irPeca;
        const card = el.querySelector(`#peca-card-${CSS.escape(pid)}`);
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
        const alvo = el.querySelector(`[data-box="edit-${CSS.escape(id)}"]`) || el.querySelector(`[data-box="re-${CSS.escape(id)}"]`);
        if (!alvo) return;
        if (alvo.children.length > 0) { alvo.innerHTML = ""; return; }
        await carregarBase();
        formEnvio(alvo, {
          titulo: `Editar material - ${p.titulo} (v${p.versao + 1})`,
          peca: p,
          aoEnviar: (novaPeca) => {
            ctx.toast(`Nova versão (v${novaPeca?.versao || (p.versao + 1)}) enviada`);
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
        try { await api("peca.excluir", { id, senhaMestre }); ctx.toast("Peça apagada"); carregar(); }
        catch (e) { ctx.toast(e.message); }
        return;
      }
      const x = ev.target.dataset.x;
      if (x === "nova" || x === "reenviar") { try { await carregarBase(); } catch (e) { ctx.toast(e.message); return; } }
      if (x === "nova") formEnvio(box("form"), { titulo: "Nova peça", aoEnviar: () => { ctx.toast("Peça enviada para a fila"); carregar(); } });
      if (x === "reenviar") {
        const id = ev.target.dataset.id || ev.target.closest("[data-id]").dataset.id, p = lista.find(q => q.id === id);
        const alvo = el.querySelector(`[data-box="re-${CSS.escape(id)}"]`) || el.querySelector(`[data-box="edit-${CSS.escape(id)}"]`);
        if (alvo) {
          formEnvio(alvo, {
            titulo: p.status === "aprovada" ? `Editar material - ${p.titulo} (v${p.versao + 1})` : `Nova versão de "${p.titulo}"`,
            peca: p,
            aoEnviar: () => { ctx.toast(`Versão ${p.versao + 1} enviada`); carregar(); },
            aoCancelar: () => { alvo.innerHTML = ""; }
          });
        }
      }
    });
    el.addEventListener("change", ev => { if (ev.target.dataset.x) { limite = LIMITE_PAGINA_PECAS; render(); } });
    return carregar;
  }
