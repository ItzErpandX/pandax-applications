import { importx } from '@discordx/importer';
import { IntentsBitField, Partials, type Interaction, ActivityType, EmbedBuilder } from 'discord.js';
import { Client } from 'discordx';
import { config } from './config';
import { PrismaClient } from '@prisma/client';
import { startExpiredApplicationsJob } from './cron/application';
import { loadAntiCrash } from './utils/anticrash';

export const prisma = new PrismaClient();

export const client = new Client({
	botGuilds: [(client) => client.guilds.cache.map((guild) => guild.id)],
	intents: [
		IntentsBitField.Flags.Guilds,
		IntentsBitField.Flags.GuildMessages,
		IntentsBitField.Flags.GuildMessageReactions,
		IntentsBitField.Flags.DirectMessages,
		IntentsBitField.Flags.MessageContent,
	],
	partials: [Partials.Channel],
	silent: false
});

client.once('ready', async () => {
	await client.guilds.fetch();

	// Synchronize applications commands with Discord
	await client.initApplicationCommands();

	// To clear all guild commands, uncomment this line,
	// This is useful when moving from guild commands to global commands
	// It must only be executed once
	//
	//  await bot.clearApplicationCommands(
	//    ...bot.guilds.cache.map((g) => g.id)
	//  );

	console.log(`Logged in as ${client.user?.tag}!`)
});

client.on('interactionCreate', async (interaction: Interaction) => {
	if ((interaction.isButton() || interaction.isStringSelectMenu()) && interaction.customId.startsWith('discordx@pagination@')) return;

	try {
		await client.executeInteraction(interaction);
	} catch (error: any) {
		console.error(error);
		if (interaction.isRepliable()) {
			await interaction.reply({
				content: error.message,
				ephemeral: true
			});
		}
	}
});

await importx(__dirname + '/{listeners,commands}/**/*.{ts,js}');

const token = config.token;
if (!token) {
    throw Error("Could not find a bot token in the config.json file.");
}

await client.login(token);

startExpiredApplicationsJob();
loadAntiCrash(client);