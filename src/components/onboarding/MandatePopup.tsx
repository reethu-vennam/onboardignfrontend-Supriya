import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle } from "lucide-react";

interface MandatePopupProps {
  isOpen: boolean;
  onEnableMandate: () => void; // triggers opening the MandateFlowModal
}

export const MandatePopup: React.FC<MandatePopupProps> = ({
  isOpen,
  onEnableMandate,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-in fade-in zoom-in">
      <Card className="w-full max-w-md rounded-xl shadow-xl">
        <CardContent className="p-8 text-center space-y-5">

          {/* Icon */}
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>

          <h2 className="text-xl font-semibold text-gray-900">
            Onboarding Completed
          </h2>

          <p className="text-sm text-gray-600">
            Your application has been submitted successfully.  
            To activate Your UPI AutoPay, please enable your mandate.
          </p>

          {/* Action Button */}
          <Button
            onClick={onEnableMandate}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4"
          >
            Enable Autopay Mandate
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
