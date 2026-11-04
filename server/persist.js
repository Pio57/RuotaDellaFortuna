import fs from 'node:fs';
import path from 'node:path';

// Scrittura atomica: file temporaneo, poi rinomina.
export function saveSessions(file, sessions) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify([...sessions.values()]));
  fs.renameSync(tmp, file);
}

export function loadSessions(file) {
  try {
    const arr = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(arr) ? arr.filter((s) => s && typeof s.code === 'string' && Array.isArray(s.players) && Array.isArray(s.rounds) && Array.isArray(s.called)) : [];
  } catch {
    return [];
  }
}
