import { CronJob } from 'cron';
import { client, prisma } from '..';

const job = new CronJob('0 */1 * * * *', checkExpiredApplications);

async function checkExpiredApplications() {
    const sessions = await prisma.session.findMany({
        where: {
            createdAt: {
                lt: new Date(Date.now() - 1000 * 60 * 60)
            }
        }
    });

    for (const session of sessions) {
        await prisma.session.delete({
            where: {
                id: session.id
            }
        });

        const user = await client.users.fetch(session.userId);
        if (!user) continue;

        user.send({ content: 'Your application process has been cancelled due to taking over an hour.' });
        console.log(`Cancelled application process for ${user.tag}`);
    }
}

export function startExpiredApplicationsJob() {
    job.start();
    console.log('Expired applications job started');
}