const WORDS = [
  "ABACAXI", "BORBOLETA", "CACHOEIRA", "DINOSSAURO", "ELEFANTE", "FOGUETE",
  "GIRASSOL", "HELICOPTERO", "ILHA", "JABUTICABA", "KIMONO", "LANTERNA",
  "MONTANHA", "NAVEGADOR", "ORQUIDEA", "PIRAMIDE", "QUEIJO", "RELAMPAGO",
  "SORVETE", "TARTARUGA", "UNIVERSO", "VULCAO", "XADREZ", "ZEPELIM",
  "CURITIBA", "PINHAO", "BIBLIOTECA", "COMPUTADOR", "ARCOIRIS"
];
const MAX_ERRORS = 6;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (url.pathname === "/config") {
      return Response.json({ clientId: env.GOOGLE_CLIENT_ID });
    }

    if (url.pathname.startsWith("/ws/")) {
      if (req.headers.get("Upgrade") !== "websocket") {
        return new Response("Esperava WebSocket", { status: 426 });
      }
      const user = await verifyGoogleToken(url.searchParams.get("token"), env);
      if (!user) return new Response("Login inválido", { status: 401 });

      const code = url.pathname.slice(4).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12) || "SALA";
      const headers = new Headers(req.headers);
      headers.set("x-user", encodeURIComponent(JSON.stringify(user)));
      const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
      return stub.fetch(new Request(req, { headers }));
    }

    return env.ASSETS.fetch(req);
  },
};

// Valida o ID token do Google e confere se foi emitido para o SEU app.
async function verifyGoogleToken(token, env) {
  if (!token) return null;
  const r = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(token));
  if (!r.ok) return null;
  const p = await r.json();
  if (p.aud !== env.GOOGLE_CLIENT_ID) return null;
  return { id: p.sub, name: p.given_name || p.name || "Jogador", picture: p.picture || "" };
}

export class Room {
  constructor() {
    this.players = new Map(); // id -> {id,name,picture,score,online}
    this.sockets = new Map(); // id -> WebSocket
    this.order = [];          // ids online, na ordem de entrada
    this.turn = 0;
    this.last = null;
    this.newRound();
  }

  newRound() {
    this.word = WORDS[Math.floor(Math.random() * WORDS.length)];
    this.guessed = [];
    this.errors = 0;
    this.status = "playing"; // playing | won | lost
    this.last = null;
  }

  currentId() {
    return this.order.length ? this.order[this.turn % this.order.length] : null;
  }

  async fetch(req) {
    const user = JSON.parse(decodeURIComponent(req.headers.get("x-user")));
    const pair = new WebSocketPair();
    const [client, ws] = Object.values(pair);
    ws.accept();

    // Reconexão: derruba a aba antiga do mesmo jogador
    this.sockets.get(user.id)?.close(1000, "outra aba");
    const old = this.players.get(user.id);
    this.players.set(user.id, { ...user, score: old?.score || 0, online: true });
    this.sockets.set(user.id, ws);
    if (!this.order.includes(user.id)) this.order.push(user.id);
    this.broadcast();

    ws.addEventListener("message", (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      this.onMessage(user.id, m);
    });
    const leave = () => {
      if (this.sockets.get(user.id) !== ws) return;
      this.sockets.delete(user.id);
      this.players.get(user.id).online = false;
      this.order = this.order.filter((id) => id !== user.id);
      this.broadcast();
    };
    ws.addEventListener("close", leave);
    ws.addEventListener("error", leave);

    return new Response(null, { status: 101, webSocket: client });
  }

  onMessage(id, m) {
    if (m.t === "guess" && this.status === "playing" && id === this.currentId()) {
      const l = String(m.l || "").toUpperCase();
      if (!/^[A-Z]$/.test(l) || this.guessed.includes(l)) return;
      this.guessed.push(l);
      const hits = [...this.word].filter((c) => c === l).length;
      if (hits) {
        this.players.get(id).score += hits * 10;
        if ([...this.word].every((c) => this.guessed.includes(c))) {
          this.players.get(id).score += 20; // bônus por completar a palavra
          this.status = "won";
        }
      } else {
        this.errors++;
        this.turn++; // errou: passa a vez
        if (this.errors >= MAX_ERRORS) this.status = "lost";
      }
      this.last = { id, l, hit: hits > 0 };
      this.broadcast();
    } else if (m.t === "next" && this.status !== "playing") {
      this.newRound();
      this.turn++;
      this.broadcast();
    }
  }

  broadcast() {
    const base = {
      t: "state",
      masked: [...this.word].map((c) => (this.guessed.includes(c) ? c : "_")),
      hits: this.guessed.filter((l) => this.word.includes(l)),
      misses: this.guessed.filter((l) => !this.word.includes(l)),
      errors: this.errors,
      max: MAX_ERRORS,
      status: this.status,
      word: this.status === "lost" ? this.word : null,
      turn: this.currentId(),
      last: this.last,
      players: [...this.players.values()].sort((a, b) => b.score - a.score),
    };
    for (const [id, ws] of this.sockets) {
      try { ws.send(JSON.stringify({ ...base, you: id })); } catch {}
    }
  }
}
