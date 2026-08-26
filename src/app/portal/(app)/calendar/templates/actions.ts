"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseTemplateForm, parseTemplateFieldsForm } from "./template-form";
import { checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";
import { friendlyError } from "@/lib/db-errors";
import type { ActiveContentBriefTemplate } from "../content-brief-template-shared";

export type TemplateActionResult = { error: string } | { success: true };

export async function createTemplateAction(
  formData: FormData,
): Promise<TemplateActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to create a template.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "content_calendar",
    "manage",
  );
  if (permissionError) return permissionError;

  const parsedTemplate = parseTemplateForm(formData);
  if ("error" in parsedTemplate) return parsedTemplate;
  const parsedFields = parseTemplateFieldsForm(formData);
  if ("error" in parsedFields) return parsedFields;

  const { data: template, error: templateError } = await supabase
    .from("content_brief_templates")
    .insert({
      key: parsedTemplate.data.key,
      name: parsedTemplate.data.name,
      description: parsedTemplate.data.description,
      is_active: parsedTemplate.data.isActive,
      requires_consent: parsedTemplate.data.requiresConsent,
    })
    .select("id")
    .single();

  if (templateError || !template) {
    return {
      error: friendlyError(
        templateError ?? {},
        "A template with this key already exists.",
        "Could not create the template. Please try again.",
      ),
    };
  }

  const { data: version, error: versionError } = await supabase
    .from("content_brief_template_versions")
    .insert({ template_id: template.id, version: 1, fields: parsedFields.data })
    .select("id")
    .single();

  if (versionError || !version) {
    return { error: "Could not save the template's fields. Please try again." };
  }

  const { error: pointerError } = await supabase
    .from("content_brief_templates")
    .update({ current_version_id: version.id })
    .eq("id", template.id);

  if (pointerError) {
    return {
      error: "Could not finish creating the template. Please try again.",
    };
  }

  revalidatePath("/portal/calendar/templates");
  return { success: true };
}

export async function updateTemplateMetadataAction(
  id: string,
  formData: FormData,
): Promise<TemplateActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to update a template.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "content_calendar",
    "manage",
  );
  if (permissionError) return permissionError;

  const parsed = parseTemplateForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase
    .from("content_brief_templates")
    .update({
      key: parsed.data.key,
      name: parsed.data.name,
      description: parsed.data.description,
      is_active: parsed.data.isActive,
      requires_consent: parsed.data.requiresConsent,
    })
    .eq("id", id);

  if (error) {
    return {
      error: friendlyError(
        error,
        "A template with this key already exists.",
        "Could not update the template. Please try again.",
      ),
    };
  }

  revalidatePath("/portal/calendar/templates");
  return { success: true };
}

/**
 * Revises a template's field structure: always inserts a new version row
 * and repoints current_version_id at it. Never updates an existing version
 * row, so a content_opportunities brief already pinned to an earlier
 * version keeps rendering that version's fields unchanged.
 */
export async function publishTemplateVersionAction(
  templateId: string,
  formData: FormData,
): Promise<TemplateActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to revise a template.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "content_calendar",
    "manage",
  );
  if (permissionError) return permissionError;

  const parsed = parseTemplateFieldsForm(formData);
  if ("error" in parsed) return parsed;

  const { data: latest, error: latestError } = await supabase
    .from("content_brief_template_versions")
    .select("version")
    .eq("template_id", templateId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) {
    return { error: "Could not load the template's version history." };
  }

  const nextVersion = (latest?.version ?? 0) + 1;

  const { data: version, error: versionError } = await supabase
    .from("content_brief_template_versions")
    .insert({
      template_id: templateId,
      version: nextVersion,
      fields: parsed.data,
    })
    .select("id")
    .single();

  if (versionError || !version) {
    return { error: "Could not save the revised fields. Please try again." };
  }

  const { error: pointerError } = await supabase
    .from("content_brief_templates")
    .update({ current_version_id: version.id })
    .eq("id", templateId);

  if (pointerError) {
    return {
      error: "Could not publish the revised template. Please try again.",
    };
  }

  revalidatePath("/portal/calendar/templates");
  revalidatePath("/portal/calendar");
  return { success: true };
}

export async function listActiveContentBriefTemplatesAction(): Promise<
  { data: ActiveContentBriefTemplate[] } | { error: string }
> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "content_calendar",
    "view",
  );
  if (permissionError) return permissionError;

  const { data, error } = await supabase
    .from("content_brief_templates")
    .select(
      "id, key, name, description, requires_consent, current_version_id, content_brief_template_versions!content_brief_templates_current_version_id_fkey(id, version, fields)",
    )
    .eq("is_active", true)
    .not("current_version_id", "is", null)
    .order("name", { ascending: true });

  if (error) {
    return {
      error: "Could not load content brief templates. Please try again.",
    };
  }

  const templates: ActiveContentBriefTemplate[] = (data ?? []).flatMap(
    (row) => {
      const r = row as unknown as {
        id: string;
        key: string;
        name: string;
        description: string | null;
        requires_consent: boolean;
        content_brief_template_versions: {
          id: string;
          version: number;
          fields: ActiveContentBriefTemplate["fields"];
        } | null;
      };
      if (!r.content_brief_template_versions) return [];
      return [
        {
          id: r.id,
          key: r.key,
          name: r.name,
          description: r.description,
          requires_consent: r.requires_consent,
          version_id: r.content_brief_template_versions.id,
          version: r.content_brief_template_versions.version,
          fields: r.content_brief_template_versions.fields,
        },
      ];
    },
  );

  return { data: templates };
}
