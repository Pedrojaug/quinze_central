// Monta o site em public/: copia os arquivos estáticos, junta src/app.html + src/js/*.js (em ordem)
// e compila módulos em pasta (modulos/<nome>/*.js) para public/modulos/<nome>.js.
// Roda na Vercel a cada publicação (buildCommand) e localmente para testes: node build.js
import fs from "node:fs";
import path from "node:path";

const OUT = "public";
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const copy = (src, dst = src) => {
  fs.mkdirSync(path.dirname(path.join(OUT, dst)), { recursive: true });
  fs.copyFileSync(src, path.join(OUT, dst));
};

["index.html", "pop.html", "store.js", "logo.png"].forEach(f => copy(f));
copy("src/app.css", "app.css");

const entriesModulos = fs.readdirSync("modulos", { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
const nomesModulos = new Set();
const modulosCompilados = [];
for (const entry of entriesModulos) {
  if (entry.isDirectory()) {
    const nome = entry.name;
    if (nomesModulos.has(nome)) throw new Error(`Conflito de módulo: existe arquivo e pasta para "${nome}".`);
    nomesModulos.add(nome);
    const dirMod = path.join("modulos", nome);
    const arqs = fs.readdirSync(dirMod).filter(f => f.endsWith(".js")).sort();
    if (!arqs.length) throw new Error(`Pasta de módulo vazia: ${dirMod}`);
    const body = arqs.map(f => `// ===== ${f} =====\n` + fs.readFileSync(path.join(dirMod, f), "utf8")).join("\n");
    const guarda = `__qzMod_${nome.replace(/[^A-Za-z0-9_]/g, "_")}`;
    const bundle = `(function () {\n  if (window.${guarda}) return; window.${guarda} = true;\n${body}\n})();\n`;
    const dst = path.join(OUT, "modulos", `${nome}.js`);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.writeFileSync(dst, bundle);
    modulosCompilados.push(`${nome}.js (${arqs.length} partes)`);
  } else if (entry.isFile()) {
    if (entry.name.endsWith(".js")) {
      const nome = entry.name.slice(0, -3);
      if (nomesModulos.has(nome)) throw new Error(`Conflito de módulo: existe arquivo e pasta para "${nome}".`);
      nomesModulos.add(nome);
    }
    copy(path.join("modulos", entry.name));
  }
}

const partes = fs.readdirSync("src/js").filter(f => f.endsWith(".js")).sort();
const js = partes.map(f => `// ===== ${f} =====\n` + fs.readFileSync(path.join("src/js", f), "utf8")).join("\n");
if (/<\/script/i.test(js)) throw new Error("O código não pode conter </script>");
const html = fs.readFileSync("src/app.html", "utf8").replace("<!--APP_JS-->", `<script>\n(function(){\n${js}\n})();\n</script>`);
fs.writeFileSync(path.join(OUT, "app.html"), html);
console.log(`public/ pronto: app.html com ${partes.length} partes (${Math.round(html.length / 1024)} KB)${modulosCompilados.length ? ` | módulos: ${modulosCompilados.join(", ")}` : ""}`);
