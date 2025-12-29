/// <reference types="vite/client" />

// TOML file imports using Vite's ?raw query
declare module '*.toml?raw' {
  const content: string;
  export default content;
}
