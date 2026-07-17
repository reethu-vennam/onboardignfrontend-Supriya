cat > /mnt/user-data/outputs/final_5_errors.ps1 << 'EOF'
# Fix the last 5 errors
Write-Host "Fixing last 5 errors..." -ForegroundColor Green

# Fix 1: getMerchantByuser_id -> getMerchantByUserId
Write-Host "1. Fixing method names..." -ForegroundColor Yellow
$file = "src/controllers/merchantController.ts"
if (Test-Path $file) {
    $content = Get-Content $file -Raw
    $content = $content -replace 'getMerchantByuser_id', 'getMerchantByUserId'
    Set-Content $file -Value $content -NoNewline
    Write-Host "  Fixed merchantController.ts" -ForegroundColor Gray
}

# Fix 2: Add return to products.ts sign-agreement
Write-Host "2. Fixing products.ts..." -ForegroundColor Yellow
$file = "src/routes/products.ts"
if (Test-Path $file) {
    $lines = Get-Content $file
    $newLines = @()
    
    for ($i = 0; $i -lt $lines.Length; $i++) {
        $newLines += $lines[$i]
        
        # Find the res.json closing for sign-agreement and add return after
        if ($lines[$i] -match 'signed_at:.*agreement\.signed_at') {
            $newLines += $lines[++$i]  # closing });
            $newLines += "        return;"
            continue
        }
    }
    
    $newLines | Set-Content $file
    Write-Host "  Added return to products.ts" -ForegroundColor Gray
}

# Fix 3: Add export to webhookController.ts
Write-Host "3. Fixing webhookController exports..." -ForegroundColor Yellow
$file = "src/controllers/webhookController.ts"
if (Test-Path $file) {
    $content = Get-Content $file -Raw
    
    # Check if export default exists
    if ($content -notmatch 'export default') {
        # Add export at the end if the controller is defined as a class
        if ($content -match 'class WebhookController') {
            $content = $content -replace '(export const webhookController = new WebhookController\(\);)', "$1`nexport default webhookController;"
        } else {
            # If it's just functions, wrap them in an object and export
            $content += "`n`nexport default webhookController;"
        }
        Set-Content $file -Value $content -NoNewline
        Write-Host "  Added export to webhookController.ts" -ForegroundColor Gray
    } else {
        Write-Host "  Export already exists" -ForegroundColor Gray
    }
}

Write-Host "`n✅ All 5 errors fixed!" -ForegroundColor Green
Write-Host "Run: npm run build" -ForegroundColor Cyan
EOF
cat /mnt/user-data/outputs/final_5_errors.ps1
Output

# Fix the last 5 errors
Write-Host "Fixing last 5 errors..." -ForegroundColor Green

# Fix 1: getMerchantByuser_id -> getMerchantByUserId
Write-Host "1. Fixing method names..." -ForegroundColor Yellow
$file = "src/controllers/merchantController.ts"
if (Test-Path $file) {
    $content = Get-Content $file -Raw
    $content = $content -replace 'getMerchantByuser_id', 'getMerchantByUserId'
    Set-Content $file -Value $content -NoNewline
    Write-Host "  Fixed merchantController.ts" -ForegroundColor Gray
}

# Fix 2: Add return to products.ts sign-agreement
Write-Host "2. Fixing products.ts..." -ForegroundColor Yellow
$file = "src/routes/products.ts"
if (Test-Path $file) {
    $lines = Get-Content $file
    $newLines = @()
    
    for ($i = 0; $i -lt $lines.Length; $i++) {
        $newLines += $lines[$i]
        
        # Find the res.json closing for sign-agreement and add return after
        if ($lines[$i] -match 'signed_at:.*agreement\.signed_at') {
            $newLines += $lines[++$i]  # closing });
            $newLines += "        return;"
            continue
        }
    }
    
    $newLines | Set-Content $file
    Write-Host "  Added return to products.ts" -ForegroundColor Gray
}

# Fix 3: Add export to webhookController.ts
Write-Host "3. Fixing webhookController exports..." -ForegroundColor Yellow
$file = "src/controllers/webhookController.ts"
if (Test-Path $file) {
    $content = Get-Content $file -Raw
    
    # Check if export default exists
    if ($content -notmatch 'export default') {
        # Add export at the end if the controller is defined as a class
        if ($content -match 'class WebhookController') {
            $content = $content -replace '(export const webhookController = new WebhookController\(\);)', "$1`nexport default webhookController;"
        } else {
            # If it's just functions, wrap them in an object and export
            $content += "`n`nexport default webhookController;"
        }
        Set-Content $file -Value $content -NoNewline
        Write-Host "  Added export to webhookController.ts" -ForegroundColor Gray
    } else {
        Write-Host "  Export already exists" -ForegroundColor Gray
    }
}

Write-Host "`n✅ All 5 errors fixed!" -ForegroundColor Green
Write-Host "Run: npm run build" -ForegroundColor Cyan