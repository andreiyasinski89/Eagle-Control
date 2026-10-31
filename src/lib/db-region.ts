/** The region part of a Neon address (`...-pooler.eu-central-1.aws.neon.tech` gives `eu-central-1`); nothing else of the address is kept. */
export function dbRegionOf(url: string | undefined): string {
  const host = /@([^/:?]+)/.exec(url ?? "")?.[1] ?? "";
  return /\.([a-z]+-[a-z]+-\d+)\.(?:aws|azure)\.neon\.tech$/.exec(host)?.[1] ?? "unknown";
}

/** Where the database is, and whether it is where the server is: the first thing to look at when pages are slow. */
export function regionVerdict(dbRegion: string, functionRegion: string | undefined): "close" | "far" | "unknown" {
  const map: Record<string, string[]> = { "eu-central-1": ["fra1", "arn1", "cdg1", "lhr1", "dub1"], "us-east-2": ["iad1", "cle1"], "us-east-1": ["iad1"], "us-west-2": ["sfo1", "pdx1"] };
  const near = map[dbRegion];
  if (!near || !functionRegion) return "unknown";
  return dbRegion === "eu-central-1" ? (functionRegion === "fra1" ? "close" : "far") : near.includes(functionRegion) ? "close" : "far";
}
