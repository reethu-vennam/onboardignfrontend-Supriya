$mysqlPath = 'C:\Program Files\MySQL\MySQL Workbench 8.0\mysql.exe'
$mysqlArgs = @('-h', '34.47.168.236', '-P', '7306', '-u', 'sbuser', '-pKMmTKeK7yh77odw51gK12f', 'sabbpeonboarding')
$BASE = "C:\Users\DELL\OneDrive\Documents\onboarding"
$BT = [char]96

function Get-Count {
    param($table)
    $r = & $mysqlPath $mysqlArgs "-e" "SELECT COUNT(*) FROM $table;" 2>&1 | Out-String
    # Parse: ignore warnings, look for digit line
    if ($r -match '(\d+)\r?\n') { return [int]$Matches[1] }
    # Fallback: try last number
    $lines = $r -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ -match '^\d+$' }
    if ($lines) { return [int]$lines[0] }
    return -1
}

function Escape-Sql {
    param($val)
    if ($null -eq $val -or $val -eq [DBNull]::Value) { return "NULL" }
    $s = "$val"
    if ($s -eq '' -or $s -eq $null) { return "NULL" }
    # Remove newlines and carriage returns
    $s = $s -replace "`r", '' -replace "`n", ''
    return "'" + $s.Replace("\", "\\").Replace("'", "''") + "'"
}

function Convert-Date {
    param($val)
    if ($null -eq $val -or "$val" -eq '' -or "$val" -eq 'null') { return "NULL" }
    $s = "$val"
    # Remove fractional seconds
    $s = $s -replace '\.\d+', ''
    # ISO 8601 to SQL format
    $s = $s -replace 'T', ' '
    $s = $s -replace '\+00:00', ''
    $s = $s -replace 'Z', ''
    $s = $s.Trim()
    # Match datetime with time
    if ($s -match '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}') {
        return "'" + $Matches[0] + "'"
    }
    # Match date only (e.g. reserve_date, release_date, settlement_date)
    if ($s -match '^\d{4}-\d{2}-\d{2}') {
        return "'" + $Matches[0] + "'"
    }
    return "NULL"
}

function Convert-Bool {
    param($val)
    if ($null -eq $val -or "$val" -eq '') { return "NULL" }
    if ($val -eq $true -or $val -eq 1 -or $val -eq 'true' -or $val -eq '1') { return "1" }
    return "0"
}

function Convert-Number {
    param($val)
    if ($null -eq $val -or "$val" -eq '' -or "$val" -eq 'null') { return "NULL" }
    $s = "$val"
    if ($s -match '^-?\d+\.?\d*$') { return $s }
    return "NULL"
}

function Get-Value {
    param($rec, $key)
    try { $v = $rec.$key } catch { return $null }
    if ($null -eq $v) {
        if ($rec.PSObject.Properties.Name -contains $key) { return $rec.$key }
        return $null
    }
    # Must use comma to prevent empty array from dissolving in pipeline
    return ,$v
}

function Serialize-Json {
    param($val)
    if ($null -eq $val) { return "NULL" }
    # Empty array -> return '[]' directly
    if ($val -is [array] -and $val.Count -eq 0) { return "'[]'" }
    $s = $val | ConvertTo-Json -Compress -Depth 10
    if ($s -eq '' -or $s -eq 'null') { return "NULL" }
    return "'" + $s.Replace("\", "\\").Replace("'", "''") + "'"
}

# Set of columns that store JSON arrays/objects
$jsonColumns = @('features','selected_products','metadata','current_data','previous_data','recovery_steps','recovery_details','transaction_refs','registration_details','split_payment_config','txn_details')

function Get-ValueTyped {
    param($rec, $col, $sk, $default)
    # If a default is specified, use it
    if ($default -and $default -ne '') { return $default }

    $raw = Get-Value $rec $sk

    # For JSON columns, handle empty arrays/objects properly
    if ($col -in $jsonColumns) {
        # Even empty arrays/objects should serialize (e.g. [] -> '[]', {} -> '{}')
        return (Serialize-Json $raw)
    }

    # For all others, null/empty = NULL
    if ($null -eq $raw) { return "NULL" }
    $rawStr = "$raw"
    if ($rawStr -eq '') { return "NULL" }

    if ($col -match '(_at|_date|timestamp)$' -or $col -eq 'chargeback_date' -or $col -eq 'reserve_date' -or $col -eq 'release_date' -or $col -eq 'settlement_date' -or $col -eq 'processed_at' -or $col -eq 'debited_at' -or $col -eq 'released_at') {
        return (Convert-Date $raw)
    }
    if ($col -eq 'is_active' -or $col -eq 'signed' -or $col -eq 'is_read' -or $col -match '^is_' -or $col -match '_verified$' -or $col -match '_enabled$' -or $col -match '_locked$') {
        return (Convert-Bool $raw)
    }
    if ($col -match '(price|cost|amount|rate|fee|percentage)$' -or $col -eq 'display_order' -or $col -eq 'settlement_cycle_days' -or $col -eq 'transaction_count') {
        return (Convert-Number $raw)
    }
    return (Escape-Sql $raw)
}

function Qi { param($n); return "$BT$n$BT" }

# ===== TABLE DEFINITIONS =====
# Each table: name, JSON file, MariaDB columns, map (supabase->mariadb),
# skip (supabase-only columns to ignore), defaults (mariadb columns with default values)
$tables = @(
    @{ name = "users"; json = "migration_users.json"
       columns = @("id","email","password_hash","full_name","is_active","created_at")
       map = @{ "password_hash"="password"; "full_name"="name" }
       defaults = @{ "mobile_number"="NULL"; "updated_at"="NULL" } }
    @{ name = "distributor_profiles"; json = "migration_distributor_profiles.json"
       columns = @("id","user_id","company_name","contact_person","mobile_number","email","territory","is_active","created_at","updated_at","address","city","state","pincode","bank_account_holder","bank_name","bank_account_number","bank_ifsc","pan_number","aadhaar_last4","pan_document_path","aadhaar_document_path","profile_photo_path","default_commission_rate","payout_cycle","pan_verified","aadhaar_verified","bank_verified")
       map = @{}; defaults = @{ "mobile_number"="''"; "email"="''" } }
    @{ name = "employee_profiles"; json = "migration_employee_profiles.json"
       columns = @("id","user_id","full_name","mobile_number","email","is_active","created_at","updated_at")
       map = @{}; defaults = @{} }
    @{ name = "merchant_invitations"; json = "migration_merchant_invitations.json"
       columns = @("id","distributor_id","merchant_name","merchant_mobile","invitation_token","status","sent_via","sent_at","accepted_at","expires_at","metadata","created_at")
       map = @{}; defaults = @{} }
    @{ name = "merchant_agreements"; json = "migration_merchant_agreements.json"
       columns = @("id","merchant_id","agreement_type","agreement_version","selected_products","total_monthly_cost","total_onetime_cost","total_integration_cost","agreement_text","signed","signed_at","signature_name","ip_address","user_agent","created_at","updated_at")
       map = @{}; defaults = @{ "agreement_version"="NULL" } }
    @{ name = "merchant_sub_products"; json = "migration_merchant_sub_products.json"
       columns = @("id","merchant_profile_id","parent_product_code","sub_product_code","created_at")
       map = @{ "created_at"="selected_at" }; defaults = @{} }
    @{ name = "product_catalog"; json = "migration_product_catalog.json"
       columns = @("id","product_code","product_name","product_description","features","price","price_type","price_monthly_min","price_monthly_max","price_onetime_min","price_onetime_max","price_integration_fee","price_amc","price_mid","price_sim_cost_min","price_sim_cost_max","display_price","display_price_type","pricing_note","product_image_url","category","is_active","display_order","created_at","updated_at")
       map = @{}; defaults = @{ "category"="'software'" } }
    @{ name = "product_sub_catalog"; json = "migration_product_sub_catalog.json"
       columns = @("id","parent_product_code","product_code","product_name","product_description","price","is_active","display_order","created_at")
       map = @{ "product_code"="sub_product_code"; "product_name"="sub_product_name"; "product_description"="sub_product_description"; "price"="price_amount" }
       defaults = @{} }
    @{ name = "notifications"; json = "migration_notifications.json"
       columns = @("id","user_id","title","message","type","is_read","read_at","action_label","action_url","created_at")
       map = @{ "is_read"="read" }; defaults = @{} }
    @{ name = "user_roles"; json = "migration_user_roles.json"
       columns = @("id","user_id","role_id","created_at")
       map = @{ "role_id"="role" }; defaults = @{} }
    @{ name = "application_status_history"; json = "migration_application_status_history.json"
       columns = @("id","merchant_id","previous_status","new_status","reason","changed_by","created_at")
       map = @{}; defaults = @{} }
    @{ name = "chargeback_history"; json = "migration_chargeback_history.json"
       columns = @("id","chargeback_id","merchant_id","action","event_type","previous_data","current_data","recovered_amount","recovery_source","recovery_details","event_timestamp","performed_by","comments","created_at")
       map = @{ "event_timestamp"="timestamp" }; defaults = @{} }
    @{ name = "chargebacks"; json = "migration_chargebacks.json"
       columns = @("id","merchant_id","amount","currency","reason","status","chargeback_date","recovered_at","recovery_source","recovery_steps","metadata","created_at","updated_at")
       map = @{}; defaults = @{} }
    @{ name = "distributor_recovery_history"; json = "migration_distributor_recovery_history.json"
       columns = @("id","distributor_id","chargeback_id","merchant_id","amount","created_at")
       map = @{}; defaults = @{} }
    @{ name = "rolling_reserve_ledger"; json = "migration_rolling_reserve_ledger.json"
       columns = @("id","merchant_id","distributor_id","transaction_ref","gross_settlement_amount","reserve_amount","reserve_date","release_date","status","debit_reason","settlement_cycle_days","released_at","debited_at","created_at","updated_at")
       map = @{}; defaults = @{} }
    @{ name = "settlement_history"; json = "migration_settlement_history.json"
       columns = @("id","merchant_id","distributor_id","settlement_batch_ref","settlement_date","settlement_cycle_days","gross_amount","mdr_deduction","rolling_reserve_held","net_settlement_amount","transaction_count","transaction_refs","status","processed_at","failure_reason","created_at","updated_at")
       map = @{}; defaults = @{ "settlement_cycle_days"="1" } }
    @{ name = "transactions"; json = "migration_transactions.json"
       columns = @("id","merchant_id","transaction_id","amount","currency","status","payment_method","customer_name","customer_email","customer_mobile","metadata","settlement_status","settlement_batch_id","settled_at","created_at","updated_at")
       map = @{ "transaction_id"="txn_id" }; defaults = @{} }
)

# ===== PROCESS EACH TABLE =====
$results = @()

foreach ($tbl in $tables) {
    $name = $tbl.name
    $jsonFile = "$BASE\$($tbl.json)"
    $sqlFile = "$BASE\migration_$name.sql"
    $colList = $tbl.columns
    $colMap = $tbl.map
    $defaults = $tbl.defaults

    Write-Host "`n=== $name ===" -ForegroundColor Cyan
    $before = Get-Count $name
    Write-Host "Before: $before" -ForegroundColor Yellow

    if (-not (Test-Path $jsonFile)) {
        Write-Host "  SKIP: JSON not found" -ForegroundColor Red
        $results += [PSCustomObject]@{Table=$name;Before=$before;After=$before;Status="SKIP"}
        continue
    }
    try {
        $data = Get-Content $jsonFile -Raw | ConvertFrom-Json
    } catch {
        Write-Host "  ERROR parsing JSON: $_" -ForegroundColor Red
        $results += [PSCustomObject]@{Table=$name;Before=$before;After=$before;Status="PARSE ERROR"}
        continue
    }

    if ($data -isnot [array]) { $data = @($data) }

    # Build source keys for each MariaDB column
    $sourceKeys = foreach ($col in $colList) {
        if ($colMap.ContainsKey($col)) { $colMap[$col] } else { $col }
    }

    $sqlLines = [System.Collections.ArrayList]@()
    $sqlLines.Add("SET FOREIGN_KEY_CHECKS=0;") > $null
    $sqlLines.Add("") > $null

    $quotedCols = $colList | ForEach-Object { Qi $_ }
    $colStr = $quotedCols -join ', '
    $inserted = 0

    foreach ($rec in $data) {
        $vals = @()
        for ($i = 0; $i -lt $colList.Count; $i++) {
            $col = $colList[$i]
            $sk = $sourceKeys[$i]
            $def = if ($defaults.ContainsKey($col)) { $defaults[$col] } else { $null }
            $vals += (Get-ValueTyped $rec $col $sk $def)
        }

        $valStr = $vals -join ', '
        $updateParts = foreach ($c in $colList) {
            if ($c -ne 'id') { "$(Qi $c)=VALUES($(Qi $c))" }
        }
        $updateStr = $updateParts -join ', '

        $qTable = Qi $name
        $sqlLines.Add("INSERT INTO $qTable ($colStr) VALUES ($valStr) ON DUPLICATE KEY UPDATE $updateStr;") > $null
        $inserted++
    }

    $sqlLines.Add("") > $null
    $sqlLines.Add("SET FOREIGN_KEY_CHECKS=1;") > $null

    $sqlContent = $sqlLines -join "`r`n"
    [System.IO.File]::WriteAllText($sqlFile, $sqlContent, [System.Text.Encoding]::UTF8)
    Write-Host "  Generated: $sqlFile ($inserted records)" -ForegroundColor Green

    Write-Host "  Executing..." -ForegroundColor Gray
    $execResult = Get-Content $sqlFile | & $mysqlPath $mysqlArgs 2>&1 | Out-String
    $ec = $LASTEXITCODE
    if ($ec -ne 0) {
        # Extract actual error message (skip the PowerShell warning wrapper)
        $errMsg = $execResult
        if ($errMsg -match 'ERROR \d+.*') {
            $errMsg = $Matches[0]
        }
        Write-Host "  ERROR (exit=$ec): $errMsg" -ForegroundColor Red
        $after = $before; $status = "ERROR"
    } else {
        $after = Get-Count $name
        $diff = $after - $before
        Write-Host "  After: $after (diff: $diff)" -ForegroundColor Green
        $status = "OK"
    }
    $results += [PSCustomObject]@{Table=$name;Before=$before;After=$after;Status=$status}
}

Write-Host "`n`n========================================" -ForegroundColor Cyan
Write-Host "           MIGRATION SUMMARY" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
$results | Format-Table -Property Table, Before, After, Status -AutoSize
