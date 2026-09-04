"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PersonPicker, type PickedPerson } from "../person-picker";
import type { PersonListItem } from "../actions";

/**
 * Entry point to the merge review for an arbitrary pair.
 *
 * The Duplicates queue only lists records that share an address, and once the
 * unique index is on (20260904190000) nothing can. The case that outlives it is
 * one person who signed up twice under two different addresses, which only a
 * human can spot -- so the merge has to be reachable from the record itself,
 * not just from the queue.
 */
export function MergeCard({
  personId,
  people,
}: {
  personId: string;
  people: PersonListItem[];
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<PickedPerson | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Merge a duplicate</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <p className="app-muted text-sm">
          Pick the record that is the same person as this one. Everything on it
          moves here, and it is then deleted. You will see what moves before
          anything happens.
        </p>
        <PersonPicker
          people={people}
          selected={picked}
          onSelect={setPicked}
          onPersonCreated={() => {}}
          allowCreate={false}
          placeholder="Search for the duplicate record..."
        />
        <div>
          <Button
            disabled={!picked}
            onClick={() =>
              router.push(
                `/portal/people/duplicates?survivor=${personId}&duplicate=${picked!.id}`,
              )
            }
          >
            Review merge
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
