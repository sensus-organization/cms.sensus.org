export const teamLabel = (name?: string | null, year?: number | null) =>
  year ? `${name ?? ''} (${year})` : (name ?? null);
