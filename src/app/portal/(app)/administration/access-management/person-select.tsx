"use client";

import type { PersonListItem } from "../../people/actions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const NONE_VALUE = "__none__";

export function PersonSelect({
  id,
  people,
  value,
  onChange,
  placeholder = "Select a person",
}: {
  id: string;
  people: PersonListItem[];
  value: string | null;
  onChange: (personId: string | null) => void;
  placeholder?: string;
}) {
  return (
    <Select
      value={value ?? NONE_VALUE}
      onValueChange={(next) =>
        onChange(next === NONE_VALUE ? null : (next ?? null))
      }
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder={placeholder}>
          {(current: string) =>
            current === NONE_VALUE
              ? "None"
              : (people.find((person) => person.id === current)?.name ?? "—")
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE_VALUE}>None</SelectItem>
        {people.map((person) => (
          <SelectItem key={person.id} value={person.id}>
            {person.name ?? person.email ?? "—"}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
