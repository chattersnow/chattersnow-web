"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  parseAgendaForm,
  type AgendaOngoingItem,
  type AgendaUpcomingDate,
} from "./agenda-form";
import { checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";
import type {
  ActiveAgendaTemplate,
  AgendaTemplateSection,
} from "./agenda-template-shared";

export type Agenda = {
  id: string;
  meeting_id: string;
  external_link: string | null;
  body_text: string | null;
  template_id: string | null;
  template_version_id: string | null;
  ongoing_items: Record<string, AgendaOngoingItem>;
  new_business: string[];
  parking_lot: string[];
  upcoming_dates: AgendaUpcomingDate[];
  next_meeting_date: string | null;
  next_meeting_topics: string | null;
  template_sections: AgendaTemplateSection[];
};

export type AgendaActionResult = { error: string } | { success: true };

export async function getAgendaAction(
  meetingId: string,
): Promise<{ data: Agenda | null } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "governance",
    "manage",
  );
  if (permissionError) return permissionError;

  const { data, error } = await supabase
    .from("agendas")
    .select(
      "id, meeting_id, external_link, body_text, template_id, template_version_id, ongoing_items, new_business, parking_lot, upcoming_dates, next_meeting_date, next_meeting_topics, agenda_template_versions!agendas_template_version_id_fkey(sections)",
    )
    .eq("meeting_id", meetingId)
    .maybeSingle();

  if (error) {
    return { error: "Could not load the agenda. Please try again." };
  }
  if (!data) return { data: null };

  const row = data as unknown as {
    id: string;
    meeting_id: string;
    external_link: string | null;
    body_text: string | null;
    template_id: string | null;
    template_version_id: string | null;
    ongoing_items: Record<string, AgendaOngoingItem> | null;
    new_business: string[] | null;
    parking_lot: string[] | null;
    upcoming_dates: AgendaUpcomingDate[] | null;
    next_meeting_date: string | null;
    next_meeting_topics: string | null;
    agenda_template_versions: { sections: AgendaTemplateSection[] } | null;
  };

  return {
    data: {
      id: row.id,
      meeting_id: row.meeting_id,
      external_link: row.external_link,
      body_text: row.body_text,
      template_id: row.template_id,
      template_version_id: row.template_version_id,
      ongoing_items: row.ongoing_items ?? {},
      new_business: row.new_business ?? [],
      parking_lot: row.parking_lot ?? [],
      upcoming_dates: row.upcoming_dates ?? [],
      next_meeting_date: row.next_meeting_date,
      next_meeting_topics: row.next_meeting_topics,
      template_sections: row.agenda_template_versions?.sections ?? [],
    },
  };
}

export async function upsertAgendaAction(
  meetingId: string,
  formData: FormData,
): Promise<AgendaActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to update the agenda.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "governance",
    "manage",
  );
  if (permissionError) return permissionError;

  const parsed = parseAgendaForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase
    .from("agendas")
    .upsert(
      { meeting_id: meetingId, ...parsed.data },
      { onConflict: "meeting_id" },
    );

  if (error) {
    return { error: "Could not save the agenda. Please try again." };
  }

  revalidatePath("/portal/governance/meetings");
  return { success: true };
}

export async function listActiveAgendaTemplatesAction(): Promise<
  { data: ActiveAgendaTemplate[] } | { error: string }
> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "governance", "view");
  if (permissionError) return permissionError;

  const { data, error } = await supabase
    .from("agenda_templates")
    .select(
      "id, key, name, description, agenda_template_versions!agenda_templates_current_version_id_fkey(id, version, sections)",
    )
    .eq("is_active", true)
    .not("current_version_id", "is", null)
    .order("name", { ascending: true });

  if (error) {
    return { error: "Could not load agenda templates. Please try again." };
  }

  const templates: ActiveAgendaTemplate[] = (data ?? []).flatMap((row) => {
    const r = row as unknown as {
      id: string;
      key: string;
      name: string;
      description: string | null;
      agenda_template_versions: {
        id: string;
        version: number;
        sections: AgendaTemplateSection[];
      } | null;
    };
    if (!r.agenda_template_versions) return [];
    return [
      {
        id: r.id,
        key: r.key,
        name: r.name,
        description: r.description,
        version_id: r.agenda_template_versions.id,
        version: r.agenda_template_versions.version,
        sections: r.agenda_template_versions.sections,
      },
    ];
  });

  return { data: templates };
}
