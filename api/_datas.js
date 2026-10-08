// Datas no horário de Fortaleza (UTC-3, sem horário de verão), usadas pelo Atendimento (tarefas, relatório, pendências).
const FUSO = "America/Fortaleza";
const fmtData = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO });
const fmtHora = new Intl.DateTimeFormat("en-GB", { timeZone: FUSO, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

export const hojeLocal = (agora = new Date()) => fmtData.format(agora);                 // "2026-10-08"
export const horaLocal = (agora = new Date()) => fmtHora.format(agora);                 // "20:05"
export const dataLocal = iso => (iso ? fmtData.format(new Date(iso)) : "");             // instante ISO -> dia local
const d = iso => new Date(iso + "T12:00:00Z");
const fmt = dt => dt.toISOString().slice(0, 10);
export const diaSemana = iso => d(iso).getUTCDay();                                     // 0 = domingo
export const somarDias = (iso, n) => { const x = d(iso); x.setUTCDate(x.getUTCDate() + n); return fmt(x); };
export const diasEntre = (a, b) => Math.round((d(b) - d(a)) / 864e5);                   // b - a, em dias corridos
export const ehDiaUtil = iso => ![0, 6].includes(diaSemana(iso));
export function somarDiasUteis(iso, n) {
  let x = iso, k = 0;
  while (k < n) { x = somarDias(x, 1); if (ehDiaUtil(x)) k++; }
  return x;
}
export const proximoDiaUtil = iso => somarDiasUteis(iso, 1);
export function somarMeses(iso, meses) {
  const [y, m, dd] = iso.split("-").map(Number);
  const alvo = new Date(Date.UTC(y, m - 1 + meses, 1, 12));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0, 12)).getUTCDate();
  alvo.setUTCDate(Math.min(dd, ultimo));
  return fmt(alvo);
}
export const br = iso => (iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4) : "");
export const brCurta = iso => (iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) : "");
