# Publications — specification

Part of [`docs/technical-spec.md`](../technical-spec.md) — section numbers are
unchanged. This file holds §5.27 and the publications data model. Technology,
system boundaries, security, the route tree and the key workflows stay in the
hub. A plain `§N` below is in this file; a `§N` that lives in another file is
always a link.

**Also relevant:** the `publications` entitlement is a row in the matrix in
[§5.3](access-control.md#53-authentication-and-authorization); the section's
label is a lexicon term and its visibility a `page_visibility.*` row
([§6, "Multi-tenancy"](multi-tenancy.md#6-data-model--multi-tenancy)).

## 5.27 Publications

**Implemented in part** (#1470). A tenant publishes a periodic publication — a
zine, newsletter, magazine or lookbook — on its public site: an index of issues
at `/publications`, newest first, and one page per issue at
`/publications/<slug>`. #1471 is the module, the schema, the bucket and the
read-only public pages; the portal editor is #1472 and the reader enhancements
(lightbox, spreads, deep-link sharing) are #1473.

### Requirements

- **Its own section, gated twice.** The `publications` module decides whether a
  tenant has the section at all; the `publications` page-visibility slot, off
  by default, decides whether it is live. No migration turns the slot on: a
  tenant does, once it has published an issue.
- **The label is the tenant's word.** The route stays `/publications`; the nav
  label and headings are the `publication_plural` and `publication` lexicon
  terms ("Publications" / "Publication" by default). Chatter Snow's are "Zine".
- **A stable address per issue.** The slug is set by the tenant, unique within
  the tenant, lower-case words joined by hyphens, and frozen the first time the
  issue is published — printed copies and QR codes carry it. Unpublishing does
  not unfreeze it.
- **Pages are images, read in order.** A vertical scroll of lazy-loaded images
  with native pinch-zoom; each page is an `id="page-N"` anchor. No embedded PDF
  viewer and no page-turn library: both work badly on phones and with screen
  readers.
- **A real-text equivalent for every page** (WCAG 1.1.1, 1.4.5). Each page has
  short alt text and a transcript, rendered in a collapsible block beneath it
  and present in the server-rendered HTML. An issue cannot be published while
  any page lacks either, and a published issue cannot lose one; the database
  enforces both. Each issue also links to the organization's general email for
  alternative formats.
- **Sizes made once, at upload.** Supabase image transformations are Pro-only
  and Vercel's optimizer is metered, so the editor stores resized WebP copies
  beside each image and the public page builds `srcset` from them with a plain
  `<img>`.
- **PDFs are optional downloads**, never the reading source: a reading-order
  PDF ("Download PDF") and a print-ready, possibly imposed one ("Print at
  home"), each shown with its size.

## 6. Data model — Publications

- **`publications`** — one row per issue: `slug` (unique per tenant), `title`,
  `season_label`, `publish_date` (a calendar `date`, what the index sorts by),
  `blurb`, a cover (`cover_path`, `cover_width`, `cover_height`,
  `cover_renditions`), `status` (`draft` | `published`), `published_at` (set by
  the first publish, never cleared — what freezes the slug), and the optional
  `reading_pdf_*` / `print_pdf_*` path and byte-size pairs.
- **`publication_pages`** — one row per page: `position` (1-based reading order,
  unique per issue, deferred so an issue can be renumbered in one statement),
  `image_path`, `width`, `height`, `image_renditions`, `alt_text`,
  `transcript`. Composite foreign key to its issue by `(tenant_id, id)`.
- **Renditions** are `[{ "path", "width" }]` arrays of stored resizes. Every
  image and PDF column holds an object path in the public `publication-files`
  bucket (`{tenant_id}/{publication_id}/{file}`), never a URL.
- **Access.** Both tables are RLS-gated on the `publications` resource — View to
  read, Manage to write — and seeded from each role's `site_content` level.
  `anon` reads only through `public_publications` and
  `public_publication_pages`, definer views that serve published issues of the
  host's tenant while its module is on. `guard_publication_update()` and
  `guard_published_publication_pages()` hold the slug freeze and the
  alt-text-and-transcript rule.
- **Bucket.** `publication-files` is public (these are the public site's files),
  accepts JPEG, PNG, WebP and PDF up to 25 MiB, and admits writes only under the
  caller's own tenant folder, at `publications:manage`, and never from the demo
  tenant.
