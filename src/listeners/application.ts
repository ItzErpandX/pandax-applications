import { ButtonInteraction, ChannelType, EmbedBuilder, TextChannel, type StringSelectMenuInteraction } from 'discord.js';
import { ButtonComponent, Discord, On, SelectMenuComponent, type ArgsOf } from 'discordx';
import { config } from '../config';
import { client, prisma } from '..';
import { formattedMS, listToString } from '../utils/functions';
import { infoRow, cancelRow, reviewRow } from '../utils/buttons';

@Discord()
export class ApplicationListener {
    @SelectMenuComponent({ id: 'application_menu' })
    async applicationMenu(interaction: StringSelectMenuInteraction) {
        await interaction.deferReply({ flags: 64 });
        
        if (!interaction.guild) return interaction.editReply({ content: 'This interaction can only be used in a server' });
        const selected = interaction.values[0];
        const category = config.categories.find((category) => category.id === selected);
        if (!category) return interaction.editReply({ content: 'You unselected the application. You can now reselect it if you wish to apply again.' });

        // Check if user is blacklisted
        const userData = await prisma.user.findUnique({ where: { id: interaction.user.id } });
        if (userData?.blacklisted) {
            return interaction.editReply({ content: 'You are blacklisted and cannot submit applications.' });
        }        
    
        // Check if the user already has an active application session
        const activeSession = await prisma.session.findFirst({
            where: { userId: interaction.user.id }
        });
    
        if (activeSession) {
            const embed = new EmbedBuilder()
                .setTitle(`You are already filling out an application!`)
                .setDescription(`You are already filling out an application! If you wish to start a new application, please cancel the current one first.`)
                .setColor('#FF0000');

            await interaction.editReply({ embeds: [embed], components: [cancelRow] });
            return;
        }
    
        // Check if the user has applied for this category within the last 14 days
        const hasApplied = await prisma.application.findFirst({
            where: {
                userId: interaction.user.id,
                category: category.id,
                createdAt: { gte: new Date(Date.now() - 1000 * 60 * 60 * 24 * 14) }
            }
        });
    
        if (hasApplied) {
            return interaction.editReply({ content: 'You have already applied for this category within the last 14 days.' });
        }
    
        const firstQuestion = category.questions[0];
    
        const embed = new EmbedBuilder()
            .setTitle(category.name)
            .setDescription(`Question: ${firstQuestion}`)
            .setColor('Blue');
        
        try {
            await interaction.user.send({ embeds: [embed], components: [cancelRow] });
            await interaction.editReply({ content: 'An application process has been started in your DMs.' });
        } catch (error) {
            await interaction.editReply({ content: 'I could not send you a DM. Please enable your DMs and try again.' });
            return;
        }
        
        const message = await prisma.session.findFirst({
            where: { userId: interaction.user.id }
        });

        // Create a new session
        await prisma.session.create({
            data: {
                userId: interaction.user.id,
                category: category.id,
                lastQuestionId: message ? String(message.id) : ''
            }
        });
    }
    

    @ButtonComponent({ id: 'cancel_application' })
    async cancelApplication(interaction: ButtonInteraction) {
        await interaction.deferReply({ flags: 64 });
        
        const session = await prisma.session.findFirst({
            where: {
                userId: interaction.user.id
            }
        });

        if (!session) {
            return interaction.editReply({ content: 'No active application process' });
        }

        await prisma.session.delete({
            where: {
                id: session.id
            }
        });

        interaction.editReply({ content: 'The application process has been cancelled.' });
    }

    @On({ event: 'messageCreate' })
    async onMessage([message]: ArgsOf<'messageCreate'>) {
        if (message.author.bot || message.channel.type !== ChannelType.DM) return;
        
        const session = await prisma.session.findFirst({
            where: {
                userId: message.author.id
            },
            include: {
                answers: true
            }
        });
        if (!session) return;

        const category = config.categories.find((category) => category.id === session.category);
        if (!category) return;

        const current = category.questions[session.answers.length];
        const currentIndex = category.questions.indexOf(current);

        const nextIndex = currentIndex + 1;
        if (nextIndex === category.questions.length) {
            const data = await prisma.session.findFirst({
                where: {
                    id: session.id
                },
                include: {
                    answers: true
                }
            });
            if (!data) return;

            const applicationLogsId = config.applicationLogs;
            const applicationLogs = await client.channels.fetch(applicationLogsId) as TextChannel;
            if (!applicationLogs) {
                try {
                    await message.author.send('An unexpected error occurred.');
                } catch (error) {
                    console.error('Failed to send error message to user:', error);
                }
                return;
            }

            try {
                await prisma.answer.create({
                    data: {
                        question: category.questions[currentIndex],
                        answer: message.content,
                        sessionId: session.id
                    }
                });
            } catch (error) {
                console.error('Failed to create answer:', error);
                try {
                    await message.author.send('An error occurred while saving your answer. Please try again.');
                } catch (error) {
                    console.error('Failed to send error message to user:', error);
                }
                return;
            }

            const updatedData = await prisma.session.findFirst({
                where: { id: session.id },
                include: { answers: true }
            });

            if (!updatedData) return;            
            let appData;
            try {
                appData = await prisma.application.create({
                    data: {
                        userId: message.author.id,
                        category: category.id,
                        status: 'PENDING',
                        responses: {
                            create: [
                                ...updatedData.answers.map((answer) => ({
                                    question: answer.question,
                                    answer: answer.answer
                                })),
                            ]
                        }
                    }
                });
            } catch (error) {
                console.error('Failed to create application:', error);
                try {
                    await message.author.send('An error occurred while submitting your application. Please try again.');
                } catch (error) {
                    console.error('Failed to send error message to user:', error);
                }
                return;
            }

            const string = listToString(data.answers.map((answer) => `**${answer.question}**\n${answer.answer}`));
            if (string.length > 4000) {
                try {
                    const fullAnswers = [
                        ...updatedData.answers.map(
                            (answer) => `**${answer.question}**\n${answer.answer}`
                        )
                    ];
                    const fullString = listToString(fullAnswers);

                    const embed = new EmbedBuilder()
                        .setTitle(`Application for ${category.name} | Application ID: ${appData.id}`)
                        .setDescription(
                            `Submitted by: <@${message.author.id}> (${message.author.id})\n` +
                            'Answers are too long to be displayed here, so they are attached as a file.'
                        )
                        .addFields([
                            {
                                name: 'Time Taken',
                                value: formattedMS(Date.now() - session.createdAt.getTime()),
                            }
                        ])
                        .setFooter({
                            text: message.author.username,
                            iconURL: message.author.displayAvatarURL()
                        })
                        .setThumbnail(message.author.displayAvatarURL())
                        .setColor('Yellow')
                        .setTimestamp();

                    const buffer = Buffer.from(fullString);
                    await applicationLogs.send({
                        files: [{ attachment: buffer, name: `${session.id}.txt` }],
                        embeds: [embed],
                        components: [reviewRow(message.author.id, appData.id)],
                        content: "<@&1323823045638623252>"
                    });

                    const sentEmbed = new EmbedBuilder()
                        .setTitle('Application Submitted')
                        .setDescription('Your application has been submitted.')
                        .setColor('Green');

                    await message.author.send({ embeds: [sentEmbed], components: [infoRow] });

                    await prisma.session.delete({
                        where: {
                            id: session.id
                        }
                    });
                } catch (error) {
                    console.error('Failed to process long application:', error);
                    try {
                        await message.author.send('An error occurred while processing your application. Please try again.');
                    } catch (error) {
                        console.error('Failed to send error message to user:', error);
                    }
                }
                return;
            }

            if (!updatedData) return;
            try {
                const embed = new EmbedBuilder()
                    .setTitle(`Application for ${category.name} | Application ID: ${appData.id}`)
                    .setDescription(
                        `Submitted by: <@${message.author.id}> (${message.author.id})\n` +
                        updatedData.answers
                            .map(
                                (answer) =>
                                    `### ${answer.question}\n> ${answer.answer}`
                            )
                            .join('\n')
                    )
                    .addFields([
                        {
                            name: 'Time Taken',
                            value: formattedMS(Date.now() - session.createdAt.getTime()),
                        }
                    ])
                    .setColor('Yellow')
                    .setFooter({
                        text: message.author.username,
                        iconURL: message.author.displayAvatarURL()
                    })
                    .setThumbnail(message.author.displayAvatarURL())
                    .setTimestamp();                

                await applicationLogs.send({ 
                    content: "<@&1323823045638623252>", 
                    embeds: [embed], 
                    components: [reviewRow(message.author.id, appData.id)] 
                });            

                const sentEmbed = new EmbedBuilder()
                    .setTitle('Application Submitted')
                    .setDescription('Your application has been submitted.')
                    .setColor('Green');

                await message.author.send({ embeds: [sentEmbed], components: [infoRow] });

                await prisma.session.delete({
                    where: {
                        id: session.id
                    }
                });
            } catch (error) {
                console.error('Failed to process application:', error);
                try {
                    await message.author.send('An error occurred while processing your application. Please try again.');
                } catch (error) {
                    console.error('Failed to send error message to user:', error);
                }
            }
            return;
        }

        try {
            await prisma.answer.create({
                data: {
                    question: category.questions[currentIndex],
                    answer: message.content,
                    sessionId: session.id
                }
            });

            const nextQuestion = category.questions[nextIndex];
            const embed = new EmbedBuilder()
                .setTitle(category.name)
                .setDescription(`${nextQuestion}`)
                .setColor('Blue');

            const newMessage = await message.author.send({ embeds: [embed], components: [cancelRow] });

            const existingSession = await prisma.session.findUnique({ where: { id: session.id } });
            if (existingSession) {
                await prisma.session.update({
                    where: { id: session.id },
                    data: { lastQuestionId: newMessage.id }
                });
            }
        } catch (error) {
            console.error('Failed to process answer:', error);
            try {
                await message.author.send('An error occurred while processing your answer. Please try again.');
            } catch (error) {
                console.error('Failed to send error message to user:', error);
            }
        }
    }
}