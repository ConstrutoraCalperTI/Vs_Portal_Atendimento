// Publica a demonstração (dados fictícios, sem Supabase) em https://calper-portal-demo.vercel.app.
// Uso: npm run demo:publicar   (precisa da Vercel CLI logada na conta que tem o projeto calper-portal-demo).
// Gera o build no modo "demo", acrescenta as mesmas regras do vercel.json do portal (CSP, rotas) e um noindex,
// e publica como projeto separado: não toca o portal de produção nem o Supabase.
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PASTA = "dist-demo";
const PROJETO = { projectId: "prj_cbveeAnChOKFHf4bUA8IEtOx919u", orgId: "team_UQVIeBPh5va4KTqLu9SWFEOD", projectName: "calper-portal-demo" };

execSync("npm run demo:build", { stdio: "inherit" });

const config = JSON.parse(readFileSync("vercel.json", "utf8"));
for (const k of ["buildCommand", "outputDirectory", "framework"]) delete config[k];
config.headers.push({ source: "/(.*)", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] });
writeFileSync(join(PASTA, "vercel.json"), JSON.stringify(config, null, 2));
writeFileSync(join(PASTA, "robots.txt"), "User-agent: *\nDisallow: /\n");
mkdirSync(join(PASTA, ".vercel"), { recursive: true });
writeFileSync(join(PASTA, ".vercel", "project.json"), JSON.stringify(PROJETO));

execSync("npx --yes vercel@latest deploy --prod --yes", { stdio: "inherit", cwd: PASTA });
console.log("\nDemonstração publicada: https://calper-portal-demo.vercel.app");
