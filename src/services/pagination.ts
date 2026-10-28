/** One page of a longer list, as the API returns it */
export type Page<Item> = {
  items: readonly Item[]
  /** Items across every page */
  total: number
  limit: number
  offset: number
}

/** Reads the `page` search param (1, 2, …), defaulting to the first page. */
export function parsePageNumber(value: string | null): number {
  const page = Number(value)
  return Number.isSafeInteger(page) && page >= 1 ? page : 1
}

export function pageOffset(pageNumber: number, pageSize: number): number {
  return (pageNumber - 1) * pageSize
}

export function countPages({ total, limit }: Pick<Page<unknown>, 'total' | 'limit'>): number {
  return Math.max(1, Math.ceil(total / limit))
}
