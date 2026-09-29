# Project architecture rules

- Product-video imports process the original video locally, clean selected frames server-side, retain only final inventory photos, and always delete temporary frames; this preserves credentials, tenant isolation, and storage hygiene.
