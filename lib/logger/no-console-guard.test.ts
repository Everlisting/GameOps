/**
 * no-console 护栏(等效 docs/logging.md §18 的 ESLint no-console,跑在 pnpm test 门禁里)。
 * 约束「服务端应用代码」:lib/** + app/api/** + middleware.ts + instrumentation.ts。
 * 这些代码必须用 lib/logger,不得裸 console.*(会绕过脱敏/schema/采集)。
 *
 * 豁免:Edge logger 自身(唯一 stdout 出口靠 console)、测试文件;跳过注释行;
 * 客户端 .tsx(浏览器 console,不进服务端日志)不在约束范围。
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["lib", path.join("app", "api")];
const SCAN_FILES = ["middleware.ts", "instrumentation.ts"];

/** 相对路径(统一正斜杠)命中即豁免。 */
function isExempt(relPath: string): boolean {
  const p = relPath.replace(/\\/g, "/");
  return p === "lib/logger/edge.ts" || /\.test\.tsx?$/.test(p);
}

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      walk(abs, out);
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(abs);
    }
  }
}

const CONSOLE_RE = /console\.(log|info|warn|error|debug)\s*\(/;

function findViolations(): string[] {
  const files: string[] = [];
  for (const d of SCAN_DIRS) {
    const abs = path.join(ROOT, d);
    if (existsSync(abs)) walk(abs, files);
  }
  for (const f of SCAN_FILES) {
    const abs = path.join(ROOT, f);
    if (existsSync(abs)) files.push(abs);
  }

  const violations: string[] = [];
  for (const abs of files) {
    const rel = path.relative(ROOT, abs);
    if (isExempt(rel)) continue;
    const lines = readFileSync(abs, "utf8").split(/\r?\n/);
    lines.forEach((line, i) => {
      const t = line.trim();
      if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return; // 注释行
      if (CONSOLE_RE.test(line)) violations.push(`${rel.replace(/\\/g, "/")}:${i + 1}`);
    });
  }
  return violations;
}

describe("no-console 护栏", () => {
  it("服务端应用代码无裸 console.*(应改用 lib/logger)", () => {
    const violations = findViolations();
    expect(violations, `发现裸 console:\n${violations.join("\n")}`).toEqual([]);
  });
});
