import React, { useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Trash2,
  Eye,
  Loader2,
  File,
  Image as ImageIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { StatusChip, StatusType } from './StatusChip';

export interface UploadCardProps {
  title: string;
  subtitle?: string;
  required?: boolean;
  status?: StatusType | 'empty';
  file?: File | { name: string; size?: number; url?: string; type?: string } | null;
  previewUrl?: string;
  uploadProgress?: number;
  isUploading?: boolean;
  rejectionReason?: string;
  acceptedFormats?: string;
  maxSizeMB?: number;
  onUpload: (file: File) => void;
  onRemove?: () => void;
  onPreview?: () => void;
  className?: string;
  disabled?: boolean;
  helperText?: string;
}

export const UploadCard: React.FC<UploadCardProps> = ({
  title,
  subtitle,
  required = false,
  status = 'empty',
  file,
  previewUrl,
  uploadProgress = 0,
  isUploading = false,
  rejectionReason,
  acceptedFormats = 'image/jpeg,image/png,application/pdf',
  maxSizeMB = 5,
  onUpload,
  onRemove,
  onPreview,
  className,
  disabled = false,
  helperText,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      onUpload(selected);
    }
    // reset value so the same file can be re-selected if needed
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (disabled || isUploading) return;
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) {
      onUpload(dropped);
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isPDF =
    file?.name?.toLowerCase().endsWith('.pdf') ||
    (file instanceof File && file.type === 'application/pdf');

  // Computed state
  const hasFile = Boolean(file);
  const isRejected = status === 'rejected' || Boolean(rejectionReason);
  const isVerified = status === 'verified';

  return (
    <div
      className={cn(
        'rounded-xl border bg-white p-4 transition-all duration-200 text-left',
        isRejected
          ? 'border-rose-300 bg-rose-50/20'
          : isVerified
          ? 'border-emerald-300 bg-emerald-50/10'
          : hasFile
          ? 'border-slate-200 shadow-sm'
          : 'border-dashed border-slate-300 hover:border-primary/60 hover:bg-slate-50/50',
        isDragOver && 'border-primary bg-primary/5 ring-2 ring-primary/20',
        disabled && 'opacity-60 cursor-not-allowed bg-slate-50',
        className
      )}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled && !isUploading) setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={acceptedFormats}
        className="hidden"
        onChange={handleFileChange}
        disabled={disabled || isUploading}
      />

      {/* Header with Title and Status */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-sm text-slate-900">{title}</span>
            {required && <span className="text-red-500 font-bold text-xs">*</span>}
          </div>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>

        <div>
          {isUploading ? (
            <StatusChip status="processing" label="Uploading..." size="sm" />
          ) : isRejected ? (
            <StatusChip status="rejected" size="sm" />
          ) : isVerified ? (
            <StatusChip status="verified" size="sm" />
          ) : hasFile ? (
            <StatusChip status="uploaded" size="sm" />
          ) : required ? (
            <StatusChip status="required" size="sm" />
          ) : (
            <StatusChip status="optional" size="sm" />
          )}
        </div>
      </div>

      {/* State-specific Body */}
      {isUploading ? (
        <div className="py-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-600">
            <span className="flex items-center gap-1.5 font-medium">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
              Uploading {file?.name || 'document'}...
            </span>
            <span className="font-semibold">{Math.round(uploadProgress)}%</span>
          </div>
          <Progress value={uploadProgress} className="h-1.5 bg-slate-100" />
        </div>
      ) : hasFile ? (
        /* Uploaded/Verified/Rejected state with preview */
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-2.5 rounded-lg bg-slate-50 border border-slate-100">
            {/* Thumbnail */}
            <div className="w-12 h-12 rounded-md bg-white border border-slate-200 flex items-center justify-center shrink-0 overflow-hidden relative">
              {previewUrl && !isPDF ? (
                <img src={previewUrl} alt={title} className="w-full h-full object-cover" />
              ) : isPDF ? (
                <FileText className="w-6 h-6 text-rose-500" />
              ) : (
                <ImageIcon className="w-6 h-6 text-slate-400" />
              )}
            </div>

            {/* File info */}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-800 truncate" title={file?.name}>
                {file?.name || 'Uploaded document'}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {'size' in (file || {}) ? formatFileSize(file?.size) : 'File ready'}
              </p>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1 shrink-0">
              {onPreview && previewUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-slate-500 hover:text-slate-900"
                  onClick={onPreview}
                  title="View Preview"
                >
                  <Eye className="w-4 h-4" />
                </Button>
              )}
              {!disabled && (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-slate-500 hover:text-primary"
                    onClick={() => fileInputRef.current?.click()}
                    title="Replace file"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                  {onRemove && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-slate-400 hover:text-rose-600"
                      onClick={onRemove}
                      title="Remove file"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Rejection notice if any */}
          {isRejected && rejectionReason && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-semibold">Verification Note: </span>
                <span>{rejectionReason}</span>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Empty upload state */
        <div
          onClick={() => !disabled && fileInputRef.current?.click()}
          className="flex flex-col items-center justify-center py-5 px-3 rounded-lg cursor-pointer group"
        >
          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 group-hover:bg-primary/10 group-hover:text-primary transition-colors mb-2">
            <Upload className="w-5 h-5" />
          </div>
          <p className="text-xs font-medium text-slate-700 group-hover:text-primary transition-colors">
            <span className="text-primary font-semibold">Click to upload</span> or drag and drop
          </p>
          <p className="text-[11px] text-slate-400 mt-1">
            PNG, JPG or PDF (up to {maxSizeMB}MB)
          </p>
          {helperText && <p className="text-[11px] text-slate-500 mt-1">{helperText}</p>}
        </div>
      )}
    </div>
  );
};
