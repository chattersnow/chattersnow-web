// #430: opening a message deep-linked from the "new messages" dashboard
// notification (?status=new) marks it read, which used to drop it straight
// out of the status-filtered table even though it was just viewed. These
// tests exercise MessagesTable's sticky-filter behavior end to end (rather
// than the use-sticky-status-filter hook in isolation) since the bug only
// shows up in how the table's prop-driven `messages` re-renders interact
// with the filter -- mirroring how the real page passes a freshly-fetched
// `messages` array after the details sheet's router.refresh().
import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ContactMessage } from "./message-types";
import { MessagesTable } from "./messages-table";

function makeMessage(overrides: Partial<ContactMessage> = {}): ContactMessage {
  return {
    id: "msg-1",
    name: "Drew Sato",
    email: "drew.sato@example.test",
    topic: "general",
    message: "Hello!",
    status: "new",
    created_at: "2026-05-01T00:00:00.000Z",
    ...overrides,
  };
}

async function openStatusFilter(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /^Filters/ }));
  await user.click(
    await screen.findByRole("combobox", { name: "Filter by status" }),
  );
}

describe("MessagesTable", () => {
  test("shows an empty state when there are no messages", () => {
    render(<MessagesTable messages={[]} canManage={true} />);
    expect(screen.getByText("No messages yet")).toBeInTheDocument();
  });

  test("without a pinned filter, statuses filter normally as they change", () => {
    const newMsg = makeMessage({ id: "new-1", name: "New Person" });
    const resolvedMsg = makeMessage({
      id: "resolved-1",
      name: "Resolved Person",
      status: "resolved",
    });

    const { rerender } = render(
      <MessagesTable messages={[newMsg, resolvedMsg]} canManage={true} />,
    );

    expect(screen.getByText("New Person")).toBeInTheDocument();
    expect(screen.getByText("Resolved Person")).toBeInTheDocument();

    // No filter is pinned, so a message moving between statuses is just a
    // normal row update -- nothing should be "stuck" visible.
    rerender(
      <MessagesTable
        messages={[{ ...newMsg, status: "read" }, resolvedMsg]}
        canManage={true}
      />,
    );

    expect(screen.getByText("New Person")).toBeInTheDocument();
    expect(screen.getByText("Resolved Person")).toBeInTheDocument();
  });

  test("a message opened from a ?status=new deep link stays visible after being marked read", () => {
    const deepLinked = makeMessage({ id: "deep-linked", name: "Deep Linked" });
    const otherNew = makeMessage({ id: "other-new", name: "Other New" });
    const resolved = makeMessage({
      id: "resolved-1",
      name: "Already Resolved",
      status: "resolved",
    });

    const { rerender } = render(
      <MessagesTable
        messages={[deepLinked, otherNew, resolved]}
        canManage={true}
        initialStatusFilter="new"
      />,
    );

    // Pinned to `new`: only the two new messages show.
    expect(screen.getByText("Deep Linked")).toBeInTheDocument();
    expect(screen.getByText("Other New")).toBeInTheDocument();
    expect(screen.queryByText("Already Resolved")).not.toBeInTheDocument();

    // Simulate MessageDetailsSheet auto-marking `deepLinked` read and the
    // page refreshing with the new server data. `initialStatusFilter` is
    // unchanged (still the same "new messages" deep link).
    rerender(
      <MessagesTable
        messages={[{ ...deepLinked, status: "read" }, otherNew, resolved]}
        canManage={true}
        initialStatusFilter="new"
      />,
    );

    // The just-read message stays visible (sticky); the untouched "new"
    // message and the never-matching resolved one behave as before.
    expect(screen.getByText("Deep Linked")).toBeInTheDocument();
    expect(screen.getByText("Other New")).toBeInTheDocument();
    expect(screen.queryByText("Already Resolved")).not.toBeInTheDocument();
  });

  test("explicitly changing the status filter drops the sticky message", async () => {
    const user = userEvent.setup();
    const deepLinked = makeMessage({ id: "deep-linked", name: "Deep Linked" });
    const resolved = makeMessage({
      id: "resolved-1",
      name: "Already Resolved",
      status: "resolved",
    });

    const { rerender } = render(
      <MessagesTable
        messages={[deepLinked, resolved]}
        canManage={true}
        initialStatusFilter="new"
      />,
    );

    rerender(
      <MessagesTable
        messages={[{ ...deepLinked, status: "read" }, resolved]}
        canManage={true}
        initialStatusFilter="new"
      />,
    );
    expect(screen.getByText("Deep Linked")).toBeInTheDocument();

    // The user explicitly switches the filter to "resolved" -- the pin (and
    // its stickiness) is released, so only resolved messages show now.
    await openStatusFilter(user);
    await user.click(await screen.findByRole("option", { name: "resolved" }));

    expect(screen.queryByText("Deep Linked")).not.toBeInTheDocument();
    expect(screen.getByText("Already Resolved")).toBeInTheDocument();
  });

  test("a new deep link (changed initialStatusFilter prop) resets the previous sticky pin", () => {
    const deepLinked = makeMessage({ id: "deep-linked", name: "Deep Linked" });
    const readMsg = makeMessage({
      id: "read-1",
      name: "Already Read",
      status: "read",
    });

    const { rerender } = render(
      <MessagesTable
        messages={[deepLinked, readMsg]}
        canManage={true}
        initialStatusFilter="new"
      />,
    );

    rerender(
      <MessagesTable
        messages={[{ ...deepLinked, status: "read" }, readMsg]}
        canManage={true}
        initialStatusFilter="new"
      />,
    );
    expect(screen.getByText("Deep Linked")).toBeInTheDocument();

    // Next.js re-renders this same component in place when the URL changes
    // to a new deep link (e.g. following a different notification) rather
    // than remounting it.
    rerender(
      <MessagesTable
        messages={[{ ...deepLinked, status: "read" }, readMsg]}
        canManage={true}
        initialStatusFilter="read"
      />,
    );

    expect(screen.getByText("Deep Linked")).toBeInTheDocument();
    expect(screen.getByText("Already Read")).toBeInTheDocument();
  });

  test("search still narrows within the pinned, sticky-filtered set", async () => {
    const user = userEvent.setup();
    const deepLinked = makeMessage({
      id: "deep-linked",
      name: "Deep Linked",
      email: "deep@example.test",
    });
    const otherNew = makeMessage({
      id: "other-new",
      name: "Other New",
      email: "other@example.test",
    });

    const { rerender } = render(
      <MessagesTable
        messages={[deepLinked, otherNew]}
        canManage={true}
        initialStatusFilter="new"
      />,
    );
    rerender(
      <MessagesTable
        messages={[{ ...deepLinked, status: "read" }, otherNew]}
        canManage={true}
        initialStatusFilter="new"
      />,
    );

    await user.click(screen.getByRole("button", { name: /^Filters/ }));
    await user.type(
      await screen.findByLabelText("Search"),
      "deep@example.test",
    );

    expect(screen.getByText("Deep Linked")).toBeInTheDocument();
    expect(screen.queryByText("Other New")).not.toBeInTheDocument();
  });
});
