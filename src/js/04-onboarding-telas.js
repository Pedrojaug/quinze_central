  // ---------- Componentes ----------
  function fld(o, path, label, opt={}){
    const id = "f_" + fldStep + "_" + path.replace(/\./g,"_");
    let v = val(o, path); if ((v === undefined || v === null || v === "") && opt.def !== undefined) v = opt.def;
    v = v ?? "";
    let input;
    if (opt.options) input = `<select id="${id}" data-f="${path}">${opt.options.map(([x,l]) => `<option value="${esc(x)}"${String(v)===String(x) ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
    else if (opt.area) input = `<textarea id="${id}" data-f="${path}" rows="${opt.area}" placeholder="${esc(opt.ph||"")}">${esc(v)}</textarea>`;
    else input = `<input id="${id}" data-f="${path}" type="${opt.type||"text"}" value="${esc(v)}" placeholder="${esc(opt.ph||"")}"${opt.type==="number" ? ' min="0" inputmode="numeric"' : ""}>`;
    return `<div class="${opt.full ? "full" : ""}"><label class="f" for="${id}">${esc(label)}</label>${input}${opt.hint ? `<div class="hint">${opt.hint}</div>` : ""}</div>`;
  }
  function msgBox(id, text, label){
    const rows = Math.min(16, Math.max(4, text.split("\n").length + 1));
    return `<div class="msg"><textarea id="msg_${id}" rows="${rows}" aria-label="Texto para copiar">${esc(text)}</textarea>
      <div class="row" style="margin-top:6px"><button class="btn small primary" type="button" data-copy="msg_${id}">${esc(label || "Copiar mensagem")}</button><span class="hint" style="margin:0">Você pode ajustar o texto antes de copiar.</span></div></div>`;
  }
  const missing = list => list.length ? `<div class="missing">${list.map(s => `<span>Falta: ${esc(s)}</span>`).join("")}</div>` : "";
  const ext = (href, label, primary) => `<a class="btn small${primary ? " primary" : ""}" href="${esc(href)}" target="_blank" rel="noopener">${esc(label)}</a>`;
  const yesNo = [["nao","Não"],["sim","Sim"]];

  function stepBody(o, k){
    fldStep = k;
    const f = o.ficha || {}, L = o.links || {};
    switch (k){
      case "proposta": {
        const pr = props.slice().sort((x,y) => (y.atualizadoEm||"").localeCompare(x.atualizadoEm||""));
        const sel = o.propostaId || "";
        return `<p>Monte a proposta na aba <b>Propostas</b>. Depois de aprovada e enviada, vincule aqui e marque esta etapa quando o cliente aceitar.</p>
          <div class="row"><button class="btn small primary" type="button" data-gotab="prop">Abrir o gerador de propostas</button></div>
          <div class="fgrid">
            <div class="full"><label class="f" for="obPropSel">Proposta deste cliente</label>
              <select id="obPropSel" data-f="propostaId"><option value="">Nenhuma vinculada</option>${pr.map(x => `<option value="${esc(x.id)}"${x.id === sel ? " selected" : ""}>${esc(x.cliente || "Sem nome")} · ${br(x.data)}${x.status === "aprovada" ? " · aprovada" : ""}</option>`).join("")}</select></div>
            ${fld(o,"links.proposta","Link da proposta enviada (opcional)",{full:true, ph:"https://"})}
          </div>`;
      }
      case "formulario":
        return `<p>Envie ao cliente o link do formulário. As respostas geram o contrato automaticamente.</p>${msgBox("form", txtFormulario(o))}<div class="row">${ext(JOTFORM, "Abrir formulário")}</div>`;
      case "aviso":
        return `<p>Avise que o contrato chega pelo número de assinaturas da Quinze.</p>${msgBox("aviso", txtAviso())}`;
      case "automacao":
        return `<p>Confira cada passo do fluxo do contrato. Quando todos estiverem marcados, a etapa é concluída sozinha.</p>
          <ul class="sub-ck">${AUTO.map(([a,t]) => `<li><label><input type="checkbox" data-auto="${a}"${o.auto?.[a] ? " checked" : ""}> <span>${esc(t)}</span></label></li>`).join("")}</ul>`;
      case "estrutura":
        return `<p>Depois da assinatura, a automação abre os grupos de WhatsApp e a pasta do cliente no Drive. Confira e cole os links aqui. Eles entram nas mensagens e no e-mail.</p>
          <div class="row">${ext(DRIVE_CLIENTES, "Abrir pasta de clientes no Drive")}</div>
          <div class="fgrid">${fld(o,"links.pasta","Pasta do cliente no Drive",{full:true, ph:"https://drive.google.com/drive/folders/..."})}${fld(o,"links.grupoCliente","Grupo do cliente no WhatsApp (link ou nome)",{ph:"https://chat.whatsapp.com/..."})}${fld(o,"links.clickup","Briefing no ClickUp",{ph:"https://app.clickup.com/..."})}</div>`;
      case "contrato": {
        const fim = fimContrato(f);
        const pdf = o.contratoPdf, g = o.contratoGerenciamento, lt = o.contratoLeitura;
        const brData = iso => iso ? new Date(iso).toLocaleDateString("pt-BR") : "";
        const orig = k => o.fichaOrigem?.[k] === "contrato" ? " · lido do contrato" : "";
        const lab = (k, t) => t + orig(k);
        let conf = "";
        if (obLeitura && obLeitura.campos) {
          const R = obLeitura.rotulos, linhas = Object.entries(obLeitura.campos).filter(([, c]) => c);
          const falta = Object.entries(obLeitura.campos).filter(([, c]) => !c).map(([k]) => R[k].rotulo);
          const atualDe = k => { const v = f[k]; return v === undefined || v === null ? "" : String(v); };
          conf = `<div class="panel" id="obConf" style="margin:10px 0"><h3 style="margin:0 0 6px;font-size:15px">Conferência da leitura · ${esc(obLeitura.arquivo || "")}</h3>
            <p class="hint" style="margin:0 0 8px">Marque o que gravar. Campos que já têm valor diferente na ficha vêm desmarcados: só são trocados se você marcar. Valores com <b>confira</b> foram lidos com pouca certeza.</p>
            <div style="overflow-x:auto"><table class="tbl" style="width:100%;font-size:13.5px"><thead><tr><th>Usar</th><th>Campo</th><th>Lido do contrato</th><th>Valor atual na ficha</th></tr></thead><tbody>
            ${linhas.map(([k, c]) => { const at = atualDe(k), lido = String(c.valor), igual = at === lido, marcar = (!at || igual) && c.formato !== false;
              return `<tr data-lk="${k}"><td><input type="checkbox" data-lusar${marcar ? " checked" : ""} style="min-height:0;width:16px;height:16px"></td><td>${esc(R[k].rotulo)}${c.confianca === "baixa" ? ` <span class="daychip warn">confira</span>` : ""}${c.formato === false ? ` <span class="daychip warn">formato estranho: corrija antes de marcar</span>` : ""}</td>
                <td><input data-lval value="${esc(lido)}" style="width:100%;min-width:140px"></td><td>${at ? esc(at) + (igual ? " ✓" : ` <span class="daychip warn">será trocado se marcar</span>`) : `<span class="muted">vazio</span>`}</td></tr>`; }).join("")}</tbody></table></div>
            ${falta.length ? `<p class="hint">Não encontrados no contrato (ficam vazios): ${esc(falta.join(", "))}.</p>` : ""}
            <div class="row"><button class="btn small primary" type="button" data-conf="todos">Aceitar todos</button><button class="btn small" type="button" data-conf="marcados">Gravar os marcados</button><button class="btn small" type="button" data-conf="cancelar">Cancelar</button><span class="hint" id="obConfMsg" style="margin:0"></span></div></div>`;
        }
        return `<div class="drop" id="obDrop"><b>${pdf ? "Envie outro PDF para substituir" : "Solte aqui o PDF do contrato assinado"}</b><span class="muted">O arquivo fica guardado e vai para o Gerenciamento de contratos. </span><label class="btn small" for="obPdf" style="margin-top:8px">Escolher arquivo</label><input type="file" id="obPdf" accept="application/pdf,.pdf" hidden></div>
          ${obEnvio ? `<div class="note">Enviando ${esc(obEnvio.nome)}… <span id="obProg" style="display:inline-block;width:160px;height:6px;background:var(--line2);border-radius:4px;overflow:hidden;vertical-align:middle"><i style="display:block;height:100%;width:${Math.round(obEnvio.prog * 100)}%;background:var(--blue)"></i></span></div>` : ""}
          ${pdf ? `<div class="row" style="align-items:center"><span>📄 <a href="/api/m?r=onb/contrato.arquivo&id=${encodeURIComponent(o.id)}" target="_blank" rel="noopener">${esc(pdf.nome)}</a> <span class="muted">(${Math.max(1, Math.round((pdf.tamanho || 0) / 1024))} KB, enviado em ${brData(pdf.em)})</span></span>
            <button class="btn small primary" type="button" data-lercontrato="arquivo">Ler contrato e preencher</button></div>`
            : L.contrato ? `<div class="row"><button class="btn small" type="button" data-lercontrato="drive">Ler contrato pelo link do Drive</button></div>` : ""}
          ${g && !g.erro ? `<div class="note ok">Enviado ao Gerenciamento de contratos em ${brData(g.em)}.</div>` : ""}
          ${lt ? `<div class="hint">Última leitura: ${brData(lt.em)} por ${esc(lt.por?.nome || "")}, de ${esc(lt.arquivo || "")} (${lt.campos?.length || 0} campos).</div>` : ""}
          ${obPdfNote ? `<div class="note ${obPdfNote.cls}">${esc(obPdfNote.t)}</div>` : ""}
          ${conf}
          <div class="fgrid">
            ${fld(o,"ficha.razao",lab("razao","Razão social"),{full:true})}
            ${fld(o,"nome","Nome do cliente (resumido)",{hint:"Usado nas mensagens e na carteira."})}
            ${fld(o,"ficha.nomeFantasia",lab("nomeFantasia","Nome fantasia"))}
            ${fld(o,"ficha.cnpj",lab("cnpj","CNPJ ou CPF"))}
            ${fld(o,"ficha.endereco",lab("endereco","Endereço"))}
            ${fld(o,"ficha.cidade",lab("cidade","Cidade"))}
            ${fld(o,"ficha.uf",lab("uf","UF"),{options:[["",""],...UFS.map(u=>[u,u])]})}
            ${fld(o,"ficha.responsavel",lab("responsavel","Responsável legal"))}
            ${fld(o,"ficha.email",lab("email","E-mail de quem assinou"),{type:"email"})}
            ${fld(o,"ficha.telefone",lab("telefone","Telefone do cliente"))}
            ${fld(o,"ficha.assinatura",lab("assinatura","Data da assinatura"),{type:"date"})}
            ${fld(o,"ficha.inicio",lab("inicio","Data de início"),{type:"date"})}
            ${fld(o,"ficha.vigencia",lab("vigencia","Vigência (meses)"),{type:"number", hint: fim ? `Termina em ${br(fim)}.` : "A vigência conta da data de assinatura."})}
            ${fld(o,"ficha.dataFinal",lab("dataFinal","Data final (do contrato)"),{type:"date"})}
            ${fld(o,"ficha.renovacaoAutomatica",lab("renovacaoAutomatica","Renovação automática"),{options:[["",""],...yesNo]})}
            ${fld(o,"ficha.valorMensal",lab("valorMensal","Valor mensal (R$)"),{type:"number"})}
            ${fld(o,"ficha.formaPagamento",lab("formaPagamento","Forma de pagamento"))}
            ${fld(o,"ficha.diaPagamento",lab("diaPagamento","Dia de pagamento"),{type:"number"})}
            ${fld(o,"ficha.indiceReajuste",lab("indiceReajuste","Índice de reajuste"))}
            ${fld(o,"ficha.dataReajuste",lab("dataReajuste","Data de reajuste"),{type:"date"})}
            ${fld(o,"ficha.postsSemana",lab("postsSemana","Posts por semana"),{type:"number", hint: conteudosMes(f) ? `${conteudosMes(f)} conteúdos por mês.` : "Conteúdos por mês = posts por semana × 4."})}
            ${fld(o,"ficha.conteudosMes",lab("conteudosMes","Conteúdos por mês (do contrato)"),{type:"number"})}
            ${fld(o,"ficha.gravacoes",lab("gravacoes","Gravações por mês"),{type:"number", hint:"Cada tarde de gravação conta como 4."})}
            ${fld(o,"ficha.servicos",lab("servicos","Serviços contratados"),{full:true})}
            ${fld(o,"ficha.trafego",lab("trafego","Gestão de tráfego"),{options:yesNo})}
            ${fld(o,"ficha.trafegoObs",lab("trafegoObs","Observação do tráfego"),{ph:"Ex.: a partir do 3º mês"})}
            ${fld(o,"ficha.identidade",lab("identidade","Identidade visual"),{options:yesNo})}
            ${fld(o,"materialOff","Envolve material off?",{options:[["","A definir"],["sim","Sim"],["nao","Não"]]})}
            ${fld(o,"links.contrato","Link do contrato no Drive",{ph:"https://"})}
            ${fld(o,"ficha.outrosContrato",lab("outrosContrato","Outras informações do contrato"),{full:true})}
          </div>`;
      }
      case "ficha": {
        const falta = [!f.instagram && "Instagram", !f.segmento && "segmento", !f.maps && "Google Maps"].filter(Boolean);
        return `<p>Dados que não vêm no contrato. Eles alimentam o briefing e as mensagens.</p>${missing(falta)}
          <div class="fgrid">
            ${fld(o,"ficha.instagram","Instagram",{ph:"@perfil ou link"})}
            ${fld(o,"ficha.maps","Google Maps / Meu Negócio",{ph:"https://"})}
            ${fld(o,"ficha.segmento","Segmento principal",{ph:"Ex.: escritório de contabilidade"})}
            ${fld(o,"ficha.modelo","Modelo de negócio",{options:[["",""],["B2B","B2B"],["B2C","B2C"],["B2B e B2C","B2B e B2C"]]})}
            ${fld(o,"ficha.produtos","Produtos/serviços principais",{full:true})}
            ${fld(o,"ficha.diferenciais","Diferenciais alegados",{full:true})}
            ${fld(o,"ficha.anos","Anos de mercado")}
            ${fld(o,"ficha.mapsBusca","Categoria de busca no Maps",{ph: f.segmento && f.cidade ? `${f.segmento} em ${f.cidade}` : "Ex.: contabilidade em Mossoró"})}
            ${fld(o,"ficha.concorrentes","Concorrentes diretos (nomes ou links)",{full:true, area:2})}
          </div>`;
      }
      case "msgCliente": {
        const falta = [!Number(f.postsSemana) && "posts por semana (etapa Contrato)"].filter(Boolean);
        return `<div class="fgrid">${fld(o,"links.grupoCliente","Grupo do cliente no WhatsApp (link ou nome)",{full:true, ph:"Cole o link de convite ou o nome do grupo aberto pela automação"})}</div>
          <p>Mande no grupo do cliente, nesta ordem:</p>${missing(falta)}
          <p><b>1. Mensagem de boas-vindas</b></p>${msgBox("gc1", txtGrupoCliente1(o))}
          <p><b>2. Vídeo do método de aprovação</b></p><div class="row">${ext(VIDEO_APROV, "Abrir vídeo no Drive")}<button class="btn small" type="button" data-copytxt="${esc(VIDEO_APROV)}">Copiar link do vídeo</button></div>
          <p><b>3. Rotina e início dos trabalhos</b></p>${msgBox("gc2", txtGrupoCliente2(o))}`;
      }
      case "msgAgencia":
        return `<p>Aviso para o grupo da equipe.</p>${missing([!f.instagram && "Instagram (etapa Ficha)"].filter(Boolean))}${msgBox("ga", txtGrupoAgencia(o))}`;
      case "acessos": {
        const fid = folderId(L.pasta);
        const create = "https://docs.google.com/document/create?usp=drive_web" + (fid ? "&folder=" + fid : "") + "&title=" + encodeURIComponent("Acessos · " + NM(o));
        return `${fid ? "" : `<div class="note warn">Cole o link da pasta do cliente na etapa “Grupos e pasta” para o documento já nascer dentro dela. Sem isso, ele é criado no seu Meu Drive.</div>`}
          <p><b>1.</b> Crie o documento e cole a tabela de acessos nele.</p>
          <div class="row">${ext(create, "Criar documento na pasta do cliente", true)}<button class="btn small" type="button" data-copyhtml>Copiar tabela de acessos</button></div>
          <div class="hint" style="margin-top:-6px">No documento, cole com Ctrl+V. A tabela vem formatada.</div>
          <p><b>2.</b> Compartilhe o documento com o cliente como Editor${f.email ? ` (${esc(f.email)})` : ""} e cole o link aqui.</p>
          <div class="fgrid">${fld(o,"links.docAcessos","Link do documento de acessos",{ph:"https://docs.google.com/document/d/..."})}${fld(o,"acessosOk","Cliente já preencheu os acessos?",{options:[["","Ainda não"],["sim","Sim"]]})}</div>
          <p><b>3.</b> Envie ao cliente:</p>${msgBox("acc", txtAcessosCliente(o))}`;
      }
      case "email": {
        const falta = [[L.pasta,"pasta do Drive"],[L.briefing,"briefing"],[L.contrato,"contrato"],[L.docAcessos,"documento de acessos"],[L.clickup,"ClickUp"]].filter(x => !x[0]).map(x => x[1]);
        return `<p>Preencha os links que faltam. Se não tiver algum, peça a quem cuida dele antes de enviar.</p>${missing(falta)}
          <div class="fgrid">
            ${fld(o,"links.pasta","Pasta do cliente no Drive",{ph:"https://"})}${fld(o,"links.briefing","Briefing",{ph:"https://"})}
            ${fld(o,"links.contrato","Contrato",{ph:"https://"})}${fld(o,"links.docAcessos","Documento de acessos",{ph:"https://"})}
            ${fld(o,"links.clickup","ClickUp",{ph:"https://"})}${fld(o,"links.fotos","Fotos (opcional)",{ph:"https://"})}
            ${fld(o,"notas.sugestoes","Sugestões iniciais e peculiaridades (uma por linha)",{full:true, area:3, ph:"Tom de voz, estilo, restrições do cliente…"})}
          </div>
          <p><b>Assunto</b></p>${msgBox("ems", emailAssunto(o), "Copiar assunto")}
          <p><b>Mensagem</b></p>${msgBox("emc", emailCorpo(o), "Copiar e-mail")}`;
      }
      case "briefing": {
        const falta = [!f.instagram && "Instagram", !f.segmento && "segmento", !f.cidade && "cidade"].filter(Boolean);
        const p = promptBriefing(o), q = "https://claude.ai/new?q=" + encodeURIComponent(p);
        return `<p>O botão abre uma conversa nova no Claude com o prompt de briefing já preenchido com os dados do cliente. Use o app do Claude no computador, onde o Apify está conectado.</p>${missing(falta.map(x => x + " (etapa Ficha)"))}
          <div class="row">${q.length < 15000 ? ext(q, "Gerar briefing no Claude", true) : ""}<button class="btn small" type="button" data-copy="msg_brief">Copiar prompt</button></div>
          <details><summary class="hint" style="cursor:pointer">Ver o prompt</summary>${msgBox("brief", p, "Copiar prompt")}</details>
          <div class="fgrid">${fld(o,"links.briefing","Link do briefing pronto",{full:true, ph:"https://"})}</div>`;
      }
      case "carteira": {
        if (!months.length) return `<div class="note warn">Ainda não existe carteira mensal. Crie a carteira do mês no topo da página e volte aqui.</div>`;
        const ats = people("atendimentos","atendimento"), sms = people("socials","social");
        const now = new Date(), ym = `${now.getFullYear()}-${pad2(now.getMonth()+1)}`;
        const defMes = months.includes(ym) ? ym : (cur || months[months.length-1]);
        const mes = o.carteira?.mes || defMes;
        const fim = fimContrato(f);
        const obsDef = f.vigencia ? `Vigência: ${f.vigencia} meses${f.assinatura ? ` (${br(f.assinatura)} a ${br(fim)})` : ""}` : "";
        const atV = o.carteira?.atendimento ?? (o.atendimento || ""), smV = o.carteira?.social ?? "";
        const later = months.filter(m => m > mes);
        const ins = o.carteira?.inserido;
        return `<p>Confira os dados e insira. Pede a senha de edição da carteira.</p>
          <div class="fgrid">
            ${fld(o,"carteira.mes","Carteira (mês de início)",{options: months.slice().reverse().map(m => [m, mLabel(m)]), def: defMes})}
            ${fld(o,"carteira.nome","Nome na carteira",{def: resumoNome(f.razao) || NM(o)})}
            ${fld(o,"carteira.nivel","Nível",{options:[["A","A"],["B","B"],["C","C"],["D","D"]], def:"C"})}
            ${fld(o,"carteira.tipo","Tipo",{options:(cfg.tipos||[]).map(t => [t,t]), def:(cfg.tipos||[]).find(t => /FEE/i.test(t)) || (cfg.tipos||[])[0]})}
            ${fld(o,"carteira.atendimento","Atendimento",{options:[["","Sem atendimento"],...[...new Set([...ats, atV].filter(x => x && x!=="__novo"))].map(n => [n,n]),["__novo","Outro (novo nome)…"]], def: atV})}
            ${atV === "__novo" ? fld(o,"carteira.atendimentoNovo","Nome do novo atendimento") : ""}
            ${fld(o,"carteira.social","Social media",{options:[["","Sem social media"],...sms.map(n => [n,n]),["__novo","Outro (novo nome)…"]], def: smV})}
            ${smV === "__novo" ? fld(o,"carteira.socialNovo","Nome da nova social media") : ""}
            ${fld(o,"carteira.conteudos","Conteúdos",{type:"number", def: conteudosMes(f) || ""})}
            ${fld(o,"carteira.motions","Motions",{type:"number", def: 0})}
            ${fld(o,"carteira.gravacao","Gravações",{type:"number", def: Number(f.gravacoes) || 0, hint:"Cada tarde de gravação conta como 4."})}
            ${fld(o,"carteira.materialOff","Material off",{options:[["nao","Não tem direito"],["sim","Tem direito"]], def: o.materialOff === "sim" ? "sim" : "nao"})}
            ${fld(o,"carteira.obs","Observações",{full:true, area:2, def: obsDef})}
            ${later.length ? `<div class="full"><label style="display:flex;gap:8px;align-items:center;font-size:14px"><input type="checkbox" id="obLater" checked style="min-height:0;width:16px;height:16px"> Também nas carteiras seguintes já criadas (${later.map(mShort).join(", ")})</label></div>` : ""}
          </div>
          <div class="row"><button class="btn primary" type="button" data-insert="${esc(o.id)}">${ins ? "Atualizar na carteira" : "Inserir na carteira"}</button>
          ${ins ? `<span class="daychip ok">Inserido em ${esc(mLabel(ins.mes).toLowerCase())} em ${br(isoDay(ins.em))}</span>` : ""}</div>`;
      }
      case "agenda": {
        const fim = fimContrato(f);
        if (!fim) return `<div class="note warn">Preencha a data da assinatura e a vigência na etapa “Contrato assinado lido”.</div>`;
        const aviso = addDays(fim, -30);
        const det = `${NM(o)}\nVigência: ${f.vigencia} meses, de ${br(f.assinatura)} a ${br(fim)}.\nO contrato pede aviso prévio de 30 dias para rescisão.\nAtendimento: ${o.atendimento || "-"}`;
        return `<p>O contrato começou em <b>${br(f.assinatura)}</b> e termina em <b>${br(fim)}</b> (${f.vigencia} meses). Os botões abrem o Google Agenda com o evento pronto. É só salvar.</p>
          <div class="row">${ext(calUrl("Fim do contrato · " + NM(o), fim, det), "Adicionar fim do contrato (" + br(fim) + ")", true)}${ext(calUrl("Renovação: aviso de 30 dias · " + NM(o), aviso, det), "Adicionar aviso 30 dias antes (" + br(aviso) + ")")}</div>`;
      }
      case "social": {
        const sm = o.carteira?.social && o.carteira.social !== "__novo" ? o.carteira.social : "";
        const prazo = o.planejamento?.prazo || addBD(todayIso(), 3);
        const redes = f.redes || [];
        const n = o.notas || {};
        const rData = n.reuniaoData || addBD(todayIso(), 1), rHora = n.reuniaoHora || "10:00";
        const det = `Alinhamento sobre o cliente ${NM(o)}: percepções, primeiros passos e planejamento inicial (prazo ${br(prazo)}).\n\nPasta: ${L.pasta || "-"}\nBriefing: ${L.briefing || "-"}\nInstagram: ${ig(f) || "-"}\nRedes: ${redesTxt(f) || "-"}`;
        return `${sm ? `<p>Social media: <b>${esc(sm)}</b></p>` : `<div class="note warn">Defina a social media na etapa “Cliente na carteira”.</div>`}
          <div><label class="f">Redes que vamos gerenciar</label><div class="chk">${REDES_GER.map(r => `<label><input type="checkbox" data-rede="${esc(r)}"${redes.includes(r) ? " checked" : ""}> ${esc(r)}</label>`).join("")}</div></div>
          <div class="fgrid">${fld(o,"notas.mlabs","Social media já foi adicionado no Mlabs?",{options:[["","Ainda não"],["sim","Sim, já adicionado"]]})}</div>
          ${msgBox("sm", txtSocial(o))}
          <p><b>Reunião sobre o cliente</b> · 20 minutos no Meet</p>
          <div class="fgrid">
            ${fld(o,"notas.reuniaoData","Data",{type:"date", def: rData})}
            ${fld(o,"notas.reuniaoHora","Horário",{type:"time", def: rHora})}
            ${fld(o,"notas.smEmail","E-mail do social media (convite)",{full:true, type:"email", ph:"nome@quinzecomunicacao.com"})}
          </div>
          <div class="row"><a class="btn small primary" data-meet href="${esc(calUrlAt("Alinhamento do cliente " + NM(o), rData, rHora, 20, det, n.smEmail))}" target="_blank" rel="noopener">Agendar reunião no Meet (20 min)</a></div>
          <p class="hint" style="margin-top:-6px">${MEET_HINT}</p>
          <div class="fgrid">${fld(o,"notas.social","Percepções e primeiros passos combinados",{full:true, area:4})}</div>
          <p class="hint">${o.planejamento?.prazo ? `Prazo do planejamento: ${br(prazo)}.` : `Ao marcar esta etapa, começa o prazo de 3 dias úteis do planejamento (hoje daria ${br(prazo)}).`}</p>`;
      }
      case "trafego": {
        const n = o.notas || {}, ini = trafegoInicio(f);
        const falta = [!L.briefing && "link do briefing", !n.gestorEmail && "e-mail do gestor", !ini && "data de início"].filter(Boolean);
        const det = `${NM(o)}\nInício da gestão de tráfego${f.trafegoPlataforma ? " (" + f.trafegoPlataforma + ")" : ""}.\nBriefing: ${L.briefing || "-"}\nGestor: ${n.gestor || "-"}`;
        return `<p>O contrato inclui gestão de tráfego${f.trafegoObs ? ` (${esc(f.trafegoObs)})` : ""}. Envie ao gestor o briefing e o e-mail com a data de início.</p>${missing(falta)}
          <div class="fgrid">
            ${fld(o,"notas.gestor","Gestor de tráfego")}
            ${fld(o,"notas.gestorEmail","E-mail do gestor",{type:"email"})}
            ${fld(o,"ficha.trafegoInicio","Início do tráfego",{type:"date", def: trafegoInicioDef(f), hint: f.trafegoObs ? `Calculado pelo contrato: ${esc(f.trafegoObs)}.` : "Confirme a data com o cliente."})}
            ${fld(o,"links.briefing","Link do briefing",{ph:"https://"})}
          </div>
          <p><b>Assunto</b></p>${msgBox("trs", emailTrafegoAssunto(o), "Copiar assunto")}
          <p><b>E-mail ao gestor</b></p>${msgBox("trc", emailTrafegoCorpo(o), "Copiar e-mail")}
          ${ini ? `<div class="row">${ext(calUrl("Início do tráfego · " + NM(o), ini, det), "Adicionar início do tráfego na agenda (" + br(ini) + ")")}</div>` : ""}`;
      }
      case "planejamento": {
        const p = o.planejamento || {};
        let st;
        if (!p.prazo) st = `<div class="note">O prazo de 3 dias úteis começa quando a conversa com o social media for marcada como feita.</div>`;
        else if (isDone(o,"planejamento")) { const rec = p.recebidoEm || isoDay(o.etapas.planejamento.em); const atraso = rec > p.prazo ? bdCount(addDays(p.prazo,1), rec) : 0; st = `<div class="note ${atraso ? "warn" : "ok"}">Recebido em ${br(rec)}${atraso ? `, ${atraso} dia${atraso>1?"s":""} út${atraso>1?"eis":"il"} depois do prazo` : ", dentro do prazo"} (${br(p.prazo)}).</div>`; }
        else if (planLate(o)) { const n = bdCount(addDays(p.prazo,1), todayIso()); st = `<div class="note warn">Atrasado: o prazo era ${br(p.prazo)}. Já são ${n} dia${n>1?"s":""} út${n>1?"eis":"il"} de atraso. Cobre o social media.</div>`; }
        else { const n = bdCount(addDays(todayIso(),1), p.prazo); st = `<div class="note">Pedido em ${br(p.pedidoEm)}. Prazo: <b>${br(p.prazo)}</b>${n ? ` (faltam ${n} dia${n>1?"s":""} út${n>1?"eis":"il"})` : " (vence hoje)"}.</div>`; }
        return `${st}<div class="fgrid">${fld(o,"links.planejamento","Link do planejamento",{full:true, ph:"https://"})}</div>`;
      }
      case "cobranca": {
        const c = cob(o);
        const falta = [!c.tel && "telefone de cobrança", !c.marcilio && "e-mail do Marcílio", !L.contrato && "link do contrato"].filter(Boolean);
        return `<p>Informe ao Marcílio o contato de cobrança e mande a cópia do contrato assinado.</p>${missing(falta)}
          <div class="fgrid">
            ${fld(o,"cobranca.nome","Nome do contato de cobrança",{def: f.responsavel || ""})}
            ${fld(o,"cobranca.email","E-mail de cobrança",{type:"email", def: f.email || ""})}
            ${fld(o,"cobranca.tel","Telefone de cobrança",{type:"tel", ph:"(84) 9 0000-0000"})}
            ${fld(o,"cobranca.marcilioEmail","E-mail do Marcílio",{type:"email", def: cfg.marcilioEmail || "", hint:"Fica salvo para os próximos onboardings."})}
            ${fld(o,"links.contrato","Link do contrato assinado no Drive",{full:true, ph:"https://"})}
          </div>
          <p><b>Assunto</b></p>${msgBox("cbs", emailCobrancaAssunto(o), "Copiar assunto")}
          <p><b>E-mail ao Marcílio</b></p>${msgBox("cbc", emailCobrancaCorpo(o), "Copiar e-mail")}
          <div class="row"><a class="btn small primary" data-gmail="cobranca" href="${esc(gmailUrl(c.marcilio, emailCobrancaAssunto(o), emailCobrancaCorpo(o)))}" target="_blank" rel="noopener">Abrir no Gmail</a>${L.contrato ? "" : `<span class="hint" style="margin:0">Sem link do contrato: anexe o PDF no e-mail.</span>`}</div>`;
      }
      case "repasse": {
        const r = o.repasse || {};
        const ats = people("atendimentos","atendimento").filter(n => n !== o.atendimento);
        const rData = r.data || addBD(todayIso(), 1), rHora = r.hora || "10:00";
        let corpo = "";
        if (r.vai === "sim") corpo = `
          <div class="fgrid">
            ${fld(o,"repasse.para","Novo atendimento responsável",{options:[["","Escolha"],...[...new Set([...ats, r.para].filter(Boolean))].map(n => [n,n])]})}
            ${fld(o,"repasse.email","E-mail do novo atendimento (convite, opcional)",{type:"email"})}
            ${fld(o,"repasse.data","Data da conversa",{type:"date", def: rData})}
            ${fld(o,"repasse.hora","Horário",{type:"time", def: rHora})}
            ${fld(o,"repasse.dur","Duração",{options:[15,20,30,45,60].map(m => [String(m), m + " min"]), def: "30"})}
          </div>
          <div class="row"><a class="btn small primary" data-repasse href="#" target="_blank" rel="noopener">Adicionar na minha agenda e na do atendimento</a></div>
          <p class="hint" style="margin-top:-6px">O evento sai da sua agenda com ${ATEND_EMAIL} como convidado${r.email ? " e " + esc(r.email) : ""}. ${MEET_HINT}</p>
          ${o.repasseAplicado && o.repasseAplicado.para === r.para ? `<div class="note ok">Carteira atualizada: atendimento agora é <b>${esc(o.repasseAplicado.para)}</b>${o.repasseAplicado.criado ? " (cliente inserido na Carteira)" : ""}${(o.repasseAplicado.mudou || []).filter(x => x !== "atendimento").length ? `; também preenchido: ${esc(o.repasseAplicado.mudou.filter(x => x !== "atendimento").join(", "))}` : ""}. ${esc((o.repasseAplicado.meses || []).join(", "))}.</div>`
            : r.para ? `<div class="row"><button class="btn small" type="button" data-repcart>Atualizar a Carteira com ${esc(r.para)}</button></div>` : ""}
          <p><b>Resumo para o novo atendimento</b></p>${msgBox("rep", txtRepasse(o))}`;
        else if (r.vai === "nao") corpo = `<div class="note ok">Sem repasse: ${esc(o.atendimento || "o atendimento atual")} segue com o cliente. A Carteira não muda.</div>`;
        return `<p>Se o cliente for passar para outro atendimento, marque a conversa de repasse.</p>
          <div class="fgrid">${fld(o,"repasse.vai","Vai repassar para outro atendimento?",{options:[["","Escolha"],["sim","Sim"],["nao","Não, segue comigo"]]})}</div>${corpo}`;
      }
      case "retorno":
        return `<p>Mensagem para o cliente, montada a partir das etapas já concluídas.</p>${msgBox("ret", txtRetorno(o))}`;
    }
    return "";
  }

  // ---------- Excluir / restaurar (só Mestre e gestão; o servidor confere) ----------
  let obExcl = null, obExclSel = null, obExcluirArm = null;
  const obOcultos = new Set();   // excluídos aqui, escondidos até a sincronização confirmar
  const obGestao = () => { try { return ehGestaoMe(); } catch { return false; } };
  async function carregarExcluidos(){
    try { obExcl = (await onbApi("excluidos")).excluidos; } catch(e) { obExcl = []; toast(e.message); }
    if (obExclSel && !obExcl.some(x => x.id === obExclSel)) obExclSel = null;
    if (!obExclSel) obExclSel = obExcl[0]?.id || null;
    renderOnbList(); renderOnbDetail();
  }
  function confirmaExclusao(o){
    const ins = o.carteira?.inserido, g = o.contratoGerenciamento;
    return `<div class="panel" id="obExcluirBox" style="border-color:var(--danger);margin-bottom:14px">
      <h3 style="margin:0 0 6px;font-size:16px">Excluir o onboarding de ${esc(NM(o))}?</h3>
      <p class="hint" style="margin:0 0 10px">Ele sai da lista para todos. Uma cópia completa fica guardada e a gestão pode restaurar pelo filtro “Excluídos”.</p>
      ${ins?.id ? `<label style="display:flex;gap:8px;align-items:flex-start;font-size:14px;margin-bottom:8px"><input type="checkbox" id="obExCart" style="min-height:0;width:16px;height:16px;margin-top:3px"> <span>Também retirar <b>${esc(o.carteira?.nome || NM(o))}</b> da Carteira (a partir de ${esc(mLabel(ins.mes).toLowerCase())}). O cliente fica em “Retirados” e pode ser reativado.</span></label>`
        : `<p class="hint" style="margin:0 0 8px">O cliente ainda não foi inserido na Carteira por este onboarding.</p>`}
      ${g && !g.erro ? `<label style="display:flex;gap:8px;align-items:flex-start;font-size:14px;margin-bottom:8px"><input type="checkbox" id="obExContr" style="min-height:0;width:16px;height:16px;margin-top:3px"> <span>Também excluir o contrato enviado ao Gerenciamento de contratos, se ainda estiver “a conferir”. Se a gestão já conferiu, ele fica.</span></label>`
        : `<p class="hint" style="margin:0 0 8px">Nenhum contrato deste onboarding foi enviado ao Gerenciamento de contratos.</p>`}
      <div class="row"><button class="btn danger" type="button" data-obexconf="${esc(o.id)}">Excluir onboarding</button><button class="btn" type="button" data-obexcancel>Cancelar</button><span class="hint" id="obExMsg" style="margin:0"></span></div></div>`;
  }
  function renderExcluidosDetail(box){
    const x = (obExcl || []).find(y => y.id === obExclSel);
    if (!obExcl) { box.innerHTML = `<div class="ob-empty"><p class="muted">Carregando…</p></div>`; return; }
    if (!x) { box.innerHTML = `<div class="ob-empty"><h2>Nenhum onboarding excluído</h2><p class="muted">Os onboardings excluídos aparecem aqui e podem ser restaurados.</p></div>`; return; }
    const r = x.resultado || {};
    const extra = [r.carteira === "retirado" ? `Cliente retirado da Carteira (${esc((r.meses || []).join(", "))}).` : "", r.contrato === "excluido" ? "Contrato a conferir excluído (volta junto ao restaurar)." : "", r.contrato === "mantido_conferido" ? "O contrato já conferido ficou em Contratos." : ""].filter(Boolean).join(" ");
    box.innerHTML = `<div class="panel"><h2 style="margin:0 0 4px">${esc((x.nome || "").toUpperCase())}</h2>
      <div class="meta">${[x.atendimento && "Atendimento: " + esc(x.atendimento), x.inicio && "Início: " + br(x.inicio), x.status === "concluido" ? "Estava concluído" : "Estava em andamento"].filter(Boolean).join(" · ")}</div>
      <div class="note warn" style="margin-top:12px">Excluído em ${esc(new Date(x.excluidoEm).toLocaleString("pt-BR"))} por ${esc(x.excluidoPor?.nome || "")}. ${extra}</div>
      <div class="row" style="margin-top:12px"><button class="btn primary" type="button" data-obrestaurar="${esc(x.id)}">Restaurar onboarding</button><span class="hint" id="obRestMsg" style="margin:0"></span></div></div>`;
  }

  // ---------- Render ----------
  const obEditing = () => { const a = document.activeElement; return !!(a && a.closest && a.closest("#obDetail") && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== "checkbox" && a.type !== "file"); };
  function renderOnb(){
    if (!$("#obList")) return;
    renderOnbList();
    if (obEditing()) { obPending = true; refreshMsgs(); return; }
    renderOnbDetail();
  }
  // Enquanto alguém digita, atualiza só os textos prontos (sem redesenhar os campos)
  function refreshMsgs(){
    const o = curOb(); if (!o) return;
    const act = document.activeElement;
    document.querySelectorAll("#obDetail details.st[open]").forEach(dt => {
      const tmp = document.createElement("div"); tmp.innerHTML = stepBody(o, dt.dataset.step);
      tmp.querySelectorAll('textarea[id^="msg_"]').forEach(t => { const live = document.getElementById(t.id); if (live && live !== act) live.value = t.value; });
    });
  }
  document.addEventListener("focusout", e => {
    if (!obPending || !e.target.closest?.("#obDetail")) return;
    setTimeout(() => { if (obPending && !obEditing()) { obPending = false; renderOnbDetail(); } }, 300);
  });

  function chipFor(o){
    if (o.status === "concluido") { const n = diaUtil(o); return `<span class="daychip ok">${n} dia${n>1?"s":""} út${n>1?"eis":"il"}</span>`; }
    if (planLate(o)) return `<span class="daychip late">Planejamento atrasado</span>`;
    return `<span class="daychip">Dia útil ${diaUtil(o)}</span>`;
  }
  function renderOnbList(){
    const vis = obs.filter(o => !obOcultos.has(o.id));
    const act = vis.filter(o => o.status !== "concluido"), done = vis.filter(o => o.status === "concluido");
    const media = done.length ? Math.round(done.reduce((s,o) => s + diaUtil(o), 0) / done.length * 10) / 10 : null;
    const late = act.filter(planLate).length;
    $("#obKpis").innerHTML = [
      [act.length, "Em andamento"],
      [done.length, "Concluídos"],
      [media == null ? "—" : String(media).replace(".", ","), "Média de dias úteis até concluir"],
      [late, "Planejamentos atrasados", late > 0],
    ].map(([v,l,al]) => `<div class="kpi${al ? " alert" : ""}"><b>${esc(v)}</b><span>${l}</span></div>`).join("");
    const fg = document.querySelector(".ob-filter");
    if (fg && obGestao() && !fg.querySelector('[data-obf="excluidos"]')) fg.insertAdjacentHTML("beforeend", `<button type="button" data-obf="excluidos" aria-pressed="false">Excluídos</button>`);
    if (obFilter === "excluidos" && !obGestao()) obFilter = "andamento";
    document.querySelectorAll("[data-obf]").forEach(b => b.setAttribute("aria-pressed", b.dataset.obf === obFilter));
    if (obFilter === "excluidos") {
      $("#obList").innerHTML = obExcl == null ? `<p class="muted" style="padding:8px 4px;margin:0">Carregando…</p>` : obExcl.map(x => `<button type="button" class="ob-card" data-obexsel="${esc(x.id)}" aria-current="${x.id === obExclSel}">
        <span class="nm" style="display:block">${esc((x.nome || "").toUpperCase())}</span>
        <span class="meta" style="display:block">Excluído em ${br(isoDay(x.excluidoEm))} por ${esc(x.excluidoPor?.nome || "")}</span></button>`).join("")
        || `<p class="muted" style="padding:8px 4px;margin:0">Nenhum onboarding excluído.</p>`;
      return;
    }
    const list = (obFilter === "concluido" ? done.slice().sort((a,b) => (b.concluidoEm||"").localeCompare(a.concluidoEm||"")) : act.slice().sort((a,b) => (a.inicio||"").localeCompare(b.inicio||"")));
    if (obsLoaded && obSel && !obs.find(o => o.id === obSel)) obSel = null;
    if (obsLoaded && !obSel) obSel = list[0]?.id || null;
    $("#obList").innerHTML = list.map(o => {
      const d = doneCount(o), nx = nextStep(o);
      return `<button type="button" class="ob-card" data-obsel="${esc(o.id)}" aria-current="${o.id === obSel}">
        <span class="row" style="justify-content:space-between;flex-wrap:nowrap"><span class="nm">${esc(NM(o))}</span>${chipFor(o)}</span>
        <span class="meta" style="display:block">${esc(o.atendimento || "Sem atendimento")} · início ${br(o.inicio)}</span>
        <span class="ob-prog${o.status === "concluido" ? " done" : ""}" style="display:block"><i style="width:${Math.round(d/stepsOf(o).length*100)}%"></i></span>
        <span class="next" style="display:block">${o.status === "concluido" ? `Concluído em ${br(isoDay(o.concluidoEm))}` : nx ? `Próximo: ${esc(nx.t)}` : "Todas as etapas feitas. Falta concluir."}</span>
      </button>`;
    }).join("") || `<p class="muted" style="padding:8px 4px;margin:0">${obFilter === "concluido" ? "Nenhum onboarding concluído ainda." : "Nenhum onboarding em andamento."}</p>`;
  }
  function renderOnbDetail(){
    const box = $("#obDetail"); if (!box) return;
    if (obFilter === "excluidos") return renderExcluidosDetail(box);
    if (!db) { box.innerHTML = `<div class="ob-empty"><h2>Sem conexão</h2><p class="muted">Recarregue a página ou entre de novo pela página inicial.</p></div>`; return; }
    const o = curOb();
    if (!o) { box.innerHTML = `<div class="ob-empty"><h2>Nenhum onboarding aberto</h2><p class="muted">Comece um onboarding assim que o cliente aceitar a proposta. O app guia cada etapa, gera as mensagens e conta os dias úteis até o fim.</p><button class="btn primary" type="button" data-obnew>Novo onboarding</button></div>`; return; }
    if (!obOpen.has(o.id)) { const nx = nextStep(o); obOpen.set(o.id, new Set(nx ? [nx.k] : [])); }
    const open = obOpen.get(o.id);
    const d = doneCount(o), f = o.ficha || {}, fim = fimContrato(f), p = o.planejamento || {};
    const concl = o.status === "concluido";
    const tl = PHASES.map(ph => {
      const ss = phSteps(o, ph).map(([k]) => k), ok = ss.filter(k => isDone(o,k)).length;
      if (ok === ss.length) { const last = ss.map(k => isoDay(o.etapas[k].em)).sort().pop(); return `<span class="ok">${ph.nome}: dia útil ${Math.max(1, bdCount(o.inicio, last))}</span>`; }
      return `<span>${ph.nome}: ${ok}/${ss.length}</span>`;
    }).join("");
    const big = [
      concl ? [`${diaUtil(o)}`, "dias úteis do início à conclusão"] : [`Dia ${diaUtil(o)}`, "dias úteis desde o início"],
      [`${d}/${stepsOf(o).length}`, "etapas concluídas"],
      [p.prazo ? br(p.prazo) : "—", isDone(o,"planejamento") ? "planejamento recebido" : planLate(o) ? "prazo do planejamento (atrasado)" : "prazo do planejamento"],
      [fim ? br(fim) : "—", "fim do contrato"],
    ];
    let h = (obExcluirArm === o.id ? confirmaExclusao(o) : "") + `<div class="panel">
      <div class="ob-head"><div><h2>${esc(NM(o))}</h2><div class="meta">${[o.atendimento && "Atendimento: " + esc(o.atendimento), o.contato && "Contato: " + esc(o.contato), "Início: " + br(o.inicio), "Material off: " + (o.materialOff === "sim" ? "sim" : o.materialOff === "nao" ? "não" : "a definir"), temTrafego(o) && "Com tráfego pago", o.repasse?.vai === "sim" && o.repasse?.para && "Repasse para " + esc(o.repasse.para)].filter(Boolean).join(" · ")}</div></div>
        <div class="row">${obGestao() ? `<button class="btn small danger" type="button" data-obexcluir="${esc(o.id)}">Excluir onboarding</button>` : ""}${concl ? `<span class="daychip ok">Concluído em ${br(isoDay(o.concluidoEm))}</span><button class="btn small" type="button" data-obreopen>Reabrir</button>` : `<button class="btn${d === stepsOf(o).length ? " primary" : ""}" type="button" data-obconclude>${d === stepsOf(o).length ? "Concluir onboarding" : `Concluir com ${stepsOf(o).length - d} etapa${stepsOf(o).length - d > 1 ? "s" : ""} em aberto`}</button>`}</div></div>
      ${concl ? `<div class="note ok" style="margin-top:12px">Onboarding concluído em <b>${diaUtil(o)} dias úteis</b>, de ${br(o.inicio)} a ${br(isoDay(o.concluidoEm))}.</div>` : ""}
      <div class="ob-big">${big.map(([b,s]) => `<div><b>${esc(b)}</b><span>${esc(s)}</span></div>`).join("")}</div>
      <div class="timeline">${tl}</div>
    </div>`;
    PHASES.forEach(ph => {
      const pss = phSteps(o, ph), ok = pss.filter(([k]) => isDone(o,k)).length;
      h += `<div class="phase"><div class="phase-h"><h3>${ph.nome}</h3><span>${ok} de ${pss.length}</span></div>`;
      pss.forEach(([k,t]) => {
        const dn = isDone(o,k), em = dn ? isoDay(o.etapas[k].em) : "";
        let meta = dn ? `${br(em)} · dia útil ${Math.max(1, bdCount(o.inicio, em))}` : "";
        if (!dn && k === "planejamento" && p.prazo) meta = planLate(o) ? `<span class="daychip late">Atrasado · prazo ${br(p.prazo)}</span>` : `prazo ${br(p.prazo)}`;
        h += `<details class="st${dn ? " done" : ""}" data-step="${k}"${open.has(k) ? " open" : ""}>
          <summary><button type="button" class="ck" data-toggle="${k}" aria-pressed="${dn}" aria-label="${dn ? "Reabrir" : "Marcar como feita"}: ${esc(t)}">${CHECK_SVG}</button><span class="st-t">${esc(t)}</span><span class="st-m">${meta}</span></summary>
          <div class="st-b">${open.has(k) ? stepBody(o,k) : ""}</div></details>`;
      });
      h += `</div>`;
    });
    const evs = o.eventos || [];
    h += `<div class="panel" style="margin-top:18px">
      <h2 style="margin-bottom:4px">Outras reuniões e eventos</h2>
      <p class="muted" style="margin:0 0 6px;font-size:13px">Opcional. Reuniões extras do onboarding (apresentação do planejamento, captação, alinhamentos).</p>
      ${evs.map(ev => `<div class="ev"><div><b>${esc(ev.titulo)}</b><div class="meta">${br(ev.data)} às ${esc(ev.hora || "10:00")} · ${esc(ev.dur || 30)} min${ev.conv ? " · " + esc(ev.conv) : ""}</div></div>
        <div class="row">${ext(calUrlAt(ev.titulo + " · " + NM(o), ev.data, ev.hora, ev.dur, `${NM(o)} · onboarding Quinze`, ev.conv), "Abrir na agenda", true)}<button class="btn small danger" type="button" data-evdel="${esc(ev.id)}">Remover</button></div></div>`).join("")}
      <div class="fgrid" style="margin-top:12px">
        <div class="full"><label class="f" for="ev_titulo">Evento</label><input id="ev_titulo" placeholder="Ex.: Apresentação do planejamento ao cliente"></div>
        <div><label class="f" for="ev_data">Data</label><input id="ev_data" type="date" value="${addBD(todayIso(),1)}"></div>
        <div><label class="f" for="ev_hora">Horário</label><input id="ev_hora" type="time" value="10:00"></div>
        <div><label class="f" for="ev_dur">Duração</label><select id="ev_dur">${[15,20,30,45,60,90,120].map(m => `<option value="${m}"${m===30?" selected":""}>${m} min</option>`).join("")}</select></div>
        <div><label class="f" for="ev_conv">Convidados (e-mails, opcional)</label><input id="ev_conv" placeholder="separados por vírgula"></div>
      </div>
      <div class="row" style="margin-top:10px"><button class="btn" type="button" data-evadd>Adicionar evento</button></div>
      <p class="hint">${MEET_HINT}</p>
    </div>`;
    box.innerHTML = h;
  }

  // ---------- Eventos ----------
  document.addEventListener("toggle", e => {
    const dt = e.target; if (!dt.matches || !dt.matches("details.st")) return;
    const o = curOb(); if (!o) return;
    const set = obOpen.get(o.id) || new Set(); obOpen.set(o.id, set);
    const k = dt.dataset.step;
    if (dt.open) { set.add(k); const b = dt.querySelector(".st-b"); if (b && !b.innerHTML.trim()) b.innerHTML = stepBody(o,k); }
    else set.delete(k);
  }, true);

  function toggleStep(k){
    const o = curOb(); if (!o) return;
    const ok = !isDone(o,k), now = new Date().toISOString();
    const patch = {etapas:{[k]:{ok, em: ok ? now : ""}}};
    if (k === "social" && ok && !o.planejamento?.prazo) patch.planejamento = {pedidoEm: todayIso(), prazo: addBD(todayIso(), 3)};
    if (k === "planejamento" && ok) patch.planejamento = {recebidoEm: todayIso()};
    if (ok) {
      const set = obOpen.get(o.id) || new Set(); set.delete(k);
      const ss = stepsOf(o), i = ss.findIndex(s => s.k === k);
      const nx = ss.slice(i+1).find(s => !isDone(o,s.k)) || ss.find(s => s.k !== k && !isDone(o,s.k));
      if (nx) set.add(nx.k);
      obOpen.set(o.id, set);
    }
    obSave(o.id, patch, ok ? (k === "social" && patch.planejamento ? `Etapa feita. Planejamento até ${br(patch.planejamento.prazo)}` : "Etapa feita") : "Etapa reaberta");
  }

  document.addEventListener("click", async e => {
    const gm = e.target.closest("a[data-gmail]");
    if (gm) { const o = curOb(); if (o) { const q = k => (document.querySelector('#obDetail [data-f="cobranca.' + k + '"]')?.value || "").trim(); gm.href = gmailUrl(q("marcilioEmail") || cob(o).marcilio, $("#msg_cbs")?.value || emailCobrancaAssunto(o), $("#msg_cbc")?.value || emailCobrancaCorpo(o)); } return; }
    const rp = e.target.closest("a[data-repasse]");
    if (rp) {
      const o = curOb(); if (!o) return;
      const q = k => (document.querySelector('#obDetail [data-f="repasse.' + k + '"]')?.value || "").trim();
      const para = q("para");
      const det = ($("#msg_rep")?.value || txtRepasse(o)).replace(/\*/g, "");
      rp.href = calUrlAt("Repasse do cliente " + NM(o) + (para ? " · " + para : ""), q("data") || addBD(todayIso(), 1), q("hora") || "10:00", Number(q("dur")) || 30, det, [ATEND_EMAIL, q("email")].filter(Boolean).join(","));
      return;
    }
    const mt = e.target.closest("a[data-meet]");
    if (mt) {
      const o = curOb(); if (!o) return;
      const q = k => (document.querySelector('#obDetail [data-f="notas.' + k + '"]')?.value || "").trim();
      const f = o.ficha || {}, L = o.links || {}, prazo = o.planejamento?.prazo || addBD(todayIso(), 3);
      const det = `Alinhamento sobre o cliente ${NM(o)}: percepções, primeiros passos e planejamento inicial (prazo ${br(prazo)}).\n\nPasta: ${L.pasta || "-"}\nBriefing: ${L.briefing || "-"}\nInstagram: ${ig(f) || "-"}\nRedes: ${redesTxt(f) || "-"}`;
      mt.href = calUrlAt("Alinhamento do cliente " + NM(o), q("reuniaoData") || addBD(todayIso(), 1), q("reuniaoHora") || "10:00", 20, det, q("smEmail"));
      return;
    }
    const c = e.target.closest("[data-copy]");
    if (c) { const ta = document.getElementById(c.dataset.copy); if (ta) copyText(ta.value, ta); return; }
    const ct = e.target.closest("[data-copytxt]");
    if (ct) { copyText(ct.dataset.copytxt); return; }
    if (e.target.closest("[data-copyhtml]")) {
      const o = curOb(); if (!o) return;
      const html = acessosHtml(o), plain = acessosPlain(o);
      try {
        await navigator.clipboard.write([new ClipboardItem({"text/html": new Blob([html], {type:"text/html"}), "text/plain": new Blob([plain], {type:"text/plain"})})]);
        toast("Tabela copiada. Cole no documento com Ctrl+V");
      } catch { copyText(plain); }
      return;
    }
    const tg = e.target.closest("[data-toggle]");
    if (tg) { e.preventDefault(); e.stopPropagation(); toggleStep(tg.dataset.toggle); return; }
    const gt = e.target.closest("[data-gotab]");
    if (gt) { const tb = document.querySelector(`nav.tabs button[data-tab="${gt.dataset.gotab}"]`); if (tb && !tb.hidden) { tb.click(); window.scrollTo({top:0}); } return; }
    const s = e.target.closest("[data-obsel]");
    if (s) { obSel = s.dataset.obsel; obDelArm = null; obExcluirArm = null; obPdfNote = null; obLeitura = null; try { localStorage.setItem("onb-sel", obSel); } catch {} renderOnbList(); renderOnbDetail(); if (window.innerWidth < 980) $("#obDetail").scrollIntoView({behavior:"smooth", block:"start"}); return; }
    const fb = e.target.closest("[data-obf]");
    if (fb) { obFilter = fb.dataset.obf; obSel = null; obExcluirArm = null; renderOnbList(); renderOnbDetail(); if (obFilter === "excluidos") { obExcl = null; carregarExcluidos(); } return; }
    const exs = e.target.closest("[data-obexsel]");
    if (exs) { obExclSel = exs.dataset.obexsel; renderOnbList(); renderOnbDetail(); return; }
    const exb = e.target.closest("[data-obexcluir]");
    if (exb) { obExcluirArm = exb.dataset.obexcluir; renderOnbDetail(); document.getElementById("obExcluirBox")?.scrollIntoView({behavior:"smooth", block:"start"}); return; }
    if (e.target.closest("[data-obexcancel]")) { obExcluirArm = null; renderOnbDetail(); return; }
    const exc = e.target.closest("[data-obexconf]");
    if (exc) {
      exc.disabled = true; const msg = document.getElementById("obExMsg"); if (msg) msg.textContent = "Excluindo…";
      try {
        const r = await onbApi("excluir", {id: exc.dataset.obexconf, retirarCarteira: !!document.getElementById("obExCart")?.checked, excluirContrato: !!document.getElementById("obExContr")?.checked});
        obExcluirArm = null; obSel = null; obOcultos.add(exc.dataset.obexconf); toast(r.msg); renderOnbList(); renderOnbDetail();
      } catch(err) { exc.disabled = false; if (msg) msg.textContent = err.message; }
      return;
    }
    const rst = e.target.closest("[data-obrestaurar]");
    if (rst) {
      rst.disabled = true;
      try { const r = await onbApi("restaurar", {id: rst.dataset.obrestaurar}); toast(r.msg); obOcultos.delete(r.onboardingId); obExclSel = null; obFilter = "andamento"; obSel = r.onboardingId; renderOnbList(); renderOnbDetail(); }
      catch(err) { rst.disabled = false; const m = document.getElementById("obRestMsg"); if (m) m.textContent = err.message; }
      return;
    }
    if (e.target.closest("[data-obnew]") || e.target.closest("#obNew")) { openObNew(); return; }
    if (e.target.closest("[data-obconclude]")) { const o = curOb(); if (o) { obFilter = "concluido"; } if (o) obSave(o.id, {status:"concluido", concluidoEm:new Date().toISOString()}, `Onboarding concluído em ${diaUtil(o)} dias úteis`); return; }
    if (e.target.closest("[data-obreopen]")) { const o = curOb(); if (o) { obFilter = "andamento"; obSave(o.id, {status:"andamento", concluidoEm:""}, "Onboarding reaberto"); } return; }
    if (e.target.closest("[data-evadd]")) {
      const o = curOb(); if (!o) return;
      const titulo = $("#ev_titulo").value.trim(), data = $("#ev_data").value;
      if (!titulo || !data) { toast("Preencha o nome e a data do evento."); return; }
      const ev = {id: Math.random().toString(36).slice(2,8), titulo, data, hora: $("#ev_hora").value || "10:00", dur: Number($("#ev_dur").value) || 30, conv: $("#ev_conv").value.trim()};
      obSave(o.id, {eventos: [...(o.eventos || []), ev]}, "Evento adicionado. Use “Abrir na agenda” para salvar no Google Agenda");
      return;
    }
    const evd = e.target.closest("[data-evdel]");
    if (evd) { const o = curOb(); if (o) obSave(o.id, {eventos: (o.eventos || []).filter(x => x.id !== evd.dataset.evdel)}, "Evento removido"); return; }
    const lc = e.target.closest("[data-lercontrato]"); if (lc) { lerContrato(lc.dataset.lercontrato); return; }
    const cf = e.target.closest("[data-conf]");
    if (cf) { if (cf.dataset.conf === "cancelar") { obLeitura = null; obPdfNote = null; renderOnbDetail(); } else aplicarLeitura(cf.dataset.conf === "todos"); return; }
    const rc = e.target.closest("[data-repcart]"); if (rc) { const o2 = curOb(); if (o2) aplicarRepasse(o2.id); return; }
    const ins = e.target.closest("[data-insert]");
    if (ins) { insertCarteira(ins.dataset.insert, ins); return; }
    if (e.target.closest("#obPropSave")) {
      const u = ($("#obPropUrl")?.value || "").trim();
      if (u && !/^https?:\/\//i.test(u)) { toast("O link precisa começar com https://"); return; }
      saveCfg({...cfg, propostaUrl: u}, u ? "Link do Gerador de Propostas salvo" : "Link removido");
    }
  });

  async function copyText(txt, ta){
    try { await navigator.clipboard.writeText(txt); toast("Copiado"); return; } catch {}
    if (ta) { ta.focus(); ta.select(); try { if (document.execCommand("copy")) { toast("Copiado"); return; } } catch {} }
    const t2 = $("#copyTxt"); t2.value = txt; $("#dlgCopy").showModal(); t2.focus(); t2.select();
  }

  document.addEventListener("change", e => {
    const o = curOb(); if (!o) return;
    if (e.target.id === "obPdf") { const file = e.target.files?.[0]; e.target.value = ""; readPdf(file); return; }
    const a = e.target.closest("#obDetail [data-auto]");
    if (a) {
      const auto = {...(o.auto||{}), [a.dataset.auto]: a.checked};
      const patch = {auto: {[a.dataset.auto]: a.checked}};
      if (AUTO.every(([k]) => auto[k]) && !isDone(o,"automacao")) { patch.etapas = {automacao:{ok:true, em:new Date().toISOString()}}; const set = obOpen.get(o.id); if (set) { set.delete("automacao"); set.add("estrutura"); } }
      obSave(o.id, patch, patch.etapas ? "Automação conferida" : null);
      return;
    }
    const rd = e.target.closest("#obDetail [data-rede]");
    if (rd) { obSave(o.id, {ficha: {redes: [...document.querySelectorAll("#obDetail [data-rede]:checked")].map(x => x.dataset.rede)}}); return; }
    const f = e.target.closest("#obDetail [data-f]"); if (!f) return;
    let v = f.value.trim();
    if (f.type === "number") v = v === "" ? "" : Number(v);
    if (f.dataset.f === "nome" && !v) { toast("O nome do cliente não pode ficar vazio."); return; }
    const patch = setPath(f.dataset.f, v);
    if (f.dataset.f.startsWith("carteira.")) {
      // grava também os valores padrão mostrados, para não se perderem
      const c = {}; document.querySelectorAll('#obDetail [data-f^="carteira."]').forEach(x => { const k = x.dataset.f.slice(9); c[k] = x.type === "number" ? (x.value === "" ? "" : Number(x.value)) : x.value.trim(); });
      patch.carteira = c;
    }
    if (f.dataset.f === "repasse.vai") {
      if (v === "nao" && !isDone(o,"repasse")) patch.etapas = {repasse: {ok: true, em: new Date().toISOString()}};
      obPending = false; obSave(o.id, patch, v === "nao" ? "Sem repasse. Etapa concluída" : null).then(ok => { if (ok && (o.repasseOrigem || (v === "sim" && o.repasse?.para))) aplicarRepasse(o.id); }); return;
    }
    if (f.dataset.f === "repasse.para") { obPending = false; obSave(o.id, patch).then(ok => { if (ok && v) aplicarRepasse(o.id); }); return; }
    if (f.dataset.f === "cobranca.marcilioEmail" && v && v !== cfg.marcilioEmail) { const next = {...cfg, marcilioEmail: v}; db.doc("config/geral").set(next).then(() => { cfg = next; }).catch(() => {}); }
    obPending = true;
    obSave(o.id, patch);
  });
  document.addEventListener("dragover", e => { const d = e.target.closest?.("#obDrop"); if (!d) return; e.preventDefault(); d.classList.add("over"); });
  document.addEventListener("dragleave", e => { const d = e.target.closest?.("#obDrop"); if (d) d.classList.remove("over"); });
  document.addEventListener("drop", e => { const d = e.target.closest?.("#obDrop"); if (!d) return; e.preventDefault(); d.classList.remove("over"); readPdf(e.dataTransfer?.files?.[0]); });

  async function insertCarteira(id, btn){
    const o = obs.find(x => x.id === id); if (!o || !db) return;
    const g = k => (document.querySelector('#obDetail [data-f="carteira.' + k + '"]')?.value || "").trim();
    const mes = g("mes"); if (!mes) { toast("Escolha o mês da carteira."); return; }
    let at = g("atendimento"); if (at === "__novo") at = g("atendimentoNovo").toUpperCase();
    let sm = g("social"); if (sm === "__novo") sm = g("socialNovo").toUpperCase();
    if (g("atendimento") === "__novo" && !at) { toast("Digite o nome do novo atendimento."); return; }
    if (g("social") === "__novo" && !sm) { toast("Digite o nome da nova social media."); return; }
    const nome = g("nome").toUpperCase(); if (!nome) { toast("Digite o nome do cliente na carteira."); return; }
    const f = o.ficha || {};
    const cidade = titleCity(f.cidade || "");
    const cid = o.carteira?.inserido?.id || slug(nome);
    const data = {nome, nivel: g("nivel") || "C", tipo: g("tipo"), atendimento: at, social: sm,
      conteudos: num(g("conteudos")), motions: num(g("motions")), gravacao: num(g("gravacao")),
      cidade, uf: cidade ? (f.uf || "") : "", materialOff: g("materialOff") === "sim", obs: g("obs"), status: "ativo", atualizadoEm: new Date().toISOString()};
    const alvo = [mes, ...(document.getElementById("obLater")?.checked ? months.filter(m => m > mes) : [])];
    if (btn) btn.disabled = true;
    try {
      for (const m of alvo) await db.collection("meses/" + m + "/clientes").doc(cid).set(data);
      const next = {...cfg}; let changed = false;
      if (at && !(cfg.atendimentos||[]).includes(at)) { next.atendimentos = [...(cfg.atendimentos||[]), at]; changed = true; }
      if (sm && !(cfg.socials||[]).includes(sm)) { next.socials = [...(cfg.socials||[]), sm]; changed = true; }
      if (changed) { await db.doc("config/geral").set(next); cfg = next; }
      await obSave(id, {carteira: {mes, nome, nivel: data.nivel, tipo: data.tipo, atendimento: at, social: sm, conteudos: data.conteudos, motions: data.motions, gravacao: data.gravacao, materialOff: g("materialOff"), obs: data.obs, inserido: {mes, id: cid, em: new Date().toISOString()}},
        etapas: {carteira: {ok: true, em: o.etapas?.carteira?.em || new Date().toISOString()}}});
      toast(`${nome} está na carteira de ${mLabel(mes).toLowerCase()}${alvo.length > 1 ? " e seguintes" : ""}`);
    } catch(err) { toast(friendly(err)); }
    finally { if (btn) btn.disabled = false; }
  }

  // Novo onboarding
  function openObNew(){
    if (!db) { toast("Sem conexão com o banco de dados."); return; }
    const ats = people("atendimentos","atendimento");
    $("#ob_at").innerHTML = `<option value="">Escolha</option>` + ats.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join("") + `<option value="__novo">Outro (novo nome)…</option>`;
    $("#ob_atNovo").hidden = true; $("#ob_atNovo").value = "";
    $("#ob_nome").value = ""; $("#ob_contato").value = ""; $("#ob_inicio").value = todayIso(); $("#ob_off").value = ""; $("#ob_err").textContent = "";
    $("#dlgOb").showModal(); setTimeout(() => $("#ob_nome").focus(), 30);
  }
  $("#ob_at").addEventListener("change", () => { $("#ob_atNovo").hidden = $("#ob_at").value !== "__novo"; if (!$("#ob_atNovo").hidden) $("#ob_atNovo").focus(); });
  $("#obCancel").addEventListener("click", () => $("#dlgOb").close());
  $("#frmOb").addEventListener("submit", async e => {
    e.preventDefault();
    const nome = $("#ob_nome").value.trim(); if (!nome) return;
    if (!$("#ob_off").value) { $("#ob_err").textContent = "Informe se o cliente envolve material off."; return; }
    let at = $("#ob_at").value; if (at === "__novo") at = $("#ob_atNovo").value.trim().toUpperCase();
    const id = slug(nome);
    try {
      await obRef(id).set({nome, contato: $("#ob_contato").value.trim(), inicio: $("#ob_inicio").value || todayIso(), atendimento: at, materialOff: $("#ob_off").value, status: "andamento",
        criadoEm: new Date().toISOString(), atualizadoEm: new Date().toISOString(), etapas: {}, ficha: {}, links: {}, carteira: {}, notas: {}, planejamento: {}});
      obSel = id; obFilter = "andamento"; try { localStorage.setItem("onb-sel", id); } catch {}
      $("#dlgOb").close(); toast("Onboarding iniciado");
      document.querySelectorAll("nav.tabs button").forEach(x => x.setAttribute("aria-selected", x.dataset.tab === "onb")); showSections("onb");
    } catch(err) { $("#ob_err").textContent = friendly(err); }
  });


