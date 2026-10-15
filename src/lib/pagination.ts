import "server-only";
import { HttpError } from "./errors";

/** A keyset page request: `after` is the (date, id) of the last row of the previous page. */
export interface PageArgs {
  limit: number;
  after?: { at: Date; id: string };
}

/** Opaque cursor for newest-first keyset pagination. */
export const cursor = {
  encode: (at: Date, id: string) => Buffer.from(`${at.toISOString()}|${id}`).toString("base64url"),
  decode: (c: string | undefined): PageArgs["after"] => {
    if (!c) return undefined;
    const [iso, id] = Buffer.from(c, "base64url").toString().split("|");
    const at = new Date(iso);
    if (!id || !/^[0-9a-f-]{36}$/.test(id) || Number.isNaN(at.getTime())) {
      throw new HttpError(400, "Curseur invalide.", { fields: { cursor: "Curseur inconnu" } });
    }
    return { at, id };
  },
};

/** Rows fetched with `limit + 1` → `{ items, nextCursor }`. */
export function paginate<T extends { id: string }, R>(rows: T[], limit: number, at: (row: T) => Date, map: (row: T) => R) {
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  return { items: items.map(map), nextCursor: rows.length > limit ? cursor.encode(at(last), last.id) : null };
}
