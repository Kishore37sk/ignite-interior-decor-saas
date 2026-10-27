/**
 * DEVELOPMENT ONLY demo data for Ignite Interior Decor.
 *
 *   SEED_DEMO=true DEMO_USER_PASSWORD=... npm run seed:demo
 *
 * Creates demo staff accounts (SM001, SM002, AD001, AD002), clients, projects,
 * milestones, site update history and material requests across every status.
 * Every demo client uses an @demo.igniteinteriordecor.com email so demo data is
 * clearly separated from real data; the script is idempotent and skips if demo
 * clients already exist. Uses the service-role key (bypasses RLS) and never
 * prints passwords.
 */
import { config } from "dotenv";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const DEMO_DOMAIN = "demo.igniteinteriordecor.com";
const MIN_PASSWORD_LENGTH = 10;
const DAY_MS = 86_400_000;

type StaffRole = "site_manager" | "admin";
type ProjectStatus =
  | "planning"
  | "design"
  | "approval"
  | "procurement"
  | "execution"
  | "finishing"
  | "handover_pending"
  | "completed"
  | "on_hold"
  | "delayed"
  | "cancelled";
type RequestStatus =
  | "requested"
  | "pending_review"
  | "approved"
  | "rejected"
  | "ordered"
  | "partially_delivered"
  | "delivered"
  | "cancelled";
type Priority = "low" | "medium" | "high" | "urgent";

interface StaffSeed {
  key: "sm1" | "sm2" | "ad1" | "ad2";
  email: string;
  fullName: string;
  role: StaffRole;
  employeeId: string;
  phone: string;
  joinedDaysAgo: number;
}

interface ClientSeed {
  key: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
}

interface ProjectSeed {
  key: string;
  client: string;
  name: string;
  type: string;
  sm: "sm1" | "sm2";
  status: ProjectStatus;
  progress: number;
  priority: Priority;
  start: number;
  expected: number | null;
  handover: number | null;
  actualHandover: number | null;
  cost: number;
  advance: number;
  notes: string;
}

interface ItemSeed {
  material: string;
  qty: number;
  est: number;
  approved?: number;
  actual?: number;
  delivered?: number;
}

interface RequestSeed {
  project: string;
  title: string;
  status: RequestStatus;
  priority: Priority;
  admin: "ad1" | "ad2" | null;
  requestedDaysAgo: number;
  required: number;
  items: ItemSeed[];
  rejectionReason?: string;
  comment?: string;
}

const STAFF: StaffSeed[] = [
  { key: "sm1", email: `sm01@${DEMO_DOMAIN}`, fullName: "Site Manager 01", role: "site_manager", employeeId: "SM001", phone: "+91 98450 11001", joinedDaysAgo: 420 },
  { key: "sm2", email: `sm02@${DEMO_DOMAIN}`, fullName: "Site Manager 02", role: "site_manager", employeeId: "SM002", phone: "+91 98450 11002", joinedDaysAgo: 300 },
  { key: "ad1", email: `admin01@${DEMO_DOMAIN}`, fullName: "Admin 01", role: "admin", employeeId: "AD001", phone: "+91 98450 22001", joinedDaysAgo: 380 },
  { key: "ad2", email: `admin02@${DEMO_DOMAIN}`, fullName: "Admin 02", role: "admin", employeeId: "AD002", phone: "+91 98450 22002", joinedDaysAgo: 200 },
];

const CLIENTS: ClientSeed[] = [
  { key: "kumar", name: "Kumar Residence", email: `kumar.residence@${DEMO_DOMAIN}`, phone: "+91 98860 40101", address: "12, 5th Cross, HAL 2nd Stage, Indiranagar", city: "Bengaluru", state: "Karnataka" },
  { key: "arun", name: "Arun Villa", email: `arun.villa@${DEMO_DOMAIN}`, phone: "+91 98860 40102", address: "Villa 27, Prestige Lakeside Habitat, Whitefield", city: "Bengaluru", state: "Karnataka" },
  { key: "priya", name: "Priya Apartment", email: `priya.apartment@${DEMO_DOMAIN}`, phone: "+91 94440 40103", address: "Flat 4B, Ashok Towers, 2nd Avenue, Anna Nagar", city: "Chennai", state: "Tamil Nadu" },
  { key: "mehta", name: "Mehta Office", email: `mehta.office@${DEMO_DOMAIN}`, phone: "+91 98200 40104", address: "7th Floor, One BKC, Bandra Kurla Complex", city: "Mumbai", state: "Maharashtra" },
  { key: "fernandes", name: "Fernandes Penthouse", email: `fernandes.penthouse@${DEMO_DOMAIN}`, phone: "+91 98220 40105", address: "Penthouse 2, Riviera Heights, Miramar", city: "Panaji", state: "Goa" },
  { key: "iyer", name: "Iyer Duplex", email: `iyer.duplex@${DEMO_DOMAIN}`, phone: "+91 98860 40106", address: "45, 8th Main, Koramangala 4th Block", city: "Bengaluru", state: "Karnataka" },
  { key: "reddy", name: "Reddy Farmhouse", email: `reddy.farmhouse@${DEMO_DOMAIN}`, phone: "+91 98490 40107", address: "Survey No. 112, Gachibowli–Narsingi Road", city: "Hyderabad", state: "Telangana" },
  { key: "sharma", name: "Sharma Bungalow", email: `sharma.bungalow@${DEMO_DOMAIN}`, phone: "+91 98230 40108", address: "Plot 9, Mayur Colony, Kothrud", city: "Pune", state: "Maharashtra" },
];

const PROJECTS: ProjectSeed[] = [
  { key: "p1", client: "kumar", name: "Kumar Residence – 3BHK Interiors", type: "Residential", sm: "sm1", status: "execution", progress: 62, priority: "high", start: -75, expected: 25, handover: 25, actualHandover: null, cost: 1_850_000, advance: 600_000, notes: "Italian marble in living room; client prefers walnut finish." },
  { key: "p2", client: "arun", name: "Arun Villa – Full Home Interiors", type: "Villa", sm: "sm1", status: "completed", progress: 100, priority: "medium", start: -200, expected: -20, handover: -20, actualHandover: -24, cost: 4_200_000, advance: 4_200_000, notes: "Handed over ahead of schedule." },
  { key: "p3", client: "priya", name: "Priya Apartment – Modular Kitchen & Wardrobes", type: "Apartment", sm: "sm2", status: "finishing", progress: 85, priority: "high", start: -60, expected: 5, handover: 5, actualHandover: null, cost: 680_000, advance: 400_000, notes: "Handover planned before Diwali." },
  { key: "p4", client: "mehta", name: "Mehta Office – Workspace Fit-out", type: "Commercial", sm: "sm2", status: "delayed", progress: 55, priority: "urgent", start: -120, expected: -8, handover: -8, actualHandover: null, cost: 4_500_000, advance: 2_000_000, notes: "Building society approval for electrical load delayed work." },
  { key: "p5", client: "fernandes", name: "Fernandes Penthouse – Living & Dining", type: "Penthouse", sm: "sm1", status: "handover_pending", progress: 92, priority: "medium", start: -90, expected: 12, handover: 12, actualHandover: null, cost: 2_400_000, advance: 1_800_000, notes: "Snag list walkthrough scheduled with client." },
  { key: "p6", client: "iyer", name: "Iyer Duplex – Complete Interiors", type: "Duplex", sm: "sm2", status: "completed", progress: 100, priority: "medium", start: -240, expected: -60, handover: -60, actualHandover: -45, cost: 3_100_000, advance: 3_100_000, notes: "Completed 15 days late due to staircase redesign." },
  { key: "p7", client: "reddy", name: "Reddy Farmhouse – Renovation", type: "Farmhouse", sm: "sm1", status: "on_hold", progress: 30, priority: "low", start: -50, expected: 60, handover: 70, actualHandover: null, cost: 1_500_000, advance: 300_000, notes: "On hold at client's request until monsoon ends." },
  { key: "p8", client: "sharma", name: "Sharma Bungalow – Pooja Room & Foyer", type: "Bungalow", sm: "sm2", status: "design", progress: 15, priority: "medium", start: -10, expected: 25, handover: 25, actualHandover: null, cost: 320_000, advance: 100_000, notes: "Teak wood mandir design under review." },
  { key: "p9", client: "kumar", name: "Kumar Residence – Balcony Deck & Garden", type: "Residential", sm: "sm2", status: "procurement", progress: 35, priority: "low", start: -30, expected: 40, handover: 40, actualHandover: null, cost: 450_000, advance: 150_000, notes: "WPC decking selected." },
  { key: "p10", client: "iyer", name: "Iyer Duplex – Home Theatre", type: "Duplex", sm: "sm1", status: "execution", progress: 48, priority: "high", start: -40, expected: -3, handover: 5, actualHandover: null, cost: 950_000, advance: 500_000, notes: "Acoustic panels awaited from vendor." },
];

const REQUESTS: RequestSeed[] = [
  { project: "p1", title: "Cement and sand for first-floor work", status: "delivered", priority: "high", admin: "ad1", requestedDaysAgo: 40, required: -30, items: [
    { material: "Cement", qty: 100, est: 420, approved: 410, actual: 415, delivered: 100 },
    { material: "Sand", qty: 300, est: 55, approved: 55, actual: 58, delivered: 300 } ], comment: "Delivered to site, stored in covered area." },
  { project: "p1", title: "Living room flooring tiles", status: "ordered", priority: "medium", admin: "ad1", requestedDaysAgo: 6, required: 4, items: [
    { material: "Vitrified Tiles", qty: 800, est: 62, approved: 60 } ], comment: "PO raised with Kajaria dealer, dispatch in 3 days." },
  { project: "p1", title: "Lighting for living and dining", status: "requested", priority: "high", admin: null, requestedDaysAgo: 1, required: 9, items: [
    { material: "LED Panel Light", qty: 24, est: 950 } ] },
  { project: "p1", title: "False ceiling boards", status: "approved", priority: "medium", admin: "ad2", requestedDaysAgo: 4, required: 6, items: [
    { material: "Gypsum Board", qty: 40, est: 480, approved: 470 } ] },
  { project: "p2", title: "Wardrobe carcass and laminates", status: "delivered", priority: "medium", admin: "ad1", requestedDaysAgo: 180, required: -170, items: [
    { material: "Plywood 18mm", qty: 60, est: 2350, approved: 2300, actual: 2420, delivered: 60 },
    { material: "Laminate Sheet", qty: 45, est: 1650, approved: 1600, actual: 1600, delivered: 45 } ] },
  { project: "p2", title: "Paint for whole villa", status: "delivered", priority: "low", admin: "ad2", requestedDaysAgo: 60, required: -50, items: [
    { material: "Emulsion Paint", qty: 120, est: 340, approved: 330, actual: 325, delivered: 120 },
    { material: "Wall Putty", qty: 300, est: 28, approved: 27, actual: 27, delivered: 300 } ] },
  { project: "p3", title: "Kitchen shutters and counter top", status: "partially_delivered", priority: "high", admin: "ad2", requestedDaysAgo: 14, required: -1, items: [
    { material: "Laminate Sheet", qty: 30, est: 1700, approved: 1650, actual: 1680, delivered: 18 },
    { material: "Granite", qty: 85, est: 240, approved: 235, actual: 250, delivered: 85 } ], comment: "Balance 12 laminate sheets expected tomorrow." },
  { project: "p3", title: "Switches for kitchen and utility", status: "pending_review", priority: "urgent", admin: "ad1", requestedDaysAgo: 2, required: 3, items: [
    { material: "Modular Switch", qty: 18, est: 220 } ] },
  { project: "p4", title: "Plumbing lines for pantry", status: "rejected", priority: "medium", admin: "ad1", requestedDaysAgo: 30, required: -20, items: [
    { material: "PVC Pipe", qty: 200, est: 95 } ], rejectionReason: "Existing plumbing retained as per revised pantry layout." },
  { project: "p4", title: "Workstation lighting and switches", status: "ordered", priority: "urgent", admin: "ad1", requestedDaysAgo: 12, required: -2, items: [
    { material: "LED Panel Light", qty: 120, est: 900, approved: 880 },
    { material: "Modular Switch", qty: 90, est: 230, approved: 225 } ], comment: "Vendor delayed dispatch; follow up daily." },
  { project: "p4", title: "Cabin partitions", status: "requested", priority: "urgent", admin: null, requestedDaysAgo: 1, required: 2, items: [
    { material: "Gypsum Board", qty: 150, est: 470 } ] },
  { project: "p5", title: "Feature wall paint", status: "delivered", priority: "medium", admin: "ad2", requestedDaysAgo: 25, required: -18, items: [
    { material: "Emulsion Paint", qty: 60, est: 360, approved: 350, actual: 372, delivered: 60 } ] },
  { project: "p5", title: "Dining counter granite", status: "approved", priority: "medium", admin: "ad2", requestedDaysAgo: 3, required: 7, items: [
    { material: "Granite", qty: 60, est: 260, approved: 255 } ] },
  { project: "p6", title: "Flooring and civil work", status: "delivered", priority: "high", admin: "ad1", requestedDaysAgo: 210, required: -200, items: [
    { material: "Vitrified Tiles", qty: 1500, est: 58, approved: 56, actual: 57, delivered: 1500 },
    { material: "Cement", qty: 80, est: 410, approved: 405, actual: 400, delivered: 80 } ] },
  { project: "p7", title: "Sand for compound wall repair", status: "cancelled", priority: "low", admin: null, requestedDaysAgo: 35, required: -25, items: [
    { material: "Sand", qty: 150, est: 55 } ] },
  { project: "p8", title: "Mandir carcass plywood", status: "requested", priority: "medium", admin: null, requestedDaysAgo: 2, required: 14, items: [
    { material: "Plywood 18mm", qty: 20, est: 2400 } ] },
  { project: "p9", title: "Garden irrigation pipes", status: "pending_review", priority: "low", admin: "ad2", requestedDaysAgo: 3, required: 5, items: [
    { material: "PVC Pipe", qty: 80, est: 98 } ] },
  { project: "p9", title: "Deck base cement", status: "approved", priority: "medium", admin: "ad1", requestedDaysAgo: 5, required: 10, items: [
    { material: "Cement", qty: 40, est: 425, approved: 420 } ] },
  { project: "p10", title: "Theatre ceiling lights", status: "partially_delivered", priority: "high", admin: "ad2", requestedDaysAgo: 16, required: -4, items: [
    { material: "LED Panel Light", qty: 30, est: 950, approved: 930, actual: 940, delivered: 20 } ] },
  { project: "p10", title: "Acoustic wall paint", status: "requested", priority: "high", admin: null, requestedDaysAgo: 0, required: 1, items: [
    { material: "Emulsion Paint", qty: 45, est: 345 } ] },
];

const MILESTONE_FOR_STATUS: Record<ProjectStatus, number> = {
  planning: 1,
  design: 2,
  approval: 3,
  procurement: 4,
  execution: 5,
  delayed: 5,
  finishing: 6,
  handover_pending: 7,
  completed: 8,
  on_hold: 4,
  cancelled: 1,
};

// ---------------------------------------------------------------------------
// Date helpers (business dates are Asia/Kolkata calendar dates)
// ---------------------------------------------------------------------------
const todayIST = (): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(),
  );

const addDays = (isoDate: string, days: number): string => {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) + days * DAY_MS);
  return date.toISOString().slice(0, 10);
};

const TODAY = todayIST();
const day = (offset: number | null): string | null => (offset === null ? null : addDays(TODAY, offset));
const at = (daysAgo: number, plusHours = 0): string => new Date(Date.now() - daysAgo * DAY_MS + plusHours * 3_600_000).toISOString();

// ---------------------------------------------------------------------------
// Supabase helpers
// ---------------------------------------------------------------------------
class SeedError extends Error {}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new SeedError(`Missing ${name}. Set it in .env.local.`);
  return value;
}

function check<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  if (result.data === null) throw new Error(`${what}: no data returned`);
  return result.data;
}

function checkOk(result: { error: { message: string } | null }, what: string): void {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
}

async function findUserByEmail(admin: SupabaseClient, email: string): Promise<User | null> {
  const perPage = 1000;
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`Could not list users: ${error.message}`);
    const match = data.users.find((u) => u.email?.toLowerCase() === email);
    if (match) return match;
    if (data.users.length < perPage) return null;
  }
  return null;
}

async function ensureStaff(admin: SupabaseClient, staff: StaffSeed, password: string): Promise<string> {
  const appMeta = { role: staff.role, employee_id: staff.employeeId };
  const userMeta = { full_name: staff.fullName, phone: staff.phone };
  let user = await findUserByEmail(admin, staff.email);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email: staff.email,
      password,
      email_confirm: true,
      app_metadata: appMeta,
      user_metadata: userMeta,
    });
    if (error || !data.user) throw new Error(`Create ${staff.email}: ${error?.message ?? "unknown error"}`);
    user = data.user;
    console.log(`  created ${staff.employeeId} ${staff.email}`);
  } else {
    const { error } = await admin.auth.admin.updateUserById(user.id, {
      app_metadata: { ...(user.app_metadata ?? {}), ...appMeta },
      user_metadata: { ...(user.user_metadata ?? {}), ...userMeta },
    });
    if (error) throw new Error(`Update ${staff.email}: ${error.message}`);
    console.log(`  found ${staff.employeeId} ${staff.email}`);
  }

  checkOk(
    await admin.from("profiles").upsert(
      {
        id: user.id,
        email: staff.email,
        full_name: staff.fullName,
        phone: staff.phone,
        role: staff.role,
        employee_id: staff.employeeId,
        status: "active",
        joining_date: day(-staff.joinedDaysAgo),
      },
      { onConflict: "id" },
    ),
    `Profile ${staff.email}`,
  );
  return user.id;
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  if (process.env.SEED_DEMO !== "true") {
    throw new SeedError("Refusing to seed: set SEED_DEMO=true (development environments only).");
  }
  if (process.env.NODE_ENV === "production") {
    throw new SeedError("Refusing to seed demo data with NODE_ENV=production.");
  }
  const password = requireEnv("DEMO_USER_PASSWORD");
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new SeedError(`DEMO_USER_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  console.log("Demo staff accounts:");
  const staffIds: Record<StaffSeed["key"], string> = { sm1: "", sm2: "", ad1: "", ad2: "" };
  for (const staff of STAFF) staffIds[staff.key] = await ensureStaff(admin, staff, password);

  const existing = await admin
    .from("clients")
    .select("id", { count: "exact", head: true })
    .ilike("email", `%@${DEMO_DOMAIN}`);
  checkOk(existing, "Check existing demo clients");
  if ((existing.count ?? 0) > 0) {
    console.log(`Demo clients already exist (${existing.count}); skipping business data. Staff accounts are up to date.`);
    return;
  }

  const seedStartedAt = new Date().toISOString();
  const ownerEmail = process.env.OWNER_EMAIL?.trim().toLowerCase();
  let ownerId: string | null = null;
  if (ownerEmail) {
    const owner = await admin.from("profiles").select("id").eq("email", ownerEmail).eq("role", "owner").maybeSingle<{ id: string }>();
    ownerId = owner.data?.id ?? null;
  }

  // Clients ------------------------------------------------------------------
  console.log("Clients:");
  const clientIds: Record<string, string> = {};
  for (const c of CLIENTS) {
    const row = check(
      await admin
        .from("clients")
        .insert({
          name: c.name,
          email: c.email,
          phone: c.phone,
          address: c.address,
          city: c.city,
          state: c.state,
          country: "India",
          notes: "Demo data (seed-demo).",
          created_by: ownerId,
        })
        .select("id, client_code")
        .single<{ id: string; client_code: string }>(),
      `Client ${c.name}`,
    );
    clientIds[c.key] = row.id;
    console.log(`  ${row.client_code} ${c.name}`);
  }

  // Projects ----------------------------------------------------------------
  console.log("Projects:");
  const projectIds: Record<string, string> = {};
  const projectSm: Record<string, string> = {};
  const catalog = check(
    await admin.from("materials").select("id, name, category, unit").returns<Array<{ id: string; name: string; category: string | null; unit: string }>>(),
    "Load materials catalog",
  );
  const materialByName = new Map(catalog.map((m) => [m.name, m]));

  for (const p of PROJECTS) {
    const clientId = clientIds[p.client];
    const smId = staffIds[p.sm];
    if (!clientId) throw new Error(`Unknown client ${p.client}`);
    const row = check(
      await admin
        .from("projects")
        .insert({
          client_id: clientId,
          name: p.name,
          project_type: p.type,
          site_address: CLIENTS.find((c) => c.key === p.client)?.address ?? null,
          city: CLIENTS.find((c) => c.key === p.client)?.city ?? null,
          start_date: day(p.start),
          expected_completion_date: day(p.expected),
          handover_date: day(p.handover),
          actual_handover_date: day(p.actualHandover),
          status: p.status,
          progress_percentage: p.progress,
          priority: p.priority,
          notes: p.notes,
          created_by: ownerId,
        })
        .select("id, project_code")
        .single<{ id: string; project_code: string }>(),
      `Project ${p.name}`,
    );
    projectIds[p.key] = row.id;
    projectSm[p.key] = smId;

    checkOk(
      await admin
        .from("project_financials")
        .update({ project_cost: p.cost, notes: "Demo contract value." })
        .eq("project_id", row.id),
      `Financials ${p.name}`,
    );

    // Amount received = payments ledger: a booking transfer, then the rest by UPI (small jobs: cash).
    const booking = p.advance >= 200_000 ? Math.round(p.advance * 0.6) : p.advance;
    const payments = [
      { amount: booking, mode: p.advance >= 200_000 ? "bank_transfer" : "cash", paid_on: day(p.start), reference: null },
      ...(booking < p.advance
        ? [{ amount: p.advance - booking, mode: "upi", paid_on: day(Math.round(p.start / 2)), reference: `UPI${row.project_code.replace(/\D/g, "")}01` }]
        : []),
    ] as const;
    checkOk(
      await admin.from("project_payments").insert(
        payments.map((pay) => ({
          project_id: row.id,
          amount: pay.amount,
          mode: pay.mode,
          paid_on: pay.paid_on ?? TODAY,
          reference: pay.reference,
          created_by: ownerId,
        })),
      ),
      `Payments ${p.name}`,
    );

    checkOk(
      await admin.from("project_members").insert({
        project_id: row.id,
        user_id: smId,
        member_role: "site_manager",
        assigned_by: ownerId,
        assigned_at: at(-p.start),
      }),
      `Assign SM ${p.name}`,
    );

    // Milestones follow the project status.
    const current = MILESTONE_FOR_STATUS[p.status];
    const milestones = check(
      await admin
        .from("project_milestones")
        .select("id, sort_order")
        .eq("project_id", row.id)
        .order("sort_order")
        .returns<Array<{ id: string; sort_order: number }>>(),
      `Milestones ${p.name}`,
    );
    const span = (p.expected ?? p.start + 120) - p.start;
    for (const m of milestones) {
      const startOffset = p.start + Math.round(((m.sort_order - 1) / 8) * span);
      const targetOffset = p.start + Math.round((m.sort_order / 8) * span);
      const isDone = p.status === "completed" || m.sort_order < current;
      const isCurrent = !isDone && m.sort_order === current;
      const completedOffset = Math.min(targetOffset, 0);
      checkOk(
        await admin
          .from("project_milestones")
          .update({
            start_date: day(startOffset),
            target_date: day(targetOffset),
            status: isDone ? "completed" : isCurrent ? (p.status === "on_hold" ? "not_started" : "in_progress") : "not_started",
            completed_date: isDone ? day(completedOffset) : null,
          })
          .eq("id", m.id),
        `Milestone ${m.sort_order} ${p.name}`,
      );
    }

    // Site update history (append-only).
    if (p.status !== "planning") {
      const steps = [0.35, 0.7, 1].map((f) => Math.round(p.progress * f));
      let previousProgress = 0;
      let previousStatus: ProjectStatus = "planning";
      const lastDaysAgo = p.status === "completed" ? -(p.actualHandover ?? -1) : 2;
      const firstDaysAgo = Math.max(lastDaysAgo + 2, Math.round(-p.start * 0.6));
      const notes = [
        "Site measurements verified and work started.",
        "Civil and electrical first-fix completed.",
        p.status === "completed" ? "Final cleaning done and handed over to client." : "Work progressing as per revised schedule.",
      ];
      for (let i = 0; i < steps.length; i += 1) {
        const daysAgo = Math.round(firstDaysAgo - ((firstDaysAgo - lastDaysAgo) * i) / (steps.length - 1));
        const isLast = i === steps.length - 1;
        const status: ProjectStatus = historyStatuses(p.status)[i] ?? p.status;
        const progress = steps[i] ?? p.progress;
        checkOk(
          await admin.from("project_updates").insert({
            project_id: row.id,
            updated_by: smId,
            status,
            previous_status: previousStatus,
            progress_percentage: progress,
            previous_progress: previousProgress,
            update_date: day(-daysAgo),
            milestone: isLast ? null : status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
            expected_completion_date: day(p.expected),
            issues: p.status === "delayed" && isLast ? "Electrical load approval pending with building society." : null,
            notes: notes[i] ?? null,
            next_action: isLast && p.status !== "completed" ? "Continue with next milestone." : null,
            created_at: at(daysAgo),
          }),
          `Update ${i + 1} ${p.name}`,
        );
        previousProgress = progress;
        previousStatus = status;
      }
      checkOk(
        await admin
          .from("projects")
          .update({ last_update_at: at(lastDaysAgo), last_updated_by: smId, current_milestone: milestoneName(current) })
          .eq("id", row.id),
        `Project last update ${p.name}`,
      );
    }
    console.log(`  ${row.project_code} ${p.name} (${p.status}, ${p.progress}%)`);
  }

  // Admin 01 is also explicitly assigned to the Mehta Office fit-out.
  const mehtaProject = projectIds.p4;
  if (mehtaProject) {
    checkOk(
      await admin.from("project_members").insert({
        project_id: mehtaProject,
        user_id: staffIds.ad1,
        member_role: "admin",
        assigned_by: ownerId,
      }),
      "Assign admin to Mehta Office",
    );
  }

  // Material requests ----------------------------------------------------------
  console.log("Material requests:");
  for (const r of REQUESTS) {
    const projectId = projectIds[r.project];
    const requester = projectSm[r.project];
    if (!projectId || !requester) throw new Error(`Unknown project ${r.project}`);
    const adminId = r.admin ? staffIds[r.admin] : null;
    const reviewed = r.status !== "requested" && r.status !== "cancelled";
    const approvedLike = ["approved", "ordered", "partially_delivered", "delivered"].includes(r.status);
    const orderedLike = ["ordered", "partially_delivered", "delivered"].includes(r.status);
    const deliveredLike = ["partially_delivered", "delivered"].includes(r.status);
    const completeDaysAgo = Math.max(r.requestedDaysAgo - 6, 0);

    const request = check(
      await admin
        .from("material_requests")
        .insert({
          project_id: projectId,
          requested_by: requester,
          assigned_admin: adminId,
          title: r.title,
          required_date: day(r.required),
          priority: r.priority,
          status: r.status,
          requested_at: at(r.requestedDaysAgo),
          created_at: at(r.requestedDaysAgo),
          reviewed_at: reviewed ? at(r.requestedDaysAgo, 5) : null,
          approved_at: approvedLike ? at(r.requestedDaysAgo, 20) : null,
          rejected_at: r.status === "rejected" ? at(r.requestedDaysAgo, 20) : null,
          rejection_reason: r.rejectionReason ?? null,
          ordered_at: orderedLike ? at(r.requestedDaysAgo, 44) : null,
          expected_delivery_date: orderedLike ? day(Math.max(r.required - 1, -r.requestedDaysAgo + 3)) : null,
          delivery_date: deliveredLike ? day(-completeDaysAgo) : null,
          completed_at: r.status === "delivered" ? at(completeDaysAgo) : null,
          cancelled_at: r.status === "cancelled" ? at(r.requestedDaysAgo - 2) : null,
          notes: "Demo request.",
        })
        .select("id, request_code")
        .single<{ id: string; request_code: string }>(),
      `Request ${r.title}`,
    );

    for (const item of r.items) {
      const material = materialByName.get(item.material);
      const inserted = check(
        await admin
          .from("material_request_items")
          .insert({
            request_id: request.id,
            material_id: material?.id ?? null,
            material_name: item.material,
            category: material?.category ?? null,
            quantity: item.qty,
            unit: material?.unit ?? "Units",
            estimated_unit_cost: item.est,
            approved_unit_cost: item.approved ?? null,
            actual_unit_cost: item.actual ?? null,
            delivered_quantity: item.delivered ?? 0,
          })
          .select("id")
          .single<{ id: string }>(),
        `Item ${item.material} for ${request.request_code}`,
      );
      if ((item.delivered ?? 0) > 0) {
        checkOk(
          await admin.from("material_deliveries").insert({
            request_id: request.id,
            item_id: inserted.id,
            delivered_quantity: item.delivered,
            delivery_date: day(-completeDaysAgo),
            recorded_by: adminId,
            notes: "Received at site and checked.",
          }),
          `Delivery ${item.material} for ${request.request_code}`,
        );
      }
    }

    if (r.comment && adminId) {
      checkOk(
        await admin.from("material_request_comments").insert({
          request_id: request.id,
          author_id: adminId,
          body: r.comment,
          created_at: at(Math.max(r.requestedDaysAgo - 1, 0)),
        }),
        `Comment for ${request.request_code}`,
      );
    }
    console.log(`  ${request.request_code} ${r.title} (${r.status})`);
  }

  // Seeding historical rows fired "new request" notifications; replace them with
  // realistic deadline notifications for today.
  checkOk(await admin.from("notifications").delete().gte("created_at", seedStartedAt), "Clear seed notifications");
  const generated = await admin.rpc("generate_deadline_notifications");
  checkOk(generated, "Generate deadline notifications");

  console.log(
    `Done: ${CLIENTS.length} clients, ${PROJECTS.length} projects, ${REQUESTS.length} material requests, ${String(generated.data ?? 0)} notifications.`,
  );
  console.log(`Demo logins: ${STAFF.map((s) => `${s.employeeId} ${s.email}`).join(", ")} (password from DEMO_USER_PASSWORD).`);
}

const STATUS_FLOW: ProjectStatus[] = [
  "planning",
  "design",
  "approval",
  "procurement",
  "execution",
  "finishing",
  "handover_pending",
  "completed",
];

/** Three plausible statuses for the update history, ending at the current status. */
function historyStatuses(final: ProjectStatus): ProjectStatus[] {
  const effective: ProjectStatus = final === "delayed" || final === "on_hold" || final === "cancelled" ? "execution" : final;
  const k = STATUS_FLOW.indexOf(effective);
  const pick = (fraction: number): ProjectStatus =>
    STATUS_FLOW[Math.max(1, Math.min(k, Math.round(k * fraction)))] ?? "design";
  return [pick(0.35), pick(0.7), final];
}

function milestoneName(sortOrder: number): string {
  const names = ["Project Started", "Design", "Approval", "Procurement", "Execution", "Finishing", "Handover", "Completed"];
  return names[sortOrder - 1] ?? "Project Started";
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`seed-demo failed: ${message}`);
  process.exit(1);
});
