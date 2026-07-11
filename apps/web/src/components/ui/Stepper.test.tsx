import { render, screen, within } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Stepper } from "./Stepper";

describe("Stepper", () => {
  it("marks the current step and shows completed steps as checked", () => {
    render(<Stepper steps={["About you", "Business", "Review"]} currentStep={1} />);

    const list = screen.getByRole("list");
    const currentStepEl = within(list).getByText("Business").closest("li");
    expect(currentStepEl?.querySelector('[aria-current="step"]')).toBeInTheDocument();
  });

  it("shows the mobile progress summary", () => {
    render(<Stepper steps={["About you", "Business", "Review"]} currentStep={1} />);

    expect(screen.getByText("Step 2 of 3")).toBeInTheDocument();
  });
});
