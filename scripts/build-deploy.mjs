import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const deployDir = path.join(root, "deploy");
const serverDir = path.join(root, "server");

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else copyFile(from, to);
  }
}

console.log("Building React frontend...");
execSync("npm run build", { cwd: path.join(root, "client"), stdio: "inherit" });

console.log("Preparing deploy folder...");
fs.mkdirSync(path.join(deployDir, "tmp"), { recursive: true });

const serverFiles = ["index.js", "textExtractor.js", ".env.example"];
for (const file of serverFiles) {
  copyFile(path.join(serverDir, file), path.join(deployDir, file));
}

// Local humanization engine modules.
copyDir(path.join(serverDir, "humanizer"), path.join(deployDir, "humanizer"));

// cPanel and some hosts look for app.js as the startup file.
copyFile(path.join(serverDir, "index.js"), path.join(deployDir, "app.js"));

copyFile(
  path.join(root, "DEPLOY-LINUX.md"),
  path.join(deployDir, "DEPLOY-LINUX.md")
);

const deployPackage = {
  name: "aihumanizer",
  version: "1.0.0",
  description: "AI Humanizer - production build for Linux servers",
  type: "module",
  main: "index.js",
  scripts: {
    start: "node index.js",
  },
  engines: {
    node: ">=18.0.0",
  },
  dependencies: {
    compromise: "^14.14.4",
    cors: "^2.8.5",
    dotenv: "^16.4.7",
    express: "^4.21.2",
    mammoth: "^1.9.0",
    multer: "^2.0.1",
    natural: "^8.0.1",
    "pdf-parse": "^1.1.1",
    "string-similarity": "^4.0.4",
  },
};

fs.writeFileSync(
  path.join(deployDir, "package.json"),
  JSON.stringify(deployPackage, null, 2) + "\n"
);

fs.writeFileSync(path.join(deployDir, "tmp", ".gitkeep"), "");

// Do not bundle node_modules in the zip — dependencies must be installed
// on the Linux server so native modules match the host OS/Node version.
if (fs.existsSync(path.join(deployDir, "node_modules"))) {
  fs.rmSync(path.join(deployDir, "node_modules"), { recursive: true, force: true });
}
if (fs.existsSync(path.join(deployDir, "package-lock.json"))) {
  fs.unlinkSync(path.join(deployDir, "package-lock.json"));
}

const zipName = "aihumanizer-linux.zip";
const zipPath = path.join(root, zipName);

console.log(`Creating ${zipName} (without node_modules)...`);
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

if (process.platform === "win32") {
  execSync(
    `powershell -NoProfile -Command "Compress-Archive -Path '${deployDir}\\*' -DestinationPath '${zipPath}' -Force"`,
    { stdio: "inherit" }
  );
} else {
  execSync(`cd "${deployDir}" && zip -r "${zipPath}" .`, { stdio: "inherit" });
}

console.log(`\nDone! Upload this file to your Linux server:\n  ${zipPath}\n`);
