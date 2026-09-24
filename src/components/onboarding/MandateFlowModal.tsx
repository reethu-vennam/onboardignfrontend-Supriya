import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { MandateVpaValidate } from './MandateVpaValidate';
import MandateCreate from './MandateCreate';
import { api } from '@/lib/rest-api';

interface MandateFlowModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
  merchantProfile: any;
  user: any;
  refetchMerchant: () => void;
}

type Step = 'validate' | 'mandate';

// ✅ NEW: Interface for validation data
interface VpaValidationData {
  vpa: string;
  payer_name: string;
}

export const MandateFlowModal: React.FC<MandateFlowModalProps> = ({
  isOpen,
  onClose,
  onComplete,
  merchantProfile,
  user,
  refetchMerchant,
}) => {
  const [step, setStep] = useState<Step>('validate');
  const [validationData, setValidationData] = useState<VpaValidationData | null>(null);
  const [freshProfile, setFreshProfile] = useState(merchantProfile);
  const [loading, setLoading] = useState(false);

  // ✅ CRITICAL FIX: Fetch directly from backend when modal opens
  useEffect(() => {
    const fetchFreshProfile = async () => {
      if (isOpen && user?.id) {
        setLoading(true);
        console.log("🔄 MandateFlowModal - Fetching FRESH data from backend...");
        
        try {
          const result = await api.get('/merchant/profile');

          if (!result.success || !result.data) {
            console.error("❌ Error fetching merchant profile:", result.error);
            setFreshProfile(merchantProfile); // Fallback to prop
          } else {
            console.log("✅ Fresh data from backend:", result.data);
            setFreshProfile(result.data);

            // Resume an already-submitted mandate instead of always restarting at VPA
            // validation — otherwise a page refresh loses all memory of a mandate that's
            // still pending (or has since gone active) on the ecosystem's side.
            if (result.data.upi_mandate_status === 'active') {
              onComplete();
            } else if (result.data.upi_mandate_ref_no) {
              setValidationData({ vpa: result.data.upi_vpa || '', payer_name: '' });
              setStep('mandate');
            }
          }
        } catch (err) {
          console.error("❌ Exception fetching merchant profile:", err);
          setFreshProfile(merchantProfile);
        } finally {
          setLoading(false);
        }
      }
    };

    if (isOpen) {
      fetchFreshProfile();
    }
  }, [isOpen, user?.id, merchantProfile]);

  if (!isOpen) return null;

  const handleVpaSuccess = (data: VpaValidationData) => {
    console.log("✅ VPA Validated with data:", data);
    setValidationData(data);
    setStep('mandate');
  };

  const handleMandateSuccess = () => {
    onComplete();
  };

  const handleClose = () => {
    setStep('validate');
    setValidationData(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-in fade-in zoom-in">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              UPI Autopay Mandate
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {step === 'validate' ? 'Step 1 of 2' : 'Step 2 of 2'}
            </p>
          </div>

          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-0">
          {loading ? (
            <div className="p-6 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
              <p className="text-sm text-gray-600 mt-2">Loading fresh data...</p>
            </div>
          ) : (
            <>
              {step === 'validate' && (
                <MandateVpaValidate onSuccess={handleVpaSuccess} />
              )}

              {step === 'mandate' && validationData && (
                <MandateCreate
                  vpa={validationData.vpa}
                  payerName={validationData.payer_name}
                  onSuccess={handleMandateSuccess}
                  merchantProfile={freshProfile}
                  user={user}
                  refetchMerchant={refetchMerchant}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
