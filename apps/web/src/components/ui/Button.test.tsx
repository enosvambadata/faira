import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { Button } from "./Button";

describe("Button", () => {
  it("renders its label and responds to clicks", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Submit</Button>);

    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("is disabled and shows a spinner while loading, without firing clicks", async () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} loading>
        Submit
      </Button>,
    );

    const button = screen.getByRole("button", { name: /submit/i });
    expect(button).toBeDisabled();
    expect(screen.getByRole("status", { name: /loading/i })).toBeInTheDocument();

    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("is disabled when the disabled prop is set", () => {
    render(<Button disabled>Submit</Button>);
    expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled();
  });
});
