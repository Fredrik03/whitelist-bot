import Database from 'better-sqlite3';
import path from 'path';
import { log } from './utils';

const DB_PATH = process.env.DB_PATH || '/data/whitelist.db';

export interface WhitelistEntry {
  id: number;
  username: string;
  added_at: string;
  added_by_discord_id: string;
  added_by_discord_username: string;
}

class WhitelistDatabase {
  private db: Database.Database;

  constructor() {
    try {
      log('INFO', `Initializing database at ${DB_PATH}`);
      this.db = new Database(DB_PATH);
      this.db.pragma('journal_mode = WAL');
      this.initializeTable();
      log('INFO', 'Database initialized successfully');
    } catch (error) {
      log('ERROR', `Failed to initialize database: ${error}`);
      throw error;
    }
  }

  private initializeTable(): void {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS whitelist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        added_by_discord_id TEXT NOT NULL,
        added_by_discord_username TEXT NOT NULL
      )
    `;

    try {
      this.db.exec(createTableSQL);
      log('INFO', 'Whitelist table ready');
    } catch (error) {
      log('ERROR', `Failed to create table: ${error}`);
      throw error;
    }
  }

  public isWhitelisted(username: string): WhitelistEntry | undefined {
    try {
      const stmt = this.db.prepare('SELECT * FROM whitelist WHERE username = ?');
      const result = stmt.get(username) as WhitelistEntry | undefined;
      log('INFO', `Checked if ${username} is whitelisted: ${result ? 'Yes' : 'No'}`);
      return result;
    } catch (error) {
      log('ERROR', `Database error checking ${username}: ${error}`);
      throw error;
    }
  }

  public addToWhitelist(
    username: string,
    discordId: string,
    discordUsername: string
  ): void {
    try {
      const stmt = this.db.prepare(
        'INSERT INTO whitelist (username, added_by_discord_id, added_by_discord_username) VALUES (?, ?, ?)'
      );
      stmt.run(username, discordId, discordUsername);
      log('INFO', `Added ${username} to database (by ${discordUsername})`);
    } catch (error) {
      log('ERROR', `Database error adding ${username}: ${error}`);
      throw error;
    }
  }

  public close(): void {
    try {
      this.db.close();
      log('INFO', 'Database connection closed');
    } catch (error) {
      log('ERROR', `Error closing database: ${error}`);
    }
  }
}

export const database = new WhitelistDatabase();
