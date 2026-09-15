import { cp, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
await mkdir(resolve(root, "public/pdfjs"), { recursive: true });
for (const folder of ["cmaps", "standard_fonts", "wasm", "iccs"]) {
  await cp(resolve(root, "node_modules/pdfjs-dist", folder), resolve(root, "public/pdfjs", folder), { recursive: true });
}
