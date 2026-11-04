// Client WebSocket con riconnessione (attese di 1, 2, 4 e 8 secondi) e ping ogni 20 secondi.
export class Net {
  constructor({ onMessage, onStatus, onOpen }) {
    Object.assign(this, { onMessage, onStatus, onOpen, tries: 0, up: false, dead: false });
    this.connect();
  }

  connect() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(`${proto}//${location.host}/ws`);
    this.ws.addEventListener('open', () => {
      this.up = true;
      this.tries = 0;
      this.onStatus(true);
      this.onOpen();
      clearInterval(this.pinger);
      this.pinger = setInterval(() => this.send({ t: 'ping' }), 20000);
    });
    this.ws.addEventListener('message', (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      if (m && typeof m.t === 'string') this.onMessage(m);
    });
    this.ws.addEventListener('close', () => {
      clearInterval(this.pinger);
      if (this.dead) return;
      if (this.up) { this.up = false; this.onStatus(false); }
      const wait = Math.min(8, 2 ** this.tries) * 1000;
      this.tries++;
      this.timer = setTimeout(() => this.connect(), wait);
    });
  }

  send(obj) {
    if (this.ws.readyState === WebSocket.OPEN) { this.ws.send(JSON.stringify(obj)); return true; }
    return false;
  }

  close() { this.dead = true; clearTimeout(this.timer); clearInterval(this.pinger); this.ws.close(); }
}
