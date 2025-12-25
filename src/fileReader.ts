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
          'Accept': 'text/plain'
        },
        params: {
          file: filePath
        },
        responseType: 'text',
        timeout: 10000,
        transformResponse: [(data) => data] // Don't let axios transform the response
      });

      log('INFO', `File read response type: ${typeof response.data}`);
      log('INFO', `File read response is Buffer: ${Buffer.isBuffer(response.data)}`);
      log('INFO', `File read response constructor: ${response.data?.constructor?.name}`);

      // Handle Buffer (axios might return Buffer even with responseType: 'text')
      if (Buffer.isBuffer(response.data)) {
        log('INFO', 'Converting Buffer to UTF-8 string');
        const content = response.data.toString('utf-8');
        log('INFO', `Converted content (first 200 chars): ${content.substring(0, 200)}`);
        return content;
      }

      // Handle string response
      if (typeof response.data === 'string') {
        log('INFO', `String response (first 200 chars): ${response.data.substring(0, 200)}`);
        return response.data;
      }

      // If it's an object, log details and throw error
      log('ERROR', `Unexpected response type: ${typeof response.data}, constructor: ${response.data?.constructor?.name}`);
      if (response.data && typeof response.data === 'object') {
        log('ERROR', `Response data keys: ${Object.keys(response.data).join(', ')}`);
        log('ERROR', `Response data: ${JSON.stringify(response.data).substring(0, 500)}`);
      }
      throw new Error(`File API returned unexpected data type: ${typeof response.data}`);
    } catch (error: any) {
      if (error.response?.status === 404) {
        throw new Error(`File not found: ${filePath}`);
      }
      log('ERROR', `File read error for ${filePath}: ${error.message}`);
      if (error.response?.data) {
        log('ERROR', `Response data type: ${typeof error.response.data}`);
        log('ERROR', `Response data: ${String(error.response.data).substring(0, 500)}`);
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
   * Read usercache.json to get all players who have ever joined
   */
  public async readUserCache(): Promise<WhitelistEntry[]> {
    try {
      log('INFO', 'Reading usercache.json from server...');
      const content = await this.readFile('/usercache.json');

      // Parse JSON - usercache is an array of player entries
      const usercache: Array<{name: string, uuid: string}> = JSON.parse(content);

      // Convert to WhitelistEntry format
      const entries: WhitelistEntry[] = usercache.map(entry => ({
        uuid: entry.uuid,
        name: entry.name
      }));

      log('INFO', `Successfully read usercache.json: ${entries.length} entries`);
      return entries;

    } catch (error: any) {
      log('ERROR', `Failed to read usercache: ${error.message}`);
      throw error;
    }
  }

  /**
   * Find a player in usercache by username
   */
  public async findInUserCache(username: string): Promise<WhitelistEntry | null> {
    try {
      const usercache = await this.readUserCache();
      return usercache.find(entry =>
        entry.name.toLowerCase() === username.toLowerCase()
      ) || null;
    } catch (error: any) {
      log('ERROR', `Failed to find player in usercache: ${error.message}`);
      throw error;
    }
  }

  /**
   * Convert Xbox gamertag to Floodgate UUID using GeyserMC API
   */
  public async gamertagToFloodgateUUID(gamertag: string): Promise<WhitelistEntry | null> {
    try {
      log('INFO', `Converting ${gamertag} to Floodgate UUID via GeyserMC API...`);

      // Step 1: Get XUID from GeyserMC API
      const response = await axios.get(`https://api.geysermc.org/v2/xbox/xuid/${gamertag}`, {
        timeout: 10000
      });

      if (!response.data?.xuid) {
        log('ERROR', `No XUID found for gamertag: ${gamertag}`);
        return null;
      }

      const xuidDecimal = response.data.xuid;
      log('INFO', `Got XUID for ${gamertag}: ${xuidDecimal}`);

      // Step 2: Convert decimal XUID to hexadecimal (16 characters)
      const xuidHex = BigInt(xuidDecimal).toString(16).padStart(16, '0');

      // Step 3: Format as Floodgate UUID
      const uuid = `00000000-0000-0000-${xuidHex.substring(0, 4)}-${xuidHex.substring(4)}`;

      log('INFO', `Floodgate UUID for ${gamertag}: ${uuid}`);

      return {
        name: gamertag,
        uuid: uuid
      };

    } catch (error: any) {
      if (error.response?.status === 404) {
        log('ERROR', `Gamertag not found or API rate limited: ${gamertag}`);
        return null;
      }
      log('ERROR', `Failed to convert gamertag to UUID: ${error.message}`);
      return null;
    }
  }

  /**
   * Write content to a file on the server
   */
  private async writeFile(filePath: string, content: string): Promise<void> {
    const endpoint = `${this.config.url}/api/client/servers/${this.config.serverId}/files/write`;

    try {
      await axios.post(endpoint, content, {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'text/plain'
        },
        params: {
          file: filePath
        },
        timeout: 10000
      });

      log('INFO', `Successfully wrote to ${filePath}`);
    } catch (error: any) {
      log('ERROR', `File write error for ${filePath}: ${error.message}`);
      throw new Error(`Failed to write file: ${error.message}`);
    }
  }

  /**
   * Add a player to whitelist.json directly
   */
  public async addToWhitelist(entry: WhitelistEntry): Promise<void> {
    try {
      log('INFO', `Adding ${entry.name} to whitelist.json...`);

      // Read current whitelist
      const whitelist = await this.readWhitelist();

      // Check if player is already whitelisted
      if (whitelist.some(e => e.uuid === entry.uuid)) {
        log('WARN', `${entry.name} is already in whitelist.json`);
        return;
      }

      // Add new entry
      whitelist.push(entry);

      // Write back to file
      const content = JSON.stringify(whitelist, null, 2);
      await this.writeFile('/whitelist.json', content);

      log('INFO', `Successfully added ${entry.name} to whitelist.json`);
    } catch (error: any) {
      log('ERROR', `Failed to add to whitelist: ${error.message}`);
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
