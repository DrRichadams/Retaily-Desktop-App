import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  Building2,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Package,
  Search,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Store,
  Users,
  Warehouse,
} from "lucide-react";

import styles from "./workspace-router.module.scss";

type CurrentUser = Awaited<ReturnType<typeof window.retaily.getCurrentUser>>;

interface WorkspaceRouterProps {
  user: CurrentUser;
  onLogout: () => void;
  loggingOut: boolean;
  error: string;
}

interface ModuleItem {
  label: string;
  description: string;
  permission: string[];
  icon: LucideIcon;
}

const ownerModules: ModuleItem[] = [
  {
    label: "Dashboard",
    description: "Your business overview and performance.",
    permission: ["dashboard.view"],
    icon: LayoutDashboard,
  },
  {
    label: "Point of Sale",
    description: "Process sales and serve customers.",
    permission: ["sales.create"],
    icon: ShoppingCart,
  },
  {
    label: "Sales",
    description: "Monitor transactions and sales activity.",
    permission: ["sales.view_all"],
    icon: CreditCard,
  },
  {
    label: "Products",
    description: "Manage your product catalogue.",
    permission: ["products.view"],
    icon: Package,
  },
  {
    label: "Inventory",
    description: "Monitor stock levels and movements.",
    permission: ["inventory.view"],
    icon: Warehouse,
  },
  {
    label: "Customers",
    description: "Manage customer records and relationships.",
    permission: ["customers.view"],
    icon: Users,
  },
  {
    label: "Employees",
    description: "Manage your workforce and employee accounts.",
    permission: ["employees.view"],
    icon: Users,
  },
  {
    label: "Branches",
    description: "Manage your business locations.",
    permission: ["branches.manage"],
    icon: Building2,
  },
  {
    label: "Registers",
    description: "Configure your checkout terminals.",
    permission: ["registers.manage"],
    icon: CreditCard,
  },
  {
    label: "Reports",
    description: "Analyse business performance.",
    permission: ["reports.view_basic", "reports.view_full"],
    icon: BarChart3,
  },
  {
    label: "Settings",
    description: "Configure your Retaily business.",
    permission: ["settings.view", "settings.manage"],
    icon: Settings,
  },
];

const managerModules = ownerModules.filter(
  (module) => !["Branches", "Registers", "Settings"].includes(module.label),
);

const supervisorModules: ModuleItem[] = [
  {
    label: "Dashboard",
    description: "Monitor daily store operations.",
    permission: ["dashboard.view"],
    icon: LayoutDashboard,
  },
  {
    label: "Point of Sale",
    description: "Process customer transactions.",
    permission: ["sales.create"],
    icon: ShoppingCart,
  },
  {
    label: "Sales",
    description: "Monitor and supervise transactions.",
    permission: ["sales.view_all", "sales.create"],
    icon: CreditCard,
  },
  {
    label: "Products",
    description: "View available products.",
    permission: ["products.view"],
    icon: Package,
  },
  {
    label: "Inventory",
    description: "Monitor store stock.",
    permission: ["inventory.view"],
    icon: Warehouse,
  },
  {
    label: "Customers",
    description: "View customer information.",
    permission: ["customers.view"],
    icon: Users,
  },
  {
    label: "Employees",
    description: "View employee information.",
    permission: ["employees.view"],
    icon: Users,
  },
  {
    label: "Reports",
    description: "Review operational reports.",
    permission: ["reports.view_basic", "reports.view_full"],
    icon: BarChart3,
  },
];

const tellerModules: ModuleItem[] = [
  {
    label: "Dashboard",
    description: "Your checkout overview.",
    permission: ["dashboard.view"],
    icon: LayoutDashboard,
  },
  {
    label: "Point of Sale",
    description: "Start a transaction and serve customers.",
    permission: ["sales.create"],
    icon: ShoppingCart,
  },
  {
    label: "Products",
    description: "Search and view available products.",
    permission: ["products.view"],
    icon: Package,
  },
  {
    label: "Customers",
    description: "Find and select customers.",
    permission: ["customers.view"],
    icon: Users,
  },
];

function getWorkspaceRole(roles: string[]) {
  const priority = ["owner", "manager", "supervisor", "teller"];

  return priority.find((role) => roles.includes(role)) ?? null;
}

const roleTitles: Record<string, string> = {
  owner: "Owner workspace",
  manager: "Manager workspace",
  supervisor: "Supervisor workspace",
  teller: "Teller workspace",
};

const roleDescriptions: Record<string, string> = {
  owner: "Your business, your operations, your overview.",
  manager: "Manage your store's daily business operations.",
  supervisor: "Keep your store operations running smoothly.",
  teller: "Your checkout workspace. Ready to serve customers.",
};

function Dashboard({ user, role }: { user: CurrentUser; role: string }) {
  const metrics = [
    {
      label: "Today's sales",
      value: "$1,284.50",
      change: "+12.8%",
      positive: true,
      icon: CreditCard,
      note: "Compared with yesterday",
    },
    {
      label: "Transactions",
      value: "48",
      change: "+8.2%",
      positive: true,
      icon: ShoppingCart,
      note: "Compared with yesterday",
    },
    {
      label: "Average transaction",
      value: "$26.76",
      change: "+3.4%",
      positive: true,
      icon: Activity,
      note: "Compared with yesterday",
    },
    {
      label: "Gross profit",
      value: "$386.20",
      change: "-2.1%",
      positive: false,
      icon: BarChart3,
      note: "Compared with yesterday",
    },
  ];

  const transactions = [
    {
      id: "#RT-00842",
      customer: "Walk-in customer",
      time: "14:32",
      amount: "$42.50",
      status: "Completed",
    },
    {
      id: "#RT-00841",
      customer: "Customer #104",
      time: "14:18",
      amount: "$18.00",
      status: "Completed",
    },
    {
      id: "#RT-00840",
      customer: "Walk-in customer",
      time: "13:56",
      amount: "$76.25",
      status: "Completed",
    },
    {
      id: "#RT-00839",
      customer: "Customer #087",
      time: "13:41",
      amount: "$12.75",
      status: "Completed",
    },
  ];

  const products = [
    { name: "Product Alpha", sold: 86, revenue: "$430.00" },
    { name: "Product Bravo", sold: 64, revenue: "$320.00" },
    { name: "Product Charlie", sold: 51, revenue: "$255.00" },
    { name: "Product Delta", sold: 38, revenue: "$190.00" },
  ];

  const stockAlerts = [
    { name: "Product Echo", stock: "3 units left", level: "Critical" },
    { name: "Product Foxtrot", stock: "5 units left", level: "Low stock" },
    { name: "Product Golf", stock: "7 units left", level: "Low stock" },
  ];

  return (
    <div className={styles.dashboard}>
      <div className={styles.dashboardHeading}>
        <div>
          <span className={styles.pageEyebrow}>BUSINESS OVERVIEW</span>
          <h1>Good day, {user.fullName.split(" ")[0]}.</h1>
          <p>Here's what's happening with your business today.</p>
        </div>

        <div className={styles.dateLabel}>
          <span>YOUR WORKSPACE</span>
          <strong>{roleTitles[role]}</strong>
        </div>
      </div>

      <div className={styles.sampleNotice}>
        <Activity size={16} />
        <span>
          Preview dashboard. Figures shown are sample data and are not connected
          to your store database yet.
        </span>
      </div>

      <section className={styles.metricsGrid}>
        {metrics.map((metric) => {
          const Icon = metric.icon;

          return (
            <article className={styles.metricCard} key={metric.label}>
              <div className={styles.metricTop}>
                <span>{metric.label}</span>
                <div className={styles.metricIcon}>
                  <Icon size={18} />
                </div>
              </div>

              <strong className={styles.metricValue}>{metric.value}</strong>

              <div className={styles.metricFooter}>
                <span
                  className={
                    metric.positive
                      ? styles.positiveChange
                      : styles.negativeChange
                  }
                >
                  {metric.positive ? (
                    <ArrowUpRight size={14} />
                  ) : (
                    <ArrowDownRight size={14} />
                  )}
                  {metric.change}
                </span>

                <span>{metric.note}</span>
              </div>
            </article>
          );
        })}
      </section>

      <section className={styles.primaryGrid}>
        <article className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <h2>Sales overview</h2>
              <p>Revenue performance throughout the week</p>
            </div>

            <span className={styles.previewTag}>SAMPLE</span>
          </div>

          <div className={styles.chartSummary}>
            <strong>$8,642.80</strong>
            <span>
              <ArrowUpRight size={14} />
              10.6% this week
            </span>
          </div>

          <div className={styles.chart}>
            <div className={styles.chartYAxis}>
              <span>$2k</span>
              <span>$1.5k</span>
              <span>$1k</span>
              <span>$500</span>
              <span>$0</span>
            </div>

            <div className={styles.chartCanvas}>
              <div className={styles.chartGrid}>
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>

              <svg
                viewBox="0 0 700 220"
                preserveAspectRatio="none"
                role="img"
                aria-label="Illustrative weekly sales trend"
                className={styles.chartSvg}
              >
                <defs>
                  <linearGradient
                    id="salesGradient"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor="#12b04c" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="#12b04c" stopOpacity="0" />
                  </linearGradient>
                </defs>

                <path
                  d="M0 160 C45 145 55 110 100 125 S165 155 200 105 S270 80 300 100 S365 65 400 80 S470 115 500 65 S570 75 600 45 S665 55 700 20 L700 220 L0 220 Z"
                  fill="url(#salesGradient)"
                />

                <path
                  d="M0 160 C45 145 55 110 100 125 S165 155 200 105 S270 80 300 100 S365 65 400 80 S470 115 500 65 S570 75 600 45 S665 55 700 20"
                  fill="none"
                  stroke="#12b04c"
                  strokeWidth="3"
                  vectorEffect="non-scaling-stroke"
                />

                <circle cx="600" cy="45" r="5" fill="#12b04c" />
              </svg>

              <div className={styles.chartXAxis}>
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
                  (day) => (
                    <span key={day}>{day}</span>
                  ),
                )}
              </div>
            </div>
          </div>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <h2>Stock alerts</h2>
              <p>Products that need your attention</p>
            </div>

            <span className={styles.alertCount}>
              {stockAlerts.length} alerts
            </span>
          </div>

          <div className={styles.stockList}>
            {stockAlerts.map((item) => (
              <div className={styles.stockItem} key={item.name}>
                <div className={styles.stockIcon}>
                  <AlertTriangle size={17} />
                </div>

                <div className={styles.stockDetails}>
                  <strong>{item.name}</strong>
                  <span>{item.stock}</span>
                </div>

                <span
                  className={
                    item.level === "Critical"
                      ? styles.criticalBadge
                      : styles.lowStockBadge
                  }
                >
                  {item.level}
                </span>
              </div>
            ))}
          </div>

          <div className={styles.panelBottomLink}>
            <span>Inventory monitoring preview</span>
          </div>
        </article>
      </section>

      <section className={styles.secondaryGrid}>
        <article className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <h2>Recent transactions</h2>
              <p>Your latest sales activity</p>
            </div>

            <span className={styles.previewTag}>SAMPLE</span>
          </div>

          <div className={styles.tableWrapper}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>TRANSACTION</th>
                  <th>CUSTOMER</th>
                  <th>TIME</th>
                  <th>AMOUNT</th>
                  <th>STATUS</th>
                </tr>
              </thead>

              <tbody>
                {transactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td className={styles.transactionId}>{transaction.id}</td>
                    <td>{transaction.customer}</td>
                    <td>{transaction.time}</td>
                    <td className={styles.amount}>{transaction.amount}</td>
                    <td>
                      <span className={styles.completedStatus}>
                        <CheckCircle2 size={12} />
                        {transaction.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <h2>Top-selling products</h2>
              <p>Best performers this week</p>
            </div>

            <span className={styles.previewTag}>SAMPLE</span>
          </div>

          <div className={styles.productList}>
            {products.map((product, index) => (
              <div className={styles.productItem} key={product.name}>
                <div className={styles.productRank}>{index + 1}</div>

                <div className={styles.productDetails}>
                  <strong>{product.name}</strong>
                  <span>{product.sold} units sold</span>
                </div>

                <strong className={styles.productRevenue}>
                  {product.revenue}
                </strong>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}

function ComingSoon({ module }: { module: ModuleItem }) {
  const Icon = module.icon;

  return (
    <div className={styles.comingSoon}>
      <div className={styles.comingSoonIcon}>
        <Icon size={30} />
      </div>

      <span className={styles.pageEyebrow}>WORKSPACE MODULE</span>
      <h1>{module.label}</h1>
      <p>{module.description}</p>

      <div className={styles.comingSoonMessage}>
        <ClipboardList size={17} />
        This module is part of the Retaily development roadmap.
      </div>
    </div>
  );
}

function Workspace({
  user,
  role,
  modules,
  onLogout,
  loggingOut,
  error,
}: {
  user: CurrentUser;
  role: string;
  modules: ModuleItem[];
  onLogout: () => void;
  loggingOut: boolean;
  error: string;
}) {
  const availableModules = modules.filter((module) =>
    module.permission.some((permission) =>
      user.permissions.includes(permission),
    ),
  );

  const [activeModule, setActiveModule] = useState("Dashboard");

  const selectedModule =
    availableModules.find((module) => module.label === activeModule) ??
    availableModules[0];

  return (
    <main className={styles.workspace}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <div className={styles.brandIcon}>
            <Store size={21} />
          </div>
          <span>retaily</span>
        </div>

        <div className={styles.storeSelector}>
          <div className={styles.storeIcon}>
            <Building2 size={17} />
          </div>

          <div className={styles.storeDetails}>
            <span>YOUR BUSINESS</span>
            <strong>Local store</strong>
          </div>

          <ChevronDown size={15} />
        </div>

        <div className={styles.sidebarSection}>
          <span className={styles.sidebarLabel}>WORKSPACE</span>

          <div className={styles.workspaceIdentity}>
            <ShieldCheck size={16} />
            <span>{roleTitles[role]}</span>
          </div>
        </div>

        <div className={styles.navigation}>
          <span className={styles.sidebarLabel}>MAIN MENU</span>

          {availableModules.map((module) => {
            const Icon = module.icon;
            const active = selectedModule?.label === module.label;

            return (
              <button
                type="button"
                key={module.label}
                onClick={() => setActiveModule(module.label)}
                className={`${styles.navItem} ${
                  active ? styles.navItemActive : ""
                }`}
                aria-current={active ? "page" : undefined}
              >
                <Icon size={18} />
                <span>{module.label}</span>
              </button>
            );
          })}
        </div>

        <div className={styles.sidebarFooter}>
          <div className={styles.accountIdentity}>
            <div className={styles.avatar}>
              {user.fullName.charAt(0).toUpperCase()}
            </div>

            <div className={styles.accountDetails}>
              <strong>{user.fullName}</strong>
              <span>@{user.username}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={onLogout}
            disabled={loggingOut}
            className={styles.logoutButton}
          >
            <LogOut size={17} />
            {loggingOut ? "Signing out..." : "Sign out"}
          </button>

          <span className={styles.version}>RETAILY DESKTOP</span>
        </div>
      </aside>

      <section className={styles.mainContent}>
        <header className={styles.topbar}>
          <div className={styles.breadcrumb}>
            <span>Workspace</span>
            <span>/</span>
            <strong>{selectedModule?.label ?? "Dashboard"}</strong>
          </div>

          <div className={styles.topbarActions}>
            <div className={styles.connectionStatus}>
              <span />
              Local system
            </div>

            <button
              type="button"
              className={styles.iconButton}
              aria-label="Search"
              title="Search"
              disabled
            >
              <Search size={18} />
            </button>

            <button
              type="button"
              className={styles.iconButton}
              aria-label="Notifications"
              title="Notifications"
              disabled
            >
              <Bell size={18} />
            </button>

            <div className={styles.topbarAvatar}>
              {user.fullName.charAt(0).toUpperCase()}
            </div>
          </div>
        </header>

        <div className={styles.content}>
          {error && (
            <div className={styles.errorMessage}>
              <AlertTriangle size={16} />
              {error}
            </div>
          )}

          {selectedModule?.label === "Dashboard" ? (
            <Dashboard user={user} role={role} />
          ) : selectedModule ? (
            <ComingSoon module={selectedModule} />
          ) : (
            <div className={styles.emptyState}>
              <ClipboardList size={28} />
              <h3>No applications available</h3>
              <p>
                Your account does not currently have access to any workspace
                modules. Contact your business administrator.
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

export default function WorkspaceRouter({
  user,
  onLogout,
  loggingOut,
  error,
}: WorkspaceRouterProps) {
  const role = getWorkspaceRole(user.roles);

  if (!role) {
    return (
      <main className={styles.accessDenied}>
        <ShieldCheck size={36} />
        <h1>Workspace access unavailable</h1>
        <p>
          Your account does not have a recognised workspace role. Contact your
          business administrator.
        </p>
        <button type="button" onClick={onLogout} disabled={loggingOut}>
          {loggingOut ? "Signing out..." : "Sign out"}
        </button>
      </main>
    );
  }

  const modulesByRole: Record<string, ModuleItem[]> = {
    owner: ownerModules,
    manager: managerModules,
    supervisor: supervisorModules,
    teller: tellerModules,
  };

  return (
    <Workspace
      user={user}
      role={role}
      modules={modulesByRole[role]}
      onLogout={onLogout}
      loggingOut={loggingOut}
      error={error}
    />
  );
}
