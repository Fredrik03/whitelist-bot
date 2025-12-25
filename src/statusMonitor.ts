import { Client, EmbedBuilder, TextChannel } from 'discord.js';
import { pterodactyl, ServerStatus } from './pterodactyl';
import { minecraftQuery, PlayerInfo } from './minecraftQuery';
import { log } from './utils';

export class StatusMonitor {
  private client: Client;
  private channelId: string;
  private updateInterval: number;
  private intervalHandle?: NodeJS.Timeout;
  private statusMessageId?: string;

  constructor(client: Client, channelId: string, updateInterval: number = 30000) {
    this.client = client;
    this.channelId = channelId;
    this.updateInterval = updateInterval; // Default 30 seconds
  }

  /**
   * Start monitoring server status
   */
  public start() {
    log('INFO', `Starting status monitor for channel ${this.channelId}`);

    // Initial update
    this.updateStatus();

    // Schedule periodic updates
    this.intervalHandle = setInterval(() => {
      this.updateStatus();
    }, this.updateInterval);
  }

  /**
   * Stop monitoring
   */
  public stop() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = undefined;
      log('INFO', 'Status monitor stopped');
    }
  }

  /**
   * Update the status message
   */
  private async updateStatus() {
    try {
      const channel = await this.client.channels.fetch(this.channelId);

      if (!channel || !channel.isTextBased() || !(channel instanceof TextChannel)) {
        log('ERROR', `Status channel ${this.channelId} is not a valid text channel`);
        return;
      }

      // Fetch server status
      const serverResult = await pterodactyl.getServerStatus();

      // Try to get player info from console first (more accurate), then fall back to query
      let playerInfo: PlayerInfo | undefined;

      if (serverResult.success && serverResult.status?.state === 'running') {
        try {
          // Try console-based player tracking (requires WebSocket)
          const consolePlayerData = await pterodactyl.getOnlinePlayers();
          playerInfo = {
            online: consolePlayerData.count,
            max: consolePlayerData.max,
            players: consolePlayerData.players
          };
          log('INFO', `Player data from console: ${consolePlayerData.count}/${consolePlayerData.max}`);
        } catch (error) {
          log('WARN', `Console player tracking failed, trying query: ${error}`);

          // Fall back to query protocol
          if (minecraftQuery.isEnabled()) {
            const playerResult = await minecraftQuery.getPlayers();
            if (playerResult.success) {
              playerInfo = playerResult.playerInfo;
            }
          }
        }
      }

      const embed = this.createStatusEmbed(
        serverResult.success,
        serverResult.status,
        playerInfo,
        serverResult.error
      );

      // Update or create message
      if (this.statusMessageId) {
        try {
          const message = await channel.messages.fetch(this.statusMessageId);
          await message.edit({ embeds: [embed] });
        } catch (error) {
          // Message was deleted, create a new one
          log('WARN', 'Status message was deleted, creating new one');
          this.statusMessageId = undefined;
          const newMessage = await channel.send({ embeds: [embed] });
          this.statusMessageId = newMessage.id;
        }
      } else {
        const message = await channel.send({ embeds: [embed] });
        this.statusMessageId = message.id;
      }

    } catch (error) {
      log('ERROR', `Failed to update status: ${error}`);
    }
  }

  /**
   * Create status embed based on server data
   */
  private createStatusEmbed(success: boolean, status?: ServerStatus, playerInfo?: PlayerInfo, error?: string): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle('🖥️ Server Status')
      .setTimestamp();

    if (!success || !status) {
      // Server is offline or error occurred
      embed
        .setColor(0xED4245) // Red
        .addFields(
          { name: 'Status', value: '🔴 Offline', inline: true },
          { name: 'Players', value: '0/0', inline: true },
          { name: '\u200B', value: '\u200B', inline: true }
        );

      if (error) {
        embed.addFields({ name: 'Error', value: error, inline: false });
      }

      embed.setFooter({ text: 'Last updated' });
      return embed;
    }

    // Determine color and status text
    let color: number;
    let statusText: string;
    let statusEmoji: string;

    switch (status.state) {
      case 'running':
        color = 0x57F287; // Green
        statusText = 'Online';
        statusEmoji = '🟢';
        break;
      case 'starting':
        color = 0xFEE75C; // Yellow
        statusText = 'Starting';
        statusEmoji = '🟡';
        break;
      case 'stopping':
        color = 0xFEE75C; // Yellow
        statusText = 'Stopping';
        statusEmoji = '🟡';
        break;
      case 'offline':
      default:
        color = 0xED4245; // Red
        statusText = 'Offline';
        statusEmoji = '🔴';
        break;
    }

    // Format memory
    const memoryUsedMB = Math.round(status.resources.memory_bytes / 1024 / 1024);
    const memoryLimitMB = Math.round(status.resources.memory_limit_bytes / 1024 / 1024);
    const memoryPercent = Math.round((status.resources.memory_bytes / status.resources.memory_limit_bytes) * 100);

    // Format CPU
    const cpuPercent = Math.round(status.resources.cpu_absolute);

    // Format uptime
    const uptimeStr = this.formatUptime(status.resources.uptime);

    // Format player info
    let playersValue = 'N/A';
    if (playerInfo) {
      playersValue = `${playerInfo.online}/${playerInfo.max}`;
    }

    embed
      .setColor(color)
      .addFields(
        { name: 'Status', value: `${statusEmoji} ${statusText}`, inline: true },
        { name: 'Players', value: playersValue, inline: true },
        { name: 'CPU', value: `${cpuPercent}%`, inline: true },
        { name: 'Memory', value: `${memoryUsedMB} MB / ${memoryLimitMB} MB (${memoryPercent}%)`, inline: true },
        { name: 'Uptime', value: uptimeStr, inline: true },
        { name: '\u200B', value: '\u200B', inline: true }
      );

    // Add player list if available and not too many players
    if (playerInfo && playerInfo.players.length > 0) {
      const maxPlayersToShow = 15;
      let playerList: string;

      if (playerInfo.players.length <= maxPlayersToShow) {
        playerList = playerInfo.players.join(', ');
      } else {
        const shown = playerInfo.players.slice(0, maxPlayersToShow);
        const remaining = playerInfo.players.length - maxPlayersToShow;
        playerList = `${shown.join(', ')} +${remaining} more`;
      }

      embed.addFields({ name: 'Online Players', value: playerList, inline: false });
    }

    const updateIntervalSeconds = Math.round(this.updateInterval / 1000);
    embed.setFooter({ text: `Updates every ${updateIntervalSeconds} seconds • Last updated` });

    return embed;
  }

  /**
   * Format uptime in human-readable format
   */
  private formatUptime(milliseconds: number): string {
    if (milliseconds === 0) {
      return 'Just started';
    }

    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m`;
    } else {
      return `${seconds}s`;
    }
  }
}
