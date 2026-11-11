import { useState, type FormEvent } from "react";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Store } from "lucide-react";

import styles from "./login.module.scss";

interface LoginProps {
  onLogin: (
    user: Awaited<ReturnType<typeof window.retaily.getCurrentUser>>,
  ) => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!username.trim() || !password) {
      setError("Enter your username and password.");
      return;
    }

    try {
      setLoading(true);

      await window.retaily.login({
        username: username.trim(),
        password,
      });

      const user = await window.retaily.getCurrentUser();

      onLogin(user);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to sign in. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.loginPage}>
      <section className={styles.loginPanel}>
        <div className={styles.brand}>
          <div className={styles.brandIcon}>
            <Store size={25} strokeWidth={2.2} />
          </div>

          <span>retaily</span>
        </div>

        <div className={styles.heading}>
          <span className={styles.eyebrow}>RETAIL OPERATING SYSTEM</span>

          <h1>Welcome back.</h1>

          <p>Sign in to access your store and continue where you left off.</p>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label htmlFor="username">Username</label>

            <input
              id="username"
              type="text"
              placeholder="Enter your username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              autoFocus
              disabled={loading}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="password">Password</label>

            <div className={styles.passwordField}>
              <LockKeyhole size={18} />

              <input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                disabled={loading}
              />

              <button
                type="button"
                className={styles.visibilityButton}
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {error && (
            <div className={styles.errorMessage} role="alert">
              {error}
            </div>
          )}

          <button
            type="submit"
            className={styles.submitButton}
            disabled={loading}
          >
            <span>{loading ? "Signing in..." : "Sign in"}</span>
            {!loading && <ArrowRight size={19} />}
          </button>
        </form>

        <div className={styles.footer}>
          <span>Secure store access</span>
          <span>Powered by Retaily</span>
        </div>
      </section>

      <aside className={styles.visualPanel}>
        <div className={styles.visualContent}>
          <div className={styles.visualLabel}>
            <span />
            YOUR STORE. IN CONTROL.
          </div>

          <h2>
            Run your retail business.
            <span> Smarter.</span>
          </h2>

          <p>
            Sales, inventory, customers and business intelligence, brought
            together in one place.
          </p>
        </div>

        <div className={styles.visualBottom}>
          <span>RETAILY OPERATING SYSTEM</span>
          <span>01 / 01</span>
        </div>
      </aside>
    </main>
  );
}
