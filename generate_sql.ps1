function Escape-Sql {
    param([object]$Value)
    
    if ($null -eq $Value) {
        return "NULL"
    }
    
    if ($Value -is [bool]) {
        if ($Value) { return "1" } else { return "0" }
    }
    
    if ($Value -is [int] -or $Value -is [long] -or $Value -is [double] -or $Value -is [decimal]) {
        return $Value.ToString()
    }
    
    if ($Value -is [string]) {
        if ($Value -match '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}') {
            $dt = $Value -replace 'T', ' ' -replace '\.\d+', '' -replace '\+\d{2}:\d{2}$', '' -replace 'Z$', ''
            return "'$dt'"
        }
        $escaped = $Value -replace "'", "''" -replace "`r`n", "\n" -replace "`r", "\n" -replace "`n", "\n"
        return "'$escaped'"
    }
    
    if ($Value -is [System.Collections.IList] -or $Value -is [System.Collections.Hashtable]) {
        $json = $Value | ConvertTo-Json -Compress -Depth 5
        $escaped = $json -replace "'", "''"
        return "'$escaped"
    }
    
    if ($Value.GetType().Name -match 'Object') {
        $json = $Value | ConvertTo-Json -Compress -Depth 5
        $escaped = $json -replace "'", "''"
        return "'$escaped'"
    }
    
    $str = $Value.ToString()
    $escaped = $str -replace "'", "''"
    return "'$escaped'"
}

function Generate-SqlFile {
    param(
        [string]$JsonPath,
        [string]$OutputPath,
        [string]$TableName,
        [string[]]$MariaDbColumns,
        [string[]]$ExtraNullColumns = @()
    )
    
    $records = Get-Content -Path $JsonPath -Raw | ConvertFrom-Json
    
    $columnList = $MariaDbColumns -join ", "
    
    $updateParts = @()
    foreach ($col in $MariaDbColumns) {
        if ($col -ne "id") {
            $updateParts += "$col = VALUES($col)"
        }
    }
    $updateList = $updateParts -join ", "
    
    $sb = [System.Text.StringBuilder]::new()
    [void]$sb.AppendLine("SET FOREIGN_KEY_CHECKS=0;")
    [void]$sb.AppendLine("")
    
    $batchSize = 50
    $totalBatches = [Math]::Ceiling($records.Count / $batchSize)
    
    for ($b = 0; $b -lt $totalBatches; $b++) {
        $startIdx = $b * $batchSize
        $endIdx = [Math]::Min($startIdx + $batchSize - 1, $records.Count - 1)
        
        [void]$sb.AppendLine("INSERT INTO $TableName ($columnList)")
        [void]$sb.AppendLine("VALUES")
        
        for ($i = $startIdx; $i -le $endIdx; $i++) {
            $rec = $records[$i]
            $values = @()
            
            foreach ($col in $MariaDbColumns) {
                if ($col -in $ExtraNullColumns) {
                    $values += "NULL"
                } else {
                    $val = $rec.$col
                    $values += (Escape-Sql $val)
                }
            }
            
            $line = "    ($($values -join ', '))"
            if ($i -lt $endIdx) {
                $line += ","
            } else {
                $line += " ON DUPLICATE KEY UPDATE $updateList;"
            }
            [void]$sb.AppendLine($line)
        }
        
        [void]$sb.AppendLine("")
    }
    
    [void]$sb.AppendLine("SET FOREIGN_KEY_CHECKS=1;")
    
    Set-Content -Path $OutputPath -Value $sb.ToString() -Encoding UTF8
    Write-Host "Generated: $OutputPath ($($records.Count) records)"
}

$bankColumns = @("id", "merchant_id", "account_number", "ifsc_code", "bank_name", "account_holder_name", "upi_vpa", "upi_qr_string", "created_at", "updated_at")
Generate-SqlFile -JsonPath "C:\Users\DELL\OneDrive\Documents\onboarding\migration_merchant_bank_details.json" `
    -OutputPath "C:\Users\DELL\OneDrive\Documents\onboarding\migration_bank_details.sql" `
    -TableName "merchant_bank_details" `
    -MariaDbColumns $bankColumns `
    -ExtraNullColumns @("upi_vpa", "upi_qr_string")

$personColumns = @("id", "merchant_id", "role", "full_name", "pan_number", "address_proof_type", "is_authorized_signatory", "sequence_order", "created_at")
Generate-SqlFile -JsonPath "C:\Users\DELL\OneDrive\Documents\onboarding\migration_merchant_persons.json" `
    -OutputPath "C:\Users\DELL\OneDrive\Documents\onboarding\migration_persons.sql" `
    -TableName "merchant_persons" `
    -MariaDbColumns $personColumns

$docColumns = @("id", "merchant_id", "document_type", "file_name", "file_path", "file_size", "mime_type", "status", "rejection_reason", "uploaded_at", "verified_at", "verified_by", "doc_category", "person_id")
Generate-SqlFile -JsonPath "C:\Users\DELL\OneDrive\Documents\onboarding\migration_merchant_documents.json" `
    -OutputPath "C:\Users\DELL\OneDrive\Documents\onboarding\migration_documents.sql" `
    -TableName "merchant_documents" `
    -MariaDbColumns $docColumns

$kycColumns = @("id", "merchant_id", "video_kyc_completed", "location_captured", "latitude", "longitude", "video_kyc_file_path", "selfie_file_path", "kyc_status", "completed_at", "verified_at", "verified_by", "rejection_reason", "full_address", "area", "city", "state", "pincode", "country", "created_at", "updated_at")
Generate-SqlFile -JsonPath "C:\Users\DELL\OneDrive\Documents\onboarding\migration_merchant_kyc.json" `
    -OutputPath "C:\Users\DELL\OneDrive\Documents\onboarding\migration_kyc.sql" `
    -TableName "merchant_kyc" `
    -MariaDbColumns $kycColumns
