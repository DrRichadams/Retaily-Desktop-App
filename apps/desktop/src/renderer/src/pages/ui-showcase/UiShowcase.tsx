import { useState } from "react";
import {
  Package,
  ShoppingCart,
  Users,
  TrendingUp,
  Plus,
  Download,
  Pencil,
  Trash2,
} from "lucide-react";

import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import Select from "../../components/ui/Select";
import Badge from "../../components/ui/Badge";
import Card from "../../components/ui/Card";
import Modal from "../../components/ui/Modal";
import DataTable, { type DataTableColumn } from "../../components/ui/DataTable";
import SearchInput from "../../components/ui/SearchInput";

import styles from "./UiShowcase.module.scss";

interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  price: number;
  stock: number;
  status: "In Stock" | "Low Stock" | "Out of Stock";
}

const sampleProducts: Product[] = [
  {
    id: "1",
    name: "Coca-Cola 500ml",
    sku: "BEV-001",
    category: "Beverages",
    price: 1.5,
    stock: 120,
    status: "In Stock",
  },
  {
    id: "2",
    name: "Cooking Oil 2L",
    sku: "GRC-002",
    category: "Groceries",
    price: 4.5,
    stock: 8,
    status: "Low Stock",
  },
  {
    id: "3",
    name: "Sugar 2kg",
    sku: "GRC-003",
    category: "Groceries",
    price: 3.2,
    stock: 0,
    status: "Out of Stock",
  },
  {
    id: "4",
    name: "Laundry Soap",
    sku: "HOM-004",
    category: "Household",
    price: 2.25,
    stock: 45,
    status: "In Stock",
  },
];

const productColumns: DataTableColumn<Product>[] = [
  {
    key: "name",
    header: "Product",
    accessor: "name",
    sortable: true,
    minWidth: "180px",
  },
  {
    key: "sku",
    header: "SKU",
    accessor: "sku",
    sortable: true,
  },
  {
    key: "category",
    header: "Category",
    accessor: "category",
  },
  {
    key: "price",
    header: "Price",
    accessor: "price",
    sortable: true,
    render: (product) => `$${product.price.toFixed(2)}`,
  },
  {
    key: "stock",
    header: "Stock",
    accessor: "stock",
    sortable: true,
  },
  {
    key: "status",
    header: "Status",
    render: (product) => (
      <Badge
        variant={
          product.status === "In Stock"
            ? "success"
            : product.status === "Low Stock"
              ? "warning"
              : "danger"
        }
      >
        {product.status}
      </Badge>
    ),
  },
];

export default function UiShowcase() {
  const [search, setSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [category, setCategory] = useState("beverages");
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState("primary");

  const filteredProducts = sampleProducts.filter((product) => {
    const query = productSearch.toLowerCase();

    return (
      product.name.toLowerCase().includes(query) ||
      product.sku.toLowerCase().includes(query) ||
      product.category.toLowerCase().includes(query)
    );
  });

  const handleSave = () => {
    alert(`Demo form submitted for ${name || "New product"}`);
    setModalOpen(false);
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <div className={styles.eyebrow}>RETAILY DEVELOPMENT</div>

          <h1>UI Component Showcase</h1>

          <p>A playground for testing Retaily's reusable design components.</p>
        </div>

        <div className={styles.headerActions}>
          <Badge variant="success" dot>
            Development environment
          </Badge>

          <Button
            variant="primary"
            leftIcon={<Plus size={15} />}
            onClick={() => setModalOpen(true)}
          >
            Test modal
          </Button>
        </div>
      </header>

      <main className={styles.content}>
        {/* BUTTONS */}

        <section className={styles.section}>
          <div className={styles.sectionHeading}>
            <h2>Buttons</h2>
            <p>Actions, controls and interactive elements.</p>
          </div>

          <Card>
            <div className={styles.componentGroup}>
              <div className={styles.componentLabel}>Variants</div>

              <div className={styles.componentRow}>
                <Button variant="primary">Primary</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="danger">Danger</Button>
              </div>
            </div>

            <div className={styles.componentGroup}>
              <div className={styles.componentLabel}>Sizes</div>

              <div className={styles.componentRow}>
                <Button size="small">Small</Button>
                <Button size="medium">Medium</Button>
                <Button size="large">Large</Button>
              </div>
            </div>

            <div className={styles.componentGroup}>
              <div className={styles.componentLabel}>Icons and actions</div>

              <div className={styles.componentRow}>
                <Button leftIcon={<Plus size={15} />}>Add product</Button>

                <Button variant="outline" rightIcon={<Download size={15} />}>
                  Export
                </Button>

                <Button variant="danger" leftIcon={<Trash2 size={15} />}>
                  Delete
                </Button>
              </div>
            </div>
          </Card>
        </section>

        {/* INPUTS */}

        <section className={styles.section}>
          <div className={styles.sectionHeading}>
            <h2>Inputs and Search</h2>
            <p>Text fields, dropdowns and search controls.</p>
          </div>

          <div className={styles.twoColumns}>
            <Card>
              <div className={styles.cardHeading}>
                <h3>Input fields</h3>
                <p>Standard form controls.</p>
              </div>

              <div className={styles.formStack}>
                <Input
                  label="Product name"
                  placeholder="Enter product name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  fullWidth
                />

                <Input
                  label="Email address"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  helperText="Used for account notifications."
                  fullWidth
                />

                <Input
                  label="Example with validation"
                  placeholder="Enter a valid value"
                  defaultValue="Invalid value"
                  error="This is a demonstration error."
                  fullWidth
                />

                <Select
                  label="Product category"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  options={[
                    { label: "Beverages", value: "beverages" },
                    { label: "Groceries", value: "groceries" },
                    { label: "Household", value: "household" },
                    { label: "Electronics", value: "electronics" },
                  ]}
                  fullWidth
                />
              </div>
            </Card>

            <Card>
              <div className={styles.cardHeading}>
                <h3>Search input</h3>
                <p>Search patterns for Retaily modules.</p>
              </div>

              <div className={styles.formStack}>
                <SearchInput
                  value={search}
                  onChange={setSearch}
                  placeholder="Search anything..."
                  fullWidth
                />

                <SearchInput
                  value={productSearch}
                  onChange={setProductSearch}
                  placeholder="Search products by name or SKU..."
                  inputSize="large"
                  fullWidth
                />

                <SearchInput
                  value=""
                  onChange={() => {}}
                  placeholder="Search with keyboard shortcut"
                  showShortcut
                  fullWidth
                />

                <div className={styles.helperText}>
                  Search value: {search || "Nothing entered"}
                </div>
              </div>
            </Card>
          </div>
        </section>

        {/* BADGES */}

        <section className={styles.section}>
          <div className={styles.sectionHeading}>
            <h2>Status badges</h2>
            <p>Visual indicators for records and system states.</p>
          </div>

          <Card>
            <div className={styles.componentGroup}>
              <div className={styles.componentLabel}>Variants</div>

              <div className={styles.componentRow}>
                <Badge variant="success">Success</Badge>
                <Badge variant="warning">Warning</Badge>
                <Badge variant="danger">Danger</Badge>
                <Badge variant="info">Information</Badge>
                <Badge variant="neutral">Neutral</Badge>
                <Badge variant="dark">Dark</Badge>
              </div>
            </div>

            <div className={styles.componentGroup}>
              <div className={styles.componentLabel}>With indicators</div>

              <div className={styles.componentRow}>
                <Badge variant="success" dot>
                  Active
                </Badge>
                <Badge variant="warning" dot>
                  Low stock
                </Badge>
                <Badge variant="danger" dot>
                  Unavailable
                </Badge>
                <Badge variant="info" dot>
                  Processing
                </Badge>
              </div>
            </div>
          </Card>
        </section>

        {/* CARDS */}

        <section className={styles.section}>
          <div className={styles.sectionHeading}>
            <h2>Cards</h2>
            <p>Containers for dashboards and application content.</p>
          </div>

          <div className={styles.metricGrid}>
            <Card>
              <div className={styles.metricCard}>
                <div className={styles.metricTop}>
                  <span>Total sales</span>
                  <span className={styles.metricIcon}>
                    <ShoppingCart size={18} />
                  </span>
                </div>

                <strong>$1,284.50</strong>

                <Badge variant="success">
                  <TrendingUp size={12} /> +12.5%
                </Badge>
              </div>
            </Card>

            <Card>
              <div className={styles.metricCard}>
                <div className={styles.metricTop}>
                  <span>Products</span>
                  <span className={styles.metricIcon}>
                    <Package size={18} />
                  </span>
                </div>

                <strong>248</strong>
                <span className={styles.metricFootnote}>
                  Registered products
                </span>
              </div>
            </Card>

            <Card>
              <div className={styles.metricCard}>
                <div className={styles.metricTop}>
                  <span>Customers</span>
                  <span className={styles.metricIcon}>
                    <Users size={18} />
                  </span>
                </div>

                <strong>1,024</strong>
                <span className={styles.metricFootnote}>Customer records</span>
              </div>
            </Card>
          </div>
        </section>

        {/* DATA TABLE */}

        <section className={styles.section}>
          <div className={styles.sectionHeading}>
            <h2>DataTable</h2>
            <p>Sortable columns, row selection and custom rendering.</p>
          </div>

          <Card padding="none">
            <div className={styles.tableToolbar}>
              <div>
                <h3>Products</h3>
                <p>{filteredProducts.length} sample records</p>
              </div>

              <div className={styles.componentRow}>
                <SearchInput
                  value={productSearch}
                  onChange={setProductSearch}
                  placeholder="Search products..."
                  inputSize="small"
                />

                <Button
                  size="small"
                  leftIcon={<Plus size={14} />}
                  onClick={() => setModalOpen(true)}
                >
                  Add product
                </Button>
              </div>
            </div>

            <DataTable
              columns={productColumns}
              data={filteredProducts}
              getRowId={(product) => product.id}
              selectable
              selectedRows={selectedRows}
              onSelectionChange={setSelectedRows}
              rowActions={(product) => (
                <div className={styles.rowActions}>
                  <Button
                    size="small"
                    variant="ghost"
                    onClick={() => alert(`Edit ${product.name}`)}
                  >
                    <Pencil size={14} />
                  </Button>

                  <Button
                    size="small"
                    variant="ghost"
                    onClick={() => alert(`Delete ${product.name}`)}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              )}
            />

            <div className={styles.tableFooter}>
              {selectedRows.length} selected
            </div>
          </Card>
        </section>

        {/* MODAL */}

        <section className={styles.section}>
          <div className={styles.sectionHeading}>
            <h2>Modal</h2>
            <p>Dialogs for confirmations and form workflows.</p>
          </div>

          <Card>
            <div className={styles.componentRow}>
              <Button onClick={() => setModalOpen(true)}>
                Open example modal
              </Button>

              <Select
                value={selectedVariant}
                onChange={(event) => setSelectedVariant(event.target.value)}
                options={[
                  { label: "Primary", value: "primary" },
                  { label: "Secondary", value: "secondary" },
                  { label: "Outline", value: "outline" },
                ]}
              />
            </div>
          </Card>
        </section>
      </main>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Add a product"
        description="This is a demonstration of Retaily's reusable modal."
        size="medium"
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>

            <Button
              variant={selectedVariant as "primary" | "secondary" | "outline"}
              onClick={handleSave}
            >
              Save product
            </Button>
          </>
        }
      >
        <div className={styles.formStack}>
          <Input
            label="Product name"
            placeholder="Enter product name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            fullWidth
          />

          <Input
            label="Email / supplier contact"
            placeholder="Optional contact information"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            fullWidth
          />

          <Select
            label="Category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            options={[
              { label: "Beverages", value: "beverages" },
              { label: "Groceries", value: "groceries" },
              { label: "Household", value: "household" },
            ]}
            fullWidth
          />
        </div>
      </Modal>
    </div>
  );
}
