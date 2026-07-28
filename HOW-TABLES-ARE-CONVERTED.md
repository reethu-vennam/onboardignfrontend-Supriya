# How Supabase Tables Are Converted into Spring Boot

This document explains the complete journey of how a Supabase (PostgreSQL) database table gets converted into a fully working Spring Boot backend layer. Understanding this pattern will help you add new tables or modify existing ones.

---

## Overview: The 4-Layer Stack

Every table goes through **4 layers** in Spring Boot:

```
Supabase SQL Table
        │
        ▼
[1] Flyway Migration SQL ──►  MariaDB table (stripped of Supabase-specific features)
        │
        ▼
[2] JPA Entity Class     ──►  Java object mapped to the table (@Entity + @Column)
        │
        ▼
[3] Repository Interface ──►  Spring Data JPA data access (JpaRepository)
        │
        ▼
[4] DTO Class            ──►  JSON request/response shape for REST API
```

---

## Complete Example: `transactions` Table End-to-End

### Step 0 — The Supabase Original

Here's what the `transactions` table looked like originally in Supabase (PostgreSQL):

```sql
-- Supabase uses PostgreSQL with custom features:
--   • auth.users() references
--   • gen_random_uuid()
--   • TIMESTAMP WITH TIME ZONE + now()
--   • JSON column type
--   • RLS (Row Level Security) policies

CREATE TABLE public.transactions (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  merchant_id     UUID NOT NULL REFERENCES public.merchant_profiles(id),
  amount          NUMERIC(12,2) NOT NULL,
  status          TEXT NOT NULL,
  metadata        JSONB,
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

### Step 1 — Flyway Migration (MariaDB SQL)

Supabase-specific features are removed/replaced:

| Supabase (PostgreSQL)       | MariaDB Equivalent                     |
|-----------------------------|----------------------------------------|
| `UUID` / `gen_random_uuid()` | `CHAR(36)` / `UUID()`                  |
| `NUMERIC(12,2)`             | `DECIMAL(12,2)`                        |
| `JSONB`                     | `JSON`                                 |
| `TIMESTAMPTZ`               | `TIMESTAMP`                            |
| `TEXT`                      | `VARCHAR(255)` / `TEXT`                |
| `REFERENCES auth.users(id)` | `REFERENCES users(id)`                 |
| `now()`                     | `CURRENT_TIMESTAMP`                    |
| RLS Policies                | REMOVED (handled in Spring Security)   |
| Custom ENUM types           | `VARCHAR` with app-level validation    |

**Result — `V3__create_products_and_transactions.sql`:**

```sql
CREATE TABLE IF NOT EXISTS transactions (
    id                CHAR(36)      PRIMARY KEY DEFAULT (UUID()),
    merchant_id       CHAR(36)      NOT NULL,
    transaction_id    VARCHAR(255)  NOT NULL UNIQUE,
    amount            DECIMAL(12,2) NOT NULL,
    currency          VARCHAR(10)   NOT NULL DEFAULT 'INR',
    status            VARCHAR(30)   NOT NULL,
    payment_method    VARCHAR(50)   DEFAULT NULL,
    customer_name     VARCHAR(255)  DEFAULT NULL,
    customer_email    VARCHAR(255)  DEFAULT NULL,
    customer_mobile   VARCHAR(20)   DEFAULT NULL,
    metadata          JSON          DEFAULT NULL,
    settlement_status VARCHAR(20)   NOT NULL DEFAULT 'unsettled',
    settlement_batch_id CHAR(36)    DEFAULT NULL,
    settled_at        TIMESTAMP     DEFAULT NULL,
    created_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_txn_merchant FOREIGN KEY (merchant_id) REFERENCES merchant_profiles(id) ON DELETE CASCADE,
    INDEX idx_txn_merchant (merchant_id),
    INDEX idx_txn_status (status),
    INDEX idx_txn_created (created_at DESC),
    INDEX idx_txn_id (transaction_id),
    INDEX idx_txn_settlement_status (settlement_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### Step 2 — JPA Entity Class

Each SQL column becomes a Java field with `@Column`. Naming converts from `snake_case` → `camelCase`.

**`TransactionEntity.java`:**

```java
@Entity
@Table(name = "transactions")
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor
public class TransactionEntity {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @Column(name = "merchant_id", nullable = false, length = 36)
    private String merchantId;                          // FK as plain String, NOT @ManyToOne

    @Column(name = "transaction_id", nullable = false, unique = true, length = 255)
    private String transactionId;

    @Column(name = "amount", nullable = false, precision = 12, scale = 2)
    private BigDecimal amount;

    @Column(name = "currency", nullable = false, length = 10)
    private String currency = "INR";

    @Column(name = "status", nullable = false, length = 30)
    private String status;

    @Column(name = "settlement_status", nullable = false, length = 20)
    private String settlementStatus = "unsettled";

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        if (id == null) id = UUID.randomUUID().toString();
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
```

#### Key Rules for Entities:

| Rule | Explanation |
|------|-------------|
| `@Entity` + `@Table(name = "table_name")` | Every entity MUST have both annotations |
| `@Id` on `String id` | All PKs are `CHAR(36)` UUIDs, never auto-generated by Hibernate |
| `@PrePersist` generates UUID | `UUID.randomUUID().toString()` — hands off from DB auto-generation |
| `@Column(name = "snake_case")` | Explicitly maps every field. NEVER rely on Hibernate naming strategies |
| `updatable = false` on `created_at` | Prevents Hibernate from writing to `created_at` on updates |
| `@PrePersist` / `@PreUpdate` | Manages `createdAt`/`updatedAt` in Java instead of DB triggers |
| FK = plain String field | Foreign keys are stored as `String merchantId`, NOT `@ManyToOne MerchantEntity`. Only `UserEntity` ↔ `UserRoleEntity` uses `@ManyToOne`/`@OneToMany` |

### Step 3 — Repository Interface

One interface per entity. Extends `JpaRepository<Entity, String>`.

**`TransactionRepository.java`:**

```java
@Repository
public interface TransactionRepository extends JpaRepository<TransactionEntity, String> {

    Optional<TransactionEntity> findByTransactionId(String transactionId);

    List<TransactionEntity> findByMerchantIdOrderByCreatedAtDesc(String merchantId);

    List<TransactionEntity> findByMerchantIdIn(List<String> merchantIds);

    boolean existsByTransactionId(String transactionId);
}
```

#### Key Rules for Repositories:

| Rule | Explanation |
|------|-------------|
| `extends JpaRepository<Entity, String>` | `String` because all PKs are `CHAR(36)` UUID strings |
| `@Repository` annotation | Always add it |
| Query methods use `camelCase` field names | Spring Data derives SQL from method names (e.g., `findByTransactionId` → `WHERE transaction_id = ?`) |
| Custom queries use `@Query` | When needed for complex joins or native SQL |

### Step 4 — DTO (Data Transfer Object)

DTOs shape the JSON that goes in/out of REST controllers. They are NOT directly mapped to database columns — they represent the API contract.

**`TransactionResponse.java`:**

```java
@Data @Builder
@NoArgsConstructor @AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class TransactionResponse {

    private String id;

    @JsonProperty("txn_id")
    private String txnId;                    // Different name from entity field!

    @JsonProperty("merchant_id")
    private String merchantId;

    @JsonProperty("merchant_name")
    private String merchantName;             // NOT a DB column — populated from JOIN

    private BigDecimal amount;

    private String status;

    @JsonProperty("created_at")
    private LocalDateTime createdAt;
}
```

#### Key Rules for DTOs:

| Rule | Explanation |
|------|-------------|
| `@JsonProperty("snake_case")` | JSON keys are `snake_case`, Java fields are `camelCase` |
| DTO ≠ Entity 1:1 | DTOs often combine fields from multiple tables or exclude sensitive data |
| Use `@JsonInclude(NON_NULL)` | Omits null fields from JSON response |
| Mapper/Service converts Entity → DTO | Conversion happens in the Service layer, not in the entity |

---

## The Complete Table-to-Layer Mapping

Here is every table in the database and its corresponding 3 Spring Boot layers:

```
TABLE (SQL)                   ENTITY                          REPOSITORY                          DTO
────────────────────────────  ──────────────────────────────  ──────────────────────────────────  ───────────────────────────
users                         UserEntity                      UserRepository                      UserDto, RegisterRequest, AuthResponse
user_roles                    UserRoleEntity                  UserRoleRepository                  (part of AuthResponse)
refresh_tokens                RefreshTokenEntity              RefreshTokenRepository              (internal only)
merchant_profiles             MerchantProfileEntity           MerchantProfileRepository           MerchantProfileResponse
merchant_bank_details         MerchantBankDetailEntity        MerchantBankDetailRepository        BankDetailDto (nested in profile)
merchant_documents            MerchantDocumentEntity          MerchantDocumentRepository          DocumentDto (nested in profile)
merchant_kyc                  MerchantKycEntity               MerchantKycRepository               KycDto (nested in profile)
merchant_persons              MerchantPersonEntity            MerchantPersonRepository            PersonDto (nested in profile)
merchant_invitations          MerchantInvitationEntity        MerchantInvitationRepository        BulkInviteRequest/Response
merchant_agreements           MerchantAgreementEntity         MerchantAgreementRepository         AgreementResponse
merchant_sub_products         MerchantSubProductEntity        MerchantSubProductRepository        UpdateProductsRequest
product_catalog               ProductCatalogEntity            ProductCatalogRepository            ProductResponse
product_sub_catalog           ProductSubCatalogEntity         ProductSubCatalogRepository         SubProductResponse
transactions                  TransactionEntity               TransactionRepository               TransactionResponse
notifications                 (no entity)                     (no repository)                    (no DTO — not yet built)
application_status_history    (uses OnboardingAuditLogEntity) (uses OnboardingAuditLogRepository) (no separate DTO)
onboarding_audit_log          OnboardingAuditLogEntity        OnboardingAuditLogRepository        (internal only)
distributor_profiles          DistributorProfileEntity        DistributorProfileRepository        DistributorProfileResponse
employee_profiles             EmployeeProfileEntity           EmployeeProfileRepository           EmployeeResponse
chat_audio_logs               ChatAudioLogEntity              ChatAudioLogRepository              ChatResponse
settlement_history            SettlementHistoryEntity         SettlementHistoryRepository         SettlementHistoryResponse
rolling_reserve_ledger        RollingReserveLedgerEntity      RollingReserveLedgerRepository      ReserveLedgerResponse
chargebacks                   ChargebackEntity                ChargebackRepository                ChargebackResponse
chargeback_history            ChargebackHistoryEntity         ChargebackHistoryRepository         ChargebackHistoryResponse
distributor_recovery_history  DistributorRecoveryHistoryEntity DistributorRecoveryHistoryRepository DistributorRecoverySummaryResponse
```

**Admin module tables (same DB, separate app):**

```
tickets                       TicketEntity                    TicketRepository                    (admin DTOs)
ticket_messages               TicketMessageEntity             TicketMessageRepository             (admin DTOs)
document_validations          DocumentValidationEntity        DocumentValidationRepository        (admin DTOs)
merchant_credit_checks        MerchantCreditCheckEntity       MerchantCreditCheckRepository       (admin DTOs)
support_kyc_actions           SupportKycActionEntity          SupportKycActionRepository          (admin DTOs)
```

---

## Supabase → MariaDB: What Gets Removed

These Supabase-specific features are stripped out during migration:

| Supabase Feature | What Happens to It | Where It Goes in Spring Boot |
|---|---|---|
| **Row Level Security (RLS)** | Removed entirely | Spring Security (`@PreAuthorize`, `SecurityConfig`, JWT filters) |
| **`auth.users` table** | Replaced by our own `users` table | `UserEntity` + `UserRepository` + JWT auth in `security/` |
| **`auth.uid()` function** | Removed | Extracted from JWT token in `TokenProvider` |
| **Custom ENUM types** | Converted to `VARCHAR` columns | Validated in service layer or `@Column(length=N)` |
| **Storage buckets + policies** | Removed (files go to disk/S3) | `FileStorageService` in `service/` package |
| **PostgreSQL triggers** (`updated_at`) | Removed | `@PreUpdate` in entity class |
| **`gen_random_uuid()`** | Replaced by `UUID()` (MariaDB) | `UUID.randomUUID().toString()` in `@PrePersist` |
| **`TIMESTAMPTZ`** | Converted to `TIMESTAMP` | `LocalDateTime` in entity |

---

## Data Type Conversion Cheat Sheet

| PostgreSQL/Supabase | MariaDB | Java Entity Field |
|---------------------|---------|-------------------|
| `UUID` | `CHAR(36)` | `String` |
| `TEXT` | `TEXT` / `VARCHAR(N)` | `String` |
| `VARCHAR(N)` | `VARCHAR(N)` | `String` |
| `NUMERIC(p,s)` | `DECIMAL(p,s)` | `BigDecimal` |
| `INTEGER` / `INT` | `INT` | `Integer` / `int` |
| `SMALLINT` | `SMALLINT` | `Short` |
| `BOOLEAN` | `BOOLEAN` | `Boolean` |
| `TIMESTAMPTZ` / `TIMESTAMP` | `TIMESTAMP` | `LocalDateTime` |
| `JSONB` | `JSON` | `String` (with `columnDefinition = "JSON"`) |
| `BIGINT` | `BIGINT` | `Long` |

---

## Checklist: Adding a New Table from Scratch

Follow these steps in order:

1. **Write Flyway migration** in `backend-spring/src/main/resources/db/migration/V6__your_table.sql`
   - Use `CHAR(36) DEFAULT (UUID())` for PK
   - Add `created_at` + `updated_at` TIMESTAMP columns
   - Add `INDEX` on FK columns and frequently-queried columns
   - `ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`

2. **Create Entity class** in `backend-spring/src/main/java/com/sabbpe/model/`
   - `@Entity` + `@Table(name = "your_table")`
   - `@Id String id` with `@PrePersist UUID.randomUUID()`
   - One `@Column` per SQL column, matching `name = "snake_case"`
   - `@PrePersist` / `@PreUpdate` for timestamps
   - Use Lombok `@Getter @Setter @NoArgsConstructor @AllArgsConstructor`

3. **Create Repository** in `backend-spring/src/main/java/com/sabbpe/repository/`
   - `@Repository` + `extends JpaRepository<YourEntity, String>`

4. **Create DTO(s)** in `backend-spring/src/main/java/com/sabbpe/dto/`
   - Request DTO for incoming data (might have validation annotations)
   - Response DTO for outgoing data (use `@JsonProperty` for `snake_case` keys)

5. **Create/Update Service** in `backend-spring/src/main/java/com/sabbpe/service/`
   - Inject the repository
   - Write CRUD methods
   - Map Entity ↔ DTO

6. **Create/Update Controller** in `backend-spring/src/main/java/com/sabbpe/controller/`
   - `@RestController` + `@RequestMapping("/api/...")`
   - Inject the service
   - Map HTTP verbs to service methods

---

## Relationship Handling

### Most relationships: String FK fields (no JPA join)

In this project, **almost all** relationships are handled via plain `String` foreign key fields — NOT `@ManyToOne` or `@OneToMany`. The application layer handles joins manually through repository queries.

```java
// merchant_profiles has a FK to users(user_id) — stored as just a string:
@Column(name = "user_id", nullable = false, unique = true, length = 36)
private String userId;

// transactions has FK to merchant_profiles(merchant_id) — also just a string:
@Column(name = "merchant_id", nullable = false, length = 36)
private String merchantId;
```

### The ONE exception: UserEntity ↔ UserRoleEntity

Only the `users` ↔ `user_roles` relationship uses actual JPA entity references:

```java
// In UserEntity:
@OneToMany(mappedBy = "user", fetch = FetchType.EAGER)
private Set<UserRoleEntity> roles;

// In UserRoleEntity:
@ManyToOne(fetch = FetchType.LAZY)
@JoinColumn(name = "user_id", nullable = false)
private UserEntity user;
```

This is the ONLY place JPA-managed relationships exist in the entire main backend module.

---

## File Locations Summary

```
backend-spring/src/main/
├── resources/db/migration/        ← Flyway SQL (V1_, V2_, V3_, V4_, V5_)
└── java/com/sabbpe/
    ├── model/                     ← @Entity classes (23 files)
    ├── repository/                ← JpaRepository interfaces (23 files)
    ├── dto/                       ← JSON request/response objects (59 files)
    ├── service/                   ← Business logic
    ├── controller/                ← REST endpoints (29 files)
    ├── security/                  ← JWT auth (replaces Supabase auth/RPC/RLS)
    ├── audit/BaseEntity.java      ← @MappedSuperclass (optional reuse for timestamps)
    ├── mapper/                    ← Utility mappers (Entity ↔ DTO conversion)
    └── config/                    ← CORS, AppConfig, TestDataInitializer
```

---

## Entity Template (Copy-Paste Starting Point)

```java
package com.sabbpe.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "your_table_name")
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor
public class YourEntity {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    // --- Foreign key columns (as plain strings) ---
    @Column(name = "merchant_id", nullable = false, length = 36)
    private String merchantId;

    // --- Data columns ---
    @Column(name = "your_column", nullable = false)
    private String yourColumn;

    // --- Timestamps ---
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        if (id == null) id = UUID.randomUUID().toString();
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
```

## Repository Template

```java
package com.sabbpe.repository;

import com.sabbpe.model.YourEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface YourEntityRepository extends JpaRepository<YourEntity, String> {

    List<YourEntity> findByMerchantId(String merchantId);

    Optional<YourEntity> findByYourColumn(String value);
}
```
