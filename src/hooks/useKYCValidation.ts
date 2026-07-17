// hooks/useKYCValidation.ts
import { useState, useCallback } from 'react';

interface KYCState {
    videoKycCompleted: boolean;
    locationCaptured: boolean;
    selfieUrl: string | null;
    coordinates: { lat: number; lng: number } | null;
    // human readable address (display_name from reverse geocode)
    address?: string;
    // full address components returned by reverse geocode (road, city, state, etc.)
    addressDetails?: Record<string, string>;
}

export const useKYCValidation = () => {
    const [kycState, setKycState] = useState<KYCState>({
        videoKycCompleted: false,
        locationCaptured: false,
        selfieUrl: null,
        coordinates: null,
    });

    const captureLocation = useCallback(() => {
        return new Promise<{ lat: number; lng: number; address?: string; addressDetails?: Record<string, string> }>(
            async (resolve, reject) => {
                if (!navigator.geolocation) {
                    reject(new Error('Geolocation is not supported'));
                    return;
                }

                navigator.geolocation.getCurrentPosition(
                    async (position) => {
                        const { latitude, longitude } = position.coords;
                        let displayAddress: string | undefined;
                        let addressDetails: Record<string, string> | undefined;

                        try {
                            // perform reverse geocoding using OpenStreetMap Nominatim
                            // Note: This may fail in browsers due to CORS; we fall back to coordinates
                            const resp = await fetch(
`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`
                            );
                            if (resp.ok) {
                                const json = await resp.json();
                                displayAddress = json.display_name;
                                if (json.address) {
                                    addressDetails = json.address;
                                }
                                console.log('✅ Reverse geocoding successful:', displayAddress);
                            }
                        } catch (e) {
                            // CORS or network error from Nominatim is expected in some browser contexts
                            // Just use coordinates as fallback silently
                        }

                        // fallback if reverse lookup didn't populate displayAddress
                        if (!displayAddress) {
                            displayAddress = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
                        }

                        setKycState(prev => ({
                            ...prev,
                            locationCaptured: true,
                            coordinates: { lat: latitude, lng: longitude },
                            address: displayAddress,
                            addressDetails
                        }));

                        resolve({ lat: latitude, lng: longitude, address: displayAddress, addressDetails });
                    },
                    (error) => {
                        reject(new Error(`Location error: ${error.message}`));
                    },
                    { timeout: 10000, enableHighAccuracy: true }
                );
            }
        );
    }, []);

    const completeVideoKYC = useCallback((selfieBlob: Blob) => {
        const selfieUrl = URL.createObjectURL(selfieBlob);
        setKycState(prev => ({
            ...prev,
            videoKycCompleted: true,
            selfieUrl
        }));

        return selfieUrl;
    }, []);

    const resetKYC = useCallback(() => {
        if (kycState.selfieUrl) {
            URL.revokeObjectURL(kycState.selfieUrl);
        }

        setKycState({
            videoKycCompleted: false,
            locationCaptured: false,
            selfieUrl: null,
            coordinates: null,
        });
    }, [kycState.selfieUrl]);

    const isKYCComplete = kycState.videoKycCompleted && kycState.locationCaptured;

    return {
        kycState,
        captureLocation,
        completeVideoKYC,
        resetKYC,
        isKYCComplete,
    };
};
