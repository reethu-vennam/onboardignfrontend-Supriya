interface FillField {
    key: string;
    question: string;
    type: 'text' | 'yesno' | 'select' | 'address_line';
    subKey?: string;
    options?: string[];
    optional?: boolean;
    conditional?: (collected: Record<string, string>) => boolean;
}

const INDIAN_STATES = [
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
    'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
    'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
    'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
    'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
    'Delhi',
];

const INDUSTRIES = [
    'E-Commerce & Retail', 'Food & Beverages', 'Travel & Hospitality',
    'Healthcare & Pharma', 'Education & Training', 'Financial Services',
    'Technology & Software', 'Manufacturing', 'Real Estate',
    'Logistics & Transport', 'Media & Entertainment', 'Professional Services',
    'Non-Profit / NGO', 'Government / PSU', 'Other',
];

const STEP_FIELDS: Record<string, FillField[]> = {
    'business-details': [
        { key: 'businessName', question: 'What is your business or entity name?', type: 'text' },
        { key: 'mobileNumber', question: 'What is your mobile number?', type: 'text' },
        { key: 'email', question: 'What is your email address?', type: 'text' },
        { key: 'hasGST', question: 'Are you GST registered? Say yes or no.', type: 'yesno' },
        { key: 'gstNumber', question: 'What is your GST number?', type: 'text', conditional: (c) => c.hasGST === 'yes' },
        { key: 'businessWebsite', question: 'What is your business website? You can say skip if not applicable.', type: 'text', optional: true },
        { key: 'businessIndustry', question: 'What is your business industry?', type: 'select', options: INDUSTRIES },
        { key: 'registeredAddress_addressLine1', question: 'What is your registered address line?', type: 'text' },
        { key: 'registeredAddress_city', question: 'What is your city?', type: 'text' },
        { key: 'registeredAddress_pincode', question: 'What is your pincode?', type: 'text' },
        { key: 'registeredAddress_state', question: 'What is your state?', type: 'select', options: INDIAN_STATES },
    ],
};

function matchOption(text: string, options: string[]): string | null {
    const lower = text.toLowerCase().trim();
    for (const opt of options) {
        if (opt.toLowerCase().includes(lower) || lower.includes(opt.toLowerCase())) return opt;
    }
    return null;
}

export interface FillSession {
    step: string;
    greeted: boolean;
    agreed: boolean;
    currentIndex: number;
    collected: Record<string, string>;
    complete: boolean;
    fields: FillField[];
}

const sessions = new Map<string, FillSession>();

const SESSION_TTL = 30 * 60 * 1000;

setInterval(() => {
    const now = Date.now();
    for (const [id] of sessions) {
        if (!sessions.get(id)) continue;
    }
}, SESSION_TTL);

const STEP_GREETINGS: Record<string, string> = {
    'business-details': "Hi! I can help fill your Business Details. Tell us about your business and where you operate from. I'll ask one question at a time. You can type or use the microphone. Say \"let's start\" when you're ready.",
    'person-kyc': "Hi! I can help fill your Person KYC details. I'll ask one question at a time. You can type or use the microphone. Say \"let's start\" when you're ready.",
    'bank-details': "Hi! I can help fill your Bank Details. I'll ask one question at a time. You can type or use the microphone. Say \"let's start\" when you're ready.",
};
const DEFAULT_GREETING = "Hi! I can help fill this form. I'll ask one question at a time. You can type or use the microphone. Say \"let's start\" when you're ready.";
const START_WORDS = ['yes', 'yeah', 'yep', 'ok', 'okay', 'sure', 'let\'s start', 'let\'s go', 'let\'s begin', 'start', 'ready', 'haan', 'hmm', 'begin', 'go', 'start', 'proceed'];
const GOT_IT = 'Got it.';

function isStartWord(text: string): boolean {
    // Accept anything that isn't clearly a field answer (like a phone number, email, etc.)
    // If user says anything at all, treat it as readiness
    return true;
}

export function getOrCreateSession(sessionId: string, step: string): FillSession {
    let session = sessions.get(sessionId);
    if (!session || session.step !== step) {
        const fields = STEP_FIELDS[step] || [];
        session = { step, greeted: false, agreed: false, currentIndex: 0, collected: {}, complete: false, fields };
        sessions.set(sessionId, session);
    }
    return session;
}

export function getGreeting(step: string): string {
    return STEP_GREETINGS[step] || DEFAULT_GREETING;
}

export function isGreeted(session: FillSession): boolean {
    return session.greeted;
}

export function getSessionState(sessionId: string): { fields: Record<string, string>; complete: boolean } | null {
    const session = sessions.get(sessionId);
    if (!session) return null;
    return { fields: { ...session.collected }, complete: session.complete };
}

export function clearSession(sessionId: string): void {
    sessions.delete(sessionId);
}

export function processAnswer(sessionId: string, transcript: string): string {
    const session = sessions.get(sessionId);
    if (!session || session.complete) {
        return 'Please start the form fill again.';
    }

    // Handle greeting phase — any response starts the fill
    if (!session.greeted) {
        session.greeted = true;
        session.agreed = true;
        return advanceToNext(session, true);
    }

    const field = session.fields[session.currentIndex];
    if (!field) {
        session.complete = true;
        return 'All information has been collected! Please review and continue.';
    }

    let value = transcript.trim();
    if (!value) {
        if (field.optional) {
            session.currentIndex++;
            return advanceToNext(session);
        }
        return 'I did not catch that. Could you please repeat?';
    }

    if (field.type === 'yesno') {
        const cleaned = value.toLowerCase().replace(/[^a-z]/g, '').trim();
        const yesWords = ['yes', 'yeah', 'yep', 'correct', 'right', 'haan'];
        const noWords = ['no', 'nope', 'nah', 'not', 'na'];
        if (yesWords.includes(cleaned)) value = 'yes';
        else if (noWords.includes(cleaned)) value = 'no';
        else return 'Please say yes or no.';
    }

    if (field.type === 'select' && field.options) {
        const matched = matchOption(value, field.options);
        if (matched) value = matched;
        else {
            const list = field.options.slice(0, 8).join(', ');
            return `I could not find "${value}" in the available options. Please choose from: ${list}.`;
        }
    }

    if (field.key === 'mobileNumber') {
        value = value.replace(/\D/g, '').slice(0, 10);
        if (value.length < 10) return 'Please say your 10-digit mobile number.';
    }

    session.collected[field.key] = value;
    session.currentIndex++;

    return advanceToNext(session);
}

function advanceToNext(session: FillSession, isAfterStart?: boolean): string {
    const nextIdx = findNextField(session);
    if (nextIdx >= session.fields.length) {
        session.complete = true;
        const fieldKeys = Object.keys(session.collected);
        return `Thank you! I have collected all ${fieldKeys.length} pieces of information. Please review and continue with the form.`;
    }

    const nextField = session.fields[nextIdx];
    session.currentIndex = nextIdx;
    return isAfterStart ? `Great, let's start. ${nextField.question}` : `${GOT_IT} ${nextField.question}`;
}

function findNextField(session: FillSession): number {
    for (let i = session.currentIndex; i < session.fields.length; i++) {
        const f = session.fields[i];
        if (f.conditional && !f.conditional(session.collected)) continue;
        return i;
    }
    return session.fields.length;
}
