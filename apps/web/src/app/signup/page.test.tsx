import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  // SignupPage reads ?redirect= to route new accounts to the right product
  // onboarding; no param in these tests exercises the default path
  // (the Collect UK home -- the flagship product).
  useSearchParams: () => new URLSearchParams(),
}));

const signupMock = vi.fn();
class FakeApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}
vi.mock("@/lib/api", () => ({
  auth: { signup: (...args: unknown[]) => signupMock(...args) },
  FulfilmentApiError: FakeApiError,
}));

const { default: SignupPage } = await import("./page");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SignupPage", () => {
  it("shows validation errors instead of submitting when the form is incomplete", async () => {
    render(<SignupPage />);

    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByText(/enter your email address/i)).toBeInTheDocument();
    expect(screen.getByText(/choose a password/i)).toBeInTheDocument();
    expect(signupMock).not.toHaveBeenCalled();
  });

  it("flags mismatched passwords", async () => {
    render(<SignupPage />);

    await userEvent.type(screen.getByLabelText(/email address/i), "seller@example.com");
    await userEvent.type(screen.getByLabelText(/^password/i), "password123");
    await userEvent.type(screen.getByLabelText(/confirm password/i), "different123");
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByText(/passwords don't match/i)).toBeInTheDocument();
    expect(signupMock).not.toHaveBeenCalled();
  });

  it("shows a confirm-your-email screen after signup, without auto-login or redirect", async () => {
    // Email verification (SCRUM-219): signup creates an UNconfirmed account and
    // sends a confirm link — the page never auto-logs-in or redirects.
    signupMock.mockResolvedValue({ id: "user-1", email: "seller@example.com", phone: null });

    render(<SignupPage />);

    await userEvent.type(screen.getByLabelText(/email address/i), "seller@example.com");
    await userEvent.type(screen.getByLabelText(/^password/i), "password123");
    await userEvent.type(screen.getByLabelText(/confirm password/i), "password123");
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByText(/confirm your email/i)).toBeInTheDocument();
    expect(screen.getByText("seller@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /go to sign in/i })).toBeInTheDocument();
    expect(signupMock).toHaveBeenCalledWith({ email: "seller@example.com", password: "password123" });
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("shows a clear message when the account already exists", async () => {
    signupMock.mockRejectedValue(new FakeApiError("ACCOUNT_ALREADY_EXISTS", "already exists"));

    render(<SignupPage />);

    await userEvent.type(screen.getByLabelText(/email address/i), "seller@example.com");
    await userEvent.type(screen.getByLabelText(/^password/i), "password123");
    await userEvent.type(screen.getByLabelText(/confirm password/i), "password123");
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByText(/account with this email already exists/i)).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });
});
