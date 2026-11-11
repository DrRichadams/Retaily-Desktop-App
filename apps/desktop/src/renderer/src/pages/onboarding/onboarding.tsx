import { useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Store,
} from "lucide-react";

import styles from "./onboarding.module.scss";

interface OnboardingProps {
  onComplete: () => void;
}

interface OnboardingDetails {
  businessName: string;
  ownerName: string;
  username: string;
  password: string;
  email: string;
  phone: string;
  branchName: string;
  branchCode: string;
  registerName: string;
  registerCode: string;
  currency: string;
}

const initialDetails: OnboardingDetails = {
  businessName: "",
  ownerName: "",
  username: "",
  password: "",
  email: "",
  phone: "",
  branchName: "Main Branch",
  branchCode: "MAIN",
  registerName: "Main Register",
  registerCode: "REG-01",
  currency: "USD",
};

const steps = ["Business", "Owner account", "Store setup", "Review"];

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [details, setDetails] = useState<OnboardingDetails>(initialDetails);

  const [step, setStep] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function update<K extends keyof OnboardingDetails>(
    field: K,
    value: OnboardingDetails[K],
  ) {
    setDetails((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function validateStep() {
    setError("");

    if (step === 0 && !details.businessName.trim()) {
      setError("Enter your business or shop name.");
      return false;
    }

    if (step === 1) {
      if (!details.ownerName.trim()) {
        setError("Enter the owner's full name.");
        return false;
      }

      if (!/^[a-zA-Z0-9._-]{3,40}$/.test(details.username)) {
        setError(
          "Username must be 3 to 40 characters and use letters, numbers, dots, underscores or hyphens.",
        );
        return false;
      }

      if (details.password.length < 12) {
        setError("Your password must contain at least 12 characters.");
        return false;
      }

      if (details.password.length > 128) {
        setError("Your password cannot exceed 128 characters.");
        return false;
      }
    }

    if (step === 2) {
      if (!details.branchName.trim() || !details.branchCode.trim()) {
        setError("Enter the first branch name and branch code.");
        return false;
      }

      if (!details.registerName.trim() || !details.registerCode.trim()) {
        setError("Enter the first register name and register code.");
        return false;
      }
    }

    return true;
  }

  function nextStep() {
    if (!validateStep()) return;
    setStep((current) => Math.min(current + 1, steps.length - 1));
  }

  async function completeSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (step !== 3) {
      nextStep();
      return;
    }

    setError("");
    setLoading(true);

    try {
      await window.retaily.createOwner({
        ...details,
        email: details.email.trim(),
        phone: details.phone.trim(),
      });

      onComplete();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to complete your store setup.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <div className={styles.brand}>
          <div className={styles.brandIcon}>
            <Store size={24} />
          </div>
          <span>retaily</span>
        </div>

        <div className={styles.introduction}>
          <span className={styles.eyebrow}>WELCOME TO RETAILY</span>
          <h1>Let's set up your store.</h1>
          <p>
            A few details and you'll be ready to manage your retail business
            with Retaily.
          </p>
        </div>

        <div className={styles.progress}>
          {steps.map((label, index) => (
            <div
              key={label}
              className={`${styles.progressStep} ${
                index <= step ? styles.active : ""
              }`}
            >
              <div className={styles.progressNumber}>
                {index < step ? <CheckCircle2 size={17} /> : index + 1}
              </div>
              <span>{label}</span>
            </div>
          ))}
        </div>

        <form onSubmit={completeSetup} className={styles.form}>
          {step === 0 && (
            <div className={styles.stepContent}>
              <h2>Business information</h2>
              <p>Tell us about the business using Retaily.</p>

              <div className={styles.field}>
                <label htmlFor="businessName">Business or shop name *</label>
                <input
                  id="businessName"
                  value={details.businessName}
                  onChange={(e) => update("businessName", e.target.value)}
                  placeholder="e.g. Mutambisi General Dealers"
                  autoFocus
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="currency">Default currency</label>
                <select
                  id="currency"
                  value={details.currency}
                  onChange={(e) => update("currency", e.target.value)}
                >
                  <option value="USD">USD - US Dollar</option>
                  <option value="ZWG">ZWG - Zimbabwe Gold</option>
                  <option value="ZAR">ZAR - South African Rand</option>
                  <option value="BWP">BWP - Botswana Pula</option>
                  <option value="ZMW">ZMW - Zambian Kwacha</option>
                </select>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className={styles.stepContent}>
              <h2>Create your Owner account</h2>
              <p>
                This will be the primary administrator account for your Retaily
                installation.
              </p>

              <div className={styles.field}>
                <label htmlFor="ownerName">Owner's full name *</label>
                <input
                  id="ownerName"
                  value={details.ownerName}
                  onChange={(e) => update("ownerName", e.target.value)}
                  placeholder="Your full name"
                  autoFocus
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="username">Username *</label>
                <input
                  id="username"
                  value={details.username}
                  onChange={(e) => update("username", e.target.value)}
                  placeholder="Choose a username"
                  autoComplete="username"
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="password">Password *</label>
                <div className={styles.passwordField}>
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={details.password}
                    onChange={(e) => update("password", e.target.value)}
                    placeholder="At least 12 characters"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <span className={styles.hint}>
                  Use a strong password that you haven't used elsewhere.
                </span>
              </div>

              <div className={styles.field}>
                <label htmlFor="email">Email address</label>
                <input
                  id="email"
                  type="email"
                  value={details.email}
                  onChange={(e) => update("email", e.target.value)}
                  placeholder="you@example.com"
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="phone">Phone number</label>
                <input
                  id="phone"
                  value={details.phone}
                  onChange={(e) => update("phone", e.target.value)}
                  placeholder="+263..."
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className={styles.stepContent}>
              <h2>Your first store location</h2>
              <p>
                Every Retaily business starts with at least one branch and one
                register.
              </p>

              <div className={styles.sectionLabel}>BRANCH</div>

              <div className={styles.field}>
                <label htmlFor="branchName">Branch name *</label>
                <input
                  id="branchName"
                  value={details.branchName}
                  onChange={(e) => update("branchName", e.target.value)}
                  placeholder="Main Branch"
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="branchCode">Branch code *</label>
                <input
                  id="branchCode"
                  value={details.branchCode}
                  onChange={(e) => update("branchCode", e.target.value)}
                  placeholder="MAIN"
                />
              </div>

              <div className={styles.sectionLabel}>FIRST REGISTER / TILL</div>

              <div className={styles.field}>
                <label htmlFor="registerName">Register name *</label>
                <input
                  id="registerName"
                  value={details.registerName}
                  onChange={(e) => update("registerName", e.target.value)}
                  placeholder="Main Register"
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="registerCode">Register code *</label>
                <input
                  id="registerCode"
                  value={details.registerCode}
                  onChange={(e) => update("registerCode", e.target.value)}
                  placeholder="REG-01"
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className={styles.stepContent}>
              <h2>Review your setup</h2>
              <p>Check these details before creating your Retaily store.</p>

              <div className={styles.reviewGroup}>
                <span>BUSINESS</span>
                <strong>{details.businessName}</strong>
                <small>Currency: {details.currency}</small>
              </div>

              <div className={styles.reviewGroup}>
                <span>OWNER ACCOUNT</span>
                <strong>{details.ownerName}</strong>
                <small>Username: {details.username}</small>
                <small>Email: {details.email || "Not provided"}</small>
              </div>

              <div className={styles.reviewGroup}>
                <span>BRANCH</span>
                <strong>{details.branchName}</strong>
                <small>Code: {details.branchCode}</small>
              </div>

              <div className={styles.reviewGroup}>
                <span>FIRST REGISTER</span>
                <strong>{details.registerName}</strong>
                <small>Code: {details.registerCode}</small>
              </div>

              <div className={styles.notice}>
                Your Owner account will receive full administrative permissions
                for this business.
              </div>
            </div>
          )}

          {error && (
            <div className={styles.error} role="alert">
              {error}
            </div>
          )}

          <div className={styles.actions}>
            {step > 0 && (
              <button
                type="button"
                className={styles.backButton}
                disabled={loading}
                onClick={() => {
                  setError("");
                  setStep((current) => current - 1);
                }}
              >
                <ArrowLeft size={17} />
                Back
              </button>
            )}

            <button
              type="submit"
              className={styles.nextButton}
              disabled={loading}
            >
              {loading
                ? "Creating your store..."
                : step === 3
                  ? "Create my store"
                  : "Continue"}

              {!loading && <ArrowRight size={18} />}
            </button>
          </div>
        </form>

        <div className={styles.footer}>
          RETAILY · YOUR BUSINESS, BETTER MANAGED
        </div>
      </section>
    </main>
  );
}
