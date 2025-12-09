export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates Minecraft username
 * - Must be 3-16 characters
 * - Can contain a-z, A-Z, 0-9, underscore (_)
 * - Optional dot (.) at the start for Bedrock players
 */
export function validateUsername(username: string): ValidationResult {
  // Regex pattern: ^(\.)?[a-zA-Z0-9_]{3,16}$
  const usernameRegex = /^(\.)?[a-zA-Z0-9_]{3,16}$/;

  if (!username || username.trim().length === 0) {
    return {
      valid: false,
      error: 'Brukernavn kan ikke være tomt'
    };
  }

  // Check if username matches the pattern
  if (!usernameRegex.test(username)) {
    // Determine specific error message
    if (username.length < 3) {
      return {
        valid: false,
        error: 'Brukernavn må være minst 3 tegn'
      };
    }

    if (username.length > 17) { // 16 + optional dot
      return {
        valid: false,
        error: 'Brukernavn kan ikke være mer enn 16 tegn (17 med punktum)'
      };
    }

    // Check for invalid characters
    const invalidChars = username.match(/[^a-zA-Z0-9_.]/g);
    if (invalidChars) {
      return {
        valid: false,
        error: `Brukernavn inneholder ugyldige tegn: ${invalidChars.join(', ')}`
      };
    }

    // Check if dot is not at the start
    if (username.includes('.') && !username.startsWith('.')) {
      return {
        valid: false,
        error: 'Punktum (.) er kun tillatt i starten for Bedrock spillere'
      };
    }

    return {
      valid: false,
      error: 'Brukernavn må være 3-16 tegn og kan kun inneholde a-z, A-Z, 0-9, _ og valgfritt . i starten'
    };
  }

  return { valid: true };
}
