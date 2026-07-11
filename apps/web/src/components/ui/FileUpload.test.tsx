import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { FileUpload } from "./FileUpload";

function makeFile(name: string, type: string, sizeBytes: number): File {
  const file = new File(["x".repeat(sizeBytes)], name, { type });
  return file;
}

describe("FileUpload", () => {
  it("accepts a valid file and calls onSelect", async () => {
    const onSelect = vi.fn();
    render(<FileUpload label="ID document" state="idle" onSelect={onSelect} />);

    const input = screen.getByLabelText("ID document") as HTMLInputElement;
    const file = makeFile("id.png", "image/png", 1024);
    await userEvent.upload(input, file);

    expect(onSelect).toHaveBeenCalledWith(file);
  });

  it("rejects a file of an unsupported type without calling onSelect", async () => {
    const onSelect = vi.fn();
    render(<FileUpload label="ID document" state="idle" onSelect={onSelect} />);

    // userEvent.upload emulates the browser's own accept-attribute
    // filtering and won't fire a change event for a disallowed type at
    // all — fireEvent bypasses that so the component's own validation
    // logic (the thing actually under test) gets exercised.
    const input = screen.getByLabelText("ID document") as HTMLInputElement;
    const file = makeFile("id.txt", "text/plain", 1024);
    fireEvent.change(input, { target: { files: [file] } });

    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/file type isn't accepted/i);
  });

  it("rejects a file over the size limit without calling onSelect", async () => {
    const onSelect = vi.fn();
    render(<FileUpload label="ID document" state="idle" maxSizeMb={1} onSelect={onSelect} />);

    const input = screen.getByLabelText("ID document") as HTMLInputElement;
    const file = makeFile("id.png", "image/png", 2 * 1024 * 1024);
    await userEvent.upload(input, file);

    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/too large/i);
  });

  it("shows a retry action when in the error state", () => {
    const onRetry = vi.fn();
    render(<FileUpload label="ID document" state="error" error="Upload failed" onSelect={vi.fn()} onRetry={onRetry} />);

    expect(screen.getByText("Retry")).toBeInTheDocument();
  });

  it("renders the uploaded state with a remove control", async () => {
    const onRemove = vi.fn();
    render(
      <FileUpload
        label="ID document"
        state="success"
        previewUrl="https://example.com/id.png"
        fileName="id.png"
        onSelect={vi.fn()}
        onRemove={onRemove}
      />,
    );

    expect(screen.getByText("id.png")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /remove file/i }));
    expect(onRemove).toHaveBeenCalled();
  });
});
