import { useState, type FormEvent } from "react";
import {
  Folder,
  FolderPlus,
  LoaderCircle,
  Pencil,
  Plus,
  X,
} from "lucide-react";

import { productsService } from "../../../services/products.service";
import styles from "./categories-modal.module.scss";

interface CategoriesModalProps {
  categories: RetailyCategory[];
  onClose: () => void;
  onChanged: () => Promise<void>;
}

interface CategoryForm {
  name: string;
  description: string;
  parentCategoryId: string;
}

const emptyForm: CategoryForm = {
  name: "",
  description: "",
  parentCategoryId: "",
};

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}

export default function CategoriesModal({
  categories,
  onClose,
  onChanged,
}: CategoriesModalProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [editingCategory, setEditingCategory] =
    useState<RetailyCategory | null>(null);
  const [form, setForm] = useState<CategoryForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const activeCategories = categories.filter(
    (category) => category.isActive === 1,
  );

  function openCreateForm() {
    setEditingCategory(null);
    setForm(emptyForm);
    setError("");
    setSuccess("");
    setFormOpen(true);
  }

  function openEditForm(category: RetailyCategory) {
    setEditingCategory(category);
    setForm({
      name: category.name,
      description: category.description ?? "",
      parentCategoryId: category.parentCategoryId ?? "",
    });
    setError("");
    setSuccess("");
    setFormOpen(true);
  }

  function closeForm() {
    if (saving) return;
    setFormOpen(false);
    setEditingCategory(null);
    setForm(emptyForm);
    setError("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    const name = form.name.trim();

    if (!name) {
      setError("Enter a category name.");
      return;
    }

    if (editingCategory && form.parentCategoryId === editingCategory.id) {
      setError("A category cannot be its own parent.");
      return;
    }

    setSaving(true);

    try {
      const input: RetailyProductCategoryInput = {
        name,
        description: form.description.trim() || null,
        parentCategoryId: form.parentCategoryId || null,
      };

      if (editingCategory) {
        await productsService.updateCategory(editingCategory.id, input);
        setSuccess("Category updated successfully.");
      } else {
        await productsService.createCategory(input);
        setSuccess("Category created successfully.");
      }

      setFormOpen(false);
      setEditingCategory(null);
      setForm(emptyForm);
      await onChanged();
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setSaving(false);
    }
  }

  const parentOptions = activeCategories.filter(
    (category) => category.id !== editingCategory?.id,
  );

  return (
    <div
      className={styles.backdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !formOpen) {
          onClose();
        }
      }}
    >
      <section
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="categories-title"
      >
        <header className={styles.header}>
          <div className={styles.headerIcon}>
            <Folder size={21} />
          </div>

          <div className={styles.headerText}>
            <span>CATEGORY MANAGEMENT</span>
            <h2 id="categories-title">Product categories</h2>
            <p>Organise your products into meaningful groups.</p>
          </div>

          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close category management"
          >
            <X size={19} />
          </button>
        </header>

        <div className={styles.toolbar}>
          <div>
            <strong>{activeCategories.length}</strong>
            <span> active categories</span>
          </div>

          <button
            type="button"
            className={styles.addButton}
            onClick={openCreateForm}
          >
            <Plus size={16} />
            Add category
          </button>
        </div>

        {success && <div className={styles.successMessage}>{success}</div>}

        {error && !formOpen && (
          <div className={styles.errorMessage}>{error}</div>
        )}

        <div className={styles.categoryList}>
          {activeCategories.length === 0 ? (
            <div className={styles.emptyState}>
              <FolderPlus size={30} />
              <strong>No categories yet</strong>
              <span>Create categories to organise your products.</span>
            </div>
          ) : (
            activeCategories.map((category) => {
              const parent = activeCategories.find(
                (item) => item.id === category.parentCategoryId,
              );

              return (
                <article className={styles.categoryItem} key={category.id}>
                  <div className={styles.categoryIcon}>
                    <Folder size={18} />
                  </div>

                  <div className={styles.categoryDetails}>
                    <strong>{category.name}</strong>
                    <span>
                      {parent
                        ? `Subcategory of ${parent.name}`
                        : category.description || "Top-level category"}
                    </span>
                  </div>

                  <button
                    type="button"
                    className={styles.editButton}
                    onClick={() => openEditForm(category)}
                    aria-label={`Edit ${category.name}`}
                    title="Edit category"
                  >
                    <Pencil size={15} />
                  </button>
                </article>
              );
            })
          )}
        </div>

        <footer className={styles.footer}>
          <span>Changes apply to your product catalogue.</span>
          <button type="button" className={styles.doneButton} onClick={onClose}>
            Done
          </button>
        </footer>

        {formOpen && (
          <div className={styles.formBackdrop}>
            <section
              className={styles.formModal}
              role="dialog"
              aria-modal="true"
              aria-labelledby="category-form-title"
            >
              <header className={styles.formHeader}>
                <div>
                  <span>CATEGORY DETAILS</span>
                  <h3 id="category-form-title">
                    {editingCategory ? "Edit category" : "New category"}
                  </h3>
                </div>

                <button
                  type="button"
                  className={styles.closeButton}
                  onClick={closeForm}
                  disabled={saving}
                  aria-label="Close category form"
                >
                  <X size={18} />
                </button>
              </header>

              <form onSubmit={handleSubmit}>
                {error && <div className={styles.errorMessage}>{error}</div>}

                <label className={styles.field}>
                  <span>
                    Category name <b>*</b>
                  </span>
                  <input
                    autoFocus
                    value={form.name}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    placeholder="e.g. Beverages"
                    maxLength={100}
                    required
                  />
                </label>

                <label className={styles.field}>
                  <span>Description</span>
                  <textarea
                    value={form.description}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                    placeholder="Describe what belongs in this category"
                    rows={3}
                    maxLength={500}
                  />
                </label>

                <label className={styles.field}>
                  <span>Parent category</span>
                  <select
                    value={form.parentCategoryId}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        parentCategoryId: event.target.value,
                      }))
                    }
                  >
                    <option value="">No parent (top-level category)</option>
                    {parentOptions.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                  <small>Use this to organise categories into groups.</small>
                </label>

                <div className={styles.formActions}>
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
                    className={styles.saveButton}
                    disabled={saving}
                  >
                    {saving ? (
                      <>
                        <LoaderCircle size={16} className={styles.spinning} />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Plus size={16} />
                        {editingCategory ? "Save changes" : "Create category"}
                      </>
                    )}
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}
      </section>
    </div>
  );
}
