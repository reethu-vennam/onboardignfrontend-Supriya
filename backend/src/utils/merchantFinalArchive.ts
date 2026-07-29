import type { SupabaseClient } from "@supabase/supabase-js";
import { buildOpenDocumentsHtml } from "./openDocumentsHtml";
import { createPlainZipBuffer, createZipBuffer } from "./zip";

type AnyRecord = Record<string, any>;

const detectFileExt = (buffer: Buffer): string => {
  const b0 = buffer[0], b1 = buffer[1], b2 = buffer[2], b3 = buffer[3];
  if (b0 === 0x25 && b1 === 0x50 && b2 === 0x44 && b3 === 0x46) return '.pdf';
  if (b0 === 0xff && b1 === 0xd8 && b2 === 0xff) return '.jpg';
  if (b0 === 0x89 && b1 === 0x50 && b2 === 0x4e && b3 === 0x47) return '.png';
  if (b0 === 0x52 && b1 === 0x49 && b2 === 0x46 && b3 === 0x46) return '.webp';
  if (b0 === 0x47 && b1 === 0x49 && b2 === 0x46 && b3 === 0x38) return '.gif';
  if (b0 === 0x1a && b1 === 0x45 && b2 === 0xdf && b3 === 0xa3) return '.webm';
  if (buffer.slice(4, 8).toString() === 'ftyp') return '.mp4';
  return '';
};

const downloadStorageFile = async (
  supabase: SupabaseClient,
  bucket: string,
  path: string
): Promise<{ buffer: Buffer | null; reason?: string }> => {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error) {
    console.error(`❌ Storage download failed [${bucket}/${path}]:`, error.message);
    return { buffer: null, reason: error.message };
  }
  if (!data) {
    console.error(`❌ Storage download returned no data [${bucket}/${path}]`);
    return { buffer: null, reason: "No data returned from storage" };
  }
  const arrayBuffer = await (data as any).arrayBuffer();
  if (!arrayBuffer?.byteLength) {
    console.error(`❌ Storage download empty file [${bucket}/${path}]`);
    return { buffer: null, reason: "Downloaded file is empty" };
  }
  return { buffer: Buffer.from(arrayBuffer) };
};

const formatAddress = (addr: any): string => {
  if (!addr) return 'N/A';
  if (typeof addr === 'string') return addr;
  const parts = [addr.addressLine1, addr.addressLine2, addr.landmark, addr.city, addr.state, addr.pincode].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : 'N/A';
};

export const buildMerchantFinalApprovalZip = async (
  supabase: SupabaseClient,
  profile: AnyRecord,
  password?: string
): Promise<Buffer> => {
  const merchantId = profile.id;
  const [docsRes, bankRes, kycRes] = await Promise.all([
    supabase.from("merchant_documents").select("*").eq("merchant_id", merchantId),
    supabase.from("merchant_bank_details").select("*").eq("merchant_id", merchantId),
    supabase.from("merchant_kyc").select("*").eq("merchant_id", merchantId),
  ]);

  const documents = docsRes.data || [];
  const bank = (bankRes.data && bankRes.data.length > 0) ? bankRes.data[0] : {};
  const kyc = (kycRes.data && kycRes.data.length > 0) ? kycRes.data[0] : {};
  const regDetails = profile.registration_details || {};
  const entries: Array<{ filename: string; content: Buffer }> = [];

  console.log(`🏦 Bank query: ${bankRes.error ? 'ERROR: ' + bankRes.error.message : bankRes.data?.length + ' row(s)'}`);
  console.log(`🏦 KYC query: ${kycRes.error ? 'ERROR: ' + kycRes.error.message : kycRes.data?.length + ' row(s)'}`);

  // Add merchant details text file
  const detailsText = [
    `Merchant Onboarding Details`,
    `========================`,
    ``,
    `Application ID: ${profile.application_id || 'N/A'}`,
    `Business Name: ${profile.business_name || 'N/A'}`,
    `Full Name: ${profile.full_name || 'N/A'}`,
    `Email: ${profile.email || 'N/A'}`,
    `Mobile: ${profile.mobile_number || 'N/A'}`,
    ``,
    `PAN Number: ${profile.pan_number || 'N/A'}`,
    `Aadhaar Number: ${profile.aadhaar_number || 'N/A'}`,
    `GST Number: ${profile.gst_number || 'N/A'}`,
    `Business Website: ${regDetails.businessWebsite || 'N/A'}`,
    `Business Industry: ${regDetails.businessIndustry || 'N/A'}`,
    ``,
    `Full Address: ${kyc.full_address || 'N/A'}`,
    `Area: ${kyc.area || 'N/A'}`,
    `City: ${kyc.city || 'N/A'}`,
    `State: ${kyc.state || 'N/A'}`,
    `Pincode: ${kyc.pincode || 'N/A'}`,
    `Country: ${kyc.country || 'N/A'}`,
    ``,
    `Registered Address: ${formatAddress(regDetails.registeredAddress)}`,
    `Operating Address: ${formatAddress(regDetails.operatingAddress)}`,
    ``,
    `Bank Name: ${bank.bank_name || 'N/A'}`,
    `Account Number: ${bank.account_number || 'N/A'}`,
    `IFSC Code: ${bank.ifsc_code || 'N/A'}`,
    `Account Holder: ${bank.account_holder_name || 'N/A'}`,
    ``,
    `KYC Status: ${kyc.kyc_status || 'N/A'}`,
    `Video KYC: ${kyc.video_kyc_completed ? 'Yes' : 'No'}`,
    `Location Captured: ${kyc.location_captured ? 'Yes' : 'No'}`,
    `Latitude: ${kyc.latitude || 'N/A'}`,
    `Longitude: ${kyc.longitude || 'N/A'}`,
    ``,
    `Onboarding Status: ${profile.onboarding_status || 'N/A'}`,
    `Submitted At: ${profile.submitted_at || profile.created_at || 'N/A'}`,
    `Updated At: ${profile.updated_at || 'N/A'}`,
  ].join('\n');

  entries.push({ filename: 'merchant-details.txt', content: Buffer.from(detailsText, 'utf-8') });
  console.log(`📄 Merchant details text file added`);

  for (const doc of documents) {
    const baseName = doc.file_name?.replace(/\.[^.]+$/, '') || doc.file_path?.split("/").pop()?.replace(/\.[^.]+$/, '') || doc.document_type;

    if (!doc.file_path) {
      console.warn(`⚠️ Skipping ${baseName}: no file_path`);
      continue;
    }

    const { buffer, reason } = await downloadStorageFile(supabase, "merchant-documents", doc.file_path);
    if (!buffer) {
      console.warn(`⚠️ Failed to download ${baseName}: ${reason}`);
      continue;
    }

    const ext = detectFileExt(buffer);
    const originalName = baseName + (ext || '.bin');
    console.log(`📎 Downloaded: ${originalName} (${buffer.length} bytes)`);
    entries.push({ filename: originalName, content: buffer });
  }

  console.log(`📦 Approval ZIP built for merchant ${merchantId}: ${entries.length} document(s) included`);

  // Add CPV video if present
  if (profile.cpv_video_path) {
    console.log(`🎬 Downloading CPV video: ${profile.cpv_video_path}`);
    const { buffer: videoBuffer, reason } = await downloadStorageFile(supabase, "merchant-documents", profile.cpv_video_path);
    if (videoBuffer) {
      const ext = detectFileExt(videoBuffer);
      const videoName = ext ? `cpv-video${ext}` : 'cpv-video.webm';
      entries.push({ filename: videoName, content: videoBuffer });
      console.log(`📎 CPV video added: ${videoName} (${videoBuffer.length} bytes)`);
    } else {
      console.warn(`⚠️ Failed to download CPV video: ${reason}`);
    }
  }

  if (!password) {
    throw new Error('ZIP password is required');
  }

  // Inner: password-protected documents (code = password)
  const encryptedDocumentsZip = await createZipBuffer(entries, password);

  // Outer: OPEN_DOCUMENTS.html + encrypted inner zip (no password on outer)
  const howToText = [
    'SabbPe Merchant Documents',
    '=======================',
    '',
    'QUICK START',
    '-----------',
    '1. Extract this ZIP folder (right-click → Extract All).',
    '2. Open OPEN_DOCUMENTS.html in your browser.',
    '3. Enter your ZIP code from the email (e.g. SABBPE-A7X9K2MN).',
    '4. Click "Unlock Documents" to see and open all files.',
    '',
    'ALTERNATIVE (Windows / Mac)',
    '---------------------------',
    '1. Open documents.zip inside this folder.',
    '2. Enter your ZIP code when prompted for a password.',
    '3. View files directly in File Explorer / Finder.',
    '',
    'Your code was sent in the same email. It is not stored anywhere else.',
  ].join('\n');

  return await createPlainZipBuffer([
    { filename: 'OPEN_DOCUMENTS.html', content: Buffer.from(buildOpenDocumentsHtml(), 'utf-8') },
    { filename: 'HOW_TO_OPEN.txt', content: Buffer.from(howToText, 'utf-8') },
    { filename: 'documents.zip', content: encryptedDocumentsZip },
  ]);
};
