# Design: remove entries from `SerialNumber` by user name

## Context

`SerialNumber` hands out monotonically increasing serials and keeps a registry of every issued `{ serial, user }` pair.

- The registry is the public field `users: { serial: number; user: string }[]` [repo: src/services/SerialNumber.ts:3].
- `getNewSerialNumber(user = '')` pushes one entry and bumps `curSerial` [repo: src/services/SerialNumber.ts:9-20].
- The service is reached over HTTP through an Express wrapper: `GET /serial` issues a serial and `GET /users` dumps the registry, wired in `armResponders` [repo: src/main.ts:25-34]. Responders are static `(services, req, res)` methods that take inputs from `req.query` and reply with `res.json(...)` [repo: src/responders/SerialNumberResponder.ts:11-34].

There is currently no way to take an entry back out — in the service or over HTTP. This doc proposes removal by user name. Removal by serial is a separate design (see `remove-by-serial.md`).

## Problem: `user` is not a clean key

Two facts about the current data shape force design decisions before any code:

1. **`user` is not unique.** Each call appends; calling `getNewSerialNumber('Alice')` twice yields two rows with the same `user` and different `serial`s. The test suite already registers distinct names [repo: src/services/SerialNumber.test.ts:22-43] but nothing enforces it.
2. **`user` defaults to `''`** [repo: src/services/SerialNumber.ts:9], so the empty string is a real, collision-prone key.

So "remove a user" by name may match 0, 1, or many rows. The design must make that observable to the caller.

## Proposal

Add a service method and expose it over HTTP as a `DELETE` endpoint:

```ts
// Remove every entry matching this user name. Returns the count removed.
public removeByUser(user: string): number
```

### Behaviour

- `removeByUser` filters out all matching rows and returns how many were dropped (0 when none match). Returning a count rather than a boolean makes the duplicate-name case observable to the caller.

### HTTP endpoint

Expose the method as a `DELETE`, adding an `armEndpoint('DELETE', …)` call in `armResponders` [repo: src/main.ts:19-35]. `armEndpoint` already routes `DELETE` [repo: src/ExpressWrapper.ts:97].

| Method & path           | Service call      |
| ----------------------- | ----------------- |
| `DELETE /user?user=X`   | `removeByUser(X)` |

`DELETE /user` is a new singular path, distinct from the plural `GET /users` that lists the registry. Inputs come from the query string, matching the existing responders, which all read `req.query` and use no path parameters [repo: src/responders/SerialNumberResponder.ts:16-33].

**`DELETE /user?user=X`** — read `req.query.user`. `removeByUser`'s count → `200` with JSON `{ removed: <count> }`; a count of `0` → `404`. A missing or empty `user` param → `400`; do **not** reuse `generalizeUser`, which coerces a missing/blank/array user to `'anonymous'` [repo: src/responders/SerialNumberResponder.ts:47-51] — harmless when issuing a serial, but on a destructive delete it would silently target the `'anonymous'` rows, so the responder rejects a missing param instead.

Returning `404`/`400` is new behaviour: the existing responders never set a status code and always answer `200` [repo: src/responders/SerialNumberResponder.ts:18-33], so the new responder calls `res.status(…)` before `res.json(…)`.

### Explicitly out of scope

- **`curSerial` is not rewound.** Removing entries does not free their serials for reuse; `curSerial` keeps climbing. Reuse would risk handing out a serial that a prior holder still believes is theirs. If serial reuse is wanted, that is a separate design.
- No change to `getNewSerialNumber` or the `users` field shape, so existing callers and tests are unaffected.

## Alternatives considered

- **Single `remove(user: string): void`** — simplest, matches the request literally, but silently does nothing useful in the duplicate-name and empty-string cases, and gives the caller no feedback. Rejected for being ambiguous about _which_ row and for hiding the count.
- **Switch `users` to a `Map<number, string>` keyed by serial** — makes the uniqueness explicit, but changes the public field's type and breaks the array-indexing assertions in the existing tests [repo: src/services/SerialNumber.test.ts:30-38]; it also keys by serial, not name, so it does not directly help name-based removal. Larger blast radius than the task warrants; worth revisiting if the registry grows.
- **Path-param route** (`DELETE /user/:user`) — more conventional REST, but no current route uses path params; every responder reads `req.query` [repo: src/responders/SerialNumberResponder.ts:16-33]. Rejected for consistency with the existing surface.

## Test plan

Extend `SerialNumber.test.ts`:

- `removeByUser` returns the number removed, including `0` for no match and `> 1` when the same name was registered twice.
- A subsequent `getNewSerialNumber` after a removal still returns the next serial (proving `curSerial` was not rewound).

Extend `SerialNumberResponder.test.ts` for the endpoint, following its existing mock-`services`/`req`/`res` pattern [repo: src/responders/SerialNumberResponder.test.ts:17-39] (the `res` mock gains `status: jest.fn().mockReturnThis()`):

- `removeByUser`: a name matching ≥ 1 row → `status(200)` and `{ removed: <count> }`; a name matching none → `status(404)`; a missing `user` param → `status(400)`, and never coerced to `'anonymous'`.

## Open questions

1. Should the API reject or normalise the empty-string user, or is `''` a legitimate key? (Assumed legitimate; current code permits it.)
