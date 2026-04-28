import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const packageJsonPath = path.join(projectRoot, "package.json");
const cargoTomlPath = path.join(projectRoot, "src-tauri", "Cargo.toml");
const isCheckOnly = process.argv.includes("--check");
const cargoPackageVersionPattern =
  /(\[package\][\s\S]*?^\s*version\s*=\s*")([^"]+)(")/m;

/**
 * 以 UTF-8 读取文本文件内容。
 */
function readUtf8File(filePath) {
  return readFileSync(filePath, "utf8");
}

/**
 * 从 package.json 读取应用版本号。
 */
function readPackageVersion() {
  const packageJson = JSON.parse(readUtf8File(packageJsonPath));

  if (typeof packageJson.version !== "string" || packageJson.version.trim() === "") {
    throw new Error("package.json 中缺少有效的 version 字段。");
  }

  return packageJson.version.trim();
}

/**
 * 从 Cargo.toml 的 [package] 段读取版本号。
 */
function readCargoPackageVersion(cargoToml) {
  const matchedVersion = cargoToml.match(cargoPackageVersionPattern)?.[2];

  if (!matchedVersion) {
    throw new Error("无法在 src-tauri/Cargo.toml 的 [package] 段中找到 version 字段。");
  }

  return matchedVersion;
}

/**
 * 将 Cargo.toml 的 [package] 版本更新为目标版本。
 */
function updateCargoPackageVersion(cargoToml, nextVersion) {
  if (!cargoPackageVersionPattern.test(cargoToml)) {
    throw new Error("无法更新 src-tauri/Cargo.toml 的 [package].version。");
  }

  return cargoToml.replace(cargoPackageVersionPattern, `$1${nextVersion}$3`);
}

/**
 * 执行版本同步或一致性校验。
 */
function main() {
  const packageVersion = readPackageVersion();
  const cargoToml = readUtf8File(cargoTomlPath);
  const cargoVersion = readCargoPackageVersion(cargoToml);

  if (cargoVersion === packageVersion) {
    console.log(`[sync:version] Cargo.toml 已与 package.json 保持一致: ${packageVersion}`);
    return;
  }

  if (isCheckOnly) {
    throw new Error(
      `版本不一致: package.json=${packageVersion}, src-tauri/Cargo.toml=${cargoVersion}。请先运行 npm run sync:version。`,
    );
  }

  const updatedCargoToml = updateCargoPackageVersion(cargoToml, packageVersion);
  writeFileSync(cargoTomlPath, updatedCargoToml, "utf8");
  console.log(
    `[sync:version] 已将 src-tauri/Cargo.toml 的版本从 ${cargoVersion} 同步为 ${packageVersion}`,
  );
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[sync:version] ${message}`);
  process.exitCode = 1;
}
