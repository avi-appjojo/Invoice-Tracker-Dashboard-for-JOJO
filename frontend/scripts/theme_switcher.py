"""
One-off theme migration: dark → light, emerald/cyan → JOJO orange.
Run from frontend/ or project root: python scripts/theme_switcher.py
"""
import os
import re

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_SRC = os.path.join(SCRIPT_DIR, "..", "src")

REPLACEMENTS = [
    (r"bg-neutral-950", "bg-neutral-50"),
    (r"bg-neutral-900/50", "bg-white"),
    (r"bg-neutral-900", "bg-white"),
    (r"bg-neutral-800/60", "bg-neutral-100"),
    (r"bg-neutral-800/50", "bg-neutral-50"),
    (r"bg-neutral-800/30", "bg-neutral-100"),
    (r"bg-neutral-800/20", "bg-neutral-100"),
    (r"bg-neutral-800", "bg-neutral-100"),
    (r"hover:bg-neutral-800/30", "hover:bg-neutral-100"),
    (r"hover:bg-neutral-800", "hover:bg-neutral-100"),
    (r"text-white", "text-neutral-900"),
    (r"text-neutral-400", "text-neutral-500"),
    (r"text-neutral-500", "text-neutral-600"),
    (r"placeholder:text-neutral-600", "placeholder:text-neutral-400"),
    (r"border-neutral-800/50", "border-neutral-200"),
    (r"border-neutral-800", "border-neutral-200"),
    (r"border-neutral-700", "border-neutral-300"),
    (r"hover:border-neutral-700", "hover:border-neutral-300"),
    (r"hover:border-neutral-600", "hover:border-neutral-400"),
    (r"from-emerald-400", "from-jojo-orange"),
    (r"to-cyan-400", "to-orange-400"),
    (r"from-emerald-500", "from-jojo-orange"),
    (r"to-cyan-500", "to-orange-500"),
    (r"from-emerald-600", "from-orange-600"),
    (r"to-cyan-600", "to-orange-600"),
    (r"from-cyan-500/20", "from-orange-500/20"),
    (r"to-blue-500/20", "to-red-500/20"),
    (r"text-cyan-400", "text-jojo-orange"),
    (r"border-emerald-400", "border-jojo-orange"),
    (r"border-emerald-500/30", "border-jojo-orange/30"),
    (r"bg-emerald-500/15", "bg-jojo-orange/15"),
    (r"bg-emerald-500/5", "bg-jojo-orange/5"),
    (r"text-emerald-400", "text-jojo-orange"),
    (r"text-emerald-500", "text-jojo-orange"),
    (r"text-emerald-600", "text-orange-600"),
]


def process_file(filepath: str) -> None:
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
    new_content = content
    for old, new in REPLACEMENTS:
        new_content = new_content.replace(old, new)
    new_content = re.sub(r"dark:bg-[a-zA-Z0-9-]+", "", new_content)
    new_content = re.sub(r"dark:border-[a-zA-Z0-9-]+", "", new_content)
    new_content = re.sub(r"dark:text-[a-zA-Z0-9-]+", "", new_content)
    new_content = re.sub(r"dark:hover:[a-zA-Z0-9-]+", "", new_content)
    if new_content != content:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(new_content)
        print(f"Updated {filepath}")


def main() -> None:
    for root, _dirs, files in os.walk(os.path.abspath(FRONTEND_SRC)):
        for file in files:
            if file.endswith(".tsx") or file.endswith(".ts"):
                process_file(os.path.join(root, file))


if __name__ == "__main__":
    main()
