// Validação estática e de build do projeto (usado em `npm run check` e no CI).
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { spawnSync } from "node:child_process";

const RAIZ = process.cwd();
const PASTAS_JS = ["api", "modulos", "src/js", "scripts", "tests"];
const ARQUIVOS_RAIZ = ["build.js", "store.js"];

function coletarJs(dir) {
  const abs = path.join(RAIZ, dir);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...coletarJs(rel));
    else if (entry.isFile() && entry.name.endsWith(".js")) out.push(rel);
  }
  return out;
}

function checarSintaxe(arquivo) {
  const r = spawnSync(process.execPath, ["--check", arquivo], { encoding: "utf8" });
  if (r.status !== 0) {
    console.error(`Erro de sintaxe em ${arquivo}:\n${r.stderr || r.stdout}`);
    process.exit(1);
  }
}

const arquivosFonte = [
  ...ARQUIVOS_RAIZ.filter(f => fs.existsSync(path.join(RAIZ, f))),
  ...PASTAS_JS.flatMap(coletarJs).sort(),
];

for (const arq of arquivosFonte) {
  checarSintaxe(arq);
}

const buildRes = spawnSync(process.execPath, ["build.js"], { stdio: "inherit" });
if (buildRes.status !== 0) {
  console.error("Falha ao executar build.js.");
  process.exit(buildRes.status || 1);
}

const arquivosPublicModulos = coletarJs("public/modulos").sort();
for (const arq of arquivosPublicModulos) {
  checarSintaxe(arq);
}

const appHtmlPath = path.join(RAIZ, "public", "app.html");
const appHtml = fs.readFileSync(appHtmlPath, "utf8");
const reScriptInline = /<script>([\s\S]*?)<\/script>/gi;
let scriptsInlineValidados = 0;
let match;
while ((match = reScriptInline.exec(appHtml)) !== null) {
  new vm.Script(match[1], { filename: "public/app.html" });
  scriptsInlineValidados++;
}
if (!scriptsInlineValidados) {
  console.error("Nenhum bloco <script> inline encontrado em public/app.html.");
  process.exit(1);
}

console.log(
  `check ok: ${arquivosFonte.length} arquivos JS fonte + build.js + ${arquivosPublicModulos.length} módulos em public/ + bundle public/app.html validados.`
);
