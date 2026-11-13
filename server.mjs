import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { validateLead } from "./public/lead.js";

const publicDir = new URL("./public/", import.meta.url);
const port = Number(process.env.PORT || 4180);
const host = process.env.HOST || "127.0.0.1";
const webhookToken = process.env.LEAD_WEBHOOK_TOKEN;
const files = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/styles.css", "styles.css"],
  ["/app.js", "app.js"],
  ["/lead.js", "lead.js"],
  ...["marca.svg", "simbolo.svg", "simbolo-escuro.svg", "simbolo-lima.svg", "glass-normal.png", "IsidoraSans-Regular.ttf", "IsidoraSans-SemiBold.ttf"]
    .map(name => ["/assets/" + name, "assets/" + name]),
]);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ttf": "font/ttf",
};

function configuredUrl(name) {
  if (!process.env[name]) return "";
  const url = new URL(process.env[name]);
  const testLoopback = name === "LEAD_WEBHOOK_URL" && process.env.NODE_ENV === "test"
    && url.protocol === "http:" && url.hostname === "127.0.0.1";
  if ((url.protocol !== "https:" && !testLoopback) || url.username || url.password) {
    throw new Error(name + " deve ser uma URL HTTPS sem credenciais embutidas.");
  }
  return url.href;
}

const webhookUrl = configuredUrl("LEAD_WEBHOOK_URL");
const privacyUrl = configuredUrl("PRIVACY_POLICY_URL");
const attempts = new Map();
const rateWindow = 10 * 60 * 1000;

const cleanup = setInterval(() => {
  for (const [ip, record] of attempts) {
    if (record.expires <= Date.now()) attempts.delete(ip);
  }
}, rateWindow);
cleanup.unref();

function limit(ip) {
  const now = Date.now();
  const previous = attempts.get(ip);
  if (!previous || previous.expires <= now) {
    if (!previous && attempts.size >= 10000) return rateWindow / 1000;
    attempts.set(ip, { count: 1, expires: now + rateWindow });
    return 0;
  }
  previous.count += 1;
  return previous.count > 8 ? Math.ceil((previous.expires - now) / 1000) : 0;
}

function json(res, code, body) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

async function receiveLead(req, res) {
  if (req.method === "GET") return json(res, 200, { available: Boolean(webhookUrl), privacyUrl });
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return json(res, 405, { message: "Método indisponível." });
  }
  if (!webhookUrl) return json(res, 503, { message: "O envio do formulário está indisponível no momento." });

  const origin = req.headers.origin ? URL.parse(req.headers.origin) : null;
  if (req.headers["sec-fetch-site"] === "cross-site"
    || (req.headers.origin && origin?.host !== req.headers.host)) {
    return json(res, 403, { message: "Envie o formulário pela página da IA de Primeira." });
  }
  if (req.headers["content-type"]?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return json(res, 415, { message: "Formato de envio inválido." });
  }

  const retryAfter = limit(req.socket.remoteAddress);
  if (retryAfter) {
    res.setHeader("Retry-After", retryAfter);
    return json(res, 429, { message: "Muitas tentativas de envio. Aguarde alguns minutos e tente novamente." });
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 12_000) {
      res.setHeader("Connection", "close");
      json(res, 413, { message: "O formulário excedeu o tamanho permitido." });
      return;
    }
    chunks.push(chunk);
  }

  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return json(res, 400, { message: "Confira o preenchimento e tente novamente." });
  }
  if (!body || typeof body !== "object" || Array.isArray(body) || body.site) {
    return json(res, 400, { message: "Confira o preenchimento e tente novamente." });
  }

  const { data, errors } = validateLead(body);
  if (Object.keys(errors).length) {
    return json(res, 422, { message: "Confira os campos indicados e tente novamente.", errors });
  }

  try {
    const headers = { "Content-Type": "application/json" };
    if (webhookToken) headers.Authorization = "Bearer " + webhookToken;
    const upstream = await fetch(webhookUrl, {
      method: "POST",
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({ ...data, whatsapp: "+55" + data.whatsapp, consentimentoEm: new Date().toISOString() }),
    });
    await upstream.body?.cancel();
    if (!upstream.ok) return json(res, 502, { message: "O recebimento está indisponível no momento. Tente novamente em instantes." });
    return json(res, 201, { ok: true });
  } catch {
    return json(res, 502, { message: "Não foi possível confirmar o envio. Tente novamente em instantes." });
  }
}

const server = createServer(async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Content-Security-Policy", "default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  try {
    const path = new URL(req.url, "http://localhost").pathname;
    if (path === "/api/leads") return await receiveLead(req, res);
    const file = files.get(path);
    if (!file || !["GET", "HEAD"].includes(req.method)) return json(res, 404, { message: "Página não encontrada." });
    const contents = await readFile(new URL(file, publicDir));
    res.writeHead(200, {
      "Content-Type": mime[extname(file)],
      "Content-Length": contents.length,
      "Cache-Control": file.startsWith("assets/") ? "public, max-age=86400" : "no-cache",
    });
    res.end(req.method === "HEAD" ? undefined : contents);
  } catch {
    if (!res.headersSent) json(res, 500, { message: "Serviço indisponível no momento." });
    else res.end();
  }
});

server.listen(port, host, () => console.log("IA de Primeira disponível em http://" + host + ":" + port));
