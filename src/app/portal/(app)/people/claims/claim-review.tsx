"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { personDisplayName } from "@/lib/format";
import { reviewClaimAction, type ClaimCandidate } from "./actions";

/**
 * How strong a candidate is, said in words rather than as a number.
 *
 * A reviewer is deciding whether to hand one person another person's giving
 * history, and "0.62" is not a basis for that. The tier is: a verified email
 * is an identifier the claimant proved they control, a handle is one they
 * typed, and a name is a resemblance.
 */
const TIER_COPY: Record<
  ClaimCandidate["tier"],
  { label: string; hint: string }
> = {
  email: {
    label: "Verified email",
    hint: "This account has proved it controls this address.",
  },
  instagram: {
    label: "Instagram handle",
    hint: "The handle they gave matches this record.",
  },
  name: {
    label: "Similar name",
    hint: "A resemblance only. Check something else before linking.",
  },
};

export function ClaimReview({
  claimId,
  candidates,
}: {
  claimId: string;
  candidates: ClaimCandidate[];
}) {
  const router = useRouter();
  // Never preselected, not even a lone verified-email match. Approving hands
  // over a person's history, so it is always an act rather than a default --
  // and the name tier is exactly where a preselected radio would get clicked
  // through.
  const [picked, setPicked] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);

  async function review(approve: boolean) {
    setError(null);
    setBusy(approve ? "approve" : "reject");
    const result = await reviewClaimAction({
      claimId,
      approve,
      personId: approve ? picked : null,
      note,
    });
    setBusy(null);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {candidates.length === 0 ? (
        <p className="app-muted text-sm">
          Nothing in the directory resembles what they told us. Approving will
          create a new record for them.
        </p>
      ) : (
        <ul className="space-y-2">
          {candidates.map((candidate) => {
            const copy = TIER_COPY[candidate.tier];
            const disabled = candidate.already_linked;
            return (
              <li key={candidate.person_id}>
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                    picked === candidate.person_id
                      ? "border-[var(--purple)]"
                      : "border-[var(--line)]"
                  } ${disabled ? "opacity-60" : ""}`}
                >
                  <input
                    type="radio"
                    name={`candidate-${claimId}`}
                    className="mt-1"
                    disabled={disabled}
                    checked={picked === candidate.person_id}
                    onChange={() => setPicked(candidate.person_id)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {personDisplayName(candidate)}
                      </span>
                      <Badge
                        variant={
                          candidate.tier === "name" ? "outline" : "secondary"
                        }
                      >
                        {copy.label}
                      </Badge>
                      {disabled && (
                        <Badge variant="outline">Already has an account</Badge>
                      )}
                    </span>
                    <span className="app-muted mt-1 block text-sm">
                      {candidate.email ?? "No email on file"}
                      {candidate.instagram_handle
                        ? ` · @${candidate.instagram_handle}`
                        : ""}
                    </span>
                    <span className="app-muted block text-xs">{copy.hint}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      <Input
        aria-label="Note about this decision"
        placeholder="Note (optional) — what you checked, or why not"
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => review(true)} disabled={busy !== null}>
          {busy === "approve" ? <Spinner /> : null}
          {picked ? "Link to this record" : "Approve as a new person"}
        </Button>
        <Button
          variant="outline"
          onClick={() => review(false)}
          disabled={busy !== null}
        >
          {busy === "reject" ? <Spinner /> : null}
          Reject
        </Button>
      </div>
    </div>
  );
}
