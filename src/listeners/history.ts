import { EmbedBuilder, type ButtonInteraction } from 'discord.js';
import { ButtonComponent, Discord } from 'discordx';
import { prisma } from '..';
import { Pagination, PaginationType } from '@discordx/pagination';
import { config } from '../config';

@Discord()
export class HistoryListener {
    @ButtonComponent({ id: /history:.+/ })
    async history(interaction: ButtonInteraction) {
        try {
            await interaction.deferReply({ flags: 64 });
            
            const userId = interaction.customId.split(':')[1];
            const member = await interaction.guild?.members.fetch(userId).catch(() => null);
            if (!member) return interaction.editReply({ content: 'User not found' });

            const applications = await prisma.application.findMany({
                where: {
                    userId,
                    status: {
                        not: 'PENDING'
                    }
                },
                include: {
                    responses: true
                }
            }).catch(error => {
                console.error('Database error fetching applications:', error);
                throw new Error('Failed to fetch applications');
            });

            if (!applications.length) return interaction.editReply({ content: 'No applications found' });

            const embeds = [];
            const files: { attachment: Buffer; name: string }[] = [];
            
            for (const application of applications) {
                try {
                    const sortedResponses = application.responses.sort((a, b) => a.id - b.id);

                    const description = sortedResponses
                        .map((response) => `### ${response.question}\n> ${response.answer}`)
                        .join('\n');

                    const prettyCategory = config.categories.find((category) => category.id === application.category)?.name ?? 'Unknown';

                    const createdAt = application.createdAt
                        ? `<t:${Math.floor(new Date(application.createdAt).getTime() / 1000)}:F>`
                        : 'Unknown';

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
                            text: member.user.tag,
                            iconURL: member.user.displayAvatarURL()
                        })
                        .setTimestamp();

                    if (description.length > 4096) {
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
                } catch (error) {
                    console.error(`Error processing application ${application.id}:`, error);
                    // Continue with next application even if one fails
                }
            }

            if (!embeds.length) {
                return interaction.editReply({ content: 'Error processing applications. Please try again.' });
            }

            const messageOptions = embeds.map((embed, i) => {
                let filesArr = [];
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

            try {
                const pagination = new Pagination(interaction, messageOptions, {
                    type: PaginationType.Button,
                    ephemeral: true
                });
                await pagination.send();
            } catch (error) {
                console.error('Pagination error:', error);
                await interaction.editReply({ content: 'Failed to display application history. Please try again.' });
            }
        } catch (error) {
            console.error('Error in history command:', error);
            await interaction.editReply({ content: 'An error occurred while fetching application history.' }).catch(() => {});
        }
    }
}