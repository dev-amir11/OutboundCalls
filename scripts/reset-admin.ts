import "dotenv/config";
import { compare, hash } from "bcryptjs";
import { prisma } from "../src/lib/prisma";

async function main() {
  const email = (process.env.ADMIN_EMAIL || "admin@outbound.local").toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "ChangeMe123!";
  const passwordHash = await hash(password, 10);
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, name: "Administrator" },
    create: { email, name: "Administrator", passwordHash },
    select: { id: true, email: true, passwordHash: true },
  });
  console.log(`ok email=${user.email} passwordOk=${await compare(password, user.passwordHash)}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });
