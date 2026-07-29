import axios from 'axios';

const MSG91_URL = process.env.MSG91_WHATSAPP_URL || 'https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/';
const AUTH_KEY = process.env.MSG91_AUTHKEY || '';
const INTEGRATED_NUMBER = process.env.MSG91_INTEGRATED_NUMBER || '';

export interface SendResult {
  success: boolean;
  status?: any;
  error?: string;
  payload?: any;
}

export const sendWhatsAppTemplate = async (to: string, templateName: string, namespace: string, bodyValues: string[]): Promise<SendResult> => {
  if (!AUTH_KEY) {
    return { success: false, error: 'MSG91 auth key not configured' };
  }

  const components: Record<string, any> = {};

  // body_1 is the OTP text parameter
  bodyValues.forEach((val, idx) => {
    components[`body_${idx + 1}`] = { type: 'text', value: val };
  });

  // button_1 is required by template - also set to OTP for voice match
  if (bodyValues.length > 0) {
    components['button_1'] = { subtype: 'url', type: 'text', value: bodyValues[0] };
  }

  const payload = {
    integrated_number: INTEGRATED_NUMBER,
    content_type: 'template',
    payload: {
      messaging_product: 'whatsapp',
      type: 'template',
      template: {
        name: templateName,
        language: { code: 'en', policy: 'deterministic' },
        namespace,
        to_and_components: [
          {
            to: [to],
            components
          }
        ]
      }
    }
  };

  try {
    const resp = await axios.post(MSG91_URL, payload, {
      headers: {
        'Content-Type': 'application/json',
        authkey: AUTH_KEY
      },
      timeout: 10000
    });

    // Log outgoing payload and response for debugging
    console.log('📤 MSG91 outgoing payload:', JSON.stringify(payload, null, 2));
    console.log('📥 MSG91 response:', JSON.stringify(resp.data, null, 2));

    return { success: true, status: { statusCode: resp.status, data: resp.data }, payload };
  } catch (err: any) {
    console.error('❌ MSG91 error:', err?.message);
    if (err?.response?.data) {
      console.error('   Response data:', JSON.stringify(err.response.data, null, 2));
    }

    // if axios error, include response body when available
    if (err?.response) {
      return { success: false, error: err.message, status: { statusCode: err.response.status, data: err.response.data }, payload };
    }
    return { success: false, error: err?.message || 'Request failed' };
  }
};
