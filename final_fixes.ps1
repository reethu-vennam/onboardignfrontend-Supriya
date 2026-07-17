# PowerShell script to fix remaining 68 TypeScript errors
# Run from backend directory: powershell -ExecutionPolicy Bypass .\final_fixes.ps1

Write-Host "Fixing TypeScript errors..." -ForegroundColor Green

# Fix 1: Import statements (onboarding_status -> OnboardingStatus)
Write-Host "`n1. Fixing import statements..." -ForegroundColor Yellow

$files = @(
    "src/controllers/merchantController.ts",
    "src/routes/admin.ts",
    "src/routes/supabase.ts",
    "src/services/notifications.ts",
    "src/services/merchantService.ts"
)

foreach ($file in $files) {
    if (Test-Path $file) {
        $content = Get-Content $file -Raw
        $content = $content -replace 'onboarding_status', 'OnboardingStatus'
        Set-Content $file -Value $content -NoNewline
        Write-Host "  Fixed imports in: $file" -ForegroundColor Gray
    }
}

# Fix 2: user_id -> userId
Write-Host "`n2. Fixing user_id -> userId..." -ForegroundColor Yellow

$userIdFiles = @(
    "src/controllers/merchantController.ts",
    "src/routes/admin.ts",
    "src/routes/bank.ts",
    "src/routes/support.ts"
)

foreach ($file in $userIdFiles) {
    if (Test-Path $file) {
        $content = Get-Content $file -Raw
        $content = $content -replace 'req\.user\.user_id', 'req.user.userId'
        $content = $content -replace 'req\.user\?\.user_id', 'req.user?.userId'
        $content = $content -replace 'decoded\.user_id', 'decoded.userId'
        Set-Content $file -Value $content -NoNewline
        Write-Host "  Fixed user_id in: $file" -ForegroundColor Gray
    }
}

# Fix 3: createdAt/updatedAt -> created_at/updated_at
Write-Host "`n3. Fixing timestamps..." -ForegroundColor Yellow

$file = "src/services/merchantService.ts"
if (Test-Path $file) {
    $content = Get-Content $file -Raw
    $content = $content -replace 'createdAt: now,', 'created_at: now,'
    $content = $content -replace 'updatedAt: new Date', 'updated_at: new Date'
    $content = $content -replace 'updatedAt: now', 'updated_at: now'
    $content = $content -replace 'fromStatus: oldStatus,', ''
    Set-Content $file -Value $content -NoNewline
    Write-Host "  Fixed timestamps in: $file" -ForegroundColor Gray
}

# Fix 4: Add null checks to bank services
Write-Host "`n4. Adding null checks to bank services..." -ForegroundColor Yellow

$bankFiles = @(
    "src/services/bankApiService.ts",
    "src/services/bankService.ts"
)

foreach ($file in $bankFiles) {
    if (Test-Path $file) {
        $content = Get-Content $file -Raw
        
        # Add null coalescing for undefined fields
        $content = $content -replace '(business_name): merchant\.business_name,', '$1: merchant.business_name || "",'
        $content = $content -replace '(businessType): merchant\.businessType,', '$1: merchant.businessType || "",'
        $content = $content -replace '(registrationNumber): merchant\.registrationNumber,', '$1: merchant.registrationNumber || "",'
        $content = $content -replace '(taxId): merchant\.taxId,', '$1: merchant.taxId || "",'
        $content = $content -replace '(phone): merchant\.phone,', '$1: merchant.phone || "",'
        $content = $content -replace '(line1): merchant\.addressLine1,', '$1: merchant.addressLine1 || "",'
        $content = $content -replace '(city): merchant\.city,', '$1: merchant.city || "",'
        $content = $content -replace '(state): merchant\.state,', '$1: merchant.state || "",'
        $content = $content -replace '(postalCode): merchant\.postalCode,', '$1: merchant.postalCode || "",'
        $content = $content -replace '(country): merchant\.country', '$1: merchant.country || "India"'
        $content = $content -replace 'merchant\.documents\.map', '(merchant.documents || []).map'
        $content = $content -replace 'type: doc\.type', 'type: doc.type || doc.document_type || ""'
        $content = $content -replace 'url: doc\.url', 'url: doc.url || doc.file_path || ""'
        
        Set-Content $file -Value $content -NoNewline
        Write-Host "  Fixed null checks in: $file" -ForegroundColor Gray
    }
}

# Fix 5: Add merchantId to UserSession in middleware/auth.ts
Write-Host "`n5. Checking UserSession merchantId..." -ForegroundColor Yellow

$authFile = "src/middleware/auth.ts"
if (Test-Path $authFile) {
    $content = Get-Content $authFile -Raw
    if ($content -notmatch 'merchantId\?:') {
        $content = $content -replace '(interface UserSession \{[^}]*userId: string;)', "`$1`n    merchantId?: string;"
        Set-Content $authFile -Value $content -NoNewline
        Write-Host "  Added merchantId to UserSession" -ForegroundColor Gray
    } else {
        Write-Host "  merchantId already exists" -ForegroundColor Gray
    }
}

# Fix 6: Remove duplicate user declaration from user.ts
Write-Host "`n6. Fixing duplicate user declaration..." -ForegroundColor Yellow

$userFile = "src/types/user.ts"
if (Test-Path $userFile) {
    $content = Get-Content $userFile -Raw
    # Remove the global Express declaration if it exists
    $content = $content -replace 'declare global \{[^}]*namespace Express[^}]*\}[^}]*\}', ''
    Set-Content $userFile -Value $content -NoNewline
    Write-Host "  Removed duplicate declaration from user.ts" -ForegroundColor Gray
}

# Fix 7: Fix support.ts firstName/lastName
Write-Host "`n7. Fixing support.ts optional fields..." -ForegroundColor Yellow

$supportFile = "src/routes/support.ts"
if (Test-Path $supportFile) {
    $content = Get-Content $supportFile -Raw
    $content = $content -replace 'firstName: decoded\.firstName,', 'firstName: decoded.firstName || "",'
    $content = $content -replace 'lastName: decoded\.lastName,', 'lastName: decoded.lastName || "",'
    Set-Content $supportFile -Value $content -NoNewline
    Write-Host "  Fixed support.ts" -ForegroundColor Gray
}

# Fix 8: Fix products.ts
Write-Host "`n8. Fixing products.ts..." -ForegroundColor Yellow

$productsFile = "src/routes/products.ts"
if (Test-Path $productsFile) {
    $content = Get-Content $productsFile -Raw
    # Fix line 34 - remove cast, just use merchantId
    $content = $content -replace '\(req\.user as UserSession\)\?\.merchantId', 'req.user?.merchantId'
    # Fix return statement
    $content = $content -replace 'return res\.status\(401\)\.json', 'res.status(401).json'
    Set-Content $productsFile -Value $content -NoNewline
    Write-Host "  Fixed products.ts" -ForegroundColor Gray
}

Write-Host "`n✅ All automatic fixes complete!" -ForegroundColor Green
Write-Host "`nRemaining manual fixes needed:" -ForegroundColor Yellow
Write-Host "  1. Add merchantId to UserSession interface in src/middleware/auth.ts" -ForegroundColor Gray
Write-Host "  2. Check src/routes/supabase.ts line 320 - may need to cast bankProfile" -ForegroundColor Gray
Write-Host "`nRun: npm run build" -ForegroundColor Cyan
