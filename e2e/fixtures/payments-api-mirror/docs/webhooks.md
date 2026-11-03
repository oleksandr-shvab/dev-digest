# Webhooks

The API posts an event to the merchant's webhook URL when a charge succeeds, fails, or is refunded. Each delivery carries a signature header and is retried with a growing delay.
