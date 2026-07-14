export interface PaginationInput { page: number; pageSize: number }
export interface PaginationQuery { skip: number; take: number }

export function toPaginationQuery({ page, pageSize }: PaginationInput): PaginationQuery {
  const safePage = Math.max(1, page);
  const safePageSize = Math.min(100, Math.max(1, pageSize));
  return { skip: (safePage - 1) * safePageSize, take: safePageSize };
}
