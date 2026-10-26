import { ArrowDown, ArrowUp, ChevronDown } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { tr } from '../i18n';
import { classNames } from '../lib/format';
import { Spinner } from './ui';

export interface TableColumn<T> {
  key: string;
  header: string;
  width?: string;
  align?: 'left' | 'right';
  className?: string;
  render: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number;
  defaultSort?: 'asc' | 'desc';
}

interface DataTableProps<T> {
  rows: T[];
  columns: Array<TableColumn<T>>;
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  empty?: ReactNode;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  rowClassName?: (row: T) => string | undefined;
  className?: string;
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  loading,
  empty,
  hasMore,
  loadingMore,
  onLoadMore,
  rowClassName,
  className,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((item) => item.key === sort.key);
    if (!column?.sortValue) return rows;
    const factor = sort.direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const left = column.sortValue!(a);
      const right = column.sortValue!(b);
      if (typeof left === 'number' && typeof right === 'number') return (left - right) * factor;
      return String(left).localeCompare(String(right), 'zh-CN', { numeric: true }) * factor;
    });
  }, [rows, sort, columns]);

  const toggleSort = (column: TableColumn<T>) => {
    if (!column.sortValue) return;
    setSort((current) => {
      if (current?.key !== column.key) return { key: column.key, direction: 'asc' };
      if (current.direction === 'asc') return { key: column.key, direction: 'desc' };
      return null;
    });
  };

  return (
    <div className={classNames('table-wrap', className)}>
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                style={{ width: column.width }}
                className={classNames(
                  column.sortValue && 'is-sortable',
                  column.align === 'right' && 'align-right',
                )}
                onClick={() => toggleSort(column)}
                aria-sort={
                  sort?.key === column.key
                    ? sort.direction === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : undefined
                }
              >
                <span className="th-inner">
                  {tr(column.header)}
                  {column.sortValue &&
                    (sort?.key === column.key ? (
                      sort.direction === 'asc' ? (
                        <ArrowUp size={11} />
                      ) : (
                        <ArrowDown size={11} />
                      )
                    ) : (
                      <ChevronDown size={11} className="sort-idle" />
                    ))}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr
              key={rowKey(row)}
              className={classNames(onRowClick && 'is-clickable', rowClassName?.(row))}
              onClick={(event) => {
                if (!onRowClick) return;
                const target = event.target as HTMLElement;
                if (target.closest('button, a, input, select')) return;
                onRowClick(row);
              }}
              tabIndex={onRowClick ? 0 : undefined}
              onKeyDown={(event) => {
                if (onRowClick && (event.key === 'Enter' || event.key === ' ')) {
                  event.preventDefault();
                  onRowClick(row);
                }
              }}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  data-label={column.header}
                  className={classNames(
                    column.align === 'right' && 'align-right',
                    column.className,
                  )}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {loading && rows.length === 0 && (
        <div className="table-loading">
          {Array.from({ length: 5 }).map((_, index) => (
            <div className="table-loading-row" key={index}>
              <span className="skeleton" style={{ height: 12, width: `${30 + ((index * 13) % 40)}%` }} />
              <span className="skeleton" style={{ height: 12, width: '18%' }} />
              <span className="skeleton" style={{ height: 12, width: '12%' }} />
            </div>
          ))}
        </div>
      )}

      {!loading && rows.length === 0 && <div className="table-empty">{empty ?? tr('暂无资源')}</div>}

      {hasMore && (
        <div className="table-footer">
          <button type="button" className="btn btn-ghost" onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore ? <Spinner /> : null}
            {tr('加载更多')}
          </button>
        </div>
      )}
    </div>
  );
}
