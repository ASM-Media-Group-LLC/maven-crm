

## Problem Analysis

The presence system (contact online status) fails because the `useOnlinePresence` effect depends on `[user]` (the full object reference). The `AuthProvider` sets `user` via both `onAuthStateChange` AND `getSession()`, producing **two different object references** for the same user on every page load. This causes the effect to:

1. Create channel → subscribe → begin tracking
2. Immediately tear down that channel (cleanup from re-run)
3. Create a **new** channel → subscribe again

This race condition destroys the first presence sync before it completes, and the second channel may not fully establish. Result: "0 en línea" permanently.

## Fix

**File: `src/hooks/useOnlinePresence.ts`**

1. Change the `useEffect` dependency from `[user]` to `[user?.id]` — the effect only needs to re-run when the user *identity* changes (login/logout), not when the object reference changes.

2. Store `user?.id` in a ref for use inside `setMyStatus` callback, and change its dependency from `[user]` to `[user?.id]` as well.

3. Add `join` and `leave` presence event handlers (in addition to `sync`) for more responsive status updates — `sync` only fires periodically, while `join`/`leave` fire immediately when a user connects or disconnects.

These are minimal, targeted changes to `useOnlinePresence.ts` only. No other files need modification.

