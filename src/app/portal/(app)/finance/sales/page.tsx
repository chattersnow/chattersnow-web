import { redirect } from "next/navigation";

/**
 * Sales has one page in part 1. Part 2 replaces this with the register, which
 * is what /portal/finance/sales means from then on; until that exists, a typed
 * URL or a bookmark should land on the catalog rather than a 404.
 */
export default function SalesPage() {
  redirect("/portal/finance/sales/products");
}
