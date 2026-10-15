import 'dotenv/config';
import { PrismaClient, type Role, type Status } from '@prisma/client';
import argon2 from 'argon2';
const db = new PrismaClient();
const passwordHash = await argon2.hash('TaskflowDemo!2026', { type: argon2.argon2id });
const users = [];
for (const [name,email,role] of [ ['Alex Morgan','alex@taskflow.local','PROJECT_HEAD'], ['Jordan Lee','jordan@taskflow.local','PROJECT_HEAD'], ['Sam Rivera','sam@taskflow.local','ASSIGNEE'], ['Taylor Kim','taylor@taskflow.local','ASSIGNEE'], ['Casey Chen','casey@taskflow.local','ASSIGNEE'] ]) {
  users.push(await db.user.upsert({ where:{email}, update:{}, create:{name,email,role:role as Role,passwordHash} }));
}
if (await db.project.count() === 0) {
  const launch = await db.project.create({data:{name:'Website relaunch',description:'A thoughtful new home for our product. Bring the brand, experience, and engineering together.',headId:users[0].id}});
  const mobile = await db.project.create({data:{name:'Mobile experience',description:'Make everyday workflows feel effortless on every screen.',headId:users[0].id}});
  const ops = await db.project.create({data:{name:'Customer onboarding',description:'Help new customers get to their first meaningful win.',headId:users[1].id}});
  for (const [title,description,projectId,assigneeId,status] of [
    ['Design the landing page','Explore the new visual direction and deliver responsive designs for the homepage.',launch.id,users[2].id,'IN_PROGRESS'],
    ['Review navigation patterns','Audit navigation and propose a simpler information architecture.',launch.id,users[3].id,'TODO'],
    ['Define the brand foundations','Document our typography, palette, and core design principles.',launch.id,users[2].id,'DONE'],
    ['Map the mobile journey','Capture the key moments in the mobile task experience.',mobile.id,users[4].id,'DONE'],
    ['Write the welcome checklist','Create a friendly guide to getting started.',ops.id,users[3].id,'DONE']
  ]) await db.task.create({data:{title,description,projectId,assigneeId,status:status as Status,completedAt:status==='DONE'?new Date():null}});
}
await db.$disconnect();
console.log('Demo data ready. Password: TaskflowDemo!2026');
