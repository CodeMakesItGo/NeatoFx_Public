#!/bin/bash
# Install NEATO-FX git hooks (run once per clone)
set -e
cd "$(git rev-parse --show-toplevel)"
ln -sf ../../tools/hooks/pre-commit .git/hooks/pre-commit
chmod +x tools/hooks/pre-commit
echo "Installed pre-commit hook -> tools/hooks/pre-commit"
