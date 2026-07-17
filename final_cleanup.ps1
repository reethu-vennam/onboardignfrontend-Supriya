# Final cleanup - Fix the last 18 errors
# Run from backend directory

Write-Host "Fixing last 18 errors..." -ForegroundColor Green

# Fix 1: merchant.OnboardingStatus -> merchant.onboarding_status (property access, not type)
Write-Host "`n1. Fixing property access..." -ForegroundColor Yellow

$files = @(
    "src/controllers/merchantController.ts",
    "src/routes/admin.ts",
    "src/services/merchantService.ts"
)

foreach ($file in $files) {
    if (Test-Path $file) {
        $content = Get-Content $file -Raw
        # Fix property access (keep the TYPE as OnboardingStatus in casts)
        $content = $content -replace 'merchant\.OnboardingStatus', 'merchant.onboarding_status'
        Set-Content $file -Value $content -NoNewline
        Write-Host "  Fixed: $file" -ForegroundColor Gray
    }
}

# Fix 2: OnboardingStatus: 'draft' -> onboarding_status: 'draft' (object keys)
Write-Host "`n2. Fixing object keys..." -ForegroundColor Yellow

$file = "src/services/merchantService.ts"
if (Test-Path $file) {
    $content = Get-Content $file -Raw
    $content = $content -replace 'OnboardingStatus:', 'onboarding_status:'
    # Fix toStatus -> newStatus (property doesn't exist)
    $content = $content -replace 'toStatus: newStatus,', 'newStatus: newStatus,'
    Set-Content $file -Value $content -NoNewline
    Write-Host "  Fixed: $file" -ForegroundColor Gray
}

# Fix 3: Add import for OnboardingStatus in webhookController
Write-Host "`n3. Fixing webhookController import..." -ForegroundColor Yellow

$file = "src/controllers/webhookController.ts"
if (Test-Path $file) {
    $content = Get-Content $file -Raw
    if ($content -notmatch 'OnboardingStatus') {
        # Add OnboardingStatus to imports
        $content = $content -replace '(import \{[^}]*)(MerchantProfile)', '$1MerchantProfile, OnboardingStatus'
        Set-Content $file -Value $content -NoNewline
        Write-Host "  Added OnboardingStatus import" -ForegroundColor Gray
    }
}

# Fix 4: Fix products.ts - add return statements
Write-Host "`n4. Fixing products.ts returns..." -ForegroundColor Yellow

$file = "src/routes/products.ts"
if (Test-Path $file) {
    $content = Get-Content $file
    $updated = $false
    
    for ($i = 0; $i -lt $content.Length; $i++) {
        # Find res.json() lines that need explicit return
        if ($content[$i] -match '^\s+res\.json\(' -and $content[$i+1] -match '^\s+\}\s*catch') {
            $content[$i] = $content[$i] + "`n        return;"
            $updated = $true
        }
    }
    
    if ($updated) {
        $content | Set-Content $file
        Write-Host "  Added return statements" -ForegroundColor Gray
    }
}

# Fix 5: Fix supabase.ts bankProfile casting
Write-Host "`n5. Fixing supabase.ts..." -ForegroundColor Yellow

$file = "src/routes/supabase.ts"
if (Test-Path $file) {
    $content = Get-Content $file -Raw
    # Find the line with bankProfile and cast it
    $content = $content -replace '(\s+)bankProfile,', '$1bankProfile as any,'
    Set-Content $file -Value $content -NoNewline
    Write-Host "  Added type cast to bankProfile" -ForegroundColor Gray
}

Write-Host "`n✅ All fixes complete!" -ForegroundColor Green
Write-Host "Run: npm run build" -ForegroundColor Cyan
