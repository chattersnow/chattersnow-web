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

**Implemented** (#1470). A tenant publishes a periodic publication — a
zine, newsletter, magazine or lookbook — on its public site: an index of issues
at `/publications`, newest first, and one page per issue at
`/publications/<slug>`. #1471 is the module, the schema, the bucket and the
read-only public pages; #1472 is the portal editor, under Website →
Publications; the reader enhancements (lightbox, spreads, deep-link sharing)
are #1473.

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
- **A reader around the pages** (#1473), none of which takes over scrolling or
  zoom, and without which the page is still the plain scroll:
  - a sticky "Page N of M" counter, taken from the page crossing a line 40%
    down the viewport;
  - the address follows the reader as `#page-N` through
    `history.replaceState`, so Back still leaves the issue, and opening a
    `#page-N` link lands on that page;
  - **Share** offers the issue at the current page through the Web Share API,
    or copies the link where there is none;
  - a full-screen view (`yet-another-react-lightbox` with its zoom,
    thumbnails and counter plugins, loaded on first use) opens on the page
    that was tapped or on its own button, pages with swipe, the arrow keys,
    Home and End, and closes onto the page the reader ended on;
  - on wide screens (`lg`), **Single** or **Spread**: the cover alone, then
    2–3, 4–5 and so on, and the back cover alone, remembered per browser in
    `localStorage`. Phones always get single pages.
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
  "Print at home" carries the `publications.print_instructions` Site Content
  block, folding instructions shared by every issue.
- **Edited in the portal, one issue at a time.** Website → Publications lists
  the issues and starts a draft; each issue is one object on its own page, so
  it has no tabs. The editor holds the details (title, season label, publish
  date, blurb, cover), the pages and the two PDFs. The web address is suggested
  as `<season>-<yyyy>` and read-only once the issue has been published.
- **Pages go in as scans, in order.** Several JPEG or PNG files at once, added
  in filename order (numbers compared as numbers), then reordered by drag or by
  the up/down buttons, which are the keyboard's way. The browser resizes each
  page to WebP at about 480, 960 and 1600 px wide (JPEG where the browser
  cannot encode WebP) and uploads those; the scan itself is never stored.
- **Save writes the whole issue at once.** Files upload when picked; the rows
  are written on Save, through `save_publication()`, in one transaction.
  Publishing moves only what is saved, and the editor shows how many pages
  still lack alt text or a transcript.
- **Drafts are previewed where they will live.** A signed-in editor of the
  tenant the host serves sees a draft at `/publications/<slug>`, marked as a
  preview and not indexed, even while the section is hidden. Nobody else does.
- **Nothing is deleted by hand.** A removed page, a replaced cover or PDF and
  every file of a deleted issue are collected by the daily orphan sweep
  (`/api/cron/gear-photo-purge`) once a day old and unreferenced.

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
  alt-text-and-transcript rule. `save_publication(id, issue, pages)` (#1472)
  writes an issue's details and its ordered page list in one transaction, with
  invoker rights, so RLS and those guards decide what it may write.
- **Bucket.** `publication-files` is public (these are the public site's files),
  accepts JPEG, PNG, WebP and PDF up to 25 MiB, and admits writes only under the
  caller's own tenant folder, at `publications:manage`, and never from the demo
  tenant.
