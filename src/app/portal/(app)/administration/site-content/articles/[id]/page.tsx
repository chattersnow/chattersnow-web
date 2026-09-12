import { redirect } from "next/navigation";

/** Moved with the rest of the section in #944. */
export default async function SiteContentArticleMovedPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/portal/website/articles/${id}`);
}
