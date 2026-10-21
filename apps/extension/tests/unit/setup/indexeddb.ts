/**
 * IndexedDB for unit tests (the Audit History store, `lib/bookmark-audit-store.ts`): the test
 * environment has none. Tests that read records start from an empty database with
 * `resetAuditDatabase` (`tests/unit/audit-helpers.ts`).
 */
import 'fake-indexeddb/auto';
