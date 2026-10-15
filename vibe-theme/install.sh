#!/bin/sh
# Install one prepared demo package under a fresh ID; leave selection to the reviewer.
set -eu

if [ "$#" -ne 1 ]; then
  printf 'Usage: %s <haunted-kitchen|deep-sea|halloween>\n' "$0" >&2
  exit 2
fi

case "$1" in
  haunted-kitchen|deep-sea|halloween) theme_name=$1 ;;
  *) printf 'Unknown prepared theme: %s\n' "$1" >&2; exit 2 ;;
esac

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
source_dir=$script_dir/prepared/$theme_name
themes_dir=/root/.television/themes
theme_id=demo-$theme_name
target_dir=$themes_dir/$theme_id

if [ -e "$target_dir" ] || [ -L "$target_dir" ]; then
  printf 'Refusing to overwrite: %s\n' "$target_dir" >&2
  exit 1
fi

# mkdir is the final existence check, so a concurrent installer cannot take the same ID.
if ! mkdir -- "$target_dir"; then
  printf 'Could not create: %s\n' "$target_dir" >&2
  exit 1
fi

if ! cp -R -- "$source_dir/." "$target_dir/"; then
  rm -rf -- "$target_dir"
  printf 'Copy failed; removed incomplete package.\n' >&2
  exit 1
fi

printf 'Installed %s\nRun: tv set-theme %s\n' "$target_dir" "$theme_id"
