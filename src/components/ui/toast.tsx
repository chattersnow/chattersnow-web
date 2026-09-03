"use client";

import { Toast as BaseToast } from "@base-ui/react/toast";
import { Check, TriangleAlert, X } from "lucide-react";

/**
 * A module-level manager, so a Server Action result can be announced from any
 * dialog without threading a hook or a context through it. The portal shell
 * mounts one <Toaster /> against this manager and `toast.success(...)`
 * anywhere fires into it.
 */
const manager = BaseToast.createToastManager();

type ToastOptions = { description?: string; timeout?: number };

export const toast = {
  /**
   * Confirms a write the current page may show no evidence of. The sidebar
   * quick actions save from every route, so a dialog closing is not by itself
   * evidence that anything was recorded -- the predictable response to a
   * silent save is to do it again.
   */
  success(title: string, options: ToastOptions = {}) {
    return manager.add({ title, type: "success", ...options });
  },
  /** Announced urgently, and given longer to be read than a confirmation. */
  error(title: string, options: ToastOptions = {}) {
    return manager.add({
      title,
      type: "error",
      priority: "high",
      timeout: 8000,
      ...options,
    });
  },
  close(id?: string) {
    manager.close(id);
  },
};

const ROOT_CLASS = [
  // Stacking geometry, per Base UI's reference recipe: collapsed toasts peek
  // behind the frontmost one and fan out on hover/focus.
  "[--gap:0.75rem] [--peek:0.75rem]",
  "[--scale:calc(max(0,1-(var(--toast-index)*0.1)))] [--shrink:calc(1-var(--scale))]",
  "[--height:var(--toast-frontmost-height,var(--toast-height))]",
  "[--offset-y:calc(var(--toast-offset-y)*-1+calc(var(--toast-index)*var(--gap)*-1)+var(--toast-swipe-movement-y))]",
  "absolute right-0 bottom-0 left-auto z-[calc(1000-var(--toast-index))] mr-0 w-full origin-bottom",
  "[transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)-(var(--toast-index)*var(--peek))-(var(--shrink)*var(--height))))_scale(var(--scale))]",
  "data-expanded:[transform:translateX(var(--toast-swipe-movement-x))_translateY(var(--offset-y))]",
  // A transparent strip under each toast so the gap between them doesn't
  // break a hover that is expanding the stack.
  "after:absolute after:top-full after:left-0 after:h-[calc(var(--gap)+1px)] after:w-full after:content-['']",
  "rounded-lg border border-[var(--line)] bg-card text-card-foreground shadow-lg select-none",
  "h-[var(--height)] data-expanded:h-[var(--toast-height)]",
  "[transition:transform_0.5s_cubic-bezier(0.22,1,0.36,1),opacity_0.5s,height_0.15s]",
  "data-starting-style:[transform:translateY(150%)] data-ending-style:opacity-0 data-limited:opacity-0",
  "[&[data-ending-style]:not([data-limited]):not([data-swipe-direction])]:[transform:translateY(150%)]",
].join(" ");

function ToastList() {
  const { toasts } = BaseToast.useToastManager();

  return toasts.map((item) => (
    <BaseToast.Root key={item.id} toast={item} className={ROOT_CLASS}>
      <BaseToast.Content className="flex items-start gap-2 overflow-hidden p-3 transition-opacity duration-[250ms] data-behind:opacity-0 data-expanded:opacity-100">
        {item.type === "error" ? (
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
        ) : (
          <Check className="mt-0.5 size-4 shrink-0 text-[var(--purple)]" />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <BaseToast.Title className="text-sm font-medium" />
          {item.description && (
            <BaseToast.Description className="text-sm text-muted-foreground" />
          )}
        </div>
        <BaseToast.Close
          aria-label="Dismiss"
          className="-mt-1 -mr-1 shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <X className="size-4" />
        </BaseToast.Close>
      </BaseToast.Content>
    </BaseToast.Root>
  ));
}

/**
 * Mount once, high in the tree. Base UI renders the viewport as a live region
 * reachable with F6, so announcements reach a screen reader without stealing
 * focus from whatever the operator is in the middle of.
 */
export function Toaster() {
  return (
    <BaseToast.Provider toastManager={manager}>
      <BaseToast.Portal>
        <BaseToast.Viewport className="fixed right-4 bottom-4 left-auto z-50 mx-auto w-[calc(100vw-2rem)] outline-none sm:right-8 sm:bottom-8 sm:w-[22.5rem]">
          <ToastList />
        </BaseToast.Viewport>
      </BaseToast.Portal>
    </BaseToast.Provider>
  );
}
