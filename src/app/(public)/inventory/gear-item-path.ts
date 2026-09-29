/**
 * The query parameter that names the open item in the catalog:
 * `/inventory/library?item=<id>`.
 *
 * Its own module because the library page reads it on the server, for the
 * shared link's title, and a constant imported from a "use client" file
 * arrives in a server component as a client reference rather than a string.
 */
export const GEAR_ITEM_PARAM = "item";
