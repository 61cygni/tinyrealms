/**
 * migrations.ts — Reusable migration utilities for safe schema evolution.
 *
 * Usage:
 *   npx convex run migrations:backfillField '{"adminKey":"<ADMIN_API_KEY>","table":"profiles","field":"schemaVersion","defaultValue":1}'
 *   npx convex run migrations:removeField '{"adminKey":"<ADMIN_API_KEY>","table":"profiles","field":"legacyField"}'
 *   npx convex run migrations:listMissing '{"adminKey":"<ADMIN_API_KEY>","table":"maps","field":"schemaVersion"}'
 */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAdminKey } from "./lib/requireAdminKey";

// ---------------------------------------------------------------------------
// Generic backfill: set a default value for records missing a field
// ---------------------------------------------------------------------------

export const backfillField = mutation({
  args: {
    adminKey: v.string(),
    table: v.string(),
    field: v.string(),
    defaultValue: v.any(),
  },
  handler: async (ctx, { adminKey, table, field, defaultValue }) => {
    requireAdminKey(adminKey);
    const records = await (ctx.db.query(table as any) as any).collect();
    let updated = 0;
    for (const r of records) {
      if ((r as any)[field] === undefined) {
        await ctx.db.patch(r._id, { [field]: defaultValue } as any);
        updated++;
      }
    }
    return { total: records.length, updated };
  },
});

// ---------------------------------------------------------------------------
// Remove a legacy field from all records in a table
// ---------------------------------------------------------------------------

export const removeField = mutation({
  args: {
    adminKey: v.string(),
    table: v.string(),
    field: v.string(),
  },
  handler: async (ctx, { adminKey, table, field }) => {
    requireAdminKey(adminKey);
    const records = await (ctx.db.query(table as any) as any).collect();
    let cleaned = 0;
    for (const r of records) {
      if ((r as any)[field] !== undefined) {
        // Replace the entire document without the field
        const { _id, _creationTime, [field]: _removed, ...rest } = r as any;
        await ctx.db.replace(_id, rest);
        cleaned++;
      }
    }
    return { total: records.length, cleaned };
  },
});

// ---------------------------------------------------------------------------
// List records missing a field (dry-run / audit)
// ---------------------------------------------------------------------------

export const listMissing = query({
  args: {
    adminKey: v.string(),
    table: v.string(),
    field: v.string(),
  },
  handler: async (ctx, { adminKey, table, field }) => {
    requireAdminKey(adminKey);
    const records = await (ctx.db.query(table as any) as any).collect();
    const missing = records.filter((r: any) => r[field] === undefined);
    return {
      total: records.length,
      missing: missing.length,
      sampleIds: missing.slice(0, 10).map((r: any) => r._id),
    };
  },
});

// ---------------------------------------------------------------------------
// Bump schemaVersion for all records in a table
// ---------------------------------------------------------------------------

export const bumpSchemaVersion = mutation({
  args: {
    adminKey: v.string(),
    table: v.string(),
    version: v.number(),
  },
  handler: async (ctx, { adminKey, table, version }) => {
    requireAdminKey(adminKey);
    const records = await (ctx.db.query(table as any) as any).collect();
    let updated = 0;
    for (const r of records) {
      if ((r as any).schemaVersion !== version) {
        await ctx.db.patch(r._id, { schemaVersion: version } as any);
        updated++;
      }
    }
    return { total: records.length, updated };
  },
});

// ---------------------------------------------------------------------------
// Map size audit: check document sizes for maps approaching limits
// ---------------------------------------------------------------------------

export const auditMapSizes = query({
  args: { adminKey: v.string() },
  handler: async (ctx, { adminKey }) => {
    requireAdminKey(adminKey);
    const maps = await ctx.db.query("maps").collect();
    const results = maps.map((m) => {
      // Rough size estimate: JSON-stringify the layers + collisionMask
      let layerBytes = 0;
      for (const layer of m.layers) {
        layerBytes += layer.tiles.length; // already JSON strings
      }
      const collisionBytes = m.collisionMask.length;
      const totalEstimate = layerBytes + collisionBytes;
      const totalKB = Math.round(totalEstimate / 1024);

      return {
        name: m.name,
        width: m.width,
        height: m.height,
        layers: m.layers.length,
        layerKB: Math.round(layerBytes / 1024),
        collisionKB: Math.round(collisionBytes / 1024),
        totalKB,
        warning: totalKB > 500 ? "APPROACHING LIMIT" : totalKB > 250 ? "LARGE" : "OK",
      };
    });

    // Sort by size descending
    results.sort((a, b) => b.totalKB - a.totalKB);
    return results;
  },
});
