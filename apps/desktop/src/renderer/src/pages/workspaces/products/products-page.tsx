import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  AlertCircle,
  Archive,
  Barcode,
  ChevronLeft,
  ChevronRight,
  CirclePlus,
  Edit3,
  LoaderCircle,
  Package,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";

import { productsService } from "../../../services/products.service";
import type { ProductListParams } from "../../../services/products.service";
import styles from "./products-page.module.scss";
import CategoriesModal from "./categories-modal";
import { FolderCog } from "lucide-react";

interface ProductsPageProps {
  permissions: string[];
}

type ProductStatus = "active" | "inactive" | "all";

interface ProductFormState {
  name: string;
  sku: string;
  categoryId: string;
  description: string;
  unit: string;
  costPrice: string;
  sellingPrice: string;
  trackStock: boolean;
  barcode: string;
}

const emptyForm: ProductFormState = {
  name: "",
  sku: "",
  categoryId: "",
  description: "",
  unit: "piece",
  costPrice: "",
  sellingPrice: "",
  trackStock: true,
  barcode: "",
};

function getCurrencyCode(currency: string) {
  const normalized = currency.trim().toUpperCase();

  try {
    new Intl.NumberFormat("en", {
      style: "currency",
      currency: normalized,
    });
    return normalized;
  } catch {
    return "USD";
  }
}

function getCurrencyFractionDigits(currency: string) {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: getCurrencyCode(currency),
  }).resolvedOptions().maximumFractionDigits;
}

function toMinorUnits(value: string, currency: string) {
  const amount = Number(value);
  const fractionDigits = getCurrencyFractionDigits(currency);
  return Math.round(amount * 10 ** fractionDigits);
}

function formatPrice(minorUnits: number, currency: string) {
  const currencyCode = getCurrencyCode(currency);
  const fractionDigits = getCurrencyFractionDigits(currency);
  const amount = minorUnits / 10 ** fractionDigits;

  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currencyCode,
  }).format(amount);
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Something went wrong. Please try again.";
}

export default function ProductsPage({ permissions }: ProductsPageProps) {
  const canManage = permissions.includes("products.manage");

  const [products, setProducts] = useState<RetailyProduct[]>([]);
  const [categories, setCategories] = useState<RetailyCategory[]>([]);
  const [currency, setCurrency] = useState("USD");
  const [stats, setStats] = useState<RetailyProductStats>({
    totalProducts: 0,
    activeProducts: 0,
    inactiveProducts: 0,
    totalCategories: 0,
  });
  const [statsLoading, setStatsLoading] = useState(true);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 0,
  });

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProductStatus>("active");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pageError, setPageError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<RetailyProduct | null>(
    null,
  );
  const [form, setForm] = useState<ProductFormState>(emptyForm);
  const [formError, setFormError] = useState("");

  const [categoriesOpen, setCategoriesOpen] = useState(false);

  const loadBusinessProfile = useCallback(async () => {
    const currentUser = await window.retaily.getCurrentUser();
    setCurrency(getCurrencyCode(currentUser.business.currency));
  }, []);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);

    try {
      const response = await productsService.stats();
      setStats(response.data);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const loadCategories = useCallback(async () => {
    const response = await productsService.categories();
    setCategories(response.data);
  }, []);

  const loadProducts = useCallback(
    async (page = 1) => {
      setLoading(true);
      setPageError("");

      try {
        const params: ProductListParams = {
          page,
          limit: pagination.limit,
          search: search.trim() || undefined,
          categoryId: categoryFilter || undefined,
          status: statusFilter,
        };

        const response = await productsService.list(params);

        setProducts(response.data);
        setPagination(response.pagination);
      } catch (error) {
        setPageError(getErrorMessage(error));
      } finally {
        setLoading(false);
      }
    },
    [categoryFilter, pagination.limit, search, statusFilter],
  );

  useEffect(() => {
    void loadCategories().catch((error) => {
      setPageError(getErrorMessage(error));
    });
  }, [loadCategories]);

  useEffect(() => {
    void loadBusinessProfile().catch((error) => {
      setPageError(getErrorMessage(error));
    });
  }, [loadBusinessProfile]);

  useEffect(() => {
    void loadStats().catch((error) => {
      setPageError(getErrorMessage(error));
    });
  }, [loadStats]);

  useEffect(() => {
    void loadProducts(1);
  }, [loadProducts]);

  function openCreateForm() {
    setEditingProduct(null);
    setForm(emptyForm);
    setFormError("");
    setFormOpen(true);
    setSuccessMessage("");
  }

  function openEditForm(product: RetailyProduct) {
    setEditingProduct(product);
    setForm({
      name: product.name,
      sku: product.sku,
      categoryId: product.categoryId ?? "",
      description: product.description ?? "",
      unit: product.unit,
      costPrice: formatPrice(product.costPriceMinor, currency),
      sellingPrice: formatPrice(product.sellingPriceMinor, currency),
      trackStock: product.trackStock,
      barcode: "",
    });
    setFormError("");
    setFormOpen(true);
    setSuccessMessage("");
  }

  function closeForm() {
    if (saving) return;
    setFormOpen(false);
    setEditingProduct(null);
    setForm(emptyForm);
    setFormError("");
  }

  function updateForm<K extends keyof ProductFormState>(
    field: K,
    value: ProductFormState[K],
  ) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");

    const cost = Number(form.costPrice);
    const selling = Number(form.sellingPrice);

    if (!form.name.trim()) {
      setFormError("Enter a product name.");
      return;
    }

    if (!form.sku.trim()) {
      setFormError("Enter a SKU.");
      return;
    }

    if (
      !form.costPrice.trim() ||
      !form.sellingPrice.trim() ||
      !Number.isFinite(cost) ||
      !Number.isFinite(selling) ||
      cost < 0 ||
      selling < 0
    ) {
      setFormError("Enter valid cost and selling prices.");
      return;
    }

    setSaving(true);

    try {
      if (editingProduct) {
        const input: RetailyProductUpdate = {
          name: form.name.trim(),
          sku: form.sku.trim(),
          categoryId: form.categoryId || null,
          description: form.description.trim() || null,
          unit: form.unit.trim() || "piece",
          costPriceMinor: toMinorUnits(form.costPrice, currency),
          sellingPriceMinor: toMinorUnits(form.sellingPrice, currency),
          trackStock: form.trackStock,
        };

        await productsService.update(editingProduct.id, input);

        if (form.barcode.trim()) {
          await productsService.addBarcode(
            editingProduct.id,
            form.barcode.trim(),
          );
        }

        setSuccessMessage("Product updated successfully.");
      } else {
        const input: RetailyProductInput = {
          name: form.name.trim(),
          sku: form.sku.trim(),
          categoryId: form.categoryId || null,
          description: form.description.trim() || null,
          unit: form.unit.trim() || "piece",
          costPriceMinor: toMinorUnits(form.costPrice, currency),
          sellingPriceMinor: toMinorUnits(form.sellingPrice, currency),
          trackStock: form.trackStock,
          barcode: form.barcode.trim() || null,
        };

        await productsService.create(input);
        setSuccessMessage("Product created successfully.");
      }

      closeForm();
      await Promise.all([loadProducts(pagination.page), loadStats()]);
    } catch (error) {
      setFormError(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(product: RetailyProduct) {
    if (!canManage) return;

    const nextStatus = product.status === "active" ? "inactive" : "active";

    const confirmed = window.confirm(
      `${nextStatus === "inactive" ? "Deactivate" : "Activate"} ${product.name}?`,
    );

    if (!confirmed) return;

    setPageError("");
    setSuccessMessage("");

    try {
      await productsService.updateStatus(product.id, nextStatus);
      setSuccessMessage(
        `${product.name} ${nextStatus === "active" ? "activated" : "deactivated"}.`,
      );
      await Promise.all([loadProducts(pagination.page), loadStats()]);
    } catch (error) {
      setPageError(getErrorMessage(error));
    }
  }

  function handleSearchChange(value: string) {
    setSearch(value);
  }

  const pageStart =
    pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1;

  const pageEnd = Math.min(
    pagination.page * pagination.limit,
    pagination.total,
  );

  return (
    <div className={styles.page}>
      <div className={styles.heading}>
        <div>
          <span className={styles.eyebrow}>CATALOGUE MANAGEMENT</span>
          <h1>Products</h1>
          <p>
            Manage your products, pricing, categories and product information.
          </p>
        </div>

        <div className={styles.headingActions}>
          {canManage && (
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => setCategoriesOpen(true)}
            >
              <FolderCog size={17} />
              Categories
            </button>
          )}
          <button
            type="button"
            className={styles.refreshButton}
            onClick={() =>
              void Promise.all([
                loadProducts(pagination.page),
                loadCategories(),
                loadStats(),
              ])
            }
            disabled={loading || statsLoading}
            title="Refresh products"
          >
            <RefreshCw size={17} className={loading ? styles.spinning : ""} />
          </button>

          {canManage && (
            <button
              type="button"
              className={styles.primaryButton}
              onClick={openCreateForm}
            >
              <Plus size={18} />
              Add product
            </button>
          )}
        </div>
      </div>

      <section className={styles.statsGrid}>
        <article className={styles.statCard}>
          <div className={styles.statIcon}>
            <Package size={19} />
          </div>
          <div>
            <span>Total products</span>
            <strong>{statsLoading ? "..." : stats.totalProducts}</strong>
          </div>
        </article>

        <article className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.greenIcon}`}>
            <Package size={19} />
          </div>
          <div>
            <span>Active products</span>
            <strong>{statsLoading ? "..." : stats.activeProducts}</strong>
          </div>
        </article>

        <article className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.orangeIcon}`}>
            <Archive size={19} />
          </div>
          <div>
            <span>Inactive products</span>
            <strong>{statsLoading ? "..." : stats.inactiveProducts}</strong>
          </div>
        </article>

        <article className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.blueIcon}`}>
            <Barcode size={19} />
          </div>
          <div>
            <span>Active categories</span>
            <strong>{statsLoading ? "..." : stats.totalCategories}</strong>
          </div>
        </article>
      </section>

      {successMessage && (
        <div className={styles.successMessage}>
          <span>{successMessage}</span>
          <button
            type="button"
            onClick={() => setSuccessMessage("")}
            aria-label="Dismiss message"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {pageError && (
        <div className={styles.errorMessage}>
          <AlertCircle size={17} />
          <span>{pageError}</span>
          <button
            type="button"
            onClick={() => setPageError("")}
            aria-label="Dismiss error"
          >
            <X size={15} />
          </button>
        </div>
      )}

      <section className={styles.catalogue}>
        <div className={styles.catalogueHeading}>
          <div>
            <h2>Product catalogue</h2>
            <p>Search and manage the products in your business.</p>
          </div>
        </div>

        <div className={styles.filters}>
          <label className={styles.searchBox}>
            <Search size={18} />
            <input
              type="search"
              placeholder="Search by name, SKU or barcode..."
              value={search}
              onChange={(event) => handleSearchChange(event.target.value)}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
              >
                <X size={15} />
              </button>
            )}
          </label>

          <select
            className={styles.filterSelect}
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            aria-label="Filter by category"
          >
            <option value="">All categories</option>
            {categories
              .filter((category) => category.isActive === 1)
              .map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
          </select>

          <select
            className={styles.filterSelect}
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as ProductStatus)
            }
            aria-label="Filter by status"
          >
            <option value="active">Active products</option>
            <option value="inactive">Inactive products</option>
            <option value="all">All products</option>
          </select>
        </div>

        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>PRODUCT</th>
                <th>SKU / BARCODE</th>
                <th>CATEGORY</th>
                <th>COST PRICE</th>
                <th>SELLING PRICE</th>
                <th>STOCK TRACKING</th>
                <th>STATUS</th>
                {canManage && <th className={styles.actionsHeader}>ACTIONS</th>}
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={canManage ? 8 : 7}
                    className={styles.loadingCell}
                  >
                    <LoaderCircle size={22} className={styles.spinning} />
                    Loading products...
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={canManage ? 8 : 7} className={styles.emptyCell}>
                    <div className={styles.emptyIcon}>
                      <Package size={25} />
                    </div>
                    <strong>No products found</strong>
                    <span>
                      {search || categoryFilter || statusFilter !== "active"
                        ? "Try changing your search or filters."
                        : "Add your first product to start building your catalogue."}
                    </span>
                    {canManage && !search && !categoryFilter && (
                      <button
                        type="button"
                        className={styles.emptyAddButton}
                        onClick={openCreateForm}
                      >
                        <CirclePlus size={16} />
                        Add your first product
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                products.map((product) => (
                  <tr key={product.id}>
                    <td>
                      <div className={styles.productName}>
                        <div className={styles.productIcon}>
                          <Package size={17} />
                        </div>
                        <div>
                          <strong>{product.name}</strong>
                          <span>{product.unit || "piece"}</span>
                        </div>
                      </div>
                    </td>

                    <td>
                      <div className={styles.skuCell}>
                        <strong>{product.sku}</strong>
                        {product.barcodes.length > 0 && (
                          <span>
                            {product.barcodes.find((item) => item.isPrimary)
                              ?.barcode ?? product.barcodes[0].barcode}
                          </span>
                        )}
                      </div>
                    </td>

                    <td>
                      <span className={styles.categoryText}>
                        {product.categoryName || "Uncategorised"}
                      </span>
                    </td>

                    <td className={styles.priceCell}>
                      {formatPrice(product.costPriceMinor, currency)}
                    </td>

                    <td className={styles.priceCell}>
                      {formatPrice(product.sellingPriceMinor, currency)}
                    </td>

                    <td>
                      <span
                        className={
                          product.trackStock
                            ? styles.trackingEnabled
                            : styles.trackingDisabled
                        }
                      >
                        {product.trackStock ? "Tracked" : "Not tracked"}
                      </span>
                    </td>

                    <td>
                      <span
                        className={
                          product.status === "active"
                            ? styles.activeStatus
                            : styles.inactiveStatus
                        }
                      >
                        <span />
                        {product.status === "active" ? "Active" : "Inactive"}
                      </span>
                    </td>

                    {canManage && (
                      <td>
                        <div className={styles.rowActions}>
                          <button
                            type="button"
                            title="Edit product"
                            aria-label={`Edit ${product.name}`}
                            onClick={() => openEditForm(product)}
                          >
                            <Edit3 size={16} />
                          </button>

                          <button
                            type="button"
                            title={
                              product.status === "active"
                                ? "Deactivate product"
                                : "Activate product"
                            }
                            aria-label={
                              product.status === "active"
                                ? `Deactivate ${product.name}`
                                : `Activate ${product.name}`
                            }
                            onClick={() => void handleStatusChange(product)}
                          >
                            <Archive size={16} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className={styles.pagination}>
          <span>
            Showing <strong>{pageStart}</strong> to <strong>{pageEnd}</strong>{" "}
            of <strong>{pagination.total}</strong> products
          </span>

          <div className={styles.paginationActions}>
            <button
              type="button"
              disabled={loading || pagination.page <= 1}
              onClick={() => void loadProducts(pagination.page - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft size={17} />
              Previous
            </button>

            <span>
              Page {pagination.page} of {Math.max(pagination.totalPages, 1)}
            </span>

            <button
              type="button"
              disabled={
                loading ||
                pagination.totalPages === 0 ||
                pagination.page >= pagination.totalPages
              }
              onClick={() => void loadProducts(pagination.page + 1)}
              aria-label="Next page"
            >
              Next
              <ChevronRight size={17} />
            </button>
          </div>
        </div>
      </section>

      {formOpen && (
        <div
          className={styles.modalBackdrop}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeForm();
          }}
        >
          <section
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-form-title"
          >
            <div className={styles.modalHeader}>
              <div>
                <span className={styles.eyebrow}>PRODUCT CATALOGUE</span>
                <h2 id="product-form-title">
                  {editingProduct ? "Edit product" : "Add a product"}
                </h2>
                <p>
                  {editingProduct
                    ? "Update this product's information."
                    : "Enter the details of the product you want to add."}
                </p>
              </div>

              <button
                type="button"
                className={styles.closeButton}
                onClick={closeForm}
                disabled={saving}
                aria-label="Close form"
              >
                <X size={20} />
              </button>
            </div>

            <form className={styles.productForm} onSubmit={handleSubmit}>
              {formError && (
                <div className={styles.formError}>
                  <AlertCircle size={16} />
                  {formError}
                </div>
              )}

              <div className={styles.formGrid}>
                <label className={styles.formField}>
                  <span>
                    Product name <b>*</b>
                  </span>
                  <input
                    autoFocus
                    value={form.name}
                    onChange={(event) => updateForm("name", event.target.value)}
                    placeholder="e.g. Coca-Cola 500ml"
                    maxLength={150}
                    required
                  />
                </label>

                <label className={styles.formField}>
                  <span>
                    SKU <b>*</b>
                  </span>
                  <input
                    value={form.sku}
                    onChange={(event) => updateForm("sku", event.target.value)}
                    placeholder="e.g. COKE-500"
                    maxLength={80}
                    required
                  />
                </label>

                <label className={styles.formField}>
                  <span>Category</span>
                  <select
                    value={form.categoryId}
                    onChange={(event) =>
                      updateForm("categoryId", event.target.value)
                    }
                  >
                    <option value="">Uncategorised</option>
                    {categories
                      .filter((category) => category.isActive === 1)
                      .map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                  </select>
                </label>

                <label className={styles.formField}>
                  <span>Unit of measure</span>
                  <input
                    value={form.unit}
                    onChange={(event) => updateForm("unit", event.target.value)}
                    placeholder="piece, kg, litre..."
                    maxLength={30}
                  />
                </label>

                <label className={styles.formField}>
                  <span>
                    Cost price <b>*</b>
                  </span>
                  <input
                    type="number"
                    min="0"
                    step={1 / 10 ** getCurrencyFractionDigits(currency)}
                    value={form.costPrice}
                    onChange={(event) =>
                      updateForm("costPrice", event.target.value)
                    }
                    placeholder="0.00"
                    required
                  />
                </label>

                <label className={styles.formField}>
                  <span>
                    Selling price <b>*</b>
                  </span>
                  <input
                    type="number"
                    min="0"
                    step={1 / 10 ** getCurrencyFractionDigits(currency)}
                    value={form.sellingPrice}
                    onChange={(event) =>
                      updateForm("sellingPrice", event.target.value)
                    }
                    placeholder="0.00"
                    required
                  />
                </label>

                <label className={styles.formField}>
                  <span>
                    {editingProduct ? "Add another barcode" : "Barcode"}
                  </span>
                  <input
                    value={form.barcode}
                    onChange={(event) =>
                      updateForm("barcode", event.target.value)
                    }
                    placeholder="Scan or enter barcode"
                    maxLength={100}
                  />
                </label>

                <label className={styles.formField}>
                  <span>Description</span>
                  <textarea
                    value={form.description}
                    onChange={(event) =>
                      updateForm("description", event.target.value)
                    }
                    placeholder="Optional product description"
                    rows={3}
                    maxLength={1000}
                  />
                </label>
              </div>

              <label className={styles.stockToggle}>
                <input
                  type="checkbox"
                  checked={form.trackStock}
                  onChange={(event) =>
                    updateForm("trackStock", event.target.checked)
                  }
                />
                <span className={styles.toggleVisual} />
                <span>
                  <strong>Track inventory for this product</strong>
                  <small>
                    Enable stock quantity monitoring for this product.
                  </small>
                </span>
              </label>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.cancelButton}
                  onClick={closeForm}
                  disabled={saving}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className={styles.primaryButton}
                  disabled={saving}
                >
                  {saving ? (
                    <>
                      <LoaderCircle size={17} className={styles.spinning} />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Plus size={17} />
                      {editingProduct ? "Save changes" : "Create product"}
                    </>
                  )}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {categoriesOpen && (
        <CategoriesModal
          categories={categories}
          onClose={() => setCategoriesOpen(false)}
          onChanged={async () => {
            await Promise.all([loadCategories(), loadProducts(1), loadStats()]);
          }}
        />
      )}
    </div>
  );
}
