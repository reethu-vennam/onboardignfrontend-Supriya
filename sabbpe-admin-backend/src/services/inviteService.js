import axios from 'axios';

const SMS_FLOW_URL = process.env.MSG91_SMS_FLOW_URL || 'https://control.msg91.com/api/v5/flow';
const AUTH_KEY = process.env.MSG91_AUTHKEY || '';
const SMS_TEMPLATE_ID = process.env.MSG91_SMS_TEMPLATE_ID || '694e236ec594fc01ba61af73';

/**
 * Send merchant onboarding invite via SMS using MSG91 template
 * 
 * @param mobileNumber - Merchant mobile number (with or without country code)
 * @param inviteLink - Onboarding link to include in SMS (VAR1)
 * @param distributorName - Name of the distributor who referred them (VAR2)
 * @param merchantName - Merchant name (for logging)
 */
export const sendMerchantInvite = async (
  mobileNumber,
  inviteLink,
  distributorName,
  merchantName
) => {
  if (!AUTH_KEY) {
    console.error('❌ MSG91 auth key not configured');
    return { success: false, error: 'MSG91 auth key missing' };
  }

  let formattedNumber = mobileNumber.trim();
  if (!formattedNumber.startsWith('91')) {
    formattedNumber = '91' + formattedNumber;
  }

  const payload = {
    template_id: SMS_TEMPLATE_ID,
    short_url: '1',
    short_url_expiry: '86400',
    realTimeResponse: '1',
    recipients: [
      {
        mobiles: formattedNumber,
        VAR1: inviteLink,
        VAR2: distributorName
      }
    ]
  };

  try {
    console.log(`📬 Sending SMS invite to ${formattedNumber} (${merchantName || 'unknown'})`);
    console.log('📋 Payload:', JSON.stringify(payload, null, 2));

    const response = await axios.post(SMS_FLOW_URL, payload, {
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        authkey: AUTH_KEY
      },
      timeout: 10000
    });

    console.log('✅ MSG91 response:', JSON.stringify(response.data, null, 2));

    if (response.status >= 200 && response.status < 300) {
      const messageId = response.data?.request_id || response.data?.message_id || '';
      

      if (messageId) {
        console.log(`✅ Invite SMS sent with message ID: ${messageId}`);
      }
      
      return {
        success: true,
        messageId: messageId || ''
      };
    }

    return {
      success: false,
      error: `HTTP ${response.status}: ${JSON.stringify(response.data)}`
    };
  } catch (error) {
    console.error('❌ SMS send error:', error?.message);
    if (error?.response?.data) {
      console.error('   MSG91 Response:', JSON.stringify(error.response.data, null, 2));
      console.error('   Status Code:', error.response.status);
    }
    const errorMsg = error.response?.data?.message || error.message || 'Failed to send SMS invite';
    return { success: false, error: errorMsg };
  }
};

// Alias export to resolve import issues
export const sendInviteViaSms = sendMerchantInvite;