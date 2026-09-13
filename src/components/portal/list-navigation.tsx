"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ComponentProps,
  type FormEvent,
  type ReactNode,
} from "react";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/**
 * Pending feedback for lists that sort, page and filter through the URL.
 *
 * Those lists are server components, so every control on them is a `<Link>`
 * or a GET form, and the only feedback a click gave was `LinkPendingPulse`:
 * an opacity pulse on the clicked label alone, because `useLinkStatus` can
 * only be read from inside its own link. Same-route searchParams navigations
 * never show `loading.tsx` either, so the table sat unchanged for the whole
 * round trip and read as "nothing happened".
 *
 * The provider owns the navigation instead: a link inside it hands its href
 * to `navigate`, which runs `router.push` in a transition, so `pending` holds
 * from the click until the new server render commits and the whole region
 * can show it. Each control stays an `<a href>` -- no-JS, middle-click and
 * prefetching keep working -- and every component here falls back to plain
 * `<Link>` behaviour when no provider is mounted, so the shared sort header
 * and pager are unchanged on lists that haven't opted in.
 */
type ListNavigation = {
  pending: boolean;
  navigate: (href: string) => void;
};

const ListNavigationContext = createContext<ListNavigation | null>(null);

export function useListNavigation() {
  return useContext(ListNavigationContext);
}

export function ListNavigationProvider({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // A native GET form inside the region (search, "Go to page") is a full
  // document navigation with no React state to await, so its submit marks
  // the region pending until the new document arrives.
  const [unloading, setUnloading] = useState(false);

  useEffect(() => {
    // Restore from bfcache (browser back) keeps component state, so reset.
    const onPageShow = () => setUnloading(false);
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  const navigate = useCallback(
    (href: string) => {
      startTransition(() => {
        router.push(href);
      });
    },
    [router],
  );

  const value = useMemo(
    () => ({ pending: isPending || unloading, navigate }),
    [isPending, unloading, navigate],
  );

  function onSubmit(event: FormEvent<HTMLDivElement>) {
    // Bubble phase on purpose: a dialog's own onSubmit (which prevents the
    // default and runs a Server Action) has already run by now, and the
    // browser will not be leaving the page.
    if (event.defaultPrevented) return;
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.method !== "get") return;
    setUnloading(true);
  }

  return (
    <ListNavigationContext.Provider value={value}>
      <div className={className} onSubmit={onSubmit}>
        {children}
      </div>
    </ListNavigationContext.Provider>
  );
}

/**
 * `<Link>` that routes through the enclosing provider's transition when
 * there is one, and is an ordinary `<Link>` otherwise.
 */
export function ListLink({
  href,
  onNavigate,
  ...props
}: Omit<ComponentProps<typeof Link>, "href"> & { href: string }) {
  const nav = useListNavigation();
  return (
    <Link
      href={href}
      {...props}
      onNavigate={(event) => {
        onNavigate?.(event);
        if (!nav) return;
        event.preventDefault();
        nav.navigate(href);
      }}
    />
  );
}

/**
 * Wraps the part of the list that changes -- the table card -- and dims it
 * under a fixed "Loading…" pill while a navigation is pending. The pill is
 * always rendered and only its opacity changes, so nothing shifts.
 */
export function ListPendingRegion({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const pending = useListNavigation()?.pending ?? false;

  return (
    <div className={cn("relative", className)} aria-busy={pending || undefined}>
      <div
        className={cn(
          "transition-opacity duration-150",
          pending && "pointer-events-none opacity-50",
        )}
      >
        {children}
      </div>
      <div
        aria-hidden={!pending}
        className={cn(
          "pointer-events-none absolute inset-x-0 top-16 flex justify-center transition-opacity duration-150",
          pending ? "opacity-100" : "opacity-0",
        )}
      >
        <span className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-background px-3 py-1.5 text-sm shadow-md">
          <Spinner />
          Loading…
        </span>
      </div>
    </div>
  );
}
