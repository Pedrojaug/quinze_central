  // ---------- Escrita ----------
  const colRef = ym => db.collection("meses/"+ym+"/clientes");
  function friendly(e){ return e?.code==="quota_exceeded" ? "Limite de registros atingido. Exclua carteiras antigas." : e?.code==="invalid_argument" ? "Você não tem permissão para editar." : "Não deu para salvar. Tente de novo."; }
  async function save(id, data){
    if (!db || !cur) { toast("Sem conexão com o banco de dados."); return false; }
    try { await colRef(cur).doc(id).set({...data, atualizadoEm:new Date().toISOString()}); return true; }
    catch(e){ toast(friendly(e)); return false; }
  }
  const strip = c => { const {id, ...rest} = c; return rest; };
  async function saveCfg(next, msg){
    if (!db) return;
    try { await db.doc("config/geral").set(next); cfg = next; renderAll(); toast(msg||"Ajustes salvos"); }
    catch { toast("Não deu para salvar os ajustes."); }
  }

  document.addEventListener("change", async e => {
    const s = e.target.closest("select[data-inline]"); if (!s) return;
    const c = clients.find(x=>x.id===s.dataset.id); if (!c) return;
    if (await save(c.id, {...strip(c), [s.dataset.inline]: s.value})) toast("Responsável alterado");
  });

  document.addEventListener("click", async e => {
    const ed = e.target.closest("[data-edit]"); if (ed) return openEdit(ed.dataset.edit);
    if (e.target.closest("[data-open-newmonth]")) return openNewMonth();
    const o = e.target.closest("[data-out]"); if (o) { outId=o.dataset.out; const c=clients.find(x=>x.id===outId); $("#outTitle").textContent="Retirar "+(c?.nome||"cliente"); $("#o_motivo").value=""; $("#dlgOut").showModal(); return; }
    const b = e.target.closest("[data-back]"); if (b) {
      const c = clients.find(x=>x.id===b.dataset.back); if (!c) return;
      if (await save(c.id, {...strip(c), status:"ativo", motivo:""})) toast("Cliente reativado");
      return;
    }
    const rm = e.target.closest("[data-rm]"); if (rm) {
      const key = rm.dataset.rm, n = rm.dataset.name, field = key==="socials"?"social":"atendimento";
      const busy = active().filter(c=>c[field]===n).length;
      if (busy && !confirm(`${n} ainda tem ${busy} cliente(s) ativo(s) neste mês. Remover da lista mesmo assim? Os clientes continuam com esse nome até você trocar.`)) return;
      saveCfg({...cfg, [key]: (cfg[key]||[]).filter(x=>x!==n)}, n+" removido da lista"); return;
    }
    const add = e.target.closest("[data-add]"); if (add) {
      const key = add.dataset.add, inp = key==="socials"?$("#newSm"):$("#newAt"); const n = inp.value.trim().toUpperCase(); if (!n) return;
      if ((cfg[key]||[]).includes(n)) { toast("Esse nome já está na lista"); return; }
      inp.value=""; saveCfg({...cfg, [key]: [...(cfg[key]||[]), n]}, n+" adicionado"); return;
    }
    const dm = e.target.closest("[data-delmonth]"); if (dm) return deleteMonth(dm.dataset.delmonth);
  });

  $("#saveCfg").addEventListener("click", () => saveCfg({...cfg, coordenacao:$("#cfgCoord").value.trim(), tipos:$("#cfgTipos").value.split(",").map(s=>s.trim().toUpperCase()).filter(Boolean)}));
  ["#q","#fNivel","#fAt","#fSm","#fTipo","#fOff","#fStatus"].forEach(s => $(s).addEventListener("input", renderRows));

  // Modal cliente
  $("#i_uf").innerHTML = UFS.map(u=>`<option>${u}</option>`).join("");
  function calcTotal(){ $("#i_total").textContent = num($("#i_cont").value)+num($("#i_mot").value); }
  ["#i_cont","#i_mot"].forEach(s=>$(s).addEventListener("input", calcTotal));
  $("#i_cidade").addEventListener("change", () => {
    const v = titleCity($("#i_cidade").value); $("#i_cidade").value = v;
    const known = [...clients,...prevClients].find(c => c.cidade === v && c.uf); if (known) $("#i_uf").value = known.uf;
  });
  function openEdit(id){
    if (!cur) return;
    const c = id ? clients.find(x=>x.id===id) : null; editingId = c ? c.id : null;
    $("#dlgTitle").textContent = c ? "Editar cliente" : "Adicionar cliente";
    $("#dlgCliMonth").textContent = "Carteira de " + mLabel(cur).toLowerCase();
    $("#btnSave").textContent = c ? "Salvar alterações" : "Adicionar cliente";
    $("#btnDel").hidden = !c;
    fillSelect($("#i_at"), people("atendimentos","atendimento"), "Sem atendimento", c?.atendimento||"");
    fillSelect($("#i_sm"), people("socials","social"), "Sem social media", c?.social||"");
    const tipos = [...new Set([...(cfg.tipos||[]), c?.tipo].filter(Boolean))];
    fillSelect($("#i_tipo"), tipos, null, c?.tipo || tipos[0] || "");
    $("#i_nome").value=c?.nome||""; $("#i_nivel").value=c?.nivel||"C";
    $("#i_cont").value=num(c?.conteudos)||""; $("#i_mot").value=num(c?.motions)||""; $("#i_grav").value=String(num(c?.gravacao));
    $("#i_off").value = c?.materialOff ? "1" : "0"; $("#i_cidade").value=c?.cidade||""; $("#i_uf").value=c?.uf||"RN"; $("#i_obs").value=c?.obs||""; calcTotal();
    $("#dlg").showModal(); setTimeout(()=>$("#i_nome").focus(),30);
  }
  $("#btnNew").addEventListener("click", ()=>openEdit(null));
  $("#btnCancel").addEventListener("click", ()=>$("#dlg").close());
  $("#outCancel").addEventListener("click", ()=>$("#dlgOut").close());
  const slug = s => (s.normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,40) || "cliente") + "-" + Math.random().toString(36).slice(2,6);

  $("#frm").addEventListener("submit", async e => {
    e.preventDefault();
    const nome = $("#i_nome").value.trim().toUpperCase(); if (!nome) return;
    const prev = editingId ? clients.find(x=>x.id===editingId) : null;
    const cidade = titleCity($("#i_cidade").value);
    const data = { ...(prev?strip(prev):{}), nome, nivel:$("#i_nivel").value, tipo:$("#i_tipo").value, atendimento:$("#i_at").value, social:$("#i_sm").value,
      conteudos:num($("#i_cont").value), motions:num($("#i_mot").value), gravacao:num($("#i_grav").value),
      cidade, uf: cidade ? $("#i_uf").value : "", materialOff: $("#i_off").value === "1", obs:$("#i_obs").value.trim(), status: prev?.status || "ativo" };
    if (await save(editingId || slug(nome), data)) { $("#dlg").close(); toast(prev ? "Alterações salvas" : "Cliente adicionado"); }
  });
  $("#btnDel").addEventListener("click", async () => {
    const c = clients.find(x=>x.id===editingId); if (!c || !db) return;
    if (!confirm(`Excluir ${c.nome} da carteira de ${mLabel(cur).toLowerCase()}? Os outros meses não mudam. Para marcar a saída do cliente, use “Retirar”.`)) return;
    try { await colRef(cur).doc(c.id).delete(); $("#dlg").close(); toast("Cliente excluído deste mês"); } catch { toast("Não deu para excluir."); }
  });
  $("#frmOut").addEventListener("submit", async e => {
    e.preventDefault();
    const c = clients.find(x=>x.id===outId); if (!c) return;
    if (await save(c.id, {...strip(c), status:"retirado", motivo:$("#o_motivo").value.trim()})) { $("#dlgOut").close(); toast("Cliente retirado"); }
  });

  // ---------- Meses ----------
  function nextYm(ym){ let [y,m]=ym.split("-").map(Number); m++; if(m>12){m=1;y++;} return `${y}-${String(m).padStart(2,"0")}`; }
  function openNewMonth(){
    if (!db) return;
    const last = months[months.length-1];
    const now = new Date(); const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
    $("#nm_month").value = last ? nextYm(last) : today;
    $("#nm_err").textContent = "";
    $("#nm_opts").hidden = !cur;
    $("#nm_copyLbl").textContent = cur ? `Copiar a carteira de ${mLabel(cur).toLowerCase()}` : "Copiar a carteira atual";
    document.querySelector('input[name="nm_src"][value="'+(cur?"copy":"blank")+'"]').checked = true;
    $("#dlgMonth").showModal();
  }
  $("#btnNewMonth").addEventListener("click", openNewMonth);
  $("#nmCancel").addEventListener("click", ()=>$("#dlgMonth").close());
  $("#frmMonth").addEventListener("submit", async e => {
    e.preventDefault();
    const ym = $("#nm_month").value; if (!/^\d{4}-\d{2}$/.test(ym)) return;
    if (months.includes(ym)) { $("#nm_err").textContent = `Já existe uma carteira de ${mLabel(ym).toLowerCase()}. Selecione no topo para editar.`; return; }
    const copy = cur && document.querySelector('input[name="nm_src"]:checked').value === "copy";
    const src = copy ? active() : [];
    const btn = $("#nmSave"); btn.disabled = true;
    try {
      await db.doc("meses/"+ym).set({criadoEm:new Date().toISOString(), copiadoDe: copy ? cur : ""});
      for (let i=0;i<src.length;i+=5){
        btn.textContent = `Copiando ${Math.min(i+5,src.length)} de ${src.length}…`;
        await Promise.all(src.slice(i,i+5).map(c => colRef(ym).doc(c.id).set({...strip(c), status:"ativo", motivo:"", atualizadoEm:new Date().toISOString()})));
      }
      $("#dlgMonth").close(); selectMonth(ym); toast(`Carteira de ${mLabel(ym).toLowerCase()} criada`);
    } catch(err){ $("#nm_err").textContent = friendly(err); }
    finally { btn.disabled = false; btn.textContent = "Criar carteira"; }
  });
  async function deleteMonth(ym){
    if (!confirm(`Excluir a carteira de ${mLabel(ym).toLowerCase()} com todos os clientes dela? Isso não pode ser desfeito. Os outros meses não mudam.`)) return;
    try {
      const snap = await colRef(ym).get();
      for (let i=0;i<snap.docs.length;i+=5) await Promise.all(snap.docs.slice(i,i+5).map(d=>colRef(ym).doc(d.id).delete()));
      await db.doc("meses/"+ym).delete();
      toast("Carteira excluída");
    } catch { toast("Não deu para excluir a carteira."); }
  }

  function selectMonth(ym){
    cur = ym || null;
    try { localStorage.setItem("carteira-mes", cur||""); } catch {}
    if (unsubCur) { unsubCur(); unsubCur = null; }
    if (unsubPrev) { unsubPrev(); unsubPrev = null; }
    clients = []; prevClients = [];
    renderAll();
    if (!db || !cur) return;
    unsubCur = colRef(cur).onSnapshot(s => { clients = s.docs.map(d=>({id:d.id, ...d.data()})); renderAll(); }, onLost);
    const pm = prevMonth();
    if (pm) unsubPrev = colRef(pm).onSnapshot(s => { prevClients = s.docs.map(d=>({id:d.id, ...d.data()})); renderAll(); }, ()=>{});
  }
  $("#monthSel").addEventListener("change", e => selectMonth(e.target.value));
  $("#prevM").addEventListener("click", () => { const i=months.indexOf(cur); if (i>0) selectMonth(months[i-1]); });
  $("#nextM").addEventListener("click", () => { const i=months.indexOf(cur); if (i>=0 && i<months.length-1) selectMonth(months[i+1]); });
  function onLost(){ $("#syncDot").classList.remove("on"); $("#syncTxt").textContent="Conexão perdida, recarregue a página"; }

  // ---------- Andamento de produção ----------
  function renderClickUp(){
    const url = (cfg.clickup || CK_DEFAULT);
    $("#ckUrlTxt").textContent = url;
    $("#ckOpen").href = url;
    if (document.activeElement !== $("#ckUrl")) $("#ckUrl").value = url;
  }
  $("#ckSave").addEventListener("click", () => {
    const u = $("#ckUrl").value.trim();
    if (u && !/^https?:\/\//i.test(u)) { toast("O link precisa começar com https://"); return; }
    saveCfg({...cfg, clickup: u || CK_DEFAULT}, "Link salvo");
  });

  // ---------- Dados consolidados de produção ----------
  const pctFmt = v => v==null ? "" : v.toLocaleString("pt-BR",{maximumFractionDigits:2}) + "%";
  const parsePct = s => { const v = parseFloat(String(s).replace("%","").replace(",",".").trim()); return Number.isFinite(v) && v>=0 ? Math.min(v,100) : null; };
  const parseInt0 = s => { const v = parseInt(String(s).replace(/\D/g,""),10); return Number.isFinite(v) ? v : null; };
  const pctCls = v => v==null ? "" : v>=95 ? "g" : v>=90 ? "a" : "r";
  const barCls = v => v==null ? "" : v>=95 ? "gr" : v>=90 ? "am" : "rd";

  function renderProd(){
    const sel = $("#prodYear");
    const years = [...new Set([...prodYears, prodYear])].sort();
    sel.innerHTML = years.map(y=>`<option value="${y}">${y}</option>`).join("");
    sel.value = prodYear;
    const meses = prod.meses || {};
    const rows = MESES.map((nome,i) => { const mm = String(i+1).padStart(2,"0"); const d = meses[mm] || {}; return {i, mm, nome, prod: d.prod ?? null, tarefas: d.tarefas ?? null}; });
    const done = rows.filter(r => r.prod != null || r.tarefas != null);
    const withPct = rows.filter(r => r.prod != null);
    const tarefas = rows.reduce((s,r)=>s+(r.tarefas||0),0);
    const media = withPct.length ? withPct.reduce((s,r)=>s+r.prod,0)/withPct.length : null;
    const melhor = withPct.slice().sort((a,b)=>b.prod-a.prod)[0];
    const pend = 12 - done.length;
    $("#prodKpis").innerHTML = [
      [media==null?"—":pctFmt(Math.round(media*100)/100), "Produção média do ano"],
      [tarefas.toLocaleString("pt-BR"), "Total de tarefas no ano"],
      [done.length, "Meses preenchidos"],
      [melhor ? melhor.nome.charAt(0).toUpperCase()+melhor.nome.slice(1) : "—", "Melhor mês"],
      [done.length ? Math.round(tarefas/done.length).toLocaleString("pt-BR") : "—", "Média de tarefas por mês"],
      [pend, "Meses a preencher", pend>0],
    ].map(([v,l,al])=>`<div class="kpi${al?" alert":""}"><b style="font-size:${String(v).length>6?"20px":"30px"}">${esc(v)}</b><span>${l}</span></div>`).join("");

    const maxT = Math.max(1, ...rows.map(r=>r.tarefas||0));
    const now = new Date(); const curYm = prodYear == now.getFullYear() ? now.getMonth() : 99;
    $("#prodTable").innerHTML = `<thead><tr><th>Mês</th><th>Produção</th><th class="barcell">Desempenho</th><th>Total de tarefas</th><th class="barcell">Volume</th></tr></thead><tbody>` +
      rows.map(r => `<tr class="${r.i===curYm?"now":""}" data-mm="${r.mm}">
        <td class="mes">${r.nome.charAt(0).toUpperCase()+r.nome.slice(1)}</td>
        <td>${unlocked ? `<input data-prod="${r.mm}" value="${r.prod==null?"":pctFmt(r.prod)}" placeholder="—" aria-label="Produção de ${r.nome}">`
            : (r.prod==null ? `<span class="vazio">a preencher</span>` : `<span class="pct ${pctCls(r.prod)}">${pctFmt(r.prod)}</span>`)}</td>
        <td class="barcell">${r.prod==null?"":`<div class="pbar ${barCls(r.prod)}"><i style="width:${r.prod}%"></i></div>`}</td>
        <td>${unlocked ? `<input data-tar="${r.mm}" value="${r.tarefas==null?"":r.tarefas}" inputmode="numeric" placeholder="—" aria-label="Tarefas de ${r.nome}">`
            : (r.tarefas==null ? `<span class="vazio">a preencher</span>` : r.tarefas.toLocaleString("pt-BR"))}</td>
        <td class="barcell">${r.tarefas==null?"":`<div class="pbar"><i style="width:${(r.tarefas/maxT*100).toFixed(1)}%"></i></div>`}</td>
      </tr>`).join("") +
      `</tbody><tfoot><tr><td>Ano</td><td>${media==null?"—":pctFmt(Math.round(media*100)/100)}</td><td></td><td>${tarefas.toLocaleString("pt-BR")}</td><td></td></tr></tfoot>`;

    const prevIdx = (now.getMonth()+11)%12, prevYear = now.getMonth()===0 ? now.getFullYear()-1 : now.getFullYear();
    const falta = String(prevYear)===prodYear && !done.some(r=>r.i===prevIdx);
    $("#prodHint").textContent = falta ? `Falta preencher ${MESES[prevIdx]}.` : "";
    $("#prodNote").textContent = unlocked ? "Digite a produção (ex.: 97,13) e o total de tarefas do mês. O app salva ao sair do campo. Estes números não mudam conforme a carteira selecionada." : "Desbloqueie a edição no topo para preencher os meses.";
  }

  async function saveProd(mm, patch){
    if (!db) return;
    const meses = {...(prod.meses||{})};
    meses[mm] = {...(meses[mm]||{}), ...patch};
    try { await db.doc("producao/"+prodYear).set({meses}); toast("Produção salva"); }
    catch(e){ toast(friendly(e)); }
  }
  document.addEventListener("change", e => {
    const p = e.target.closest("input[data-prod]"); if (p) return saveProd(p.dataset.prod, {prod: parsePct(p.value)});
    const t = e.target.closest("input[data-tar]"); if (t) return saveProd(t.dataset.tar, {tarefas: parseInt0(t.value)});
  });
  $("#prodYear").addEventListener("change", e => selectProdYear(e.target.value));
  $("#btnNewYear").addEventListener("click", () => {
    const y = prompt("Ano da nova planilha de produção:", String(Number(prodYear)+1));
    if (!y || !/^\d{4}$/.test(y.trim())) return;
    selectProdYear(y.trim());
  });
  function selectProdYear(y){
    prodYear = String(y); prod = {};
    if (unsubProd) { unsubProd(); unsubProd = null; }
    renderProd();
    if (!db) return;
    unsubProd = db.doc("producao/"+prodYear).onSnapshot(s => { prod = s.exists ? s.data() : {}; renderProd(); }, ()=>{});
  }

  // Senha
  document.getElementById("frmPwd").addEventListener("submit", async e => {
    e.preventDefault();
    const ok = (await sha256(document.getElementById("pwdIn").value.trim())) === PASS_HASH;
    if (!ok) { document.getElementById("pwdErr").textContent = "Senha incorreta. Tente de novo."; document.getElementById("pwdIn").select(); return; }
    unlocked = true; try { sessionStorage.setItem("carteira-edit","1"); } catch {}
    document.getElementById("dlgPwd").close(); renderLock(); renderAll(); toast("Edição liberada");
    const el = pendingEl; pendingEl = null;
    if (el && document.contains(el)) setTimeout(()=>el.click(), 0);
  });
  document.getElementById("pwdCancel").addEventListener("click", ()=>{ pendingEl=null; document.getElementById("dlgPwd").close(); });
  document.getElementById("lockBtn").addEventListener("click", () => {
    if (!unlocked) return askPassword(null);
    unlocked = false; try { sessionStorage.removeItem("carteira-edit"); } catch {}
    renderLock(); renderAll(); toast("Edição bloqueada");
  });
  document.getElementById("teamUnlock").addEventListener("click", ()=>askPassword(null));
  renderLock();

  // Copiar para WhatsApp
  function whatsText(){
    const list = filtered(), A = list.filter(isOn);
    const sum = (arr,f) => arr.reduce((s,c)=>s+f(c),0);
    const filtros = [];
    if ($("#q").value.trim()) filtros.push("busca: "+$("#q").value.trim());
    if ($("#fNivel").value) filtros.push("nível "+$("#fNivel").value);
    if ($("#fAt").value) filtros.push("atendimento: "+$("#fAt").value);
    if ($("#fSm").value) filtros.push("social media: "+$("#fSm").value);
    if ($("#fTipo").value) filtros.push("tipo: "+$("#fTipo").value);
    if ($("#fOff").value) filtros.push($("#fOff").value==="1" ? "com material off" : "sem material off");
    if ($("#fStatus").value === "retirado") filtros.push("somente retirados");
    if ($("#fStatus").value === "") filtros.push("ativos e retirados");
    const L = [];
    L.push(`*CARTEIRA DE CLIENTES — ${mLabel(cur).toUpperCase()}*`);
    L.push(`${list.length} cliente${list.length===1?"":"s"} · ${sum(list,total)} conteúdos · ${sum(list,c=>num(c.gravacao))} gravações`);
    if (filtros.length) L.push(`_Filtros: ${filtros.join(", ")}_`);
    L.push("");
    const g = {};
    list.forEach(c => { const k = c.social || "Sem social media"; (g[k] ||= []).push(c); });
    Object.entries(g).sort((a,b)=> (a[0]==="Sem social media")-(b[0]==="Sem social media") || sum(b[1],total)-sum(a[1],total))
      .forEach(([k,cs]) => {
        L.push(`*${k}* — ${cs.length} cliente${cs.length===1?"":"s"}, ${sum(cs,total)} conteúdos, ${sum(cs,c=>num(c.gravacao))} gravações`);
        cs.sort((a,b)=>(a.nivel||"Z").localeCompare(b.nivel||"Z")||total(b)-total(a)).forEach(c => {
          const det = [`${total(c)} conteúdos`, `${num(c.gravacao)} gravações`];
          if (c.atendimento) det.push("at. "+c.atendimento);
          if (c.materialOff) det.push("material off");
          if (c.cidade) det.push(place(c));
          L.push(`• (${c.nivel||"?"}) ${c.nome}${isOn(c)?"":" [retirado]"} — ${det.join(" · ")}`);
        });
        L.push("");
      });
    return L.join("\n").trim();
  }
  $("#btnCopy").addEventListener("click", async () => {
    if (!cur) return;
    const txt = whatsText();
    try {
      await navigator.clipboard.writeText(txt);
      toast("Carteira copiada, é só colar no WhatsApp");
      return;
    } catch {}
    const ta = $("#copyTxt"); ta.value = txt; $("#dlgCopy").showModal(); ta.focus(); ta.select();
    try { if (document.execCommand("copy")) toast("Carteira copiada, é só colar no WhatsApp"); } catch {}
  });
  $("#copySelect").addEventListener("click", () => { const ta=$("#copyTxt"); ta.focus(); ta.select(); try { document.execCommand("copy"); toast("Copiado"); } catch {} });

  // PDF
  function loadScript(src){ return new Promise((res,rej)=>{ const s=document.createElement("script"); s.src=src; s.onload=res; s.onerror=()=>rej(new Error("load")); document.head.appendChild(s); }); }
  async function ensurePdf(){
    if (!window.jspdf?.jsPDF) await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
    if (!window.jspdf?.jsPDF?.API?.autoTable) await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js");
    return window.jspdf.jsPDF;
  }
  $("#btnPdf").addEventListener("click", async () => {
    if (!cur) return;
    const btn = $("#btnPdf"); btn.disabled = true; const label = btn.textContent; btn.textContent = "Gerando…";
    try {
      const JsPDF = await ensurePdf();
      const doc = new JsPDF({orientation:"landscape", unit:"pt", format:"a4"});
      const W = doc.internal.pageSize.getWidth();
      const list = filtered(), A = list.filter(isOn);
      const sum = (arr,f) => arr.reduce((s,c)=>s+f(c),0);
      const logo = document.querySelector(".brand img");
      try { doc.addImage(logo.src, "PNG", 40, 28, 92, 92*logo.naturalHeight/logo.naturalWidth); } catch {}
      doc.setFont("helvetica","bold").setFontSize(16).setTextColor(20,28,44);
      doc.text("Carteira de clientes", 150, 48);
      doc.setFont("helvetica","normal").setFontSize(10).setTextColor(88,98,117);
      doc.text(mLabel(cur) + (cfg.coordenacao ? "   |   Coordenação: " + cfg.coordenacao : ""), 150, 64);
      doc.text(`${A.length} clientes ativos   |   ${sum(A,total)} conteúdos   |   ${sum(A,c=>num(c.gravacao))} gravações`, 150, 78);

      doc.autoTable({
        startY: 100, theme: "grid", margin: {left:40, right:40},
        head: [["Nível","Cliente","Atendimento","Social media","Tipo","Conteúdos","Motions","Total","Gravações","Material off","Cidade","Situação"]],
        body: list.map(c => [c.nivel||"", c.nome||"", c.atendimento||"—", c.social||"—", c.tipo||"—",
          num(c.conteudos), num(c.motions), total(c), num(c.gravacao), c.materialOff ? "Sim" : "—", place(c) || "—", isOn(c) ? "Ativo" : "Retirado"]),
        foot: [["", `${list.length} clientes`, "", "", "", sum(list,c=>num(c.conteudos)), sum(list,c=>num(c.motions)), sum(list,total), sum(list,c=>num(c.gravacao)), `${list.filter(c=>c.materialOff).length} com off`, "", ""]],
        styles: {font:"helvetica", fontSize:8.5, cellPadding:4, textColor:[20,28,44], lineColor:[223,228,236]},
        headStyles: {fillColor:[6,96,255], textColor:255, fontStyle:"bold"},
        footStyles: {fillColor:[245,247,250], textColor:[20,28,44], fontStyle:"bold"},
        columnStyles: {0:{halign:"center",cellWidth:34}, 5:{halign:"right"},6:{halign:"right"},7:{halign:"right",fontStyle:"bold"},8:{halign:"right"}},
        didParseCell: d => { if (d.section==="body" && d.row.raw[11]==="Retirado") d.cell.styles.textColor = [150,158,170]; }
      });

      const by = (field, label) => {
        const g = {}; A.forEach(c => { const k = c[field] || "Sem "+label.toLowerCase(); (g[k] ||= []).push(c); });
        return Object.entries(g).sort((a,b)=>sum(b[1],total)-sum(a[1],total))
          .map(([k,cs]) => [k, cs.length, sum(cs,total), sum(cs,c=>num(c.gravacao))]);
      };
      let y = doc.lastAutoTable.finalY + 24;
      if (y > doc.internal.pageSize.getHeight() - 140) { doc.addPage(); y = 40; }
      const half = (W - 80 - 20) / 2;
      doc.autoTable({ startY:y, margin:{left:40}, tableWidth:half, theme:"grid",
        head:[["Social media","Clientes","Conteúdos","Gravações"]], body: by("social","Social media"),
        styles:{font:"helvetica",fontSize:8.5,cellPadding:4,lineColor:[223,228,236]},
        headStyles:{fillColor:[20,28,44],textColor:255}, columnStyles:{1:{halign:"right"},2:{halign:"right"},3:{halign:"right"}} });
      doc.autoTable({ startY:y, margin:{left:40+half+20}, tableWidth:half, theme:"grid",
        head:[["Atendimento","Clientes","Conteúdos","Gravações"]], body: by("atendimento","Atendimento"),
        styles:{font:"helvetica",fontSize:8.5,cellPadding:4,lineColor:[223,228,236]},
        headStyles:{fillColor:[20,28,44],textColor:255}, columnStyles:{1:{halign:"right"},2:{halign:"right"},3:{halign:"right"}} });

      const pages = doc.internal.getNumberOfPages();
      const hoje = new Date().toLocaleDateString("pt-BR");
      for (let i=1;i<=pages;i++){
        doc.setPage(i); doc.setFont("helvetica","normal").setFontSize(8).setTextColor(140,148,160);
        doc.text(`Quinze · Carteira de ${mLabel(cur).toLowerCase()} · gerado em ${hoje}`, 40, doc.internal.pageSize.getHeight()-20);
        doc.text(`Página ${i} de ${pages}`, W-40, doc.internal.pageSize.getHeight()-20, {align:"right"});
      }

      const dl = await claude.use("downloads");
      if (!dl) { toast("Download indisponível nesta visualização."); return; }
      await dl.save({filename:`carteira-${cur}.pdf`, data: doc.output("blob")});
    } catch(e){ toast(e?.code==="declined" ? "Download cancelado." : "Não deu para gerar o PDF. Tente de novo."); }
    finally { btn.disabled = false; btn.textContent = label; }
  });

  // CSV
  $("#btnCsv").addEventListener("click", async () => {
    const head = ["MÊS","NÍVEL","CLIENTE","ATENDIMENTO","SOCIAL MEDIA","TIPO","CONTEÚDOS","MOTIONS","TOTAL DE CONTEÚDOS","TOTAL DE GRAVAÇÕES","MATERIAL OFF","CIDADE","UF","SITUAÇÃO","OBSERVAÇÕES"];
    const q = v => `"${String(v??"").replace(/"/g,'""')}"`;
    const lines = [head.join(";"), ...filtered().map(c=>[mLabel(cur),c.nivel,c.nome,c.atendimento,c.social,c.tipo,num(c.conteudos),num(c.motions),total(c),num(c.gravacao),c.materialOff?"SIM":"NÃO",c.cidade,c.uf,c.status==="retirado"?"RETIRADO":"ATIVO",c.obs].map(q).join(";"))];
    try {
      const dl = await claude.use("downloads");
      if (!dl) { toast("Download indisponível nesta visualização."); return; }
      await dl.save({filename:`carteira-${cur}.csv`, data:"﻿"+lines.join("\r\n")});
    } catch { toast("Download cancelado."); }
  });

