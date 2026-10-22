// Genera la página de estado que se publica FUERA de Vercel (GitHub Pages), para que siga disponible aunque se
// caiga la aplicación. La corre .github/workflows/status-page.yml cada 10 minutos: mide la aplicación, la base central
// y las bases de los laboratorios, copia los incidentes que el superadmin publicó en /estado y, si no puede hablar con
// la aplicación, conserva los de la última corrida. Uso: node status/build.mjs <carpeta-de-salida>
import fs from "node:fs";
import path from "node:path";

const SITE = process.env.STATUS_SITE ?? "https://www.stockmanager.app";
const out = process.argv[2] ?? "_site";
const secret = process.env.CRON_SECRET;
const prev = (() => { try { return JSON.parse(fs.readFileSync(path.join(out, "previous.json"), "utf8")); } catch { return null; } })();
const manual = (() => { try { return fs.readFileSync(new URL("./mensaje.txt", import.meta.url), "utf8").trim(); } catch { return ""; } })();

async function get(url, init = {}) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000), redirect: "follow" });
    return { ok: res.ok, status: res.status, ms: Date.now() - t0, body: await res.text() };
  } catch (e) {
    return { ok: false, status: 0, ms: Date.now() - t0, body: "", error: String(e?.message ?? e) };
  }
}
const json = (s) => { try { return JSON.parse(s); } catch { return null; } };

const app = await get(`${SITE}/`);
const estado = await get(`${SITE}/api/estado`);
const labsRes = secret ? await get(`${SITE}/api/cron/health-check`, { headers: { Authorization: `Bearer ${secret}` } }) : null;
const labs = labsRes?.ok ? json(labsRes.body) : null;

const components = [
  { name: "Aplicación", state: app.ok ? "ok" : "down", note: app.ok ? "" : "No responde" },
  { name: "Base central (acceso al sistema)", state: estado.ok ? "ok" : "down", note: estado.ok ? "" : "No responde" },
  labs
    ? { name: "Bases de los laboratorios", state: labs.errors === 0 ? "ok" : labs.errors < labs.total ? "degraded" : "down",
        note: labs.errors === 0 ? "" : `${labs.errors} de ${labs.total} sin responder` }
    : { name: "Bases de los laboratorios", state: app.ok ? "unknown" : "down", note: app.ok ? "Sin dato en este chequeo" : "Sin dato: la aplicación no responde" },
];
const worst = components.some(c => c.state === "down") ? "down" : components.some(c => c.state === "degraded") ? "degraded" : "ok";

const fresh = estado.ok ? json(estado.body) : null;
const incidents = fresh?.incidents ?? prev?.incidents ?? [];
const checkedAt = new Date().toISOString();
const data = { checkedAt, overall: worst, components, incidents, incidentsFrom: fresh ? checkedAt : prev?.incidentsFrom ?? null };

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const fmt = (iso) => new Date(iso).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const LABEL = { ok: "Operativo", degraded: "Con problemas", down: "Sin respuesta", unknown: "Sin dato" };
const COLOR = { ok: "#2e7d32", degraded: "#a15c00", down: "#c0392b", unknown: "#5f6b7a" };
const HEAD = { ok: "Todos los sistemas operativos", degraded: "Algunos sistemas con problemas", down: "Hay una interrupción del servicio" };
const STATUS_ES = { investigating: "Investigando", identified: "Identificado", monitoring: "Monitoreando", resolved: "Resuelto" };

const open = incidents.filter(i => i.status !== "resolved");
const recent = incidents.filter(i => i.status === "resolved").slice(0, 10);
const incidentHtml = (i) => `<li><strong>${esc(i.title)}</strong> <span class="tag">${esc(STATUS_ES[i.status] ?? i.status)}</span><br><small>${esc(i.component)} · ${esc(fmt(i.createdAt))}</small>${
  (i.updates ?? []).slice(-1).map(u => `<p>${esc(u.message)}</p>`).join("")}</li>`;

const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="120"><title>Estado de StockManager</title>
<style>
:root{--bg:#f6f7f9;--card:#fff;--tx:#1d2733;--sub:#5f6b7a;--line:#e3e7ec}
@media (prefers-color-scheme:dark){:root{--bg:#12161c;--card:#1b222b;--tx:#e8edf3;--sub:#9aa7b5;--line:#2a333f}}
body{margin:0;background:var(--bg);color:var(--tx);font:16px/1.5 system-ui,sans-serif}
main{max-width:680px;margin:0 auto;padding:32px 16px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:28px 0 8px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:4px 16px}
.row{display:flex;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid var(--line)}.row:last-child{border:0}
.sub,small{color:var(--sub)}.state{font-weight:700;white-space:nowrap}
.banner{border-radius:12px;padding:14px 16px;margin:16px 0;border:1px solid var(--line);background:var(--card)}
ul{padding-left:18px}li{margin-bottom:12px}.tag{font-size:12px;border:1px solid var(--line);border-radius:99px;padding:1px 8px}
</style></head><body><main>
<h1>Estado de StockManager</h1>
<p class="sub">Esta página se publica fuera de nuestros servidores, así que sigue disponible aunque la aplicación no responda. Última comprobación: ${esc(fmt(checkedAt))} (hora de Argentina), se actualiza cada 10 minutos.</p>
<div class="banner" style="border-color:${COLOR[worst]};color:${COLOR[worst]}"><strong>${HEAD[worst]}</strong></div>
${manual ? `<div class="banner">${esc(manual).replace(/\n/g, "<br>")}</div>` : ""}
<div class="card">${components.map(c => `<div class="row"><div>${esc(c.name)}${c.note ? `<br><small>${esc(c.note)}</small>` : ""}</div><div class="state" style="color:${COLOR[c.state]}">${LABEL[c.state]}</div></div>`).join("")}</div>
${open.length ? `<h2>Incidentes en curso</h2><ul>${open.map(incidentHtml).join("")}</ul>` : ""}
${recent.length ? `<h2>Incidentes recientes</h2><ul>${recent.map(incidentHtml).join("")}</ul>` : ""}
${!fresh && incidents.length ? `<p class="sub">Los incidentes son los de la última vez que pudimos comunicarnos con la aplicación${data.incidentsFrom ? ` (${esc(fmt(data.incidentsFrom))})` : ""}.</p>` : ""}
<p class="sub"><a href="${SITE}/estado">Ver el estado desde la aplicación</a></p>
</main></body></html>`;

fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "index.html"), html);
fs.writeFileSync(path.join(out, "status.json"), JSON.stringify(data, null, 1));
console.log(`estado: ${worst}`, components.map(c => `${c.name}=${c.state}`).join(" | "));
