import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, ModalSubmitInteraction, TextInputBuilder, TextInputStyle, type ButtonInteraction } from 'discord.js';
import { ButtonComponent, Discord, ModalComponent } from 'discordx';
import { listToString } from '../utils/functions';
import { prisma } from '..';
import { config } from '../config';
import { infoRow } from '../utils/buttons';

@Discord()
export class ReviewListener {
    @ButtonComponent({ id: /accept_application:.+/ })
    async acceptApplicationButton(interaction: ButtonInteraction) {
        try {
            await interaction.deferReply({ flags: 64 });
            
            const userId = interaction.customId.split(':')[1];
            const applicationId = interaction.customId.split(':')[2];
            
            const member = await interaction.guild?.members.fetch(userId).catch(() => null);
            if (!member) return interaction.editReply({ content: 'User not found' });

            const application = await prisma.application.findUnique({
                where: { id: parseInt(applicationId) }
            }).catch(error => {
                console.error('Database error fetching application:', error);
                throw new Error('Failed to fetch application');
            });
            
            if (!application) return interaction.editReply({ content: 'Application not found' });

            const prettyCategory = config.categories.find((category) => category.id === application.category)?.name ?? 'Unknown';
            
            // Try to send DM to applicant
            try {
                const embed = new EmbedBuilder()
                    .setTitle('✅ Application Accepted')
                    .setDescription(listToString([
                        `${interaction.user} has accepted your application for **${prettyCategory}**.`,
                        `Please open a ticket in <#${config.ticketChannel}> to proceed with the next stage.`
                    ]))
                    .setColor('Green');
                
                await member.send({ 
                    content: `Congratulations, ${member.user}!`, 
                    embeds: [embed], 
                    components: [infoRow] 
                });
            } catch (dmError) {
                console.error('Failed to send DM to applicant:', dmError);
                // Continue even if DM fails
            }

            // Update the application message
            try {
                const currentEmbed = interaction.message?.embeds[0].data;
                const timeTakenFieldIndex = currentEmbed?.fields?.findIndex(
                    (field: any) => field.name?.toLowerCase().includes('time taken')
                );

                let newFields = currentEmbed?.fields ? [...currentEmbed.fields] : [];
                const acceptedByField = {
                    name: 'Accepted by',
                    value: interaction.user.tag,
                    inline: false
                };

                if (typeof timeTakenFieldIndex === 'number' && timeTakenFieldIndex > -1) {
                    newFields.splice(timeTakenFieldIndex + 1, 0, acceptedByField);
                } else {
                    newFields.push(acceptedByField);
                }

                const newEmbed = new EmbedBuilder(currentEmbed)
                    .setColor('Green')
                    .setFields(newFields)
                    .setDescription(currentEmbed?.description ?? '');

                await interaction.message?.edit({ embeds: [newEmbed], components: [] });
            } catch (editError) {
                console.error('Failed to edit application message:');
                // ignore the fking error
            }

            // Update database
            try {
                await prisma.application.update({
                    where: { id: application.id },
                    data: {
                        status: 'ACCEPTED',
                        statusChangedAt: new Date(),
                        statusChangedBy: interaction.user.id
                    }
                });
            } catch (dbError) {
                console.error('Database error updating application:', dbError);
                return interaction.editReply({ content: 'Failed to update application status in database' });
            }

            // Send to logs channel
            try {
                const logsChannel = await interaction.guild?.channels.fetch(config.applicationLogs2);
                if (logsChannel?.isTextBased()) {
                    const logEmbed = new EmbedBuilder()
                        .setTitle('✅ Application Accepted')
                        .setColor('Green')
                        .setDescription(
                            `Congratulations, ${member.user}!\n` +
                            `Your application for **${prettyCategory}** has been accepted.\n` +
                            `Please open a ticket in <#1323823180057673841> to proceed with the next stage.`
                        )
                        .setThumbnail(member.user.displayAvatarURL({ size: 1024 }))
                        .setFooter({ 
                            text: `Accepted by: ${interaction.user.tag} | Application ID: ${application.id}`,
                            iconURL: interaction.user.displayAvatarURL({ size: 128 })
                        });
                    await logsChannel.send({ 
                        content: `<@${member.id}>`, 
                        embeds: [logEmbed] 
                    });
                }
            } catch (logError) {
                console.error('Failed to send to logs channel:', logError);
                // Continue even if log fails
            }

            await interaction.editReply({ content: 'The application has been accepted.' });
        } catch (error) {
            console.error('Error in acceptApplicationButton:', error);
            await interaction.editReply({ content: 'An error occurred while accepting the application.' }).catch(() => {});
        }
    }

    @ButtonComponent({ id: /deny_application:.+/ })
    async denyApplication(interaction: ButtonInteraction) {
        try {
            const userId = interaction.customId.split(':')[1];
            const applicationId = interaction.customId.split(':')[2];
            
            // Quick validation before showing modal
            const member = await interaction.guild?.members.fetch(userId).catch(() => null);
            if (!member) {
                return interaction.reply({ content: 'User not found', flags: 64 });
            }

            const application = await prisma.application.findUnique({
                where: { id: parseInt(applicationId) }
            }).catch(error => {
                console.error('Database error fetching application:', error);
                return null;
            });
            
            if (!application) {
                return interaction.reply({ content: 'Application not found', flags: 64 });
            }

            if (application.status !== 'PENDING') {
                return interaction.reply({
                    content: `This application has already been ${application.status.toLowerCase()}.`,
                    flags: 64
                });
            }

            const reasonInput = new TextInputBuilder()
                .setCustomId('reason')
                .setLabel('Reason')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Enter the reason for denying the application')
                .setMaxLength(500)
                .setRequired(true);
            
            const modal = new ModalBuilder()
                .setCustomId(`deny_application:${userId}:${applicationId}`)
                .setTitle('Deny Application')
                .addComponents(
                    new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput)
                );
            
            await interaction.showModal(modal);
        } catch (error) {
            console.error('Error in denyApplication:', error);
            await interaction.reply({ 
                content: 'An error occurred while trying to deny the application.',
                flags: 64
            }).catch(() => {});
        }
    }

    @ModalComponent({ id: /deny_application:.+/ })
    async denyApplicationModal(interaction: ModalSubmitInteraction) {
        try {
            await interaction.deferReply({ flags: 64 });
            
            const userId = interaction.customId.split(':')[1];
            const applicationId = interaction.customId.split(':')[2];
            
            const member = await interaction.guild?.members.fetch(userId).catch(() => null);
            if (!member) return interaction.editReply({ content: 'User not found' });

            const application = await prisma.application.findUnique({
                where: { id: parseInt(applicationId) }
            }).catch(error => {
                console.error('Database error fetching application:', error);
                throw new Error('Failed to fetch application');
            });
            
            if (!application) return interaction.editReply({ content: 'Application not found' });

            if (application.status !== 'PENDING') {
                return interaction.editReply({
                    content: `This application has already been ${application.status.toLowerCase()}.`
                });
            }

            const reason = interaction.fields.getTextInputValue('reason');
            const prettyCategory = config.categories.find((category) => category.id === application.category)?.name ?? 'Unknown';
            
            // Try to send DM to applicant
            try {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Application Denied')
                    .setDescription(listToString([
                        `${interaction.user} has denied your application for **${prettyCategory}**.`,
                        `### Reason:`,
                        `\`\`\`${reason}\`\`\``
                    ]))
                    .setColor('Red');

                await member.send({ 
                    content: `We're sorry, ${member.user}.`, 
                    embeds: [embed], 
                    components: [infoRow] 
                });
            } catch (dmError) {
                console.error('Failed to send DM to applicant:');
                // Continue even if DM fails
            }

            // Update the application message
            try {
                const currentEmbed = interaction.message?.embeds[0].data;
                const timeTakenFieldIndex = currentEmbed?.fields?.findIndex(
                    (field: any) => field.name?.toLowerCase().includes('time taken')
                );

                let newFields = currentEmbed?.fields ? [...currentEmbed.fields] : [];
                const deniedByField = {
                    name: 'Denied by',
                    value: interaction.user.tag,
                    inline: false
                };
                const reasonField = {
                    name: 'Reason',
                    value: `\`\`\`${reason}\`\`\``,
                    inline: false
                };

                if (typeof timeTakenFieldIndex === 'number' && timeTakenFieldIndex > -1) {
                    newFields.splice(timeTakenFieldIndex + 1, 0, deniedByField, reasonField);
                } else {
                    newFields.push(deniedByField, reasonField);
                }

                const newEmbed = new EmbedBuilder(currentEmbed)
                    .setColor('Red')
                    .setFields(newFields)
                    .setDescription(currentEmbed?.description ?? '');

                await interaction.message?.edit({ embeds: [newEmbed], components: [] });
            } catch (editError) {
                console.error('Failed to edit application message:');
                // ignore the fking error
            }

            // Update database
            try {
                await prisma.application.update({
                    where: { id: application.id },
                    data: {
                        status: 'DENIED',
                        statusChangedAt: new Date(),
                        statusChangedBy: interaction.user.id
                    }
                });
            } catch (dbError) {
                console.error('Database error updating application:', dbError);
                return interaction.editReply({ content: 'Failed to update application status in database' });
            }

            // Send to logs channel
            try {
                const logsChannel = await interaction.guild?.channels.fetch(config.applicationLogs2);
                if (logsChannel?.isTextBased()) {
                    const logEmbed = new EmbedBuilder()
                        .setTitle('❌ Application Denied')
                        .setColor('Red')
                        .setDescription(
                            `We're sorry, ${member.user}.\n` +
                            `Your application for **${prettyCategory}** has been denied.\n` +
                            `### Reason:` +
                            `\`\`\`${reason}\`\`\``
                        )
                        .setThumbnail(member.user.displayAvatarURL({ size: 1024 }))
                        .setFooter({ 
                            text: `Denied by: ${interaction.user.tag} | Application ID: ${application.id}`,
                            iconURL: interaction.user.displayAvatarURL({ size: 128 })
                        });
                    await logsChannel.send({ 
                        content: `<@${member.id}>`, 
                        embeds: [logEmbed] 
                    });
                }
            } catch (logError) {
                console.error('Failed to send to logs channel:', logError);
                // Continue even if log fails
            }

            await interaction.editReply({ content: 'The application has been denied.' });
        } catch (error) {
            console.error('Error in denyApplicationModal:');
            await interaction.editReply({ 
                content: 'An error occurred while denying the application.' 
            }).catch(() => {});
        }
    }
}