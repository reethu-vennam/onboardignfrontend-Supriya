$mysqlPath = 'C:\Program Files\MySQL\MySQL Workbench 8.0\mysql.exe'
$mysqlArgs = @('-h', '34.47.168.236', '-P', '7306', '-u', 'sbuser', '-pKMmTKeK7yh77odw51gK12f', 'sabbpeonboarding')

$sqlFiles = @(
    'C:\Users\DELL\OneDrive\Documents\onboarding\migration_bank_details.sql',
    'C:\Users\DELL\OneDrive\Documents\onboarding\migration_persons.sql',
    'C:\Users\DELL\OneDrive\Documents\onboarding\migration_documents.sql',
    'C:\Users\DELL\OneDrive\Documents\onboarding\migration_kyc.sql'
)

foreach ($file in $sqlFiles) {
    $fileName = [System.IO.Path]::GetFileName($file)
    Write-Host "`n=== Executing: $fileName ===" -ForegroundColor Cyan
    
    try {
        $content = Get-Content -Path $file -Raw
        $process = Start-Process -FilePath $mysqlPath -ArgumentList $mysqlArgs -RedirectStandardInput $file -NoNewWindow -Wait -PassThru -RedirectStandardOutput "$env:TEMP\mysql_out.txt" -RedirectStandardError "$env:TEMP\mysql_err.txt"
        
        $stdout = Get-Content "$env:TEMP\mysql_out.txt" -ErrorAction SilentlyContinue
        $stderr = Get-Content "$env:TEMP\mysql_err.txt" -ErrorAction SilentlyContinue
        
        if ($stdout) { Write-Host $stdout }
        if ($stderr -and $stderr -notmatch 'Warning') { Write-Host $stderr -ForegroundColor Yellow }
        
        if ($process.ExitCode -eq 0) {
            Write-Host "SUCCESS: $fileName executed successfully" -ForegroundColor Green
        } else {
            Write-Host "ERROR: $fileName failed with exit code $($process.ExitCode)" -ForegroundColor Red
        }
    } catch {
        Write-Host "EXCEPTION: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "`n=== Migration Complete ===" -ForegroundColor Cyan
