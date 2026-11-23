import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  ChevronDown,
  LoaderCircle,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
} from "lucide-react";

import { branchesService } from "../../../services/branches.service";
import { productsService } from "../../../services/products.service";
import { salesService, SalesServiceError } from "../../../services/sales.service";
import Button from "../../../components/ui/Button";
import CheckoutAttemptDialog, {
  type ActiveCheckoutAttempt,
} from "./checkout-attempt-dialog";
import PaymentDialog from "./payment-dialog";
import SaleConfirmation from "./sale-confirmation";
import { salesTransportFailure } from "../../../../../shared/sales-ipc";
import {
  branchChangeNeedsCartConfirmation,
  canChangeBranch,
  canSubmitAttempt,
  CheckoutOperationGate,
  persistAndSubmitAttempt,
  recoverAttempt as recoverSavedAttempt,
  retryExactAttempt,
  submitSavedAttempt as submitPersistedAttempt,
} from "./checkout-attempt-flow";
import styles from "./pos-page.module.scss";

type CurrentUser = Awaited<ReturnType<typeof window.retaily.getCurrentUser>>;
type CartLine = { product: RetailyProduct; quantity: number };

const PAGE_SIZE = 24;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function isSavedSaleRequest(value: unknown): value is RetailyCreateSaleRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as Record<string, unknown>;
  if (typeof request.branchId !== "string" || !Array.isArray(request.items) || !Array.isArray(request.payments)) return false;
  const itemsValid = request.items.every((item) => {
    if (!item || typeof item !== "object") return false;
    const line = item as Record<string, unknown>;
    return typeof line.productId === "string" && typeof line.quantity === "number" && Number.isFinite(line.quantity) && line.quantity > 0;
  });
  const paymentsValid = request.payments.every((payment) => {
    if (!payment || typeof payment !== "object") return false;
    const entry = payment as Record<string, unknown>;
    return typeof entry.method === "string" && Number.isSafeInteger(entry.amountMinor) && Number(entry.amountMinor) > 0;
  });
  return itemsValid && paymentsValid;
}

import { currencyFractionDigits, formatMinor } from "./checkout-calculations";
import {
  checkoutDraftReducer,
  closeCheckoutDraft,
  createCheckoutDraft,
  discardCheckoutDraft,
} from "./checkout-draft";

function safeUnitPrice(product: RetailyProduct) {
  return Number.isSafeInteger(product.sellingPriceMinor) && product.sellingPriceMinor >= 0
    ? BigInt(product.sellingPriceMinor)
    : null;
}

export default function PosPage({ user }: { user: CurrentUser }) {
  const [branches, setBranches] = useState<RetailyBranch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [branchLoading, setBranchLoading] = useState(true);
  const [branchError, setBranchError] = useState("");
  const [products, setProducts] = useState<RetailyProduct[]>([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [productError, setProductError] = useState("");
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [pendingAttempts, setPendingAttempts] = useState<RetailyCheckoutAttempt[]>([]);
  const [pendingAttemptError, setPendingAttemptError] = useState("");
  const [activeAttempt, setActiveAttempt] = useState<ActiveCheckoutAttempt | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [checkoutDraft, dispatchCheckoutDraft] = useReducer(
    checkoutDraftReducer,
    createCheckoutDraft(),
  );
  const [completedSale, setCompletedSale] = useState<RetailySaleResponse | null>(null);
  const [attemptBusy, setAttemptBusy] = useState(false);
  const [attemptListLoading, setAttemptListLoading] = useState(true);
  const operationGate = useRef(new CheckoutOperationGate());
  const localAttemptStorageKey = `retaily.checkout-attempt.${user.businessId}.${user.employeeId}`;
  const requestVersion = useRef(0);
  const loadMoreVersion = useRef(0);
  const currency = user.business.currency;
  const currencyValid = currencyFractionDigits(currency) !== null;
  const selectedBranch = branches.find((branch) => branch.id === selectedBranchId);
  const cartLocked = Boolean(
    completedSale ||
    (activeAttempt && activeAttempt.phase !== "rejected") ||
    paymentOpen,
  );

  const refreshPendingAttempts = useCallback(async () => {
    setAttemptListLoading(true);
    setPendingAttemptError("");
    try {
      const response = await salesService.listPendingCheckoutAttempts();
      setPendingAttempts(response.data);
    } catch (error) {
      setPendingAttemptError(errorMessage(error));
    } finally {
      setAttemptListLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    setBranchLoading(true);
    void branchesService
      .list()
      .then((response) => {
        if (!active) return;
        const accessibleBranches = response.data;
        setBranches(accessibleBranches);
        setSelectedBranchId(accessibleBranches.length === 1 ? accessibleBranches[0].id : "");
      })
      .catch((error: unknown) => {
        if (active) setBranchError(errorMessage(error));
      })
      .finally(() => {
        if (active) setBranchLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    void refreshPendingAttempts();
  }, [refreshPendingAttempts]);

  useEffect(() => {
    const version = ++requestVersion.current;
    loadMoreVersion.current += 1;
    setLoading(true);
    setLoadingMore(false);
    setProducts([]);
    setPagination({ page: 1, totalPages: 1, total: 0 });
    setProductError("");
    const timer = window.setTimeout(() => {
      void productsService
        .list({ page: 1, limit: PAGE_SIZE, search: search.trim() || undefined, status: "active" })
        .then((response) => {
          if (version !== requestVersion.current) return;
          setProducts(response.data);
          setPagination(response.pagination);
        })
        .catch((error: unknown) => {
          if (version === requestVersion.current) {
            setProducts([]);
            setPagination({ page: 1, totalPages: 1, total: 0 });
            setProductError(errorMessage(error));
          }
        })
        .finally(() => {
          if (version === requestVersion.current) setLoading(false);
        });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const loadMore = useCallback(async () => {
    if (loadingMore || loading || pagination.page >= pagination.totalPages) return;
    const version = requestVersion.current;
    const loadRequest = ++loadMoreVersion.current;
    setLoadingMore(true);
    setProductError("");
    try {
      const response = await productsService.list({
        page: pagination.page + 1,
        limit: PAGE_SIZE,
        search: search.trim() || undefined,
        status: "active",
      });
      if (version !== requestVersion.current) return;
      setProducts((existing) => {
        const seen = new Set(existing.map((product) => product.id));
        return [...existing, ...response.data.filter((product) => !seen.has(product.id))];
      });
      setPagination(response.pagination);
    } catch (error) {
      if (version === requestVersion.current) setProductError(errorMessage(error));
    } finally {
      if (loadRequest === loadMoreVersion.current) setLoadingMore(false);
    }
  }, [loading, loadingMore, pagination.page, pagination.totalPages, search]);

  const addProduct = useCallback((product: RetailyProduct) => {
    const unitPrice = safeUnitPrice(product);
    if (!unitPrice) return;
    setCart((current) => {
      const existing = current[product.id];
      const nextQuantity = (existing?.quantity ?? 0) + 1;
      if (!Number.isSafeInteger(nextQuantity) || unitPrice * BigInt(nextQuantity) > BigInt(Number.MAX_SAFE_INTEGER)) return current;
      return { ...current, [product.id]: { product, quantity: nextQuantity } };
    });
  }, []);

  const changeQuantity = useCallback((productId: string, delta: number) => {
    setCart((current) => {
      const line = current[productId];
      if (!line) return current;
      const quantity = line.quantity + delta;
      if (quantity <= 0) {
        const next = { ...current };
        delete next[productId];
        return next;
      }
      const price = safeUnitPrice(line.product);
      if (!Number.isSafeInteger(quantity) || !price || price * BigInt(quantity) > BigInt(Number.MAX_SAFE_INTEGER)) return current;
      return { ...current, [productId]: { ...line, quantity } };
    });
  }, []);

  const removeProduct = useCallback((productId: string) => {
    setCart((current) => {
      const next = { ...current };
      delete next[productId];
      return next;
    });
  }, []);

  const closeAttemptToEdit = useCallback(() => {
    setActiveAttempt((current) => current?.phase === "rejected" ? null : current);
  }, []);

  const finishSale = useCallback((sale: RetailySaleResponse) => {
    try { window.localStorage.removeItem(localAttemptStorageKey); } catch { /* Session state still retains the key until this sale is shown. */ }
    setCompletedSale(sale);
    dispatchCheckoutDraft({ type: "discard" });
    setActiveAttempt(null);
    setPaymentOpen(false);
    void refreshPendingAttempts();
  }, [localAttemptStorageKey, refreshPendingAttempts]);

  const closePaymentDialog = useCallback(() => {
    const transition = closeCheckoutDraft(checkoutDraft);
    setPaymentOpen(transition.isOpen);
  }, [checkoutDraft]);

  const discardPaymentDraft = useCallback(() => {
    const transition = discardCheckoutDraft(
      checkoutDraft,
      window.confirm("Discard all payment and discount entries for this checkout?"),
    );
    if (!transition.isOpen) dispatchCheckoutDraft({ type: "discard" });
    setPaymentOpen(transition.isOpen);
  }, [checkoutDraft]);

  const setAttemptFailure = useCallback((
    error: unknown,
    request: RetailyCreateSaleRequest,
    idempotencyKey: string,
    stage: "save" | "sale",
    preserveUncertainOutcome = false,
  ) => {
    const safeError = error instanceof SalesServiceError
      ? error
      : new SalesServiceError(salesTransportFailure("unknown"));
    const remainsUnknown = preserveUncertainOutcome || safeError.outcome === "unknown";
    setActiveAttempt({
      idempotencyKey,
      request,
      phase: remainsUnknown ? "unknown" : "rejected",
      error: safeError,
      stage,
    });
    if (!remainsUnknown && safeError.outcome === "rejected") {
      try { window.localStorage.removeItem(localAttemptStorageKey); } catch { /* The server attempt remains available in the pending list. */ }
      if (stage === "sale") void refreshPendingAttempts();
      if (safeError.code === "INSUFFICIENT_PAYMENT") {
        const productIds = Object.keys(cart);
        void Promise.all(productIds.map(async (productId) => {
          try {
            const response = await productsService.get(productId);
            return response.data;
          } catch {
            return null;
          }
        })).then((updatedProducts) => {
          const updatedById = new Map(updatedProducts.filter((product): product is RetailyProduct => product !== null).map((product) => [product.id, product]));
          setCart((current) => Object.fromEntries(Object.entries(current).map(([productId, line]) => [
            productId,
            updatedById.has(productId) ? { ...line, product: updatedById.get(productId)! } : line,
          ])));
          setProducts((current) => current.map((product) => updatedById.get(product.id) ?? product));
        });
      }
    }
    setAttemptBusy(false);
  }, [cart, localAttemptStorageKey, refreshPendingAttempts]);

  const submitExactAttempt = useCallback(async (
    request: RetailyCreateSaleRequest,
    idempotencyKey: string,
  ) => {
    try {
      window.localStorage.setItem(localAttemptStorageKey, JSON.stringify({
        idempotencyKey,
        request,
        stage: "sale",
      }));
    } catch { /* The original key remains in the attempt state for this session. */ }
    setActiveAttempt({ idempotencyKey, request, phase: "submitting", stage: "sale" });
    try {
      const sale = await submitPersistedAttempt(salesService, request, idempotencyKey);
      finishSale(sale);
    } catch (error) {
      setAttemptFailure(error, request, idempotencyKey, "sale");
    }
  }, [finishSale, localAttemptStorageKey, setAttemptFailure]);

  const createCheckoutAttempt = useCallback(async (request: RetailyCreateSaleRequest) => {
    if (!selectedBranch || cartLocked || !operationGate.current.tryAcquire()) return;
    setAttemptBusy(true);
    setPaymentOpen(false);
    const idempotencyKey = window.crypto.randomUUID();
    try {
      window.localStorage.setItem(localAttemptStorageKey, JSON.stringify({
        idempotencyKey,
        request,
        stage: "save",
      }));
    } catch {
      operationGate.current.release();
      setAttemptBusy(false);
      setPendingAttemptError("Retaily could not store this checkout recovery key on this device. Check available local storage and try again.");
      return;
    }
    setActiveAttempt({ idempotencyKey, request, phase: "saving", stage: "save" });
    let stage: "save" | "sale" = "save";
    try {
      const sale = await persistAndSubmitAttempt(
        salesService,
        request,
        idempotencyKey,
        (saved) => {
          stage = "sale";
          setPendingAttempts((existing) => [
            ...existing.filter((item) => item.idempotencyKey !== idempotencyKey),
            saved,
          ]);
        },
        () => setActiveAttempt({ idempotencyKey, request, phase: "submitting", stage: "sale" }),
      );
      finishSale(sale);
    } catch (error) {
      setAttemptFailure(error, request, idempotencyKey, stage);
      if (error instanceof SalesServiceError && error.outcome === "unknown") {
        setPendingAttempts((existing) => existing.some((item) => item.idempotencyKey === idempotencyKey)
          ? existing
          : [{
              idempotencyKey,
              status: "pending",
              request,
              saleId: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              completedAt: null,
              sale: null,
            }, ...existing]);
      }
    } finally {
      operationGate.current.release();
      setAttemptBusy(false);
    }
  }, [cartLocked, finishSale, localAttemptStorageKey, selectedBranch, setAttemptFailure]);

  const retryAttempt = useCallback(async () => {
    const attempt = activeAttempt;
    if (!attempt || operationGate.current.isLocked || attempt.phase !== "unknown" || !operationGate.current.tryAcquire()) return;
    setAttemptBusy(true);
    let stage = attempt.stage ?? "sale";
    try {
      const sale = await retryExactAttempt(
        salesService,
        attempt.request,
        attempt.idempotencyKey,
        stage,
        (saved) => {
          stage = "sale";
          setPendingAttempts((existing) => [
            ...existing.filter((item) => item.idempotencyKey !== attempt.idempotencyKey),
            saved,
          ]);
        },
        () => {
          stage = "sale";
          setActiveAttempt({ ...attempt, phase: "submitting", stage: "sale" });
        },
      );
      finishSale(sale);
    } catch (error) {
      setAttemptFailure(error, attempt.request, attempt.idempotencyKey, stage, true);
    } finally {
      operationGate.current.release();
      setAttemptBusy(false);
    }
  }, [activeAttempt, finishSale, setAttemptFailure, submitExactAttempt]);

  const recoverAttempt = useCallback(async () => {
    const attempt = activeAttempt;
    if (!attempt || !operationGate.current.tryAcquire()) return;
    setAttemptBusy(true);
    try {
      const recovered = await recoverSavedAttempt(salesService, attempt.idempotencyKey);
      if (recovered.status === "completed" && recovered.sale) {
        finishSale(recovered.sale);
      } else {
        setActiveAttempt({
          idempotencyKey: attempt.idempotencyKey,
          request: recovered.request,
          phase: "pending",
          message: "The attempt is saved and no completed sale is recorded. Continue with this exact request and key.",
          stage: "sale",
        });
      }
    } catch (error) {
      if (error instanceof SalesServiceError && error.status === 404) {
        setActiveAttempt({
          ...attempt,
          phase: "unknown",
          stage: "save",
          message: "No saved attempt was found. Retry will save this exact request with the same key before submitting.",
        });
      } else {
        setAttemptFailure(error, attempt.request, attempt.idempotencyKey, attempt.stage ?? "sale", true);
      }
    } finally {
      operationGate.current.release();
      setAttemptBusy(false);
    }
  }, [activeAttempt, finishSale, setAttemptFailure]);

  const submitSavedAttempt = useCallback(async () => {
    const attempt = activeAttempt;
    if (!attempt || !canSubmitAttempt(attempt.phase) || !operationGate.current.tryAcquire()) return;
    setAttemptBusy(true);
    try {
      await submitExactAttempt(attempt.request, attempt.idempotencyKey);
    } finally {
      operationGate.current.release();
      setAttemptBusy(false);
    }
  }, [activeAttempt, submitExactAttempt]);

  const resumePendingAttempt = useCallback(async (attempt: RetailyCheckoutAttempt) => {
    if (Object.keys(cart).length > 0 && !window.confirm("Resuming this saved checkout replaces the current cart. Continue?")) return;
    if (!operationGate.current.tryAcquire()) return;
    try {
      const availableBranch = branches.find((branch) => branch.id === attempt.request.branchId);
      if (availableBranch) setSelectedBranchId(availableBranch.id);
      try {
        window.localStorage.setItem(localAttemptStorageKey, JSON.stringify({
          idempotencyKey: attempt.idempotencyKey,
          request: attempt.request,
          stage: "sale",
        }));
      } catch {
        setPendingAttemptError("Retaily could not store the recovery key on this device. This saved attempt remains on the server; free local storage and retry recovery.");
        return;
      }
      const restored = await Promise.all(attempt.request.items.map(async (item) => {
        try {
          const response = await productsService.get(item.productId);
          return [item.productId, { product: response.data, quantity: item.quantity }] as const;
        } catch {
          return null;
        }
      }));
      setCart(Object.fromEntries(restored.filter((item): item is NonNullable<typeof item> => item !== null)));
      setActiveAttempt({
        idempotencyKey: attempt.idempotencyKey,
        request: attempt.request,
        phase: "pending",
        stage: "sale",
        message: "Recovered from saved checkout attempts. Continue or check its status using the original request and key.",
      });
      setCompletedSale(null);
    } finally {
      operationGate.current.release();
    }
  }, [branches, cart, localAttemptStorageKey]);

  const changeBranch = useCallback((nextBranchId: string) => {
    if (!canChangeBranch(cartLocked || paymentOpen) || nextBranchId === selectedBranchId) return;
    if (branchChangeNeedsCartConfirmation(Object.keys(cart).length > 0)) {
      const branchName = branches.find((branch) => branch.id === nextBranchId)?.name ?? "the selected branch";
      if (!window.confirm(`Changing to ${branchName} clears the current cart. Continue?`)) return;
      setCart({});
    }
    setSelectedBranchId(nextBranchId);
  }, [branches, cart, cartLocked, paymentOpen, selectedBranchId]);

  const startNewSale = useCallback(() => {
    setCompletedSale(null);
    setActiveAttempt(null);
    setPaymentOpen(false);
    setCart({});
    void refreshPendingAttempts();
  }, [refreshPendingAttempts]);

  useEffect(() => {
    let active = true;
    let stored: { idempotencyKey?: unknown; request?: unknown; stage?: unknown } | null = null;
    try {
      const value = window.localStorage.getItem(localAttemptStorageKey);
      stored = value ? JSON.parse(value) : null;
    } catch {
      stored = null;
    }
    if (
      !stored ||
      typeof stored.idempotencyKey !== "string" ||
      stored.idempotencyKey.length < 1 ||
      stored.idempotencyKey.length > 128 ||
      !isSavedSaleRequest(stored.request)
    ) {
      if (stored) setPendingAttemptError("A saved checkout recovery record could not be read. Check pending attempts and contact a supervisor if a completed sale is missing.");
      return () => { active = false; };
    }
    const request = stored.request;
    const idempotencyKey = stored.idempotencyKey;
    const stage = stored.stage === "save" ? "save" : "sale";
    setActiveAttempt({
      idempotencyKey,
      request,
      phase: "unknown",
      stage,
      message: "Recovering the checkout attempt saved on this device…",
    });
    void salesService.getCheckoutAttempt(idempotencyKey)
      .then((result) => {
        if (!active) return;
        if (result.data.status === "completed" && result.data.sale) {
          finishSale(result.data.sale);
        } else {
          setActiveAttempt({
            idempotencyKey,
            request: result.data.request,
            phase: "pending",
            stage: "sale",
            message: "Recovered after reopening Retaily. Continue with the exact saved request and key.",
          });
          setPendingAttempts((existing) => existing.some((item) => item.idempotencyKey === idempotencyKey)
            ? existing
            : [result.data, ...existing]);
        }
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof SalesServiceError && error.status === 404) {
          setActiveAttempt({
            idempotencyKey,
            request,
            phase: "unknown",
            stage: "save",
            message: "No attempt is recorded on the server yet. Retry will save this exact request with the same key.",
          });
        } else {
          setAttemptFailure(error, request, idempotencyKey, stage, true);
        }
      });
    return () => { active = false; };
  }, [finishSale, localAttemptStorageKey, setAttemptFailure]);

  const subtotalMinor = useMemo(
    () => Object.values(cart).reduce((sum, line) => {
      const price = safeUnitPrice(line.product);
      return price ? sum + price * BigInt(line.quantity) : sum;
    }, 0n),
    [cart],
  );
  const cartCount = Object.values(cart).reduce((sum, line) => sum + line.quantity, 0);
  const canDiscount = user.permissions.includes("*") || user.permissions.includes("sales.discount_limited") || user.permissions.includes("sales.discount_full");

  return (
    <div className={styles.page}>
      <section className={styles.catalog} aria-label="Product catalogue">
        <div className={styles.heading}>
          <div>
            <span className={styles.eyebrow}>POINT OF SALE</span>
            <h1>Start a sale</h1>
            <p>Choose a branch, find products, and build the cart.</p>
          </div>
          <div className={styles.cashier}><span>Cashier</span><strong>{user.fullName}</strong></div>
        </div>

        <div className={styles.branchPanel}>
          <div className={styles.branchLabel}>Selling at</div>
          {branchLoading ? (
            <div className={styles.branchStatus}><LoaderCircle size={17} className={styles.spin} /> Loading accessible branches…</div>
          ) : branchError ? (
            <div className={styles.inlineError}><AlertCircle size={16} />{branchError}</div>
          ) : branches.length === 0 ? (
            <div className={styles.branchStatus}>No accessible branches are available for your account.</div>
          ) : branches.length === 1 ? (
            <div className={styles.branchChosen}><Check size={17} /><strong>{branches[0].name}</strong><span>{branches[0].code}</span></div>
          ) : (
            <label className={styles.branchSelectWrap}>
              <span className={styles.visuallyHidden}>Select a branch</span>
              <select value={selectedBranchId} onChange={(event) => changeBranch(event.target.value)} disabled={cartLocked || paymentOpen || branchLoading}>
                <option value="">Select a branch</option>
                {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name} · {branch.code}</option>)}
              </select>
              <ChevronDown size={16} />
            </label>
          )}
          {branches.length > 0 && !selectedBranch && !branchLoading && !branchError && branches.length > 1 && (
            <span className={styles.branchHint}>Select where this sale will take place.</span>
          )}
        </div>

        {(attemptListLoading || pendingAttemptError || pendingAttempts.length > 0) && (
          <div className={styles.recoveryPanel}>
            <div className={styles.recoveryHeading}>
              <div><strong>Saved checkout attempts</strong><span>Pending attempts stay saved until recovered or completed.</span></div>
              <button type="button" onClick={() => void refreshPendingAttempts()} disabled={attemptListLoading} aria-label="Refresh saved attempts"><LoaderCircle size={15} className={attemptListLoading ? styles.spin : ""} /></button>
            </div>
            {pendingAttemptError ? <p className={styles.recoveryError}>{pendingAttemptError}</p> : null}
            {pendingAttempts.map((attempt) => (
              <div className={styles.recoveryItem} key={attempt.idempotencyKey}>
                <div><strong>{branches.find((branch) => branch.id === attempt.request.branchId)?.name ?? "Branch unavailable"}</strong><span>{new Date(attempt.updatedAt).toLocaleString()} · {attempt.request.items.length} lines</span></div>
                <Button size="small" variant="outline" disabled={Boolean(activeAttempt) || Boolean(completedSale)} onClick={() => void resumePendingAttempt(attempt)}>Resume</Button>
              </div>
            ))}
            {!attemptListLoading && pendingAttempts.length === 0 && !pendingAttemptError && <span className={styles.recoveryEmpty}>No pending attempts.</span>}
          </div>
        )}

        <div className={styles.catalogToolbar}>
          <div><h2>Products</h2><span>{pagination.total} active items</span></div>
          <label className={styles.searchInput}>
            <Search size={17} />
            <input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, SKU or scan barcode" aria-label="Search products by name, SKU or barcode" />
          </label>
        </div>

        {productError && <div className={styles.errorBanner}><AlertCircle size={17} />{productError}</div>}
        {loading ? (
          <div className={styles.state}><LoaderCircle size={24} className={styles.spin} /><span>Loading products…</span></div>
        ) : products.length === 0 ? (
          <div className={styles.state}><ShoppingBag size={26} /><strong>{search ? "No matching products" : "No active products yet"}</strong><span>{search ? "Try another name, SKU or barcode." : "Active products will appear here."}</span></div>
        ) : (
          <div className={styles.productGrid}>
            {products.map((product) => {
              const price = safeUnitPrice(product);
              const canAdd = Boolean(selectedBranch) && price !== null && !cartLocked;
              return (
                <button key={product.id} type="button" className={styles.productCard} onClick={() => addProduct(product)} disabled={!canAdd}>
                  <span className={styles.productIcon}><ShoppingBag size={19} /></span>
                  <span className={styles.productName}>{product.name}</span>
                  <span className={styles.productSku}>{product.sku}</span>
                  <span className={styles.productFooter}><strong>{formatMinor(price ?? 0n, currency)}</strong><span className={styles.addIcon}><Plus size={16} /></span></span>
                </button>
              );
            })}
          </div>
        )}
        {!loading && products.length > 0 && pagination.page < pagination.totalPages && (
          <button type="button" className={styles.loadMore} onClick={() => void loadMore()} disabled={loadingMore}>
            {loadingMore && <LoaderCircle size={15} className={styles.spin} />}{loadingMore ? "Loading more…" : "Load more products"}
          </button>
        )}
      </section>

      <aside className={styles.cartPanel} aria-label="Shopping cart">
        <div className={styles.cartHeader}><div><span className={styles.eyebrow}>CURRENT SALE</span><h2>Cart</h2></div><span className={styles.itemCount}>{cartCount} {cartCount === 1 ? "item" : "items"}</span></div>
        {!selectedBranch && <div className={styles.cartNotice}>Select an accessible branch to add products.</div>}
        <div className={styles.cartLines}>
          {Object.values(cart).length === 0 ? (
            <div className={styles.cartEmpty}><ShoppingBag size={28} /><strong>Your cart is empty</strong><span>Add products to see the sale summary.</span></div>
          ) : Object.values(cart).map(({ product, quantity }) => {
            const unitPrice = safeUnitPrice(product) ?? 0n;
            const lineTotal = unitPrice * BigInt(quantity);
            return (
              <div className={styles.cartLine} key={product.id}>
                <div className={styles.lineDetails}><strong>{product.name}</strong><span>{formatMinor(unitPrice, currency)} each</span><b>{formatMinor(lineTotal, currency)}</b></div>
                <div className={styles.lineActions}>
                  <div className={styles.quantityControl}>
                    <button type="button" aria-label={`Decrease ${product.name} quantity`} onClick={() => changeQuantity(product.id, -1)} disabled={cartLocked}><Minus size={14} /></button>
                    <span>{quantity}</span>
                    <button type="button" aria-label={`Increase ${product.name} quantity`} onClick={() => changeQuantity(product.id, 1)} disabled={cartLocked}><Plus size={14} /></button>
                  </div>
                  <button type="button" className={styles.removeButton} aria-label={`Remove ${product.name}`} onClick={() => removeProduct(product.id)} disabled={cartLocked}><Trash2 size={15} /></button>
                </div>
              </div>
            );
          })}
        </div>
        <div className={styles.summary}>
          {!currencyValid && <p className={styles.errorBanner} role="alert">The configured business currency is invalid. Checkout is disabled until it is corrected.</p>}
          <div><span>Subtotal</span><strong>{formatMinor(subtotalMinor, currency)}</strong></div>
          {canDiscount && <p className={styles.discountHint}>Discounts are available for your role during checkout.</p>}
          <div className={styles.total}><span>Total preview</span><strong>{formatMinor(subtotalMinor, currency)}</strong></div>
          <button type="button" className={styles.checkoutButton} disabled={!currencyValid || !selectedBranch || cartCount === 0 || cartLocked} onClick={() => setPaymentOpen(true)}>Continue to payment</button>
          <span className={styles.checkoutNote}>Server pricing and final totals are confirmed when the sale is submitted.</span>
        </div>
      </aside>

      {paymentOpen && selectedBranch && (
        <PaymentDialog
          isOpen
          branch={selectedBranch}
          currency={currency}
          cart={Object.values(cart)}
          permissions={user.permissions}
          draft={checkoutDraft}
          dispatchDraft={dispatchCheckoutDraft}
          onClose={closePaymentDialog}
          onDiscard={discardPaymentDraft}
          onSubmit={(request) => void createCheckoutAttempt(request)}
        />
      )}

      {activeAttempt && (
        <CheckoutAttemptDialog
          attempt={activeAttempt}
          branchName={branches.find((branch) => branch.id === activeAttempt.request.branchId)?.name ?? "Branch not currently accessible"}
          productNames={Object.fromEntries(Object.values(cart).map(({ product }) => [product.id, product.name]))}
          currency={currency}
          isBusy={attemptBusy}
          onSubmit={() => void submitSavedAttempt()}
          onRetry={() => void retryAttempt()}
          onRecover={() => void recoverAttempt()}
          onReturnToCart={closeAttemptToEdit}
        />
      )}

      {completedSale && (
        <SaleConfirmation
          sale={completedSale}
          businessName={user.business.name}
          branchName={branches.find((branch) => branch.id === completedSale.branchId)?.name ?? "Branch unavailable"}
          cashier={user.fullName}
          onNewSale={startNewSale}
        />
      )}
    </div>
  );
}
