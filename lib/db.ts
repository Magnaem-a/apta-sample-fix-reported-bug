import { DatabaseSync } from "node:sqlite"

// Your machine, tests and our checks use SQLite built into Node: in memory, unless DATA_FILE names a file.
// Your live link uses PostgreSQL: set DATABASE_URL and swap this file for a PostgreSQL client (README).
export const db = new DatabaseSync(process.env.DATA_FILE ?? ":memory:")
db.exec("PRAGMA foreign_keys = ON")

/** Runs fn inside one transaction: everything is saved, or nothing is. */
export function transaction<T>(fn: () => T): T {
  db.exec("BEGIN")
  try {
    const result = fn()
    db.exec("COMMIT")
    return result
  } catch (e) {
    db.exec("ROLLBACK")
    throw e
  }
}
