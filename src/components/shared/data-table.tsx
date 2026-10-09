import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Pagination } from "@/components/ui/pagination";
import { SortableTH, Table, TableCaption, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/** Where a column appears in the stacked mobile card. */
export type MobilePlacement = "title" | "subtitle" | "meta" | "hidden";

export type DataTableColumn<T> = {
  key: string;
  header: string;
  /** Render the cell. Runs on the server (DataTable is a server component). */
  cell: (row: T) => ReactNode;
  sortable?: boolean;
  /** `?sort=` value when it differs from `key`. */
  sortKey?: string;
  align?: "left" | "center" | "right";
  className?: string;
  headerClassName?: string;
  /** Mobile card placement (default `meta`). */
  mobile?: MobilePlacement;
  /** Label in the mobile meta grid (default: `header`). */
  mobileLabel?: string;
  /** Cell holds its own buttons/links: lifts it above the row link overlay. */
  interactive?: boolean;
  /** Hide below `lg` in the desktop table (still shown in mobile cards). */
  hideBelowLg?: boolean;
};

export type DataTablePagination = {
  total: number;
  page: number;
  pageSize: number;
  pageSizeOptions?: readonly number[];
  itemLabel?: string;
};

export type DataTableProps<T> = {
  columns: readonly DataTableColumn<T>[];
  rows: readonly T[];
  getRowId: (row: T) => string;
  /** Makes each row/card navigate (accessible link overlay). */
  getRowHref?: (row: T) => string | null | undefined;
  /** Accessible name of the row link, e.g. `Open project P-1001`. */
  getRowLabel?: (row: T) => string;
  /** Accessible table name (visually hidden caption). */
  caption: string;
  /** Active sort (pass parsed defaults so headers reflect them). */
  sort?: { key: string; dir: "asc" | "desc" };
  pagination?: DataTablePagination;
  /** Rendered instead of the table when `rows` is empty. */
  emptyState?: ReactNode;
  /** Card header: title on the left, toolbar (filters/search) on the right. */
  title?: ReactNode;
  toolbar?: ReactNode;
  /** Render without the card surface (when already inside a card). */
  bare?: boolean;
  className?: string;
};

const overlayLink = cn(
  "absolute inset-0 z-0 rounded-xl",
  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary",
);

/**
 * Server-driven data table: desktop table with sortable URL headers and TeamHub styling;
 * below `md` the rows become stacked cards. Row navigation uses a single link overlay
 * per row so the whole row is clickable and keyboard reachable.
 */
export function DataTable<T>({
  columns,
  rows,
  getRowId,
  getRowHref,
  getRowLabel,
  caption,
  sort,
  pagination,
  emptyState,
  title,
  toolbar,
  bare = false,
  className,
}: DataTableProps<T>) {
  const titleColumn = columns.find((column) => column.mobile === "title") ?? columns[0];
  const subtitleColumns = columns.filter((column) => column.mobile === "subtitle");
  const metaColumns = columns.filter(
    (column) => column !== titleColumn && (column.mobile ?? "meta") === "meta",
  );

  const content =
    rows.length === 0 ? (
      <div className="py-2">{emptyState ?? <p className="py-10 text-center text-sm text-muted">No records found.</p>}</div>
    ) : (
      <>
        {/* Desktop / tablet */}
        <div className="hidden md:block">
          <Table>
            <TableCaption>{caption}</TableCaption>
            <THead>
              <tr>
                {columns.map((column) =>
                  column.sortable ? (
                    <SortableTH
                      key={column.key}
                      sortKey={column.sortKey ?? column.key}
                      currentSort={sort?.key}
                      currentDir={sort?.dir}
                      align={column.align}
                      className={cn(column.hideBelowLg && "hidden lg:table-cell", column.headerClassName)}
                    >
                      {column.header}
                    </SortableTH>
                  ) : (
                    <TH
                      key={column.key}
                      align={column.align}
                      className={cn(column.hideBelowLg && "hidden lg:table-cell", column.headerClassName)}
                    >
                      {column.header}
                    </TH>
                  ),
                )}
              </tr>
            </THead>
            <TBody>
              {rows.map((row) => {
                const href = getRowHref?.(row) ?? null;
                return (
                  <TR key={getRowId(row)} interactive={Boolean(href)} className={href ? "[transform:translateZ(0)]" : undefined}>
                    {columns.map((column, index) => (
                      <TD
                        key={column.key}
                        align={column.align}
                        className={cn(column.hideBelowLg && "hidden lg:table-cell", column.className)}
                      >
                        {href && index === 0 ? (
                          <Link href={href} className={overlayLink} aria-label={getRowLabel?.(row) ?? "Open details"} />
                        ) : null}
                        {column.interactive ? <div className="relative z-10">{column.cell(row)}</div> : column.cell(row)}
                      </TD>
                    ))}
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </div>

        {/* Mobile: stacked cards */}
        <ul className="divide-y divide-border-soft md:hidden" aria-label={caption}>
          {rows.map((row) => {
            const href = getRowHref?.(row) ?? null;
            return (
              <li key={getRowId(row)} className="relative flex flex-col gap-3 py-4 first:pt-1 last:pb-1">
                {href ? (
                  <Link href={href} className={overlayLink} aria-label={getRowLabel?.(row) ?? "Open details"} />
                ) : null}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    {titleColumn ? <div className="min-w-0 font-medium text-text">{titleColumn.cell(row)}</div> : null}
                    {subtitleColumns.map((column) => (
                      <div
                        key={column.key}
                        className={cn("min-w-0 text-sm text-muted", column.interactive && "relative z-10")}
                      >
                        {column.cell(row)}
                      </div>
                    ))}
                  </div>
                  {href ? <ChevronRight aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-subtle" /> : null}
                </div>
                {metaColumns.length > 0 ? (
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                    {metaColumns.map((column) => (
                      <div key={column.key} className={cn("min-w-0", column.interactive && "relative z-10")}>
                        <dt className="text-xs text-muted">{column.mobileLabel ?? column.header}</dt>
                        <dd className="mt-0.5 min-w-0 break-words text-sm text-text">{column.cell(row)}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </li>
            );
          })}
        </ul>
      </>
    );

  const footer =
    pagination && pagination.total > 0 ? (
      <div className="border-t border-border-soft pt-4">
        <Pagination
          total={pagination.total}
          page={pagination.page}
          pageSize={pagination.pageSize}
          pageSizeOptions={pagination.pageSizeOptions}
          itemLabel={pagination.itemLabel}
        />
      </div>
    ) : null;

  const header =
    title || toolbar ? (
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {title ? <h2 className="text-lg font-semibold tracking-tight text-text">{title}</h2> : null}
        {toolbar ? <div className="min-w-0 lg:flex-1 lg:[&>*]:justify-end">{toolbar}</div> : null}
      </div>
    ) : null;

  return (
    <div className={cn("flex min-w-0 flex-col gap-4", !bare && "card-surface p-4 sm:p-5", className)}>
      {header}
      {content}
      {footer}
    </div>
  );
}
