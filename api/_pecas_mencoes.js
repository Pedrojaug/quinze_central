// Resolução de menções (@) e leitura/marcação de notificações em eventos de peças.
export const normTextoMencao = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

// Extrai usuários mencionados por @Nome ou @login no texto do comentário/observação, somados aos logins explicitamente marcados.
export function resolverMencoes(texto, mencoesInput, todosUsuarios, autorLogin) {
  const selecionados = new Map();
  const ativos = (todosUsuarios || []).filter(x => x.login && x.login !== "equipe.inteligentte");
  const porLogin = new Map(ativos.map(x => [x.login.toLowerCase(), x]));

  if (Array.isArray(mencoesInput)) {
    for (const raw of mencoesInput) {
      const lg = String(raw && typeof raw === "object" ? raw.login : raw || "").trim().toLowerCase();
      const u = porLogin.get(lg);
      if (u && u.login !== autorLogin) selecionados.set(u.login, { login: u.login, nome: u.nome || u.login });
    }
  }

  const txtNorm = normTextoMencao(texto);
  if (txtNorm.includes("@")) {
    // Ordena por nomes mais longos primeiro para casar "@André Silva" antes de "@André"
    const ordenados = [...ativos].sort((a, b) => (b.nome || b.login).length - (a.nome || a.login).length);
    for (const u of ordenados) {
      if (u.login === autorLogin || selecionados.has(u.login)) continue;
      const nomeNorm = normTextoMencao(u.nome || "");
      const primeiroNome = nomeNorm.split(/\s+/)[0] || "";
      const loginNorm = normTextoMencao(u.login);
      const candidatos = [nomeNorm, loginNorm, primeiroNome.length >= 3 ? primeiroNome : ""].filter(Boolean);
      for (const cand of candidatos) {
        const escRe = cand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const re = new RegExp(`(^|[\\s([{"'])@${escRe}(?=$|[\\s.,!?;:)\\]}"'])`, "i");
        if (re.test(txtNorm)) {
          selecionados.set(u.login, { login: u.login, nome: u.nome || u.login });
          break;
        }
      }
    }
  }
  return [...selecionados.values()];
}

export function eventoNotificaUsuario(p, h, login) {
  if (!login || !h || h.por?.login === login) return false;
  const listaM = Array.isArray(h.mencoes) ? h.mencoes : [];
  if (listaM.some(m => (m.login || m) === login)) return true;
  // O designer/remetente que enviou a peça sempre é notificado quando a peça recebe comentário, pedido de alteração ou reprovação
  if (p?.remetente?.login === login && ["comentario", "alteracao_solicitada", "reprovada"].includes(h.tipo)) {
    return true;
  }
  return false;
}

export function mencoesNaoLidasPara(p, login) {
  if (!login || !Array.isArray(p.historico)) return [];
  const out = [];
  const souRemetente = p?.remetente?.login === login;
  p.historico.forEach((h, idx) => {
    if (!eventoNotificaUsuario(p, h, login)) return;
    const vistos = Array.isArray(h.vistoPor) ? h.vistoPor : [];
    if (vistos.includes(login)) return;
    const listaM = Array.isArray(h.mencoes) ? h.mencoes : [];
    const foiMencionado = listaM.some(m => (m.login || m) === login);
    out.push({
      hid: h.id || `${p.id}_${idx}`,
      pecaId: p.id,
      pecaTitulo: p.titulo,
      clienteNome: p.clienteNome,
      statusPeca: p.status,
      versao: h.versao || p.versao || 1,
      tipo: h.tipo,
      souRemetente,
      foiMencionado,
      em: h.em,
      por: h.por || { login: "", nome: "Alguém" },
      comentario: h.comentario || "",
    });
  });
  return out;
}

export function marcarMencoesLidasNaPeca(p, login, hidAlvo = null) {
  if (!login || !Array.isArray(p.historico)) return false;
  let alterou = false;
  p.historico.forEach((h, idx) => {
    const hid = h.id || `${p.id}_${idx}`;
    if (hidAlvo && hid !== hidAlvo) return;
    if (!eventoNotificaUsuario(p, h, login)) return;
    h.vistoPor = Array.isArray(h.vistoPor) ? h.vistoPor : [];
    if (!h.vistoPor.includes(login)) {
      h.vistoPor.push(login);
      alterou = true;
    }
  });
  return alterou;
}
