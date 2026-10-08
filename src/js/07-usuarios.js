  // ---------- Módulo aberto, usuários e permissões (somente no site) ----------
  // Módulos, abas, perfis e permissões vêm do registro central (api/_modules.js).
  // A página só esconde o que não é liberado; quem decide de verdade é o servidor.
  let TAB_NAMES = {dash:"Dashboard", cli:"Clientes", onb:"Onboarding", prop:"Propostas", agenda:"Agenda", and:"Andamento", prod:"Dados consolidados", team:"Equipe e ajustes", users:"Usuários"};
  const TAB_MOD = {users:"administrativo"};
  let ME = null, usrList = [], usrDelArm = null, usrPwdArm = null;
  let FUNC_TABS = {}, PERFIS = {}, ESCOLHAS = [], AREAS_ALL = [], SENHA_MIN = 8;
  const FUNC_HINT = {
    gestao: "Gestão acessa todos os módulos, inclusive Administrativo e Financeiro, e cadastra usuários.",
    atendimento: "Atendimento acessa todo o módulo Atendimento (inclusive as abas criadas depois), Aprovação de peças, CS e Políticas.",
    coordenador: "Coordenador acessa Aprovação de peças, CS e Políticas. Não vê o Atendimento.",
    social: "Social media vê só Clientes dentro do Atendimento, mais Aprovação de peças, CS e Políticas.",
    diretor_arte: "Diretor de arte acessa Aprovação de peças, CS e Políticas. Não vê o Atendimento.",
    personalizado: "Marque os módulos e as abas que a pessoa pode acessar. Administrativo e Financeiro são só da Gestão.",
  };
  const ehGestaoMe = () => ME && (ME.funcao === "mestre" || ME.funcao === "gestao");

  async function loadMe(){
    if (!IS_SITE) return;
    try { const r = await fetch("/api/me", {credentials:"same-origin"}); if (!r.ok) return; ME = await r.json(); } catch { return; }
    if (ME.trocarSenha) { location.href = "/"; return; }
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
    $("#lockBtn").hidden = modAtual !== "atendimento";
    const who = document.getElementById("whoami"); if (who) who.textContent = ME.nome || ME.login;
    const st = $("#syncTxt"); if (st && ME.nome) st.title = ME.login;
    if (semAcesso) { $("#subtitle").textContent = "Sem acesso a este módulo"; showSections(currentTab()); return; }
    const want = document.querySelector(`nav.tabs button[data-tab="${hashTab}"]`);
    const sel = document.querySelector('nav.tabs button[aria-selected="true"]');
    if (want && !want.hidden) want.click();
    else if (!sel || sel.hidden) { const first = [...document.querySelectorAll("nav.tabs button")].find(b => !b.hidden); if (first) first.click(); }
    if (modAtual !== "atendimento") $("#subtitle").textContent = ME.perfil ? "Perfil: " + ME.perfil : "";
    if (allowed.has("users") && ehGestaoMe()) loadUsers();
  }
  async function usrApi(method, body, q){
    const r = await fetch("/api/users" + (q || ""), {method, credentials:"same-origin", headers:{"content-type":"application/json"}, body: body ? JSON.stringify(body) : undefined});
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error && j.error.length > 12 ? j.error : "Não deu para salvar. Tente de novo.");
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
  // Nome de cada item marcável: abas com o módulo na frente, módulos sem abas com "(em breve)".
  function escolhaNome(id){
    const a = AREAS_ALL.find(x => x.id === id);
    if (a) return a.nome.replace(/^\d+\s*/, "") + (a.emBreve ? " (em breve)" : "");
    const mod = AREAS_ALL.find(x => x.id === TAB_MOD[id]);
    return (mod ? mod.nome.replace(/^\d+\s*/, "") + ": " : "") + (TAB_NAMES[id] || id);
  }
  const tabChecks = (sel, name, disabled) => ESCOLHAS.map(k => `<label><input type="checkbox" data-${name}="${k}"${sel.includes(k) ? " checked" : ""}${disabled ? " disabled" : ""}> ${esc(escolhaNome(k))}</label>`).join("");
  function applyFunc(scope, attr, funcao){
    const preset = FUNC_TABS[funcao];
    scope.querySelectorAll(`[data-${attr}]`).forEach(x => { if (preset) x.checked = preset.includes(x.dataset[attr]); x.disabled = !!preset; });
  }
  function renderUsers(){
    if (!$("#usr_abas").innerHTML) { $("#usr_abas").innerHTML = tabChecks([], "newtab", false); applyFunc($("#usr_abas"), "newtab", $("#usr_funcao").value); $("#usr_funcHint").textContent = FUNC_HINT[$("#usr_funcao").value] || ""; }
    const fmt = t => t ? new Date(t).toLocaleString("pt-BR", {day:"2-digit", month:"2-digit", year:"2-digit", hour:"2-digit", minute:"2-digit"}) : "Nunca entrou";
    const souMestre = ME && ME.funcao === "mestre";
    $("#usrRows").innerHTML = usrList.map(u => {
      const m = u.funcao === "mestre", proprio = u.auth === "senha", travado = m && !souMestre;
      const tipo = proprio ? `<div class="hint">${u.senhaTemporaria ? "Senha temporária (troca no próximo acesso)" : "Usuário com senha própria"}</div>` : "";
      const pwd = proprio && !travado ? (usrPwdArm === u.login
        ? `<input data-unewpwd type="password" autocomplete="new-password" placeholder="Nova senha temporária" style="width:170px;min-height:30px;padding:4px 8px"><button class="btn small primary" type="button" data-upwdsave>Gravar senha</button>`
        : `<button class="btn small" type="button" data-upwd>Redefinir senha</button>`) : "";
      return `<tr data-usr="${esc(u.login)}" class="${u.ativo ? "" : "out"}">
        <td><input data-unome value="${esc(u.nome)}" aria-label="Nome" style="width:100%;min-width:150px"${travado ? " disabled" : ""}></td>
        <td>${esc(u.login)}${m ? ' <span class="tag fee">Mestre</span>' : ""}${tipo}</td>
        <td>${m ? "Mestre" : `<select data-ufunc aria-label="Perfil">${Object.entries(PERFIS).filter(([k]) => k !== "mestre").map(([k,l]) => `<option value="${k}"${u.funcao === k ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>`}</td>
        <td><div class="chk">${m ? '<span class="tag off">Acesso total</span>' : tabChecks(u.abasEfetivas || u.abas || [], "utab", u.funcao !== "personalizado")}</div></td>
        <td><label style="display:flex;gap:6px;align-items:center;font-size:13px"><input type="checkbox" data-upecas${u.podeEnviarPecas ? " checked" : ""}${travado ? " disabled" : ""} style="min-height:0;width:15px;height:15px"> Sim</label></td>
        <td>${m ? "Ativo" : `<select data-uativo aria-label="Situação"><option value="1"${u.ativo ? " selected" : ""}>Ativo</option><option value="0"${u.ativo ? "" : " selected"}>Bloqueado</option></select>`}</td>
        <td class="muted" style="white-space:nowrap">${fmt(u.ultimo_acesso)}</td>
        <td><div class="actions" style="flex-wrap:wrap">${travado ? "" : `<button class="btn small" type="button" data-usave>Salvar</button>`}${pwd}${m ? "" : (usrDelArm === u.login ? `<button class="btn small danger" type="button" data-udel>Confirmar remoção</button>` : `<button class="btn small danger" type="button" data-udel>Remover</button>`)}</div></td>
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
    const senhaBox = () => { const v = $("#usr_email").value.trim(); $("#usr_senhaBox").hidden = !v || v.includes("@"); };
    $("#usr_email").addEventListener("input", senhaBox);
    $("#usrAdd").addEventListener("click", async () => {
      const login = $("#usr_email").value.trim().toLowerCase(), nome = $("#usr_nome").value.trim();
      const funcao = $("#usr_funcao").value, comEmail = login.includes("@"), senha = $("#usr_senha").value;
      const abas = [...document.querySelectorAll("#usr_abas [data-newtab]:checked")].map(x => x.dataset.newtab);
      if (!login) { $("#usrMsg").textContent = "Informe o e-mail da Locaweb ou um nome de usuário."; return; }
      if (comEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(login)) { $("#usrMsg").textContent = "Esse e-mail não parece válido."; return; }
      if (!comEmail && !/^[a-z0-9][a-z0-9._-]{2,39}$/.test(login)) { $("#usrMsg").textContent = "Usuário: de 3 a 40 letras minúsculas, números, ponto, hífen ou sublinhado (sem espaços e sem acentos)."; return; }
      if (!comEmail && senha.length < SENHA_MIN) { $("#usrMsg").textContent = `Defina uma senha temporária com pelo menos ${SENHA_MIN} caracteres.`; return; }
      if (funcao === "personalizado" && !abas.length) { $("#usrMsg").textContent = "Marque pelo menos um módulo ou aba."; return; }
      if (usrList.some(u => u.login === login)) { $("#usrMsg").textContent = "Esse login já está cadastrado. Ajuste na tabela abaixo."; return; }
      $("#usrAdd").disabled = true;
      try {
        const j = await usrApi("POST", {login, nome, funcao, abas, ativo:true, podeEnviarPecas: $("#usr_pecas").checked, senha: comEmail ? undefined : senha});
        ["#usr_email","#usr_nome","#usr_senha"].forEach(s => $(s).value = ""); $("#usr_pecas").checked = false; senhaBox(); $("#usrMsg").textContent = "";
        toast(`${nome || login} adicionado como ${(PERFIS[funcao] || funcao).toLowerCase()}${j.compartilhadoDesativado ? ". O login compartilhado foi desativado" : ""}`);
        loadUsers();
      } catch(e) { $("#usrMsg").textContent = e.message; }
      finally { $("#usrAdd").disabled = false; }
    });
    $("#usr_funcao").addEventListener("change", () => { applyFunc($("#usr_abas"), "newtab", $("#usr_funcao").value); $("#usr_funcHint").textContent = FUNC_HINT[$("#usr_funcao").value] || ""; });
    document.addEventListener("change", e => {
      const f = e.target.closest("[data-ufunc]"); if (!f) return;
      applyFunc(f.closest("tr"), "utab", f.value);
    });
    document.addEventListener("click", async e => {
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

