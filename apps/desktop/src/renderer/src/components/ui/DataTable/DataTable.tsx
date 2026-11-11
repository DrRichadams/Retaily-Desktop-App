import { useMemo, useState, type ReactNode } from "react";
import { Check, ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";

import styles from "./DataTable.module.scss";

export type SortDirection = "asc" | "desc";

export interface DataTableColumn<T> {
  key: string;
  header: string;
  accessor?: keyof T;
  render?: (row: T, index: number) => ReactNode;
  sortable?: boolean;
  align?: "left" | "center" | "right";
  width?: string;
  minWidth?: string;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  getRowId: (row: T) => string;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  selectable?: boolean;
  selectedRows?: string[];
  onSelectionChange?: (selectedIds: string[]) => void;
  onRowClick?: (row: T) => void;
  rowActions?: (row: T) => ReactNode;
  actionsHeader?: string;
  striped?: boolean;
  compact?: boolean;
  className?: string;
}

export default function DataTable<T>({
  columns,
  data,
  getRowId,
  loading = false,
  emptyTitle = "No records found",
  emptyDescription = "There are currently no records to display.",
  emptyAction,
  selectable = false,
  selectedRows,
  onSelectionChange,
  onRowClick,
  rowActions,
  actionsHeader = "Actions",
  striped = false,
  compact = false,
  className = "",
}: DataTableProps<T>) {
  const [internalSelection, setInternalSelection] = useState<string[]>([]);
  const [sort, setSort] = useState<{
    key: string;
    direction: SortDirection;
  } | null>(null);

  const selectedIds = selectedRows ?? internalSelection;

  const updateSelection = (ids: string[]) => {
    if (selectedRows === undefined) {
      setInternalSelection(ids);
    }

    onSelectionChange?.(ids);
  };

  const sortedData = useMemo(() => {
    if (!sort) return data;

    const column = columns.find((item) => item.key === sort.key);

    if (!column?.accessor) return data;

    return [...data].sort((a, b) => {
      const first = a[column.accessor!];
      const second = b[column.accessor!];

      let result = 0;

      if (typeof first === "number" && typeof second === "number") {
        result = first - second;
      } else {
        result = String(first ?? "").localeCompare(
          String(second ?? ""),
          undefined,
          { numeric: true, sensitivity: "base" },
        );
      }

      return sort.direction === "asc" ? result : -result;
    });
  }, [data, columns, sort]);

  const allSelected =
    data.length > 0 && data.every((row) => selectedIds.includes(getRowId(row)));

  const someSelected =
    data.some((row) => selectedIds.includes(getRowId(row))) && !allSelected;

  const toggleSort = (column: DataTableColumn<T>) => {
    if (!column.sortable || !column.accessor) return;

    setSort((current) => {
      if (current?.key !== column.key) {
        return { key: column.key, direction: "asc" };
      }

      if (current.direction === "asc") {
        return { key: column.key, direction: "desc" };
      }

      return null;
    });
  };

  const toggleAll = () => {
    const pageIds = data.map(getRowId);

    if (allSelected) {
      updateSelection(selectedIds.filter((id) => !pageIds.includes(id)));
    } else {
      updateSelection(Array.from(new Set([...selectedIds, ...pageIds])));
    }
  };

  const toggleRow = (id: string) => {
    updateSelection(
      selectedIds.includes(id)
        ? selectedIds.filter((item) => item !== id)
        : [...selectedIds, id],
    );
  };

  const tableClasses = [
    styles.table,
    striped ? styles.striped : "",
    compact ? styles.compact : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={`${styles.container} ${className}`}>
      <div className={styles.scrollArea}>
        <table className={tableClasses}>
          <thead>
            <tr>
              {selectable && (
                <th className={styles.checkboxCell}>
                  <button
                    type="button"
                    className={`${styles.checkbox} ${
                      allSelected || someSelected ? styles.checked : ""
                    }`}
                    onClick={toggleAll}
                    aria-label={
                      allSelected ? "Deselect all rows" : "Select all rows"
                    }
                    aria-pressed={allSelected}
                  >
                    {allSelected && <Check size={13} />}
                    {someSelected && <span className={styles.indeterminate} />}
                  </button>
                </th>
              )}

              {columns.map((column) => {
                const activeSort = sort?.key === column.key;

                return (
                  <th
                    key={column.key}
                    style={{
                      width: column.width,
                      minWidth: column.minWidth,
                      textAlign: column.align ?? "left",
                    }}
                  >
                    {column.sortable && column.accessor ? (
                      <button
                        type="button"
                        className={styles.sortButton}
                        onClick={() => toggleSort(column)}
                      >
                        {column.header}

                        {activeSort ? (
                          sort.direction === "asc" ? (
                            <ChevronUp size={14} />
                          ) : (
                            <ChevronDown size={14} />
                          )
                        ) : (
                          <ChevronsUpDown size={14} />
                        )}
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}

              {rowActions && (
                <th className={styles.actionsHeader}>{actionsHeader}</th>
              )}
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={
                    columns.length + (selectable ? 1 : 0) + (rowActions ? 1 : 0)
                  }
                >
                  <div className={styles.state}>
                    <span className={styles.spinner} />
                    <p>Loading records...</p>
                  </div>
                </td>
              </tr>
            ) : sortedData.length === 0 ? (
              <tr>
                <td
                  colSpan={
                    columns.length + (selectable ? 1 : 0) + (rowActions ? 1 : 0)
                  }
                >
                  <div className={styles.state}>
                    <div className={styles.emptyIcon}>
                      <span />
                    </div>
                    <h3>{emptyTitle}</h3>
                    <p>{emptyDescription}</p>
                    {emptyAction}
                  </div>
                </td>
              </tr>
            ) : (
              sortedData.map((row, index) => {
                const id = getRowId(row);
                const isSelected = selectedIds.includes(id);

                return (
                  <tr
                    key={id}
                    className={[
                      isSelected ? styles.selectedRow : "",
                      onRowClick ? styles.clickableRow : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => onRowClick?.(row)}
                  >
                    {selectable && (
                      <td className={styles.checkboxCell}>
                        <button
                          type="button"
                          className={`${styles.checkbox} ${
                            isSelected ? styles.checked : ""
                          }`}
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleRow(id);
                          }}
                          aria-label={`Select row ${id}`}
                          aria-pressed={isSelected}
                        >
                          {isSelected && <Check size={13} />}
                        </button>
                      </td>
                    )}

                    {columns.map((column) => (
                      <td
                        key={column.key}
                        style={{
                          textAlign: column.align ?? "left",
                        }}
                      >
                        {column.render
                          ? column.render(row, index)
                          : column.accessor
                            ? String(row[column.accessor] ?? "—")
                            : "—"}
                      </td>
                    ))}

                    {rowActions && (
                      <td
                        className={styles.actionsCell}
                        onClick={(event) => event.stopPropagation()}
                      >
                        {rowActions(row)}
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
