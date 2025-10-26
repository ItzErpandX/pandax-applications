import type { ColorResolvable } from 'discord.js';
import { readFileSync } from 'fs';

export const config = JSON.parse(readFileSync(__dirname + '/../config.json', 'utf-8')) as Config;

export interface Config {
    token: string;
    mainGuild: string;
    ticketCategory: string;
    ticketAccessRole: string;
    applicationLogs: string;
    applicationLogs2: string;
    ticketChannel: string;
    categories: Category[];
    applicationPanelEmbed: ApplicationPanelEmbed;
}

export interface Category {
    id: string;
    name: string;
    description: string;
    questions: string[];
}

export interface ApplicationPanelEmbed {
    title: string;
    description: string;
    color: ColorResolvable | null | undefined;
}