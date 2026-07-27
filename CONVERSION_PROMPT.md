# SabbPe Onboarding Platform - Full Stack Conversion Prompt

## Project Overview

I have a **merchant onboarding platform** called **SabbPe** with the following architecture:

### Current State
- **Frontend (React/Vite)**: `src/` directory - Merchant onboarding UI, dashboard, payments
- **Support Module Frontend (React/Vite)**: `support-module/` - Support staff portal
- **Main Backend (Spring Boot)**: `backend-spring/` - Port 8080 - Handles merchant onboarding, payments, settlements, chargebacks, distributors
- **Admin Backend (Spring Boot)**: `backend-spring-admin/` - Port 5000 - Handles support tickets, document review, KYC actions
- **Database**: MariaDB (migrating FROM Supabase/PostgreSQL TO MariaDB)

### What's Done
- Spring Boot backends are ALREADY fully built and functional
- MariaDB schema is defined in `backend-spring/schema-sabbpeonboarding.sql` (22 tables + 2 stored procedures)
- Both backends connect to MariaDB at `34.47.168.236:7306/sabbpeonboarding`

### What Still Needs To Be Done

**Problem**: Some merchants exist in Supabase (PostgreSQL) but NOT in MariaDB. The screenshot shows merchants like "spring demo2", "REDTRONIX INFRA PRIVATE LIMITED", "SACHIN Z FASHIONS", etc. that are in Supabase but missing from MariaDB.

## Required Tasks

### 1. Data Migration Script
Create a Python script (`migrate_supabase_to_mariadb.py`) that:
- Connects to Supabase PostgreSQL and reads ALL data from these tables:
  - `users`, `user_roles`, `app_role`
  - `merchant_profiles`, `merchant_bank_details`, `merchant_documents`, `merchant_kyc`, `merchant_persons`, `merchant_invitations`, `merchant_agreements`, `merchant_sub_products`
  - `product_catalog`, `product_sub_catalog`
  - `distributor_profiles`, `distributor_recovery_history`
  - `employee_profiles`
  - `transactions`, `settlement_history`, `rolling_reserve_ledger`
  - `chargebacks`, `chargeback_history`
  - `notifications`, `application_status_history`, `onboarding_audit_log`
  - `chat_audio_logs`, `refresh_tokens`
  - `document_validations`, `support_kyc_actions`
  - `tickets`, `ticket_messages`
  - `bank_staff`
  - Any other tables that exist in Supabase but not in MariaDB
- Transforms UUIDs and data types to match MariaDB schema
- Inserts into MariaDB with proper foreign key ordering (users first, then user_roles, then merchant_profiles, etc.)
- Handles duplicates gracefully (skip or update based on user_id/email)
- Logs all migrations and errors
- Can be run multiple times (idempotent)

### 2. Fix Frontend Supabase Direct Calls
The support-module (`support-module/src/lib/supabaseClient.ts`) still has a direct Supabase connection. Check if the frontend makes any direct Supabase queries and redirect them to the Spring Boot admin backend API instead.

### 3. Verify All Endpoints Work
Test that these Spring Boot endpoints handle all the data that was previously in Supabase:

**Main Backend (port 8080):**
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - Login
- `GET /api/merchants` - List merchants
- `GET /api/merchants/{id}` - Get merchant
- `PUT /api/merchants/{id}` - Update merchant
- `POST /api/merchants/{id}/documents` - Upload documents
- `POST /api/merchants/{id}/kyc` - KYC submission
- `GET /api/products` - Product catalog
- `POST /api/invite` - Send invitations
- `GET /api/transactions` - Transaction list
- `POST /api/settlements/process` - Settlement processing
- `POST /api/chargebacks` - Create chargeback
- `GET /api/distributors` - Distributor list
- `POST /api/distributors` - Create distributor
- All webhook endpoints for payment callbacks

**Admin Backend (port 5000):**
- `POST /api/auth/login` - Admin login
- `GET /api/tickets` - Support tickets
- `POST /api/tickets` - Create ticket
- `PUT /api/tickets/{id}/messages` - Add message
- `GET /api/support/merchants/{id}` - Merchant details for support
- `PUT /api/support/kyc/{id}/action` - KYC approve/reject
- `GET /api/document-review/pending` - Documents pending review
- `PUT /api/document-review/{id}` - Approve/reject document

## Tech Stack Details

### Backend (Spring Boot 3.4.4 + Java 21)
- Spring Security + JWT (jjwt 0.12.6)
- Spring Data JPA + Hibernate
- MariaDB JDBC Driver
- Lombok + MapStruct
- Flyway (currently disabled, using ddl-auto: update)
- File uploads stored in `./uploads`

### Database (MariaDB)
- Host: `34.47.168.236:7306`
- Database: `sabbpeonboarding`
- User: `sbuser`
- 22 tables with UUID primary keys
- 2 stored procedures: `increment_merchant_balances`, `update_chargeback_balances`

### Roles
- `admin`, `moderator`, `user`, `distributor`, `merchant`, `bank_staff`, `support_staff`, `employee`

### Key Business Logic
1. **Onboarding Flow**: Merchant registers → fills profile → uploads docs → KYC verification → agreement signing → bank details → product selection → activation
2. **Settlement Engine**: Transactions accumulate → settlement scheduler runs → MDR deduction → rolling reserve held → net amount settled
3. **Chargeback Flow**: Chargeback created → recovery from distributor balance → history tracking
4. **Distributor System**: Distributors onboard merchants → commission tracking → recovery balance management
5. **Payment Integration**: Transbank API for payment processing, webhooks for callbacks

## Constraints
- Do NOT change any business logic
- Keep all existing API contracts (URLs, request/response formats)
- Maintain backward compatibility with the frontend
- Use MariaDB as the sole database (no more Supabase)
- Keep UUIDs as primary keys (CHAR(36))
- Preserve all JSON columns for metadata fields
- Keep the stored procedures for balance increment operations

## File Structure Reference
```
onboarding/
├── src/                          # React frontend (merchant portal)
│   ├── api/                      # Frontend API clients
│   ├── components/               # UI components
│   ├── pages/                    # Page components
│   └── lib/                      # Utilities, Supabase client
├── support-module/               # React frontend (support portal)
│   └── src/
│       └── lib/supabaseClient.ts # Direct Supabase connection (needs review)
├── backend-spring/               # Main Spring Boot backend
│   ├── pom.xml
│   ├── schema-sabbpeonboarding.sql
│   └── src/main/java/com/sabbpe/
│       ├── controller/           # 13 REST controllers
│       ├── service/              # 15 service classes
│       ├── repository/           # 25 JPA repositories
│       ├── model/                # JPA entities
│       ├── dto/                  # Request/Response DTOs
│       ├── security/             # JWT, SecurityConfig
│       └── exception/            # Custom exceptions
├── backend-spring-admin/         # Admin Spring Boot backend
│   ├── pom.xml
│   └── src/main/java/com/sabbpe/admin/
│       ├── controller/           # 5 controllers
│       ├── service/              # 3 services
│       ├── repository/           # 11 repositories
│       ├── model/                # JPA entities
│       └── security/             # JWT
└── supabase/migrations/          # Original PostgreSQL migrations (reference only)
```

## Expected Output
1. A working Python migration script that moves ALL data from Supabase to MariaDB
2. Updated support-module frontend that calls Spring Boot APIs instead of Supabase directly
3. Confirmation that all endpoints work correctly
4. Any missing API endpoints added to Spring Boot backends
