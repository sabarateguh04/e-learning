import { useFetch } from './hooks';

interface CaptchaResponse {
  enabled: boolean;
  captcha: { id: string; question: string } | null;
}

/**
 * Server-issued arithmetic captcha. Use `useCaptcha()` in the form and spread
 * `captcha.payload()` into the request body; call `captcha.reset()` after a failed submit
 * (challenges are single-use).
 */
export function useCaptcha() {
  const fetch = useFetch<CaptchaResponse>('/auth/captcha');
  return {
    fetch,
    required: fetch.data?.enabled ?? true,
    id: fetch.data?.captcha?.id,
    question: fetch.data?.captcha?.question,
    reset: fetch.refetch,
  };
}

