# Design: remove an entry from `SerialNumber` by serial

## Context

`SerialNumber` hands out monotonically increasing serials and keeps a registry of every issued `{ serial, user }` pair.

- The registry is the public field `users: { serial: number; user: string }[]` [repo: src/services/SerialNumber.ts:3].
- `getNewSerialNumber(user = '')` pushes one entry and bumps `curSerial` [repo: src/services/SerialNumber.ts:9-20].
- The service is reached over HTTP through an Express wrapper: `GET /serial` issues a serial and `GET /users` dumps the registry, wired in `armResponders` [repo: src/main.ts:25-34]. Responders are static `(services, req, res)` methods that take inputs from `req.query` and reply with `res.json(...)` [repo: src/responders/SerialNumberResponder.ts:11-34].

There is currently no way to take an entry back out — in the service or over HTTP. This doc proposes removal by serial. Removal by name is a separate design (see `remove-by-user.md`).

## Why by serial

`serial` is the only unique identifier in the registry: serials are monotonically increasing and never repeat by construction. So removing by serial matches at most one row and is unambiguous — unlike removing by name, where `user` is not unique and defaults to `''`.

## Proposal

Add a service method and expose it over HTTP as a `DELETE` endpoint:

```ts
// Remove the single entry with this serial. Returns true if one was removed.
public removeBySerial(serial: number): boolean
```

### Behaviour

- `removeBySerial` finds the index whose `serial` matches, splices it out, returns `true`; returns `false` if no match. At most one row, since serials are unique by construction.

### HTTP endpoint

Expose the method as a `DELETE`, adding an `armEndpoint('DELETE', …)` call in `armResponders` [repo: src/main.ts:19-35]. `armEndpoint` already routes `DELETE` [repo: src/ExpressWrapper.ts:97].

| Method & path             | Service call        |
| ------------------------- | ------------------- |
| `DELETE /serial?serial=N` | `removeBySerial(N)` |

`DELETE /serial` reuses the `/serial` path (Express keys routes by method, so it coexists with `GET /serial`). Inputs come from the query string, matching the existing responders, which all read `req.query` and use no path parameters [repo: src/responders/SerialNumberResponder.ts:16-33].

**`DELETE /serial?serial=N`** — parse `req.query.serial` (a string) to a number. Missing or non-numeric → `400` (no row can be addressed). `removeBySerial` returning `true` → `200` with JSON `{ removed: true, serial: N }`; `false` (no such serial) → `404`.

Returning `404`/`400` is new behaviour: the existing responders never set a status code and always answer `200` [repo: src/responders/SerialNumberResponder.ts:18-33], so the new responder calls `res.status(…)` before `res.json(…)`.

### Explicitly out of scope

- **`curSerial` is not rewound.** Removing an entry does not free its serial for reuse; `curSerial` keeps climbing. Reuse would risk handing out a serial that a prior holder still believes is theirs. If serial reuse is wanted, that is a separate design.
- No change to `getNewSerialNumber` or the `users` field shape, so existing callers and tests are unaffected.

## Alternatives considered

- **Switch `users` to a `Map<number, string>` keyed by serial** — makes both add and remove O(1) and the uniqueness explicit, but changes the public field's type and breaks the array-indexing assertions in the existing tests [repo: src/services/SerialNumber.test.ts:30-38]. Larger blast radius than the task warrants; worth revisiting if the registry grows.
- **Path-param route** (`DELETE /serial/:serial`) — more conventional REST, but no current route uses path params; every responder reads `req.query` [repo: src/responders/SerialNumberResponder.ts:16-33]. Rejected for consistency with the existing surface.

## Test plan

Extend `SerialNumber.test.ts`:

- `removeBySerial` removes the right row and returns `true`; returns `false` for an unknown serial; leaves other rows and `curSerial` untouched.
- A subsequent `getNewSerialNumber` after a removal still returns the next serial (proving `curSerial` was not rewound).

Extend `SerialNumberResponder.test.ts` for the endpoint, following its existing mock-`services`/`req`/`res` pattern [repo: src/responders/SerialNumberResponder.test.ts:17-39] (the `res` mock gains `status: jest.fn().mockReturnThis()`):

- `removeBySerial`: a matching serial → `status(200)` and `{ removed: true, … }`; an unknown serial → `status(404)`; a missing or non-numeric `serial` → `status(400)`.

## Open questions

1. Should removing a serial ever make it reusable? (Assumed **no** above.)
