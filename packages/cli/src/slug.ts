// Mirrors @dagstree/schema's $defs/slug pattern exactly (schema.ts:
// "^[a-z0-9]+(?:[_-][a-z0-9]+)*$") so the CLI can reject a bad --id/--role/
// --service value before ever touching the manifest, with a message that
// names the actual rule instead of waiting for ajv's generic one.
export const SLUG_PATTERN = /^[a-z0-9]+(?:[_-][a-z0-9]+)*$/;

export function isValidSlug(value: string): boolean {
  return SLUG_PATTERN.test(value);
}

const COMBINING_DIACRITICS = /[̀-ͯ]/g;

/**
 * Best-effort slug for human text -- a directory name becoming a project
 * slug candidate under `dagstree init --yes`. Not guaranteed to satisfy
 * isValidSlug for every possible input (e.g. an all-symbol directory name);
 * callers still validate the result.
 */
export function slugify(text: string): string {
  const slug = text
    .normalize("NFKD")
    .replace(COMBINING_DIACRITICS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "project";
}

/**
 * Picks a local id for a new service entry when --id isn't given. Follows
 * the convention HANDOFF.md section 5 itself uses (supabase-db /
 * supabase-auth): the bare catalog slug when it's free, else slug-role, else
 * slug-role-2, slug-role-3, ... A caller that instead passes an explicit
 * --id colliding with an existing one is not handled here -- that's caught
 * uniformly by validateManifest's duplicate-id check when the mutated
 * manifest is validated before writing.
 */
export function deriveLocalId(serviceSlug: string, role: string, existingIds: ReadonlySet<string>): string {
  if (!existingIds.has(serviceSlug)) {
    return serviceSlug;
  }
  const withRole = `${serviceSlug}-${role}`;
  if (!existingIds.has(withRole)) {
    return withRole;
  }
  let n = 2;
  let candidate = `${withRole}-${n}`;
  while (existingIds.has(candidate)) {
    n += 1;
    candidate = `${withRole}-${n}`;
  }
  return candidate;
}
