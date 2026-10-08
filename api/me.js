import { session } from "./_lib.js";
import { publico, areasPublicas, PERFIS } from "./_modules.js";
import { eticaPendente } from "./_pol.js";

// Quem está logado, que módulos e abas pode usar (monta a tela de módulos e o menu).
export default async function handler(req, res) {
  const u = await session(req);
  if (!u) return res.status(401).json({ error: "unauthorized" });
  let pendencias = {};
  try { if (!u.trocarSenha && await eticaPendente(u)) pendencias.etica = true; } catch { /* aviso é opcional */ }
  return res.status(200).json({
    login: u.login, nome: u.nome, papel: u.papel, funcao: u.funcao, perfil: PERFIS[u.funcao] || u.funcao,
    auth: u.auth, trocarSenha: u.trocarSenha, podeEnviarPecas: u.podeEnviarPecas,
    abas: u.trocarSenha ? [] : u.abas,
    modulos: u.trocarSenha ? [] : publico(u.abas),
    areas: u.trocarSenha ? [] : areasPublicas(u.areas, u.abas),
    pendencias,
  });
}
