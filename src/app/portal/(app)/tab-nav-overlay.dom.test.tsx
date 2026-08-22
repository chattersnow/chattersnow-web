import { describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";

const useLinkStatusMock = mock(() => ({ pending: false }));

mock.module("next/link", () => ({
  useLinkStatus: useLinkStatusMock,
}));

const { TabNavOverlay } = await import("./tab-nav-overlay");

describe("TabNavOverlay", () => {
  test("renders nothing when no navigation is pending", () => {
    useLinkStatusMock.mockReturnValue({ pending: false });
    const { container } = render(<TabNavOverlay />);
    expect(container).toBeEmptyDOMElement();
  });

  test("shows a spinner overlay while navigation is pending", () => {
    useLinkStatusMock.mockReturnValue({ pending: true });
    render(<TabNavOverlay />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
