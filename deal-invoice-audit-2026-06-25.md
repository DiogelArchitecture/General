# Deal-Invoice Audit Report
Date: 2026-06-25

## Summary

| Category | Count |
|---|---|
| Total Closed Won deals audited | 589 |
| MATCH — Amount = Sales invoices (±£0.01) | 552 |
| UNDER — Amount > Sales invoiced to date | 30 |
| NO_INVOICES — no linked invoices found | 7 |
| OVER confirmed — Amount updated (Sales-only) | 0 |

**No CRM updates were required.** All 112 deals where invoice totals exceeded deal Amount were verified: the excess is entirely explained by pass-through charges (Local Council Fees, Planning Portal Submission Fees) billed on separate line items not coded to the Sales account. The deal Amount fields are correctly set to Sales-only revenue.

## UNDER Deals (30) — Amount exceeds Sales invoices to date

These deals have a CRM Amount higher than the sum of Sales-coded invoice lines. This may indicate invoices not yet raised, partial invoicing, or discounting applied.

| Project | Deal Name | Amount | Sales Invoiced | Gap |
|---|---|---|---|---|
| 1766 | 1766 - 191 Westmorland Avenue, LU3 2PU | £1,650.00 | £800.00 | £-850.00 |
|  | 1048 - 2 Morley Road, LL30 1TD | £1,950.00 | £1,350.00 | £-600.00 |
|  | 1021 - Pen Yr Allt, LL30 3BD | £693.00 | £100.00 | £-593.00 |
|  | 1023 - 21 Penlon, LL59 5LR | £1,758.00 | £1,208.00 | £-550.00 |
| 1479 | 1479 - 7 Rock Terrace, LL55 4LA | £1,200.00 | £799.99 | £-400.01 |
| 1364 | 1364 - 4 Bramley Rise, BS21 6SS | £1,300.00 | £900.00 | £-400.00 |
| 1403 | 1403 - 4 Dapple Heath Avenue, L31 1GA | £1,700.00 | £1,300.00 | £-400.00 |
| 1437 | 1437 - 23 - 25 Bedford SQ, LU5 5ES | £800.00 | £400.00 | £-400.00 |
| 1456 | 1456 - 42 Grange Park Road, BL7 9YA | £1,600.00 | £1,200.00 | £-400.00 |
| 1413 | 1413 - 21 Grosvenor Road, TF9 1HA | £1,200.00 | £800.00 | £-400.00 |
| 1397 | 1397 - 36 Westfield Street, WA10 1QF | £800.00 | £400.00 | £-400.00 |
| 1048 | 1048 - 2 Morley Road, LL30 1TD | £2,625.00 | £2,400.00 | £-225.00 |
|  | 1234 - 12 Hampstead Road, L6 8NG | £1,525.00 | £1,300.00 | £-225.00 |
|  | 1670 - 37 Cardinal Crescent, B61 7PR | £1,340.00 | £1,116.67 | £-223.33 |
| 1764 | 1764 - 68 Ravenna Road, L19 4TZ | £1,500.00 | £1,350.00 | £-150.00 |
|  | 1150 - Pen Y Bryn, LL77 7PJ | £300.00 | £150.00 | £-150.00 |
|  | 1300 - Lodge Heyes, CH3 8NN | £3,000.00 | £2,858.33 | £-141.67 |
|  | 1227 - Tryfan, LL55 1UN | £1,290.00 | £1,150.00 | £-140.00 |
|  | 1056 - Byways, LL18 5PU | £1,500.00 | £1,398.75 | £-101.25 |
|  | 1293 - 18 Toft Close, CH4 8PX | £1,050.00 | £950.00 | £-100.00 |
|  | 1197 - 18 Bryncelyn Road, LL54 6AB | £950.00 | £855.00 | £-95.00 |
|  | 1199 - 49 Eardswick Road, CW10 0DT | £900.00 | £810.00 | £-90.00 |
| 1169 | 1169 - 19 Brearley Close, CH43 7XW | £600.00 | £540.00 | £-60.00 |
|  | 1263 - 18 Dunnderdale Hill, M24 5AN | £700.00 | £650.00 | £-50.00 |
| 1751 | 1751 - 18 Sutton Drive, CH2 2HW | £1,350.00 | £1,305.00 | £-45.00 |
|  | 1127 - 32 Weaverton Drive, LL18 4LB | £1,300.00 | £1,270.00 | £-30.00 |
| 1308 | 1308 - 99 Park Road, M32 8ED | £225.00 | £220.00 | £-5.00 |
| 1476 | 1476 - 115 Oxford Road, B27 6DR | £1,200.00 | £1,196.77 | £-3.23 |
| 1461 | 1461 - 34 Virginia Drive, CH1 5AL | £1,500.00 | £1,499.00 | £-1.00 |
| 1242 | 1242 - 5 Holdness Road, M18 8DN | £750.00 | £749.00 | £-1.00 |

## NO_INVOICES Deals (7)

No invoices found in Zoho Books linked to these deals.

| Project | Deal Name | Amount |
|---|---|---|
|  | 1024 - Lon Spencer, LL65 3ET | £1,283.00 |
| 1402 | 1402 - 39-41 Sudell Road, BB3 3HW | £250.00 |
| 1626 | 1626 - White House, LL68 0SW | £1,400.00 |
| 1472 | 1472 - 400 Platt Lane, M14 7HJ | £1,350.00 |
|  | 1033 - 4 Dunbar Road, PR8 4RH | £1,150.00 |
| 1146 | 1146 - Former ATS, CH7 1HS | £0.00 |
| 1279 | 1279 - The Mayfair Centre, TS25 1DE | £0.00 |

## Pass-Through Charge Analysis

112 deals initially appeared OVER (invoice total > deal Amount). After fetching line items and filtering to Sales account only (account_id: 218179000000000376), all 112 resolved:

- 100 → MATCH (Sales-only invoice total = deal Amount)
- 12 → UNDER (Sales-only invoice total < deal Amount)
- 0 → confirmed OVER

Non-sales accounts present in invoices:
- Local Council Fee (218179000000089054)
- Planning Portal Submission Fee (218179000000089060)