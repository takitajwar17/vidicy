import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { getDBFromDatabase, type getDB } from "@/db";
import * as schema from "@/db/schema";
import { startTestPostgres } from "./postgres";

export async function createWorkflowDatabase(cluster: ReturnType<typeof startTestPostgres>) {
  const name = `workflow_${randomUUID().replaceAll("-", "")}`;
  const admin = cluster.createPool();
  await admin.query(`CREATE DATABASE "${name}"`);
  await admin.end();
  const pool = cluster.createPool(name);
  const migrations = resolve("src/db/postgres-migrations");
  for (const file of readdirSync(migrations)
    .filter((file) => file.endsWith(".sql"))
    .sort())
    await pool.query(readFileSync(resolve(migrations, file), "utf8"));
  return { db: getDBFromDatabase(pool), pool, close: () => pool.end() };
}

export async function seedWorkflowCase({
  db,
  document = true,
}: {
  db: ReturnType<typeof getDB>;
  document?: boolean;
}) {
  const [user] = await db
    .insert(schema.userTable)
    .values({ email: `${randomUUID()}@example.test`, emailVerified: new Date() })
    .returning();
  const [agency] = await db
    .insert(schema.agencyTable)
    .values({ ownerUserId: user.id, name: "Test agency" })
    .returning();
  await db.insert(schema.agencyTeamMemberTable).values({
    agencyId: agency.id,
    userId: user.id,
    email: user.email!,
    role: "admin",
    status: "active",
  });
  const [client] = await db
    .insert(schema.agencyClientTable)
    .values({
      agencyId: agency.id,
      name: "Synthetic Client",
      email: `client-${randomUUID()}@example.test`,
    })
    .returning();
  const [application] = await db
    .insert(schema.visaApplicationTable)
    .values({
      userId: user.id,
      agencyId: agency.id,
      clientId: client.id,
      clientName: client.name,
      homeCountry: "Bangladesh",
      currentCountry: "Bangladesh",
      destinationCountry: "Japan",
      visaType: "Tourist",
      embassy: "Dhaka",
    })
    .returning();
  const [applicant] = await db
    .insert(schema.applicantTable)
    .values({ applicationId: application.id, name: "Synthetic Applicant", relationship: "primary" })
    .returning();
  const [item] = await db
    .insert(schema.checklistItemTable)
    .values({
      applicationId: application.id,
      applicantId: applicant.id,
      documentName: "Passport",
      description: "Valid passport",
      isRequired: true,
    })
    .returning();
  if (document)
    await db.insert(schema.uploadedDocumentTable).values({
      applicationId: application.id,
      applicantId: applicant.id,
      checklistItemId: item.id,
      fileName: "passport.pdf",
      mimeType: "application/pdf",
      fileSize: 100,
      fileKey: "synthetic/passport",
    });
  return {
    agencyId: agency.id,
    clientId: client.id,
    applicationId: application.id,
    applicantId: applicant.id,
    userId: user.id,
    itemId: item.id,
  };
}
