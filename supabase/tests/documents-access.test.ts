import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { count, TestDatabase } from "./harness";
import { buildWorld, type World } from "./fixtures";

/**
 * 0010: owner-uploaded documents ("Design & Floor Map") are view/download only
 * for everyone who can open the project, including admins who reach it through
 * a material request.
 */
let t: TestDatabase;
let w: World;
let hidden: string;
const floorMap = () => `${w.projectB}/drawings/0001-floor-map.pdf`;

beforeAll(async () => {
  t = await TestDatabase.create();
  w = await buildWorld(t);
  // A project no admin can reach (no requests, no admin members).
  hidden = await t.createProject(w.clientB, { name: "Private Project" });

  for (const [projectId, path] of [
    [w.projectB, floorMap()],
    [hidden, `${hidden}/drawings/0002-private.pdf`],
  ] as const) {
    await t.asUser(w.owner.id, async (tx) => {
      await tx.query("insert into storage.objects (bucket_id, name, metadata) values ('project-documents', $1, $2)", [
        path,
        JSON.stringify({ size: 4096, mimetype: "application/pdf" }),
      ]);
      await tx.query(
        `insert into public.project_documents (project_id, category, file_name, storage_path, uploaded_by)
         values ($1, 'drawings', 'floor-map.pdf', $2, $3)`,
        [projectId, path, w.owner.id],
      );
    });
  }
});

afterAll(async () => {
  await t?.close();
});

describe("design & floor map documents", () => {
  it("are readable by the assigned site manager", async () => {
    await t.asUser(w.sm2.id, async (tx) => {
      expect(await count(tx, "public.project_documents", "project_id = $1", [w.projectB])).toBe(1);
      expect(await count(tx, "storage.objects", "name = $1", [floorMap()])).toBe(1);
    });
  });

  it("are readable by an admin who reaches the project through a material request", async () => {
    await t.asUser(w.admin2.id, async (tx) => {
      expect(await count(tx, "public.project_documents", "project_id = $1", [w.projectB])).toBe(1);
      expect(await count(tx, "storage.objects", "name = $1", [floorMap()])).toBe(1);
    });
  });

  it("stay hidden from staff who cannot open the project", async () => {
    for (const user of [w.admin1, w.admin2, w.sm1]) {
      await t.asUser(user.id, async (tx) => {
        expect(await count(tx, "public.project_documents", "project_id = $1", [hidden]), user.name).toBe(0);
        expect(await count(tx, "storage.objects", "name like $1", [`${hidden}/%`]), user.name).toBe(0);
      });
    }
    // admin1's requests are all on project A, so project B stays closed to them too.
    await t.asUser(w.admin1.id, async (tx) => {
      expect(await count(tx, "public.project_documents", "project_id = $1", [w.projectB])).toBe(0);
    });
  });

  it("are view and download only for admins and site managers", async () => {
    for (const user of [w.admin2, w.sm2]) {
      const archived = await t.asUser(user.id, (tx) =>
        tx.query("update public.project_documents set archived_at = now() where project_id = $1", [w.projectB]),
      );
      expect(archived.affectedRows ?? 0, user.name).toBe(0);
      const removed = await t.asUser(user.id, (tx) =>
        tx.query("delete from storage.objects where name = $1", [floorMap()]),
      );
      expect(removed.affectedRows ?? 0, user.name).toBe(0);
    }
    await expect(
      t.asUser(w.admin2.id, (tx) =>
        tx.query("insert into storage.objects (bucket_id, name) values ('project-documents', $1)", [
          `${w.projectB}/drawings/admin-upload.pdf`,
        ]),
      ),
    ).rejects.toThrow(/row-level security/);
  });
});
