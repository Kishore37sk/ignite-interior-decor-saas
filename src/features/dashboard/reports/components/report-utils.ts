import { getParam, type SearchParamsRecord } from "@/lib/search-params";

/** True when any of `keys` has a non-empty value (used to pick the right empty state). */
export function hasActiveFilters(params: SearchParamsRecord, keys: readonly string[]): boolean {
  return keys.some((key) => getParam(params, key) !== undefined);
}
