import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

// Cancel Button
export const cancelButton = new ButtonBuilder()
    .setCustomId('cancel_application')
    .setLabel('Cancel Application')
    .setStyle(ButtonStyle.Danger);

export const cancelRow = new ActionRowBuilder<ButtonBuilder>().addComponents(cancelButton);

export const infoButton = new ButtonBuilder()
    .setLabel(`Sent from PoisonBox`)
    .setStyle(ButtonStyle.Secondary)
    .setCustomId('rjkdsfa')
    .setDisabled(true);

export const infoRow = new ActionRowBuilder<ButtonBuilder>().addComponents(infoButton);

// Accept/Cancel Buttons
export const acceptButton = (userId: string, applicationId: number) => new ButtonBuilder()
    .setCustomId(`accept_application:${userId}:${applicationId}`)
    .setLabel('Accept')
    .setStyle(ButtonStyle.Success);

export const denyButton = (userId: string, applicationId: number) => new ButtonBuilder()
    .setCustomId(`deny_application:${userId}:${applicationId}`)
    .setLabel('Deny')
    .setStyle(ButtonStyle.Danger);

export const historyButton = (userId: string) => new ButtonBuilder()
    .setCustomId(`history:${userId}`)
    .setLabel('History')
    .setStyle(ButtonStyle.Primary);

export const reviewRow = (userId: string, applicationId: number) => new ActionRowBuilder<ButtonBuilder>().addComponents(acceptButton(userId, applicationId), denyButton(userId, applicationId), historyButton(userId));