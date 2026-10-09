import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { CSV_BOM, csvFileName, csvResponse, escapeCsvCell, toCSV, type CsvColumn } from "@/lib/csv";
import { todayIST } from "@/lib/dates";
import { logServerError } from "@/lib/errors";
import { formatNumber } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import {
  REPORT_EXPORT_LIMIT,
  allowedReportTypes,
  isReportType,
  parseAdminReportFilters,
  parseMaterialReportFilters,
  parseProjectReportFilters,
  parseSmReportFilters,
  type ReportType,
} from "@/features/dashboard/reports/config";
import {
  ADMIN_CSV_COLUMNS,
  PROJECT_CSV_COLUMNS,
  SITE_MANAGER_CSV_COLUMNS,
  materialCsvColumns,
} from "@/features/dashboard/reports/csv-columns";
import {
  fetchAdminReport,
  fetchMaterialReport,
  fetchProjectReport,
  fetchSiteManagerReport,
} from "@/features/dashboard/reports/queries";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: NO_STORE });
}

type Export =
  | { ok: true; csv: string; truncated: boolean; total: number }
  | { ok: false; error: string };

/**
 * CSV text with the header row first (importers and spreadsheets expect it). When the export
 * is capped, one note row is appended after the data — never above the header — and the
 * response also carries `X-Export-Truncated` / `X-Export-Total` headers.
 */
function buildCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[], total: number, truncated: boolean): Export {
  const body = toCSV(rows, columns, { bom: false });
  if (!truncated) return { ok: true, csv: CSV_BOM + body, truncated, total };
  const note = `Export limited to the first ${formatNumber(REPORT_EXPORT_LIMIT, 0)} of ${formatNumber(total, 0)} matching rows. Narrow the filters to export the rest.`;
  return { ok: true, csv: `${CSV_BOM}${body}${escapeCsvCell(note)}\r\n`, truncated, total };
}

/**
 * GET /api/reports/[type]?<same filters as /reports> — CSV export (ARCHITECTURE §9, app.md §76).
 * Owner: projects | materials | site-managers | admins. Other roles: materials only (RLS-scoped).
 * Capped at REPORT_EXPORT_LIMIT rows.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;

  let user;
  try {
    user = await getCurrentUser();
  } catch (err) {
    logServerError("api.reports.auth", err);
    return jsonError("We couldn't verify your session. Please try again.", 500);
  }
  if (!user) return jsonError("Not authenticated", 401);
  if (!isReportType(type)) return jsonError("Unknown report", 404);
  if (!allowedReportTypes(user.role).includes(type)) return jsonError("Forbidden", 403);

  const search = request.nextUrl.searchParams;
  const supabase = await createClient();
  const mode = { kind: "export" } as const;

  let result: Export;
  const reportType: ReportType = type;
  switch (reportType) {
    case "projects": {
      const report = await fetchProjectReport(supabase, parseProjectReportFilters(search), mode);
      result = report.ok
        ? buildCsv(report.rows, PROJECT_CSV_COLUMNS, report.total, report.truncated)
        : report;
      break;
    }
    case "materials": {
      const report = await fetchMaterialReport(supabase, parseMaterialReportFilters(search, user.role), mode);
      result = report.ok
        ? buildCsv(report.rows, materialCsvColumns(user.role), report.total, report.truncated)
        : report;
      break;
    }
    case "site-managers": {
      const report = await fetchSiteManagerReport(supabase, parseSmReportFilters(search), mode);
      result = report.ok
        ? buildCsv(report.rows, SITE_MANAGER_CSV_COLUMNS, report.total, report.truncated)
        : report;
      break;
    }
    case "admins": {
      const report = await fetchAdminReport(supabase, parseAdminReportFilters(search), mode);
      result = report.ok
        ? buildCsv(report.rows, ADMIN_CSV_COLUMNS, report.total, report.truncated)
        : report;
      break;
    }
  }

  if (!result.ok) return jsonError(result.error, 500);
  const response = csvResponse(result.csv, csvFileName(`ignite-${type}`, todayIST()));
  if (result.truncated) {
    response.headers.set("X-Export-Truncated", "true");
    response.headers.set("X-Export-Total", String(result.total));
  }
  return response;
}
