// CLI-side backstop for the hard no-secrets rule (HANDOFF.md section 3 and
// section 5's "Schema guardrail"): dagstree.yaml must never carry cost,
// billing, or account-shaped data.
//
// This is deliberately scoped to *flag/property names*, mirroring exactly
// what @dagstree/schema itself checks -- its patternProperties deny rule
// only ever inspects a manifest object's *keys*, never the free-text or
// slug *values* those keys hold (see schema.ts). An earlier version of this
// module ran looksLikePrivateKey against add/init's --role/--service/--id
// values directly, which sounds like the same protection but isn't: those
// flags hold ordinary domain vocabulary, and the deny word list's plain
// substring match makes that actively wrong -- "payments" (a first-class
// ServiceCategory from HANDOFF.md section 4) contains "payment"; a
// completely ordinary id like "stripe-payments" or a role like
// "user-management" trips it too. None of that is Layer 3 data, so
// rejecting it would just be a bug wearing a security feature's clothes.
//
// What genuinely mirrors the schema's actual boundary: dagstree add/init
// only ever accept a *fixed* set of flags (role, id, service, status,
// added, replaced-by, notes), none of which is itself private-looking, so
// there's no way to smuggle a new property name through them. The one place
// a user actually *can* try to introduce an arbitrary key-shaped flag is by
// typing one commander doesn't recognize -- `--cost 20`, `--account foo` --
// which commander already refuses as an unknown option. cli.ts intercepts
// that specific failure and, when the unrecognized flag name itself looks
// private, replaces commander's generic "unknown option" message with one
// that redirects to the private overlay instead.
import { looksLikePrivateKey } from "@dagstree/schema";

/** True when a CLI flag name (without its leading dashes) looks like Layer 3 (cost/billing/account/credential) data. */
export function looksLikePrivateFlagName(flagName: string): boolean {
  return looksLikePrivateKey(flagName);
}

export function privateFlagRefusalMessage(flag: string): string {
  return (
    `${flag} looks like private data (cost, billing, account, or credential info). ` +
    "dagstree.yaml is Layer 2 -- committed to the repo -- and must never store that. " +
    'Once the private overlay is available, use "dagstree push --private" instead.'
  );
}

// --- free-text value screening --------------------------------------------
//
// The guard above only ever looks at flag *names*, by design (see the block
// comment above it). But two places write a flag's *value* straight into a
// manifest field as free text with no further check: `add --notes` (writes
// serviceEntry.notes) and `init`'s interactive name/architecture/pm/
// vcsProvider answers.
//
// The actual pattern work -- the two-tier HARD/SOFT free-text guard -- lives
// entirely in @dagstree/schema's free-text-guard.ts, which validateManifest
// also runs, so a hand-edited dagstree.yaml gets the identical protection a
// value typed through this CLI does. This module keeps no copy of those
// patterns; it only decides how to *compose* the two tiers for a write-time
// gate.
//
// An earlier version of this gate refused on *either* tier -- the reasoning
// being that add/init are about to write a brand-new value for the first
// time, so there's no reason to let a merely-soft signal through. In
// practice that made the write-time gate *stricter* than `dagstree
// validate` itself: a bare soft keyword ("renewal is automated via GitHub
// Actions") is something `validate` accepts outright (exit 0, a warning on
// stderr), but add/init refused to write the identical string at all, with
// no override flag -- the only way around it was hand-editing dagstree.yaml,
// which is exactly the workaround HANDOFF.md section 5 is trying to make
// unnecessary ("make the safe path the only path"). So this now refuses
// only on a HARD hit; a SOFT-only hit is not blocked here -- it still
// surfaces as a warning, via the same `warnings` channel `dagstree validate`
// uses, on whatever manifest-wide check add/init already run right before
// writing (checkManifestObject / validateManifest), so nothing is silently
// swallowed either.
import { scanFreeTextForPrivateValues } from "@dagstree/schema";

/** True when free text a user is about to write into a manifest field (--notes, init's name/architecture/pm/vcsProvider answers) carries a HARD-tier private-value hit -- an email, currency amount, card-like number, API-key shape, or credential URL. A SOFT-only hit (a bare billing-adjacent keyword) does not block the write; see this module's header comment. */
export function hasBlockingPrivateFreeText(text: string): boolean {
  return scanFreeTextForPrivateValues(text).some((hit) => hit.tier === "hard");
}
