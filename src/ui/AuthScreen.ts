/**
 * AuthScreen — displayed before the profile picker.
 * Handles sign-in via:
 *   - Email + password (sign in / sign up)
 *   - GitHub OAuth (production)
 */
import { getAuthManager } from "../lib/convexClient.ts";
import "./AuthScreen.css";

// GitHub SVG icon (simple mark)
const GITHUB_ICON = `<svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>`;

export class AuthScreen {
  readonly el: HTMLElement;
  private statusEl: HTMLElement;
  private onAuthenticated: () => void;
  private onGuestJoin: (() => void) | null;
  private destroyed = false;

  constructor(onAuthenticated: () => void, onGuestJoin?: () => void) {
    this.onAuthenticated = onAuthenticated;
    this.onGuestJoin = onGuestJoin ?? null;

    this.el = document.createElement("div");
    this.el.className = "auth-screen";

    const title = document.createElement("h1");
    title.textContent = "Tiny Realms";
    this.el.appendChild(title);

    const sub = document.createElement("div");
    sub.className = "auth-subtitle";
    sub.textContent = "A persistent shared world";
    this.el.appendChild(sub);

    const card = document.createElement("div");
    card.className = "auth-card";

    // Detect if running locally
    const isLocal = (import.meta.env.VITE_CONVEX_URL as string)?.includes("127.0.0.1");

    // -----------------------------------------------------------------------
    // Email + password form
    // -----------------------------------------------------------------------
    const form = document.createElement("div");
    form.className = "auth-password-form";

    const emailInput = document.createElement("input");
    emailInput.type = "email";
    emailInput.placeholder = "Email";
    emailInput.className = "auth-input";
    emailInput.autocomplete = "email";
    form.appendChild(emailInput);

    const passwordInput = document.createElement("input");
    passwordInput.type = "password";
    passwordInput.placeholder = "Password (min 8 chars)";
    passwordInput.className = "auth-input";
    passwordInput.autocomplete = "current-password";
    form.appendChild(passwordInput);

    const pwBtnRow = document.createElement("div");
    pwBtnRow.className = "auth-btn-row";

    const signInBtn = document.createElement("button");
    signInBtn.className = "auth-btn primary";
    signInBtn.textContent = "Sign In";
    signInBtn.addEventListener("click", () =>
      this.handlePassword(emailInput, passwordInput, "signIn", signInBtn, signUpBtn),
    );

    const signUpBtn = document.createElement("button");
    signUpBtn.className = "auth-btn secondary";
    signUpBtn.textContent = "Sign Up";
    signUpBtn.addEventListener("click", () =>
      this.handlePassword(emailInput, passwordInput, "signUp", signUpBtn, signInBtn),
    );

    pwBtnRow.append(signInBtn, signUpBtn);
    form.appendChild(pwBtnRow);
    card.appendChild(form);

    // Submit on Enter key
    const handleEnter = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        signInBtn.click();
      }
    };
    emailInput.addEventListener("keydown", handleEnter);
    passwordInput.addEventListener("keydown", handleEnter);

    // -----------------------------------------------------------------------
    // GitHub OAuth — stubbed out for now (enable later by uncommenting)
    // -----------------------------------------------------------------------
    // const divider1 = document.createElement("div");
    // divider1.className = "auth-divider";
    // divider1.textContent = "or";
    // card.appendChild(divider1);
    //
    // if (!isLocal) {
    //   const ghBtn = document.createElement("button");
    //   ghBtn.className = "auth-btn github";
    //   ghBtn.innerHTML = `<span class="icon">${GITHUB_ICON}</span> Sign in with GitHub`;
    //   ghBtn.addEventListener("click", () => this.handleGitHub(ghBtn));
    //   card.appendChild(ghBtn);
    // }

    // -----------------------------------------------------------------------
    // Status message
    // -----------------------------------------------------------------------
    this.statusEl = document.createElement("div");
    this.statusEl.className = "auth-status";
    card.appendChild(this.statusEl);

    this.el.appendChild(card);

    // -----------------------------------------------------------------------
    // Guest access — below the card
    // -----------------------------------------------------------------------
    if (this.onGuestJoin) {
      const guestWrap = document.createElement("div");
      guestWrap.className = "auth-guest-wrap";
      const guestBtn = document.createElement("button");
      guestBtn.className = "auth-guest-btn";
      guestBtn.textContent = "or explore as a guest";
      guestBtn.addEventListener("click", () => {
        if (this.destroyed) return;
        this.onGuestJoin?.();
      });
      guestWrap.appendChild(guestBtn);
      this.el.appendChild(guestWrap);
    }

    // Check for OAuth callback first, then existing session
    this.init();
  }

  private async init() {
    const auth = getAuthManager();

    // 1. Check for OAuth callback in URL
    try {
      this.showStatus("Checking session...");
      const wasCallback = await auth.handleOAuthCallback();
      if (wasCallback) {
        this.showStatus("Signed in!");
        this.done();
        return;
      }
    } catch {
      // Not an OAuth callback — continue
    }

    // 2. Check for existing session token
    if (auth.isAuthenticated()) {
      this.showStatus("Resuming session...");
      // Small delay to let the client set up auth
      await this.waitForAuth();
      const valid = await auth.validateSession();
      if (valid) {
        this.done();
        return;
      }
      this.showStatus("Session expired. Please sign in again.");
    }

    // 3. No session — show buttons
    this.showStatus("");
  }

  private async handlePassword(
    emailInput: HTMLInputElement,
    passwordInput: HTMLInputElement,
    flow: "signIn" | "signUp",
    primaryBtn: HTMLButtonElement,
    secondaryBtn: HTMLButtonElement,
  ) {
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email) {
      this.showStatus("Email is required", true);
      return;
    }
    if (!password) {
      this.showStatus("Password is required", true);
      return;
    }
    if (flow === "signUp" && password.length < 8) {
      this.showStatus("Password must be at least 8 characters", true);
      return;
    }

    primaryBtn.disabled = true;
    secondaryBtn.disabled = true;
    this.showStatus(flow === "signUp" ? "Creating account..." : "Signing in...");

    try {
      const auth = getAuthManager();
      await auth.signInPassword(email, password, flow);
      this.showStatus("Signed in!");
      await this.waitForAuth();
      this.done();
    } catch (err: any) {
      const msg = err.message || `Failed to ${flow === "signUp" ? "create account" : "sign in"}`;
      this.showStatus(msg, true);
      primaryBtn.disabled = false;
      secondaryBtn.disabled = false;
    }
  }

  private async handleGitHub(btn: HTMLButtonElement) {
    btn.disabled = true;
    this.showStatus("Redirecting to GitHub...");
    try {
      const auth = getAuthManager();
      await auth.signInGitHub();
      // Browser will redirect — this code won't continue
    } catch (err: any) {
      this.showStatus(err.message || "Failed to start GitHub sign-in", true);
      btn.disabled = false;
    }
  }

  /** Wait briefly for the ConvexClient to become authenticated */
  private waitForAuth(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 500));
  }

  private done() {
    if (this.destroyed) return;
    this.onAuthenticated();
  }

  private showStatus(text: string, isError = false) {
    this.statusEl.textContent = text;
    this.statusEl.className = `auth-status${isError ? " error" : ""}`;
  }

  destroy() {
    this.destroyed = true;
    this.el.remove();
  }
}
