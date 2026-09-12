"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDeleteButton } from "@/components/portal/confirm-delete-button";
import { useActionToast } from "@/components/portal/action-toast";
import { contentPackSlugify, type ContentPack } from "@/lib/content-packs";
import {
  deleteContentPackAction,
  saveContentPackAction,
  setArticleCategoryPackAction,
} from "./actions";

const ARTICLES = "/portal/website/articles";

/** One of this tenant's article categories, as the pack screen needs it. */
export type PackCategory = {
  id: string;
  slug: string;
  position: number;
  title: string;
  /** Whether anything of it is on the public site. Unpublished rows are not copied. */
  published: boolean;
  packId: string | null;
};

/**
 * The packs this platform offers, and what is in each (#895).
 *
 * A pack is a *label on the platform tenant's own articles*, not a separate
 * store of writing: the categories listed below are the same rows the Articles
 * screen edits. That is what keeps authoring a pack from being a second content
 * system — the platform writes articles exactly as any tenant does, and a pack
 * is the subset it is willing to hand over.
 */
export function PackManager({
  packs,
  categories,
  loadError,
}: {
  packs: readonly ContentPack[];
  categories: readonly PackCategory[];
  loadError: string | null;
}) {
  const router = useRouter();
  const { isPending, run } = useActionToast();
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [keyEdited, setKeyEdited] = useState(false);

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    run(
      () =>
        saveContentPackAction({
          key: key || contentPackSlugify(name),
          name,
          description: "",
          isOffered: false,
        }),
      {
        success: `${name} created.`,
        description:
          "Add categories to it, then offer it when the writing is ready.",
        onSuccess: () => {
          setName("");
          setKey("");
          setKeyEdited(false);
          router.refresh();
        },
      },
    );
  }

  return (
    <>
      <Link
        href={ARTICLES}
        className="app-muted inline-flex items-center gap-1 text-sm hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Articles
      </Link>

      <div className="mt-2 w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Content packs
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>

      <p className="app-muted mt-6 max-w-3xl text-sm leading-relaxed">
        Named sets of this tenant&rsquo;s article categories, offered to the
        other organizations on the platform. Adopting one gives that
        organization <em>its own copy</em>, as drafts, which it then owns — so a
        pack improved afterwards does not reach anybody who already took it.
        Only published categories and articles are copied.
      </p>

      {loadError && (
        <Alert variant="destructive" className="mt-6 max-w-3xl">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      <Card className="mt-6 max-w-3xl">
        <CardContent>
          <form className="space-y-4" onSubmit={handleCreate}>
            <Field>
              <FieldLabel htmlFor="new-pack-name">New pack</FieldLabel>
              <Input
                id="new-pack-name"
                value={name}
                placeholder="Snow sports basics"
                required
                onChange={(event) => {
                  setName(event.target.value);
                  if (!keyEdited)
                    setKey(contentPackSlugify(event.target.value));
                }}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="new-pack-key">Key</FieldLabel>
              <Input
                id="new-pack-key"
                value={key}
                placeholder="snow-sports-basics"
                required
                onChange={(event) => {
                  setKeyEdited(true);
                  setKey(contentPackSlugify(event.target.value));
                }}
              />
              <FieldDescription>
                How provisioning names this pack. It stays put once
                organizations have been told it exists.
              </FieldDescription>
            </Field>
            <Button type="submit" size="sm" disabled={isPending || !name}>
              {isPending ? <Spinner /> : <Plus />}
              Add pack
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="mt-6 max-w-3xl space-y-3">
        {packs.length === 0 && (
          <p className="app-muted text-sm italic">
            No packs yet. Nothing is offered to any organization until one is
            created and switched on.
          </p>
        )}

        {packs.map((pack) => (
          <PackCard
            key={pack.id}
            pack={pack}
            categories={categories}
            isPending={isPending}
            run={run}
            onChanged={() => router.refresh()}
          />
        ))}
      </div>
    </>
  );
}

function PackCard({
  pack,
  categories,
  isPending,
  run,
  onChanged,
}: {
  pack: ContentPack;
  categories: readonly PackCategory[];
  isPending: boolean;
  run: ReturnType<typeof useActionToast>["run"];
  onChanged: () => void;
}) {
  const [name, setName] = useState(pack.name);
  const [description, setDescription] = useState(pack.description);
  const members = categories.filter((entry) => entry.packId === pack.id);
  const publishable = members.filter((entry) => entry.published);
  const dirty = name !== pack.name || description !== pack.description;

  function save(isOffered: boolean) {
    run(
      () =>
        saveContentPackAction({
          id: pack.id,
          key: pack.key,
          name,
          description,
          isOffered,
        }),
      {
        success:
          isOffered === pack.isOffered
            ? `${name} saved.`
            : isOffered
              ? `${name} is now offered to other organizations.`
              : `${name} is no longer offered.`,
        onSuccess: onChanged,
      },
    );
  }

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{pack.name}</span>
              <Badge variant={pack.isOffered ? "default" : "secondary"}>
                {pack.isOffered ? "Offered" : "Not offered"}
              </Badge>
            </div>
            <p className="app-muted mt-1 text-sm">
              <code>{pack.key}</code> · {publishable.length} published{" "}
              {publishable.length === 1 ? "category" : "categories"}
              {members.length > publishable.length &&
                ` (${members.length - publishable.length} not published, so not copied)`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={pack.isOffered}
              disabled={isPending}
              aria-label={`Offer ${pack.name} to other organizations`}
              onCheckedChange={(checked) => save(Boolean(checked))}
            />
            <ConfirmDeleteButton
              label={`Remove ${pack.name}`}
              title={`Remove ${pack.name}?`}
              description="The categories in it stay exactly as they are and simply stop belonging to a pack. Organizations that already adopted it keep their copies."
              confirmLabel="Remove"
              pending={isPending}
              onConfirm={() =>
                run(() => deleteContentPackAction(pack.id), {
                  success: `${pack.name} removed.`,
                  onSuccess: onChanged,
                })
              }
            />
          </div>
        </div>

        {pack.isOffered && publishable.length === 0 && (
          <Alert variant="destructive">
            <AlertDescription>
              This pack is offered but nothing in it is published, so adopting
              it would copy nothing.
            </AlertDescription>
          </Alert>
        )}

        <Field>
          <FieldLabel htmlFor={`pack-name-${pack.id}`}>Name</FieldLabel>
          <Input
            id={`pack-name-${pack.id}`}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`pack-description-${pack.id}`}>
            Description
          </FieldLabel>
          <Textarea
            id={`pack-description-${pack.id}`}
            rows={2}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
          <FieldDescription>
            What an organization reads before deciding to adopt it.
          </FieldDescription>
        </Field>
        {dirty && (
          <Button
            type="button"
            size="sm"
            disabled={isPending || !name.trim()}
            onClick={() => save(pack.isOffered)}
          >
            {isPending && <Spinner />}
            Save
          </Button>
        )}

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">
            Categories in this pack
          </legend>
          {categories.length === 0 && (
            <p className="app-muted text-sm italic">
              This tenant has no article categories to offer yet.
            </p>
          )}
          {categories.map((category) => {
            const inThisPack = category.packId === pack.id;
            const inAnother = category.packId !== null && !inThisPack;
            return (
              <Field key={category.id} orientation="horizontal">
                <Checkbox
                  id={`pack-${pack.id}-category-${category.id}`}
                  checked={inThisPack}
                  // A category belongs to one pack, so the row that is spoken
                  // for elsewhere is shown and disabled rather than hidden:
                  // "where did that category go" is the question hiding it asks.
                  disabled={isPending || inAnother}
                  onCheckedChange={(checked) =>
                    run(
                      () =>
                        setArticleCategoryPackAction(
                          category.id,
                          checked ? pack.id : null,
                        ),
                      {
                        success: checked
                          ? `${category.title} added to ${pack.name}.`
                          : `${category.title} removed from ${pack.name}.`,
                        onSuccess: onChanged,
                      },
                    )
                  }
                />
                <FieldLabel
                  htmlFor={`pack-${pack.id}-category-${category.id}`}
                  className="font-normal"
                >
                  {category.title}
                  <span className="app-muted">
                    /learn/{category.slug}
                    {!category.published && " · not published"}
                    {inAnother && " · in another pack"}
                  </span>
                </FieldLabel>
              </Field>
            );
          })}
        </fieldset>
      </CardContent>
    </Card>
  );
}
