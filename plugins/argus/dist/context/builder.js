import fs from "node:fs/promises";
import path from "node:path";
async function exists(p) {
    try {
        await fs.access(p);
        return true;
    }
    catch {
        return false;
    }
}
async function readJson(p) {
    try {
        return JSON.parse(await fs.readFile(p, "utf8"));
    }
    catch {
        return null;
    }
}
const EXT_LANG = {
    ".ts": "TypeScript",
    ".tsx": "TypeScript",
    ".js": "JavaScript",
    ".jsx": "JavaScript",
    ".py": "Python",
    ".go": "Go",
    ".java": "Java",
    ".kt": "Kotlin",
    ".rb": "Ruby",
    ".rs": "Rust",
    ".php": "PHP",
    ".cs": "C#",
    ".swift": "Swift",
    ".c": "C",
    ".cpp": "C++",
    ".sql": "SQL",
};
/** Detect frameworks from JS/TS dependency names. */
const JS_FRAMEWORK_HINTS = {
    react: "React",
    "react-native": "React Native",
    next: "Next.js",
    express: "Express",
    "@nestjs/core": "NestJS",
    fastify: "Fastify",
    vue: "Vue",
    "@angular/core": "Angular",
    svelte: "Svelte",
};
export async function buildContext(repoRoot, diff) {
    const metadata = await detectMetadata(repoRoot, diff);
    const overview = renderOverview(diff, metadata);
    return { repoRoot, diff, metadata, overview };
}
async function detectMetadata(repoRoot, diff) {
    const languages = new Set();
    const frameworks = new Set();
    let packageManager;
    // Languages from changed-file extensions.
    for (const f of diff.files) {
        const lang = EXT_LANG[path.extname(f.path).toLowerCase()];
        if (lang)
            languages.add(lang);
    }
    // JS/TS ecosystem.
    const pkg = await readJson(path.join(repoRoot, "package.json"));
    if (pkg) {
        // Language comes from file extensions; only add a baseline if none matched.
        if (languages.size === 0)
            languages.add("JavaScript");
        const deps = {
            ...pkg.dependencies,
            ...pkg.devDependencies,
        };
        for (const [dep, label] of Object.entries(JS_FRAMEWORK_HINTS)) {
            if (deps[dep])
                frameworks.add(label);
        }
        if (await exists(path.join(repoRoot, "pnpm-lock.yaml")))
            packageManager = "pnpm";
        else if (await exists(path.join(repoRoot, "yarn.lock")))
            packageManager = "yarn";
        else if (await exists(path.join(repoRoot, "package-lock.json")))
            packageManager = "npm";
    }
    // Other ecosystems.
    if (await exists(path.join(repoRoot, "requirements.txt"))) {
        languages.add("Python");
        packageManager ??= "pip";
    }
    if (await exists(path.join(repoRoot, "pyproject.toml"))) {
        languages.add("Python");
    }
    if (await exists(path.join(repoRoot, "go.mod"))) {
        languages.add("Go");
        packageManager ??= "go modules";
    }
    if ((await exists(path.join(repoRoot, "pom.xml"))) ||
        (await exists(path.join(repoRoot, "build.gradle")))) {
        languages.add("Java");
        if (await exists(path.join(repoRoot, "pom.xml")))
            frameworks.add("Maven");
    }
    if (await exists(path.join(repoRoot, "Cargo.toml"))) {
        languages.add("Rust");
        packageManager ??= "cargo";
    }
    if (await exists(path.join(repoRoot, "Gemfile"))) {
        languages.add("Ruby");
        packageManager ??= "bundler";
    }
    const summaryParts = [];
    if (languages.size)
        summaryParts.push(`Languages: ${[...languages].join(", ")}`);
    if (frameworks.size)
        summaryParts.push(`Frameworks: ${[...frameworks].join(", ")}`);
    if (packageManager)
        summaryParts.push(`Package manager: ${packageManager}`);
    return {
        languages: [...languages],
        frameworks: [...frameworks],
        packageManager,
        summary: summaryParts.join(" · ") || "Unknown project type",
    };
}
function renderOverview(diff, metadata) {
    const fileLines = diff.files
        .map((f) => `  ${f.status} ${f.path} (+${f.additions}/-${f.deletions})`)
        .join("\n");
    return [
        `Project: ${metadata.summary}`,
        `Base: ${diff.baseRef}`,
        `Changed files (${diff.files.length}):`,
        fileLines,
    ].join("\n");
}
