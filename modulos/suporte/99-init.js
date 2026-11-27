// Inicialização da página /suporte
(function () {
  const SUP = (window.__QZ_SUP = window.__QZ_SUP || {});
  const { esc } = SUP;

  function iniciarTema() {
    const paint = t => {
      const dark = t === "dark";
      document.documentElement.dataset.theme = dark ? "dark" : "light";
      const m = document.querySelector('meta[name="color-scheme"]');
      if (m) m.content = dark ? "dark" : "light";
      const b = document.getElementById("qzThemeBtn");
      if (b) {
        b.setAttribute("aria-pressed", String(dark));
        b.textContent = dark ? "🌙 Tema: Escuro" : "☀️ Tema: Claro";
        const rotulo = dark ? "Tema atual: Escuro. Clique para mudar para Claro" : "Tema atual: Claro. Clique para mudar para Escuro";
        b.title = rotulo;
        b.setAttribute("aria-label", rotulo);
      }
    };
    paint(document.documentElement.dataset.theme);
    document.getElementById("qzThemeBtn")?.addEventListener("click", () => {
      const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      try { localStorage.setItem("qz-theme", next); } catch {}
      paint(next);
    });
    window.addEventListener("storage", ev => {
      if (!ev || ev.key === "qz-theme") paint(ev?.newValue);
    });
  }

  async function init() {
    iniciarTema();
    const root = document.getElementById("supApp");
    const quemEl = document.getElementById("supQuem");
    const devBtn = document.getElementById("supBtnDev");

    let meta;
    let meus;
    try {
      [meta, meus] = await Promise.all([SUP.api("meta"), SUP.api("meus")]);
    } catch (e) {
      if (quemEl) quemEl.textContent = "Não foi possível carregar.";
      if (root) root.innerHTML = `<div class="note warn">${esc(e.message || "Erro ao carregar suporte.")}</div>`;
      return;
    }

    const u = meta.usuario || {};
    if (quemEl) quemEl.textContent = `${u.nome || u.login || ""} · ${u.perfil || ""}`;
    if (devBtn) devBtn.hidden = !meta.isDev;

    const state = {
      meta,
      chamados: Array.isArray(meus.chamados) ? meus.chamados : [],
    };

    const qs = new URLSearchParams(location.search);
    let abaAtiva = qs.get("aba") === "meus" ? "meus" : "novo";

    root.innerHTML = `
      <div class="sup-tabs">
        <div class="sup-tabs-btns" role="tablist">
          <button type="button" class="sup-tab" data-sup-tab="novo" aria-selected="${abaAtiva === "novo"}">➕ Abrir chamado</button>
          <button type="button" class="sup-tab" data-sup-tab="meus" aria-selected="${abaAtiva === "meus"}">📋 Meus chamados <span class="sup-tab-cnt" id="supMeusCnt">${state.chamados.length}</span></button>
        </div>
        <button type="button" class="btn small" id="supAtualizar" ${abaAtiva !== "meus" ? "hidden" : ""}>↻ Atualizar</button>
      </div>
      <section id="supSecNovo" ${abaAtiva !== "novo" ? "hidden" : ""}></section>
      <section id="supSecMeus" ${abaAtiva !== "meus" ? "hidden" : ""}></section>
    `;

    const secNovo = document.getElementById("supSecNovo");
    const secMeus = document.getElementById("supSecMeus");
    const cntEl = document.getElementById("supMeusCnt");
    const btnAtualizar = document.getElementById("supAtualizar");

    function trocarAba(aba) {
      abaAtiva = aba;
      root.querySelectorAll("[data-sup-tab]").forEach(b => {
        b.setAttribute("aria-selected", String(b.dataset.supTab === aba));
      });
      secNovo.hidden = aba !== "novo";
      secMeus.hidden = aba !== "meus";
      btnAtualizar.hidden = aba !== "meus";
    }

    const listaCtrl = SUP.montarLista(secMeus, state, {
      aoAtualizar(atualizado) {
        state.chamados = state.chamados.map(c => (c.id === atualizado.id ? atualizado : c));
        cntEl.textContent = String(state.chamados.length);
        listaCtrl.render();
      },
    });

    SUP.montarFormulario(secNovo, state, {
      aoCriar(novo) {
        state.chamados = [novo, ...state.chamados];
        cntEl.textContent = String(state.chamados.length);
        listaCtrl.render();
        trocarAba("meus");
      },
    });

    root.querySelectorAll("[data-sup-tab]").forEach(b => {
      b.addEventListener("click", () => trocarAba(b.dataset.supTab));
    });

    btnAtualizar.addEventListener("click", async () => {
      btnAtualizar.disabled = true;
      try {
        const res = await SUP.api("meus");
        state.chamados = Array.isArray(res.chamados) ? res.chamados : [];
        cntEl.textContent = String(state.chamados.length);
        listaCtrl.render();
      } catch (e) {
        SUP.toast(e.message || "Erro ao atualizar.");
      } finally {
        btnAtualizar.disabled = false;
      }
    });
  }

  init();
})();
