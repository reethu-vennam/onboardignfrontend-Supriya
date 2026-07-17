# fix_property_names.ps1
# Replace userId with user_id and merchantId with merchant_id throughout backend

$files = @(
    "src/controllers/merchantController.ts",
    "src/index.ts",
    "src/middleware/errorHandler.ts",
    "src/routes/admin.ts"
)

foreach ($file in $files) {
    if (Test-Path $file) {
        Write-Host "Fixing $file..."
        
        $content = Get-Content $file -Raw
        
        # Replace req.user?.userId with req.user?.user_id
        $content = $content -replace 'req\.user\?\.userId', 'req.user?.user_id'
        
        # Replace req.user.userId with req.user.user_id
        $content = $content -replace 'req\.user\.userId', 'req.user.user_id'
        
        # Replace req.user?.merchantId with req.user?.merchant_id
        $content = $content -replace 'req\.user\?\.merchantId', 'req.user?.merchant_id'
        
        # Replace req.user.merchantId with req.user.merchant_id
        $content = $content -replace 'req\.user\.merchantId', 'req.user.merchant_id'
        
        Set-Content $file -Value $content -NoNewline
        Write-Host "Fixed $file" -ForegroundColor Green
    } else {
        Write-Host "File not found: $file" -ForegroundColor Yellow
    }
}

Write-Host "`nDone! Run 'npm run build' to verify." -ForegroundColor Cyan
