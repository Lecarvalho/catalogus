// Wraps @specfy/stack-analyser. Rule registration only happens as a side
// effect of importing its autoload module — importing the package's main
// entry point alone leaves the rule set empty and every scan comes back
// blank (confirmed in the spike, see docs/detection-spike.md).
import "@specfy/stack-analyser/dist/autoload.js";
import { analyser, FSProvider, rules, tech, type Payload } from "@specfy/stack-analyser";

import { mapSpecfySlug } from "./mapping.js";
import type { DetectedTechnology, Evidence } from "./types.js";

function techDisplayName(key: string, fallback: string): string {
  return tech.indexed[key as keyof typeof tech.indexed]?.name ?? fallback;
}

function techType(key: string): string | undefined {
  return tech.indexed[key as keyof typeof tech.indexed]?.type;
}

// tech.indexed strips each rule down to {key, name, type} — no `files`/
// `extensions` — so plausibility-checking a generic reason against a tech's
// own rule needs the full Rule from rules.list instead. Keyed as `string`
// rather than the library's own AllowedKeys union: techKey here always
// originates as a plain string from Payload.tech/.techs, and re-widening it
// back to AllowedKeys at every lookup site would just be a second cast.
const ruleByTech = new Map<string, (typeof rules.list)[number]>(rules.list.map((rule) => [rule.tech, rule]));

function fileMatchesTechRule(techKey: string, filename: string): boolean {
  const files = ruleByTech.get(techKey)?.files;
  if (!files) {
    return false;
  }
  return Array.isArray(files) ? files.includes(filename) : files.test(filename);
}

function extensionMatchesTechRule(techKey: string, extension: string): boolean {
  return ruleByTech.get(techKey)?.extensions?.includes(extension) ?? false;
}

/**
 * Turns one stack-analyser reason string into Evidence. Reason strings are
 * plain English produced by the library itself (e.g. "matched file:
 * fly.toml", "supabase matched: /^@supabase\//"); we parse out a filename
 * where the format makes that possible and keep the raw string as `detail`
 * either way, so evidence is never fabricated.
 */
function parseReason(reason: string): Evidence {
  const fileMatch = /^matched file: (.+)$/.exec(reason);
  if (fileMatch) {
    return { file: fileMatch[1] as string, detail: reason };
  }
  const extMatch = /^matched extension: (.+)$/.exec(reason);
  if (extMatch) {
    return { file: `*${extMatch[1]}`, detail: reason };
  }
  return { file: reason, detail: reason };
}

/**
 * Reasons attributable to one techKey found in a node's `techs` bag.
 * stack-analyser reason strings that start with "<key> matched" are
 * specific to that key. A bare "matched file: X" / "matched extension: X"
 * reason names no key at all — it's only a fair attribution to techKey when
 * X actually appears in techKey's *own* rule (tech.indexed[techKey].files /
 * .extensions), checked via rules.list. Without that check, every generic
 * reason on the node (matched file: Dockerfile, package.json, ...) would
 * get folded into every tech sharing that node, which is exactly how
 * gitlab.ci once ended up "evidenced" by an unrelated Dockerfile — see
 * docs/detection-spike.md Gotcha #3 and the code-review notes above it.
 * Reasons naming a *different* key are excluded outright.
 */
function reasonsForTech(techKey: string, allReasons: Iterable<string>): string[] {
  const specific: string[] = [];
  const plausibleGeneric: string[] = [];
  for (const reason of allReasons) {
    if (reason.startsWith(`${techKey} matched`)) {
      specific.push(reason);
      continue;
    }
    const fileMatch = /^matched file: (.+)$/.exec(reason);
    if (fileMatch && fileMatchesTechRule(techKey, fileMatch[1] as string)) {
      plausibleGeneric.push(reason);
      continue;
    }
    const extMatch = /^matched extension: (.+)$/.exec(reason);
    if (extMatch && extensionMatchesTechRule(techKey, extMatch[1] as string)) {
      plausibleGeneric.push(reason);
    }
  }
  return specific.length > 0 ? specific : plausibleGeneric;
}

interface Bucket {
  fallbackName: string;
  specfyType: string | undefined;
  reasons: Set<string>;
  /**
   * Node names where this tech showed up in the generic `techs` bag with no
   * attributable reason (reasonsForTech came back empty). Only used to build
   * evidence when `reasons` stays empty everywhere — every detection must
   * carry *something*, but it must not overclaim a specific file/dependency
   * match that reasonsForTech deliberately withheld.
   */
  unattributedIn: Set<string>;
}

function record(
  bucket: Map<string, Bucket>,
  key: string,
  fallbackName: string,
  reasons: Iterable<string>,
  unattributedNodeName?: string
): void {
  const entry =
    bucket.get(key) ?? { fallbackName, specfyType: techType(key), reasons: new Set<string>(), unattributedIn: new Set<string>() };
  let any = false;
  for (const reason of reasons) {
    entry.reasons.add(reason);
    any = true;
  }
  if (!any && unattributedNodeName) {
    entry.unattributedIn.add(unattributedNodeName);
  }
  bucket.set(key, entry);
}

/**
 * Every Payload that got promoted to its own component (node.tech set) also
 * re-adds that same key to its parent's generic `techs` bag — that's
 * addTech()'s own bookkeeping, not a separate detection. Collecting these
 * keys up front lets the walk skip them in the bag pass below, so a
 * precisely-evidenced component (e.g. Flyio: ["matched file: fly.toml"])
 * never gets the parent's whole unrelated reason list folded into it.
 */
function collectComponentKeys(node: Payload, keys: Set<string>): void {
  if (node.tech) {
    keys.add(node.tech);
  }
  for (const child of node.childs) {
    collectComponentKeys(child, keys);
  }
}

function walk(node: Payload, bucket: Map<string, Bucket>, componentKeys: ReadonlySet<string>): void {
  if (node.tech) {
    record(bucket, node.tech, techDisplayName(node.tech, node.name), node.reason);
  }
  for (const techKey of node.techs) {
    if (componentKeys.has(techKey)) {
      continue;
    }
    record(bucket, techKey, techDisplayName(techKey, techKey), reasonsForTech(techKey, node.reason), node.name);
  }
  for (const child of node.childs) {
    walk(child, bucket, componentKeys);
  }
}

/**
 * Runs stack-analyser against repoPath and returns every technology it
 * found, mapped into Dagstree's namespace with evidence attached.
 *
 * Deliberately does not use stack-analyser's own flatten() helper: flatten()
 * deduplicates repeated components across folders (which is what we want),
 * but its combine()/copy() machinery does not carry the `reason` set across
 * the merge, so the deduplicated output has no evidence left on it. We walk
 * the raw (un-flattened) tree ourselves and merge by tech key, which gives
 * the same cross-folder deduplication while keeping every reason that fed
 * into it.
 */
export async function runStackAnalyser(repoPath: string): Promise<DetectedTechnology[]> {
  const provider = new FSProvider({ path: repoPath });
  const root = await analyser({ provider });

  const componentKeys = new Set<string>();
  collectComponentKeys(root, componentKeys);

  const bucket = new Map<string, Bucket>();
  walk(root, bucket, componentKeys);

  const technologies: DetectedTechnology[] = [];
  for (const [specfySlug, { fallbackName, specfyType, reasons, unattributedIn }] of bucket) {
    const mapped = mapSpecfySlug(specfySlug, fallbackName, specfyType);
    // reasons is authoritative when non-empty. Only when nothing plausible
    // was ever found (reasonsForTech withheld every generic reason on every
    // node this key appeared in) do we fall back to naming the node itself
    // — honest about *where*, without fabricating a specific file/dependency
    // match reasonsForTech didn't actually confirm.
    const evidence =
      reasons.size > 0
        ? [...reasons].map(parseReason)
        : [...unattributedIn].map((name) => ({
            file: name,
            detail: `found alongside other technologies in "${name}"; no tech-specific match string available`,
          }));
    technologies.push({
      slug: mapped.slug,
      category: mapped.category,
      name: mapped.name,
      specfySlug,
      unmapped: mapped.unmapped,
      evidence,
    });
  }
  return technologies;
}
