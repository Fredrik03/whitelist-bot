import { status } from 'minecraft-server-util';
import { log } from './utils';

export interface PlayerInfo {
  online: number;
  max: number;
  players: string[];
}

export interface MinecraftQueryResult {
  success: boolean;
  playerInfo?: PlayerInfo;
  error?: string;
}

class MinecraftQuery {
  private host?: string;
  private port: number;
  private enabled: boolean;

  constructor() {
    this.host = process.env.MINECRAFT_SERVER_HOST;
    this.port = parseInt(process.env.MINECRAFT_SERVER_PORT || '25565', 10);
    this.enabled = !!this.host;

    if (this.enabled) {
      log('INFO', `Minecraft query enabled for ${this.host}:${this.port}`);
    } else {
      log('WARN', 'MINECRAFT_SERVER_HOST not set, player tracking disabled');
    }
  }

  /**
   * Query the Minecraft server for player information
   */
  public async getPlayers(): Promise<MinecraftQueryResult> {
    if (!this.enabled || !this.host) {
      return {
        success: false,
        error: 'Minecraft server not configured'
      };
    }

    try {
      const response = await status(this.host, this.port, {
        timeout: 5000,
        enableSRV: true
      });

      // Extract player information
      const playerInfo: PlayerInfo = {
        online: response.players.online,
        max: response.players.max,
        players: response.players.sample?.map(p => p.name) || []
      };

      return {
        success: true,
        playerInfo
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log('ERROR', `Failed to query Minecraft server: ${errorMessage}`);

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Check if query is enabled
   */
  public isEnabled(): boolean {
    return this.enabled;
  }
}

export const minecraftQuery = new MinecraftQuery();
