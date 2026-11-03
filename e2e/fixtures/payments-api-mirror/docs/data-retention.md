# Data retention

Payment records are kept for the period the finance team reports against, and not longer. This document describes how long each kind of record is stored, where it is stored, and how it is removed when its period ends.

Charge records hold the amount, the currency, the merchant identifier, the status, and the time of each status change. They are stored in the primary database and copied nightly to the reporting warehouse. A charge record is kept for seven years after the charge was created, because tax authorities in several regions ask for it during audits.

Refund records follow the same schedule as the charge they belong to. A refund never extends the life of a charge record, and a charge record is never removed while one of its refunds is still inside its own retention period.

Webhook delivery logs describe each attempt to notify a merchant: the event type, the destination host, the response code, and the time taken. They are stored for thirty days in the primary database. After thirty days they are summarised into daily counts per merchant and the individual rows are deleted.

Application logs contain request identifiers, route names, status codes, and timings. They never contain card numbers, bank account numbers, or full email addresses. They are stored for ninety days in the log service and then removed by the service's own expiry setting.

Merchant profile data covers the business name, the contact email address, the bank account reference, and the verification state. It is kept while the merchant account is open. After an account is closed, the profile is kept for one year so that late disputes can still be matched to a merchant, and is then anonymised: the name and contact fields are replaced with fixed placeholders while the identifier stays.

Dispute records include the evidence the merchant uploaded, the decision, and the dates of each step. They are kept for five years after the dispute was closed. Uploaded evidence files are stored in object storage with the same expiry date as the dispute record they belong to.

Backups of the primary database are taken every night and kept for thirty-five days. A restore from backup brings back records that were already removed under the schedule above, so a restored database is re-run through the removal job before it is used by any service.

The removal job runs once a day. It selects records whose retention period has ended, deletes them in batches of five thousand rows, and writes a summary line with the table name and the number of rows removed. The job reports a failure to the on-call channel when a batch cannot be deleted, and it picks up the remaining rows on the next day's run.

Reports for the finance team read from the warehouse copy. The warehouse follows the same schedule as the primary database, with one difference: daily aggregates that contain no personal data are kept without an end date, because they are needed for year-over-year comparisons.

Requests from a merchant to delete personal data are handled by the support team. Support records the request, confirms the identity of the requester, and starts the anonymisation step for the profile data. Records that tax rules require to be kept stay in place until their own period ends, and the merchant is told which records remain and why.

Changes to this schedule are agreed with the finance and legal teams, written down with the date of the change, and applied to the removal job configuration in the same release. The previous schedule stays listed below the new one so that the history of the rules is easy to read.

Summary of periods: charge records seven years, refund records follow their charge, webhook delivery logs thirty days, application logs ninety days, merchant profiles one year after closure, dispute records five years, database backups thirty-five days.
