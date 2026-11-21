// Run the ping pong tournament competition server locally:
//   node local-server.js      then open http://localhost:3000
const http = require("http");
const fs = require("fs");
const path = require("path");
const Module = require("module");

// Load .env
const envFile = path.join(__dirname, ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
if (!process.env.QR_SECRET) process.env.QR_SECRET = "pingpong_tournament_secret_key_2026";
if (!process.env.ADMIN_TOKEN) process.env.ADMIN_TOKEN = "eco-aware can access the admin mode";

const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "data.json");
const { generateExcelDatabase } = require("./export_excel.js");
let db = {};
try { db = JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); } catch { db = {}; }
const save = () => {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
  try { generateExcelDatabase(); } catch (err) { console.error("Auto-excel sync error:", err); }
};

const localStore = {
  async get(key) {
    return db[key] === undefined ? null : structuredClone(db[key]);
  },
  async setJSON(key, value) {
    if (value === null) {
      delete db[key];
    } else {
      db[key] = structuredClone(value);
    }
    save();
  },
  async list({ prefix = "" } = {}) {
    return { blobs: Object.keys(db).filter((k) => k.startsWith(prefix)).map((key) => ({ key })) };
  },
  async delete(key) {
    delete db[key];
    save();
  },
};

process.env.LOCAL_STORAGE = "1";

const originalLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === "@netlify/blobs") return { getStore: () => localStore };
  return originalLoad.call(this, request, ...rest);
};

const { handler } = require("./netlify/functions/api.js");

const PUBLIC = path.join(__dirname, "public");
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".csv": "text/csv; charset=utf-8",
  ".xls": "application/vnd.ms-excel; charset=utf-8",
  ".ico": "image/x-icon",
};
const PORT = Number(process.env.PORT) || 3000;

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");

    if (url.pathname.startsWith("/api/")) {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const result = await handler({
        path: url.pathname,
        httpMethod: req.method,
        headers: req.headers,
        body: raw || null,
        queryStringParameters: Object.fromEntries(url.searchParams),
      });
      res.writeHead(result.statusCode, result.headers);
      res.end(result.body);
      return;
    }

    const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
    const file = path.normalize(path.join(PUBLIC, requested));
    if (!file.startsWith(PUBLIC)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
      res.end(data);
    });
  })
  .listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🏓 Six Clubs Ping Pong Championship Platform Running!`);
    console.log(`URL: http://localhost:${PORT}`);
    console.log(`Referee Admin Token: ${process.env.ADMIN_TOKEN}`);
    console.log(`Data persists in: ${DATA_FILE}`);
    console.log(`====================================================`);
  });
