---
name: deal-invoice-audit
description: >
  Audits deals in Zoho CRM against Zoho Books invoices and corrects deal Amount
  fields to match actual Sales-account revenue. Runs in two modes:

  **Incremental (default — use this weekly):** Fetches only invoices created in
  the last 7 days, derives the affected deals from those invoices, then checks
  each deal's full invoiced total. Fast — typically a single page of invoices
  and a handful of deal lookups.

  **Full audit (use monthly/quarterly):** Fetches all Closed Won deals and all
  invoices. Use when you want a complete health-check of the whole portfolio.

  Trigger incremental for: "run the weekly audit", "check this week's invoices",
  "quick invoice check", "any new invoices to reconcile".
  Trigger full audit for: "run the full audit", "full reconciliation", "audit
  all deals", "monthly revenue check".

  Both modes report OVERs (invoiced more than deal), UNDERs (invoiced less),
  correct deals, Won–Admin Pending deals with invoices, and anomalies such as
  Closed Lost deals with outstanding invoices. OVER cases are updated
  automatically after line-item verification.
---

# Deal–Invoice Audit

Reconciles Zoho CRM deal Amounts against Zoho Books invoices, ensuring deal
Amounts reflect actual Sales-account revenue (not disbursements like council
fees). Supports an incremental weekly mode and a full portfolio audit mode.

## Tools & Config

- **Zoho CRM MCP**: `mcp__Zoho-CRM__*`
  - `searchRecords` — fetch deals in bulk (full audit)
  - `getRecord` — fetch a single deal by ID (incremental)
  - `updateRecord` — update deal Amount
- **Zoho Books MCP**: `mcp__Zoho-Books__*`
  - `list_invoices` — bulk invoice fetch (paginated); supports `created_date_start` and `zcrm_potential_id` filters
  - `get_invoice` — fetch line items for a single invoice
- **Zoho Books org_id**: `20079285525`
- **Sales account**: `account_id = "218179000000000376"`, `account_name = "Sales"`
- **Non-Sales accounts to exclude** (e.g. Local Council Fee `218179000000089054`,
  Planning Portal Submission Fee `218179000000089060`, and any other account that isn't Sales)

---

## Mode A — Incremental Audit (Weekly Default)

### Step 1 — Fetch last 7 days of invoices

Use `list_invoices` with `created_date_start = today − 7 days` (format: `YYYY-MM-DD`).

```
organization_id: "20079285525"
created_date_start: "<date>"
per_page: 200
```

This is almost always a single page. Check `has_more_page` and paginate if needed.
Skip `void` invoices. Extract from each invoice:
- `invoice_id`, `invoice_number`, `status`, `total`, `zcrm_potential_id`

Collect the unique set of `zcrm_potential_id` values — these are the deals to audit.

### Step 2 — Fetch each affected deal from CRM

For each unique `zcrm_potential_id`, use `getRecord` on the `Deals` module:

```
module: "Deals"
recordID: <zcrm_potential_id>
```

Extract: `id`, `Deal_Name`, `Amount`, `Stage`, `Project_Number`.

**Stage routing:**
- `Stage == "Closed Won"` → proceed to Step 3
- `Stage == "Won - Admin Pending"` → note in report, skip comparison (will be audited once promoted to Closed Won)
- `Stage == "Closed Lost"` → flag as anomaly if the invoice is not void
- Any other stage → note in report, skip

### Step 3 — Fetch ALL invoices for each Closed Won deal

For each Closed Won deal, fetch its complete invoice history (not just this week's):

```
list_invoices(
  organization_id="20079285525",
  zcrm_potential_id="<deal_id>",
  per_page=200
)
```

Sum the `total` of all non-void invoices (`status` in `paid`, `draft`, `sent`, `overdue`).

### Step 4 — Compare and classify

```
invoiced_total = sum of non-void invoice totals for this deal
```

- **MATCH** — `invoiced_total == deal.Amount` (±£0.01 tolerance)
- **OVER** — `invoiced_total > deal.Amount` → proceed to Step 5
- **UNDER** — `invoiced_total < deal.Amount` → flag for manual review, do not update
- **NO_INVOICES** — no invoices linked at all

### Step 5 — Line-item verification for OVER cases

For every OVER deal, fetch full detail of each invoice via `get_invoice`:

```
get_invoice(invoice_id=..., organization_id="20079285525")
```

Sum only line items where `line_item["account_id"] == "218179000000000376"` (Sales).
This strips out council fees, portal fees, and other disbursements.

Re-classify based on Sales-only total:
- `sales_total == deal.Amount` → reclassify as MATCH (was already correct)
- `sales_total > deal.Amount` → confirmed OVER → update in Step 6
- `sales_total < deal.Amount` → reclassify as UNDER → do not update
- Unfamiliar `account_id` found → **pause and ask the user** before updating

### Step 6 — Update confirmed OVER deals

```
updateRecord(
  module="Deals",
  recordID=<deal_id>,
  body={"data": [{"id": <deal_id>, "Amount": <sales_total>}]}
)
```

Only update if every line item is either Sales or a known-safe exclusion.

### Step 7 — Report

Use the standard report format (see Report Format section below).

---

## Mode B — Full Audit

### Step 1 — Fetch all Closed Won deals

Use `searchRecords` on the `Deals` module. Paginate 200 per page until `more_records` is false.

```
criteria: (Stage:equals:Closed Won)
fields: id, Deal_Name, Amount, Project_Number
```

Build a dict keyed by `id`. Exclude `Stage == "Won - Admin Pending"` client-side if needed.

### Step 2 — Fetch all invoices from Zoho Books

Use `list_invoices` with `organization_id = "20079285525"`, paginate 200 per page until
`has_more_page` is false. Skip `void` invoices. Group by `zcrm_potential_id`.

> **Note on invoice numbers:** Always use `zcrm_potential_id` to link invoices to deals —
> never parse the invoice number prefix. An invoice numbered `1338INV04` may be linked to
> deal 1388 in Books. Flag such mismatches as anomalies.

### Steps 3–6 — Same as Incremental Mode Steps 4–6

Apply to all deals from Step 1.

---

## Report Format

Present results in this exact structure after every run:

---

### Deal–Invoice Audit Report — [mode] — [date range]

**✅ Updated (N deals)**
| Project | Deal | Old Amount | New Amount |
|---------|------|-----------|------------|
| 1527 | 1527 - 40 Mays Way, NN12 7PP | £1,650 | £1,875 |

**✓ Already Correct — Closed Won (N deals)**
List deal names only, one per line.

**⚠️ UNDER — Manual Review Needed (N deals)**
| Project | Deal | Deal Amount | Invoiced (Sales) | Gap |
|---------|------|------------|-----------------|-----|

Explain the gap briefly (e.g. "single invoice only, possible missing invoice").

**⏳ Won – Admin Pending (N deals)**
| Project | Deal | Invoice | Amount |
|---------|------|---------|--------|

These will be re-evaluated automatically once promoted to Closed Won.

**🚨 Anomalies**
- Closed Lost deals with non-void invoices (specify invoice status and amount)
- Invoice number prefix mismatches vs `zcrm_potential_id`
- Any unfamiliar account IDs encountered during line-item verification

**📋 No Invoices Linked (N deals)**
List Closed Won deals with zero linked invoices (full audit only).

---

## Edge Cases & Gotchas

**VAT-only top-up invoices:** Use the invoice-level `total` field directly — it already
represents what the client paid including VAT.

**Split invoices:** A single stage may be split across two invoices (deposit + completion).
Sum both. This is normal.

**Draft invoices:** Include — they represent committed future revenue.

**UNDER cases:** May indicate incomplete project, missing invoice, or overstated deal.
Do not auto-correct — flag with gap amount for manual review.

**Closed Lost with active invoices:** Flag prominently. The invoice may need to be voided
or the debt chased depending on whether work was delivered.

**Won – Admin Pending:** These deals have been invoiced but not yet formally closed.
Report them separately so nothing slips through, but do not update their Amounts until
they reach Closed Won.

**Pagination:** Both `list_invoices` and `searchRecords` return max 200 items. Always
check `has_more_page` / `more_records` and fetch subsequent pages if true.
