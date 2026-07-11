import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('demo-password-123', 10);

  const owner = await prisma.user.upsert({
    where: { email: 'owner@demo.collabspace.dev' },
    create: { email: 'owner@demo.collabspace.dev', displayName: 'Ada Owner', passwordHash },
    update: {},
  });
  const member = await prisma.user.upsert({
    where: { email: 'member@demo.collabspace.dev' },
    create: { email: 'member@demo.collabspace.dev', displayName: 'Grace Member', passwordHash },
    update: {},
  });

  const org = await prisma.organization.upsert({
    where: { slug: 'demo-org' },
    create: {
      name: 'Demo Org',
      slug: 'demo-org',
      members: {
        create: [
          { userId: owner.id, role: 'OWNER' },
          { userId: member.id, role: 'MEMBER' },
        ],
      },
    },
    update: {},
  });

  const workspace = await prisma.workspace.upsert({
    where: { organizationId_slug: { organizationId: org.id, slug: 'main' } },
    create: { organizationId: org.id, name: 'Main Workspace', slug: 'main' },
    update: {},
  });

  const project = await prisma.project.upsert({
    where: { workspaceId_key: { workspaceId: workspace.id, key: 'DEMO' } },
    create: {
      workspaceId: workspace.id,
      name: 'Demo Project',
      key: 'DEMO',
      createdById: owner.id,
    },
    update: {},
  });

  const existingTasks = await prisma.task.count({ where: { projectId: project.id } });
  if (existingTasks === 0) {
    await prisma.task.createMany({
      data: [
        { projectId: project.id, number: 1, title: 'Set up project board', status: 'DONE', priority: 'MEDIUM', boardRank: 'a', createdById: owner.id, assigneeId: owner.id },
        { projectId: project.id, number: 2, title: 'Draft onboarding doc', status: 'IN_PROGRESS', priority: 'HIGH', boardRank: 'b', createdById: owner.id, assigneeId: member.id },
        { projectId: project.id, number: 3, title: 'Invite the team', status: 'TODO', priority: 'LOW', boardRank: 'c', createdById: owner.id },
      ],
    });
  }

  await prisma.document.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      workspaceId: workspace.id,
      title: 'Welcome to CollabSpace',
      createdById: owner.id,
    },
    update: {},
  });

  const channel = await prisma.channel.upsert({
    where: { workspaceId_name: { workspaceId: workspace.id, name: 'general' } },
    create: {
      workspaceId: workspace.id,
      name: 'general',
      createdById: owner.id,
      members: { create: [{ userId: owner.id }, { userId: member.id }] },
    },
    update: {},
  });

  const existingMessages = await prisma.message.count({ where: { channelId: channel.id } });
  if (existingMessages === 0) {
    await prisma.message.create({
      data: { channelId: channel.id, authorId: owner.id, body: 'Welcome to the team!' },
    });
  }

  console.log('Seeded demo org:', org.slug);
  console.log('  owner@demo.collabspace.dev / demo-password-123');
  console.log('  member@demo.collabspace.dev / demo-password-123');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
