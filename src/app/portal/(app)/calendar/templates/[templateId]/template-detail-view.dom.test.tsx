import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import type { TemplateListRow } from "../template-shared";
import { TemplateDetailView } from "./template-detail-view";

function makeTemplate(
  overrides: Partial<TemplateListRow> = {},
): TemplateListRow {
  return {
    id: "template-1",
    key: "community_spotlight",
    name: "Community spotlight",
    description: "Celebrate a community member.",
    is_active: true,
    requires_consent: true,
    version: 2,
    fields: [
      { key: "person", label: "Person or group", help_text: "Who is it?" },
      { key: "consent", label: "Permission to publish", help_text: null },
    ],
    ...overrides,
  };
}

describe("TemplateDetailView", () => {
  test("shows the template's details and pinned field list in flat cards", () => {
    render(<TemplateDetailView template={makeTemplate()} canManage />);

    expect(
      screen.getByRole("heading", { name: "Community spotlight" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Template details")).toBeInTheDocument();
    expect(screen.getByText("Current fields (v2)")).toBeInTheDocument();
    expect(screen.getByText("community_spotlight")).toBeInTheDocument();
    expect(
      screen.getByText("Celebrate a community member."),
    ).toBeInTheDocument();
    expect(screen.getByText("Person or group")).toBeInTheDocument();
    expect(screen.getByText(/Who is it\?/)).toBeInTheDocument();
  });

  test("offers both edit sheets to content-calendar managers", () => {
    render(<TemplateDetailView template={makeTemplate()} canManage />);

    expect(
      screen.getByRole("button", { name: "Edit details" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Revise fields" }),
    ).toBeInTheDocument();
  });

  test("hides the edit affordances without manage access", () => {
    render(<TemplateDetailView template={makeTemplate()} canManage={false} />);

    expect(
      screen.queryByRole("button", { name: "Edit details" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Revise fields" }),
    ).not.toBeInTheDocument();
  });
});
