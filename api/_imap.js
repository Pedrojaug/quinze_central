import tls from "node:tls";

// Confere e-mail e senha direto no servidor IMAP da Locaweb. Nada é guardado.
// Resposta: "ok" | "invalid" | "error" | "timeout"
export function imapLogin(user, pass, opts = {}) {
  const host = opts.host || process.env.IMAP_HOST || "email-ssl.com.br";
  const port = Number(opts.port || process.env.IMAP_PORT || 993);
  return new Promise(resolve => {
    let buf = "", stage = 0, done = false;
    const sock = tls.connect({ host, port, servername: host });
    const finish = r => { if (done) return; done = true; clearTimeout(timer); try { sock.end(); } catch {} resolve(r); };
    const timer = setTimeout(() => { finish("timeout"); try { sock.destroy(); } catch {} }, opts.timeout || 9000);
    const q = s => '"' + String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
    sock.setEncoding("utf8");
    sock.on("error", () => finish("error"));
    sock.on("close", () => finish("error"));
    sock.on("data", d => {
      buf += d;
      let i;
      while ((i = buf.indexOf("\r\n")) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        if (stage === 0) {
          if (/^\* (OK|PREAUTH)/i.test(line)) { stage = 1; sock.write(`a1 LOGIN ${q(user)} ${q(pass)}\r\n`); }
          else if (/^\* (BYE|NO|BAD)/i.test(line)) finish("error");
        } else if (stage === 1 && /^a1 /i.test(line)) {
          const ok = /^a1 OK/i.test(line);
          stage = 2;
          try { sock.write("a2 LOGOUT\r\n"); } catch {}
          finish(ok ? "ok" : "invalid");
        }
      }
    });
  });
}
