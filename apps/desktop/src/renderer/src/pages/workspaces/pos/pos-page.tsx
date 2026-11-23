import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import styles from "./pos-page.module.scss";

type CurrentUser = Awaited<ReturnType<typeof window.retaily.getCurrentUser>>;
type CartLine = { product: RetailyProduct; quantity: number };

const PAGE_SIZE = 24;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function currencyCode(value: string) {
  const normalized = value.trim().toUpperCase();
  try {
    new Intl.NumberFormat("en", { style: "currency", currency: normalized });
    return normalized;
  } catch {
    return "USD";
  }
}

function formatMinor(amountMinor: bigint, currency: string) {
  const code = currencyCode(currency);
  const formatter = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: code,
  });
  const digits = formatter.resolvedOptions().maximumFractionDigits;
  const scale = 10n ** BigInt(digits);
  const whole = amountMinor / scale;
  const fraction = (amountMinor % scale).toString().padStart(digits, "0");
  return formatter
    .formatToParts(whole)
    .map((part) => (part.type === "fraction" ? fraction : part.value))
    .join("");
}

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
  const requestVersion = useRef(0);
  const loadMoreVersion = useRef(0);
  const currency = user.business.currency;
  const selectedBranch = branches.find((branch) => branch.id === selectedBranchId);

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

  const subtotalMinor = useMemo(
    () => Object.values(cart).reduce((sum, line) => {
      const price = safeUnitPrice(line.product);
      return price ? sum + price * BigInt(line.quantity) : sum;
    }, 0n),
    [cart],
  );
  const cartCount = Object.values(cart).reduce((sum, line) => sum + line.quantity, 0);
  const canDiscount = user.permissions.includes("sales.discount_limited") || user.permissions.includes("sales.discount_full");

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
              <select value={selectedBranchId} onChange={(event) => setSelectedBranchId(event.target.value)}>
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
              const canAdd = Boolean(selectedBranch) && price !== null;
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
                    <button type="button" aria-label={`Decrease ${product.name} quantity`} onClick={() => changeQuantity(product.id, -1)}><Minus size={14} /></button>
                    <span>{quantity}</span>
                    <button type="button" aria-label={`Increase ${product.name} quantity`} onClick={() => changeQuantity(product.id, 1)}><Plus size={14} /></button>
                  </div>
                  <button type="button" className={styles.removeButton} aria-label={`Remove ${product.name}`} onClick={() => removeProduct(product.id)}><Trash2 size={15} /></button>
                </div>
              </div>
            );
          })}
        </div>
        <div className={styles.summary}>
          <div><span>Subtotal</span><strong>{formatMinor(subtotalMinor, currency)}</strong></div>
          {canDiscount && <p className={styles.discountHint}>Discounts are available for your role during checkout.</p>}
          <div className={styles.total}><span>Total preview</span><strong>{formatMinor(subtotalMinor, currency)}</strong></div>
          <button type="button" className={styles.checkoutButton} disabled>Checkout coming next</button>
          <span className={styles.checkoutNote}>Totals are a preview. Stock and final pricing are confirmed when a sale is submitted.</span>
        </div>
      </aside>
    </div>
  );
}
