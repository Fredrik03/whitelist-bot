import axios from 'axios';
import { log } from './utils';

export interface FileReaderConfig {
  url: string;
  serverId: string;
  apiKey: string;
}

export interface WhitelistEntry {
  uuid: string;
  name: string;
}

/**
 * Reads files from Pterodactyl server using File Management API
 */
export class FileReader {
  private config: FileReaderConfig;

  constructor(config: FileReaderConfig) {
    this.config = config;
  }

  /**
   * Read a file from the server
   */
  private async readFile(filePath: string): Promise<string> {
    const endpoint = `${this.config.url}/api/client/servers/${this.config.serverId}/files/contents`;

    try {
      const response = await axios.get(endpoint, {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Accept': 'Application/vnd.pterodactyl.v1+json',
          'Content-Type': 'application/json'
        },
        params: {
          file: filePath
        },
        timeout: 10000
      });

      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        throw new Error(`File not found: ${filePath}`);
      }
      throw new Error(`Failed to read file: ${error.message}`);
    }
  }

  /**
   * Read and parse whitelist.json from the server
   */
  public async readWhitelist(): Promise<WhitelistEntry[]> {
    try {
      log('INFO', 'Reading whitelist.json from server...');
      const content = await this.readFile('/whitelist.json');

      // Parse JSON
      const whitelist: WhitelistEntry[] = JSON.parse(content);

      log('INFO', `Successfully read whitelist.json: ${whitelist.length} entries`);
      return whitelist;

    } catch (error: any) {
      log('ERROR', `Failed to read whitelist: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if a username is in the whitelist
   */
  public async isWhitelisted(username: string): Promise<boolean> {
    try {
      const whitelist = await this.readWhitelist();
      return whitelist.some(entry =>
        entry.name.toLowerCase() === username.toLowerCase()
      );
    } catch (error) {
      log('ERROR', `Failed to check whitelist status for ${username}`);
      throw error;
    }
  }

  /**
   * Get whitelist entry for a specific username
   */
  public async getWhitelistEntry(username: string): Promise<WhitelistEntry | null> {
    try {
      const whitelist = await this.readWhitelist();
      return whitelist.find(entry =>
        entry.name.toLowerCase() === username.toLowerCase()
      ) || null;
    } catch (error) {
      log('ERROR', `Failed to get whitelist entry for ${username}`);
      throw error;
    }
  }

  /**
   * Read server.properties file
   */
  public async readServerProperties(): Promise<Map<string, string>> {
    try {
      log('INFO', 'Reading server.properties from server...');
      const content = await this.readFile('/server.properties');

      const properties = new Map<string, string>();
      const lines = content.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();
        // Skip comments and empty lines
        if (trimmed.startsWith('#') || trimmed === '') {
          continue;
        }

        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          properties.set(key.trim(), valueParts.join('=').trim());
        }
      }

      log('INFO', `Successfully read server.properties: ${properties.size} entries`);
      return properties;

    } catch (error: any) {
      log('ERROR', `Failed to read server.properties: ${error.message}`);
      throw error;
    }
  }
}
