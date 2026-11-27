export const gmailMessage =
  'Use a valid @gmail.com address to create an account.';
export const isGmailAddress = (email) =>
  /^[a-z0-9]+(?:\.[a-z0-9]+)*(?:\+[^@\s]+)?@gmail\.com$/i.test(email);

export function canonicalGmail(email) {
  return email.split('@')[0].split('+')[0].replaceAll('.', '') + '@gmail.com';
}
