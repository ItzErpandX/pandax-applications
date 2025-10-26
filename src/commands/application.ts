import { ApplicationCommandOptionType, CommandInteraction, EmbedBuilder, GuildMember } from 'discord.js';
import { Discord, Slash, SlashChoice, SlashGroup, SlashOption } from 'discordx';
import { prisma, client } from '..';
import { config } from '../config';
import { Pagination, PaginationType } from '@discordx/pagination';
import { reviewRow } from '../utils/buttons';

@Discord()
@SlashGroup({ name: 'application', description: 'Application commands', defaultMemberPermissions: ['Administrator'] })
export class ApplicationCommand {
    @Slash({ name: 'blacklist', description: 'Blacklist a user from applying' })
    @SlashGroup('application')
    async blacklist(
        @SlashOption({
            name: 'user',
            description: 'The user to blacklist',
            type: ApplicationCommandOptionType.User,
            required: false,
        })
        user: GuildMember,
        interaction: CommandInteraction
    ) {
        await interaction.deferReply({ flags: 64 }); 

        // Check if the command is used in a guild
        if (!interaction.guild) return await interaction.editReply({ content: 'This command can only be used in a server' });

        // Check if the user has the required permissions
        if (!interaction.memberPermissions?.has('Administrator')) return await interaction.editReply({ content: 'You do not have permission to use this command' });

        // If no user is provided, list all blacklisted users
        if (!user) {
            const users = await prisma.user.findMany({ where: { blacklisted: true } });
            if (!users.length) return await interaction.editReply("No users are blacklisted");

            // Format the list of blacklisted users
            const message = users.map((user) => `<@${user.id}>`).join('\n');
            const embed = new EmbedBuilder()
                .setTitle('Blacklisted Users')
                .setColor('Red')
                .setDescription(message);
            return await interaction.editReply({ embeds: [embed] });
        }

        // If a user is provided, check if they are already blacklisted
        const blacklisted = await prisma.user.findFirst({ where: { id: user.id } });
        if (blacklisted) return await interaction.editReply({ content: 'This user is already blacklisted' });

        // If not blacklisted, create a new entry in the database
        await prisma.user.create({ data: { id: user.id, blacklisted: true } });
        return await interaction.editReply({ content: `Successfully blacklisted ${user}` });
    }

    @Slash({ name: 'unblacklist', description: 'Unblacklist a user from applying' })
    @SlashGroup('application')
    async unblacklist(
        @SlashOption({
            name: 'user',
            description: 'The user to unblacklist',
            type: ApplicationCommandOptionType.User,
            required: true,
        })
        user: GuildMember,
        interaction: CommandInteraction
    ) {
        await interaction.deferReply({ flags: 64 }); 
        if (!interaction.guild) return await interaction.editReply({ content: 'This command can only be used in a server' });
        if (!interaction.memberPermissions?.has('Administrator')) return await interaction.editReply({ content: 'You do not have permission to use this command' });

        const blacklisted = await prisma.user.findFirst({ where: { id: user.id } });
        if (!blacklisted) return await interaction.editReply({ content: 'This user is not blacklisted' });

        await prisma.user.delete({ where: { id: user.id } });
        return await interaction.editReply({ content: `Successfully unblacklisted ${user}` });
    }

    @Slash({ name: 'delete', description: 'Delete an application from the database' })
    @SlashGroup('application')
    async delete(
        @SlashOption({
            name: 'application_id',
            description: 'The ID of the application to delete',
            type: ApplicationCommandOptionType.String,
            required: true,
        })
        applicationId: string,
        interaction: CommandInteraction
    ) {
        await interaction.deferReply({ flags: 64 });
        if (!interaction.guild) return await interaction.editReply({ content: 'This command can only be used in a server' });
        if (!interaction.memberPermissions?.has('Administrator')) return await interaction.editReply({ content: 'You do not have permission to use this command' });
        
        const applicationIdNum = parseInt(applicationId);
        if (isNaN(applicationIdNum)) return await interaction.editReply({ content: 'Invalid application ID provided' });
        
        const application = await prisma.application.findUnique({ where: { id: applicationIdNum } });
        if (!application) return await interaction.editReply({ content: 'Application not found' });
        
        // Delete related responses first to avoid foreign key constraint violation
        await prisma.response.deleteMany({ where: { applicationId: application.id } });
        
        // Now delete the application
        await prisma.application.delete({ where: { id: application.id } });
        
        return await interaction.editReply({ content: `Successfully deleted application with ID ${applicationId}` });
    }

    @Slash({ name: 'history', description: 'View a user\'s application history' })
    @SlashGroup('application')
    async history(
        @SlashOption({
            name: 'user',
            description: 'The user to view the history of',
            type: ApplicationCommandOptionType.User,
            required: true,
        })
        user: GuildMember,
        interaction: CommandInteraction
    ) {
        await interaction.deferReply({ flags: 64 }); 
        if (!interaction.guild) return await interaction.editReply({ content: 'This command can only be used in a server' });
        if (!interaction.memberPermissions?.has('Administrator')) return await interaction.editReply({ content: 'You do not have permission to use this command' });
        const applications = await prisma.application.findMany({
            where: {
                userId: user.id,
                status: {
                    not: 'PENDING'
                }
            },
            include: {
                responses: true
            }
        });

        if (!applications.length) return await interaction.editReply({ content: 'No applications found' });

        const embeds = [];
        const files: { attachment: Buffer; name: string }[] = [];
        for (const application of applications) {
            const sortedResponses = application.responses.sort((a, b) => a.id - b.id);

            const description = sortedResponses
                .map((response) => `### ${response.question}\n> ${response.answer}`)
                .join('\n');

            const prettyCategory = config.categories.find((category) => category.id === application.category)?.name ?? 'Unknown';

            // Format dates for Discord
            const createdAt = application.createdAt
                ? `<t:${Math.floor(new Date(application.createdAt).getTime() / 1000)}:F>`
                : 'Unknown';

            // Prepare status-specific fields
            let statusFields = [
                { name: 'Status', value: application.status, inline: true },
                { name: 'Created at', value: createdAt, inline: true }
            ];

            if (application.status === 'ACCEPTED') {
                statusFields.push(
                    {
                        name: 'Accepted by',
                        value: application.statusChangedBy ? `<@${application.statusChangedBy}>` : 'Unknown',
                        inline: true
                    },
                    {
                        name: 'Accepted at',
                        value: application.statusChangedAt
                            ? `<t:${Math.floor(new Date(application.statusChangedAt).getTime() / 1000)}:F>`
                            : 'Unknown',
                        inline: true
                    },
                    {
                        name: 'Application ID',
                        value: application.id.toString(),
                        inline: true
                    }
                );
            } else if (application.status === 'DENIED') {
                statusFields.push(
                    {
                        name: 'Denied by',
                        value: application.statusChangedBy ? `<@${application.statusChangedBy}>` : 'Unknown',
                        inline: true
                    },
                    {
                        name: 'Denied at',
                        value: application.statusChangedAt
                            ? `<t:${Math.floor(new Date(application.statusChangedAt).getTime() / 1000)}:F>`
                            : 'Unknown',
                        inline: true
                    },
                    {
                        name: 'Application ID',
                        value: application.id.toString(),
                        inline: true
                    }
                );
            }

            let embed = new EmbedBuilder()
                .setTitle(prettyCategory)
                .addFields(statusFields)
                .setColor(application.status === 'ACCEPTED' ? 'Green' : 'Red')
                .setFooter({
                    text: user.user.tag,
                    iconURL: user.user.displayAvatarURL()
                })
                .setTimestamp();

            if (description.length > 4096) {
                // Attach as file
                const fileName = `application_${application.id}.txt`;
                files.push({
                    attachment: Buffer.from(description, 'utf-8'),
                    name: fileName
                });
                embed.setDescription(`Application is too long. See attached file: \`${fileName}\``);
            } else {
                embed.setDescription(description);
            }

            embeds.push(embed);
        }
        const messageOptions = embeds.map((embed, i) => {
            // Check if this embed needs a file attached
            let filesArr = [];
            // Find the corresponding application and description
            const sortedResponses = applications[i].responses.sort((a, b) => a.id - b.id);
            const description = sortedResponses
                .map((response) => `${response.question}\n> ${response.answer}`)
                .join('\n');
            if (description.length > 4096) {
                const fileName = `application_${applications[i].id}.txt`;
                filesArr.push({
                    attachment: Buffer.from(description, 'utf-8'),
                    name: fileName
                });
            }
            return {
                embeds: [embed],
                files: filesArr
            };
        });

        const pagination = new Pagination(interaction, messageOptions, {
            type: PaginationType.Button,
            ephemeral: true
        });
        pagination.send();
    }
    @Slash({ name: 'pending', description: 'View and manage all pending applications' })
    @SlashGroup('application')
    async pending(interaction: CommandInteraction) {
        await interaction.deferReply({ flags: 64 }); 
        if (!interaction.guild || !interaction.memberPermissions?.has('Administrator')) {
            return await interaction.editReply({ content: 'You do not have permission to use this command here.' });
        }

        const pendingApps = await prisma.application.findMany({
            where: { status: 'PENDING' },
            include: { responses: true },
            orderBy: { createdAt: 'asc' }, // Show oldest first
        });

        if (!pendingApps.length) {
            return await interaction.editReply({ content: 'There are no pending applications.' });
        }

        const pages = [];
        for (const app of pendingApps) {
            // Re-create the embed for the application
            const description = app.responses
                .sort((a, b) => a.id - b.id)
                .map((response) => `### ${response.question}\n> ${response.answer}`)
                .join('\n');

            const prettyCategory = config.categories.find((c) => c.id === app.category)?.name ?? 'Unknown';
            const user = await client.users.fetch(app.userId).catch(() => null);

            const embed = new EmbedBuilder()
                .setTitle(`Application for ${prettyCategory} | ID: ${app.id}`)
                .setAuthor({
                    name: user ? user.tag : `Unknown User (${app.userId})`,
                    iconURL: user?.displayAvatarURL(),
                })
                .setDescription(description.length > 4000 ? description.substring(0, 4000) + '...' : description)
                .setColor('Blue')
                .setTimestamp(app.createdAt)
                .setFooter({ text: `User ID: ${app.userId}` });

            pages.push({
                embeds: [embed],
                // This is the key: reuse your existing button-generating function
                components: [reviewRow(app.userId, app.id)],
            });
        }

        // Send the paginated list as an ephemeral message
        const pagination = new Pagination(interaction, pages, {
            type: PaginationType.Button,
            ephemeral: true,
            showStartEnd: true,
        });
        await pagination.send();
    }    
}