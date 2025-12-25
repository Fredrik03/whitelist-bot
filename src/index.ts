import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  CommandInteraction
} from 'discord.js';
import dotenv from 'dotenv';
import { database } from './database';
import { pterodactyl } from './pterodactyl';
import { validateUsername } from './validators';
import { log, formatDate } from './utils';
import { StatusMonitor } from './statusMonitor';

// Load environment variables
dotenv.config();

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const DISCORD_STATUS_CHANNEL_ID = process.env.DISCORD_STATUS_CHANNEL_ID;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;

if (!DISCORD_TOKEN || !DISCORD_CHANNEL_ID || !CLIENT_ID) {
  log('ERROR', 'Missing required Discord environment variables');
  process.exit(1);
}

// Status monitor instance (initialized when bot is ready)
let statusMonitor: StatusMonitor | undefined;

// Create Discord client
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// Define slash commands
const whitelistCommand = new SlashCommandBuilder()
  .setName('whitelist')
  .setDescription('Whitelist en spiller på Minecraft serveren')
  .addStringOption(option =>
    option
      .setName('username')
      .setDescription('Minecraft brukernavn (3-16 tegn, a-z A-Z 0-9 _ og valgfritt . i starten)')
      .setRequired(true)
  );

const unwhitelistCommand = new SlashCommandBuilder()
  .setName('unwhitelist')
  .setDescription('Fjern en spiller fra whitelist')
  .addStringOption(option =>
    option
      .setName('username')
      .setDescription('Minecraft brukernavn')
      .setRequired(true)
  );

const whitelistListCommand = new SlashCommandBuilder()
  .setName('whitelist-list')
  .setDescription('Vis alle spillere på whitelist');

const whitelistSyncCommand = new SlashCommandBuilder()
  .setName('whitelist-sync')
  .setDescription('Synkroniser whitelist database med serveren');

// Register slash commands
async function registerCommands() {
  try {
    log('INFO', 'Registering slash commands...');
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN!);

    await rest.put(
      Routes.applicationCommands(CLIENT_ID!),
      { body: [
        whitelistCommand.toJSON(),
        unwhitelistCommand.toJSON(),
        whitelistListCommand.toJSON(),
        whitelistSyncCommand.toJSON()
      ] }
    );

    log('INFO', 'Successfully registered slash commands');
  } catch (error) {
    log('ERROR', `Failed to register slash commands: ${error}`);
    throw error;
  }
}

// Handle whitelist command
async function handleWhitelistCommand(interaction: ChatInputCommandInteraction) {
  const username = interaction.options.getString('username', true);
  const userTag = interaction.user.tag;
  const userId = interaction.user.id;

  log('INFO', `Whitelist command received for ${username} by ${userTag}`);

  // Validate username
  const validation = validateUsername(username);
  if (!validation.valid) {
    log('WARN', `Invalid username ${username}: ${validation.error}`);
    await interaction.reply({
      content: `❌ **Ugyldig brukernavn**\n${validation.error}`,
      ephemeral: true
    });
    return;
  }

  // Check if already whitelisted
  try {
    const existing = database.isWhitelisted(username);
    if (existing) {
      log('INFO', `${username} is already whitelisted since ${existing.added_at}`);
      await interaction.reply({
        content: `⚠️ **${username}** er allerede whitelistet siden ${formatDate(existing.added_at)}`,
        ephemeral: true
      });
      return;
    }
  } catch (error) {
    log('ERROR', `Database error checking ${username}: ${error}`);
    await interaction.reply({
      content: '❌ Database feil. Vennligst prøv igjen senere.',
      ephemeral: true
    });
    return;
  }

  // Defer reply since Pterodactyl call might take time
  await interaction.deferReply();

  // Call Pterodactyl API with console feedback
  const result = await pterodactyl.whitelistPlayerWithFeedback(username);

  if (result.success) {
    // Add to database
    try {
      database.addToWhitelist(username, userId, userTag);
    } catch (error) {
      log('ERROR', `Failed to add ${username} to database after successful Pterodactyl call: ${error}`);
      await interaction.editReply({
        content: '⚠️ Spilleren ble whitelistet på serveren, men kunne ikke lagres i databasen. Kontakt administrator.'
      });
      return;
    }

    // Send success embed
    const successEmbed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('✅ Spiller whitelistet!')
      .addFields(
        { name: 'Brukernavn', value: username, inline: true },
        { name: 'Lagt til av', value: `<@${userId}>`, inline: true },
        { name: 'Tidspunkt', value: formatDate(new Date()), inline: true }
      )
      .setFooter({ text: 'Whitelist System' })
      .setTimestamp();

    try {
      const channel = await client.channels.fetch(DISCORD_CHANNEL_ID!);
      if (channel?.isTextBased() && 'send' in channel) {
        await channel.send({ embeds: [successEmbed] });
      }
    } catch (error) {
      log('ERROR', `Failed to send success embed to channel: ${error}`);
    }

    await interaction.editReply({
      content: `✅ **${username}** har blitt whitelistet!`
    });

  } else {
    // Send error embed
    const errorEmbed = new EmbedBuilder()
      .setColor(0xED4245)
      .setTitle('❌ Whitelist feilet')
      .addFields(
        { name: 'Brukernavn', value: username, inline: true },
        { name: 'Feilmelding', value: result.error || 'Ukjent feil', inline: false }
      )
      .setFooter({ text: 'Whitelist System' })
      .setTimestamp();

    try {
      const channel = await client.channels.fetch(DISCORD_CHANNEL_ID!);
      if (channel?.isTextBased() && 'send' in channel) {
        await channel.send({ embeds: [errorEmbed] });
      }
    } catch (error) {
      log('ERROR', `Failed to send error embed to channel: ${error}`);
    }

    await interaction.editReply({
      content: `❌ Kunne ikke whitelist **${username}**\n${result.error}`
    });
  }
}

// Bot ready event
client.once('ready', () => {
  log('INFO', `Bot logged in as ${client.user?.tag}`);
  log('INFO', 'Whitelist bot is ready!');

  // Start status monitor if channel ID is configured
  if (DISCORD_STATUS_CHANNEL_ID) {
    const updateInterval = parseInt(process.env.STATUS_UPDATE_INTERVAL || '30000', 10);
    statusMonitor = new StatusMonitor(client, DISCORD_STATUS_CHANNEL_ID, updateInterval);
    statusMonitor.start();
    log('INFO', `Status monitor initialized (update interval: ${updateInterval}ms)`);
  } else {
    log('WARN', 'DISCORD_STATUS_CHANNEL_ID not set, status monitor disabled');
  }
});

// Handle unwhitelist command
async function handleUnwhitelistCommand(interaction: ChatInputCommandInteraction) {
  const username = interaction.options.getString('username', true);
  const userTag = interaction.user.tag;
  const userId = interaction.user.id;

  log('INFO', `Unwhitelist command received for ${username} by ${userTag}`);

  // Defer reply
  await interaction.deferReply();

  // Call Pterodactyl API to remove from whitelist
  const result = await pterodactyl.unwhitelistPlayer(username);

  if (result.success) {
    // Remove from database if exists
    try {
      database.removeFromWhitelist(username);
    } catch (error) {
      log('WARN', `Failed to remove ${username} from database: ${error}`);
    }

    // Send success embed
    const successEmbed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('✅ Spiller fjernet fra whitelist!')
      .addFields(
        { name: 'Brukernavn', value: username, inline: true },
        { name: 'Fjernet av', value: `<@${userId}>`, inline: true },
        { name: 'Tidspunkt', value: formatDate(new Date()), inline: true }
      )
      .setFooter({ text: 'Whitelist System' })
      .setTimestamp();

    try {
      const channel = await client.channels.fetch(DISCORD_CHANNEL_ID!);
      if (channel?.isTextBased() && 'send' in channel) {
        await channel.send({ embeds: [successEmbed] });
      }
    } catch (error) {
      log('ERROR', `Failed to send success embed to channel: ${error}`);
    }

    await interaction.editReply({
      content: `✅ **${username}** har blitt fjernet fra whitelist!`
    });

  } else {
    await interaction.editReply({
      content: `❌ Kunne ikke fjerne **${username}** fra whitelist\n${result.error}`
    });
  }
}

// Handle whitelist list command
async function handleWhitelistListCommand(interaction: ChatInputCommandInteraction) {
  log('INFO', `Whitelist list command received by ${interaction.user.tag}`);

  await interaction.deferReply({ ephemeral: true });

  try {
    // Read whitelist from server
    const whitelist = await pterodactyl.readWhitelist();

    if (whitelist.length === 0) {
      await interaction.editReply({
        content: '📋 Whitelist er tom.'
      });
      return;
    }

    // Create embed with whitelist
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('📋 Whitelist')
      .setDescription(`Totalt **${whitelist.length}** spillere på whitelist`)
      .setFooter({ text: 'Whitelist System' })
      .setTimestamp();

    // Split into chunks of 25 (Discord field limit)
    const chunkSize = 25;
    for (let i = 0; i < whitelist.length; i += chunkSize) {
      const chunk = whitelist.slice(i, i + chunkSize);
      const playerList = chunk.map((entry, index) => `${i + index + 1}. ${entry.name}`).join('\n');
      embed.addFields({
        name: `Spillere ${i + 1}-${Math.min(i + chunkSize, whitelist.length)}`,
        value: playerList,
        inline: false
      });
    }

    await interaction.editReply({ embeds: [embed] });

  } catch (error: any) {
    log('ERROR', `Failed to list whitelist: ${error.message}`);
    await interaction.editReply({
      content: '❌ Kunne ikke lese whitelist fra serveren.'
    });
  }
}

// Handle whitelist sync command
async function handleWhitelistSyncCommand(interaction: ChatInputCommandInteraction) {
  log('INFO', `Whitelist sync command received by ${interaction.user.tag}`);

  await interaction.deferReply({ ephemeral: true });

  try {
    // Read whitelist from server
    const whitelist = await pterodactyl.readWhitelist();

    // Sync with database
    const synced = database.syncWithServerWhitelist(whitelist);

    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('🔄 Whitelist synkronisert!')
      .addFields(
        { name: 'Spillere på server', value: whitelist.length.toString(), inline: true },
        { name: 'Lagt til i database', value: synced.added.toString(), inline: true },
        { name: 'Fjernet fra database', value: synced.removed.toString(), inline: true }
      )
      .setFooter({ text: 'Whitelist System' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

  } catch (error: any) {
    log('ERROR', `Failed to sync whitelist: ${error.message}`);
    await interaction.editReply({
      content: '❌ Kunne ikke synkronisere whitelist.'
    });
  }
}

// Handle interactions
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  try {
    switch (interaction.commandName) {
      case 'whitelist':
        await handleWhitelistCommand(interaction);
        break;
      case 'unwhitelist':
        await handleUnwhitelistCommand(interaction);
        break;
      case 'whitelist-list':
        await handleWhitelistListCommand(interaction);
        break;
      case 'whitelist-sync':
        await handleWhitelistSyncCommand(interaction);
        break;
    }
  } catch (error) {
    log('ERROR', `Error handling command ${interaction.commandName}: ${error}`);
    const reply = {
      content: '❌ En feil oppstod under behandling av kommandoen.',
      ephemeral: true
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.editReply(reply);
    } else {
      await interaction.reply(reply);
    }
  }
});

// Graceful shutdown
function shutdown(signal: string) {
  log('INFO', `Received ${signal}, shutting down gracefully...`);
  if (statusMonitor) {
    statusMonitor.stop();
  }
  pterodactyl.cleanup();
  database.close();
  client.destroy();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Start bot
async function start() {
  try {
    log('INFO', 'Starting whitelist bot...');
    await registerCommands();
    await client.login(DISCORD_TOKEN!);
  } catch (error) {
    log('ERROR', `Failed to start bot: ${error}`);
    process.exit(1);
  }
}

start();
