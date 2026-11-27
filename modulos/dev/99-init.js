// Inicialização do Painel Dev (/dev)
(function () {
  const DEV = (window.__QZ_DEV = window.__QZ_DEV || {});
  const { esc } = DEV;

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
    const root = document.getElementById("devApp");
    const quemEl = document.getElementById("devQuem");
    const tabsRow = document.getElementById("devTabsRow");
    const navTabs = document.getElementById("devNavTabs");

    let meta;
    try {
      meta = await DEV.api("meta");
    } catch (e) {
      if (quemEl) quemEl.textContent = "Erro ao autenticar.";
      if (root) root.innerHTML = `<div class="note warn">${esc(e.message || "Erro ao carregar Painel Dev.")}</div>`;
      return;
    }

    const u = meta.usuario || {};
    if (!meta.isDev) {
      if (quemEl) quemEl.textContent = `${u.nome || u.login || ""} · Sem acesso`;
      if (root) {
        root.innerHTML = `
          <div class="dev-denied">
            <h2>Acesso restrito ao desenvolvimento</h2>
            <p class="muted" style="margin:0 0 18px">Este painel é exclusivo da conta de desenvolvimento. Para abrir ou acompanhar seus chamados, use a página de suporte.</p>
            <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
              <a class="btn primary" href="/suporte" style="text-decoration:none">🛠️ Ir para Suporte</a>
              <a class="btn" href="/?modulos=1" style="text-decoration:none">Voltar aos módulos</a>
            </div>
          </div>
        `;
      }
      return;
    }

    if (quemEl) quemEl.textContent = `${u.nome || u.login} (${u.login}) · Exclusivo Dev`;

    // Estrutura de abas pronta para receber novas ferramentas dev no futuro
    const abasDev = [
      { id: "suporte", rotulo: "🎫 Tickets de Suporte" },
    ];
    navTabs.innerHTML = abasDev.map((a, idx) => `
      <button type="button" role="tab" data-dev-tab="${esc(a.id)}" aria-selected="${idx === 0}">${esc(a.rotulo)}</button>
    `).join("");
    tabsRow.hidden = false;

    const state = { meta };
    root.innerHTML = `<section id="devSecSuporte"></section>`;
    DEV.montarSuporteLista(document.getElementById("devSecSuporte"), state);
  }

  init();
})();
