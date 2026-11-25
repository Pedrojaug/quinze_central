  // ---------- Agenda ----------
  const AG_COLORS = ["#0660FF","#0E8A7B","#E09A1B","#8A3FFC","#D6336C","#1F3A5F","#2F9E44","#B4541A","#5F6B7A","#0B7285"];
  const IS_SITE = !!window.QZ_SITE;
  const AG_SLOT_MIN_PADRAO = 4;
  const AG_SLOT_MAX_PADRAO = 23;
  const AG_HORA_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
  let agEvents = [], agFeeds = {}, agCal = null, agLoading = null, agEditing = null, agFilter = "";
  let agSlotMin = `${pad2(AG_SLOT_MIN_PADRAO)}:00:00`, agSlotMax = `${pad2(AG_SLOT_MAX_PADRAO)}:00:00`;
  try { agFilter = localStorage.getItem("ag-filtro") || ""; } catch {}
  function agParseHora(hhmm){
    const m = AG_HORA_RE.exec(String(hhmm || "").trim());
    return m ? { h: Number(m[1]), m: Number(m[2]) } : null;
  }
  function agExtrairMinutosEvento(ev){
    if (!ev || ev.allDay) return null;
    if (ev.start instanceof Date && !Number.isNaN(ev.start.getTime())) {
      const sH = ev.start.getHours(), sM = ev.start.getMinutes();
      let eH = sH, eM = sM;
      if (ev.end instanceof Date && !Number.isNaN(ev.end.getTime())) {
        if (isoOf(ev.end) !== isoOf(ev.start)) {
          if (ev.end.getHours() > 0 || ev.end.getMinutes() > 0) return { sH: 0, sM: 0, eH: 24, eM: 0 };
          eH = 24; eM = 0;
        } else {
          eH = ev.end.getHours(); eM = ev.end.getMinutes();
        }
      }
      return { sH, sM, eH, eM };
    }
    const mIni = /T(\d{2}):(\d{2})/.exec(String(ev.inicio || ""));
    if (!mIni) return null;
    const sH = Number(mIni[1]), sM = Number(mIni[2]);
    let eH = sH, eM = sM;
    const mFim = /T(\d{2}):(\d{2})/.exec(String(ev.fim || ""));
    if (mFim) {
      const dIni = String(ev.inicio || "").slice(0, 10), dFim = String(ev.fim || "").slice(0, 10);
      eH = Number(mFim[1]); eM = Number(mFim[2]);
      if (dIni && dFim && dFim > dIni) {
        if (eH > 0 || eM > 0) return { sH: 0, sM: 0, eH: 24, eM: 0 };
        eH = 24; eM = 0;
      }
    }
    return { sH, sM, eH, eM };
  }
  function agSlotBounds(eventos = []){
    let minH = AG_SLOT_MIN_PADRAO, maxH = AG_SLOT_MAX_PADRAO;
    for (const ev of eventos) {
      const t = agExtrairMinutosEvento(ev);
      if (!t) continue;
      if (t.sH < minH) minH = Math.max(0, t.sH);
      const fimCeil = t.eM > 0 ? t.eH + 1 : t.eH;
      if (fimCeil > maxH) maxH = Math.min(24, fimCeil);
    }
    return { slotMinTime: `${pad2(minH)}:00:00`, slotMaxTime: `${pad2(maxH)}:00:00` };
  }
  function agNormalizarFim(s, en){
    if (!(s instanceof Date) || Number.isNaN(s.getTime())) return { fimHora: "", fimIso: "" };
    const dIni = isoOf(s);
    const fim = (en instanceof Date && !Number.isNaN(en.getTime()) && en > s) ? en : new Date(s.getTime() + 30 * 60000);
    if (isoOf(fim) !== dIni) return { fimHora: "23:59", fimIso: `${dIni}T23:59` };
    const fimHora = `${pad2(fim.getHours())}:${pad2(fim.getMinutes())}`;
    return { fimHora, fimIso: `${dIni}T${fimHora}` };
  }
  function validarEventoAgenda({ ats, titulo, d, hi, hf, diaSemana }){
    if (!Array.isArray(ats) || !ats.length) return "Selecione pelo menos uma pessoa do time para a reunião.";
    if (!String(titulo || "").trim() || !d || !hi || !hf) return "Preencha assunto, data e horários.";
    if (!agParseHora(hi) || !agParseHora(hf)) return "Informe horários válidos (ex.: 04:45).";
    if (hf <= hi) return "O fim precisa ser depois do início.";
    const wd = typeof diaSemana === "number" ? diaSemana : dOf(d).getDay();
    if (wd === 0 || wd === 6) return "A agenda mostra só de segunda a sexta. Escolha um dia útil.";
    return "";
  }
  const evPeople = e => {
    const arr = Array.isArray(e?.atendentes) && e.atendentes.length ? e.atendentes : (e?.atendente ? String(e.atendente).split(",") : []);
    return [...new Set(arr.map(x => String(x || "").trim().toUpperCase()).filter(Boolean))];
  };
  const agPeople = () => [...new Set([...people("atendimentos","atendimento"), ...agEvents.flatMap(evPeople), ...Object.keys(agFeeds)].filter(Boolean))];
  const agTeamOptions = (extras = []) => {
    const coord = (cfg.coordenacao || "").split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
    return [...new Set([
      ...people("atendimentos","atendimento",true),
      ...coord,
      ...people("socials","social",true),
      ...agEvents.flatMap(evPeople),
      ...Object.keys(agFeeds),
      ...extras,
    ].map(x => String(x || "").trim().toUpperCase()).filter(Boolean))];
  };
  const agColor = n => AG_COLORS[Math.max(0, agPeople().indexOf(n)) % AG_COLORS.length];
  const localIso = d => `${isoOf(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  function agUrlDe(raw){
    const s = String(raw || "").trim();
    if (!s) return "";
    const m = /(https?:\/\/[^\s]+|(?:meet\.google\.com|meet\.jit\.si|[\w.-]*zoom\.us|teams\.microsoft\.com|whereby\.com)\/[^\s]+)/i.exec(s);
    if (!m) return "";
    return /^https?:\/\//i.test(m[1]) ? m[1] : "https://" + m[1];
  }
  function syncAgLinkBtns(){
    const url = agUrlDe($("#ag_local")?.value);
    const openBtn = $("#ag_btnOpenLink"), copyBtn = $("#ag_btnCopyLink");
    if (openBtn) { openBtn.hidden = !url; openBtn.href = url || "#"; }
    if (copyBtn) copyBtn.hidden = !url;
  }
  function renderAgAts(selecionados = []){
    const box = $("#ag_ats"); if (!box) return;
    const selSet = new Set(selecionados.map(x => String(x || "").trim().toUpperCase()).filter(Boolean));
    const lista = agTeamOptions([...selSet]);
    box.innerHTML = lista.map(n => `<label><input type="checkbox" data-agat="${esc(n)}"${selSet.has(n) ? " checked" : ""}> ${esc(n)}</label>`).join("")
      || `<span class="hint">Digite o nome abaixo e clique em "+ Incluir".</span>`;
  }
  function agSelecionados(){
    const marcados = [...document.querySelectorAll("#ag_ats input[data-agat]:checked")].map(i => i.dataset.agat);
    const extra = ($("#ag_atNovo")?.value || "").trim().toUpperCase();
    return [...new Set([...marcados, ...(extra ? [extra] : [])].filter(Boolean))];
  }
  async function loadFC(){
    if (!window.FullCalendar) await loadScript("https://cdn.jsdelivr.net/npm/fullcalendar@6.1.15/index.global.min.js");
    if (!(FullCalendar.globalLocales || []).some(l => l.code === "pt-br")) await loadScript("https://cdn.jsdelivr.net/npm/@fullcalendar/core@6.1.15/locales/pt-br.global.min.js");
    if (IS_SITE) {
      if (!window.ICAL) await loadScript("https://cdn.jsdelivr.net/npm/ical.js@1.5.0/build/ical.min.js");
      if (!FullCalendar.ICalendar && !window.__fcIcal) { await loadScript("https://cdn.jsdelivr.net/npm/@fullcalendar/icalendar@6.1.15/index.global.min.js"); window.__fcIcal = true; }
    }
  }
  function agManual(){
    return agEvents.filter(e => !agFilter || evPeople(e).includes(agFilter)).map(e => {
      const ps = evPeople(e);
      const donoCor = agFilter && ps.includes(agFilter) ? agFilter : (ps[0] || e.atendente || "");
      const outros = agFilter ? ps.filter(x => x !== agFilter) : ps;
      const prefixo = agFilter ? (outros.length ? `c/ ${outros.join(", ")} · ` : "") : (ps.length ? `${ps.join(", ")} · ` : "");
      const temLink = !!agUrlDe(e.local);
      return {
        id: e.id,
        title: `${temLink ? "🎥 " : ""}${prefixo}${e.titulo}${e.cliente ? " (" + e.cliente + ")" : ""}`,
        start: e.inicio,
        end: e.fim,
        color: agColor(donoCor),
        extendedProps: {qid: e.id, local: e.local || "", urlOnline: agUrlDe(e.local)}
      };
    });
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
  function syncAgSlotBounds(events){
    if (!agCal) return;
    const aStart = agCal.view?.activeStart, aEnd = agCal.view?.activeEnd;
    const visiveis = (events || agCal.getEvents()).filter(ev => {
      if (!ev || ev.allDay || !ev.start) return false;
      if (aStart && aEnd) return ev.start < aEnd && (ev.end || ev.start) > aStart;
      return true;
    });
    const { slotMinTime, slotMaxTime } = agSlotBounds(visiveis);
    if (slotMinTime === agSlotMin && slotMaxTime === agSlotMax) return;
    agSlotMin = slotMinTime;
    agSlotMax = slotMaxTime;
    setTimeout(() => {
      if (!agCal) return;
      agCal.batchRendering(() => {
        agCal.setOption("slotMinTime", agSlotMin);
        agCal.setOption("slotMaxTime", agSlotMax);
      });
    }, 0);
  }
  async function ensureCal(){
    if (agCal) { agCal.updateSize(); return; }
    if (agLoading) return agLoading;
    agLoading = (async () => {
      try { await loadFC(); } catch { $("#agCal").innerHTML = `<p class="note warn" style="margin:8px">Não consegui carregar o calendário. Verifique a internet e recarregue a página.</p>`; agLoading = null; return; }
      $("#agCal").innerHTML = "";
      agSlotMin = `${pad2(AG_SLOT_MIN_PADRAO)}:00:00`;
      agSlotMax = `${pad2(AG_SLOT_MAX_PADRAO)}:00:00`;
      agCal = new FullCalendar.Calendar($("#agCal"), {
        locale:"pt-br", initialView: window.innerWidth < 700 ? "timeGridDay" : "timeGridWeek", firstDay:1,
        hiddenDays:[0,6], slotMinTime:agSlotMin, slotMaxTime:agSlotMax, slotDuration:"00:30:00", allDaySlot:true, allDayText:"Dia todo",
        height:"auto", nowIndicator:true, expandRows:true, dayMaxEvents:true,
        headerToolbar:{left:"prev,next today", center:"title", right:"timeGridWeek,timeGridDay,listWeek"},
        buttonText:{today:"Hoje", week:"Semana", day:"Dia", list:"Lista"},
        businessHours:{daysOfWeek:[1,2,3,4,5], startTime:"07:00", endTime:"21:00"},
        selectable:true, selectMirror:true, editable:true,
        select: info => {
          agCal.unselect();
          if (info.allDay) {
            const s = new Date(info.start); s.setHours(8, 0, 0, 0);
            const en = new Date(info.start); en.setHours(18, 0, 0, 0);
            openAg(null, s, en);
          } else {
            openAg(null, info.start, info.end);
          }
        },
        eventClick: info => { info.jsEvent.preventDefault(); const id = info.event.extendedProps.qid; if (id) openAg(id); else toast(`Agenda externa de ${info.event.extendedProps.dono || "atendimento"}. Edite na agenda de origem.`); },
        eventDrop: agMove, eventResize: agMove,
        eventsSet: events => syncAgSlotBounds(events),
        datesSet: () => syncAgSlotBounds(),
      });
      agCal.render(); agSources();
    })();
    return agLoading;
  }
  async function agMove(info){
    const id = info.event.extendedProps.qid; if (!id || !db) { info.revert(); return; }
    const s = info.event.start;
    const { fimIso } = agNormalizarFim(s, info.event.end);
    try { await db.collection("agenda").doc(id).update({inicio: localIso(s), fim: fimIso, atualizadoEm: new Date().toISOString()}); toast("Reunião remarcada"); }
    catch(err) { info.revert(); toast(friendly(err)); }
  }
  function openAg(id, start, end){
    if (!db) { toast("Sem conexão com o banco de dados."); return; }
    const ev = id ? agEvents.find(x => x.id === id) : null; agEditing = ev ? ev.id : null;
    let me = agFilter; try { me = me || localStorage.getItem("ag-eu") || ""; } catch {}
    const ps = agTeamOptions();
    const selIniciais = ev ? evPeople(ev) : (me && ps.includes(me) ? [me] : []);
    renderAgAts(selIniciais);
    $("#ag_atNovo").value = "";
    const s = ev ? new Date(ev.inicio) : (start || (() => { const d = new Date(); d.setMinutes(0,0,0); d.setHours(Math.min(22, Math.max(AG_SLOT_MIN_PADRAO, d.getHours()+1))); return d; })());
    const en = ev ? new Date(ev.fim) : (end && end - s > 0 && end - s < 24*3600e3 ? end : new Date(s.getTime() + 30*60000));
    const { fimHora } = agNormalizarFim(s, en);
    $("#ag_titulo").value = ev?.titulo || ""; $("#ag_cli").value = ev?.cliente || ""; $("#ag_local").value = ev?.local || ""; $("#ag_obs").value = ev?.obs || "";
    $("#ag_data").value = isoOf(s); $("#ag_ini").value = `${pad2(s.getHours())}:${pad2(s.getMinutes())}`; $("#ag_fim").value = fimHora;
    $("#agDlgTitle").textContent = ev ? "Editar reunião" : "Nova reunião";
    $("#agDel").hidden = !ev; $("#agDel").textContent = "Excluir reunião"; $("#agDel").dataset.arm = "";
    $("#ag_err").textContent = "";
    syncAgLinkBtns();
    $("#dlgAg").showModal(); setTimeout(() => $("#ag_titulo").focus(), 30);
  }
  function incluirParticipanteAg(){
    const inp = $("#ag_atNovo"); if (!inp) return;
    const novo = inp.value.trim().toUpperCase();
    if (!novo) { inp.focus(); return; }
    const atuais = agSelecionados();
    inp.value = "";
    renderAgAts([...atuais, novo]);
  }
  $("#ag_atAdd").addEventListener("click", incluirParticipanteAg);
  $("#ag_atNovo").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); incluirParticipanteAg(); } });
  $("#ag_local").addEventListener("input", syncAgLinkBtns);
  $("#ag_btnMeet").addEventListener("click", () => {
    window.open("https://meet.google.com/new", "_blank", "noopener");
    $("#ag_local").focus();
    toast("Sala do Google Meet aberta em nova aba! Copie o link lá e clique em 'Colar link'.");
  });
  $("#ag_btnAutoLink").addEventListener("click", async () => {
    const baseTxt = ($("#ag_titulo").value.trim() || $("#ag_cli").value.trim() || "Reuniao").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 28) || "Reuniao";
    const cod = Math.random().toString(36).slice(2, 7);
    const url = `https://meet.jit.si/Quinze-${baseTxt}-${cod}`;
    $("#ag_local").value = url;
    syncAgLinkBtns();
    try { await navigator.clipboard.writeText(url); toast("Sala online criada e link copiado!"); }
    catch { toast("Sala online criada no campo de link!"); }
  });
  $("#ag_btnPaste").addEventListener("click", async () => {
    try {
      const txt = (await navigator.clipboard.readText()).trim();
      if (!txt) { toast("A área de transferência está vazia."); return; }
      $("#ag_local").value = txt;
      syncAgLinkBtns();
      toast("Link colado!");
    } catch {
      $("#ag_local").focus();
      toast("Pressione Ctrl+V no campo para colar o link.");
    }
  });
  $("#ag_btnCopyLink").addEventListener("click", async () => {
    const url = agUrlDe($("#ag_local").value) || $("#ag_local").value.trim();
    if (!url) return;
    try { await navigator.clipboard.writeText(url); toast("Link da reunião copiado!"); }
    catch { toast("Não foi possível copiar automaticamente."); }
  });
  $("#agCancel").addEventListener("click", () => $("#dlgAg").close());
  $("#agNew").addEventListener("click", () => openAg(null));
  $("#frmAg").addEventListener("submit", async e => {
    e.preventDefault();
    const ats = agSelecionados();
    const titulo = $("#ag_titulo").value.trim(), d = $("#ag_data").value, hi = $("#ag_ini").value, hf = $("#ag_fim").value;
    const erro = validarEventoAgenda({ ats, titulo, d, hi, hf });
    if (erro) { $("#ag_err").textContent = erro; return; }
    const id = agEditing || ("r-" + Date.now().toString(36) + Math.random().toString(36).slice(2,5));
    const prev = agEvents.find(x => x.id === agEditing);
    const data = {atendentes: ats, atendente: ats[0], titulo, cliente: $("#ag_cli").value.trim(), local: $("#ag_local").value.trim(), obs: $("#ag_obs").value.trim(),
      inicio: `${d}T${hi}`, fim: `${d}T${hf}`, criadoEm: prev?.criadoEm || new Date().toISOString(), atualizadoEm: new Date().toISOString()};
    try {
      await db.collection("agenda").doc(id).set(data);
      try { localStorage.setItem("ag-eu", ats[0]); } catch {}
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
