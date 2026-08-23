import { readFile } from "node:fs/promises";
import ts from "typescript";

export async function resolve(specifier, context, nextResolve) {
  const candidates = [];
  if (specifier.startsWith("@/")) {
    candidates.push(new URL(`../src/${specifier.slice(2)}.js`, import.meta.url).href);
    candidates.push(new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url).href);
  } else if (specifier.startsWith(".") && !/\.[a-z]+$/i.test(specifier)) {
    candidates.push(`${specifier}.js`, `${specifier}.ts`);
  }

  for (const candidate of candidates) {
    try {
      return await nextResolve(candidate, context);
    } catch {
      // Try the next supported source extension.
    }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (!url.endsWith(".ts")) return nextLoad(url, context);

  const source = await readFile(new URL(url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: new URL(url).pathname,
  });

  return { format: "module", shortCircuit: true, source: output.outputText };
}
