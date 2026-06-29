import initSqlJs, { type Database } from 'sql.js'
import { readFile, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import type { Note } from '@shared/types'

export class Store {
  private db!: Database
  private dbPath: string
  private saveTimer: NodeJS.Timeout | null = null

  constructor() {
    this.dbPath = join(app.getPath('userData'), 'notes.db')
  }

  async init(): Promise<void> {
    const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm')
    const wasmBuf = await readFile(wasmPath)
    const wasmBinary = wasmBuf.buffer.slice(
      wasmBuf.byteOffset,
      wasmBuf.byteOffset + wasmBuf.byteLength
    ) as ArrayBuffer
    const SQL = await initSqlJs({ wasmBinary })
    if (existsSync(this.dbPath)) {
      const buffer = await readFile(this.dbPath)
      const u8 = new Uint8Array(buffer.byteLength)
      u8.set(buffer)
      this.db = new SQL.Database(u8)
    } else {
      this.db = new SQL.Database()
    }
    this.db.run(`
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT '无标题',
        content TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted INTEGER NOT NULL DEFAULT 0
      )
    `)
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      void this.save()
    }, 500)
  }

  async save(): Promise<void> {
    if (!this.db) return
    const data = this.db.export()
    await writeFile(this.dbPath, Buffer.from(data))
  }

  private rowToNote(row: unknown[]): Note {
    return {
      id: row[0] as string,
      title: row[1] as string,
      content: row[2] as string,
      createdAt: row[3] as number,
      updatedAt: row[4] as number,
      deleted: row[5] as 0 | 1
    }
  }

  list(): Note[] {
    const res = this.db.exec(
      'SELECT id, title, content, created_at, updated_at, deleted FROM notes WHERE deleted = 0 ORDER BY updated_at DESC'
    )
    if (!res.length) return []
    return res[0].values.map((r) => this.rowToNote(r))
  }

  listAll(): Note[] {
    const res = this.db.exec(
      'SELECT id, title, content, created_at, updated_at, deleted FROM notes ORDER BY updated_at DESC'
    )
    if (!res.length) return []
    return res[0].values.map((r) => this.rowToNote(r))
  }

  get(id: string): Note | null {
    const res = this.db.exec(
      'SELECT id, title, content, created_at, updated_at, deleted FROM notes WHERE id = ?',
      [id]
    )
    if (!res.length || !res[0].values.length) return null
    return this.rowToNote(res[0].values[0])
  }

  insert(note: Note): void {
    this.db.run(
      'INSERT INTO notes (id, title, content, created_at, updated_at, deleted) VALUES (?,?,?,?,?,?)',
      [note.id, note.title, note.content, note.createdAt, note.updatedAt, note.deleted]
    )
    this.scheduleSave()
  }

  updateContent(id: string, content: string, updatedAt: number): void {
    this.db.run('UPDATE notes SET content = ?, updated_at = ? WHERE id = ?', [
      content,
      updatedAt,
      id
    ])
    this.scheduleSave()
  }

  rename(id: string, title: string, updatedAt: number): void {
    this.db.run('UPDATE notes SET title = ?, updated_at = ? WHERE id = ?', [
      title,
      updatedAt,
      id
    ])
    this.scheduleSave()
  }

  softDelete(id: string, updatedAt: number = Date.now()): void {
    this.db.run('UPDATE notes SET deleted = 1, updated_at = ? WHERE id = ?', [
      updatedAt,
      id
    ])
    this.scheduleSave()
  }

  upsert(note: Note): void {
    const existing = this.get(note.id)
    if (!existing || note.updatedAt > existing.updatedAt) {
      this.db.run(
        'INSERT OR REPLACE INTO notes (id, title, content, created_at, updated_at, deleted) VALUES (?,?,?,?,?,?)',
        [note.id, note.title, note.content, note.createdAt, note.updatedAt, note.deleted]
      )
      this.scheduleSave()
    }
  }

  upsertMany(notes: Note[]): void {
    for (const n of notes) this.upsert(n)
  }

  close(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.db?.close()
  }
}
