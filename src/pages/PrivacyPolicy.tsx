import React from 'react';
import { useNavigate } from 'react-router-dom';

const PrivacyPolicy: React.FC = () => {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b shadow-sm">
                <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <img src="/sabbpe-logo.png" alt="SabbPe" className="h-8" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        <span className="text-xl font-bold text-gray-900">SabbPe</span>
                    </div>
                    <button onClick={() => navigate(-1)} className="text-sm text-blue-600 hover:underline">← Back</button>
                </div>
            </div>

            {/* Content */}
            <div className="max-w-4xl mx-auto px-6 py-12">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
                <p className="text-sm text-gray-500 mb-8">Last updated: April 16, 2026</p>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 space-y-8 text-gray-700 leading-relaxed">

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mb-3">1. Introduction</h2>
                        <p>One78 Sabbpe Technology Solutions India Pvt. Ltd. ("SabbPe", "we", "our", or "us") operates the SabbPe Merchant Onboarding Platform accessible at <strong>onboarding.sabbpe.com</strong>. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our platform to onboard as a merchant or distributor.</p>
                        <p className="mt-2">By using our platform, you consent to the data practices described in this policy. If you do not agree, please do not use the platform.</p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mb-3">2. Information We Collect</h2>
                        <p className="font-medium text-gray-800 mb-2">2.1 Personal Information</p>
                        <ul className="list-disc pl-6 space-y-1 text-sm">
                            <li>Full name, email address, mobile number</li>
                            <li>PAN number, Aadhaar number (masked), date of birth</li>
                            <li>Business name, entity type, GST number</li>
                            <li>Bank account details (account number, IFSC code)</li>
                            <li>KYC documents (PAN card, Aadhaar card, cancelled cheque, business proof)</li>
                            <li>Selfie and live video KYC capture</li>
                            <li>GPS location coordinates at time of onboarding</li>
                        </ul>
                        <p className="font-medium text-gray-800 mb-2 mt-4">2.2 Financial Information</p>
                        <ul className="list-disc pl-6 space-y-1 text-sm">
                            <li>Bank account details for settlement purposes</li>
                            <li>Credit report data fetched via Experian (with explicit consent)</li>
                            <li>Transaction history on the platform</li>
                        </ul>
                        <p className="font-medium text-gray-800 mb-2 mt-4">2.3 Technical Information</p>
                        <ul className="list-disc pl-6 space-y-1 text-sm">
                            <li>IP address, browser type, device information</li>
                            <li>Cookies and session data</li>
                            <li>Usage logs and activity on the platform</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mb-3">3. How We Use Your Information</h2>
                        <ul className="list-disc pl-6 space-y-2 text-sm">
                            <li>To verify your identity and complete KYC as required by RBI and NPCI guidelines</li>
                            <li>To process merchant onboarding and activate your payment gateway account</li>
                            <li>To validate your bank account for settlement purposes</li>
                            <li>To send OTPs, notifications, and onboarding status updates via SMS and WhatsApp</li>
                            <li>To generate and manage payment links, mandates, and agreements</li>
                            <li>To comply with legal obligations under PMLA, DPDPA 2023, and applicable RBI circulars</li>
                            <li>To prevent fraud, money laundering, and unauthorized access</li>
                            <li>To improve our platform and services</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mb-3">4. Data Sharing</h2>
                        <p className="text-sm mb-2">We share your information only in the following circumstances:</p>
                        <ul className="list-disc pl-6 space-y-2 text-sm">
                            <li><strong>Partner Banks:</strong> Your KYC, bank details, and onboarding application are shared with our banking partners for account activation and settlement</li>
                            <li><strong>Payment Processors:</strong> Easebuzz, NDPS Atom, and other payment gateways for transaction processing</li>
                            <li><strong>Credit Bureaus:</strong> Experian India for credit report generation (only with your explicit consent)</li>
                            <li><strong>TransBnk / TrustHub:</strong> For Aadhaar OKYC, bank account validation, and e-sign services</li>
                            <li><strong>Regulatory Authorities:</strong> RBI, FIU-IND, NPCI, and other government bodies as required by law</li>
                            <li><strong>Your Distributor:</strong> If you were onboarded through a SabbPe distributor, your profile data is accessible to them</li>
                        </ul>
                        <p className="text-sm mt-3">We do not sell your personal data to third parties.</p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mb-3">5. Data Storage & Security</h2>
                        <ul className="list-disc pl-6 space-y-2 text-sm">
                            <li>All data is stored on Google Cloud Platform (GCP) in the <strong>asia-south1 (Mumbai)</strong> region — data stays within India</li>
                            <li>Documents are encrypted and stored in Supabase secure storage</li>
                            <li>Database access is restricted using role-based access controls</li>
                            <li>All API communications use HTTPS/TLS encryption</li>
                            <li>Aadhaar data is handled in compliance with UIDAI guidelines — we do not store full Aadhaar numbers in plain text</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mb-3">6. Data Retention</h2>
                        <p className="text-sm">We retain your data for as long as your merchant account is active and for a minimum of 8 years after account closure, as required under the Prevention of Money Laundering Act (PMLA). Credit report data is retained for 6 months. You may request deletion of non-regulatory data by contacting us.</p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mb-3">7. Your Rights (DPDPA 2023)</h2>
                        <p className="text-sm mb-2">Under the Digital Personal Data Protection Act, 2023, you have the right to:</p>
                        <ul className="list-disc pl-6 space-y-1 text-sm">
                            <li>Access your personal data we hold</li>
                            <li>Correct inaccurate personal data</li>
                            <li>Erase your data (subject to legal retention requirements)</li>
                            <li>Withdraw consent (this may affect your ability to use the platform)</li>
                            <li>Nominate a representative for data-related requests</li>
                        </ul>
                        <p className="text-sm mt-2">To exercise these rights, email us at <strong>privacy@sabbpe.com</strong></p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mb-3">8. Cookies</h2>
                        <p className="text-sm">We use essential cookies for authentication and session management. We do not use advertising or tracking cookies. You can disable cookies in your browser settings but this may affect platform functionality.</p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mb-3">9. Children's Privacy</h2>
                        <p className="text-sm">Our platform is not intended for individuals under 18 years of age. We do not knowingly collect data from minors.</p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mb-3">10. Changes to This Policy</h2>
                        <p className="text-sm">We may update this Privacy Policy periodically. We will notify you of significant changes via email or platform notification. Continued use of the platform after changes constitutes acceptance of the updated policy.</p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mb-3">11. Contact Us</h2>
                        <div className="text-sm space-y-1">
                            <p><strong>One78 Sabbpe Technology Solutions India Pvt. Ltd.</strong></p>
                            <p>Bengaluru, Karnataka, India</p>
                            <p>Email: <a href="mailto:privacy@sabbpe.com" className="text-blue-600 hover:underline">privacy@sabbpe.com</a></p>
                            <p>Support: <a href="mailto:contact@sabbpe.com" className="text-blue-600 hover:underline">contact@sabbpe.com</a></p>
                            <p>Website: <a href="https://sabbpe.com" className="text-blue-600 hover:underline">https://sabbpe.com</a></p>
                        </div>
                    </section>

                </div>
            </div>

            {/* Footer */}
            <div className="text-center py-6 text-xs text-gray-400">
                © 2026 One78 Sabbpe Technology Solutions India Pvt. Ltd. All rights reserved.
            </div>
        </div>
    );
};

export default PrivacyPolicy;
