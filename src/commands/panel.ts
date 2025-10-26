import { ActionRowBuilder, EmbedBuilder, StringSelectMenuBuilder, TextChannel, type CommandInteraction } from 'discord.js';
import { Discord, Slash } from 'discordx';
import { config } from '../config';

@Discord()
export class PanelCommand {
    @Slash({ name: 'panel', description: 'Send the application panel' })
    async panel(interaction: CommandInteraction) {
        await interaction.deferReply({ flags: 64 });
        if (!interaction.guild) return await interaction.editReply({ content: 'This command can only be used in a server' });
        if (!interaction.memberPermissions?.has('Administrator')) return await interaction.editReply({ content: 'You do not have permission to use this command' });
        const categories = config.categories;

        const embed = new EmbedBuilder()
            .setTitle(config.applicationPanelEmbed.title)
            .setDescription(config.applicationPanelEmbed.description)
            .setColor(config.applicationPanelEmbed.color || 'Blue')
            .setFooter({ 
            text: 'PoisonBox Applications', 
            iconURL: 'https://cdn.discordapp.com/attachments/1251639593682468877/1393954012478312519/Poison-Box-Icon-FINAL.png?ex=68750c56&is=6873bad6&hm=4fa47a5f4bebc376e6cbc5f11fc0ae9301e7d9494ab5cbec6d550e5719b89f91&'
            })
            .setTimestamp()
            .setThumbnail('https://cdn.discordapp.com/attachments/1251639593682468877/1393953982010884267/Poison-Box-Logo-FINAL.png?ex=68750c4f&is=6873bacf&hm=817df2dfd10a315aa4b52e060d290b5e529ac10e6abfc587cb439c7b8cf911be&');

        const menu = new StringSelectMenuBuilder()
            .setCustomId('application_menu')
            .setPlaceholder('Select a category')
            .setMinValues(0) // Allows users to unselect options
            .addOptions(categories.map((category) => ({
                label: category.name,
                value: category.id,
                description: category.description
            })));
        
        const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);

        const channel = interaction.channel as TextChannel;
        channel.send({ components: [row], embeds: [embed] });

        return await interaction.editReply({ content: 'The application panel has been sent!' }); 
    }
}
