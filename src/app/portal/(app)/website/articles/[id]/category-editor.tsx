"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ExternalLink, Plus } from "lucide-react";
import { PortalBreadcrumbs } from "@/components/portal/breadcrumbs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDeleteButton } from "@/components/portal/confirm-delete-button";
import { useActionToast } from "@/components/portal/action-toast";
import {
  DiscardChangesDialog,
  useUnsavedChangesGuard,
} from "@/components/portal/unsaved-changes-guard";
import {
  articleSlugify,
  emptyArticleBody,
  type ArticleBody,
  type ArticleCategoryBody,
} from "@/lib/articles";
import { formatDateTime } from "@/lib/format";
import { useKeyedRows } from "../../use-keyed-rows";
import type { EditorArticle, EditorCategory } from "../article-shared";
import {
  discardArticleDraftsAction,
  publishArticleCategoryAction,
  saveArticleDraftsAction,
} from "../actions";
import { ArticleFields } from "./article-fields";

const ARTICLES = "/portal/website/articles";

/** One article as the form holds it: the two identity fields plus the body. */
type ArticleDraft = {
  /** Absent for an article added in this session. */
  id?: string;
  anchor: string;
  /** Whether the anchor still follows the title, as it does until edited. */
  anchorEdited: boolean;
  title: string;
  body: ArticleBody;
  publishedAt: string | null;
  publishedBy: string | null;
  hasDraft: boolean;
  unpublished: boolean;
};

function toDraft(article: EditorArticle): ArticleDraft {
  return {
    id: article.id,
    anchor: article.anchor,
    anchorEdited: true,
    title: article.body.title,
    body: article.body,
    publishedAt: article.publishedAt,
    publishedBy: article.publishedBy,
    hasDraft: article.hasDraft,
    unpublished: article.unpublished,
  };
}

function newDraft(): ArticleDraft {
  return {
    anchor: "",
    anchorEdited: false,
    title: "",
    body: emptyArticleBody(),
    publishedAt: null,
    publishedBy: null,
    hasDraft: true,
    unpublished: true,
  };
}

function signature(
  category: ArticleCategoryBody & { slug: string },
  articles: readonly ArticleDraft[],
): string {
  return JSON.stringify([
    category,
    articles.map((article) => [
      article.id ?? null,
      article.anchor,
      { ...article.body, title: article.title },
    ]),
  ]);
}

/**
 * One category and every article on it (#894).
 *
 * The whole page is one form and one save, because that is what publishing
 * does: `publish_article_category` moves a category and its articles in one
 * statement, so a reader never sees half a reordered page. It also means the
 * save can send the whole ordered list and let the server work out what was
 * added, moved and removed, instead of the browser tracking a delta.
 */
export function CategoryEditor({
  category,
  articles,
  canEdit,
}: {
  category: EditorCategory;
  articles: readonly EditorArticle[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const { isPending, run } = useActionToast();
  const [slug, setSlug] = useState(category.slug);
  const [body, setBody] = useState<ArticleCategoryBody>(category.body);
  const [drafts, setDrafts] = useState<ArticleDraft[]>(() =>
    articles.map(toDraft),
  );
  const rows = useKeyedRows(drafts, setDrafts);

  const initial = signature(
    { ...category.body, slug: category.slug },
    articles.map(toDraft),
  );
  const dirty = signature({ ...body, slug }, drafts) !== initial;
  const guard = useUnsavedChangesGuard(canEdit && dirty);
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  const unpublished =
    dirty || category.hasDraft || drafts.some((article) => article.hasDraft);

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    run(
      () =>
        saveArticleDraftsAction(
          { id: category.id, slug, value: body },
          drafts.map((article) => ({
            id: article.id,
            anchor: article.anchor || articleSlugify(article.title),
            value: { ...article.body, title: article.title },
          })),
        ),
      {
        success: "Draft saved.",
        description: "Publish the category to put it on the public site.",
        onSuccess: () => router.refresh(),
      },
    );
  }

  return (
    <>
      {/* The trail carries the guard the single back link used to (#948), and
          remembers which hop was intercepted so discarding lands where the
          reader was going rather than always on Articles. */}
      <PortalBreadcrumbs
        current={body.title || category.slug}
        onNavigate={(href, event) => {
          if (guard.allowOpenChange(false)) return;
          event.preventDefault();
          setPendingHref(href);
        }}
      />

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="brand-display text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
          {body.title || category.slug}
        </h1>
        {category.unpublished ? (
          <Badge variant="secondary">Not published</Badge>
        ) : (
          unpublished && <Badge variant="secondary">Unpublished changes</Badge>
        )}
      </div>
      <div className="rainbow-accent mt-3 w-fit min-w-24" />

      <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed">
        {category.publishedAt ? (
          <>
            Published {formatDateTime(category.publishedAt)}
            {category.publishedBy ? ` by ${category.publishedBy}` : ""}.{" "}
            <Link
              href={`/learn/${category.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 underline underline-offset-4"
            >
              View on the site
              <ExternalLink className="size-3" />
            </Link>
          </>
        ) : (
          "Nothing on this page has reached the public site yet."
        )}
      </p>

      {!canEdit && (
        <Alert className="mt-6 max-w-3xl">
          <AlertDescription>
            You can read this page but not change it.
          </AlertDescription>
        </Alert>
      )}

      <form className="mt-6 max-w-3xl space-y-6" onSubmit={handleSave}>
        <fieldset disabled={!canEdit || isPending} className="space-y-6">
          <Card>
            <CardContent className="space-y-4">
              <Field>
                <FieldLabel htmlFor="category-title">Title</FieldLabel>
                <Input
                  id="category-title"
                  value={body.title}
                  required
                  onChange={(event) =>
                    setBody({ ...body, title: event.target.value })
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="category-description">
                  Description
                </FieldLabel>
                <Textarea
                  id="category-description"
                  value={body.description}
                  rows={3}
                  onChange={(event) =>
                    setBody({ ...body, description: event.target.value })
                  }
                />
                <FieldDescription>
                  Shown on the card for this category on the Learn index, and
                  under its heading on its own page.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="category-slug">Web address</FieldLabel>
                <Input
                  id="category-slug"
                  value={slug}
                  required
                  onChange={(event) =>
                    setSlug(articleSlugify(event.target.value))
                  }
                />
                <FieldDescription>
                  The page is at /learn/{slug || "…"}. Unlike the words, this
                  takes effect as soon as you save, because an address that
                  changes on publish breaks inbound links either way — so change
                  it before anyone is linking to the page.
                </FieldDescription>
              </Field>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between gap-2">
            <FieldTitle>Articles</FieldTitle>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => rows.add(newDraft())}
            >
              <Plus />
              Add article
            </Button>
          </div>

          {rows.rows.length === 0 && (
            <p className="app-muted text-sm italic">
              No articles yet. The category page renders its heading and
              description with nothing under it.
            </p>
          )}

          {rows.rows.map((row, index) => {
            const article = row.value;
            const name = article.title.trim() || `Article ${index + 1}`;
            const anchor = article.anchor || articleSlugify(article.title);
            return (
              <Card key={row.id}>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="app-eyebrow">{name}</span>
                      {article.unpublished && (
                        <Badge variant="secondary">Not published</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Move ${name} up`}
                        disabled={index === 0}
                        onClick={() => rows.move(row.id, -1)}
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Move ${name} down`}
                        disabled={index === rows.rows.length - 1}
                        onClick={() => rows.move(row.id, 1)}
                      >
                        <ArrowDown />
                      </Button>
                      <ConfirmDeleteButton
                        label={`Remove ${name}`}
                        title={`Remove ${name}?`}
                        description={
                          article.unpublished
                            ? "This article has never been published, so removing it here and saving drops it."
                            : "This stages its removal. It comes off the public site when you publish the category."
                        }
                        confirmLabel="Remove"
                        onConfirm={() => rows.remove(row.id)}
                      />
                    </div>
                  </div>

                  <Field>
                    <FieldLabel htmlFor={`${row.id}-title`}>Title</FieldLabel>
                    <Input
                      id={`${row.id}-title`}
                      value={article.title}
                      required
                      onChange={(event) =>
                        rows.update(row.id, {
                          ...article,
                          title: event.target.value,
                          anchor: article.anchorEdited
                            ? article.anchor
                            : articleSlugify(event.target.value),
                        })
                      }
                    />
                  </Field>

                  <Field>
                    <FieldLabel htmlFor={`${row.id}-anchor`}>
                      Link address
                    </FieldLabel>
                    <Input
                      id={`${row.id}-anchor`}
                      value={article.anchor}
                      onChange={(event) =>
                        rows.update(row.id, {
                          ...article,
                          anchorEdited: true,
                          anchor: articleSlugify(event.target.value),
                        })
                      }
                    />
                    <FieldDescription>
                      /learn/{slug || "…"}#{anchor || "…"} — what the list of
                      articles at the top of the page links to.
                    </FieldDescription>
                  </Field>

                  <ArticleFields
                    idPrefix={row.id}
                    body={article.body}
                    onChange={(next) =>
                      rows.update(row.id, { ...article, body: next })
                    }
                  />
                </CardContent>
              </Card>
            );
          })}
        </fieldset>

        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={isPending || !dirty}>
              {isPending && <Spinner />}
              Save draft
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={isPending || dirty || !unpublished}
              onClick={() =>
                run(() => publishArticleCategoryAction(category.id), {
                  success: `${body.title || category.slug} published.`,
                  onSuccess: () => router.refresh(),
                })
              }
            >
              Publish
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={isPending || !unpublished}
              onClick={() =>
                run(() => discardArticleDraftsAction(category.id), {
                  success: "Draft discarded.",
                  onSuccess: () => router.refresh(),
                })
              }
            >
              Discard draft
            </Button>
            {dirty && (
              <span className="app-muted text-xs">
                Save before publishing — publishing only moves what is saved.
              </span>
            )}
          </div>
        )}
      </form>

      <DiscardChangesDialog
        guard={guard}
        subject="this category"
        onDiscard={() => router.push(pendingHref ?? ARTICLES)}
      />
    </>
  );
}
