/**
 * A partner's discount code as it is shown and emailed (#1589). Where the
 * partner asks for a PIN at redemption it travels with the code, so nobody is
 * handed a code they cannot use.
 */
export function formatCodeWithPin(code: {
  code: string;
  pin: string | null;
}): string {
  return code.pin ? `${code.code} · PIN ${code.pin}` : code.code;
}
