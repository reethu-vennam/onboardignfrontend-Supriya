

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, Settings } from "lucide-react";

const today = new Date().toLocaleDateString();

const SectionTable = ({ title, headers, rows }: any) => (
  <Card className="shadow-sm border border-gray-200">
    <CardHeader className="bg-gray-50 border-b">
      <CardTitle className="text-lg font-semibold text-gray-800 flex items-center gap-2">
        <Settings className="h-4 w-4 text-primary" />
        {title}
      </CardTitle>
    </CardHeader>
    <CardContent className="p-0">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              {headers.map((h: string) => (
                <th key={h} className="px-4 py-3 text-left font-semibold border-b">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row: any, idx: number) => (
              <tr key={idx} className="hover:bg-gray-50 transition">
                {row.map((col: any, i: number) => (
                  <td key={i} className="px-4 py-3 text-gray-800">{col}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CardContent>
  </Card>
);

const CommercialsTablePage: React.FC = () => {
  const handleSubmit = () => {
    alert("Commercial configuration submitted successfully");
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8">
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="p-6 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Commercial Pricing Configuration</h1>
            <p className="text-gray-600 text-sm">Review configured commercial pricing structure</p>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-500">Effective Date</div>
            <div className="text-lg font-semibold text-gray-800">{today}</div>
          </div>
        </CardContent>
      </Card>

      {/* BANK */}
      <SectionTable
        title="Bank Commercials"
        headers={["Bank","Offer","Processing Fee","Platform Fee","Other Fee","Merchant System Fee"]}
        rows={[
          ["Axis Bank","Yes","1.30 %","2.00 Waived Off","0.00 INR","2.00 Waived Off"],
          ["Bank of Baroda","Yes","1.65 %","2.00 Waived Off","0.00 INR","2.00 Waived Off"],
          ["Federal Bank","Yes","1.30 %","2.00 Waived Off","0.00 INR","2.00 Waived Off"],
          ["HDFC Bank","Yes","1.90 %","2.00 Waived Off","0.00 INR","2.00 Waived Off"],
          ["ICICI Bank","Yes","1.90 %","2.00 Waived Off","0.00 INR","2.00 Waived Off"],
          ["Kotak Bank","Yes","1.90 %","2.00 Waived Off","0.00 INR","2.00 Waived Off"],
          ["SBI Bank","Yes","1.30 %","2.00 Waived Off","0.00 INR","2.00 Waived Off"],
          ["Standard Chartered","Yes","1.30 %","2.00 Waived Off","0.00 INR","2.00 Waived Off"],
          ["Yes Bank","Yes","1.30 %","2.00 Waived Off","0.00 INR","2.00 Waived Off"],
          ["Other Banks 1","Yes","15.00 INR","2.00 Waived Off","0.00 INR","2.00 Waived Off"],
          ["Other Banks 2","Yes","15.00 INR","2.00 Waived Off","0.00 INR","2.00 Waived Off"],
          ["Other Banks 3","Yes","15.00 INR","2.00 Waived Off","0.00 INR","2.00 Waived Off"]
        ]}
      />

      {/* CREDIT CARD */}
      <SectionTable
        title="Credit Card"
        headers={["Option","Offer","Processing Fee","Platform Fee","Other Fee","Merchant System Fee"]}
        rows={[
          ["CC (Visa/Master/Rupay)","Yes","2.40 %","2.00 Waived Off","0.00 INR","2.00 Waived Off"],
          ["CC (AMEX)","Yes","3.25 %","2.00 Waived Off","0.00 INR","2.00 Waived Off"],
          ["CC (Diners)","Yes","3.25 %","2.00 Waived Off","0.00 INR","2.00 Waived Off"],
          ["CC (Corp Cards)","Yes","3.00 %","2.00 Waived Off","0.00 INR","2.00 Waived Off"],
          ["CC International","Yes","3.50 %","2.00 Waived Off","0.00 INR","2.00 Waived Off"],
          ["CC EMI Processing","Yes","0.50 %","2.00 Waived Off","0.00 INR","2.00 Waived Off"]
        ]}
      />

      {/* DEBIT */}
      <SectionTable
        title="Debit Card"
        headers={["Option","Offer","Processing Fee","Platform Fee","Other Fee","Merchant System Fee"]}
        rows={[
          ["DC (Visa/Master) < 2000","Yes","0.40 %","2.00 Waived Off","0.15 %","2.00 Waived Off"],
          ["DC (Visa/Master) > 2000","Yes","0.90 %","2.00 Waived Off","0.15 %","2.00 Waived Off"],
          ["DC (Rupay) < 2000","Yes","0.00 %","2.00 INR","0.40 %","1.00 Waived Off"],
          ["DC (Rupay) > 2000","Yes","0.00 %","2.00 INR","0.90 %","1.00 Waived Off"],
          ["DC International","Yes","3.50 %","2.00 Waived Off","0.00 %","2.00 Waived Off"],
          ["DC EMI Processing","Yes","0.90 %","2.00 Waived Off","0.00 %","2.00 Waived Off"]
        ]}
      />

      {/* UPI */}
      <SectionTable
        title="UPI"
        headers={["Option","Cust Bear","Offer","Processing Fee","Platform Fee","Other Fee","Merchant System Fee"]}
        rows={[["UPI / QR / Intent","No","Yes","0.00 INR","5.00 %","0.00 %","1.00 %"]]}
      />

      {/* PAYOUT */}
      <SectionTable
        title="Payout"
        headers={["Type","Offer","Processing Fee","Platform Fee","Other Fee","Merchant System Fee"]}
        rows={[
          ["IMPS (< 1K)","No","0.00 %","2.00 Waived Off","0.00 INR","2.00 Waived Off"],
          ["IMPS (1K - 25K)","No","0.00 %","2.00 Waived Off","0.00 INR","2.00 Waived Off"],
          ["IMPS (> 25K)","No","0.00 %","2.00 Waived Off","0.00 INR","2.00 Waived Off"],
          ["Penny Drop","No","0.00 %","2.00 Waived Off","0.00 INR","2.00 Waived Off"]
        ]}
      />

      {/* FEES */}
      <SectionTable
        title="Operational Fees"
        headers={["Type","Offer","Processing Fee","Platform Fee","Other Fee","Merchant System Fee"]}
        rows={[
          ["Chargeback Query","No","0.00 %","2.00 Waived Off","0.00 INR","2.00 Waived Off"],
          ["Refund","No","0.00 %","2.00 Waived Off","0.00 INR","2.00 Waived Off"],
          ["Re-Query","No","0.00 %","2.00 Waived Off","0.00 INR","2.00 Waived Off"],
          ["ENACH – Per Mandate","No","0.00 INR","2.00 Waived Off","0.00 INR","2.00 Waived Off"],
          ["ENACH – Per Transaction","No","0.00 INR","2.00 Waived Off","0.00 INR","2.00 Waived Off"],
          ["ENACH – Cancellation","No","0.00 INR","2.00 Waived Off","0.00 INR","2.00 Waived Off"],
          ["UPI Autopay (0-250)","No","0.00 INR","2.00 Waived Off","0.00 INR","2.00 Waived Off"],
          ["UPI Autopay (251-1000)","No","0.00 INR","2.00 Waived Off","0.00 INR","2.00 Waived Off"],
          ["UPI Autopay (>1000)","No","0.00 INR","2.00 Waived Off","0.00 INR","2.00 Waived Off"],
          ["UPI Autopay (0-5000)","No","0.00 INR","2.00 Waived Off","0.00 INR","2.00 Waived Off"],
          ["UPI Autopay (5001-20000)","No","0.00 INR","2.00 Waived Off","0.00 INR","2.00 Waived Off"],
          ["UPI Autopay (20001-100000)","No","0.00 INR","2.00 Waived Off","0.00 INR","2.00 Waived Off"],
          ["UPI Autopay (>100000)","No","0.00 INR","2.00 Waived Off","0.00 INR","2.00 Waived Off"]
        ]}
      />

      <div className="flex justify-end">
        <Button onClick={handleSubmit} className="px-8">
          <CheckCircle className="h-4 w-4 mr-2" />
          Submit Commercial Configuration
        </Button>
      </div>
    </div>
  );
};

export default CommercialsTablePage;
