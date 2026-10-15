// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/client";

/*
 * The login and sign-up forms, rendered in a fake browser (jsdom) and used like a person would:
 * typing, clicking. The session hooks and the router are replaced by fakes: no server needed.
 */
const auth = { login: vi.fn(), register: vi.fn(), authStatus: "anonymous" };
const ui = { toast: vi.fn() };
const router = { replace: vi.fn() };
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => auth }));
vi.mock("@/hooks/use-ui", () => ({ useUi: () => ui }));
vi.mock("next/navigation", () => ({ useRouter: () => router, useSearchParams: () => new URLSearchParams("next=/profile") }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

const { default: LoginPage } = await import("@/app/(auth)/login/page");
const { default: RegisterPage } = await import("@/app/(auth)/register/page");

beforeEach(() => {
  auth.login.mockReset().mockResolvedValue(undefined);
  auth.register.mockReset().mockResolvedValue(undefined);
  ui.toast.mockReset();
  router.replace.mockReset();
});
afterEach(cleanup);

describe("sign-up form", () => {
  it("stays disabled until the shared Zod rules pass, and ticks the password rules live", async () => {
    const user = userEvent.setup();
    render(<RegisterPage />);
    const submit = screen.getByRole("button", { name: "Créer mon compte" });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText("Pseudo"), "Alex");
    await user.type(screen.getByLabelText("Email"), "alex@pause.dev");
    await user.type(screen.getByLabelText("Mot de passe"), "court");
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText("Mot de passe"), "motdepasse42");
    expect(submit).toBeEnabled();
  });

  it("sends the cleaned values, then goes back to the requested page", async () => {
    const user = userEvent.setup();
    render(<RegisterPage />);
    await user.type(screen.getByLabelText("Pseudo"), "  Alex  ");
    await user.type(screen.getByLabelText("Email"), "Alex@Pause.dev");
    await user.type(screen.getByLabelText("Mot de passe"), "motdepasse42");
    await user.click(screen.getByRole("button", { name: "Créer mon compte" }));

    expect(auth.register).toHaveBeenCalledWith("Alex", "alex@pause.dev", "motdepasse42");
    expect(router.replace).toHaveBeenCalledWith("/profile");
  });

  it("shows the server's field error under the right field (email already used)", async () => {
    auth.register.mockRejectedValue(new ApiError(409, "conflict", "Un compte existe déjà avec cet email.", { email: "Cet email est déjà utilisé" }));
    const user = userEvent.setup();
    render(<RegisterPage />);
    await user.type(screen.getByLabelText("Pseudo"), "Alex");
    await user.type(screen.getByLabelText("Email"), "alex@pause.dev");
    await user.type(screen.getByLabelText("Mot de passe"), "motdepasse42");
    await user.click(screen.getByRole("button", { name: "Créer mon compte" }));

    expect(await screen.findByText("Cet email est déjà utilisé")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe("login form", () => {
  it("a malformed email is caught in the browser: no request is sent", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.type(screen.getByLabelText("Email"), "pas-un-email");
    await user.type(screen.getByLabelText("Mot de passe"), "x");
    await user.click(screen.getByRole("button", { name: "Se connecter" }));

    expect(await screen.findByText("Adresse email invalide")).toBeInTheDocument();
    expect(auth.login).not.toHaveBeenCalled();
  });

  it("shows the server's generic message on wrong credentials", async () => {
    auth.login.mockRejectedValue(new ApiError(401, "unauthorized", "Email ou mot de passe incorrect."));
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.type(screen.getByLabelText("Email"), "alex@pause.dev");
    await user.type(screen.getByLabelText("Mot de passe"), "mauvais");
    await user.click(screen.getByRole("button", { name: "Se connecter" }));

    expect(auth.login).toHaveBeenCalledWith("alex@pause.dev", "mauvais");
    expect(await screen.findByText("Email ou mot de passe incorrect.")).toBeInTheDocument();
  });
});
