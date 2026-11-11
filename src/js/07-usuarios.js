  // ---------- Módulo aberto, usuários e permissões (somente no site) ----------
  // Módulos, abas, perfis e permissões vêm do registro central (api/_modules.js).
  // A página só esconde o que não é liberado; quem decide de verdade é o servidor.
  let TAB_NAMES = {dash:"Dashboard", cli:"Clientes", onb:"Onboarding", prop:"Propostas", agenda:"Agenda", prod:"Dados consolidados", team:"Equipe e ajustes", users:"Usuários"};
  const TAB_MOD = {users:"administrativo"};
  let usrList = [], usrDelArm = null, usrPwdArm = null;
  let FUNC_TABS = {}, PERFIS = {}, ESCOLHAS = [], AREAS_ALL = [], SENHA_MIN = 8;
  const FUNC_HINT = {
    gestao: "Gestão acessa todos os módulos, inclusive Administrativo e Financeiro, e cadastra usuários.",
    atendimento: "Atendimento acessa todo o módulo Atendimento (inclusive as abas criadas depois), Aprovação de peças, CS e Políticas.",
    coordenador: "Coordenador acessa Aprovação de peças, CS e Políticas. Não vê o Atendimento.",
    social: "Social media vê só Clientes dentro do Atendimento, mais Aprovação de peças, CS e Políticas.",
    diretor_arte: "Diretor de arte acessa Aprovação de peças, CS e Políticas. Não vê o Atendimento.",
    personalizado: "Marque os módulos e as abas que a pessoa pode acessar. Administrativo e Financeiro são só da Gestão.",
  };

  async function loadMe(){
    if (!IS_SITE) return;
    try { const r = await fetch("/api/me", {credentials:"same-origin"}); if (!r.ok) return; ME = await r.json(); } catch { return; }
    if (ME.trocarSenha) { location.href = "/"; return; }
    if (ehGestaoMe()) {
      unlocked = true;
      try { sessionStorage.setItem("carteira-edit", "1"); } catch {}
      renderLock();
    }
    (ME.modulos || []).forEach(m => { TAB_NAMES[m.id] = m.nome; TAB_MOD[m.id] = m.modulo; if (m.arquivo) QZ_montar(m); });
    document.querySelectorAll("nav.tabs button").forEach(b => { if (!TAB_MOD[b.dataset.tab]) TAB_MOD[b.dataset.tab] = "atendimento"; });
    const areas = ME.areas || [];
    const hashTab = (location.hash || "").slice(1);
    modAtual = new URLSearchParams(location.search).get("m") || TAB_MOD[hashTab] || (areas.find(a => !a.emBreve) || {}).id || "atendimento";
    const area = areas.find(a => a.id === modAtual && !a.emBreve);
    semAcesso = !area;
    const titulo = !area ? "Central Quinze" : modAtual === "atendimento" ? "Carteira de clientes" : area.nome.replace(/^\d+\s*/, "");
    $("#modTitle").textContent = titulo; document.title = titulo + " · Central Quinze";
    const allowed = new Set(area ? area.abas : []);
    document.querySelectorAll("nav.tabs button").forEach(b => { b.hidden = !allowed.has(b.dataset.tab); });
    // Ordem das abas pelo registro (abas que mudaram de módulo entram na posição certa) e grupos lado a lado (ex.: "Equipe").
    { const ORD = {}, GRP = {}; (ME.modulos || []).forEach(m => { ORD[m.id] = m.ordem; GRP[m.id] = m.grupo; });
      const nav = document.querySelector("nav.tabs"); const bts = [...nav.querySelectorAll("button[data-tab]")];
      bts.sort((a, b) => (ORD[a.dataset.tab] ?? 999) - (ORD[b.dataset.tab] ?? 999)).forEach(b => nav.appendChild(b));
      nav.querySelectorAll(".navgrp").forEach(x => x.remove());
      let ult = null;
      bts.filter(b => !b.hidden).forEach(b => { const g = GRP[b.dataset.tab] || null;
        if (g && g !== ult) b.insertAdjacentHTML("beforebegin", `<span class="navgrp" style="align-self:center;font-size:12px;font-weight:600;color:var(--ink2);padding:0 2px 0 10px;border-left:1px solid var(--line)">${esc(g)}:</span>`);
        ult = g; }); }
    const atalho = document.getElementById("atalhoProd"); if (atalho) atalho.hidden = !(ME.abas || []).includes("prod") || modAtual !== "atendimento";
    const atalhoPec = document.getElementById("atalhoPecas"); if (atalhoPec) atalhoPec.hidden = !(ME.areas || []).some(a => a.id === "pecas") || modAtual !== "atendimento";
    $("#lockBtn").hidden = modAtual !== "atendimento";
    const who = document.getElementById("whoami"); if (who) who.textContent = ME.nome || ME.login;
    const st = $("#syncTxt"); if (st && ME.nome) st.title = ME.login;
    if (semAcesso) { $("#subtitle").textContent = "Sem acesso a este módulo"; showSections(currentTab()); return; }
    const defTab = hashTab || (modAtual === "atendimento" && allowed.has("tarefas") ? "tarefas" : "");
    const want = defTab && document.querySelector(`nav.tabs button[data-tab="${defTab}"]`);
    const sel = document.querySelector('nav.tabs button[aria-selected="true"]');
    if (want && !want.hidden) want.click();
    else if (!sel || sel.hidden) { const first = [...document.querySelectorAll("nav.tabs button")].find(b => !b.hidden); if (first) first.click(); }
    renderAll();
    if (modAtual !== "atendimento") $("#subtitle").textContent = ME.perfil ? "Perfil: " + ME.perfil : "";
    if (allowed.has("users") && ehGestaoMe()) loadUsers();
  }
  async function usrApi(method, body, q){
    const r = await fetch("/api/users" + (q || ""), {method, credentials:"same-origin", headers:{"content-type":"application/json"}, body: body ? JSON.stringify(body) : undefined});
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "Não deu para salvar. Tente de novo.");
    return j;
  }
  async function loadUsers(){
    try {
      const j = await usrApi("GET"); usrList = j.users || [];
      if (j.modulos) j.modulos.forEach(m => { TAB_NAMES[m.id] = m.nome; TAB_MOD[m.id] = m.modulo; });
      FUNC_TABS = j.funcoes || {}; PERFIS = j.perfis || {}; ESCOLHAS = j.escolhas || []; AREAS_ALL = j.areas || []; SENHA_MIN = j.senhaMinima || 8;
      const sel = $("#usr_funcao"), v = sel.value || "atendimento";
      sel.innerHTML = Object.entries(PERFIS).filter(([k]) => k !== "mestre").map(([k,l]) => `<option value="${k}">${esc(l)}</option>`).join("");
      sel.value = PERFIS[v] && v !== "mestre" ? v : "atendimento";
      $("#usr_abas").innerHTML = "";
    } catch(e) { $("#usrRows").innerHTML = `<tr><td colspan="8" class="empty">${esc(e.message)}</td></tr>`; return; }
    renderUsers();
    try { renderTeam(); } catch {}
  }
  // Agrupamento de permissões por módulo para UI limpa e organizada
  function userInitials(nome, login){
    const txt = String(nome || login || "").trim();
    if (!txt) return "?";
    const clean = txt.replace(/@.*$/, "").replace(/[._-]/g, " ").trim();
    const parts = clean.split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  function agruparEscolhas(){
    const grupos = {};
    ESCOLHAS.forEach(k => {
      let modId = TAB_MOD[k];
      let modNome = "";
      const a = AREAS_ALL.find(x => x.id === k);
      if (a) {
        modId = k;
        modNome = a.nome.replace(/^\d+\s*/, "");
      } else {
        const area = AREAS_ALL.find(x => x.id === modId);
        modNome = area ? area.nome.replace(/^\d+\s*/, "") : (modId || "Outros");
      }
      if (!grupos[modId]) {
        grupos[modId] = { id: modId, nome: modNome, itens: [] };
      }
      grupos[modId].itens.push({ id: k, nome: TAB_NAMES[k] || k });
    });
    return Object.values(grupos);
  }
  function renderPermissoesDrawer(sel, attr, disabled, isCustom){
    const grupos = agruparEscolhas();
    return `<div class="usr-perm-drawer">
      <div class="usr-perm-drawer-notice">
        <span>${isCustom ? "Marque os módulos e as abas liberadas para este usuário:" : "Permissões automáticas concedidas pelo perfil selecionado:"}</span>
        ${isCustom ? `<div style="display:flex;gap:8px;align-items:center">
          <button type="button" class="btn-link-action" data-perm-check-all>Marcar todas</button>
          <span class="muted" style="font-size:12px">·</span>
          <button type="button" class="btn-link-action" data-perm-uncheck-all>Desmarcar todas</button>
        </div>` : ""}
      </div>
      <div class="usr-perm-modules-grid">
        ${grupos.map(g => {
          const total = g.itens.length;
          const marcados = g.itens.filter(it => sel.includes(it.id)).length;
          return `<div class="usr-perm-mod-card" data-mod="${esc(g.id)}">
            <div class="usr-perm-mod-head">
              <span class="usr-perm-mod-title">${esc(g.nome)}</span>
              <span class="usr-perm-mod-badge">${marcados}/${total}</span>
              ${isCustom ? `<div style="display:flex;gap:4px">
                <button type="button" class="usr-perm-mod-btn" data-perm-check-all title="Marcar todas deste módulo">Todos</button>
                <button type="button" class="usr-perm-mod-btn" data-perm-uncheck-all title="Desmarcar todas deste módulo">Nenhum</button>
              </div>` : ""}
            </div>
            <div class="usr-perm-items">
              ${g.itens.map(it => {
                const chk = sel.includes(it.id);
                return `<label class="usr-perm-chk-pill${chk ? " checked" : ""}">
                  <input type="checkbox" data-${attr}="${esc(it.id)}"${chk ? " checked" : ""}${disabled ? " disabled" : ""}>
                  <span>${esc(it.nome)}</span>
                </label>`;
              }).join("")}
            </div>
          </div>`;
        }).join("")}
      </div>
    </div>`;
  }
  function atualizarResumoPermissoes(scope){
    if (!scope) return;
    const countEl = scope.querySelector(".usr-perm-count");
    const chks = scope.querySelectorAll("[data-utab]:checked, [data-newtab]:checked");
    if (countEl) countEl.textContent = `${chks.length} ${chks.length === 1 ? "aba" : "abas"}`;
    scope.querySelectorAll(".usr-perm-mod-card").forEach(card => {
      const b = card.querySelector(".usr-perm-mod-badge");
      if (b) {
        const tot = card.querySelectorAll("input[type=checkbox]").length;
        const sel = card.querySelectorAll("input[type=checkbox]:checked").length;
        b.textContent = `${sel}/${tot}`;
      }
    });
  }
  function applyFunc(scope, attr, funcao){
    const preset = FUNC_TABS[funcao];
    const isCustom = funcao === "personalizado" || !preset;
    scope.querySelectorAll(`[data-${attr}]`).forEach(x => {
      if (preset) x.checked = preset.includes(x.dataset[attr]);
      x.disabled = !isCustom;
      const pill = x.closest(".usr-perm-chk-pill");
      if (pill) {
        pill.classList.toggle("checked", x.checked);
      }
    });
    atualizarResumoPermissoes(scope);
  }
  function renderUsers(){
    if (!$("#usr_abas").innerHTML) {
      const isCustom = $("#usr_funcao").value === "personalizado";
      $("#usr_abas").innerHTML = renderPermissoesDrawer([], "newtab", !isCustom, true);
      applyFunc($("#usr_abas"), "newtab", $("#usr_funcao").value);
      $("#usr_funcHint").textContent = FUNC_HINT[$("#usr_funcao").value] || "";
    }
    const fmt = t => t ? new Date(t).toLocaleString("pt-BR", {day:"2-digit", month:"2-digit", year:"2-digit", hour:"2-digit", minute:"2-digit"}) : "Nunca entrou";
    const souMestre = ME && ME.funcao === "mestre";
    $("#usrRows").innerHTML = usrList.map(u => {
      const m = u.funcao === "mestre", proprio = u.auth === "senha", travado = m && !souMestre;
      const tipo = `<div class="hint" style="margin-top:3px">${proprio ? (u.senhaTemporaria ? "Senha temporária" : "Senha própria") : "E-mail Locaweb"}</div>`;
      const pwd = !travado ? (usrPwdArm === u.login
        ? `<input data-unewpwd type="password" autocomplete="new-password" placeholder="Nova senha" style="width:140px;min-height:30px;padding:4px 8px;font-size:13px"><button class="btn small primary" type="button" data-upwdsave>Gravar</button>`
        : `<button class="btn small" type="button" data-upwd>${proprio ? "Redefinir senha" : "Definir senha"}</button>`) : "";

      const selTabs = u.abasEfetivas || u.abas || [];
      const isCustom = u.funcao === "personalizado";
      const perfilLabel = PERFIS[u.funcao] || (m ? "Mestre" : u.funcao);
      const qtdAbas = selTabs.length;

      const permHtml = m ? `
        <span class="tag off" style="font-weight:600;padding:4px 10px;border-radius:6px;display:inline-flex;align-items:center;gap:6px">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
          Acesso total a todos os módulos
        </span>
      ` : `
        <div class="usr-perm-cell">
          <div class="usr-perm-top">
            <span class="usr-perm-badge${isCustom ? " custom" : ""}">${esc(perfilLabel)}</span>
            <span class="usr-perm-count">${qtdAbas} ${qtdAbas === 1 ? "aba" : "abas"}</span>
            <details class="usr-perm-collapse">
              <summary class="usr-perm-sum${isCustom ? " is-custom" : ""}">
                <span>${isCustom ? "⚙ Configurar permissões" : "Visualizar abas"}</span>
                <svg class="chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
              </summary>
              ${renderPermissoesDrawer(selTabs, "utab", !isCustom, isCustom)}
            </details>
          </div>
        </div>
      `;

      return `<tr data-usr="${esc(u.login)}" class="${u.ativo ? "" : "out"}">
        <td>
          <div class="usr-user-info">
            <div class="usr-avatar" title="${esc(u.nome || u.login)}">${esc(userInitials(u.nome, u.login))}</div>
            <div style="flex:1;min-width:0">
              <input data-unome value="${esc(u.nome)}" placeholder="Nome do usuário" aria-label="Nome" class="usr-input-name"${travado ? " disabled" : ""}>
            </div>
          </div>
        </td>
        <td>
          <div style="font-weight:600;color:var(--ink);font-size:13px;word-break:break-word">${esc(u.login)}${m ? ' <span class="tag fee" style="font-size:10px;padding:1px 6px">Mestre</span>' : ""}</div>
          ${tipo}
        </td>
        <td>
          ${m ? '<span class="tag fee" style="font-weight:600">Mestre</span>' : `<select data-ufunc aria-label="Perfil" class="usr-select">${Object.entries(PERFIS).filter(([k]) => k !== "mestre").map(([k,l]) => `<option value="${k}"${u.funcao === k ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>`}
        </td>
        <td>${permHtml}</td>
        <td style="text-align:center">
          <label class="usr-toggle-label">
            <input type="checkbox" data-upecas${u.podeEnviarPecas ? " checked" : ""}${travado ? " disabled" : ""}>
            <span>Sim</span>
          </label>
        </td>
        <td>
          ${m ? '<span class="tag off">Ativo</span>' : `<select data-uativo aria-label="Situação" class="usr-select"><option value="1"${u.ativo ? " selected" : ""}>Ativo</option><option value="0"${u.ativo ? "" : " selected"}>Bloqueado</option></select>`}
        </td>
        <td class="muted" style="white-space:nowrap;font-size:13px;font-variant-numeric:tabular-nums">${fmt(u.ultimo_acesso)}</td>
        <td>
          <div class="actions" style="display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap">
            ${travado ? "" : `<button class="btn small primary" type="button" data-usave>Salvar</button>`}
            ${pwd}
            ${m ? "" : (usrDelArm === u.login ? `<button class="btn small danger" type="button" data-udel>Confirmar remoção</button>` : `<button class="btn small danger" type="button" data-udel>Remover</button>`)}
          </div>
        </td>
      </tr>`;
    }).join("") || `<tr><td colspan="8" class="empty">Nenhum usuário.</td></tr>`;
  }
  // Equipe e ajustes: "criar acesso" a partir do nome da equipe abre o formulário de Usuários já preenchido.
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-criaracesso]"); if (!b) return;
    const nome = b.dataset.criaracesso.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, a, c) => a + c.toUpperCase());
    const tab = document.querySelector('nav.tabs button[data-tab="users"]'); if (tab && !tab.hidden) tab.click();
    $("#usr_nome").value = nome; $("#usr_funcao").value = b.dataset.perfil; $("#usr_funcao").dispatchEvent(new Event("change"));
    $("#usr_email").focus(); toast("Complete o e-mail ou usuário e crie o acesso");
  });
  if (IS_SITE) {
    const normLogin = raw => {
      const s = String(raw || "").trim().toLowerCase();
      if (!s || s.includes("@")) return s;
      return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, ".").replace(/[^a-z0-9._-]/g, "").replace(/^[^a-z0-9]+/, "").slice(0, 40);
    };
    const ehEmailQuinze = v => /@quinzecomunicacao\.com(\.br)?$/i.test(v);
    const senhaBox = () => {
      const v = $("#usr_email").value.trim().toLowerCase();
      const qz = ehEmailQuinze(v);
      const lbl = $("#usr_senhaLbl"), hint = $("#usr_senhaHint"), inp = $("#usr_senha");
      if (lbl) lbl.textContent = qz ? "Senha temporária (opcional para e-mail Quinze)" : "Senha temporária";
      if (inp) inp.placeholder = qz ? "Em branco = usa senha da Locaweb" : `Pelo menos ${SENHA_MIN} caracteres`;
      if (hint) hint.textContent = qz
        ? "Deixe em branco para validar na Locaweb, ou defina uma senha própria para entrar direto na Central."
        : "Passe à pessoa; ela cria a própria senha no primeiro acesso.";
    };
    senhaBox();
    $("#usr_email").addEventListener("input", () => { $("#usrMsg").textContent = ""; senhaBox(); });
    $("#usrAdd").addEventListener("click", async () => {
      const login = normLogin($("#usr_email").value), nome = $("#usr_nome").value.trim();
      if (!login.includes("@") && login !== $("#usr_email").value.trim().toLowerCase()) $("#usr_email").value = login;
      const funcao = $("#usr_funcao").value, comEmail = login.includes("@"), qzEmail = ehEmailQuinze(login), senha = $("#usr_senha").value.trim();
      const abas = [...document.querySelectorAll("#usr_abas [data-newtab]:checked")].map(x => x.dataset.newtab);
      if (!login) { $("#usrMsg").textContent = "Informe o e-mail ou um nome de usuário."; return; }
      if (comEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(login)) { $("#usrMsg").textContent = "Esse e-mail não parece válido."; return; }
      if (!comEmail && !/^[a-z0-9][a-z0-9._-]{2,39}$/.test(login)) { $("#usrMsg").textContent = "Usuário: use pelo menos 3 letras ou números (ex.: joao.silva)."; return; }
      if ((!qzEmail || senha.length > 0) && senha.length < SENHA_MIN) { $("#usrMsg").textContent = `Defina uma senha temporária com pelo menos ${SENHA_MIN} caracteres.`; return; }
      if (funcao === "personalizado" && !abas.length) { $("#usrMsg").textContent = "Marque pelo menos um módulo ou aba."; return; }
      $("#usrAdd").disabled = true;
      try {
        const j = await usrApi("POST", {login, nome, funcao, abas, ativo:true, podeEnviarPecas: $("#usr_pecas").checked, senha: senha || undefined});
        ["#usr_email","#usr_nome","#usr_senha"].forEach(s => $(s).value = ""); $("#usr_pecas").checked = false; senhaBox(); $("#usrMsg").textContent = "";
        toast(`${nome || login} ${j.criado === false ? "atualizado" : "adicionado"} como ${(PERFIS[funcao] || funcao).toLowerCase()}${j.compartilhadoDesativado ? ". O login compartilhado foi desativado" : ""}`);
        loadUsers();
      } catch(e) { $("#usrMsg").textContent = e.message; }
      finally { $("#usrAdd").disabled = false; }
    });
    $("#usr_funcao").addEventListener("change", () => {
      applyFunc($("#usr_abas"), "newtab", $("#usr_funcao").value);
      $("#usr_funcHint").textContent = FUNC_HINT[$("#usr_funcao").value] || "";
      atualizarResumoPermissoes(document.getElementById("tab-users"));
    });
    document.addEventListener("change", e => {
      const f = e.target.closest("[data-ufunc]");
      if (f) {
        const tr = f.closest("tr");
        const isCustom = f.value === "personalizado";
        applyFunc(tr, "utab", f.value);
        const badge = tr.querySelector(".usr-perm-badge");
        if (badge) {
          badge.textContent = PERFIS[f.value] || f.value;
          badge.classList.toggle("custom", isCustom);
        }
        const sum = tr.querySelector(".usr-perm-sum");
        if (sum) {
          sum.classList.toggle("is-custom", isCustom);
          const txt = sum.querySelector("span");
          if (txt) txt.textContent = isCustom ? "⚙ Configurar permissões" : "Visualizar abas";
        }
        const notice = tr.querySelector(".usr-perm-drawer-notice span");
        if (notice) {
          notice.textContent = isCustom ? "Marque os módulos e as abas liberadas para este usuário:" : "Permissões automáticas concedidas pelo perfil selecionado:";
        }
        const details = tr.querySelector(".usr-perm-collapse");
        if (details && isCustom) {
          details.open = true;
        }
        atualizarResumoPermissoes(tr);
        return;
      }
      const chk = e.target.closest("[data-utab], [data-newtab]");
      if (chk) {
        const pill = chk.closest(".usr-perm-chk-pill");
        if (pill) pill.classList.toggle("checked", chk.checked);
        atualizarResumoPermissoes(chk.closest("tr") || document.getElementById("tab-users"));
      }
    });
    document.addEventListener("click", async e => {
      const btnAll = e.target.closest("[data-perm-check-all]");
      if (btnAll) {
        const container = btnAll.closest(".usr-perm-mod-card") || btnAll.closest(".usr-perm-drawer") || btnAll.closest("#usr_abas");
        if (container) {
          container.querySelectorAll("input[type=checkbox]:not(:disabled)").forEach(c => {
            c.checked = true;
            const p = c.closest(".usr-perm-chk-pill");
            if (p) p.classList.add("checked");
          });
          atualizarResumoPermissoes(btnAll.closest("tr") || document.getElementById("tab-users"));
        }
        return;
      }
      const btnNone = e.target.closest("[data-perm-uncheck-all]");
      if (btnNone) {
        const container = btnNone.closest(".usr-perm-mod-card") || btnNone.closest(".usr-perm-drawer") || btnNone.closest("#usr_abas");
        if (container) {
          container.querySelectorAll("input[type=checkbox]:not(:disabled)").forEach(c => {
            c.checked = false;
            const p = c.closest(".usr-perm-chk-pill");
            if (p) p.classList.remove("checked");
          });
          atualizarResumoPermissoes(btnNone.closest("tr") || document.getElementById("tab-users"));
        }
        return;
      }
      const tr = e.target.closest("tr[data-usr]"); if (!tr) return;
      const login = tr.dataset.usr, u = usrList.find(x => x.login === login); if (!u) return;
      const m = u.funcao === "mestre";
      if (e.target.closest("[data-usave]")) {
        const abas = m ? [] : [...tr.querySelectorAll("[data-utab]:checked")].map(x => x.dataset.utab);
        const funcao = m ? "mestre" : tr.querySelector("[data-ufunc]").value;
        const ativo = m ? true : tr.querySelector("[data-uativo]").value === "1";
        try { await usrApi("POST", {login, nome: tr.querySelector("[data-unome]").value.trim(), funcao, abas, ativo, podeEnviarPecas: tr.querySelector("[data-upecas]").checked}); toast("Usuário salvo"); loadUsers(); }
        catch(err) { toast(err.message); }
      }
      if (e.target.closest("[data-upwd]")) { usrPwdArm = login; renderUsers(); tr.ownerDocument.querySelector(`tr[data-usr="${CSS.escape(login)}"] [data-unewpwd]`)?.focus(); return; }
      if (e.target.closest("[data-upwdsave]")) {
        const inp = tr.querySelector("[data-unewpwd]"), senha = inp ? inp.value : "";
        if (senha.length < SENHA_MIN) { toast(`A senha precisa ter pelo menos ${SENHA_MIN} caracteres.`); return; }
        try { await usrApi("POST", {acao:"senha", login, senha}); usrPwdArm = null; toast(m ? "Senha alterada" : "Senha redefinida. A pessoa troca no próximo acesso"); loadUsers(); }
        catch(err) { toast(err.message); }
        return;
      }
      if (e.target.closest("[data-udel]")) {
        if (usrDelArm !== login) { usrDelArm = login; renderUsers(); return; }
        usrDelArm = null;
        try { await usrApi("DELETE", null, "?login=" + encodeURIComponent(login)); toast("Usuário removido"); loadUsers(); }
        catch(err) { toast(err.message); }
      }
    });
  }

