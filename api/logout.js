import { clearSession } from "./_lib.js";

export default function handler(req, res) {
  clearSession(res);
  if (req.method === "GET") { res.statusCode = 302; res.setHeader("Location", "/"); return res.end(); }
  return res.status(200).json({ ok: true });
}
