  // ---------- Agenda ----------
  const AG_COLORS = ["#0660FF","#0E8A7B","#E09A1B","#8A3FFC","#D6336C","#1F3A5F","#2F9E44","#B4541A","#5F6B7A","#0B7285"];
  const IS_SITE = !!window.QZ_SITE;
  let agEvents = [], agFeeds = {}, agCal = null, agLoading = null, agEditing = null, agFilter = "";
  try { agFilter = localStorage.getItem("ag-filtro") || ""; } catch {}
  const agPeople = () => [...new Set([...people("atendimentos","atendimento"), ...agEvents.map(e => e.atendente), ...Object.keys(agFeeds)].filter(Boolean))];
  const agColor = n => AG_COLORS[Math.max(0, agPeople().indexOf(n)) % AG_COLORS.length];
  const localIso = d => `${isoOf(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  async function loadFC(){
    if (!window.FullCalendar) await loadScript("https://cdn.jsdelivr.net/npm/fullcalendar@6.1.15/index.global.min.js");
    if (!(FullCalendar.globalLocales || []).some(l => l.code === "pt-br")) await loadScript("https://cdn.jsdelivr.net/npm/@fullcalendar/core@6.1.15/locales/pt-br.global.min.js");
    if (IS_SITE) {
      if (!window.ICAL) await loadScript("https://cdn.jsdelivr.net/npm/ical.js@1.5.0/build/ical.min.js");
      if (!FullCalendar.ICalendar && !window.__fcIcal) { await loadScript("https://cdn.jsdelivr.net/npm/@fullcalendar/icalendar@6.1.15/index.global.min.js"); window.__fcIcal = true; }
    }
  }
  function agManual(){
    return agEvents.filter(e => !agFilter || e.atendente === agFilter).map(e => ({
      id: e.id, title: `${agFilter ? "" : e.atendente + " · "}${e.titulo}${e.cliente ? " (" + e.cliente + ")" : ""}`,
      start: e.inicio, end: e.fim, color: agColor(e.atendente), extendedProps: {qid: e.id, local: e.local || ""}
    }));
  }
  function agSources(){
    if (!agCal) return;
    agCal.getEventSources().forEach(s => s.remove());
    agCal.addEventSource({id:"manual", events: (info, ok) => ok(agManual())});
    if (IS_SITE) Object.entries(agFeeds).forEach(([nome, url]) => {
      if (!url || (agFilter && agFilter !== nome)) return;
      agCal.addEventSource({id:"ics:" + nome, url: "/api/ics?nome=" + encodeURIComponent(nome), format:"ics", color: agColor(nome), textColor:"#fff", editable:false,
        eventDataTransform: ev => ({...ev, title: (agFilter ? "" : nome + " · ") + (ev.title || "Ocupado"), extendedProps: {...(ev.extendedProps || {}), dono: nome}}),
        failure: () => toast(`Não consegui ler a agenda externa de ${nome}. Confira o link em “Agendas externas”.`)});
    });
  }
  function renderAgLegend(){
    const el = $("#agLegend"); if (!el) return;
    const ps = agPeople();
    el.innerHTML = `<button type="button" data-agf="" aria-pressed="${!agFilter}">Todos</button>` + ps.map(n => `<button type="button" data-agf="${esc(n)}" aria-pressed="${agFilter === n}"><i style="background:${agColor(n)}"></i>${esc(n)}${agFeeds[n] ? " ⟳" : ""}</button>`).join("");
    const nf = Object.values(agFeeds).filter(Boolean).length;
    $("#agNote").textContent = IS_SITE ? (nf ? `${nf} agenda${nf>1?"s":""} externa${nf>1?"s":""} conectada${nf>1?"s":""} (⟳). Reuniões delas só podem ser editadas na agenda de origem.` : "Conecte a agenda de cada atendimento em “Agendas externas” para trazer as reuniões de lá.")
      : "As agendas externas (Google, Outlook e outras) aparecem na versão do site da Quinze. Aqui ficam as reuniões lançadas no app.";
    const dl = $("#agClientes"); if (dl) dl.innerHTML = [...new Set(clients.map(c => c.nome))].map(n => `<option value="${esc(n)}">`).join("");
  }
  async function ensureCal(){
    if (agCal) { agCal.updateSize(); return; }
    if (agLoading) return agLoading;
    agLoading = (async () => {
      try { await loadFC(); } catch { $("#agCal").innerHTML = `<p class="note warn" style="margin:8px">Não consegui carregar o calendário. Verifique a internet e recarregue a página.</p>`; agLoading = null; return; }
      $("#agCal").innerHTML = "";
      agCal = new FullCalendar.Calendar($("#agCal"), {
        locale:"pt-br", initialView: window.innerWidth < 700 ? "timeGridDay" : "timeGridWeek", firstDay:1,
        hiddenDays:[0,6], slotMinTime:"07:00:00", slotMaxTime:"21:00:00", slotDuration:"00:30:00", allDaySlot:true, allDayText:"Dia todo",
        height:"auto", nowIndicator:true, expandRows:true, dayMaxEvents:true,
        headerToolbar:{left:"prev,next today", center:"title", right:"timeGridWeek,timeGridDay,listWeek"},
        buttonText:{today:"Hoje", week:"Semana", day:"Dia", list:"Lista"},
        businessHours:{daysOfWeek:[1,2,3,4,5], startTime:"07:00", endTime:"21:00"},
        selectable:true, selectMirror:true, editable:true,
        select: info => { agCal.unselect(); openAg(null, info.start, info.end); },
        eventClick: info => { info.jsEvent.preventDefault(); const id = info.event.extendedProps.qid; if (id) openAg(id); else toast(`Agenda externa de ${info.event.extendedProps.dono || "atendimento"}. Edite na agenda de origem.`); },
        eventDrop: agMove, eventResize: agMove,
      });
      agCal.render(); agSources();
    })();
    return agLoading;
  }
  async function agMove(info){
    const id = info.event.extendedProps.qid; if (!id || !db) { info.revert(); return; }
    const s = info.event.start, en = info.event.end || new Date(s.getTime() + 30*60000);
    try { await db.collection("agenda").doc(id).update({inicio: localIso(s), fim: localIso(en), atualizadoEm: new Date().toISOString()}); toast("Reunião remarcada"); }
    catch(err) { info.revert(); toast(friendly(err)); }
  }
  function openAg(id, start, end){
    if (!db) { toast("Sem conexão com o banco de dados."); return; }
    const ev = id ? agEvents.find(x => x.id === id) : null; agEditing = ev ? ev.id : null;
    let me = agFilter; try { me = me || localStorage.getItem("ag-eu") || ""; } catch {}
    const ps = agPeople();
    $("#ag_at").innerHTML = `<option value="">Escolha</option>` + ps.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join("") + `<option value="__novo">Outro (novo nome)…</option>`;
    $("#ag_at").value = ev ? ev.atendente : (ps.includes(me) ? me : "");
    $("#ag_atNovo").hidden = true; $("#ag_atNovo").value = "";
    const s = ev ? new Date(ev.inicio) : (start || (() => { const d = new Date(); d.setMinutes(0,0,0); d.setHours(Math.min(20, Math.max(7, d.getHours()+1))); return d; })());
    const en = ev ? new Date(ev.fim) : (end && end - s > 0 && end - s < 12*3600e3 ? end : new Date(s.getTime() + 30*60000));
    $("#ag_titulo").value = ev?.titulo || ""; $("#ag_cli").value = ev?.cliente || ""; $("#ag_local").value = ev?.local || ""; $("#ag_obs").value = ev?.obs || "";
    $("#ag_data").value = isoOf(s); $("#ag_ini").value = `${pad2(s.getHours())}:${pad2(s.getMinutes())}`; $("#ag_fim").value = `${pad2(en.getHours())}:${pad2(en.getMinutes())}`;
    $("#agDlgTitle").textContent = ev ? "Editar reunião" : "Nova reunião";
    $("#agDel").hidden = !ev; $("#agDel").textContent = "Excluir reunião"; $("#agDel").dataset.arm = "";
    $("#ag_err").textContent = "";
    $("#dlgAg").showModal(); setTimeout(() => $("#ag_titulo").focus(), 30);
  }
  $("#ag_at").addEventListener("change", () => { $("#ag_atNovo").hidden = $("#ag_at").value !== "__novo"; if (!$("#ag_atNovo").hidden) $("#ag_atNovo").focus(); });
  $("#agCancel").addEventListener("click", () => $("#dlgAg").close());
  $("#agNew").addEventListener("click", () => openAg(null));
  $("#frmAg").addEventListener("submit", async e => {
    e.preventDefault();
    let at = $("#ag_at").value; if (at === "__novo") at = $("#ag_atNovo").value.trim().toUpperCase();
    const titulo = $("#ag_titulo").value.trim(), d = $("#ag_data").value, hi = $("#ag_ini").value, hf = $("#ag_fim").value;
    if (!at) { $("#ag_err").textContent = "Escolha o atendimento."; return; }
    if (!titulo || !d || !hi || !hf) { $("#ag_err").textContent = "Preencha assunto, data e horários."; return; }
    if (hf <= hi) { $("#ag_err").textContent = "O fim precisa ser depois do início."; return; }
    const wd = dOf(d).getDay(); if (wd === 0 || wd === 6) { $("#ag_err").textContent = "A agenda mostra só de segunda a sexta. Escolha um dia útil."; return; }
    if (hi < "07:00" || hf > "21:00") { $("#ag_err").textContent = "Use horários entre 7h e 21h."; return; }
    const id = agEditing || ("r-" + Date.now().toString(36) + Math.random().toString(36).slice(2,5));
    const prev = agEvents.find(x => x.id === agEditing);
    const data = {atendente: at, titulo, cliente: $("#ag_cli").value.trim(), local: $("#ag_local").value.trim(), obs: $("#ag_obs").value.trim(),
      inicio: `${d}T${hi}`, fim: `${d}T${hf}`, criadoEm: prev?.criadoEm || new Date().toISOString(), atualizadoEm: new Date().toISOString()};
    try {
      await db.collection("agenda").doc(id).set(data);
      try { localStorage.setItem("ag-eu", at); } catch {}
      $("#dlgAg").close(); toast(prev ? "Reunião atualizada" : "Reunião marcada");
    } catch(err) { $("#ag_err").textContent = friendly(err); }
  });
  $("#agDel").addEventListener("click", async () => {
    const b = $("#agDel");
    if (!b.dataset.arm) { b.dataset.arm = "1"; b.textContent = "Confirmar exclusão"; return; }
    try { await db.collection("agenda").doc(agEditing).delete(); $("#dlgAg").close(); toast("Reunião excluída"); } catch(err) { toast(friendly(err)); }
  });
  $("#agFeeds").addEventListener("click", () => {
    if (!db) { toast("Sem conexão com o banco de dados."); return; }
    const ps = [...new Set([...people("atendimentos","atendimento"), ...Object.keys(agFeeds)])];
    $("#feedRows").innerHTML = ps.map(n => `<div><label class="f" for="feed_${esc(n)}">${esc(n)}</label><input id="feed_${esc(n)}" data-feed="${esc(n)}" value="${esc(agFeeds[n] || "")}" placeholder="https://… .ics"></div>`).join("") || `<p class="muted">Cadastre os atendimentos em “Equipe e ajustes” primeiro.</p>`;
    $("#feedNote").textContent = IS_SITE ? "As reuniões das agendas externas aparecem na Agenda e são atualizadas sempre que a página carrega." : "Na versão do Claude as agendas externas não aparecem; os links ficam salvos e passam a funcionar no site da Quinze.";
    $("#dlgFeeds").showModal();
  });
  $("#feedCancel").addEventListener("click", () => $("#dlgFeeds").close());
  $("#frmFeeds").addEventListener("submit", async e => {
    e.preventDefault();
    const feeds = {};
    for (const inp of document.querySelectorAll("#feedRows [data-feed]")) {
      let u = inp.value.trim(); if (!u) continue;
      u = u.replace(/^webcal:\/\//i, "https://");
      if (!/^https:\/\//i.test(u)) { toast(`O link de ${inp.dataset.feed} precisa começar com https:// ou webcal://`); inp.focus(); return; }
      feeds[inp.dataset.feed] = u;
    }
    try { await db.doc("config/agenda").set({feeds, atualizadoEm: new Date().toISOString()}); $("#dlgFeeds").close(); toast("Agendas externas salvas"); }
    catch(err) { toast(friendly(err)); }
  });
  document.addEventListener("click", e => {
    const f = e.target.closest("[data-agf]"); if (!f) return;
    agFilter = f.dataset.agf; try { localStorage.setItem("ag-filtro", agFilter); } catch {}
    renderAgLegend(); agSources();
  });
  document.querySelectorAll("nav.tabs button").forEach(b => b.addEventListener("click", () => {
    if (b.dataset.tab === "agenda") setTimeout(ensureCal, 0);
    if (b.dataset.tab === "prop") { renderPropList(); if (!$("#prMain").innerHTML.trim()) renderPropMain(); }
  }));
  function openTabFromHash(){
    const h = (location.hash || "").slice(1);
    const tb = h && document.querySelector(`nav.tabs button[data-tab="${h}"]`);
    if (tb) tb.click();
  }


