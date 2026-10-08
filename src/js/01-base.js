  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const num = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.round(n) : 0; };
  const LV = {A:"var(--lvA)",B:"var(--lvB)",C:"var(--lvC)",D:"var(--lvD)"};
  const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];
  const MESES = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  const mLabel = ym => { const [y,m] = ym.split("-"); const s = MESES[+m-1]; return s.charAt(0).toUpperCase()+s.slice(1)+" de "+y; };
  const mShort = ym => { const [y,m] = ym.split("-"); return MESES[+m-1].slice(0,3)+"/"+y.slice(2); };

  let db = null;
  let months = [];          // ["2026-09", ...] ordenado
  let cur = null;           // mês selecionado
  let clients = [], prevClients = [];
  let cfg = {coordenacao:"", atendimentos:[], socials:[], tipos:["FEE MENSAL","JOB","PRÓPRIO"]};
  let unsubCur = null, unsubPrev = null, unsubProd = null;
  let prodYear = String(new Date().getFullYear()), prodYears = [], prod = {};
  const CK_DEFAULT = "https://app.clickup.com/9013068617/v/db/8ckh0u9-23193";
  let editingId = null, outId = null;
  const PASS_HASH = "a8698d96861f332be3627b5461c3d4ac120295ae33c8e26b9c0db82afa657084";
  let unlocked = false;
  try { unlocked = sessionStorage.getItem("carteira-edit") === "1"; } catch {}
  const LOCK_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 015 0v2"/></svg>';
  const OPEN_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 014.8-1"/></svg>';
  function renderLock(){
    const b = document.getElementById("lockBtn");
    b.className = "lockbtn" + (unlocked ? " open" : "");
    b.innerHTML = unlocked ? OPEN_SVG + "Edição liberada, bloquear" : LOCK_SVG + "Somente leitura, desbloquear";
  }
  async function sha256(t){ const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)); return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join(""); }
  let pendingEl = null;
  function askPassword(el){
    pendingEl = el || null;
    document.getElementById("pwdIn").value = ""; document.getElementById("pwdErr").textContent = "";
    document.getElementById("dlgPwd").showModal();
    setTimeout(()=>document.getElementById("pwdIn").focus(), 30);
  }
  const WRITE_SEL = "[data-insert],#obPropSave,[data-edit],[data-open-newmonth],[data-out],[data-back],[data-rm],[data-add],[data-delmonth],#btnNew,#btnNewMonth,#saveCfg,#ckSave,#btnNewYear";
  document.addEventListener("click", e => {
    if (unlocked) return;
    const el = e.target.closest(WRITE_SEL);
    if (!el || el.closest("dialog")) return;
    e.preventDefault(); e.stopImmediatePropagation();
    askPassword(el);
  }, true);

  function toast(msg){ const t=$("#toast"); t.textContent=msg; t.classList.add("show"); clearTimeout(toast._t); toast._t=setTimeout(()=>t.classList.remove("show"),2600); }
  const total = c => num(c.conteudos) + num(c.motions);
  const isOn = c => c && c.status !== "retirado";
  const active = () => clients.filter(isOn);
  const prevMonth = () => { const i = months.indexOf(cur); return i > 0 ? months[i-1] : null; };
  const tipoClass = t => /FEE/i.test(t)?"fee":/JOB/i.test(t)?"job":"proprio";
  const small = new Set(["de","da","do","das","dos","e"]);
  function titleCity(s){
    return (s||"").trim().replace(/\s+/g," ").toLowerCase().split(" ").map((w,i)=> i>0 && small.has(w) ? w : w.charAt(0).toUpperCase()+w.slice(1)).join(" ");
  }
  const place = c => c.cidade ? c.cidade + (c.uf ? "/"+c.uf : "") : "";

  document.querySelectorAll("nav.tabs button").forEach(b => b.addEventListener("click", () => {
    document.querySelectorAll("nav.tabs button").forEach(x => x.setAttribute("aria-selected", x===b));
    showSections(b.dataset.tab);
  }));
  function currentTab(){ return document.querySelector('nav.tabs button[aria-selected="true"]').dataset.tab; }
  let modAtual = null, semAcesso = false;   // módulo aberto (definidos em 07-usuarios, no site)
  function showSections(tab){
    const needMonth = (tab === "dash" || tab === "cli") && !semAcesso;
    document.getElementById("monthBox").hidden = !needMonth;
    $("#noMonth").hidden = !(db && !cur && needMonth);
    const sa = document.getElementById("semAcesso"); if (sa) sa.hidden = !semAcesso;
    document.querySelectorAll("main > section").forEach(s => s.hidden = semAcesso || s.id !== "tab-"+tab || (needMonth && !cur && !!db));
  }

  // ---------- Render ----------
  function renderAll(){ renderHeader(); renderSelects(); renderDash(); renderRows(); renderTeam(); renderClickUp(); renderProd(); renderOnb(); renderPropList(); renderAgLegend(); showSections(currentTab()); }

  function renderHeader(){
    const sel = $("#monthSel");
    sel.innerHTML = months.length ? months.slice().reverse().map(m=>`<option value="${m}">${mLabel(m)}</option>`).join("") : `<option value="">Sem carteiras</option>`;
    sel.value = cur || "";
    const i = months.indexOf(cur);
    $("#prevM").disabled = i <= 0; $("#nextM").disabled = i < 0 || i >= months.length-1;
    const a = active().length;
    if (semAcesso || (modAtual && modAtual !== "atendimento")) { $("#subtitle").textContent = semAcesso ? "Sem acesso a este módulo" : (ME && ME.perfil ? "Perfil: " + ME.perfil : ""); return; }
    $("#subtitle").textContent =(cfg.coordenacao ? "Coordenação: "+cfg.coordenacao+"  |  " : "") + (cur ? a+" clientes ativos em "+mLabel(cur).toLowerCase() : "Nenhum mês selecionado");
  }

  function people(key, field){
    const set = new Set(cfg[key] || []);
    clients.forEach(c => { if (c[field]) set.add(c[field]); });
    return [...set];
  }
  function fillSelect(sel, list, first, current){
    const v = current ?? sel.value;
    sel.innerHTML = (first!==null ? `<option value="">${esc(first)}</option>` : "") + list.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join("");
    sel.value = list.includes(v) || v==="" ? v : "";
  }
  function renderSelects(){
    fillSelect($("#fAt"), people("atendimentos","atendimento"), "Todo atendimento");
    fillSelect($("#fSm"), people("socials","social"), "Toda social media");
    fillSelect($("#fTipo"), [...new Set([...(cfg.tipos||[]), ...clients.map(c=>c.tipo).filter(Boolean)])], "Todos os tipos");
    $("#cidades").innerHTML = [...new Set([...clients,...prevClients].map(c=>c.cidade).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"pt")).map(l=>`<option value="${esc(l)}">`).join("");
  }

  function delta(now, before){
    if (before == null) return "";
    const d = now - before; if (!d) return `<em>igual a ${mShort(prevMonth())}</em>`;
    return `<em class="${d>0?"up":"down"}">${d>0?"+":""}${d} vs ${mShort(prevMonth())}</em>`;
  }

  function renderDash(){
    const A = active();
    const P = prevMonth() ? prevClients.filter(isOn) : null;
    const sumT = arr => arr.reduce((s,c)=>s+total(c),0), sumG = arr => arr.reduce((s,c)=>s+num(c.gravacao),0);
    const cnt = (arr,re) => arr.filter(c=>re.test(c.tipo||"")).length;
    const semSm = A.filter(c => !c.social && !/JOB/i.test(c.tipo||""));
    const semLocal = A.filter(c => !c.cidade);
    const feeZero = A.filter(c => /FEE/i.test(c.tipo||"") && total(c)===0);
    const semAt = A.filter(c => !c.atendimento);
    const pendCount = new Set([...semSm,...semLocal,...feeZero,...semAt].map(c=>c.id)).size;
    const k = [
      [A.length,"Clientes ativos", P && P.length],
      [cnt(A,/FEE/i),"Fee mensal", P && cnt(P,/FEE/i)],
      [cnt(A,/JOB/i),"Jobs", P && cnt(P,/JOB/i)],
      [sumT(A),"Total de conteúdos", P && sumT(P)],
      [sumG(A),"Total de gravações", P && sumG(P)],
      [pendCount,"Clientes com pendência", null, pendCount>0],
    ];
    $("#kpis").innerHTML = k.map(([v,l,b,al])=>`<div class="kpi${al?" alert":""}"><b>${v}</b><span>${l}</span>${b==null?"":delta(v,b)}</div>`).join("");

    const groups = {};
    A.forEach(c => { const k = c.social || "Sem social media"; (groups[k] ||= []).push(c); });
    const rows = Object.entries(groups).map(([n,cs]) => ({n, cs:cs.sort((a,b)=>(a.nivel||"").localeCompare(b.nivel||"")||total(b)-total(a)), t:sumT(cs), g:sumG(cs)}))
      .sort((a,b)=> (a.n==="Sem social media") - (b.n==="Sem social media") || b.t-a.t);
    const max = Math.max(1, ...rows.map(r => r.t + r.cs.filter(c=>!total(c)).length*2));
    $("#load").innerHTML = rows.length ? `<div class="load-row hd"><span></span><span></span><span>Conteúdos</span><span>Gravações</span></div>` + rows.map(r => `
      <div class="load-row">
        <div class="load-name">${esc(r.n)}<small>${r.cs.length} cliente${r.cs.length>1?"s":""}</small></div>
        <div class="blocks">${r.cs.map(c => { const t=total(c); const w = (t||2)/max*100;
          return `<span class="blk${t?"":" zero"}" style="flex:0 0 ${w}%;background:${LV[c.nivel]||LV.D}" title="${esc(c.nome)} (nível ${esc(c.nivel)}): ${t} conteúdos, ${num(c.gravacao)} gravações"></span>`; }).join("")}</div>
        <div class="load-total">${r.t}</div>
        <div class="load-total g">${r.g}</div>
      </div>`).join("") : `<div class="empty">Nenhum cliente ativo neste mês.</div>`;

    const at = {}; A.forEach(c => { const k = c.atendimento || "Sem atendimento"; at[k] ||= {A:0,B:0,C:0,D:0}; at[k][c.nivel] = (at[k][c.nivel]||0)+1; });
    const atRows = Object.entries(at).map(([n,v])=>({n,v,t:Object.values(v).reduce((a,b)=>a+b,0)})).sort((a,b)=>(a.n==="Sem atendimento")-(b.n==="Sem atendimento")||b.t-a.t);
    const cmax = Math.max(1,...atRows.flatMap(r=>Object.values(r.v)));
    const cell = (n,l) => n ? `<td class="h" style="background:color-mix(in srgb, ${LV[l]} ${Math.round(12+n/cmax*48)}%, white);${n/cmax>.55?"color:#fff;font-weight:700":""}">${n}</td>` : `<td class="muted">·</td>`;
    const tl = {A:0,B:0,C:0,D:0}; atRows.forEach(r=>["A","B","C","D"].forEach(l=>tl[l]+=r.v[l]||0));
    $("#matrix").innerHTML = `<tr><th>Atendimento</th><th>A</th><th>B</th><th>C</th><th>D</th><th>Total</th></tr>` +
      atRows.map(r=>`<tr><td>${esc(r.n)}</td>${["A","B","C","D"].map(l=>cell(r.v[l]||0,l)).join("")}<td><b>${r.t}</b></td></tr>`).join("") +
      `<tr class="tot"><td>Total</td>${["A","B","C","D"].map(l=>`<td>${tl[l]}</td>`).join("")}<td>${A.length}</td></tr>`;

    // Movimento vs mês anterior
    const pm = prevMonth();
    $("#movTitle").textContent = pm ? `Movimento desde ${mLabel(pm).toLowerCase()}` : "Movimento da carteira";
    if (!pm) { $("#mov").innerHTML = `<p class="muted" style="margin:0">Esta é a primeira carteira. Quando você criar o próximo mês, as entradas, saídas e trocas de responsável aparecem aqui.</p>`; }
    else {
      const pMap = new Map(P.map(c=>[c.id,c])), cMap = new Map(A.map(c=>[c.id,c]));
      const entr = A.filter(c=>!pMap.has(c.id)), sai = P.filter(c=>!cMap.has(c.id));
      const troca = A.filter(c=>{ const p=pMap.get(c.id); return p && ((p.social||"")!==(c.social||"") || (p.atendimento||"")!==(c.atendimento||"")); });
      const vol = A.filter(c=>{ const p=pMap.get(c.id); return p && (total(p)!==total(c) || num(p.gravacao)!==num(c.gravacao)); });
      const chips = (list, cls, fn) => `<div class="chipline">${list.map(c=>`<button class="mini ${cls}" data-edit="${esc(c.id)}" title="${esc(fn?fn(c):"")}">${esc(c.nome)}</button>`).join("")}</div>`;
      const who = c => { const p=pMap.get(c.id); const out=[]; if((p.social||"")!==(c.social||"")) out.push(`Social: ${p.social||"—"} → ${c.social||"—"}`); if((p.atendimento||"")!==(c.atendimento||"")) out.push(`Atendimento: ${p.atendimento||"—"} → ${c.atendimento||"—"}`); return out.join("; "); };
      const vv = c => { const p=pMap.get(c.id); return `Conteúdos ${total(p)} → ${total(c)}, gravações ${num(p.gravacao)} → ${num(c.gravacao)}`; };
      let h = "";
      if (entr.length) h += `<li><div class="t">Entraram (${entr.length})</div>${chips(entr,"in")}</li>`;
      if (sai.length) h += `<li><div class="t">Saíram (${sai.length})</div><div class="chipline">${sai.map(c=>`<span class="mini out">${esc(c.nome)}</span>`).join("")}</div></li>`;
      if (troca.length) h += `<li><div class="t">Trocaram de responsável (${troca.length})</div><div class="desc">${troca.map(c=>`<div><b>${esc(c.nome)}</b>: ${esc(who(c))}</div>`).join("")}</div></li>`;
      if (vol.length) h += `<li><div class="t">Mudaram de volume (${vol.length})</div>${chips(vol,"ch",vv)}</li>`;
      $("#mov").innerHTML = h ? `<ul>${h}</ul>` : `<p class="muted" style="margin:0">Nenhuma mudança em relação a ${mLabel(pm).toLowerCase()}.</p>`;
    }

    const pendBlock = (t, list) => list.length ? `<li><div class="t">${t} (${list.length})</div><div class="chipline">${list.map(c=>`<button class="mini" data-edit="${esc(c.id)}">${esc(c.nome)}</button>`).join("")}</div></li>` : "";
    const html = pendBlock("Fee mensal sem conteúdos definidos", feeZero) + pendBlock("Sem social media", semSm) + pendBlock("Sem cidade", semLocal) + pendBlock("Sem atendimento", semAt);
    $("#pend").innerHTML = html ? `<ul>${html}</ul>` : `<p class="muted" style="margin:0">Tudo em dia. Nenhuma pendência nos clientes ativos.</p>`;

    const bars = (el, obj) => { const e = Object.entries(obj).sort((a,b)=>(a[0]==="Sem cidade")-(b[0]==="Sem cidade")||b[1]-a[1]); const m = Math.max(1,...e.map(x=>x[1]));
      el.innerHTML = e.map(([k,v])=>`<div class="bar"><span>${esc(k)}</span><div class="track"><div class="fill" style="width:${v/m*100}%"></div></div><span class="n">${v}</span></div>`).join("") || `<p class="muted">Sem dados.</p>`; };
    const byTipo = {}; A.forEach(c => byTipo[c.tipo||"Sem tipo"] = (byTipo[c.tipo||"Sem tipo"]||0)+1);
    bars($("#byTipo"), byTipo);
    const loc = {}; A.forEach(c => { const k = place(c) || "Sem cidade"; loc[k]=(loc[k]||0)+1; });
    bars($("#byLocal"), loc);
  }

  function filtered(){
    const q = $("#q").value.trim().toLowerCase();
    const fn = $("#fNivel").value, fa=$("#fAt").value, fs=$("#fSm").value, ft=$("#fTipo").value, st=$("#fStatus").value, fo=$("#fOff").value;
    return clients.filter(c =>
      (!q || (c.nome||"").toLowerCase().includes(q) || place(c).toLowerCase().includes(q)) &&
      (!fn || c.nivel===fn) && (!fa || c.atendimento===fa) && (!fs || c.social===fs) && (!ft || c.tipo===ft) &&
      (!fo || (fo==="1" ? !!c.materialOff : !c.materialOff)) &&
      (!st || (st==="retirado" ? c.status==="retirado" : c.status!=="retirado"))
    ).sort((a,b)=>(a.nivel||"Z").localeCompare(b.nivel||"Z") || (a.nome||"").localeCompare(b.nome||"","pt"));
  }
  function inlineSelect(c, field, list){
    if (!unlocked) return esc(c[field]||"—");
    const opts = [...new Set([...list, c[field]].filter(Boolean))];
    return `<select data-inline="${field}" data-id="${esc(c.id)}" aria-label="${field==="social"?"Social media":"Atendimento"} de ${esc(c.nome)}">
      <option value="">—</option>${opts.map(o=>`<option ${o===c[field]?"selected":""}>${esc(o)}</option>`).join("")}</select>`;
  }
  function renderRows(){
    const list = filtered();
    const ats = people("atendimentos","atendimento"), sms = people("socials","social");
    $("#rows").innerHTML = list.map(c => {
      const out = c.status==="retirado";
      return `<tr class="${out?"out":""}">
        <td><span class="lv ${esc(c.nivel)}">${esc(c.nivel||"?")}</span></td>
        <td class="name"><span class="nm">${esc(c.nome)}</span>${c.obs?`<div class="muted" style="font-weight:400;font-size:12px">${esc(c.obs)}</div>`:""}${out&&c.motivo?`<div style="font-weight:400;font-size:12px">Saiu: ${esc(c.motivo)}</div>`:""}</td>
        <td>${out?esc(c.atendimento||"—"):inlineSelect(c,"atendimento",ats)}</td>
        <td>${out?esc(c.social||"—"):inlineSelect(c,"social",sms)}</td>
        <td><span class="tag ${tipoClass(c.tipo||"")}">${esc(c.tipo||"—")}</span></td>
        <td class="num">${num(c.conteudos)||""}</td><td class="num">${num(c.motions)||""}</td>
        <td class="num"><b>${total(c)}</b></td><td class="num">${num(c.gravacao)}</td>
        <td>${c.materialOff?'<span class="tag off">Tem direito</span>':'<span class="muted">Não</span>'}</td>
        <td>${c.cidade?esc(place(c)):'<span class="none">Sem cidade</span>'}</td>
        <td><div class="actions">
          <button class="btn small" data-edit="${esc(c.id)}">Editar</button>
          ${out?`<button class="btn small" data-back="${esc(c.id)}">Reativar</button>`:`<button class="btn small danger" data-out="${esc(c.id)}">Retirar</button>`}
        </div></td></tr>`; }).join("") || `<tr><td colspan="12" class="empty">${clients.length?"Nenhum cliente com esses filtros.":"Nenhum cliente nesta carteira. Use “Adicionar cliente” para começar."}</td></tr>`;
    const s = f => list.reduce((a,c)=>a+f(c),0);
    $("#foot").innerHTML = list.length ? `<tr><td></td><td>${list.length} cliente${list.length===1?"":"s"}</td><td></td><td></td><td></td>
      <td class="num">${s(c=>num(c.conteudos))}</td><td class="num">${s(c=>num(c.motions))}</td><td class="num">${s(total)}</td><td class="num">${s(c=>num(c.gravacao))}</td><td>${list.filter(c=>c.materialOff).length} com off</td><td></td><td></td></tr>` : "";
  }
  function renderTeam(){
    const A = active();
    // Liga a equipe (nomes em config/geral) aos acessos (tabela de usuários), sem misturar os dados.
    const normN = x => String(x||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toUpperCase().trim();
    const acesso = n => { const k = normN(n); let ativos = []; try { ativos = usrList || []; } catch { ativos = []; }
      return ativos.find(u => normN(u.nome) === k) || (ativos.filter(u => normN(u.nome).split(" ")[0] === k).length === 1 ? ativos.find(u => normN(u.nome).split(" ")[0] === k) : null); };
    const podeUsers = !!document.querySelector('nav.tabs button[data-tab="users"]:not([hidden])');
    const tagAcesso = (n, perfil) => { if (!podeUsers) return ""; const u = acesso(n);
      return u ? `<span class="tag fee" title="${esc(u.login)}">Usuário: ${esc((() => { try { return PERFIS[u.funcao]; } catch { return ""; } })() || u.funcao)}${u.ativo ? "" : " (bloqueado)"}</span>`
        : `<button class="btn small" type="button" data-criaracesso="${esc(n)}" data-perfil="${perfil}">Sem usuário · criar acesso</button>`; };
    const block = (key, field) => people(key, field).map(n => {
      const cs = A.filter(c=>c[field]===n);
      return `<div class="person"><div><div style="font-weight:600">${esc(n)} ${tagAcesso(n, field === "social" ? "social" : "atendimento")}</div><div class="meta">${cs.length} cliente${cs.length===1?"":"s"}, ${cs.reduce((s,c)=>s+total(c),0)} conteúdos, ${cs.reduce((s,c)=>s+num(c.gravacao),0)} gravações</div></div>
        <button class="x lockable" title="Remover ${esc(n)} da lista" aria-label="Remover ${esc(n)}" data-rm="${key}" data-name="${esc(n)}">×</button></div>`; }).join("") || `<p class="muted">Ninguém na lista.</p>`;
    $("#listAt").innerHTML = block("atendimentos","atendimento");
    $("#listSm").innerHTML = block("socials","social");
    $("#monthsList").innerHTML = months.length ? months.slice().reverse().map(m=>`<div class="person"><div><b>${mLabel(m)}</b>${m===cur?'<div class="meta">Selecionada</div>':""}</div>
      <button class="btn small danger lockable" data-delmonth="${m}">Excluir</button></div>`).join("") : `<p class="muted">Nenhuma carteira criada.</p>`;
    $("#teamLock").hidden = unlocked;
    document.querySelectorAll(".lockable").forEach(el => el.hidden = !unlocked);
    ["#cfgCoord","#cfgTipos"].forEach(s => $(s).readOnly = !unlocked);
    if (!document.activeElement?.id?.startsWith("cfg")) { $("#cfgCoord").value = cfg.coordenacao||""; $("#cfgTipos").value = (cfg.tipos||[]).join(", "); }
  }

