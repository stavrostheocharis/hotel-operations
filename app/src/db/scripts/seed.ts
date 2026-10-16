import "dotenv/config";
import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { eq, sql } from "drizzle-orm";
import { createDb, schema, type Db } from "../index";
import {
  readEquipment,
  readFacilities,
  readRooms,
} from "./lib/data-files";
import {
  buildingAliases,
  equipmentAliases,
  facilityAliases,
  floorAliases,
  floorCode,
  parseServes,
  roomAliases,
  type BuildingDef,
} from "./lib/locations";
import { dataDir, resortConfigPath } from "./lib/paths";

type ResortYaml = {
  resort: {
    name: string;
    short_name?: string;
    timezone?: string;
    season_open?: string | Date;
    season_close?: string | Date;
  };
  buildings: {
    code: string;
    name: string;
    marketing_name?: string;
    greek_name?: string;
    floors?: number[];
  }[];
};

export type SeedOptions = {
  dataDir?: string;
  configPath?: string;
  groupCode?: string;
  groupName?: string;
  propertyCode?: string;
  log?: (msg: string) => void;
};

export type SeedResult = {
  groupId: string;
  propertyId: string;
  propertyCode: string;
  timezone: string;
  locations: number;
  links: number;
  unresolvedServes: string[];
};

/**
 * Create the demo group and property and load the location hierarchy from
 * the master-data exports (rooms, facilities, equipment). Idempotent: re-runs
 * update names and aliases in place.
 */
export async function seed(db: Db, opts: SeedOptions = {}): Promise<SeedResult> {
  const log = opts.log ?? (() => {});
  const dir = opts.dataDir ?? dataDir();
  const cfg = parseYaml(
    await readFile(opts.configPath ?? resortConfigPath(), "utf8"),
  ) as ResortYaml;
  const timezone = cfg.resort.timezone ?? "Europe/Athens";
  const groupCode = opts.groupCode ?? "demo";
  const propertyCode = opts.propertyCode ?? "ASTRAEA";

  const [group] = await db
    .insert(schema.groups)
    .values({ code: groupCode, name: opts.groupName ?? "Demo Group" })
    .onConflictDoUpdate({
      target: schema.groups.code,
      set: { name: opts.groupName ?? "Demo Group" },
    })
    .returning({ id: schema.groups.id });

  const [property] = await db
    .insert(schema.properties)
    .values({
      groupId: group.id,
      code: propertyCode,
      name: cfg.resort.name,
      timezone,
      seasonOpen: toIsoDate(cfg.resort.season_open),
      seasonClose: toIsoDate(cfg.resort.season_close),
    })
    .onConflictDoUpdate({
      target: [schema.properties.groupId, schema.properties.code],
      set: { name: cfg.resort.name, timezone },
    })
    .returning({ id: schema.properties.id });

  const tenant = { groupId: group.id, propertyId: property.id };

  const upsertLocation = async (loc: {
    kind: (typeof schema.locationKind.enumValues)[number];
    code: string;
    name: string;
    parentId?: string | null;
    aliases?: string[];
    attributes?: Record<string, unknown>;
  }): Promise<string> => {
    const [row] = await db
      .insert(schema.locations)
      .values({
        ...tenant,
        kind: loc.kind,
        code: loc.code,
        name: loc.name,
        parentId: loc.parentId ?? null,
        aliases: loc.aliases ?? [],
        attributes: loc.attributes ?? {},
      })
      .onConflictDoUpdate({
        target: [schema.locations.propertyId, schema.locations.code],
        set: {
          name: loc.name,
          parentId: loc.parentId ?? null,
          aliases: loc.aliases ?? [],
          attributes: loc.attributes ?? {},
          kind: loc.kind,
        },
      })
      .returning({ id: schema.locations.id });
    return row.id;
  };

  let count = 0;
  const rootId = await upsertLocation({
    kind: "property",
    code: propertyCode,
    name: cfg.resort.name,
    aliases: [cfg.resort.short_name ?? "", cfg.resort.name],
  });
  count++;

  // Buildings and floors from resort.yaml.
  const buildingIds = new Map<string, string>();
  const floorIds = new Map<string, string>();
  for (const b of cfg.buildings) {
    const def: BuildingDef = {
      code: b.code,
      name: b.name,
      greekName: b.greek_name,
      marketingName: b.marketing_name,
      floors: b.floors ?? [],
    };
    const bid = await upsertLocation({
      kind: "building",
      code: b.code,
      name: b.name,
      parentId: rootId,
      aliases: buildingAliases(def),
      attributes: { greek_name: b.greek_name ?? null },
    });
    buildingIds.set(b.code, bid);
    count++;
    for (const f of def.floors) {
      if (f === 0 && b.code === "V") continue; // villas hang off the building
      const fid = await upsertLocation({
        kind: "floor",
        code: floorCode(b.code, f),
        name: `${b.name} floor ${f}`,
        parentId: bid,
        aliases: floorAliases(def, f),
        attributes: { floor: f },
      });
      floorIds.set(floorCode(b.code, f), fid);
      count++;
    }
  }

  // Rooms from rooms.csv.
  const rooms = await readRooms(dir);
  for (const r of rooms) {
    const parent =
      floorIds.get(floorCode(r.building, r.floor)) ??
      buildingIds.get(r.building) ??
      rootId;
    await upsertLocation({
      kind: "room",
      code: r.roomCode,
      name: r.isVilla ? `Villa ${Number(r.roomCode.replace(/^V/i, ""))}` : `Room ${r.roomCode}`,
      parentId: parent,
      aliases: roomAliases(r),
      attributes: {
        building: r.building,
        floor: Number(r.floor),
        room_type: r.roomType,
        view: r.view,
        is_villa: r.isVilla,
      },
    });
    count++;
  }

  // Facilities.
  const facilities = await readFacilities(dir);
  const facilityIds = new Map<string, string>();
  for (const f of facilities) {
    const fid = await upsertLocation({
      kind: "facility",
      code: f.code,
      name: f.name,
      parentId: rootId,
      aliases: facilityAliases(f),
      attributes: { type: f.type, area: f.area, notes: f.notes },
    });
    facilityIds.set(f.code, fid);
    count++;
  }

  // Equipment and what it serves.
  const equipment = await readEquipment(dir);
  const known = {
    buildings: new Set(buildingIds.keys()),
    facilities: new Map([...facilityIds.keys()].map((c) => [c, c])),
  };
  const unresolvedServes: string[] = [];
  let links = 0;
  for (const e of equipment) {
    const { codes, unresolved } = parseServes(e.serves, known);
    for (const u of unresolved) unresolvedServes.push(`${e.id}: ${u}`);
    const eid = await upsertLocation({
      kind: "equipment",
      code: e.id,
      name: e.name,
      parentId: (e.building && buildingIds.get(e.building)) || rootId,
      aliases: equipmentAliases(e),
      attributes: {
        type: e.type,
        building: e.building || null,
        location_text: e.locationText,
        installed_year: e.installedYear ? Number(e.installedYear) : null,
        serves_text: e.serves,
        serves_unresolved: unresolved,
      },
    });
    count++;
    for (const code of codes) {
      const servesId = buildingIds.get(code) ?? facilityIds.get(code);
      if (!servesId) continue;
      await db
        .insert(schema.locationLinks)
        .values({ ...tenant, equipmentId: eid, servesId })
        .onConflictDoNothing();
      links++;
    }
  }

  await db.insert(schema.events).values({
    ...tenant,
    entityType: "property",
    entityId: property.id,
    type: "property.seeded",
    payload: { locations: count, links },
  });

  log(`seeded ${count} locations, ${links} equipment links`);
  if (unresolvedServes.length)
    log(`unresolved serves tokens: ${unresolvedServes.join(" | ")}`);

  return {
    groupId: group.id,
    propertyId: property.id,
    propertyCode,
    timezone,
    locations: count,
    links,
    unresolvedServes,
  };
}

/** Look up the seeded property without re-seeding. */
export async function findProperty(db: Db, propertyCode = "ASTRAEA") {
  const [row] = await db
    .select({
      id: schema.properties.id,
      groupId: schema.properties.groupId,
      code: schema.properties.code,
      timezone: schema.properties.timezone,
    })
    .from(schema.properties)
    .where(eq(schema.properties.code, propertyCode))
    .limit(1);
  return row ?? null;
}

function toIsoDate(v: string | Date | undefined): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

export { sql };

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (copy .env.example to .env)");
  const db = createDb(url, { max: 1 });
  try {
    await seed(db, { log: console.log });
  } finally {
    await db.$client.end();
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
