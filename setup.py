import os
import shutil
import time
from pathlib import Path

# ==========================================
# 🎯 SkillPointer PRO v2.0
# Infinite Context. Zero Token Tax.
# ==========================================

class Colors:
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    GREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'

agent_config_dir = Path.home() / ".config" / "opencode"
active_skills_dir = agent_config_dir / "skills"
hidden_library_dir = Path.home() / ".opencode-skill-libraries"

# Advanced Heuristic Engine for Universal Categorization
DOMAIN_HEURISTICS = {
    "security": ["attack", "injection", "vulnerability", "xss", "penetration", "privilege", "fuzzing", "auth", "jwt", "oauth", "bypass", "malware", "forensics", "hacker", "wireshark", "nmap"],
    "ai-ml": ["ai-", "ml-", "llm", "agent", "gpt", "claude", "gemini", "openai", "anthropic", "prompt", "rag", "diffusion", "huggingface", "pytorch", "tensorflow", "comfy", "flux"],
    "web-dev": ["angular", "react", "vue", "tailwind", "frontend", "css", "html", "nextjs", "svelte", "astro", "web", "dom", "ui-patterns", "vercel", "shopify"],
    "backend-dev": ["api", "nestjs", "express", "django", "flask", "fastapi", "spring", "laravel", "node", "graphql", "rest", "grpc", "backend", "server", "microservice"],
    "devops": ["aws", "azure", "docker", "kubernetes", "ci-cd", "terraform", "ansible", "github-actions", "gitlab", "jenkins", "devops", "cloud", "linux", "ubuntu", "k8s", "bash"],
    "database": ["sql", "mysql", "postgres", "mongo", "redis", "database", "schema", "prisma", "orm", "nosql", "supabase", "neon"],
    "design": ["ui", "ux", "design", "figma", "avatar", "background-removal", "svg", "animation", "motion", "framer"],
    "automation": ["automation", "zapier", "make", "n8n", "selenium", "playwright", "puppeteer", "bot", "workflow", "scraper"],
    "mobile": ["ios", "android", "react-native", "flutter", "swift", "kotlin", "mobile"],
    "game-dev": ["game", "unity", "unreal", "godot", "phaser", "3d", "vr", "ar"],
    "business": ["business", "founder", "sales", "marketing", "seo", "growth", "product", "agile", "scrum", "jira"],
    "writing": ["writing", "copywriting", "blog", "documentation", "readme", "study", "teardown"]
}

def print_banner():
    print(f"\n{Colors.BOLD}{Colors.CYAN}    🎯 SkillPointer PRO v2.0 {Colors.ENDC}")
    print(f"{Colors.BLUE}    Infinite Context. Zero Token Tax.\n{Colors.ENDC}")

def get_category_for_skill(skill_name: str) -> str:
    name_lower = skill_name.lower().replace("_", "-")
    for category, keywords in DOMAIN_HEURISTICS.items():
        if any(kw in name_lower for kw in keywords):
            return category
    return "_uncategorized"

def setup_directories():
    if not active_skills_dir.exists():
        print(f"{Colors.FAIL}✖ Error: OpenCode skills directory not found at {active_skills_dir}{Colors.ENDC}")
        print(f"{Colors.WARNING}Please ensure OpenCode is installed and configured.{Colors.ENDC}")
        return False

    hidden_library_dir.mkdir(parents=True, exist_ok=True)
    return True

def migrate_skills():
    print(f"{Colors.BOLD}📦 Phase 1: Analyzing and Migrating Skills...{Colors.ENDC}\n")
    
    category_counts = {}
    moved_count = 0
    pointer_count = 0
    
    for folder in list(active_skills_dir.iterdir()):
        if not folder.is_dir():
            continue
            
        # Ignore existing pointers
        if folder.name.endswith("-category-pointer"):
            pointer_count += 1
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
            print(f"{Colors.GREEN}  ↳ Mapped '{folder.name}' ➔ {category}/{Colors.ENDC}")

    if moved_count > 5:
        print(f"{Colors.GREEN}  ...and {moved_count - 5} more skills safely migrated.{Colors.ENDC}")
        
    print(f"\n{Colors.BLUE}✔ Successfully migrated {moved_count} raw skills into the hidden vault at {hidden_library_dir}{Colors.ENDC}\n")
    return category_counts

def generate_pointers(category_counts):
    print(f"{Colors.BOLD}⚡ Phase 2: Generating Dynamic Category Pointers...{Colors.ENDC}\n")
    
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

*Reminder: Do not guess best practices or blindly search GitHub. Always consult your local library files first.*
"""

    created_pointers = 0
    total_skills_indexed = 0
    
    # We will scan the hidden_library_dir completely to ensure we include skills added previously or manually
    for cat_dir in hidden_library_dir.iterdir():
        if not cat_dir.is_dir():
            continue
            
        cat = cat_dir.name
        
        # Count actual SKILL.md files inside
        count = sum(1 for p in cat_dir.rglob("SKILL.md"))
        if count == 0:
            continue
            
        total_skills_indexed += count
        
        pointer_name = f"{cat}-category-pointer"
        pointer_dir = active_skills_dir / pointer_name
        pointer_dir.mkdir(parents=True, exist_ok=True)
        
        cat_title = cat.replace("-", " ").title()
        
        content = pointer_template.format(
            category_name=cat,
            category_title=cat_title,
            count=count,
            library_path=str(cat_dir.absolute()).replace("\\", "/")  # Ensure cross-platform path format in markdown
        )
        
        with open(pointer_dir / "SKILL.md", "w", encoding="utf-8") as f:
            f.write(content)
            
        created_pointers += 1
        print(f"{Colors.CYAN}  ⊕ Created {pointer_name} ➔ Indexes {count} skills.{Colors.ENDC}")

    print(f"\n{Colors.BLUE}✔ Successfully generated {created_pointers} ultra-lightweight pointers indexing {total_skills_indexed} total skills.{Colors.ENDC}")

def main():
    print_banner()
    if not setup_directories():
        return
        
    time.sleep(1)
    category_counts = migrate_skills()
    time.sleep(1)
    generate_pointers(category_counts)
    
    print(f"\n{Colors.BOLD}{Colors.GREEN}=========================================={Colors.ENDC}")
    print(f"{Colors.BOLD}{Colors.GREEN}✨ Setup Complete! Your AI is now PRO. ✨{Colors.ENDC}")
    print(f"{Colors.BOLD}{Colors.GREEN}=========================================={Colors.ENDC}")
    print(f"Your active skills directory now only contains optimized Pointers.")
    print("When you prompt your AI, its context window will be completely empty, but it will dynamically fetch from your massive library exactly when needed.")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print(f"\n{Colors.WARNING}Setup cancelled by user.{Colors.ENDC}")
    except Exception as e:
        print(f"\n{Colors.FAIL}An unexpected error occurred: {e}{Colors.ENDC}")
