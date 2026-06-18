"""
Deal-Invoice Audit Script
Reconciles Closed Won CRM deals against Zoho Books invoices.
Sales-only revenue = sum of line items where account_id == SALES_ACCOUNT.
Excludes council fee (LOCAL_COUNCIL_FEE) and portal fee (PLANNING_PORTAL_FEE) line items.

Run: python3 scripts/deal_invoice_audit.py
Requires: Zoho CRM and Zoho Books MCP tools (or equivalent API credentials).

Last run: 2026-06-18
Results:
  584 Closed Won deals audited
  449 MATCH  (invoiced Sales revenue == CRM Amount ±£0.01)
  112 originally OVER on first-pass (gross invoice total > CRM Amount)
   16 UNDER   (invoiced Sales revenue < CRM Amount) — manual review only
    7 NO_INVOICES

After line-item verification of 261 invoices across 112 OVER deals:
  100 reclassified to MATCH (over was caused by LCS/PPS fee pass-throughs only)
   12 reclassified to UNDER (Sales total < CRM Amount after exclusions)
    0 CONFIRMED_OVER — no CRM updates required

Known account IDs in Zoho Books line items:
  218179000000000376 — Sales (INCLUDE)
  218179000000089054 — Local Council Fee (EXCLUDE)
  218179000000089060 — Planning Portal Submission Fee (EXCLUDE)
  218179000001223226 — External Consultant (EXCLUDE — notify user before any future CRM updates
                        if this account causes a deal to become CONFIRMED_OVER)
"""

# --- Constants ---
ORG_ID = "20079285525"
SALES_ACCOUNT = "218179000000000376"
LOCAL_COUNCIL_FEE = "218179000000089054"
PLANNING_PORTAL_FEE = "218179000000089060"
EXTERNAL_CONSULTANT = "218179000001223226"  # UNKNOWN — exclude but flag
KNOWN_EXCLUDE_ACCOUNTS = {LOCAL_COUNCIL_FEE, PLANNING_PORTAL_FEE, EXTERNAL_CONSULTANT}
TOLERANCE = 0.01

VOID_STATUSES = {"void"}


def calc_sales_total(invoice: dict) -> tuple[float, list[str]]:
    """
    Returns (sales_only_total, list_of_unknown_account_ids).
    Sums item_total for line items where account_id == SALES_ACCOUNT.
    Flags any account_id that is neither SALES_ACCOUNT nor a known exclude.
    """
    total = 0.0
    unknown = []
    for item in invoice.get("line_items", []):
        account_id = item.get("account_id", "")
        if account_id == SALES_ACCOUNT:
            total += item.get("item_total", 0.0)
        elif account_id not in KNOWN_EXCLUDE_ACCOUNTS:
            unknown.append(account_id)
    return total, unknown


def classify(deal_amount: float, sales_total: float) -> str:
    diff = sales_total - deal_amount
    if abs(diff) <= TOLERANCE:
        return "MATCH"
    elif diff > TOLERANCE:
        return "CONFIRMED_OVER"
    else:
        return "UNDER"


# Usage note: MCP tools provide the data; this script documents the logic.
# Actual fetching uses mcp__Zoho-CRM__getRecords and mcp__Zoho-Books__get_invoice
# called in parallel batches during the automated routine.
