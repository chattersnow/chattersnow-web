"use client";

import { useState, useTransition } from "react";
import { createServiceAction } from "./actions";
import type { ServiceRow } from "@/lib/portal/access-management/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldGroup, Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function ServiceSelect({
  id,
  services,
  value,
  onChange,
  onServiceCreated,
}: {
  id: string;
  services: ServiceRow[];
  value: string;
  onChange: (serviceId: string) => void;
  onServiceCreated: (service: { id: string; name: string }) => void;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isCreating, startCreateTransition] = useTransition();

  function handleCreate() {
    setError(null);
    startCreateTransition(async () => {
      const result = await createServiceAction(name, website, "");
      if ("error" in result) {
        setError(result.error);
        return;
      }
      onServiceCreated(result.service);
      onChange(result.service.id);
      setShowCreate(false);
      setName("");
      setWebsite("");
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Select value={value} onValueChange={(next) => onChange(next ?? "")}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder="Select a service">
            {(current: string) =>
              services.find((service) => service.id === current)?.name ??
              "Select a service"
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {services.map((service) => (
            <SelectItem key={service.id} value={service.id}>
              {service.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {!showCreate ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="self-start"
          onClick={() => setShowCreate(true)}
        >
          + New service
        </Button>
      ) : (
        <div className="rounded-md border border-[var(--line)] p-3">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="new-service-name">Service name</FieldLabel>
              <Input
                id="new-service-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Cloudflare"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="new-service-website">Website</FieldLabel>
              <Input
                id="new-service-website"
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
                placeholder="https://"
              />
            </Field>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowCreate(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleCreate}
                disabled={isCreating || !name.trim()}
              >
                {isCreating ? "Creating..." : "Create & select"}
              </Button>
            </div>
          </FieldGroup>
        </div>
      )}
    </div>
  );
}
