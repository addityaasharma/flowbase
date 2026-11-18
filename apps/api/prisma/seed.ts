import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash("password123", 10);
  const people = [["Aditya Sharma", "admin@bitcode.dev", "ADMIN", "Engineering Lead"]] as const;
  const users = [];
  for (const [name, email, role, title] of people)
    users.push(await prisma.user.upsert({ where: { email }, update: {}, create: { name, email, role, title, passwordHash: hash } }));
    if (await prisma.project.findFirst({ where: { key: "BIT" } })) return console.log("Already seeded");
  await prisma.project.create({
    data: { name: "App & Web Engineering", key: "BIT", description: "Core product engineering at Bitcode Software", members: { create: users.map((u) => ({ userId: u.id, role: "ADMIN" as const })) } },
  });
  console.log("Seeded. Login: admin@bitcode.dev / password123");
}
main().finally(() => prisma.$disconnect());
