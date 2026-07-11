import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Field } from "./Field";
import { Input } from "./Input";

describe("Field", () => {
  it("associates the label with the input", () => {
    render(
      <Field label="Full name" required>
        {fieldProps => <Input {...fieldProps} />}
      </Field>,
    );

    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
  });

  it("shows the hint text when there is no error", () => {
    render(
      <Field label="Mobile number" hint="Include country code">
        {fieldProps => <Input {...fieldProps} />}
      </Field>,
    );

    expect(screen.getByText("Include country code")).toBeInTheDocument();
  });

  it("shows the error message and marks the field invalid instead of the hint", () => {
    render(
      <Field label="Mobile number" hint="Include country code" error="Enter a valid number">
        {fieldProps => <Input {...fieldProps} />}
      </Field>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid number");
    expect(screen.queryByText("Include country code")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/mobile number/i)).toHaveAttribute("aria-invalid", "true");
  });
});
