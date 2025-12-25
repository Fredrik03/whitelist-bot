import axios, { AxiosError } from 'axios';
import { log } from './utils';
import { ConsoleListener } from './consoleListener';
import { FileReader, WhitelistEntry } from './fileReader';

export interface PterodactylConfig {
  url: string;
  serverId: string;
  apiKey: string;
}

export interface PterodactylResult {
  success: boolean;
  error?: string;
  statusCode?: number;
  consoleOutput?: string;
}

export interface ServerStatus {
  state: 'running' | 'offline' | 'starting' | 'stopping';
  resources: {
    memory_bytes: number;
    memory_limit_bytes: number;
    cpu_absolute: number;
    disk_bytes: number;
    network_rx_bytes: number;
    network_tx_bytes: number;
    uptime: number;
  };
}

export interface ServerStatusResult {
  success: boolean;
  status?: ServerStatus;
  error?: string;
}

class PterodactylAPI {
  private config: PterodactylConfig;
  private consoleListener: ConsoleListener;
  private fileReader: FileReader;

  constructor() {
    const url = process.env.PTERODACTYL_URL;
    const serverId = process.env.PTERODACTYL_SERVER_ID;
    const apiKey = process.env.PTERODACTYL_API_KEY;

    if (!url || !serverId || !apiKey) {
      throw new Error('Missing required Pterodactyl environment variables');
    }

    this.config = {
      url: url.replace(/\/$/, ''), // Remove trailing slash
      serverId,
      apiKey
    };

    // Initialize console listener and file reader
    this.consoleListener = new ConsoleListener(this.config);
    this.fileReader = new FileReader(this.config);

    log('INFO', `Pterodactyl API initialized for server ${serverId}`);
  }

  /**
   * Initialize console listener connection
   */
  public async initializeConsoleListener(): Promise<void> {
    if (!this.consoleListener.isConnected()) {
      await this.consoleListener.connect();
    }
  }

  /**
   * Sends whitelist add command to Pterodactyl with console feedback
   */
  public async whitelistPlayer(username: string): Promise<PterodactylResult> {
    const endpoint = `${this.config.url}/api/client/servers/${this.config.serverId}/command`;
    const command = `whitelist add ${username}`;

    log('INFO', `Sending command to Pterodactyl: ${command}`);

    try {
      // Send via regular API
      const response = await axios.post(
        endpoint,
        { command },
        {
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
            'Accept': 'Application/vnd.pterodactyl.v1+json',
            'Content-Type': 'application/json'
          },
          timeout: 10000 // 10 second timeout
        }
      );

      // Success: HTTP 204
      if (response.status === 204) {
        log('INFO', `Successfully sent whitelist command for ${username}`);
        return { success: true };
      }

      log('WARN', `Unexpected status code ${response.status} for ${username}`);
      return {
        success: false,
        error: `Uventet statuskode: ${response.status}`,
        statusCode: response.status
      };

    } catch (error) {
      return this.handleError(error as AxiosError, username);
    }
  }

  /**
   * Whitelist a player with console feedback verification
   */
  public async whitelistPlayerWithFeedback(username: string): Promise<PterodactylResult> {
    try {
      // Ensure console listener is connected
      await this.initializeConsoleListener();

      // Wait for console output matching whitelist response
      const consolePromise = this.consoleListener.waitForConsoleMessage(
        new RegExp(`(Added ${username} to the whitelist|That player is already whitelisted|player does not exist)`, 'i'),
        10000
      );

      // Send command via WebSocket
      this.consoleListener.sendCommand(`whitelist add ${username}`);

      // Wait for console feedback
      const consoleOutput = await consolePromise;

      log('INFO', `Console output for ${username}: ${consoleOutput}`);

      // Parse console output
      if (/Added .+ to the whitelist/i.test(consoleOutput)) {
        return {
          success: true,
          consoleOutput: consoleOutput.trim()
        };
      } else if (/That player is already whitelisted/i.test(consoleOutput)) {
        return {
          success: false,
          error: 'Spilleren er allerede whitelistet',
          consoleOutput: consoleOutput.trim()
        };
      } else if (/player does not exist/i.test(consoleOutput)) {
        return {
          success: false,
          error: 'Spilleren finnes ikke (ugyldig brukernavn)',
          consoleOutput: consoleOutput.trim()
        };
      }

      return {
        success: false,
        error: 'Uventet svar fra serveren',
        consoleOutput: consoleOutput.trim()
      };

    } catch (error: any) {
      log('ERROR', `Failed to whitelist ${username} with feedback: ${error.message}`);

      // Fallback to regular API method
      log('INFO', `Falling back to regular API method for ${username}`);
      return this.whitelistPlayer(username);
    }
  }

  /**
   * Remove a player from whitelist
   */
  public async unwhitelistPlayer(username: string): Promise<PterodactylResult> {
    try {
      // Ensure console listener is connected
      await this.initializeConsoleListener();

      // Wait for console output matching whitelist remove response
      const consolePromise = this.consoleListener.waitForConsoleMessage(
        new RegExp(`(Removed ${username} from the whitelist|That player is not whitelisted|player does not exist)`, 'i'),
        10000
      );

      // Send command via WebSocket
      this.consoleListener.sendCommand(`whitelist remove ${username}`);

      // Wait for console feedback
      const consoleOutput = await consolePromise;

      log('INFO', `Console output for unwhitelist ${username}: ${consoleOutput}`);

      // Parse console output
      if (/Removed .+ from the whitelist/i.test(consoleOutput)) {
        return {
          success: true,
          consoleOutput: consoleOutput.trim()
        };
      } else if (/That player is not whitelisted/i.test(consoleOutput)) {
        return {
          success: false,
          error: 'Spilleren er ikke whitelistet',
          consoleOutput: consoleOutput.trim()
        };
      } else if (/player does not exist/i.test(consoleOutput)) {
        return {
          success: false,
          error: 'Spilleren finnes ikke',
          consoleOutput: consoleOutput.trim()
        };
      }

      return {
        success: false,
        error: 'Uventet svar fra serveren',
        consoleOutput: consoleOutput.trim()
      };

    } catch (error: any) {
      log('ERROR', `Failed to unwhitelist ${username}: ${error.message}`);
      return {
        success: false,
        error: error.message || 'Kunne ikke fjerne spilleren fra whitelist'
      };
    }
  }

  /**
   * Get online players from server console using /list command
   */
  public async getOnlinePlayers(): Promise<{ count: number; max: number; players: string[] }> {
    try {
      // Ensure console listener is connected
      await this.initializeConsoleListener();

      // Wait for console output from /list command
      // Example output: "There are 2 of a max of 20 players online: Player1, Player2"
      const consolePromise = this.consoleListener.waitForConsoleMessage(
        /There are \d+ of a max of \d+ players online/i,
        5000
      );

      // Send /list command
      this.consoleListener.sendCommand('list');

      // Wait for response
      const consoleOutput = await consolePromise;

      log('INFO', `List command output: ${consoleOutput}`);

      // Parse the output
      // Format: "There are X of a max of Y players online: Player1, Player2, Player3"
      const match = consoleOutput.match(/There are (\d+) of a max of (\d+) players online:?\s*(.*)?/i);

      if (match) {
        const count = parseInt(match[1], 10);
        const max = parseInt(match[2], 10);
        const playerList = match[3] ? match[3].split(',').map(p => p.trim()).filter(p => p) : [];

        return { count, max, players: playerList };
      }

      // Fallback - no players online
      return { count: 0, max: 20, players: [] };

    } catch (error: any) {
      log('ERROR', `Failed to get online players: ${error.message}`);
      // Return fallback data
      return { count: 0, max: 20, players: [] };
    }
  }

  /**
   * Read whitelist.json from server
   */
  public async readWhitelist(): Promise<WhitelistEntry[]> {
    return this.fileReader.readWhitelist();
  }

  /**
   * Check if a player is whitelisted by reading the actual file
   */
  public async isPlayerWhitelisted(username: string): Promise<boolean> {
    return this.fileReader.isWhitelisted(username);
  }

  /**
   * Whitelist a Bedrock player from usercache
   * This bypasses Minecraft's whitelist command and writes directly to whitelist.json
   */
  public async whitelistFromCache(username: string): Promise<PterodactylResult> {
    try {
      log('INFO', `Looking for ${username} in usercache.json...`);

      // Find player in usercache
      const cacheEntry = await this.fileReader.findInUserCache(username);

      if (!cacheEntry) {
        return {
          success: false,
          error: `${username} not found in server cache. Player must join the server at least once.`
        };
      }

      log('INFO', `Found ${username} in usercache (UUID: ${cacheEntry.uuid})`);

      // Add to whitelist.json directly
      await this.fileReader.addToWhitelist(cacheEntry);

      // Reload whitelist
      await this.sendCommand('whitelist reload');

      return {
        success: true,
        consoleOutput: `Added ${username} to whitelist from cache`
      };

    } catch (error: any) {
      log('ERROR', `Failed to whitelist from cache: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Cleanup connections
   */
  public cleanup(): void {
    this.consoleListener.disconnect();
    log('INFO', 'Pterodactyl API cleaned up');
  }

  /**
   * Gets server status and resource usage
   */
  public async getServerStatus(): Promise<ServerStatusResult> {
    const endpoint = `${this.config.url}/api/client/servers/${this.config.serverId}/resources`;

    try {
      const response = await axios.get(endpoint, {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Accept': 'Application/vnd.pterodactyl.v1+json',
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      if (response.status === 200 && response.data?.attributes) {
        const attrs = response.data.attributes;
        return {
          success: true,
          status: {
            state: attrs.current_state,
            resources: {
              memory_bytes: attrs.resources.memory_bytes,
              memory_limit_bytes: attrs.resources.memory_limit_bytes,
              cpu_absolute: attrs.resources.cpu_absolute,
              disk_bytes: attrs.resources.disk_bytes,
              network_rx_bytes: attrs.resources.network_rx_bytes,
              network_tx_bytes: attrs.resources.network_tx_bytes,
              uptime: attrs.resources.uptime
            }
          }
        };
      }

      return {
        success: false,
        error: 'Unexpected API response format'
      };

    } catch (error) {
      const axiosError = error as AxiosError;
      if (axiosError.response?.status === 403) {
        return {
          success: false,
          error: 'API access denied'
        };
      }

      return {
        success: false,
        error: axiosError.message || 'Failed to fetch server status'
      };
    }
  }

  private handleError(error: AxiosError, username: string): PterodactylResult {
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      log('ERROR', `Timeout for ${username}: Server not responding`);
      return {
        success: false,
        error: 'Serveren svarer ikke (timeout)',
        statusCode: 0
      };
    }

    if (error.response) {
      const statusCode = error.response.status;
      log('ERROR', `Pterodactyl API error ${statusCode} for ${username}: ${JSON.stringify(error.response.data)}`);

      switch (statusCode) {
        case 412:
          return {
            success: false,
            error: 'Serveren er offline',
            statusCode
          };
        case 403:
          return {
            success: false,
            error: 'Mangler tilgang (sjekk API key)',
            statusCode
          };
        case 400:
          return {
            success: false,
            error: 'Ugyldig forespørsel til Pterodactyl',
            statusCode
          };
        default:
          return {
            success: false,
            error: `Pterodactyl API feil (${statusCode})`,
            statusCode
          };
      }
    }

    // Network error or other error
    log('ERROR', `Network error for ${username}: ${error.message}`);
    return {
      success: false,
      error: `Nettverksfeil: ${error.message}`,
      statusCode: 0
    };
  }
}

export const pterodactyl = new PterodactylAPI();
