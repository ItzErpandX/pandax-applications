import { EmbedBuilder, type CommandInteraction } from 'discord.js';
import { Discord, Slash } from 'discordx';

@Discord()
export class PingCommand {
    @Slash({ name: 'ping', description: 'Check the bot\'s latency' })
    async ping(interaction: CommandInteraction) {
        const latency = Date.now() - interaction.createdTimestamp;

        const embed = new EmbedBuilder()
            .setTitle('🏓 Pong!')
            .setDescription(`<:ping:1394822140838154450> Latency: ${latency}ms\n🛰️ API Latency: ${Math.round(interaction.client.ws.ping)}ms`)
            .setColor('Green')
            .setFooter({ text: 'Ping Command', iconURL: 'https://cdn.discordapp.com/attachments/1251639593682468877/1393954012478312519/Poison-Box-Icon-FINAL.png?ex=68750c56&is=6873bad6&hm=4fa47a5f4bebc376e6cbc5f11fc0ae9301e7d9494ab5cbec6d550e5719b89f91&' })
            .setTimestamp();
        
        return await interaction.reply({ embeds: [embed], flags: 64 });
    }
}
