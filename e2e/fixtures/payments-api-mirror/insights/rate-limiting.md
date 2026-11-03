# Rate limiting

The limiter uses a token bucket keyed by API key. Unauthenticated routes are keyed by client address. Limits are read from configuration at startup.
