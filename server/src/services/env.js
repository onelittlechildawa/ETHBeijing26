import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const serverRoot = resolve(currentDir, "../..");
const workspaceRoot = resolve(serverRoot, "..");

dotenv.config({ path: resolve(workspaceRoot, ".env"), quiet: true });
dotenv.config({ path: resolve(serverRoot, ".env"), override: false, quiet: true });
