import { buildPaginationMeta } from './pagination';

describe('buildPaginationMeta', () => {
  it('computes totalPages and next/previous flags for a middle page', () => {
    const meta = buildPaginationMeta(45, 2, 10);
    expect(meta).toEqual({
      page: 2,
      limit: 10,
      total: 45,
      totalPages: 5,
      hasNextPage: true,
      hasPreviousPage: true,
    });
  });

  it('has no previous page on page 1', () => {
    const meta = buildPaginationMeta(45, 1, 10);
    expect(meta.hasPreviousPage).toBe(false);
    expect(meta.hasNextPage).toBe(true);
  });

  it('has no next page on the last page', () => {
    const meta = buildPaginationMeta(45, 5, 10);
    expect(meta.hasNextPage).toBe(false);
    expect(meta.hasPreviousPage).toBe(true);
  });

  it('floors totalPages at 1 when there are zero results', () => {
    const meta = buildPaginationMeta(0, 1, 10);
    expect(meta.totalPages).toBe(1);
    expect(meta.hasNextPage).toBe(false);
    expect(meta.hasPreviousPage).toBe(false);
  });
});
