const WebSocket = require('ws');
const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

let clients = new Map(), queue = [], matches = new Map();

console.log(`[MaceIt Queue] Live server running on port ${PORT}`);

function broadcastOnline() {
  const msg = JSON.stringify({ type: 'online_count', count: clients.size });
  for (const c of wss.clients) {
    if (c.readyState === WebSocket.OPEN) c.send(msg);
  }
}

wss.on('connection', (ws) => {
  clients.set(ws, { name: 'Player', elo: 100 });
  broadcastOnline();

  ws.on('message', (raw) => {
    let d;
    try { d = JSON.parse(raw); } catch { return; }

    if (d.type === 'register') {
      clients.set(ws, { name: d.name, elo: d.elo });
      broadcastOnline();
    }

    if (d.type === 'join_queue') {
      clients.set(ws, { name: d.name, elo: d.elo, kitTier: d.kitTier });
      if (!queue.includes(ws)) queue.push(ws);

      if (queue.length >= 2) {
        const p1 = queue.shift(), p2 = queue.shift();
        const matchId = 'm_' + Date.now();
        const p1d = clients.get(p1), p2d = clients.get(p2);
        const kitTier = p1d.kitTier || 1;

        matches.set(matchId, { p1, p2, accepted: new Set(), kitTier });
        p1.send(JSON.stringify({ type: 'match_found', matchId, opponent: p2d, kitTier }));
        p2.send(JSON.stringify({ type: 'match_found', matchId, opponent: p1d, kitTier }));
      }
    }

    if (d.type === 'leave_queue') {
      queue = queue.filter(c => c !== ws);
    }

    if (d.type === 'accept_match') {
      const m = matches.get(d.matchId);
      if (!m) return;
      m.accepted.add(ws);

          if (m.accepted.size === 2) {
        const p1Data = clients.get(m.p1);
        const p2Data = clients.get(m.p2);

        const setupEvent = JSON.stringify({
          type: 'run_setup',
          cmd: `maceitsetup ${p1Data.name} ${p2Data.name} ${m.kitTier}`
        });
        for (const c of wss.clients) {
          if (c.readyState === WebSocket.OPEN) c.send(setupEvent);
        }

        m.p1.send(JSON.stringify({ type: 'match_ready', opponent: p2Data, kitTier: m.kitTier }));
        m.p2.send(JSON.stringify({ type: 'match_ready', opponent: p1Data, kitTier: m.kitTier }));
        matches.delete(d.matchId);
      }
    }
  });


  ws.on('close', () => {
    queue = queue.filter(c => c !== ws);
    clients.delete(ws);
    broadcastOnline();
  });
});
