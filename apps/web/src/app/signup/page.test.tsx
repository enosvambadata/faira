import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  // SignupPage reads ?redirect= to route new accounts to the right product
  // onboarding; no param in these tests exercises the default (fulfilment
  // onboarding) path.
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

const signInWithPasswordMock = vi.fn();
vi.mock("@/lib/supabase", () => ({
  createClient: () => ({ auth: { signInWithPassword: signInWithPasswordMock } }),
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

  it("signs up, signs in, and redirects to onboarding on success", async () => {
    signupMock.mockResolvedValue({ id: "user-1", email: "seller@example.com", phone: null });
    signInWithPasswordMock.mockResolvedValue({ error: null });

    render(<SignupPage />);

    await userEvent.type(screen.getByLabelText(/email address/i), "seller@example.com");
    await userEvent.type(screen.getByLabelText(/^password/i), "password123");
    await userEvent.type(screen.getByLabelText(/confirm password/i), "password123");
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByText(/create account/i)).toBeInTheDocument();
    expect(signupMock).toHaveBeenCalledWith({ email: "seller@example.com", password: "password123" });
    expect(signInWithPasswordMock).toHaveBeenCalledWith({ email: "seller@example.com", password: "password123" });
    expect(pushMock).toHaveBeenCalledWith("/onboarding");
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
