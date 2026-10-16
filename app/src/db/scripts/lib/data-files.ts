import ExcelJS from "exceljs";
import { parse } from "csv-parse/sync";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseDmyHm, parseHm, parseIsoDateLocal, zonedToUtc } from "./time";

/**
 * Readers for the exports a hotel hands over (here: the synthetic ones in
 * data/out). Each returns plain records plus the raw row, so the loader can
 * keep every original field in `signals.raw`.
 */

type Row = Record<string, string>;

async function readCsv(
  file: string,
  opts: { delimiter?: string } = {},
): Promise<Row[]> {
  const content = await readFile(file, "utf8");
  return parse(content, {
    columns: true,
    bom: true,
    delimiter: opts.delimiter ?? ",",
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as Row[];
}

export type WorkOrder = {
  externalId: string;
  occurredAt: Date | null;
  locationText: string;
  category: string;
  description: string;
  raw: Row;
};

export async function readWorkOrders(
  dir: string,
  timeZone: string,
): Promise<WorkOrder[]> {
  const rows = await readCsv(path.join(dir, "work_orders.csv"), {
    delimiter: ";",
  });
  return rows.map((r) => ({
    externalId: r["Ticket No"],
    occurredAt: parseDmyHm(r["Created"] ?? "", timeZone),
    locationText: r["Location"] ?? "",
    category: r["Category"] ?? "",
    description: r["Description"] ?? "",
    raw: r,
  }));
}

export type FrontDeskEntry = {
  externalId: string;
  occurredAt: Date | null;
  roomText: string;
  guestComment: string;
  agentNote: string;
  sheet: string;
  raw: Record<string, string | number | null>;
};

export async function readFrontDesk(
  dir: string,
  timeZone: string,
): Promise<FrontDeskEntry[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.join(dir, "front_desk_log.xlsx"));
  const out: FrontDeskEntry[] = [];
  for (const ws of wb.worksheets) {
    // Row 1 is a title, row 2 is empty, row 3 is the header.
    const header = ws.getRow(3);
    const columns: string[] = [];
    header.eachCell({ includeEmpty: true }, (cell, col) => {
      columns[col] = String(cell.value ?? "").trim();
    });
    ws.eachRow((row, rowNumber) => {
      if (rowNumber <= 3) return;
      const raw: Record<string, string | number | null> = {};
      let dateCell: Date | null = null;
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        const key = columns[col];
        if (!key) return;
        const v = cell.value;
        if (v instanceof Date) {
          raw[key] = v.toISOString();
          if (key === "Date") dateCell = v;
        } else if (v === null || v === undefined) {
          raw[key] = null;
        } else if (typeof v === "object" && "result" in v) {
          raw[key] = String(v.result ?? "");
        } else if (typeof v === "object" && "richText" in v) {
          raw[key] = v.richText.map((t) => t.text).join("");
        } else {
          raw[key] = typeof v === "number" ? v : String(v);
        }
      });
      const num = raw["#"];
      if (num === null || num === undefined || num === "") return;
      out.push({
        externalId: String(num),
        occurredAt: combineDateAndTime(
          dateCell,
          String(raw["Time"] ?? ""),
          timeZone,
        ),
        roomText: raw["Room"] === null ? "" : String(raw["Room"] ?? "").trim(),
        guestComment: String(raw["Guest comment (original)"] ?? "").trim(),
        agentNote: String(raw["Agent note"] ?? "").trim(),
        sheet: ws.name,
        raw: { ...raw, sheet: ws.name },
      });
    });
  }
  return out;
}

function combineDateAndTime(
  dateCell: Date | null,
  time: string,
  timeZone: string,
): Date | null {
  if (!dateCell) return null;
  // Excel dates come back as UTC midnight; fall back to local parts otherwise.
  const utcMidnight =
    dateCell.getUTCHours() === 0 && dateCell.getUTCMinutes() === 0;
  const year = utcMidnight ? dateCell.getUTCFullYear() : dateCell.getFullYear();
  const month = (utcMidnight ? dateCell.getUTCMonth() : dateCell.getMonth()) + 1;
  const day = utcMidnight ? dateCell.getUTCDate() : dateCell.getDate();
  const hm = parseHm(time) ?? { hour: 0, minute: 0 };
  return zonedToUtc({ year, month, day, ...hm }, timeZone);
}

export type Survey = {
  externalId: string;
  reservationNo: string;
  occurredAt: Date | null;
  language: string;
  comment: string;
  raw: Row;
};

export async function readSurveys(
  dir: string,
  timeZone: string,
): Promise<Survey[]> {
  const rows = await readCsv(path.join(dir, "surveys.csv"));
  return rows.map((r) => ({
    externalId: r["response_id"],
    reservationNo: r["reservation_no"],
    occurredAt: parseIsoDateLocal(r["checkout_date"] ?? "", timeZone),
    language: r["language"] ?? "",
    comment: r["comment"] ?? "",
    raw: r,
  }));
}

export type Review = {
  externalId: string;
  platform: string;
  occurredAt: Date | null;
  language: string;
  text: string;
  raw: Record<string, unknown>;
};

export async function readReviews(
  dir: string,
  timeZone: string,
): Promise<Review[]> {
  const doc = JSON.parse(
    await readFile(path.join(dir, "reviews.json"), "utf8"),
  ) as { reviews: Record<string, unknown>[] };
  return doc.reviews.map((r) => {
    const platform = String(r.platform ?? "");
    const str = (k: string) => (r[k] == null ? "" : String(r[k]));
    let text: string;
    if (platform === "booking") {
      text = [
        str("title"),
        str("positive") && `+ ${str("positive")}`,
        str("negative") && `- ${str("negative")}`,
      ]
        .filter(Boolean)
        .join("\n");
    } else {
      text = [str("title"), str("text")].filter(Boolean).join("\n");
    }
    const dateText = str("date") || str("published");
    const occurredAt = /T/.test(dateText)
      ? new Date(dateText)
      : parseIsoDateLocal(dateText, timeZone);
    return {
      externalId: str("review_id"),
      platform,
      occurredAt: occurredAt && !Number.isNaN(occurredAt.getTime()) ? occurredAt : null,
      language: str("language"),
      text,
      raw: r,
    };
  });
}

export type Stay = {
  reservationNo: string;
  room: string;
  checkIn: Date | null;
  checkOut: Date | null;
  raw: Row;
};

export async function readStays(dir: string, timeZone: string): Promise<Stay[]> {
  const rows = await readCsv(path.join(dir, "stays.csv"));
  return rows.map((r) => ({
    reservationNo: r["reservation_no"],
    room: r["room"] ?? "",
    checkIn: parseIsoDateLocal(r["check_in"] ?? "", timeZone),
    checkOut: parseIsoDateLocal(r["check_out"] ?? "", timeZone),
    raw: r,
  }));
}

export type OccupancyRow = {
  day: string;
  building: string;
  roomsAvailable: number;
  roomsOccupied: number;
  arrivals: number | null;
  departures: number | null;
};

export async function readOccupancy(dir: string): Promise<OccupancyRow[]> {
  const rows = await readCsv(path.join(dir, "occupancy_daily.csv"));
  const int = (v: string | undefined) =>
    v === undefined || v === "" ? null : Number(v);
  return rows.map((r) => ({
    day: r["date"],
    building: r["building"],
    roomsAvailable: Number(r["rooms_available"]),
    roomsOccupied: Number(r["rooms_occupied"]),
    arrivals: int(r["arrivals"]),
    departures: int(r["departures"]),
  }));
}

export type RoomRow = {
  roomCode: string;
  building: string;
  buildingName: string;
  floor: string;
  roomType: string;
  view: string;
  isVilla: boolean;
};

export async function readRooms(dir: string): Promise<RoomRow[]> {
  const rows = await readCsv(path.join(dir, "rooms.csv"));
  return rows.map((r) => ({
    roomCode: r["room_code"],
    building: r["building"],
    buildingName: r["building_name"],
    floor: r["floor"],
    roomType: r["room_type"],
    view: r["view"],
    isVilla: /^(true|1|yes)$/i.test(r["is_villa"] ?? ""),
  }));
}

export type FacilityRow = {
  code: string;
  name: string;
  type: string;
  area: string;
  notes: string;
};

export async function readFacilities(dir: string): Promise<FacilityRow[]> {
  const rows = await readCsv(path.join(dir, "facilities.csv"));
  return rows.map((r) => ({
    code: r["facility_code"],
    name: r["name"],
    type: r["type"],
    area: r["area"] ?? "",
    notes: r["notes"] ?? "",
  }));
}

export type EquipmentRow = {
  id: string;
  name: string;
  type: string;
  building: string;
  locationText: string;
  serves: string;
  installedYear: string;
};

export async function readEquipment(dir: string): Promise<EquipmentRow[]> {
  const rows = await readCsv(path.join(dir, "equipment.csv"));
  return rows.map((r) => ({
    id: r["equipment_id"],
    name: r["name"],
    type: r["type"],
    building: r["building"] ?? "",
    locationText: r["location"] ?? "",
    serves: r["serves"] ?? "",
    installedYear: r["installed_year"] ?? "",
  }));
}
