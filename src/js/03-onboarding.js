  // ---------- Onboarding ----------
  const JOTFORM = "https://form.jotform.com/261113449320649";
  const NUM_CONTRATO = "+55 84 8148-5499";
  const VIDEO_APROV = "https://drive.google.com/file/d/1DhzsJjwZ9Id8Loaj1FKo25ppnxbTruzW/view?usp=sharing";
  const DRIVE_CLIENTES = "https://drive.google.com/drive/u/0/folders/1MuxVxUKauLgpFzvGv7Cq6yMRoyYRMrFV";
  const CHECK_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5l3 3 6-7"/></svg>';

  // Datas e dias úteis (feriados nacionais, RN e Mossoró, com Carnaval)
  const pad2 = n => String(n).padStart(2,"0");
  const isoOf = d => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
  const dOf = s => { const [y,m,d] = String(s).split("-").map(Number); return new Date(y, (m||1)-1, d||1); };
  const todayIso = () => isoOf(new Date());
  const br = s => s ? String(s).slice(0,10).split("-").reverse().join("/") : "";
  const isoDay = ts => ts ? isoOf(new Date(ts)) : "";
  const addDays = (s,n) => { const d = dOf(s); d.setDate(d.getDate()+n); return isoOf(d); };
  const addMonths = (s,n) => { const d = dOf(s); const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth()+n); const last = new Date(d.getFullYear(), d.getMonth()+1, 0).getDate(); d.setDate(Math.min(day,last)); return isoOf(d); };
  function easter(y){ const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),mo=Math.floor((h+l-7*m+114)/31),da=((h+l-7*m+114)%31)+1; return new Date(y,mo-1,da); }
  const HOL = {};
  function holidays(y){
    if (HOL[y]) return HOL[y];
    // Nacionais + 03/out (RN) + 30/set e 13/dez (Mossoró)
    const set = new Set(["01-01","04-21","05-01","09-07","10-12","11-02","11-15","11-20","12-25","10-03","09-30","12-13"].map(md => `${y}-${md}`));
    const e = easter(y);
    [-48,-47,-2,60].forEach(n => { const d = new Date(e); d.setDate(d.getDate()+n); set.add(isoOf(d)); }); // Carnaval, Sexta Santa, Corpus Christi
    return HOL[y] = set;
  }
  const isBD = s => { const d = dOf(s); const w = d.getDay(); return w!==0 && w!==6 && !holidays(d.getFullYear()).has(s); };
  function bdCount(a, b){ if (!a || !b || b < a) return 0; let n=0, s=a, g=0; while (s <= b && g++ < 3000){ if (isBD(s)) n++; s = addDays(s,1); } return n; }
  function addBD(s, n){ let c=0, x=s, g=0; while (c<n && g++<500){ x = addDays(x,1); if (isBD(x)) c++; } return x; }

  const PHASES = [
    {id:"f1", nome:"Fechamento", steps:[["proposta","Proposta aceita"],["formulario","Link do contrato enviado ao cliente"],["aviso","Aviso do número que envia o contrato"],["automacao","Automação do contrato conferida"],["estrutura","Grupos e pasta abertos pela automação"]]},
    {id:"f2", nome:"Dados do cliente", steps:[["contrato","Contrato assinado lido"],["ficha","Ficha do cliente completa"]]},
    {id:"f3", nome:"Comunicação", steps:[["msgCliente","Boas-vindas no grupo do cliente"],["msgAgencia","Aviso no grupo da agência"],["acessos","Documento de acessos enviado"],["email","E-mail aos coordenadores"]]},
    {id:"f4", nome:"Estratégia", steps:[["briefing","Briefing completo"],["trafego","Briefing e e-mail ao gestor de tráfego"],["carteira","Cliente na carteira"],["agenda","Datas do contrato na agenda"],["social","Conversa com o social media"],["planejamento","Planejamento inicial recebido"]]},
    {id:"f5", nome:"Encerramento", steps:[["cobranca","Contato de cobrança e contrato ao Marcílio"],["repasse","Conversa com o novo atendimento"],["retorno","Retorno ao cliente sobre o andamento"]]},
  ];
  const STEPS = PHASES.flatMap(p => p.steps.map(([k,t]) => ({k, t, ph:p.id})));
  const temTrafego = o => o?.ficha?.trafego === "sim";
  const stepsOf = o => STEPS.filter(s => s.k !== "trafego" || temTrafego(o));
  const phSteps = (o, ph) => ph.steps.filter(([k]) => k !== "trafego" || temTrafego(o));
  const AUTO = [
    ["form","Formulário do contrato preenchido pelo cliente"],
    ["crm","Cliente em Comercial/CRM/Gestão de Clientes, com contrato em branco no Docs"],
    ["task","Task criada em Gestão/Jurídico/Gestão Contratual"],
    ["edu","Edu preencheu a task e adicionou a etiqueta “PREENCHER CONTRATO”"],
    ["status","Marcílio mudou o status para “AVALIAÇÃO E ASSINATURA”"],
    ["enviado","Contrato enviado para assinatura do cliente e do Edu"],
    ["assinado","Contrato assinado pelas duas partes"],
  ];

  let obs = [], obsLoaded = false, fldStep = "", obSel = null, obFilter = "andamento", obPending = false, obPdfNote = null, obDelArm = null;
  const obOpen = new Map();
  try { obSel = localStorage.getItem("onb-sel") || null; } catch {}
  const obRef = id => db.doc("onboarding/"+id);
  const curOb = () => obs.find(o => o.id === obSel) || null;
  const val = (o, path) => path.split(".").reduce((a,k) => a == null ? a : a[k], o);
  const isDone = (o,k) => !!o?.etapas?.[k]?.ok;
  const doneCount = o => stepsOf(o).filter(s => isDone(o,s.k)).length;
  const nextStep = o => stepsOf(o).find(s => !isDone(o,s.k));
  const fimContrato = f => f && f.assinatura && Number(f.vigencia) > 0 ? addMonths(f.assinatura, Number(f.vigencia)) : "";
  const diaUtil = o => Math.max(1, bdCount(o.inicio || isoDay(o.criadoEm), o.status==="concluido" ? isoDay(o.concluidoEm) : todayIso()));
  const NM = o => (o.nome || "").toUpperCase();
  const firstName = s => (s||"").trim().split(/\s+/)[0] || "";
  const greet = () => { const h = new Date().getHours(); return h<12 ? "bom dia" : h<18 ? "boa tarde" : "boa noite"; };
  const conteudosMes = f => Number(f?.postsSemana) > 0 ? Number(f.postsSemana) * 4 : 0;
  const folderId = u => ((/folders\/([\w-]+)/.exec(u||"")) || (/[?&]id=([\w-]+)/.exec(u||"")) || [])[1] || "";
  function resumoNome(r){
    const s = (r||"").toUpperCase().replace(/\b(LTDA|EIRELI|EPP|MEI|ME|S\/A|S\.A)\b\.?/g, "").replace(/[\s,.–-]+$/,"").replace(/\s+/g," ").trim();
    const w = s.split(" ").filter(Boolean);
    return w.length > 2 ? w.slice(0,2).join(" ") : s;
  }
  const planLate = o => !!(o.planejamento?.prazo && !isDone(o,"planejamento") && todayIso() > o.planejamento.prazo);
  const ig = f => { const s = (f?.instagram||"").trim(); if (!s) return ""; if (/^https?:/i.test(s)) return s; return "https://www.instagram.com/" + s.replace(/^@/,"").replace(/\/$/,"") + "/"; };
  const ph = (v, label) => v ? v : `[${label}]`;

  // ---------- Contrato assinado: envio do PDF, leitura pela IA e conferência (instrução 10) ----------
  // O PDF vai direto do navegador para o armazenamento (sem limite de tamanho da função); o servidor guarda no onboarding,
  // cria/atualiza o contrato no Gerenciamento de contratos e, no botão "Ler contrato e preencher", lê o PDF com a IA.
  let obLeitura = null, obEnvio = null;
  async function onbApi(r, body){
    const res = await fetch("/api/m?r=onb/" + r, {method: body ? "POST" : "GET", credentials:"same-origin", headers:{"content-type":"application/json"}, body: body ? JSON.stringify(body) : undefined});
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(j.msg || "Não deu para concluir. Tente de novo."), {code: j.code});
    return j;
  }
  async function readPdf(file){
    const o = curOb(); if (!o) return;
    if (!file || !(/pdf/i.test(file.type) || /\.pdf$/i.test(file.name))) { obPdfNote = {cls:"warn", t:"Envie o contrato em PDF."}; renderOnbDetail(); return; }
    obLeitura = null; obPdfNote = null; obEnvio = {nome: file.name, prog: 0}; renderOnbDetail();
    try {
      const t = await onbApi("contrato.token", {id: o.id, nome: file.name, tamanho: file.size});
      await new Promise((ok, erro) => {
        const xhr = new XMLHttpRequest(); xhr.open("PUT", t.url, true);
        Object.entries(t.headers || {}).forEach(([k, v]) => xhr.setRequestHeader(k, v));
        xhr.setRequestHeader("x-content-type", "application/pdf"); xhr.setRequestHeader("x-content-length", String(file.size));
        xhr.setRequestHeader("x-api-blob-request-id", Math.random().toString(16).slice(2) + Date.now()); xhr.setRequestHeader("x-api-blob-request-attempt", "0");
        xhr.upload.onprogress = e => { if (e.lengthComputable && obEnvio) { obEnvio.prog = e.loaded / e.total; const b = document.querySelector("#obProg i"); if (b) b.style.width = Math.round(obEnvio.prog * 100) + "%"; } };
        xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? ok() : erro(new Error("O armazenamento recusou o arquivo (" + xhr.status + ")."));
        xhr.onerror = () => erro(new Error("Falha de conexão no envio do PDF."));
        xhr.send(file);
      });
      const r = await onbApi("contrato.confirmar", {id: o.id, chave: t.chave, nome: file.name});
      obEnvio = null;
      obPdfNote = r.gerenciamento?.erro ? {cls:"warn", t:"PDF guardado. " + r.gerenciamento.erro} : {cls:"ok", t:"PDF guardado e enviado ao Gerenciamento de contratos. Agora clique em \"Ler contrato e preencher\"."};
      renderOnbDetail();
    } catch(e) { obEnvio = null; obPdfNote = {cls:"warn", t: e.message + " Os campos abaixo continuam editáveis à mão."}; renderOnbDetail(); }
  }
  async function lerContrato(fonte){
    const o = curOb(); if (!o) return;
    obPdfNote = {cls:"", t:"Lendo o contrato com a IA… (pode levar até 1 minuto)"}; obLeitura = null; renderOnbDetail();
    try {
      const r = await onbApi("contrato.ler", {id: o.id, fonte});
      obLeitura = r;
      obPdfNote = r.lidos ? {cls:"ok", t:`${r.lidos} campo(s) lido(s) do contrato. Confira antes de gravar.`} : {cls:"warn", t:"A IA não encontrou dados neste PDF. Preencha à mão."};
    } catch(e) { obPdfNote = {cls:"warn", t: e.message}; }
    renderOnbDetail();
  }
  async function aplicarLeitura(todos){
    const o = curOb(); if (!o || !obLeitura) return;
    const valores = {};
    document.querySelectorAll("#obConf [data-lk]").forEach(tr => {
      const k = tr.dataset.lk, usar = tr.querySelector("[data-lusar]");
      if (todos) usar.checked = true;
      if (usar.checked) valores[k] = tr.querySelector("[data-lval]").value.trim();
    });
    if (!Object.keys(valores).length) { toast("Marque pelo menos um campo."); return; }
    try {
      const r = await onbApi("contrato.aplicar", {id: o.id, valores, arquivo: obLeitura.arquivo, fonte: obLeitura.fonte});
      obLeitura = null;
      obPdfNote = {cls: r.gerenciamento?.erro ? "warn" : "ok", t: `${r.aplicados} campo(s) gravado(s) na ficha (origem: contrato).` + (r.gerenciamento?.erro ? " " + r.gerenciamento.erro : " Contrato enviado ao Gerenciamento de contratos.")};
      renderOnbDetail();
    } catch(e) { const m = document.getElementById("obConfMsg"); if (m) m.textContent = e.message; else toast(e.message); }
  }
  // Repasse: ao escolher o novo atendimento (ou desfazer), a Carteira e o onboarding mudam juntos no servidor.
  async function aplicarRepasse(id){
    try { const r = await onbApi("repasse.aplicar", {id}); if (!r.semMudanca) toast(r.msg); }
    catch(e) { toast("Repasse salvo, mas a Carteira não foi atualizada: " + e.message + " Tente de novo pelo botão da etapa."); }
  }

  // ---------- Escrita ----------
  let obQ = Promise.resolve();
  function obSave(id, patch, msg){
    obQ = obQ.then(async () => {
      if (!db) { toast("Sem conexão com o banco de dados."); return false; }
      try { await obRef(id).update({...patch, atualizadoEm:new Date().toISOString()}); if (msg) toast(msg); return true; }
      catch(e){ toast(friendly(e)); return false; }
    });
    return obQ;
  }
  const setPath = (path, v) => path.split(".").reverse().reduce((acc,k) => ({[k]:acc}), v);

  // ---------- Textos ----------
  function txtFormulario(o){
    return `Olá${o.contato ? ", "+firstName(o.contato) : ""}! Tudo bem? 😊

Ficamos muito felizes com o aceite da proposta! Para seguirmos com o contrato, preencha este formulário com os dados da empresa. Leva poucos minutos:

👉 ${JOTFORM}

Qualquer dúvida, é só me chamar por aqui.`;
  }
  function txtAviso(){
    return `Assim que você enviar o formulário, o contrato é gerado automaticamente e chega para assinatura digital pelo WhatsApp *${NUM_CONTRATO}*, o número oficial da Quinze para contratos. 📄✍️

Salve esse contato para não perder a mensagem. A assinatura é feita pelo próprio celular, em poucos cliques.`;
  }
  function txtGrupoCliente1(o){
    const f = o.ficha || {}, n = conteudosMes(f);
    return `Olá pessoal, ${greet()}! 👋

Sejam todos bem-vindos ao nosso novo grupo de WhatsApp. Ele foi criado para centralizar a comunicação e o alinhamento de todo o nosso trabalho nas redes sociais da *${NM(o)}*. ✨

Aqui vamos discutir e aprovar posts, legendas e demais estratégias para garantir um conteúdo de alta qualidade e que traga resultados!

—----------

💬 *Sobre nossa rotina e fluxo de aprovação:*

Nosso contrato prevê ${ph(n, "nº de conteúdos")} conteúdos mensais (em média ${ph(f.postsSemana, "nº de posts")} posts por semana). Detalharemos os formatos no _planner_ que enviaremos no início de cada mês. 🗓️

*Atenção ao Fluxo de Aprovação!* ✅

Para garantir que tudo saia perfeito, todo o material (arte e legenda) será enviado neste grupo para aprovação do responsável antes de ser publicado. Assim que aprovado, faremos o agendamento para o melhor dia e horário. ⏰

—----------

*No vídeo a seguir é apresentado como é o método de aprovação dos materiais, trazendo agilidade e organização para as nossas aprovações:*`;
  }
  function txtGrupoCliente2(o){
    const f = o.ficha || {};
    return `👥 *Participantes e Contribuições:*

O grupo conta com a equipe de Social Media e o time de atendimento. Fiquem super à vontade para enviar fotos, vídeos e novidades que possam enriquecer o _feed_ da empresa. 📸 Toda contribuição é bem-vinda!

*Início dos Trabalhos:* 🚀

Neste primeiro momento, estamos focados ${f.identidade === "sim" ? "na criação da nova identidade visual e do planejamento inicial" : "no planejamento inicial"}. Lembrem-se que a aprovação do planejamento é fundamental para darmos início ao trabalho mensalmente. Logo teremos conteúdos para aprovação!

Estamos empolgados! Vamos nessa! 💪`;
  }
  function txtGrupoAgencia(o){
    return `🚨 *Notícia boa na área, time!* 🚀

É com muita alegria que anuncio que a família cresceu: deem as boas-vindas ao *${NM(o)}*, o mais novo cliente da Agência Quinze! 🥳✨

Os coordenadores já estão com todos os acessos, links e o briefing em mãos, e logo mais começaremos a colocar a mão na massa.

Vamos juntos dar o nosso melhor, entregar resultados incríveis e fazer esse projeto decolar! Bora pra cima! 🧡🔥

Vamos seguir o perfil: ${ph(ig(o.ficha), "Instagram do cliente")}`;
  }
  const REDES = ["Instagram","Facebook / Meta Business","TikTok","YouTube","LinkedIn","Google Meu Negócio","Outra"];
  function acessosHtml(o){
    const th = s => `<th style="border:1px solid #999;padding:6px 8px;background:#E6EFFF;text-align:left">${s}</th>`;
    const td = s => `<td style="border:1px solid #999;padding:6px 8px">${s}</td>`;
    return `<h2>Acessos das redes sociais · ${esc(NM(o))}</h2>
<p>Preencha abaixo os acessos das redes sociais da empresa. <b>Importante:</b> informe também o e-mail vinculado a cada conta. Ele é usado para recuperar o acesso se a senha mudar, se a rede pedir verificação ou se a conta for bloqueada.</p>
<p>Este documento é compartilhado apenas entre você e a equipe da Quinze.</p>
<table style="border-collapse:collapse;width:100%"><tr>${th("Rede social")}${th("Usuário / login")}${th("Senha")}${th("E-mail vinculado à conta")}${th("Telefone vinculado (verificação)")}</tr>
${(o.ficha?.redes?.length ? [...o.ficha.redes, "Outra"] : REDES).map(r => `<tr>${td("<b>"+esc(r)+"</b>")}${td("&nbsp;")}${td("&nbsp;")}${td("&nbsp;")}${td("&nbsp;")}</tr>`).join("\n")}</table>`;
  }
  function acessosPlain(o){
    return `ACESSOS DAS REDES SOCIAIS · ${NM(o)}

Preencha abaixo os acessos das redes sociais da empresa. Importante: informe também o e-mail vinculado a cada conta. Ele é usado para recuperar o acesso se a senha mudar, se a rede pedir verificação ou se a conta for bloqueada.

` + (o.ficha?.redes?.length ? [...o.ficha.redes, "Outra"] : REDES).map(r => `${r}\nUsuário / login:\nSenha:\nE-mail vinculado à conta:\nTelefone vinculado:\n`).join("\n");
  }
  function txtAcessosCliente(o){
    return `Olá${o.contato ? ", "+firstName(o.contato) : ""}! Criamos um documento para você nos passar os acessos das redes sociais da ${NM(o)}:

🔐 ${ph(o.links?.docAcessos, "link do documento")}

É muito importante informar também o *e-mail vinculado a cada conta*. É por ele que recuperamos o acesso se a senha mudar ou se a rede pedir uma verificação.

Assim que preencher, me avisa por aqui! 😉`;
  }
  function emailAssunto(o){ return `🚀 NOVO CLIENTE - ${NM(o)} 🥳`; }
  function emailCorpo(o){
    const f = o.ficha || {}, L = o.links || {}, fim = fimContrato(f);
    const sug = (o.notas?.sugestoes || "").split("\n").map(s => s.trim()).filter(Boolean);
    const prazo = f.vigencia ? `${f.vigencia} meses${f.assinatura ? ` (de ${br(f.assinatura)} a ${br(fim)})` : ""}` : "[prazo do contrato]";
    return `Fala, time de coordenadores! Tudo bem? ✨

É com muita alegria que passo por aqui para anunciar que temos mais um cliente incrível embarcando com a gente na Agência Quinze! 🎉

Vamos dar as boas-vindas oficiais ao ${NM(o)}! Para que todo mundo fique na mesma página e a gente já comece com o pé direito, separei todos os links e informações essenciais abaixo:

📁 Pasta do Cliente no Drive: ${ph(L.pasta, "link da pasta")}

📋 Briefing (Informações gerais): ${ph(L.briefing, "link do briefing")}

✍️ Serviço Contratado (Contrato): ${f.servicos ? f.servicos + " · " : ""}${ph(L.contrato, "link do contrato")}

⏳ Prazo de Contrato: ${prazo}

🔐 Acessos das redes sociais: ${ph(L.docAcessos, "link do documento de acessos")} (as senhas ficam só nesse documento)

📲 Redes gerenciadas: ${ph(redesTxt(f), "redes")}

🖨️ Material off: ${o.materialOff === "sim" ? "sim" : o.materialOff === "nao" ? "não" : "a definir"}${temTrafego(o) ? `\n\n📈 Tráfego pago: a partir de ${trafegoInicio(f) ? br(trafegoInicio(f)) : "[data]"}${o.notas?.gestor ? " · gestor: " + o.notas.gestor : ""}` : ""}
${L.fotos ? `\n📸 Fotos: ${L.fotos}\n` : ""}
Status Operacional:

✅ O grupo do WhatsApp já está aberto e pronto para a comunicação!

✅ O briefing inicial já foi adicionado no ClickUp, confira aqui: ${ph(L.clickup, "link do ClickUp")}

💡 Sugestões Iniciais & Peculiaridades:

${(sug.length ? sug : ["[Detalhes de tom de voz, estilo, restrições do cliente]","[Ideias e direcionamentos iniciais para a equipe]"]).map(s => "• " + s).join("\n")}

Bora com tudo entregar um trabalho fantástico e fazer esse projeto decolar! Se precisarem de mais alguma informação, é só me chamar.

Um abraço e vamos fazer acontecer! 🧡🚀

${o.atendimento || "[Seu nome]"}`;
  }
  function promptBriefing(o){
    const f = o.ficha || {}, nd = "Não especificado";
    const busca = f.mapsBusca || (f.segmento && f.cidade ? `${f.segmento} em ${f.cidade}` : nd);
    return `Você é um Pesquisador Sênior e Estrategista de Social Media. Sua missão é realizar uma pesquisa profunda (deep research) e produzir um briefing completo, estratégico e acionável, entregue em português (pt-BR) e formatado para fácil exportação como um arquivo .docx.

Ferramentas: use o Apify para coletar dados do Instagram do cliente e dos concorrentes e para levantar os concorrentes no Google Maps, e a busca na web para as demais fontes.

Abaixo estão as informações do projeto e as diretrizes que você deve seguir rigorosamente.

### 🟩 BLOCO DE PREENCHIMENTO (DADOS DO CLIENTE)

[INFORMAÇÕES BÁSICAS]
- Nome da empresa: ${f.razao || NM(o)}
- Segmento principal: ${f.segmento || nd}
- Modelo de negócio: ${f.modelo || nd}
- Cidade/Estado (Área de atuação): ${f.cidade ? f.cidade + (f.uf ? "/" + f.uf : "") : nd}
- CNPJ: ${f.cnpj || nd}
- Anos de mercado: ${f.anos || nd}
- Produtos/Serviços principais: ${f.produtos || nd}
- Diferenciais alegados: ${f.diferenciais || nd}

[CANAIS DIGITAIS]
- Instagram: ${ig(f) || nd}
- Google Maps / Meu Negócio: ${f.maps || nd}

[CONCORRENTES & REFERÊNCIAS]
- Concorrentes diretos (URLs ou Nomes): ${f.concorrentes || nd}
- Área de busca para concorrentes no Google Maps: ${f.cidade || nd}
- Categoria de busca no Maps: ${busca}

[ESCOPO DO TRABALHO]
- Diagnóstico detalhado de Instagram: SIM
- Análise de concorrentes (Maps + Perfis): SIM
- Investigação de fornecedores/marcas (B2B): SIM
- Oportunidades de conteúdo + calendário: SIM
- Guidelines de marca (tom/voz/cores): SIM
- KPIs + metas mensuráveis: SIM
- Sugestões de tráfego pago (público/orçamento): SIM
- Checklist operacional de social media: SIM
- Gerar fluxo estruturado em Mermaid: SIM
- Gerar arquivo .docx final: SIM

[CONTRATO]
- Serviços contratados: ${f.servicos || nd}
- Volume: ${conteudosMes(f) ? conteudosMes(f) + " conteúdos por mês (" + f.postsSemana + " por semana)" : nd}

---

### 🟥 INSTRUÇÕES DE SISTEMA (REGRAS DE OURO DA IA)

1. TIMESTAMP: Inicie o relatório com: "Dados coletados e analisados em: [DATA DE HOJE] - Hora Local".
2. REGRA DA VERDADE (ANTI-ALUCINAÇÃO): Se uma informação não estiver disponível ou for inconsistente, escreva expressamente "Não especificado" e indique como o estrategista deve obter o dado (ex: solicitar acesso ao Insights, confirmar via WhatsApp, etc.). Não invente dados.
3. FONTES: Priorize fontes oficiais (Receita, Diários Oficiais), sites das próprias empresas e redes sociais. Só use blogs se for estritamente necessário (e marque como fonte secundária).
4. COMPLIANCE & LEGAL (ADAPTAÇÃO UNIVERSAL): Identifique o segmento do cliente e aplique automaticamente as restrições legais pertinentes (ex: CFM para médicos, OAB para advogados, CVM para finanças, ANVISA/MAPA para saúde, alimentos, químicos ou agro). Liste os "Riscos Editoriais" específicos daquele nicho. Para todos, aplique o código do CONAR.

### 🟧 ESTRUTURA DO RELATÓRIO (ENTREGAR COM PROFUNDIDADE)

Se a etapa estiver marcada como "SIM" no escopo, desenvolva conforme abaixo:

A) Resumo Executivo (Obrigatório): 8–15 linhas contendo: quem é a empresa, leitura do momento digital, 3 prioridades, 3 oportunidades, 3 riscos, próximos passos (30 dias).
B) Perfil da Empresa: História/linha do tempo (aparente), localização, estrutura, diferenciais reais validados com base em pesquisa.
C) Diagnóstico do Instagram: Análise de Bio, tom de voz, frequência, tipos de post, engajamento aparente, top posts aparentes, hashtags e público-alvo presumido.
D) Concorrentes:
   - Tabela Comparativa Exigida: | Concorrente | Canal de Origem | Posicionamento | Mix de Produtos | Sinais de Preço | Pontos Fortes | Pontos Fracos | O que copiar/evitar |
   - Analisar 5-12 concorrentes locais via Google Maps. Identificar gaps e oportunidades.
E) Parceiros/Fornecedores (B2B): Portfólio, escala aparente, formatos, clientes-alvo e oportunidades de co-marketing.
F) Oportunidades de Conteúdo:
   - 3 a 5 Pilares Editoriais.
   - 12 a 25 ideias de temas.
   - Formatos táticos (10-20 ganchos de Reels, 6-12 estruturas de Carrossel, 7 modelos de Stories diários).
   - Tabela Exigida: | Formato | Objetivo | Quando Usar | Esforço | Exemplo de Pauta | KPI Principal |
   - Tabela de Calendário: | Semana | Reels | Carrossel | Post Estático | Stories | Observações |
G) Guidelines de Marca: Tom/voz (fazer x não fazer), paleta sugerida (5-7 cores com racional), tipografia, 6 regras de fotografia/vídeo e descrições de templates.
H) KPIs e Metas: KPIs organizados por etapa de funil. Metas sugeridas em %. Cadência de relatórios.
I) Tráfego Pago: Objetivos, públicos (frios, mornos, quentes), 5-10 criativos recomendados, faixas de orçamento sugerido (sem valores fixos, focar na lógica de escala) e riscos de reprovação.
J) Checklist Operacional: Briefing, produção, aprovações, agendamento, monitoramento e backup.

### 🟪 ANEXOS TÉCNICOS

1. FLUXO DE TRABALHO: Crie um fluxograma Mermaid (flowchart LR) detalhando o processo desde a Ideia/Pauta até o Relatório de Performance, incluindo etapas de revisão técnica/comercial.
2. EXPORTAÇÃO: No final da resposta, gere o comando/código necessário ou disponibilize um link/botão nativo para que o usuário baixe este relatório completo em formato .docx.`;
  }
  function txtSocial(o){
    const f = o.ficha || {}, L = o.links || {};
    const sm = o.carteira?.social && o.carteira.social !== "__novo" ? o.carteira.social : "";
    const prazo = o.planejamento?.prazo || addBD(todayIso(), 3);
    return `Oi${sm ? ", " + firstName(sm.charAt(0) + sm.slice(1).toLowerCase()) : ""}! 👋 Cliente novo com você: *${NM(o)}*${f.segmento || f.cidade ? ` (${[f.segmento, f.cidade].filter(Boolean).join(", ")})` : ""}.

📋 Contratado: ${ph(f.servicos, "serviços")}${conteudosMes(f) ? ` · ${conteudosMes(f)} conteúdos por mês` : ""}${Number(f.gravacoes) ? ` · ${f.gravacoes} gravações` : ""}
📁 Pasta: ${ph(L.pasta, "link da pasta")}
📝 Briefing: ${ph(L.briefing, "link do briefing")}
📱 Instagram: ${ph(ig(f), "Instagram")}
📲 Redes que vamos gerenciar: ${ph(redesTxt(f), "redes")}
🛠️ Mlabs: ${o.notas?.mlabs === "sim" ? "você já foi adicionado ✅" : "ainda vou te adicionar ⏳"}
🖨️ Material off: ${o.materialOff === "sim" ? "sim" : o.materialOff === "nao" ? "não" : "a definir"}${temTrafego(o) ? `\n📈 Tráfego pago: sim${trafegoInicio(f) ? ", a partir de " + br(trafegoInicio(f)) : ""}${o.notas?.gestor ? " (gestor: " + o.notas.gestor + ")" : ""}` : ""}

Quero ouvir suas percepções sobre o perfil e combinar os primeiros passos. O planejamento inicial precisa ficar pronto até *${br(prazo)}* (3 dias úteis).`;
  }
  function txtRetorno(o){
    const sm = o.carteira?.social && o.carteira.social !== "__novo" ? o.carteira.social : "";
    const L = [];
    L.push(`Olá${o.contato ? ", " + firstName(o.contato) : ""}! Tudo bem? 😊`);
    L.push("");
    L.push(`Passando para atualizar o andamento da *${NM(o)}* aqui na Quinze:`);
    L.push("");
    L.push(`${isDone(o,"contrato") || isDone(o,"automacao") ? "✅" : "⏳"} Contrato assinado`);
    L.push(`${isDone(o,"estrutura") || isDone(o,"msgCliente") ? "✅" : "⏳"} Grupo de comunicação criado`);
    L.push(`${isDone(o,"briefing") ? "✅" : "⏳"} Pesquisa e briefing do perfil`);
    L.push(`${isDone(o,"carteira") ? "✅" : "⏳"} Equipe de social media definida`);
    const prazo = o.planejamento?.prazo;
    L.push(`${isDone(o,"planejamento") ? "✅ Planejamento inicial pronto" : "⏳ Planejamento inicial em produção" + (prazo ? `, com entrega até ${br(prazo)}` : "")}`);
    if (o.acessosOk !== "sim") { L.push(""); L.push(`🔐 Pendente do seu lado: preencher o documento de acessos das redes sociais${o.links?.docAcessos ? ` (${o.links.docAcessos})` : ""}, com o e-mail vinculado a cada conta.`); }
    L.push("");
    L.push(isDone(o,"planejamento") ? "📅 Próximo passo: vamos apresentar o planejamento inicial para sua aprovação. Assim que aprovado, começamos as publicações." : "📅 Próximo passo: apresentar o planejamento inicial para sua aprovação. É ele que dá início às publicações do mês.");
    L.push("");
    L.push("Qualquer dúvida, estou por aqui!");
    return L.join("\n");
  }
  const REDES_GER = ["Instagram","Facebook","TikTok","LinkedIn","YouTube","Google Meu Negócio","Pinterest","X (Twitter)"];
  const redesTxt = f => (f?.redes || []).join(", ");
  const trafegoInicioDef = f => { const n = Number((/(\d+)\s*[ºo°ª]?\s*m[êe]s/i.exec(f?.trafegoObs || "") || [])[1]); return f?.assinatura ? (n > 1 ? addMonths(f.assinatura, n-1) : f.assinatura) : ""; };
  const trafegoInicio = f => f?.trafegoInicio || trafegoInicioDef(f);
  function calUrlAt(title, dayIso, hora, dur, details, guests){
    const [hh, mm] = String(hora || "10:00").split(":").map(Number);
    const a = dOf(dayIso); a.setHours(hh || 0, mm || 0, 0, 0);
    const b = new Date(a.getTime() + (Number(dur) || 30) * 60000);
    const fmt = d => `${d.getFullYear()}${pad2(d.getMonth()+1)}${pad2(d.getDate())}T${pad2(d.getHours())}${pad2(d.getMinutes())}00`;
    let u = "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent(title) + "&dates=" + fmt(a) + "/" + fmt(b) + "&ctz=America/Fortaleza&details=" + encodeURIComponent(details || "");
    const g = String(guests || "").split(/[,;\s]+/).filter(x => /@/.test(x));
    if (g.length) u += "&add=" + encodeURIComponent(g.join(","));
    return u;
  }
  const MEET_HINT = "O Google Agenda coloca o link do Meet sozinho se essa opção estiver ligada na sua conta. Se não aparecer, clique em “Adicionar videoconferência do Google Meet” antes de salvar.";
  function emailTrafegoAssunto(o){ const ini = trafegoInicio(o.ficha); return `📈 TRÁFEGO PAGO - ${NM(o)}${ini ? " - início " + br(ini) : ""}`; }
  function emailTrafegoCorpo(o){
    const f = o.ficha || {}, L = o.links || {}, n = o.notas || {}, ini = trafegoInicio(f);
    const sm = o.carteira?.social && o.carteira.social !== "__novo" ? o.carteira.social : "";
    return `Olá${n.gestor ? ", " + firstName(n.gestor) : ""}! Tudo bem?

Temos um cliente novo com gestão de tráfego: ${NM(o)}${f.segmento || f.cidade ? ` (${[f.segmento, f.cidade && f.cidade + (f.uf ? "/" + f.uf : "")].filter(Boolean).join(", ")})` : ""}.

📅 Início do tráfego: ${ini ? br(ini) : "[data de início]"}${f.trafegoObs ? ` (contrato: ${f.trafegoObs})` : ""}
🎯 Plataforma: ${f.trafegoPlataforma || "[plataforma]"}
📋 Briefing do cliente: ${ph(L.briefing, "link do briefing")}
📁 Pasta no Drive: ${ph(L.pasta, "link da pasta")}
📱 Instagram: ${ph(ig(f), "Instagram")}
🔐 Acessos: ${ph(L.docAcessos, "link do documento de acessos")}
👥 Atendimento: ${o.atendimento || "-"}${sm ? ` · Social media: ${sm}` : ""}

Antes do início, vamos alinhar com o cliente objetivo, público e verba de mídia. Me avisa quais acessos você precisa (Gerenciador de Negócios, conta de anúncios, pixel) para eu já pedir.

Abraço,
${o.atendimento || "[Seu nome]"}`;
  }
  const gmailUrl = (to, su, body) => "https://mail.google.com/mail/?view=cm&fs=1&to=" + encodeURIComponent(to || "") + "&su=" + encodeURIComponent(su || "") + "&body=" + encodeURIComponent(body || "");
  const ATEND_EMAIL = "atendimento@quinzecomunicacao.com";
  const cob = o => { const c = o.cobranca || {}, f = o.ficha || {}; return {nome: c.nome || f.responsavel || "", email: c.email || f.email || "", tel: c.tel || "", marcilio: c.marcilioEmail || cfg.marcilioEmail || ""}; };
  function emailCobrancaAssunto(o){ return `📄 Contrato e contato de cobrança - ${NM(o)}`; }
  function emailCobrancaCorpo(o){
    const f = o.ficha || {}, c = cob(o), fim = fimContrato(f);
    return `Olá, Marcílio! Tudo bem?

Segue a cópia do contrato assinado e o contato de cobrança do novo cliente ${NM(o)}.

📄 Contrato assinado: ${o.links?.contrato || "[link do contrato no Drive ou anexe o PDF]"}
🏢 Razão social: ${f.razao || "[razão social]"}
🧾 CNPJ: ${f.cnpj || "[CNPJ]"}
⏳ Vigência: ${f.vigencia ? `${f.vigencia} meses${f.assinatura ? ` (${br(f.assinatura)} a ${br(fim)})` : ""}` : "[vigência]"}

💳 Contato de cobrança
Nome: ${c.nome || "[nome]"}
E-mail: ${c.email || "[e-mail]"}
Telefone: ${c.tel || "[telefone]"}

Qualquer dúvida, é só me chamar.

Abraço,
${o.atendimento || "[Seu nome]"}`;
  }
  function txtRepasse(o){
    const f = o.ficha || {}, L = o.links || {}, r = o.repasse || {};
    const sm = o.carteira?.social && o.carteira.social !== "__novo" ? o.carteira.social : "";
    return `Repasse do cliente *${NM(o)}*${r.para ? ` para ${r.para}` : ""}

📋 Contratado: ${ph(f.servicos, "serviços")}${conteudosMes(f) ? ` · ${conteudosMes(f)} conteúdos por mês` : ""}
⏳ Vigência: ${f.vigencia ? `${f.vigencia} meses, até ${br(fimContrato(f))}` : "[vigência]"}
🖨️ Material off: ${o.materialOff === "sim" ? "sim" : o.materialOff === "nao" ? "não" : "a definir"}${temTrafego(o) ? `\n📈 Tráfego pago: a partir de ${trafegoInicio(f) ? br(trafegoInicio(f)) : "[data]"}` : ""}
👤 Contato do cliente: ${o.contato || f.responsavel || "-"}${o.cobranca?.tel ? " · " + o.cobranca.tel : ""}
👥 Social media: ${sm || "-"}

📁 Pasta: ${ph(L.pasta, "link da pasta")}
📝 Briefing: ${ph(L.briefing, "link do briefing")}
💬 Grupo do cliente: ${ph(L.grupoCliente, "grupo do cliente")}
🔐 Acessos: ${ph(L.docAcessos, "documento de acessos")}
🗓️ Planejamento: ${isDone(o,"planejamento") ? "recebido" : o.planejamento?.prazo ? "em produção, prazo " + br(o.planejamento.prazo) : "ainda não pedido"}

Percepções e combinados: ${o.notas?.social || "-"}`;
  }
  function calUrl(title, dayIso, details){
    const a = dayIso.replace(/-/g,""), b = addDays(dayIso,1).replace(/-/g,"");
    return "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent(title) + "&dates=" + a + "/" + b + "&details=" + encodeURIComponent(details);
  }

