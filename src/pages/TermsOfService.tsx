import React from 'react';
import { useNavigate } from 'react-router-dom';

const TermsOfService: React.FC = () => {
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
                <h1 className="text-3xl font-bold text-gray-900 mb-2">Terms of Service</h1>
                <p className="text-sm text-gray-500 mb-8">Last updated: April 16, 2026</p>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 space-y-8 text-gray-700 leading-relaxed">

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mb-3">1. Acceptance of Terms</h2>
                        <p>These Terms of Service ("Terms") govern your access to and use of the SabbPe Merchant Onboarding Platform ("Platform") operated by <strong>One78 Sabbpe Technology Solutions India Pvt. Ltd.</strong> ("SabbPe", "Company", "we", "our", or "us"), registered in India.</p>
                        <p className="mt-2">By accessing or using the Platform, you agree to be bound by these Terms. If you are using the Platform on behalf of a business entity, you represent that you have authority to bind that entity to these Terms.</p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mb-3">2. Platform Description</h2>
                        <p className="text-sm">The SabbPe Onboarding Platform enables merchants and distributors to:</p>
                        <ul className="list-disc pl-6 space-y-1 text-sm mt-2">
                            <li>Complete digital KYC and identity verification</li>
                            <li>Apply for payment gateway, UPI QR, POS, and other financial products</li>
                            <li>Submit and manage merchant onboarding applications</li>
                            <li>Access payment collection, split payment, and e-sign services</li>
                            <li>Manage distributor networks and sub-merchant onboarding</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mb-3">3. Eligibility</h2>
                        <ul className="list-disc pl-6 space-y-2 text-sm">
                            <li>You must be at least 18 years of age</li>
                            <li>You must be a resident of India or a business entity registered in India</li>
                            <li>You must possess a valid PAN, Aadhaar, and bank account in your name or business name</li>
                            <li>You must not be on any RBI defaulter list or under regulatory action</li>
                            <li>Distributors must be explicitly approved and whitelisted by SabbPe</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mb-3">4. Account Registration & Security</h2>
                        <ul className="list-disc pl-6 space-y-2 text-sm">
                            <li>You are responsible for maintaining the confidentiality of your login credentials</li>
                            <li>You must immediately notify us of any unauthorized access to your account</li>
                            <li>You agree to provide accurate, current, and complete information during registration and onboarding</li>
                            <li>We reserve the right to suspend or terminate accounts with false or misleading information</li>
                            <li>Google Sign-In is available as an authentication option and is subject to Google's Terms of Service</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mb-3">5. KYC and Verification</h2>
                        <p className="text-sm mb-2">By submitting your onboarding application, you:</p>
                        <ul className="list-disc pl-6 space-y-2 text-sm">
                            <li>Consent to Aadhaar-based OTP KYC (OKYC) via UIDAI's authorized channels</li>
                            <li>Consent to bank account penny drop verification</li>
                            <li>Consent to Experian credit bureau enquiry with your explicit approval</li>
                            <li>Authorize SabbPe to share your KYC documents with partner banks for account activation</li>
                            <li>Confirm that all submitted documents are genuine and unaltered</li>
                        </ul>
                        <p className="text-sm mt-2">Submitting fraudulent KYC documents is a criminal offense under the IPC and PMLA.</p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mb-3">6. Payment Gateway & Financial Products</h2>
                        <ul className="list-disc pl-6 space-y-2 text-sm">
                            <li>Payment gateway services are subject to approval by SabbPe and partner banks</li>
                            <li>Commercial pricing for add-on features (Split Payment, Easy Collect, etc.) is shared post sales connect and is subject to change</li>
                            <li>Settlement to your registered bank account is subject to successful KYC verification and bank approval</li>
                            <li>SabbPe reserves the right to withhold settlements in case of suspected fraud or regulatory holds</li>
                            <li>UPI mandate and auto-debit are subject to NPCI guidelines and a maximum debit limit of ₹25,000 per transaction</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mb-3">7. Distributor Terms</h2>
                        <ul className="list-disc pl-6 space-y-2 text-sm">
                            <li>Distributors are responsible for the accuracy of merchant information they submit on behalf of merchants</li>
                            <li>Distributors must not onboard merchants without their knowledge or consent</li>
                            <li>Pre-screening checks (Aadhaar OKYC, bank validation, credit report) must only be performed with the merchant's explicit consent</li>
                            <li>Distributor access is restricted to approved accounts only. Unauthorized access attempts will result in immediate termination</li>
                            <li>Distributors are liable for any merchant onboarding fraud conducted through their account</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mb-3">8. Prohibited Activities</h2>
                        <p className="text-sm mb-2">You must not:</p>
                        <ul className="list-disc pl-6 space-y-1 text-sm">
                            <li>Use the platform for money laundering, terrorist financing, or any illegal activity</li>
                            <li>Submit fraudulent, forged, or altered KYC documents</li>
                            <li>Attempt to gain unauthorized access to other users' accounts</li>
                            <li>Use automated bots or scripts to interact with the platform</li>
                            <li>Resell or sublicense access to the platform without written permission</li>
                            <li>Collect payments for prohibited goods or services (as per RBI guidelines)</li>
                            <li>Attempt to reverse-engineer or tamper with the platform's systems</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mb-3">9. Intellectual Property</h2>
                        <p className="text-sm">All content, trademarks, logos, and software on the Platform are the exclusive property of One78 Sabbpe Technology Solutions India Pvt. Ltd. You may not reproduce, distribute, or create derivative works without our prior written consent.</p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mb-3">10. Limitation of Liability</h2>
                        <p className="text-sm">To the maximum extent permitted by law, SabbPe shall not be liable for:</p>
                        <ul className="list-disc pl-6 space-y-1 text-sm mt-2">
                            <li>Indirect, incidental, or consequential damages arising from platform use</li>
                            <li>Delays or failures in bank approvals, credit bureau responses, or third-party services</li>
                            <li>Loss of data due to technical failures beyond our reasonable control</li>
                            <li>Actions taken by partner banks, NPCI, or regulatory authorities</li>
                        </ul>
                        <p className="text-sm mt-2">Our total liability to you shall not exceed ₹5,000 or the amount you paid to SabbPe in the preceding 3 months, whichever is lower.</p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mb-3">11. Indemnification</h2>
                        <p className="text-sm">You agree to indemnify and hold SabbPe, its officers, directors, employees, and partners harmless from any claims, damages, or expenses (including legal fees) arising from your violation of these Terms, your use of the Platform, or your submission of false information.</p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mb-3">12. Termination</h2>
                        <p className="text-sm">We reserve the right to suspend or terminate your access to the Platform at any time, with or without notice, if you violate these Terms or if required by applicable law or regulatory directive. You may terminate your account by contacting us at <strong>contact@sabbpe.com</strong>.</p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mb-3">13. Governing Law & Dispute Resolution</h2>
                        <p className="text-sm">These Terms are governed by the laws of India. Any disputes shall be subject to the exclusive jurisdiction of courts in <strong>Bengaluru, Karnataka</strong>. Disputes shall first be attempted to be resolved through mutual negotiation. If unresolved within 30 days, disputes shall be referred to arbitration under the Arbitration and Conciliation Act, 1996, with Bengaluru as the seat of arbitration.</p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mb-3">14. Changes to Terms</h2>
                        <p className="text-sm">We reserve the right to modify these Terms at any time. We will notify you of material changes via email or platform notification. Your continued use of the Platform after changes constitutes acceptance of the revised Terms.</p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mb-3">15. Contact Us</h2>
                        <div className="text-sm space-y-1">
                            <p><strong>One78 Sabbpe Technology Solutions India Pvt. Ltd.</strong></p>
                            <p>Bengaluru, Karnataka, India</p>
                            <p>Email: <a href="mailto:contact@sabbpe.com" className="text-blue-600 hover:underline">contact@sabbpe.com</a></p>
                            <p>Legal: <a href="mailto:legal@sabbpe.com" className="text-blue-600 hover:underline">legal@sabbpe.com</a></p>
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

export default TermsOfService;
