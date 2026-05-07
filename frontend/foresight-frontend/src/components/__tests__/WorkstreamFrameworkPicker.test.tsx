/**
 * WorkstreamFrameworkPicker tests — verify the three-stage flow:
 *   1. Frameworks list loads, renders, and auto-selects when sole.
 *   2. Selecting a category surfaces drivers.
 *   3. Driver clicks toggle selection through onChange.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { WorkstreamFrameworkPicker } from "../WorkstreamFrameworkPicker";
import * as frameworksApi from "../../lib/frameworks-api";

const PPP_SUMMARY = {
  id: "fw-ppp",
  code: "PPP",
  name: "People · Place · Partnerships",
  description: "FY26 City of Austin framework",
  owner_type: "org" as const,
  display_order: 1,
};

const PPP_FULL = {
  ...PPP_SUMMARY,
  categories: [
    {
      id: "cat-people",
      framework_code: "PPP",
      code: "people",
      name: "People",
      description: "Workforce + community wellbeing",
      display_order: 1,
      drivers: [
        {
          id: "drv-1",
          framework_category_id: "cat-people",
          code: "talent",
          name: "Talent retention",
          description: null,
          keywords: [],
          tracked_metric_examples: ["Attrition rate"],
          display_order: 1,
        },
        {
          id: "drv-2",
          framework_category_id: "cat-people",
          code: "wellbeing",
          name: "Community wellbeing",
          description: null,
          keywords: [],
          tracked_metric_examples: [],
          display_order: 2,
        },
      ],
    },
  ],
};

describe("WorkstreamFrameworkPicker", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("auto-selects the sole framework when nothing is selected", async () => {
    vi.spyOn(frameworksApi, "listFrameworks").mockResolvedValue([PPP_SUMMARY]);
    vi.spyOn(frameworksApi, "getFramework").mockResolvedValue(PPP_FULL);

    const onChange = vi.fn();
    render(
      <WorkstreamFrameworkPicker
        token="tok"
        value={{
          framework_code: null,
          framework_category_id: null,
          driver_ids: [],
        }}
        onChange={onChange}
      />,
    );

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({
        framework_code: "PPP",
        framework_category_id: null,
        driver_ids: [],
      });
    });
  });

  it("does not auto-select when a framework is already chosen", async () => {
    vi.spyOn(frameworksApi, "listFrameworks").mockResolvedValue([PPP_SUMMARY]);
    vi.spyOn(frameworksApi, "getFramework").mockResolvedValue(PPP_FULL);

    const onChange = vi.fn();
    render(
      <WorkstreamFrameworkPicker
        token="tok"
        value={{
          framework_code: "PPP",
          framework_category_id: null,
          driver_ids: [],
        }}
        onChange={onChange}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("People")).toBeInTheDocument();
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("emits a category selection without drivers", async () => {
    vi.spyOn(frameworksApi, "listFrameworks").mockResolvedValue([PPP_SUMMARY]);
    vi.spyOn(frameworksApi, "getFramework").mockResolvedValue(PPP_FULL);

    const onChange = vi.fn();
    render(
      <WorkstreamFrameworkPicker
        token="tok"
        value={{
          framework_code: "PPP",
          framework_category_id: null,
          driver_ids: ["drv-stale"],
        }}
        onChange={onChange}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("People")).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await act(async () => {
      await user.click(screen.getByText("People"));
    });

    expect(onChange).toHaveBeenCalledWith({
      framework_code: "PPP",
      framework_category_id: "cat-people",
      driver_ids: [],
    });
  });

  it("toggles a driver into the selection", async () => {
    vi.spyOn(frameworksApi, "listFrameworks").mockResolvedValue([PPP_SUMMARY]);
    vi.spyOn(frameworksApi, "getFramework").mockResolvedValue(PPP_FULL);

    const onChange = vi.fn();
    render(
      <WorkstreamFrameworkPicker
        token="tok"
        value={{
          framework_code: "PPP",
          framework_category_id: "cat-people",
          driver_ids: [],
        }}
        onChange={onChange}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Talent retention")).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await act(async () => {
      await user.click(screen.getByText("Talent retention"));
    });

    expect(onChange).toHaveBeenCalledWith({
      framework_code: "PPP",
      framework_category_id: "cat-people",
      driver_ids: ["drv-1"],
    });
  });

  it("removes a driver when toggled off", async () => {
    vi.spyOn(frameworksApi, "listFrameworks").mockResolvedValue([PPP_SUMMARY]);
    vi.spyOn(frameworksApi, "getFramework").mockResolvedValue(PPP_FULL);

    const onChange = vi.fn();
    render(
      <WorkstreamFrameworkPicker
        token="tok"
        value={{
          framework_code: "PPP",
          framework_category_id: "cat-people",
          driver_ids: ["drv-1", "drv-2"],
        }}
        onChange={onChange}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Talent retention")).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await act(async () => {
      await user.click(screen.getByText("Talent retention"));
    });

    expect(onChange).toHaveBeenCalledWith({
      framework_code: "PPP",
      framework_category_id: "cat-people",
      driver_ids: ["drv-2"],
    });
  });

  it("renders an error state when listFrameworks fails", async () => {
    vi.spyOn(frameworksApi, "listFrameworks").mockRejectedValue(
      new Error("network down"),
    );

    render(
      <WorkstreamFrameworkPicker
        token="tok"
        value={{
          framework_code: null,
          framework_category_id: null,
          driver_ids: [],
        }}
        onChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("network down")).toBeInTheDocument();
    });
  });
});
