// Scene control server for the ImmersiveSmilePlus VR project.
//
//   - Holds the "currently selected scene" as server-side state.
//   - Serves a small web dashboard (public/) to pick a scene remotely.
//   - Pushes the selection to Unity instantly over Server-Sent Events (SSE),
//     with a plain JSON state endpoint as a polling fallback.
//
// Unity's SceneSelector.cs opens GET /api/events and reacts to each push.
// The dashboard POSTs to /api/scene to change the selection.

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const SCENES = require('./scenes');

const PORT = process.env.PORT || 3000;
// Optional shared secret. If set, POST /api/scene requires the X-Admin-Token
// header. Leave unset for open testing.
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const DATA_FILE = path.join(__dirname, 'state.json');

const sceneById = (id) => SCENES.find((s) => s.id === id);

// ---- State ---------------------------------------------------------------

function loadState() {
  try {
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (sceneById(raw.id)) {
      return { id: raw.id, updatedAt: raw.updatedAt || new Date().toISOString() };
    }
  } catch {
    /* no saved state yet, or unreadable filesystem — fall through to default */
  }
  return { id: 0, updatedAt: new Date().toISOString() };
}

function saveState() {
  // Best-effort: hosted free tiers often have an ephemeral/read-only FS.
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(state));
  } catch {
    /* ignore — state still lives in memory for this process */
  }
}

function currentPayload() {
  const s = sceneById(state.id) || SCENES[0];
  return { id: s.id, name: s.name, label: s.label, updatedAt: state.updatedAt };
}

let state = loadState();

// ---- App -----------------------------------------------------------------

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// SSE clients (each is an open `res`). Unity + every open dashboard tab.
const clients = new Set();

function broadcast() {
  const frame = `event: scene\ndata: ${JSON.stringify(currentPayload())}\n\n`;
  for (const res of clients) {
    try {
      res.write(frame);
    } catch {
      /* client went away mid-write; cleaned up on its 'close' event */
    }
  }
}

// List of selectable scenes (used by the dashboard to render buttons).
app.get('/api/scenes', (_req, res) => res.json(SCENES));

// Current selection — Unity uses this as a polling fallback if SSE drops.
app.get('/api/state', (_req, res) => res.json(currentPayload()));

// Tells the dashboard whether to show the token field.
app.get('/api/config', (_req, res) => res.json({ authRequired: Boolean(ADMIN_TOKEN) }));

// Change the selected scene. Called by the dashboard.
app.post('/api/scene', (req, res) => {
  if (ADMIN_TOKEN && req.get('x-admin-token') !== ADMIN_TOKEN) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const id = Number(req.body && req.body.id);
  if (!Number.isInteger(id) || !sceneById(id)) {
    return res.status(400).json({ error: 'invalid scene id', valid: SCENES.map((s) => s.id) });
  }
  state = { id, updatedAt: new Date().toISOString() };
  saveState();
  broadcast();
  res.json(currentPayload());
});

// Server-Sent Events stream. Sends the current scene on connect, then every change.
app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // disable proxy buffering (nginx/Render) so events flush immediately
  });
  res.write('retry: 3000\n\n'); // tell EventSource clients to reconnect after 3s
  res.write(`event: scene\ndata: ${JSON.stringify(currentPayload())}\n\n`);

  clients.add(res);
  // Heartbeat keeps idle connections alive through proxies/load balancers.
  const ping = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      /* ignore */
    }
  }, 20000);

  req.on('close', () => {
    clearInterval(ping);
    clients.delete(res);
  });
});

app.get('/health', (_req, res) =>
  res.json({ ok: true, clients: clients.size, state: currentPayload() })
);

app.listen(PORT, () => {
  console.log(`Scene control server running on http://localhost:${PORT}`);
  console.log(`  Dashboard:  http://localhost:${PORT}/`);
  console.log(`  SSE (Unity): http://localhost:${PORT}/api/events`);
  if (ADMIN_TOKEN) console.log('  Auth: ADMIN_TOKEN is set — POSTs require X-Admin-Token.');
});
