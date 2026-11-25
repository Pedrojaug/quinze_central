// Validação estática, guardrails de arquitetura e build do projeto (usado em `npm run check` e no CI).
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { listarMigrations } from "./migrate.js";

const RAIZ = process.cwd();
const PASTAS_JS = ["api", "modulos", "src/js", "scripts", "tests"];
const ARQUIVOS_RAIZ = ["build.js", "store.js"];

export const ENDPOINTS_API_PERMITIDOS = new Set([
  "doc.js",
  "health.js",
  "ics.js",
  "login.js",
  "logout.js",
  "m.js",
  "me.js",
  "senha.js",
  "sync.js",
  "users.js",
]);
export const MAX_ENDPOINTS_VERCEL = 12;

export function validarEndpointsApi(nomesArquivosRaizApi = []) {
  const publicos = nomesArquivosRaizApi
    .filter(n => n.endsWith(".js") && !n.startsWith("_"))
    .sort();
  const extras = publicos.filter(n => !ENDPOINTS_API_PERMITIDOS.has(n));
  if (extras.length) {
    throw new Error(`Endpoint(s) sem prefixo "_" não permitido(s) em api/: ${extras.join(", ")}. Use prefixo "_" e exponha via api/m.js.`);
  }
  if (publicos.length > MAX_ENDPOINTS_VERCEL) {
    throw new Error(`Limite de funções da Vercel excedido: ${publicos.length} > ${MAX_ENDPOINTS_VERCEL}.`);
  }
  return publicos;
}

export function removerComentariosJs(src) {
  return String(src || "")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\r\n]*/g, " ");
}

export function contemDdlRuntime(src) {
  const limpo = removerComentariosJs(src);
  return /\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|INDEX|SEQUENCE|SCHEMA)\b/i.test(limpo);
}

export function validarImportsDinamicosM(srcM) {
  const limpo = removerComentariosJs(srcM);
  const re = /\bimport\s*\(([^)]*)\)/g;
  const invalidos = [];
  let match;
  while ((match = re.exec(limpo)) !== null) {
    if (!/^\s*["']\.\/_[A-Za-z0-9_.-]+\.js["']\s*$/.test(match[1])) {
      invalidos.push(match[1].trim());
    }
  }
  if (invalidos.length) {
    throw new Error(`import() dinâmico inválido em api/m.js (${invalidos.join(", ")}). Use apenas literais estáticos "./_arquivo.js".`);
  }
}

export function validarMigrationsDir(dir) {
  return listarMigrations(dir);
}

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

function executarCheck() {
  const arquivosFonte = [
    ...ARQUIVOS_RAIZ.filter(f => fs.existsSync(path.join(RAIZ, f))),
    ...PASTAS_JS.flatMap(coletarJs).sort(),
  ];

  for (const arq of arquivosFonte) {
    checarSintaxe(arq);
  }

  const raizApi = fs.readdirSync(path.join(RAIZ, "api"), { withFileTypes: true })
    .filter(e => e.isFile() && e.name.endsWith(".js"))
    .map(e => e.name);
  const publicosApi = validarEndpointsApi(raizApi);

  const arquivosApi = coletarJs("api").sort();
  for (const arq of arquivosApi) {
    const src = fs.readFileSync(path.join(RAIZ, arq), "utf8");
    if (contemDdlRuntime(src)) {
      throw new Error(`DDL em runtime proibido em ${arq}. Use migrations SQL em migrations/.`);
    }
  }

  validarImportsDinamicosM(fs.readFileSync(path.join(RAIZ, "api", "m.js"), "utf8"));
  const migrations = validarMigrationsDir(path.join(RAIZ, "migrations"));

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
    `check ok: ${arquivosFonte.length} arquivos JS fonte + ${publicosApi.length}/${MAX_ENDPOINTS_VERCEL} endpoints api/ + ${migrations.length} migration(s) + build.js + ${arquivosPublicModulos.length} módulos em public/ + bundle public/app.html validados.`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    executarCheck();
  } catch (err) {
    console.error(err?.message || err);
    process.exit(1);
  }
}
