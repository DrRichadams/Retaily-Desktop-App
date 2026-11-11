import { useEffect, useState } from "react";
import { Store } from "lucide-react";

import Login from "./pages/auth/login";
import Onboarding from "./pages/onboarding/onboarding";
import WorkspaceRouter from "./pages/workspaces/workspace-router";

import styles from "./App.module.scss";

type CurrentUser = Awaited<ReturnType<typeof window.retaily.getCurrentUser>>;

type AppMode = "checking" | "onboarding" | "login" | "workspace" | "error";

export default function App() {
  const [mode, setMode] = useState<AppMode>("checking");
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState("");

  async function checkOnboarding() {
    try {
      setError("");
      setMode("checking");

      const status = await window.retaily.getOnboardingStatus();

      setMode(status.required ? "onboarding" : "login");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to connect to the Retaily server.",
      );

      setMode("error");
    }
  }

  useEffect(() => {
    void checkOnboarding();
  }, []);

  function handleLogin(currentUser: CurrentUser) {
    setError("");
    setUser(currentUser);
    setMode("workspace");
  }

  async function handleLogout() {
    try {
      setLoggingOut(true);
      setError("");

      await window.retaily.logout();

      setUser(null);
      setMode("login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to log out.");
    } finally {
      setLoggingOut(false);
    }
  }

  if (mode === "checking") {
    return (
      <main className={styles.startup}>
        <div className={styles.startupBrand}>
          <Store size={24} />
          <span>retaily</span>
        </div>

        <p>Preparing your store...</p>
      </main>
    );
  }

  if (mode === "error") {
    return (
      <main className={styles.startup}>
        <div className={styles.startupBrand}>
          <Store size={24} />
          <span>retaily</span>
        </div>

        <h2>We couldn't connect to your store server.</h2>
        <p>{error}</p>

        <button
          type="button"
          className={styles.retryButton}
          onClick={() => void checkOnboarding()}
        >
          Try again
        </button>
      </main>
    );
  }

  if (mode === "onboarding") {
    return (
      <Onboarding
        onComplete={() => {
          setMode("login");
        }}
      />
    );
  }

  if (mode === "login") {
    return <Login onLogin={handleLogin} />;
  }

  if (!user) {
    return null;
  }

  return (
    <WorkspaceRouter
      user={user}
      onLogout={() => void handleLogout()}
      loggingOut={loggingOut}
      error={error}
    />
  );
}

// import UiShowcase from "./pages/ui-showcase/UiShowcase";

// export default function App() {
//   return <UiShowcase />;
// }
