import { Client, EmbedBuilder, TextChannel } from 'discord.js';
import { pterodactyl, ServerStatus } from './pterodactyl';
import { log } from './utils';

export class StatusMonitor {
  private client: Client;
  private channelId: string;
  private updateInterval: number;
  private intervalHandle?: NodeJS.Timeout;
  private statusMessageId?: string;

  constructor(client: Client, channelId: string, updateInterval: number = 60000) {
    this.client = client;
    this.channelId = channelId;
    this.updateInterval = updateInterval; // Default 60 seconds
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

      const result = await pterodactyl.getServerStatus();
      const embed = this.createStatusEmbed(result.success, result.status, result.error);

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
  private createStatusEmbed(success: boolean, status?: ServerStatus, error?: string): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle('🖥️ Server Status')
      .setTimestamp();

    if (!success || !status) {
      // Server is offline or error occurred
      embed
        .setColor(0xED4245) // Red
        .addFields(
          { name: 'Status', value: '🔴 Offline', inline: true },
          { name: 'Players', value: '0', inline: true },
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

    embed
      .setColor(color)
      .addFields(
        { name: 'Status', value: `${statusEmoji} ${statusText}`, inline: true },
        { name: 'CPU', value: `${cpuPercent}%`, inline: true },
        { name: 'Uptime', value: uptimeStr, inline: true },
        { name: 'Memory', value: `${memoryUsedMB} MB / ${memoryLimitMB} MB (${memoryPercent}%)`, inline: false }
      )
      .setFooter({ text: 'Updates every 60 seconds • Last updated' });

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
