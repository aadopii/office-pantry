import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Purchase, Request } from './types.ts';
export class Store {
  readonly db: DatabaseSync;
  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS purchases(id TEXT PRIMARY KEY, request_id TEXT NOT NULL UNIQUE, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS approvals(call_id TEXT PRIMARY KEY, purchase_id TEXT NOT NULL, request_id TEXT UNIQUE);
      CREATE TABLE IF NOT EXISTS reports(period TEXT NOT NULL, mode TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(period,mode));
      CREATE TABLE IF NOT EXISTS report_runs(id INTEGER PRIMARY KEY, period TEXT NOT NULL, mode TEXT NOT NULL, source TEXT NOT NULL, at TEXT NOT NULL);
    `);
  }
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  capture(request: Request) { this.db.prepare('INSERT OR IGNORE INTO requests VALUES(?,?)').run(request.id, JSON.stringify(request)); }
  request(id: string): Request {
    const row = this.db.prepare('SELECT body FROM requests WHERE id=?').get(id);
    if (!row) throw new Error('Original request unavailable; make a new request in the local Eve terminal.');
    return JSON.parse(row.body as string);
  }
  get(id: string): Purchase {
    const row = this.db.prepare('SELECT body FROM purchases WHERE id=?').get(id);
    if (!row) throw new Error('Unknown purchase.');
    return JSON.parse(row.body as string);
  }
  forRequest(id: string): Purchase | undefined {
    const row = this.db.prepare('SELECT body FROM purchases WHERE request_id=?').get(id);
    return row ? JSON.parse(row.body as string) : undefined;
  }
  save(p: Purchase) { this.db.prepare('INSERT INTO purchases VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body').run(p.id, p.requestId, JSON.stringify(p)); }
  all(): Purchase[] { return this.db.prepare('SELECT body FROM purchases ORDER BY rowid').all().map(row => JSON.parse(row.body as string)); }
  bind(callId: string, purchaseId: string) { this.db.prepare('INSERT OR IGNORE INTO approvals(call_id,purchase_id) VALUES(?,?)').run(callId, purchaseId); }
  bindRequest(callId: string, requestId: string) { this.db.prepare('UPDATE approvals SET request_id=? WHERE call_id=?').run(requestId, callId); }
  approvalPurchase(requestId: string): string | undefined { return this.db.prepare('SELECT purchase_id FROM approvals WHERE request_id=?').get(requestId)?.purchase_id as string | undefined; }
  close() { this.db.close(); }
}
