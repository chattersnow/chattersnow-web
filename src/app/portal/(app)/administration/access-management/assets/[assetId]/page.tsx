import { redirect } from "next/navigation";

/** Moved with the rest of the section in #943. */
export default async function AccessManagementAssetMovedPage({
  params,
}: {
  params: Promise<{ assetId: string }>;
}) {
  const { assetId } = await params;
  redirect(`/portal/technology/assets/${assetId}`);
}
