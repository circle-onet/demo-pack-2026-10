# Working rule

- Always work in a new worktree; create a new one at the beginning. Make sure that the worktree is not conflicting with pre-existing ones.
- The timeout settings for `chunk sidecar exec` is strictly set to 30 sec, and hence some tasks would time out. To let the command survive those abrupt signals, consider to run commands in the background and poll the status. For anything run inside a container, prefer launching it detached with `docker run -d` and polling `docker inspect` (see "Working around the 30 s timeout with detached containers" below).
- When you simulate CI, you don't have to take care of matrix fan-out in the CircleCI workflow, which are for showcasing use of resource classes and smarter testing. You also don't have to have another sidecar to measure how long it would take if there were only 1 sidecar.
- Before ending the session, create 1 fresh snapshot-based sidecar running spin up the app in the background with the default port binding, such that I can test the app by myself.
    - To get the app's external endpoint, run `chunk sidecar add-ssh-key --sidecar-id <id> --public-key-file <any-public-key>` (registering a throwaway key is just an unavoidable side effect) to print the sidecar URL https://8000-<sandbox-id>.e2b.app, then swap the 8000 for the app's port and hand me `https://<port>-<sandbox-id>.e2b.app` as the endpoint to work with.
    - If you use the running app for your own E2E test. You don't have to restart the app. **Never attempt to restart the app to refresh!**
- When needed use this as CircleCI Org ID: 11023efd-8d20-40c0-b255-df8c99397450
- There can be other sessions running - if you see sidecars that are not yours still running, leave them.
- Show how long the tests took, and how many sidecars you spun up to expedite the entire process.
- Never forget to follow all the rules predefined in CLAUDE.md.

## Toolchain on sidecars: prefer Docker over installing on the host

The sidecar base image is Ubuntu 24.04 with no Node or yarn, but it does ship the Docker CLI and a live daemon (reachable via `sudo`; the `user` account is not in the `docker` group). CI runs every job inside the `node:current-slim` image, so run that same image on the sidecar rather than apt-installing a toolchain:

- `sudo docker run --rm -v "$REPO":/work -w /work node:current-slim bash -lc '<cmd>'` reproduces CI's exact executor. Bind mounts of the synced repo work for read and write, so `node_modules`, build output and test results land back in `$REPO` on the sidecar.
- This is far faster than installing Node on the host: pulling `node:current-slim` took ~5 s, against minutes for `apt-get update` + the NodeSource setup script + `apt install nodejs`. Treat apt/NodeSource Node installation as the slow path and avoid it.
- `node:current-slim` (Node 26) ships no yarn and no corepack, so prefix the in-container command with `npm install --global yarn`, exactly as the CI `unit-tests` and `build` jobs already do. Do not assume corepack exists.
- A fresh sidecar's daemon starts with zero images, so the ~5 s pull recurs on each new sidecar unless the image is already baked into the snapshot you create from.

## Working around the 30 s timeout with detached containers

`docker run -d` returns a container ID immediately (well under the 30 s exec limit) and keeps the work running detached. For container workloads this is cleaner than the `nohup … & disown` + sentinel-file pattern:

- Launch: `CID=$(sudo docker run -d ... node:current-slim bash -lc '<long job>')`, writing `$CID` somewhere you can read back (shell state does not persist between `chunk sidecar exec` calls).
- Poll with short execs: `sudo docker inspect -f '{{.State.Status}} {{.State.ExitCode}}' "$CID"` until the status is `exited`, then read the exit code and `sudo docker logs "$CID"`.
- Do not use `docker wait` to block for completion in a single exec - it blocks until the container exits and so trips the 30 s timeout. Poll `docker inspect` instead.

Verified in this environment: a detached container sleeping 40 s stayed pollable across the 30 s boundary and its exit code (7) was recoverable via `docker inspect`.

## Validating this repo on sidecars: recipes and timing

Concrete commands for the `validate-via-sidecars` flow on this repo, so future sessions don't re-derive them. (`$REPO` = the synced repo dir on the sidecar.)

- **Sync target.** `chunk sidecar sync` clones the default branch then overlays the local working tree (uncommitted edits to tracked files do come across); the repo lands at `/home/user/<repo>` — here `/home/user/playground-20260615-make-agents-code-better-demo`. After syncing edits made _after_ a snapshot, re-verify they actually arrived (e.g. `grep -rl <new-symbol> src/`) before testing, or you risk green-lighting the base code.
- **Bake deps into a snapshot once.** In `node:current-slim` with the repo bind-mounted, run `npm install --global yarn && yarn install` (node_modules persists to `$REPO` via the bind mount), then `chunk sidecar snapshot create`. The snapshot captures `node_modules` **and** the pulled `node:current-slim` image, so sidecars launched from it need no re-pull and no re-sync — do **not** re-sync a snapshot-based sidecar, as `git clean -fd` would wipe the baked `node_modules`.
- **Run jobs from the baked `node_modules` — yarn is no longer needed.** Use the local bins directly:
    - Tests: `node_modules/.bin/jest --ci <files>` (add `-e JEST_JUNIT_OUTPUT_FILE=test-results/jest/junit-<shard>.xml` for per-shard JUnit).
    - Build: `node_modules/.bin/webpack --mode production` with `-e __BUILD_VERSION=<ver>` → `dist/server.js`.
    - Run/smoke: `sudo docker run -d -p 58888:58888 -v "$REPO":/work -w /work node:current-slim node dist/server.js` (app listens on `58888`).
- **5-way test split** (105 `*.test.ts`, round-robin so the heavy `pbkdf2` pattern tests spread evenly): on shard `k` in `0..4`, select files with `find src -name '*.test.ts' | sort | awk -v k=$k 'NR % 5 == k'`.

**Timing note.** The sidecar platform is not the bottleneck: `chunk sidecar exec` round-trips in ~0.3-0.6 s, control-plane calls in ~0.2 s, sidecar create in ~2 s, and real compute is small (`yarn install` ~13 s, `webpack` ~5-7 s, all 105 suites within ~60 s across 5 shards). Wall-clock is dominated by _serialized agent cadence_, so batch the pre-flight (`--version`, `auth status`, `--help`, `sidecar list`) into one or two combined calls and front-load only what gates a decision (the CI job DAG; the did-my-edits-actually-sync check).
