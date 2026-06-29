// Vite resolves image imports to their served URL (a string). Declare the
// modules so tsc accepts `import icon from "./x.png"` in the renderer.
declare module "*.png" {
  const src: string;
  export default src;
}
declare module "*.svg" {
  const src: string;
  export default src;
}
