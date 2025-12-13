import axios, { AxiosError } from 'axios';
import { log } from './utils';

export interface PterodactylConfig {
  url: string;
  serverId: string;
  apiKey: string;
}

export interface PterodactylResult {
  success: boolean;
  error?: string;
  statusCode?: number;
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

    log('INFO', `Pterodactyl API initialized for server ${serverId}`);
  }

  /**
   * Sends whitelist add command to Pterodactyl
   */
  public async whitelistPlayer(username: string): Promise<PterodactylResult> {
    const endpoint = `${this.config.url}/api/client/servers/${this.config.serverId}/command`;
    const command = `whitelist add ${username}`;

    log('INFO', `Sending command to Pterodactyl: ${command}`);

    try {
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
        log('INFO', `Successfully whitelisted ${username} on Pterodactyl`);
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
