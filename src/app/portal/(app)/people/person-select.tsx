"use client";

import { personDisplayName } from "@/lib/format";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const NONE_VALUE = "__none__";

/**
 * Bounded person picker: a Select over a list the caller has already
 * restricted, for cases where the eligible set is small enough to browse and
 * the caller may not have `people:view` at all (so PersonPicker, which reads
 * the whole directory, can't be used).
 *
 * The option type is structural rather than PersonListItem so a caller can
 * pass any row carrying a name -- e.g. the calendar's CalendarOwner, which
 * has no phone to offer.
 */
export type PersonSelectOption = {
  id: string;
  name: string | null;
  email: string | null;
  preferred_name?: string | null;
};

export function PersonSelect({
  id,
  people,
  value,
  onChange,
  placeholder = "Select a person",
  noneLabel = "None",
}: {
  id: string;
  people: PersonSelectOption[];
  value: string | null;
  onChange: (personId: string | null) => void;
  placeholder?: string;
  noneLabel?: string;
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
              ? noneLabel
              : personDisplayName(
                  people.find((person) => person.id === current),
                )
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE_VALUE}>{noneLabel}</SelectItem>
        {people.map((person) => (
          <SelectItem key={person.id} value={person.id}>
            {personDisplayName(person)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
