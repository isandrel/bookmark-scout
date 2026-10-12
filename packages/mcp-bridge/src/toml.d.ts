/** Bun imports TOML files as parsed objects; `config.ts` validates them. */
declare module "*.toml" {
  const value: unknown;
  export default value;
}
