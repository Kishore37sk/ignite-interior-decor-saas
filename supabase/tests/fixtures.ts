import { rpcScalar, type TestDatabase, type TestUser } from "./harness";

export interface MaterialItemInput {
  material_name: string;
  quantity: number;
  unit: string;
  category?: string;
  estimated_unit_cost?: number;
  material_id?: string;
  notes?: string;
}

/**
 * A small multi-tenant world used by the RLS and workflow suites:
 *  - sm1 runs projectA (clientA), sm2 runs projectB (clientB)
 *  - requestA1 (projectA) is unassigned, requestA2 is assigned to admin1,
 *    requestB1 (projectB) is assigned to admin2
 */
export interface World {
  owner: TestUser;
  sm1: TestUser;
  sm2: TestUser;
  admin1: TestUser;
  admin2: TestUser;
  clientA: string;
  clientB: string;
  projectA: string;
  projectB: string;
  requestA1: string;
  requestA2: string;
  requestB1: string;
}

export async function createRequest(
  t: TestDatabase,
  userId: string,
  projectId: string,
  items: MaterialItemInput[],
  opts: { title?: string; requiredOffset?: number; priority?: string; allowDuplicate?: boolean } = {},
): Promise<string> {
  const requiredDate = await t.dateOffset(opts.requiredOffset ?? 10);
  return t.asUser(userId, (tx) =>
    rpcScalar<string>(tx, "create_material_request", {
      p_project_id: projectId,
      p_title: opts.title ?? `Materials for ${items.map((i) => i.material_name).join(", ")}`,
      p_required_date: requiredDate,
      p_priority: opts.priority ?? "medium",
      p_notes: null,
      p_items: items,
      p_allow_duplicate: opts.allowDuplicate ?? false,
    }),
  );
}

export async function assignRequest(t: TestDatabase, ownerId: string, requestId: string, adminId: string | null) {
  await t.asUser(ownerId, (tx) =>
    rpcScalar<null>(tx, "assign_material_request", { p_request_id: requestId, p_admin_id: adminId }),
  );
}

export async function buildWorld(t: TestDatabase): Promise<World> {
  const owner = await t.createUser("owner", "Kishore", { employeeId: "OWN-01" });
  const sm1 = await t.createUser("site_manager", "Ravi", { employeeId: "SM-04" });
  const sm2 = await t.createUser("site_manager", "Suresh", { employeeId: "SM-05" });
  const admin1 = await t.createUser("admin", "Priya", { employeeId: "AD-01" });
  const admin2 = await t.createUser("admin", "Anita", { employeeId: "AD-02" });

  const clientA = await t.createClient("Mr. Kumar", { email: "kumar@example.in" });
  const clientB = await t.createClient("Mrs. Mehta", { email: "mehta@example.in", city: "Mumbai" });

  const projectA = await t.createProject(clientA, { name: "Kumar Residence", status: "execution", progress: 60, cost: 400000 });
  const projectB = await t.createProject(clientB, { name: "Mehta Office", status: "design", progress: 20, cost: 900000 });

  await t.asUser(owner.id, async (tx) => {
    await rpcScalar(tx, "assign_project_member", {
      p_project_id: projectA,
      p_user_id: sm1.id,
      p_member_role: "site_manager",
    });
    await rpcScalar(tx, "assign_project_member", {
      p_project_id: projectB,
      p_user_id: sm2.id,
      p_member_role: "site_manager",
    });
  });

  const requestA1 = await createRequest(t, sm1.id, projectA, [
    { material_name: "Cement", quantity: 100, unit: "Bags", category: "Civil", estimated_unit_cost: 420 },
  ]);
  const requestA2 = await createRequest(t, sm1.id, projectA, [
    { material_name: "Vitrified Tiles", quantity: 800, unit: "Sq Ft", category: "Tiles", estimated_unit_cost: 55 },
  ]);
  const requestB1 = await createRequest(t, sm2.id, projectB, [
    { material_name: "Plywood 18mm", quantity: 15, unit: "Sheets", category: "Carpentry", estimated_unit_cost: 2400 },
  ]);

  await assignRequest(t, owner.id, requestA2, admin1.id);
  await assignRequest(t, owner.id, requestB1, admin2.id);

  await t.asUser(sm2.id, (tx) =>
    rpcScalar(tx, "submit_project_update", {
      p_project_id: projectB,
      p_status: "design",
      p_progress: 25,
      p_update_date: null,
      p_milestone: "Design",
      p_expected_completion_date: null,
      p_issues: null,
      p_notes: "Layout approved by client.",
      p_next_action: "Start procurement",
    }),
  );

  return { owner, sm1, sm2, admin1, admin2, clientA, clientB, projectA, projectB, requestA1, requestA2, requestB1 };
}

/** Matches errors raised as "<CODE>: message" by the database. */
export const appError = (code: string): RegExp => new RegExp(`^${code}:`);
