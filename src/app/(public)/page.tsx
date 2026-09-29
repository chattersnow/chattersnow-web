import { redirect } from "next/navigation";

// A fallback only (#1467). A page load of `/` is redirected in `src/proxy.ts`
// before anything renders; this answers the requests the proxy passes through
// untouched -- an RSC fetch from a client-side navigation -- which would
// otherwise 404.
export default function RootPage() {
  redirect("/home");
}
