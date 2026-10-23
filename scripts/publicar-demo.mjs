// Publica a demonstração (dados fictícios, sem Supabase) em https://calper-portal-demo.vercel.app.
// Uso: npm run demo:publicar   (precisa da Vercel CLI logada na conta que tem o projeto calper-portal-demo).
// Gera o build no modo "demo", acrescenta as mesmas regras do vercel.json do portal (CSP, rotas) e um noindex,
// e publica como projeto separado: não toca o portal de produção nem o Supabase.
// Publica a partir de uma pasta temporária FORA do repositório: dentro dele a CLI manda os dados do commit, e a Vercel
// bloqueia a publicação ("Blocked") quando o autor do commit não é membro da equipe da Vercel.
import { execSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PASTA = "dist-demo";
const PROJETO = { projectId: "prj_cbveeAnChOKFHf4bUA8IEtOx919u", orgId: "team_UQVIeBPh5va4KTqLu9SWFEOD", projectName: "calper-portal-demo" };

execSync("npm run demo:build", { stdio: "inherit" });

const config = JSON.parse(readFileSync("vercel.json", "utf8"));
for (const k of ["buildCommand", "outputDirectory", "framework"]) delete config[k];
config.headers.push({ source: "/(.*)", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] });

const destino = mkdtempSync(join(tmpdir(), "calper-portal-demo-"));
cpSync(PASTA, destino, { recursive: true });
writeFileSync(join(destino, "vercel.json"), JSON.stringify(config, null, 2));
writeFileSync(join(destino, "robots.txt"), "User-agent: *\nDisallow: /\n");
mkdirSync(join(destino, ".vercel"), { recursive: true });
writeFileSync(join(destino, ".vercel", "project.json"), JSON.stringify(PROJETO));

try {
  execSync("npx --yes vercel@latest deploy --prod --yes", { stdio: "inherit", cwd: destino });
  console.log("\nDemonstração publicada: https://calper-portal-demo.vercel.app");
} finally {
  // No Windows a CLI da Vercel ainda segura arquivos logo depois do deploy (EPERM): tenta de novo e, se não der, só avisa.
  try {
    rmSync(destino, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  } catch {
    console.warn(`Não foi possível apagar a pasta temporária ${destino}; apague à mão depois.`);
  }
}
