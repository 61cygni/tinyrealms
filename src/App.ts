/**
 * Root application controller.
 * Flow: AuthScreen → ProfileScreen → Game
 */
import type { ConvexClient } from "convex/browser";
import { AuthScreen } from "./ui/AuthScreen.ts";
import { ProfileScreen } from "./ui/ProfileScreen.ts";
import { GameShell } from "./ui/GameShell.ts";
import { SplashHost } from "./splash/SplashHost.ts";
import type { ProfileData } from "./engine/types.ts";

export class App {
  private root: HTMLElement;
  private convex: ConvexClient;
  private authScreen: AuthScreen | null = null;
  private profileScreen: ProfileScreen | null = null;
  private gameShell: GameShell | null = null;
  private splashHost: SplashHost | null = null;

  constructor(root: HTMLElement, convex: ConvexClient) {
    this.root = root;
    this.convex = convex;
  }

  start() {
    this.showAuthScreen();
  }

  // ---------------------------------------------------------------------------
  // Auth
  // ---------------------------------------------------------------------------

  private showAuthScreen() {
    this.clear();
    this.authScreen = new AuthScreen(() => {
      this.showProfileScreen();
    });
    this.root.appendChild(this.authScreen.el);
  }

  // ---------------------------------------------------------------------------
  // Profile selection
  // ---------------------------------------------------------------------------

  private showProfileScreen() {
    this.clear();
    this.profileScreen = new ProfileScreen(
      (profile) => this.showGame(profile),
      () => this.showAuthScreen(),  // sign-out callback
    );
    this.root.appendChild(this.profileScreen.el);
  }

  // ---------------------------------------------------------------------------
  // Game
  // ---------------------------------------------------------------------------

  private showGame(profile: ProfileData) {
    this.clear();
    this.gameShell = new GameShell(profile);
    this.root.appendChild(this.gameShell.el);

    this.splashHost = new SplashHost();
    this.root.appendChild(this.splashHost.el);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private clear() {
    if (this.authScreen) {
      this.authScreen.destroy();
      this.authScreen = null;
    }
    if (this.profileScreen) {
      this.profileScreen.destroy();
      this.profileScreen = null;
    }
    if (this.gameShell) {
      this.gameShell.destroy();
      this.gameShell = null;
    }
    if (this.splashHost) {
      this.splashHost.destroy();
      this.splashHost = null;
    }
    this.root.innerHTML = "";
  }

  destroy() {
    this.clear();
  }
}
