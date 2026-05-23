# Sustained Loop: Story Generation Quality Testing

## Goal
Run iterative prompt testing with 15-20 diverse tracks until quality validation passes for most tracks (≥15/20 on production OR Groq direct works).

## Done when
- `npm run build` succeeds in backend
- Benchmark scripts exist with 35s production delay
- ≥15/20 tracks pass quality validation on production OR Groq local benchmark works for 5 tracks
- Code fixes applied for quality issues; Android templates updated if Groq unavailable

## Iteration
1 (starting)

## Completed
- Progress file created

## Next
- Explore codebase (prompts.ts, story-quality.ts, existing scripts)
- npm run build
- Create/update benchmark scripts

## Blockers
- None yet
