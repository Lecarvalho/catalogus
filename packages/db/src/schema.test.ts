// Tests supabase/migrations/0001_schema.sql against a fresh database per
// the harness in ./test-support/db.ts: table shape, every check constraint,
// the two composite unique constraints, cascading deletes, and the local
// auth stub's auth.uid(). RLS is not in this migration (a later brief adds
// supabase/migrations/0002_rls.sql), so every insert here runs as the
// admin/superuser connection except the auth.uid()/auth.role() cases, which
// go through asUser/asAnon specifically to exercise those functions.
import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { asAnon, asUser, createTestDatabase, createUser, describeDb, type TestDatabase } from "./test-support/db.js";

describeDb("supabase/migrations/0001_schema.sql", () => {
  let db: TestDatabase;
  let client: Client;

  beforeAll(async () => {
    db = await createTestDatabase();
    client = db.client;
  });

  afterAll(async () => {
    await db.close();
  });

  async function insertProject(slug = `project-${randomUUID().slice(0, 8)}`): Promise<{ id: string; ownerId: string; slug: string }> {
    const ownerId = await createUser(client);
    const result = await client.query<{ id: string }>(
      "insert into projects (owner_id, name, slug) values ($1, 'Test Project', $2) returning id",
      [ownerId, slug],
    );
    const row = result.rows[0];
    if (!row) throw new Error("insertProject: no row returned");
    return { id: row.id, ownerId, slug };
  }

  async function insertService(slug = `service-${randomUUID().slice(0, 8)}`): Promise<{ id: string; slug: string }> {
    const result = await client.query<{ id: string }>(
      "insert into services (slug, name) values ($1, 'Test Service') returning id",
      [slug],
    );
    const row = result.rows[0];
    if (!row) throw new Error("insertService: no row returned");
    return { id: row.id, slug };
  }

  async function insertProjectService(
    projectId: string,
    serviceId: string,
    localId = `svc-${randomUUID().slice(0, 8)}`,
  ): Promise<string> {
    const result = await client.query<{ id: string }>(
      `insert into project_services (project_id, service_id, local_id, role, added_at, provenance)
       values ($1, $2, $3, 'database', current_date, 'manual') returning id`,
      [projectId, serviceId, localId],
    );
    const row = result.rows[0];
    if (!row) throw new Error("insertProjectService: no row returned");
    return row.id;
  }

  async function insertEdge(projectId: string, fromId: string, toId: string): Promise<string> {
    const result = await client.query<{ id: string }>(
      `insert into service_dependencies (project_id, from_project_service_id, to_project_service_id)
       values ($1, $2, $3) returning id`,
      [projectId, fromId, toId],
    );
    const row = result.rows[0];
    if (!row) throw new Error("insertEdge: no row returned");
    return row.id;
  }

  describe("tables", () => {
    const expectedColumns: Record<string, string[]> = {
      projects: ["id", "owner_id", "name", "slug", "repo_url", "description", "created_at"],
      services: [
        "id",
        "slug",
        "name",
        "icon_ref",
        "pricing_model",
        "vendor_url",
        "status",
        "sunset_date",
        "successor_service_id",
      ],
      project_services: [
        "id",
        "project_id",
        "service_id",
        "local_id",
        "role",
        "kind",
        "version",
        "icon_path",
        "added_at",
        "status",
        "replaced_by_project_service_id",
        "provenance",
        "notes",
      ],
      service_dependencies: [
        "id",
        "project_id",
        "from_project_service_id",
        "to_project_service_id",
        "added_at",
        "status",
        "replaced_by_edge_id",
        "notes",
      ],
      user_service_accounts: [
        "id",
        "user_id",
        "service_id",
        "project_id",
        "account_ref",
        "plan_tier",
        "cost_amount",
        "cost_currency",
        "billing_cycle",
        "renewal_date",
        "started_at",
        "notes_private",
      ],
      project_meta: ["project_id", "architecture_style", "vcs_visibility", "extra"],
      project_service_pages: ["id", "user_id", "project_service_id", "body", "updated_at"],
    };

    it.each(Object.entries(expectedColumns))("%s has the expected columns", async (table, columns) => {
      const result = await client.query<{ column_name: string }>(
        "select column_name from information_schema.columns where table_schema = 'public' and table_name = $1",
        [table],
      );
      expect(result.rows.map((row) => row.column_name).sort()).toEqual([...columns].sort());
    });
  });

  describe("check constraints", () => {
    it("rejects a bad kind on project_services", async () => {
      const project = await insertProject();
      const service = await insertService();
      await expect(
        client.query(
          `insert into project_services (project_id, service_id, local_id, role, kind, added_at, provenance)
           values ($1, $2, 'svc', 'database', 'bogus-kind', current_date, 'manual')`,
          [project.id, service.id],
        ),
      ).rejects.toThrow(/violates check constraint/);
    });

    it("rejects a bad status on project_services", async () => {
      const project = await insertProject();
      const service = await insertService();
      await expect(
        client.query(
          `insert into project_services (project_id, service_id, local_id, role, status, added_at, provenance)
           values ($1, $2, 'svc', 'database', 'bogus-status', current_date, 'manual')`,
          [project.id, service.id],
        ),
      ).rejects.toThrow(/violates check constraint/);
    });

    it("rejects an uppercase slug on projects", async () => {
      const ownerId = await createUser(client);
      await expect(
        client.query("insert into projects (owner_id, name, slug) values ($1, 'Bad', 'Bad-Slug')", [ownerId]),
      ).rejects.toThrow(/violates check constraint/);
    });

    it("rejects an uppercase local_id on project_services", async () => {
      const project = await insertProject();
      const service = await insertService();
      await expect(
        client.query(
          `insert into project_services (project_id, service_id, local_id, role, added_at, provenance)
           values ($1, $2, 'Bad-Local-Id', 'database', current_date, 'manual')`,
          [project.id, service.id],
        ),
      ).rejects.toThrow(/violates check constraint/);
    });

    it("rejects from = to on service_dependencies", async () => {
      const project = await insertProject();
      const service = await insertService();
      const projectServiceId = await insertProjectService(project.id, service.id);
      await expect(
        client.query(
          `insert into service_dependencies (project_id, from_project_service_id, to_project_service_id)
           values ($1, $2, $2)`,
          [project.id, projectServiceId],
        ),
      ).rejects.toThrow(/violates check constraint/);
    });

    it("rejects a bad billing_cycle on user_service_accounts", async () => {
      const userId = await createUser(client);
      const service = await insertService();
      await expect(
        client.query("insert into user_service_accounts (user_id, service_id, billing_cycle) values ($1, $2, 'bogus')", [
          userId,
          service.id,
        ]),
      ).rejects.toThrow(/violates check constraint/);
    });

    it("rejects a bad pricing_model on services", async () => {
      await expect(
        client.query("insert into services (slug, name, pricing_model) values ($1, 'Bad Pricing', 'bogus')", [
          `service-${randomUUID().slice(0, 8)}`,
        ]),
      ).rejects.toThrow(/violates check constraint/);
    });

    it("accepts a null pricing_model on services", async () => {
      const service = await insertService();
      const result = await client.query<{ pricing_model: string | null }>(
        "select pricing_model from services where id = $1",
        [service.id],
      );
      expect(result.rows[0]?.pricing_model).toBeNull();
    });
  });

  describe("composite foreign keys tying an edge's project_id to its endpoints", () => {
    it("rejects an edge whose project_id does not match its endpoints' project", async () => {
      const projectA = await insertProject();
      const projectB = await insertProject();
      const service = await insertService();
      const fromId = await insertProjectService(projectA.id, service.id);
      const toId = await insertProjectService(projectA.id, service.id);
      await expect(insertEdge(projectB.id, fromId, toId)).rejects.toThrow(/violates foreign key constraint/);
    });

    it("rejects an edge whose to endpoint belongs to another project", async () => {
      const projectA = await insertProject();
      const projectB = await insertProject();
      const service = await insertService();
      const fromId = await insertProjectService(projectA.id, service.id);
      const toId = await insertProjectService(projectB.id, service.id);
      await expect(insertEdge(projectA.id, fromId, toId)).rejects.toThrow(/violates foreign key constraint/);
    });

    it("makes the same (from, to) pair impossible under two different project_ids", async () => {
      const projectA = await insertProject();
      const projectB = await insertProject();
      const service = await insertService();
      const fromId = await insertProjectService(projectA.id, service.id);
      const toId = await insertProjectService(projectA.id, service.id);
      await insertEdge(projectA.id, fromId, toId);
      await expect(insertEdge(projectB.id, fromId, toId)).rejects.toThrow(/violates foreign key constraint/);
    });

    it("rejects a project_service replaced_by pointer into another project", async () => {
      const projectA = await insertProject();
      const projectB = await insertProject();
      const service = await insertService();
      const psA = await insertProjectService(projectA.id, service.id);
      const psB = await insertProjectService(projectB.id, service.id);
      await expect(
        client.query("update project_services set replaced_by_project_service_id = $1 where id = $2", [psB, psA]),
      ).rejects.toThrow(/violates foreign key constraint/);
    });

    it("rejects an edge replaced_by pointer into another project", async () => {
      const projectA = await insertProject();
      const projectB = await insertProject();
      const service = await insertService();
      const fromA = await insertProjectService(projectA.id, service.id);
      const toA = await insertProjectService(projectA.id, service.id);
      const fromB = await insertProjectService(projectB.id, service.id);
      const toB = await insertProjectService(projectB.id, service.id);
      const edgeA = await insertEdge(projectA.id, fromA, toA);
      const edgeB = await insertEdge(projectB.id, fromB, toB);
      await expect(
        client.query("update service_dependencies set replaced_by_edge_id = $1 where id = $2", [edgeB, edgeA]),
      ).rejects.toThrow(/violates foreign key constraint/);
    });

    it("deleting a replacement project_service nulls the pointer and keeps the row's project_id", async () => {
      const project = await insertProject();
      const service = await insertService();
      const psOld = await insertProjectService(project.id, service.id);
      const psNew = await insertProjectService(project.id, service.id);
      await client.query("update project_services set replaced_by_project_service_id = $1 where id = $2", [
        psNew,
        psOld,
      ]);

      await client.query("delete from project_services where id = $1", [psNew]);

      const result = await client.query<{ project_id: string; replaced_by_project_service_id: string | null }>(
        "select project_id, replaced_by_project_service_id from project_services where id = $1",
        [psOld],
      );
      expect(result.rows[0]?.replaced_by_project_service_id).toBeNull();
      expect(result.rows[0]?.project_id).toBe(project.id);
    });

    it("deleting a replacement edge nulls the pointer and keeps the row's project_id", async () => {
      const project = await insertProject();
      const service = await insertService();
      const fromOld = await insertProjectService(project.id, service.id);
      const toOld = await insertProjectService(project.id, service.id);
      const fromNew = await insertProjectService(project.id, service.id);
      const toNew = await insertProjectService(project.id, service.id);
      const edgeOld = await insertEdge(project.id, fromOld, toOld);
      const edgeNew = await insertEdge(project.id, fromNew, toNew);
      await client.query("update service_dependencies set replaced_by_edge_id = $1 where id = $2", [
        edgeNew,
        edgeOld,
      ]);

      await client.query("delete from service_dependencies where id = $1", [edgeNew]);

      const result = await client.query<{ project_id: string; replaced_by_edge_id: string | null }>(
        "select project_id, replaced_by_edge_id from service_dependencies where id = $1",
        [edgeOld],
      );
      expect(result.rows[0]?.replaced_by_edge_id).toBeNull();
      expect(result.rows[0]?.project_id).toBe(project.id);
    });
  });

  describe("self-reference checks", () => {
    it("rejects a project_service replacing itself", async () => {
      const project = await insertProject();
      const service = await insertService();
      const ps = await insertProjectService(project.id, service.id);
      await expect(
        client.query("update project_services set replaced_by_project_service_id = $1 where id = $1", [ps]),
      ).rejects.toThrow(/violates check constraint/);
    });

    it("rejects an edge replacing itself", async () => {
      const project = await insertProject();
      const service = await insertService();
      const fromId = await insertProjectService(project.id, service.id);
      const toId = await insertProjectService(project.id, service.id);
      const edge = await insertEdge(project.id, fromId, toId);
      await expect(
        client.query("update service_dependencies set replaced_by_edge_id = $1 where id = $1", [edge]),
      ).rejects.toThrow(/violates check constraint/);
    });

    it("rejects a service being its own successor", async () => {
      const service = await insertService();
      await expect(
        client.query("update services set successor_service_id = $1 where id = $1", [service.id]),
      ).rejects.toThrow(/violates check constraint/);
    });
  });

  describe("user_service_accounts checks", () => {
    it("rejects a cost_amount with no billing_cycle", async () => {
      const userId = await createUser(client);
      const service = await insertService();
      await expect(
        client.query("insert into user_service_accounts (user_id, service_id, cost_amount) values ($1, $2, 10.00)", [
          userId,
          service.id,
        ]),
      ).rejects.toThrow(/violates check constraint/);
    });

    it("rejects a negative cost_amount", async () => {
      const userId = await createUser(client);
      const service = await insertService();
      await expect(
        client.query(
          "insert into user_service_accounts (user_id, service_id, cost_amount, billing_cycle) values ($1, $2, -5.00, 'monthly')",
          [userId, service.id],
        ),
      ).rejects.toThrow(/violates check constraint/);
    });

    it("rejects a 2-letter cost_currency", async () => {
      const userId = await createUser(client);
      const service = await insertService();
      await expect(
        client.query("insert into user_service_accounts (user_id, service_id, cost_currency) values ($1, $2, 'US')", [
          userId,
          service.id,
        ]),
      ).rejects.toThrow(/violates check constraint/);
    });

    it("rejects a lowercase cost_currency", async () => {
      const userId = await createUser(client);
      const service = await insertService();
      await expect(
        client.query(
          "insert into user_service_accounts (user_id, service_id, cost_currency) values ($1, $2, 'usd')",
          [userId, service.id],
        ),
      ).rejects.toThrow(/violates check constraint/);
    });

    it("accepts a valid cost_amount, billing_cycle and cost_currency", async () => {
      const userId = await createUser(client);
      const service = await insertService();
      const result = await client.query<{ cost_currency: string }>(
        `insert into user_service_accounts (user_id, service_id, cost_amount, billing_cycle, cost_currency)
         values ($1, $2, 10.00, 'monthly', 'USD') returning cost_currency`,
        [userId, service.id],
      );
      expect(result.rows[0]?.cost_currency).toBe("USD");
    });

    it("rejects a cost_amount with no currency", async () => {
      const userId = await createUser(client);
      const service = await insertService();
      await expect(
        client.query(
          "insert into user_service_accounts (user_id, service_id, cost_amount, billing_cycle) values ($1, $2, 5, 'monthly')",
          [userId, service.id],
        ),
      ).rejects.toThrow(/violates check constraint/);
    });

    it("rejects a cost_amount with more than 2 decimal places", async () => {
      const userId = await createUser(client);
      const service = await insertService();
      await expect(
        client.query(
          "insert into user_service_accounts (user_id, service_id, cost_amount, billing_cycle, cost_currency) values ($1, $2, 1.005, 'monthly', 'USD')",
          [userId, service.id],
        ),
      ).rejects.toThrow(/violates check constraint "user_service_accounts_cost_amount_scale"/);
    });

    it("accepts a cost_amount of 1.01 and reads it back unchanged", async () => {
      const userId = await createUser(client);
      const service = await insertService();
      const result = await client.query<{ cost_amount: string }>(
        `insert into user_service_accounts (user_id, service_id, cost_amount, billing_cycle, cost_currency)
         values ($1, $2, 1.01, 'monthly', 'USD') returning cost_amount`,
        [userId, service.id],
      );
      expect(result.rows[0]?.cost_amount).toBe("1.01");
    });

    it("accepts a cost_amount of 0 and reads it back unchanged", async () => {
      const userId = await createUser(client);
      const service = await insertService();
      const result = await client.query<{ cost_amount: string }>(
        `insert into user_service_accounts (user_id, service_id, cost_amount, billing_cycle, cost_currency)
         values ($1, $2, 0, 'monthly', 'USD') returning cost_amount`,
        [userId, service.id],
      );
      expect(result.rows[0]?.cost_amount).toBe("0");
    });

    it("rejects a cost_amount of 1e10", async () => {
      const userId = await createUser(client);
      const service = await insertService();
      await expect(
        client.query(
          "insert into user_service_accounts (user_id, service_id, cost_amount, billing_cycle, cost_currency) values ($1, $2, 1e10, 'monthly', 'USD')",
          [userId, service.id],
        ),
      ).rejects.toThrow(/violates check constraint "user_service_accounts_cost_amount_scale"/);
    });
  });

  describe("manifest parity checks", () => {
    it("rejects an empty name on projects", async () => {
      const ownerId = await createUser(client);
      await expect(
        client.query("insert into projects (owner_id, name, slug) values ($1, '', 'empty-name')", [ownerId]),
      ).rejects.toThrow(/violates check constraint/);
    });

    it("rejects an empty name on services", async () => {
      await expect(
        client.query("insert into services (slug, name) values ($1, '')", [`service-${randomUUID().slice(0, 8)}`]),
      ).rejects.toThrow(/violates check constraint/);
    });

    it("rejects an empty version on project_services", async () => {
      const project = await insertProject();
      const service = await insertService();
      await expect(
        client.query(
          `insert into project_services (project_id, service_id, local_id, role, version, added_at, provenance)
           values ($1, $2, 'svc', 'database', '', current_date, 'manual')`,
          [project.id, service.id],
        ),
      ).rejects.toThrow(/violates check constraint/);
    });

    it("rejects a path-traversal icon_path", async () => {
      const project = await insertProject();
      const service = await insertService();
      await expect(
        client.query(
          `insert into project_services (project_id, service_id, local_id, role, icon_path, added_at, provenance)
           values ($1, $2, 'svc', 'database', '../../etc/passwd', current_date, 'manual')`,
          [project.id, service.id],
        ),
      ).rejects.toThrow(/violates check constraint/);
    });

    it("rejects an icon_path containing '..' even when it otherwise matches the pattern", async () => {
      const project = await insertProject();
      const service = await insertService();
      await expect(
        client.query(
          `insert into project_services (project_id, service_id, local_id, role, icon_path, added_at, provenance)
           values ($1, $2, 'svc', 'database', '.catalogus/icons/a..svg', current_date, 'manual')`,
          [project.id, service.id],
        ),
      ).rejects.toThrow(/violates check constraint/);
    });

    it("accepts a valid icon_path", async () => {
      const project = await insertProject();
      const service = await insertService();
      const result = await client.query<{ icon_path: string }>(
        `insert into project_services (project_id, service_id, local_id, role, icon_path, added_at, provenance)
         values ($1, $2, 'svc', 'database', '.catalogus/icons/github.svg', current_date, 'manual')
         returning icon_path`,
        [project.id, service.id],
      );
      expect(result.rows[0]?.icon_path).toBe(".catalogus/icons/github.svg");
    });
  });

  describe("unique constraints", () => {
    it("rejects a duplicate (owner_id, slug) on projects", async () => {
      const ownerId = await createUser(client);
      const slug = `dup-${randomUUID().slice(0, 8)}`;
      await client.query("insert into projects (owner_id, name, slug) values ($1, 'A', $2)", [ownerId, slug]);
      await expect(
        client.query("insert into projects (owner_id, name, slug) values ($1, 'B', $2)", [ownerId, slug]),
      ).rejects.toThrow(/duplicate key value violates unique constraint/);
    });

    it("rejects a duplicate (project_id, local_id) on project_services", async () => {
      const project = await insertProject();
      const service = await insertService();
      const localId = `dup-${randomUUID().slice(0, 8)}`;
      await insertProjectService(project.id, service.id, localId);
      await expect(insertProjectService(project.id, service.id, localId)).rejects.toThrow(
        /duplicate key value violates unique constraint/,
      );
    });
  });

  describe("cascading deletes", () => {
    it("removes a project's services, edges and meta when the project is deleted", async () => {
      const project = await insertProject();
      const service = await insertService();
      const psA = await insertProjectService(project.id, service.id);
      const psB = await insertProjectService(project.id, service.id);
      await client.query(
        `insert into service_dependencies (project_id, from_project_service_id, to_project_service_id) values ($1, $2, $3)`,
        [project.id, psA, psB],
      );
      await client.query("insert into project_meta (project_id, architecture_style) values ($1, 'modular monolith')", [
        project.id,
      ]);

      await client.query("delete from projects where id = $1", [project.id]);

      const remainingServices = await client.query("select 1 from project_services where project_id = $1", [project.id]);
      const remainingEdges = await client.query("select 1 from service_dependencies where project_id = $1", [project.id]);
      const remainingMeta = await client.query("select 1 from project_meta where project_id = $1", [project.id]);

      expect(remainingServices.rowCount).toBe(0);
      expect(remainingEdges.rowCount).toBe(0);
      expect(remainingMeta.rowCount).toBe(0);
    });
  });

  describe("auth stub", () => {
    it("auth.uid() returns the id set through asUser", async () => {
      const userId = await createUser(client);
      const result = await asUser(client, userId, (c) => c.query<{ uid: string }>("select auth.uid() as uid"));
      expect(result.rows[0]?.uid).toBe(userId);
    });

    it("auth.uid() returns null through asAnon", async () => {
      const result = await asAnon(client, (c) => c.query<{ uid: string | null }>("select auth.uid() as uid"));
      expect(result.rows[0]?.uid).toBeNull();
    });
  });
});
