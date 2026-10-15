import "dotenv/config";
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
try {
  const projects = await db.project.findMany({
    where: {
      head: { email: "alex@taskflow.local" },
      name: { startsWith: "Collaboration studio " },
    },
    include: { tasks: { select: { title: true } } },
  });
  const ids = projects
    .filter(
      (project) =>
        /^Collaboration studio \d+$/.test(project.name) &&
        project.tasks.every((task) =>
          /^Prepare launch checklist \d+( — reviewed)?$/.test(task.title),
        ),
    )
    .map((project) => project.id);
  await db.project.deleteMany({ where: { id: { in: ids } } });
  const users = await db.user.findMany({
    where: {
      name: "Demo QA Assignee",
      email: { startsWith: "browser-" },
      tasks: { none: {} },
    },
    select: { id: true, email: true },
  });
  await db.user.deleteMany({
    where: {
      id: {
        in: users
          .filter((user) => /^browser-\d+@example\.test$/.test(user.email))
          .map((user) => user.id),
      },
    },
  });
  console.log("Browser test records cleaned up.");
} finally {
  await db.$disconnect();
}
