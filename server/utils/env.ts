function isTrue(value?: string): boolean {
  return !!value && ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function isDisabled(feature: string): boolean {
  return isTrue(process.env[`DISABLE_${feature}`]);
}

export function validateEnvironment(): void {
  const required = new Set<string>(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);

  if (!isDisabled('STRIPE')) {
    required.add('STRIPE_SECRET_KEY');
    required.add('STRIPE_WEBHOOK_SECRET');
  }

  if (!isDisabled('OPENAI')) {
    required.add('OPENAI_API_KEY');
  }

  if (!isDisabled('VAPI')) {
    required.add('VAPI_SECRET_KEY');
  }

  const missing = Array.from(required).filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}
