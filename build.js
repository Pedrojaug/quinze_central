// Monta o site em public/: copia os arquivos estáticos e junta src/app.html + src/js/*.js (em ordem).
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
for (const f of fs.readdirSync("modulos")) copy(path.join("modulos", f));

const partes = fs.readdirSync("src/js").filter(f => f.endsWith(".js")).sort();
const js = partes.map(f => `// ===== ${f} =====\n` + fs.readFileSync(path.join("src/js", f), "utf8")).join("\n");
if (/<\/script/i.test(js)) throw new Error("O código não pode conter </script>");
const html = fs.readFileSync("src/app.html", "utf8").replace("<!--APP_JS-->", `<script>\n(function(){\n${js}\n})();\n</script>`);
fs.writeFileSync(path.join(OUT, "app.html"), html);
console.log(`public/ pronto: app.html com ${partes.length} partes (${Math.round(html.length / 1024)} KB)`);
