// ============================================================================
// MODELO OFICIAL DE MÓDULO (Fase 2) — copie para criar uma nova funcionalidade.
// ----------------------------------------------------------------------------
// 1. Frontend: crie /modulos/<id>.js (ou pasta /modulos/<id>/01-*.js ... 99-*.js).
// 2. Backend: crie /api/_<id>.js usando api/_http.js + listarPaginado (ou SQL em migrations/),
//    registre a área/aba em api/_modules.js e adicione o import() estático em api/m.js.
// 3. No frontend, use QZ.criarApi("<sigla>") (ou ctx.api), QZ.fmt, QZ.ui e classes .qz-*.
//    Não use ctx.dados() nem /api/doc para funcionalidades novas.
// ============================================================================
QZ.modulo({
  id: "modelo",
  iniciar(ctx) {
    const { esc, br } = QZ.fmt;
    const { carregando, vazio, erroBox, badge, armarConfirmacao, renderPaginacao } = QZ.ui;
    const api = QZ.criarApi("mod"); // rota /api/m?r=mod/<acao>
    let itens = [];
    let pag = { total: 0, limite: 50, offset: 0, temMais: false };

    ctx.el.innerHTML = `
      <div class="qz-head">
        <div>
          <h2>${esc(ctx.nome)}</h2>
          <div class="qz-sub">Exemplo no padrão oficial (/api/m + QZ.ui + QZ.fmt).</div>
        </div>
        <div class="sp"></div>
        <button class="btn primary" type="button" id="mdAtualizar">Atualizar</button>
      </div>
      <div class="qz-card">
        <div class="row" style="margin-bottom:12px">
          <input id="mdTexto" placeholder="Novo registro..." style="flex:1">
          <button class="btn primary" type="button" id="mdAdd">Adicionar</button>
        </div>
        <div id="mdLista">${carregando()}</div>
        <div id="mdPag"></div>
      </div>`;

    const listaEl = ctx.el.querySelector("#mdLista");
    const pagEl = ctx.el.querySelector("#mdPag");

    function render() {
      if (!itens.length) { listaEl.innerHTML = vazio("Nenhum registro ainda."); pagEl.innerHTML = ""; return; }
      listaEl.innerHTML = itens.map(i => `
        <div class="row" style="justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line2)">
          <div><b>${esc(i.texto)}</b> <span class="muted">· ${esc(i.autor)} · ${br(i.criadoEm)}</span></div>
          <div class="row">${badge(i.status || "ativo", "ok")}<button class="btn small danger" type="button" data-del="${esc(i.id)}">Excluir</button></div>
        </div>`).join("");
      pagEl.innerHTML = renderPaginacao({ ...pag, exibidos: itens.length });
    }

    async function carregar(mais = false) {
      if (!mais) listaEl.innerHTML = carregando();
      try {
        const res = await api("listar", undefined, { query: { limite: pag.limite, offset: mais ? itens.length : 0 } });
        itens = mais ? [...itens, ...(res.itens || [])] : (res.itens || []);
        pag = { total: res.total || 0, limite: res.limite || 50, offset: res.offset || 0, temMais: !!res.temMais };
        render();
      } catch (e) { listaEl.innerHTML = erroBox(e.message); }
    }

    ctx.el.querySelector("#mdAtualizar").addEventListener("click", () => carregar(false));
    ctx.el.querySelector("#mdAdd").addEventListener("click", async () => {
      const inp = ctx.el.querySelector("#mdTexto");
      const texto = inp.value.trim(); if (!texto) return;
      try {
        await api("criar", { texto });
        inp.value = ""; ctx.toast("Adicionado"); carregar(false);
      } catch (e) { ctx.toast(e.message); }
    });
    listaEl.addEventListener("click", async e => {
      const btn = e.target.closest("[data-del]"); if (!btn || !armarConfirmacao(btn)) return;
      try { await api("excluir", { id: btn.dataset.del }); ctx.toast("Excluído"); carregar(false); }
      catch (err) { ctx.toast(err.message); }
    });
    pagEl.addEventListener("click", e => { if (e.target.closest("[data-qz-mais]")) carregar(true); });
    carregar(false);
  },
  aoMostrar() {},
});
