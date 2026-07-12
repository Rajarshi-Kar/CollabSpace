// Postgres BigInt columns (storage quotas, file sizes) come back from Prisma
// as native `bigint`, which JSON.stringify refuses to serialize by default.
// Importing this once at process startup, before any route runs, makes
// res.json() work on them everywhere instead of patching every response
// shape by hand.
declare global {
  interface BigInt {
    toJSON(): string;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};
