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

// Load environment variables
dotenv.config();

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;

if (!DISCORD_TOKEN || !DISCORD_CHANNEL_ID || !CLIENT_ID) {
  log('ERROR', 'Missing required Discord environment variables');
  process.exit(1);
}

// Create Discord client
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// Define slash command
const whitelistCommand = new SlashCommandBuilder()
  .setName('whitelist')
  .setDescription('Whitelist en spiller på Minecraft serveren')
  .addStringOption(option =>
    option
      .setName('username')
      .setDescription('Minecraft brukernavn (3-16 tegn, a-z A-Z 0-9 _ og valgfritt . i starten)')
      .setRequired(true)
  );

// Register slash commands
async function registerCommands() {
  try {
    log('INFO', 'Registering slash commands...');
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN!);

    await rest.put(
      Routes.applicationCommands(CLIENT_ID!),
      { body: [whitelistCommand.toJSON()] }
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

  // Call Pterodactyl API
  const result = await pterodactyl.whitelistPlayer(username);

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
});

// Handle interactions
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'whitelist') {
    try {
      await handleWhitelistCommand(interaction);
    } catch (error) {
      log('ERROR', `Error handling whitelist command: ${error}`);
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
  }
});

// Graceful shutdown
function shutdown(signal: string) {
  log('INFO', `Received ${signal}, shutting down gracefully...`);
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
