import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface UPIQRCodeProps {
    upiString: string;
    vpa: string;
    merchantName: string;
}

export const UPIQRCode: React.FC<UPIQRCodeProps> = ({ upiString, vpa, merchantName }) => {
    const downloadQR = () => {
        const svg = document.getElementById('qr-code');
        if (!svg) return;

        const svgData = new XMLSerializer().serializeToString(svg);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();

        canvas.width = 256;
        canvas.height = 256;

        img.onload = () => {
            ctx?.drawImage(img, 0, 0);
            const url = canvas.toDataURL('image/png');
            const link = document.createElement('a');
            link.download = `${merchantName}_UPI_QR.png`;
            link.href = url;
            link.click();
        };

        img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Your UPI QR Code</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center space-y-4">
                <div className="bg-white p-4 rounded-lg">
                    <QRCodeSVG
                        id="qr-code"
                        value={upiString}
                        size={256}
                        level="H"
                        includeMargin={true}
                    />
                </div>
                <div className="text-center">
                    <p className="font-semibold">UPI ID: {vpa}</p>
                    <p className="text-sm text-muted-foreground">Share this QR code to receive payments</p>
                </div>
                <Button onClick={downloadQR} className="w-full">
                    <Download className="h-4 w-4 mr-2" />
                    Download QR Code
                </Button>
            </CardContent>
        </Card>
    );
};