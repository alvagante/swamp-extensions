#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 || ( $1 != --check && $1 != --update ) ]]; then
    printf 'Usage: %s --check|--update PATH_TO_LOOPQ_REPO\n' "$0" >&2
    exit 2
fi

mode=$1
source_skill=$2/skills/loopq
package_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
bundled_skill=$package_dir/.agents/skills/loopq

if [[ ! -f $source_skill/SKILL.md || ! -d $bundled_skill ]]; then
    printf 'Missing source or bundled loopq skill\n' >&2
    exit 2
fi

if [[ $mode == --update ]]; then
    cp -R "$source_skill/." "$bundled_skill/"
fi

diff -ru "$source_skill" "$bundled_skill"
