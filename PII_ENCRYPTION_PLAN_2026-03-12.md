# PII Encryption Plan

## Goal
- Encrypt customer and staff personal data at rest without breaking existing screens.
- Keep backward compatibility with already stored plaintext rows.
- Avoid touching search-critical columns until searchable helper keys are designed.

## Phase 1 Applied Scope
- `users`: `email`, `phone`
- `customers`: `email`, `phone`, `notes`
- `contacts`: `name`, `email`, `phone`
- `deals`: `phone`, `email`, `billing_account_number`, `notes`
- `payments`: `notes`
- `contracts`: `user_identifier`, `notes`
- `refunds`: `user_identifier`, `account`
- `keeps`: `user_identifier`
- `deposits`: `depositor_name`, `notes`
- `quotations`: `customer_name`, `customer_company`, `customer_phone`, `customer_email`, `project_name`, `notes`, `created_by_email`, `created_by_phone`
- `system_logs`: `login_id`, `user_name`, `ip_address`, `user_agent`, `details`
- `customer_counselings`: `content`
- `customer_change_histories`: `before_data`, `after_data`
- `customer_files`: `file_name`, `original_file_name`, `file_data`, `note`

## Phase 1 Explicit Exclusions
- `users.login_id`
- `users.name`
- `customers.name`
- `contracts.customer_name`
- `contracts.manager_name`
- `contracts.products`
- other columns used directly in current server-side search, grouping, or relationship logic

These stay plaintext for now because they would need separate searchable hashes or query redesign.

## Runtime Rules
- New env var: `PII_ENCRYPTION_KEY`
- Production boot fails if `PII_ENCRYPTION_KEY` is missing.
- Existing plaintext rows still read normally.
- Newly written rows are stored encrypted.

## Migration
- Dry run: `npm run db:pii:encrypt:dry`
- Apply: `npm run db:pii:encrypt:apply`

The migration script only encrypts plaintext string cells that are not already encrypted.

## Remaining Phase 2 Work
- Searchable hash/index design for name-based search fields
- File storage separation from DB for uploaded files
- Backup coverage review for `customer_counselings`, `customer_change_histories`, `customer_files`
- Admin SQL route policy for encrypted-column writes
