import shutil
import time
import re
from pathlib import Path

# ==========================================
# 🎯 SkillCat
# Infinite Context. Zero Token Tax.
# ==========================================


class Colors:
    HEADER = "\033[95m"
    BLUE = "\033[94m"
    CYAN = "\033[96m"
    GREEN = "\033[92m"
    WARNING = "\033[93m"
    FAIL = "\033[91m"
    ENDC = "\033[0m"
    BOLD = "\033[1m"


# Global configuration state
CONFIG = {
    "agent_name": "OpenCode",
    "active_skills_dir": Path.home() / ".config" / "opencode" / "skills",
    "hidden_library_dir": Path.home() / ".opencode-skill-libraries",
}

# Advanced Heuristic Engine for Universal Categorization
DOMAIN_HEURISTICS = {
    "security": [
        "attack",
        "injection",
        "vulnerability",
        "xss",
        "penetration",
        "privilege",
        "fuzzing",
        "auth",
        "jwt",
        "oauth",
        "bypass",
        "malware",
        "forensics",
        "hacker",
        "wireshark",
        "nmap",
        "security",
        "exploit",
        "encryption",
    ],
    "code-review": [
        "code-review",
        "code review",
        "codereview",
        "requesting-code-review",
        "code-review-excellence",
        "pr-review",
        "review-agent",
        "reviewer",
        "review-bot",
        "static-analysis",
        "quality-gate",
        "sonarqube",
    ],
    "git": [
        "git",
        "github",
        "gitlab",
        "pull-request",
        "merge-request",
        "commit",
        "branch",
        "rebase",
        "cherry-pick",
        "stash",
        "tag",
        "release",
        "conventional-commits",
    ],
    "ai-ml": [
        "ai-",
        "ml-",
        "llm",
        "agent",
        "gpt",
        "claude",
        "gemini",
        "openai",
        "anthropic",
        "prompt",
        "rag",
        "diffusion",
        "huggingface",
        "pytorch",
        "tensorflow",
        "comfy",
        "flux",
        "machine-learning",
        "deep-learning",
        "vision",
        "nlp",
    ],
    "web-dev": [
        "angular",
        "react",
        "vue",
        "tailwind",
        "frontend",
        "css",
        "html",
        "nextjs",
        "svelte",
        "astro",
        "web",
        "dom",
        "ui-patterns",
        "vercel",
        "shopify",
        "styles",
        "sass",
        "less",
        "bootstrap",
    ],
    "backend-dev": [
        "api",
        "nestjs",
        "express",
        "django",
        "flask",
        "fastapi",
        "spring",
        "laravel",
        "node",
        "graphql",
        "rest",
        "grpc",
        "backend",
        "server",
        "microservice",
        "go-",
        "rust-",
    ],
    "devops": [
        "aws",
        "azure",
        "docker",
        "kubernetes",
        "ci-cd",
        "terraform",
        "ansible",
        "github-actions",
        "gitlab",
        "jenkins",
        "devops",
        "cloud",
        "linux",
        "ubuntu",
        "k8s",
        "bash",
        "deploy",
        "nginx",
    ],
    "database": [
        "sql",
        "mysql",
        "postgres",
        "mongo",
        "redis",
        "database",
        "schema",
        "prisma",
        "orm",
        "nosql",
        "supabase",
        "neon",
        "db-",
        "sqlite",
    ],
    "design": [
        "ui",
        "ux",
        "design",
        "figma",
        "avatar",
        "background-removal",
        "svg",
        "animation",
        "motion",
        "framer",
        "photoshop",
        "illustrator",
        "creative",
    ],
    "automation": [
        "automation",
        "zapier",
        "make",
        "n8n",
        "selenium",
        "playwright",
        "puppeteer",
        "bot",
        "workflow",
        "scraper",
        "cron",
    ],
    "mobile": [
        "ios",
        "android",
        "react-native",
        "flutter",
        "swift",
        "kotlin",
        "mobile",
        "xcode",
        "mobile-",
    ],
    "game-dev": [
        "game",
        "unity",
        "unreal",
        "godot",
        "phaser",
        "3d",
        "vr",
        "ar",
        "raylib",
        "pygame",
    ],
    "business": [
        "business",
        "founder",
        "sales",
        "marketing",
        "seo",
        "growth",
        "product",
        "agile",
        "scrum",
        "jira",
        "b2b",
        "crm",
    ],
    "writing": [
        "writing",
        "copywriting",
        "blog",
        "documentation",
        "readme",
        "study",
        "teardown",
        "content",
        "journalism",
    ],
    "3d-graphics": [
        "blender",
        "threejs",
        "webgl",
        "rendering",
        "3d-",
        "mesh",
        "texture",
        "shader",
    ],
    "aerospace": [
        "satellite",
        "orbit",
        "space",
        "aerodynamics",
        "avionic",
        "spacecraft",
    ],
    "agents": [
        "multi-agent",
        "swarm",
        "autonomous",
        "orchestration",
        "chain",
        "autogen",
        "crewai",
    ],
    "animation": [
        "gsap",
        "lottie",
        "keyframe",
        "transition",
        "tween",
        "rigging",
    ],
    "architecture": [
        "pattern",
        "clean-code",
        "system-design",
        "solid-",
        "ddd",
        "architect",
    ],
    "biomedical": [
        "dna",
        "protein",
        "medical",
        "health",
        "genomics",
        "bioinfo",
        "clinical",
    ],
    "blockchain": [
        "crypto",
        "web3",
        "solidity",
        "smart-contract",
        "ethereum",
        "bitcoin",
        "nft",
        "staking",
    ],
    "compliance": [
        "gdpr",
        "hipaa",
        "soc2",
        "audit",
        "policy",
        "legal",
        "privacy",
    ],
    "data-science": [
        "pandas",
        "numpy",
        "matplotlib",
        "scikit",
        "jupyter",
        "visualization",
        "data-",
        "etl",
    ],
    "education": [
        "learning",
        "course",
        "tutor",
        "student",
        "curriculum",
        "teaching",
        "university",
    ],
    "finance": [
        "trading",
        "stock",
        "portfolio",
        "banking",
        "ledger",
        "investment",
        "fintech",
    ],
    "marketing": [
        "ads",
        "campaign",
        "social-media",
        "brand",
        "analytics",
        "funnel",
        "email-marketing",
    ],
    "mcp": [
        "mcp-",
        "model-context-protocol",
        "server-",
        "client-",
    ],
    "media-production": [
        "video",
        "audio",
        "podcast",
        "editing",
        "streaming",
        "ffmpeg",
        "obs",
    ],
    "programming": [
        "python",
        "javascript",
        "typescript",
        "java",
        "cpp",
        "ruby",
        "php",
        "csharp",
        "swift",
        "kotlin",
        "algorithm",
        "data-structure",
    ],
    "prompt-engineering": [
        "system-prompt",
        "few-shot",
        "chain-of-thought",
        "prompt-",
        "meta-prompt",
    ],
    "quantum": [
        "qubit",
        "qiskit",
        "quantum-",
        "superposition",
        "entanglement",
    ],
    "robotics": [
        "ros",
        "arduino",
        "raspberry",
        "hardware",
        "sensor",
        "firmware",
        "robot",
    ],
    "simulation": [
        "physics",
        "modeling",
        "sim-",
        "digital-twin",
        "solver",
    ],
    "testing": [
        "test-",
        "unit-test",
        "jest",
        "pytest",
        "cypress",
        "quality",
        "qa-",
    ],
    "tooling": [
        "cli",
        "prettier",
        "eslint",
        "bundler",
        "npm",
        "pip",
        "extension",
        "plugin",
    ],
}


def print_banner():
    print(f"\n{Colors.BOLD}{Colors.CYAN}    🎯 SkillCat {Colors.ENDC}")
    print(f"{Colors.BLUE}    Infinite Context. Zero Token Tax.\n{Colors.ENDC}")


def resolve_claude_vault_path() -> Path:
    legacy_vault_dir = Path.home() / ".skillpointer-vault"
    new_vault_dir = Path.home() / ".skillcat-vault"

    if legacy_vault_dir.exists() and not new_vault_dir.exists():
        print(
            f"{Colors.WARNING}⚠ Detected legacy vault at {legacy_vault_dir}. Migrating to {new_vault_dir}...{Colors.ENDC}"
        )
        try:
            shutil.move(str(legacy_vault_dir), str(new_vault_dir))
        except OSError as exc:
            raise RuntimeError(
                f"Failed to migrate legacy vault '{legacy_vault_dir}' to '{new_vault_dir}': {exc}"
            ) from exc
        print(f"{Colors.GREEN}✔ Legacy vault migration completed.{Colors.ENDC}")
    elif legacy_vault_dir.exists() and new_vault_dir.exists():
        print(
            f"{Colors.WARNING}⚠ Both legacy and new Claude vault paths exist. Using {new_vault_dir} and leaving {legacy_vault_dir} unchanged.{Colors.ENDC}"
        )

    return new_vault_dir


def get_category_for_skill(skill_name: str) -> str:
    # Detect exact search within quotes
    exact_match = False
    if skill_name.startswith('"') and skill_name.endswith('"'):
        exact_match = True
        name_lower = skill_name[1:-1].strip().lower().replace("_", "-").replace(" ", "-")
    else:
        name_lower = skill_name.lower().replace("_", "-")

    has_pr_term = any(
        term in name_lower for term in ("pr-review", "pull-request", "merge-request")
    )
    if "review" in name_lower and has_pr_term:
        return "code-review"

    for category, keywords in DOMAIN_HEURISTICS.items():
        if exact_match:
            # Exact match: the full term must match one of the keywords
            if name_lower in keywords:
                return category
        else:
            # Substring match: a known keyword is contained within the term
            if any(kw in name_lower for kw in keywords):
                return category
    return "_uncategorized"


def setup_directories():
    agent_name = CONFIG["agent_name"]
    active_skills_dir = CONFIG["active_skills_dir"]
    hidden_library_dir = CONFIG["hidden_library_dir"]

    if not active_skills_dir.exists():
        print(
            f"{Colors.FAIL}✖ Error: {agent_name} skills directory not found at {active_skills_dir}{Colors.ENDC}"
        )
        print(
            f"{Colors.WARNING}Please ensure {agent_name} is installed and configured.{Colors.ENDC}"
        )
        return False

    hidden_library_dir.mkdir(parents=True, exist_ok=True)
    return True


def migrate_skills():
    active_skills_dir = CONFIG["active_skills_dir"]
    hidden_library_dir = CONFIG["hidden_library_dir"]

    print(f"{Colors.BOLD}📦 Phase 1: Analyzing and Migrating Skills...{Colors.ENDC}\n")

    category_counts = {}
    moved_count = 0

    for folder in list(active_skills_dir.iterdir()):
        if not folder.is_dir():
            continue

        # Ignore existing pointers
        if folder.name.endswith("-category-pointer"):
            continue

        # Ignore empty folders
        if not any(folder.iterdir()):
            continue

        category = get_category_for_skill(folder.name)
        cat_dir = hidden_library_dir / category
        cat_dir.mkdir(parents=True, exist_ok=True)

        dest = cat_dir / folder.name
        if dest.exists():
            shutil.rmtree(dest)

        shutil.move(str(folder), str(cat_dir))

        category_counts[category] = category_counts.get(category, 0) + 1
        moved_count += 1

        # Visually print a few for effect, but not all to avoid spam
        if moved_count <= 5 or moved_count % 50 == 0:
            print(
                f"{Colors.GREEN}  ↳ Mapped '{folder.name}' ➔ {category}/{Colors.ENDC}"
            )

    if moved_count > 5:
        print(
            f"{Colors.GREEN}  ...and {moved_count - 5} more skills safely migrated.{Colors.ENDC}"
        )

    print(
        f"\n{Colors.BLUE}✔ Successfully migrated {moved_count} raw skills into the hidden vault at {hidden_library_dir}{Colors.ENDC}\n"
    )
    return category_counts


def generate_pointers():
    active_skills_dir = CONFIG["active_skills_dir"]
    hidden_library_dir = CONFIG["hidden_library_dir"]

    print(
        f"{Colors.BOLD}⚡ Phase 2: Generating Dynamic Category Pointers...{Colors.ENDC}\n"
    )

    def parse_skill_metadata(skill_path: Path):
        name = skill_path.parent.name
        description = ""
        tags = []
        try:
            content = skill_path.read_text(encoding="utf-8")
            if content.startswith("---"):
                end_idx = content.find("---", 3)
                if end_idx != -1:
                    frontmatter = content[3:end_idx]
                    name_match = re.search(r"^name:\s*(.+)$", frontmatter, re.MULTILINE)
                    if name_match:
                        name = name_match.group(1).strip()
                    desc_match = re.search(r"^description:\s*(.+)$", frontmatter, re.MULTILINE)
                    if desc_match:
                        description = desc_match.group(1).strip()
                    tags_match = re.search(r"^tags:\s*\[(.*?)\]", frontmatter, re.MULTILINE)
                    if tags_match:
                        tags = [t.strip().strip("'\"") for t in tags_match.group(1).split(",") if t.strip()]
        except Exception:
            pass
        return name, description, tags

    pointer_template = """---
name: {category_name}-category-pointer
description: Triggers when encountering any task related to {category_name}. This is a pointer to a library of specialized skills.
---

# {category_title} Capability Library 🎯

You do not have all {category_title} skills loaded immediately in your background context. Instead, you have access to a rich library of {count} highly-specialized skills on your local filesystem.

## Instructions
1. When you need to perform a task related to {category_name}, you MUST use your file reading tools (like `list_dir` and `view_file` or `read_file`) to browse the hidden library directory: `{library_path}`
2. Locate the specific Markdown files related to the exact sub-task you need.
3. Read the relevant Markdown file(s) into your context.
4. Follow the specific instructions and best practices found within those files to complete the user's request.

## Available Knowledge
This library contains {count} specialized skills covering various aspects of {category_title}.

**Hidden Library Path:** `{library_path}`

## Skills Index
{skills_index}

*Reminder: Do not guess best practices or blindly search GitHub. Always consult your local library files first.*
"""

    created_pointers = 0
    total_skills_indexed = 0
    
    # Track all skills for the global index
    all_global_skills = []

    # We will scan the hidden_library_dir completely to ensure we include skills added previously or manually
    for cat_dir in hidden_library_dir.iterdir():
        if not cat_dir.is_dir():
            continue

        cat = cat_dir.name

        # Count actual SKILL.md files inside
        skill_files = list(cat_dir.rglob("SKILL.md"))
        count = len(skill_files)
        if count == 0:
            continue

        total_skills_indexed += count

        skills_index_lines = []
        for skill_path in sorted(skill_files):
            s_name, s_desc, s_tags = parse_skill_metadata(skill_path)
            tags_str = f" [{', '.join(s_tags)}]" if s_tags else ""
            desc_str = f"\n  *{s_desc}*" if s_desc else ""
            normalized_path = str(skill_path.parent.absolute()).replace("\\", "/")
            home_dir = str(Path.home()).replace("\\", "/")
            if normalized_path.startswith(home_dir):
                normalized_path = "~" + normalized_path[len(home_dir):]
            skills_index_lines.append(f"- **{s_name}**{tags_str}: {normalized_path}{desc_str}")
            all_global_skills.append({
                "name": s_name,
                "tags": s_tags,
                "path": normalized_path
            })

        pointer_name = f"{cat}-category-pointer"
        pointer_dir = active_skills_dir / pointer_name
        pointer_dir.mkdir(parents=True, exist_ok=True)

        cat_title = cat.replace("-", " ").title()

        content = pointer_template.format(
            category_name=cat,
            category_title=cat_title,
            count=count,
            library_path=str(cat_dir.absolute()).replace("\\", "/"),
            skills_index="\n".join(skills_index_lines)
        )

        with open(pointer_dir / "SKILL.md", "w", encoding="utf-8") as f:
            f.write(content)

        created_pointers += 1
        print(
            f"{Colors.CYAN}  ⊕ Created {pointer_name} ➔ Indexes {count} skills.{Colors.ENDC}"
        )

    # Generate the global skills-index for "Tags Only" mode
    if all_global_skills:
        global_index_dir = active_skills_dir / "skills-index"
        global_index_dir.mkdir(parents=True, exist_ok=True)
        
        # Sort globally by name
        all_global_skills.sort(key=lambda s: s["name"])
        
        global_index_lines = []
        for s in all_global_skills:
            tags_str = f" [{', '.join(s['tags'])}]" if s['tags'] else ""
            global_index_lines.append(f"- **{s['name']}**{tags_str}: {s['path']}")
            
        global_index_content = f"""---
name: skills-index
description: A global semantic index of all hidden skills available. Use this to find the best skill for a task based on tags.
---

# Global Skills Index 🌐

You have access to a massive hidden library of {total_skills_indexed} specialized skills. This index allows you to find the exact skill you need based on semantic tags.

## Instructions
1. Search this index to find skills whose tags best match the user's request.
2. Read the specific Markdown files at the provided absolute paths.
3. Do NOT guess paths. Always use the paths exactly as provided below.

## Index
{chr(10).join(global_index_lines)}
"""
        with open(global_index_dir / "SKILL.md", "w", encoding="utf-8") as f:
            f.write(global_index_content)
        
        print(
            f"{Colors.CYAN}  ⊕ Created skills-index ➔ Global semantic index of {total_skills_indexed} skills.{Colors.ENDC}"
        )

    print(
        f"\n{Colors.BLUE}✔ Successfully generated {created_pointers} ultra-lightweight pointers and 1 global index for {total_skills_indexed} total skills.{Colors.ENDC}"
    )


def run_setup(agent: str = "opencode") -> None:
    if agent == "claude":
        CONFIG["agent_name"] = "Claude Code"
        CONFIG["active_skills_dir"] = Path.home() / ".claude" / "skills"
        CONFIG["hidden_library_dir"] = resolve_claude_vault_path()
    else:
        CONFIG["agent_name"] = "OpenCode"
        CONFIG["active_skills_dir"] = Path.home() / ".config" / "opencode" / "skills"
        CONFIG["hidden_library_dir"] = Path.home() / ".opencode-skill-libraries"

    print_banner()
    if not setup_directories():
        return

    time.sleep(1)
    migrate_skills()
    time.sleep(1)
    generate_pointers()

    print(
        f"\n{Colors.BOLD}{Colors.GREEN}=========================================={Colors.ENDC}"
    )
    print(
        f"{Colors.BOLD}{Colors.GREEN}✨ Setup Complete! Your AI is now optimized. ✨{Colors.ENDC}"
    )
    print(
        f"{Colors.BOLD}{Colors.GREEN}=========================================={Colors.ENDC}"
    )
    print(f"Your active skills directory now only contains optimized Pointers.")
    print(
        "When you prompt your AI, its context window will be completely empty, but it will dynamically fetch from your massive library exactly when needed."
    )


def main():
    import argparse
    parser = argparse.ArgumentParser(
        description="SkillCat Setup - Infinite Context. Zero Token Tax."
    )
    parser.add_argument("--agent", choices=["opencode", "claude"], default="opencode", 
                        help="Target AI agent (opencode or claude)")
    args, unknown = parser.parse_known_args()

    # Handle 'install' argument for compatibility with Install.bat/vbs
    if unknown and unknown[0] == "install":
        pass
    run_setup(args.agent)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print(f"\n{Colors.WARNING}Setup cancelled by user.{Colors.ENDC}")
    except Exception as e:
        print(f"\n{Colors.FAIL}An unexpected error occurred: {e}{Colors.ENDC}")
