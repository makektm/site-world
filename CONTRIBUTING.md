# Contributing

Thanks for helping. The short version:

1. `bun install && bun run check` should pass before you start.
2. Make one focused change with a test beside it.
3. If you change exports, run `bun run reference` and commit `docs/REFERENCE.md`.
4. Keep `examples/basic` compiling.
5. Open a pull request describing what changed and why.

The map of the codebase, its rules and its gotchas is [AGENTS.md](AGENTS.md). Bugs: open an issue with
a minimal world (a `layout.ts` + one room) that reproduces it.
