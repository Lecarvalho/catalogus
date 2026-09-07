// The harness's own contract: what one `asUser`/`asAnon` call does to the
// connection must not reach the next call. A round-2 validator (2026-09-07)
// showed a `fn` that set the claims session-wide (`set_config(..., false)`)
// or committed early left `auth.uid()` pointing at the previous user for
// the following `asAnon`. RLS still returned nothing to anon (it has no
// policies), so no test had noticed; the contract was broken all the same.
import type { Client } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";

import { asAnon, asUser, createTestDatabase, createUser, describeDb, type TestDatabase } from "./test-support/db.js";

describeDb("test-support/db.ts leaves nothing behind between calls", () => {
  let db: TestDatabase;
  let client: Client;
  let userA: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    client = db.client;
    userA = await createUser(client);
  });

  afterAll(async () => {
    await db.close();
  });

  async function uid(c: Client): Promise<string | null> {
    const r = await c.query<{ uid: string | null }>("select auth.uid()::text as uid");
    return r.rows[0]?.uid ?? null;
  }

  it("a session-scoped set_config inside asUser does not reach the next asAnon", async () => {
    await asUser(client, userA, async (c) => {
      await c.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: userA, role: "authenticated" })]);
      expect(await uid(c)).toBe(userA);
    });
    expect(await asAnon(client, uid)).toBeNull();
    expect(await uid(client)).toBeNull();
  });

  it("an early commit inside asUser does not leak the claims or the role", async () => {
    await asUser(client, userA, async (c) => {
      await c.query("commit");
      await c.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: userA, role: "authenticated" })]);
    });
    expect(await asAnon(client, uid)).toBeNull();
    const who = await client.query<{ u: string }>("select current_user as u");
    expect(who.rows[0]?.u).toBe("postgres");
  });

  it("a set session authorization inside fn does not survive the call", async () => {
    // On the plain postgres:17 container the connection's session user is a
    // superuser and the statement succeeds; on Supabase's image `postgres`
    // is not a superuser and it is refused outright. Either way the state
    // after the call must be the harness's, which is what is asserted.
    await asUser(client, userA, async (c) => {
      await c.query("set session authorization anon").catch((err: unknown) => {
        if (!String(err).includes("permission denied to set session authorization")) throw err;
      });
    });
    const who = await client.query<{ u: string; s: string }>("select current_user as u, session_user as s");
    expect(who.rows[0]).toEqual({ u: "postgres", s: "postgres" });
    expect(await asUser(client, userA, uid)).toBe(userA);
  });

  it("a throwing fn still resets the claims", async () => {
    await expect(
      asUser(client, userA, async (c) => {
        await c.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: userA, role: "authenticated" })]);
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await uid(client)).toBeNull();
    expect(await asAnon(client, uid)).toBeNull();
  });
});
