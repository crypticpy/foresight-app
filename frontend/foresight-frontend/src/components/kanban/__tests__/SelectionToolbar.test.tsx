/**
 * SelectionToolbar Unit Tests
 *
 * Verifies the bulk-action toolbar:
 * - Hidden when nothing is selected
 * - Calls bulkWorkstreamCardAction with the selected ids on click
 * - Clears selection + refreshes cards on mutating actions
 * - Copies returned URLs to clipboard for "Copy links"
 * - Opens a `mailto:` URL using the returned subject + body for "Email"
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SelectionToolbar } from "../SelectionToolbar";
import * as workstreamApi from "../../../lib/workstream-api";

vi.mock("../../../lib/workstream-api", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../lib/workstream-api")>();
  return {
    ...actual,
    bulkWorkstreamCardAction: vi.fn(),
  };
});

const bulkMock = workstreamApi.bulkWorkstreamCardAction as unknown as Mock;

function setup(selected: string[] = ["c1", "c2"]) {
  const onClearSelection = vi.fn();
  const onCardsChanged = vi.fn().mockResolvedValue(undefined);
  const showToast = vi.fn();
  const getAuthToken = vi.fn().mockResolvedValue("test-token");
  const utils = render(
    <SelectionToolbar
      workstreamId="ws-1"
      selectedCardIds={selected}
      getAuthToken={getAuthToken}
      showToast={showToast}
      onClearSelection={onClearSelection}
      onCardsChanged={onCardsChanged}
    />,
  );
  return {
    ...utils,
    onClearSelection,
    onCardsChanged,
    showToast,
    getAuthToken,
  };
}

beforeEach(() => {
  bulkMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SelectionToolbar", () => {
  it("renders nothing when selection is empty", () => {
    const { container } = render(
      <SelectionToolbar
        workstreamId="ws-1"
        selectedCardIds={[]}
        getAuthToken={vi.fn()}
        showToast={vi.fn()}
        onClearSelection={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows the selection count", () => {
    setup(["a", "b", "c"]);
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText(/selected/i)).toBeInTheDocument();
  });

  it("archives selected cards and clears selection", async () => {
    bulkMock.mockResolvedValueOnce({ updated: 2, action: "archive" });
    const { onClearSelection, onCardsChanged, showToast } = setup();

    fireEvent.click(screen.getByRole("button", { name: /^archive$/i }));

    await waitFor(() => {
      expect(bulkMock).toHaveBeenCalledWith(
        "test-token",
        "ws-1",
        "archive",
        ["c1", "c2"],
        undefined,
      );
    });
    expect(showToast).toHaveBeenCalledWith(
      "success",
      expect.stringContaining("Archived"),
    );
    expect(onClearSelection).toHaveBeenCalledTimes(1);
    expect(onCardsChanged).toHaveBeenCalledTimes(1);
  });

  it("copies share links to clipboard without clearing selection", async () => {
    bulkMock.mockResolvedValueOnce({
      action: "copy_share_links",
      urls: ["https://x/1", "https://x/2"],
    });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    const { onClearSelection, showToast } = setup();
    fireEvent.click(screen.getByRole("button", { name: /copy links/i }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("https://x/1\nhttps://x/2");
    });
    expect(showToast).toHaveBeenCalledWith(
      "success",
      expect.stringContaining("Copied"),
    );
    // copy_share_links is a read-only op — selection should persist.
    expect(onClearSelection).not.toHaveBeenCalled();
  });

  it("opens a mailto link for the email action", async () => {
    bulkMock.mockResolvedValueOnce({
      action: "email_selection",
      subject: "Foresight: 2 signals",
      body: "Hi team,\nLook at these.",
    });

    // jsdom's window.location.href setter is permissive — capture writes.
    const hrefSetter = vi.fn();
    Object.defineProperty(window, "location", {
      value: {
        get href() {
          return "";
        },
        set href(v: string) {
          hrefSetter(v);
        },
        origin: "https://app.test",
      },
      writable: true,
    });

    setup();
    fireEvent.click(screen.getByRole("button", { name: /^email$/i }));

    await waitFor(() => {
      expect(hrefSetter).toHaveBeenCalled();
    });
    const href = hrefSetter.mock.calls[0]?.[0] as string;
    expect(href).toMatch(/^mailto:\?subject=/);
    expect(decodeURIComponent(href)).toContain("Foresight: 2 signals");
    expect(decodeURIComponent(href)).toContain("Look at these.");
  });

  it("calls onClearSelection when the clear button is clicked", () => {
    const { onClearSelection } = setup();
    fireEvent.click(screen.getByRole("button", { name: /clear selection/i }));
    expect(onClearSelection).toHaveBeenCalledTimes(1);
  });

  it("toasts an error and keeps selection when the bulk call rejects", async () => {
    bulkMock.mockRejectedValueOnce(new Error("boom"));
    const { onClearSelection, showToast } = setup();

    fireEvent.click(screen.getByRole("button", { name: /^watch$/i }));

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith(
        "error",
        expect.stringContaining("watch"),
      );
    });
    expect(onClearSelection).not.toHaveBeenCalled();
  });
});
