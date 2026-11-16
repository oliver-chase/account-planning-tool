# Local secrets directory

Keep private runtime files here only for this checkout.

Rules:
- do not commit real credentials
- keep tracked examples and docs generic
- prefer `.env.local` for shared local runtime values
- keep delegated tokens, host-only secret bundles, and private runtime artifacts in this directory
