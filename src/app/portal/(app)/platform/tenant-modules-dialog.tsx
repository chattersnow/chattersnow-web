"use client";

import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useActionToast } from "@/components/portal/action-toast";
import { listTenantModulesAction, setTenantModuleAction } from "./actions";
import {
  moduleSourceNote,
  type PlatformTenant,
  type TenantModule,
} from "./platform-shared";

/**
 * What the operator is told before turning a section off for somebody else's
 * organization. Turning a module off deletes nothing -- #900 is explicit that
 * off is hidden and frozen -- but it is the customer's portal changing shape
 * without warning, so the dialog says the whole of what happens rather than
 * asking for a confirmation of something unstated.
 */
function DisableConfirmation({
  entry,
  tenant,
  busy,
  onCancel,
  onConfirm,
}: {
  entry: TenantModule;
  tenant: PlatformTenant;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <Alert>
        <AlertDescription>
          <p>
            Turning <strong>{entry.label}</strong> off for {tenant.name} takes
            the section out of their portal — their sidebar, their dashboard and
            their search — for everyone there, including their own
            administrators.
          </p>
          <p className="mt-2">
            Nothing is deleted. Their data stays, it is still in their export,
            and turning the module back on restores the section with its history
            intact. Nobody is notified; tell them yourself.
          </p>
        </AlertDescription>
      </Alert>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={busy}>
          Keep it on
        </Button>
        <Button variant="destructive" onClick={onConfirm} disabled={busy}>
          Turn {entry.label} off
        </Button>
      </div>
    </div>
  );
}

/**
 * Mounted per organization -- the caller renders it only while one is open, so
 * every piece of state here starts fresh for each tenant rather than being
 * reset by an effect when the prop changes.
 */
export function TenantModulesDialog({
  tenant,
  onClose,
  onChanged,
}: {
  tenant: PlatformTenant;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { run, isPending } = useActionToast();
  const [modules, setModules] = useState<TenantModule[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The module the operator has asked to turn off and not yet confirmed.
  const [confirming, setConfirming] = useState<TenantModule | null>(null);

  const tenantId = tenant.id;
  // Bumped after every write. The effect below is the only thing that reads
  // the list, so a reload is a dependency change rather than a second code
  // path -- and the cleanup drops a response that arrives after another one
  // has been asked for.
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await listTenantModulesAction(tenantId);
      if (cancelled) return;
      if ("error" in result) {
        setLoadError(result.error);
        setModules([]);
        return;
      }
      setLoadError(null);
      setModules(result.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId, reloads]);

  const apply = (entry: TenantModule, enabled: boolean) => {
    setError(null);
    run(() => setTenantModuleAction(tenant.id, entry.module_key, enabled), {
      success: `${entry.label} is ${enabled ? "on" : "off"} for ${tenant.name}.`,
      onError: setError,
      onSuccess: () => {
        setConfirming(null);
        // Re-read rather than patching the row in place: `source` and the
        // "who changed it" stamp are the server's to answer, and an enable
        // that was previously a plan default becomes a tenant setting.
        setReloads((n) => n + 1);
        onChanged();
      },
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Modules for {tenant.name}</DialogTitle>
          <DialogDescription>
            What this organization has been sold. These are the platform&rsquo;s
            to set, not theirs — their own administrators cannot change them,
            and their permission matrix cannot reach past them. A module that is
            off resolves to no permission for every resource in it, in the
            database and not only in the navigation.
          </DialogDescription>
        </DialogHeader>

        {loadError ? (
          <Alert variant="destructive">
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        ) : null}
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {confirming ? (
          <DisableConfirmation
            entry={confirming}
            tenant={tenant}
            busy={isPending}
            onCancel={() => setConfirming(null)}
            onConfirm={() => apply(confirming, false)}
          />
        ) : modules === null ? (
          <div className="flex flex-col gap-3">
            {[0, 1, 2, 3].map((row) => (
              <Skeleton key={row} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-[var(--line)]">
            {modules.map((entry) => {
              const note = moduleSourceNote(entry, tenant.plan);
              return (
                <li
                  key={entry.module_key}
                  className="flex items-start justify-between gap-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{entry.label}</div>
                    {entry.description ? (
                      <p className="app-muted mt-0.5 text-xs leading-relaxed">
                        {entry.description}
                      </p>
                    ) : null}
                    {/* Core modules are shown rather than hidden: an operator
                        should be able to see that People and Administration
                        exist and are not negotiable, instead of wondering
                        where they went. */}
                    {entry.is_core ? (
                      <p className="app-muted mt-1 text-xs">
                        Core — the portal does not work without it, so it cannot
                        be turned off for anyone.
                      </p>
                    ) : note ? (
                      <p className="app-muted mt-1 text-xs">{note}</p>
                    ) : entry.updated_by_email ? (
                      <p className="app-muted mt-1 text-xs">
                        Set for this organization by {entry.updated_by_email}.
                      </p>
                    ) : (
                      <p className="app-muted mt-1 text-xs">
                        Set for this organization.
                      </p>
                    )}
                  </div>
                  <Switch
                    checked={entry.enabled}
                    disabled={entry.is_core || isPending}
                    aria-label={`${entry.label} for ${tenant.name}`}
                    onCheckedChange={(checked) =>
                      checked ? apply(entry, true) : setConfirming(entry)
                    }
                  />
                </li>
              );
            })}
          </ul>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
