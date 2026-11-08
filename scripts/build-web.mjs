// Copia so os arquivos do cliente para dist/ (hospedagem estatica, ex.: Cloudflare Workers).
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist);
["index.html", "styles.css", "src", "vendor"].forEach((entry) => {
  cpSync(join(root, entry), join(dist, entry), { recursive: true });
});
console.log("dist/ pronto.");
