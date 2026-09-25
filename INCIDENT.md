# Incident Investigation

## Overview

The Student Readiness Control Center uses PostgreSQL as the relational source
of truth and MongoDB for append-only operational events.

This document records the seeded incidents identified during implementation
and the controls added to prevent recurrence.

---

# Incident 1 — Duplicate Idempotency Records

## Symptom

Two identical requests using the same tenant and the same `Idempotency-Key`
could potentially create duplicate logical attempt records when requests
arrived concurrently.

The dangerous sequence was:

1. Request A checks whether the idempotency key exists.
2. Request B checks the same key before Request A commits.
3. Both requests observe no existing record.
4. Both attempt to create the logical operation.
5. Without a database uniqueness constraint, duplicate idempotency records
   could be created.

This could result in duplicate logical processing and duplicate operational
events.

## Root Cause

The application-level `findUnique` check alone is not sufficient for
concurrent requests.

A check-then-insert sequence has a race window:

```text
Request A                  Request B

find key → none            find key → none
     ↓                          ↓
create record               create record


# Incident 2 — Tenant-Unaware Cache / Stale Tenant Data

## Symptom

A rapid tenant/account switch can create overlapping requests.

For example:

1. The user is authenticated as Tenant A.
2. The student list request for Tenant A starts.
3. The user switches to another account/tenant.
4. A new student list request starts.
5. The older Tenant A request completes after the newer request.
6. If the old response is allowed to update the UI, Tenant A data can
   temporarily appear in the Tenant B view.

A frontend filter is not a security boundary.

## Root Cause

The underlying race is caused by overlapping asynchronous requests.

An older response can arrive after a newer response:

```text
Request A ────────────────────────► response A
Request B ───────────► response B

                    B finishes first
                         ↓
                    display B

                    A finishes later
                         ↓
                    unsafe implementation:
                    display A

       # Incident 3 — Concurrent Student Update Race

## Symptom

Two evaluators can read the same student record and then attempt to update
that student using the same version.

Without optimistic concurrency control, both updates could succeed and the
later update could silently overwrite the earlier update.

Example:

```text
Evaluator A                    Evaluator B

reads version 10               reads version 10
      │                              │
      ▼                              ▼
updates student                updates student
      │                              │
      ▼                              ▼
version becomes 11             could overwrite A             