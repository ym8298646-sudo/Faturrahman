function bufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuffer(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function isBiometricHardwareAvailable(): Promise<boolean> {
  if (
    typeof window === 'undefined' ||
    !window.PublicKeyCredential ||
    !navigator.credentials
  ) {
    return false;
  }
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export async function registerWebAuthnCredential(
  userLabel: string
): Promise<{ credentialId: string }> {
  if (!window.PublicKeyCredential || !navigator.credentials) {
    throw new Error('Browser tidak mendukung WebAuthn biometrik.');
  }

  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);

  const userIdBytes = new TextEncoder().encode(`kasharian_${Date.now()}`);

  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: {
        name: 'KasHarian',
        id: window.location.hostname,
      },
      user: {
        id: userIdBytes,
        name: userLabel || 'pengguna@kasharian',
        displayName: userLabel || 'Pengguna KasHarian',
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' },
        { alg: -257, type: 'public-key' },
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
      timeout: 60000,
    },
  })) as PublicKeyCredential | null;

  if (!credential) {
    throw new Error('Pendaftaran biometrik dibatalkan.');
  }

  return {
    credentialId: bufferToBase64(credential.rawId),
  };
}

export async function verifyWebAuthnCredential(
  credentialIdBase64: string
): Promise<boolean> {
  if (!window.PublicKeyCredential || !navigator.credentials) {
    throw new Error('Browser tidak mendukung WebAuthn biometrik.');
  }

  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);

  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge,
      allowCredentials: [
        {
          id: base64ToBuffer(credentialIdBase64) as unknown as BufferSource,
          type: 'public-key',
        },
      ],
      userVerification: 'required',
      timeout: 60000,
    },
  });

  return Boolean(assertion);
}

const PBKDF2_ITERATIONS = 100000;

async function derivePbkdf2Hash(
  pin: string,
  salt: Uint8Array
): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  return bufferToBase64(bits);
}

export async function hashSecurityPin(pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePbkdf2Hash(pin, salt);
  return `pbkdf2_v2:${bufferToBase64(salt)}:${hash}`;
}

export async function verifySecurityPin(
  pin: string,
  storedHash: string
): Promise<boolean> {
  if (storedHash.startsWith('pbkdf2_v2:')) {
    const parts = storedHash.split(':');
    if (parts.length !== 3) return false;
    const salt = base64ToBuffer(parts[1]);
    const expected = parts[2];
    const computed = await derivePbkdf2Hash(pin, salt);
    return constantTimeEquals(computed, expected);
  }

  // Legacy v1 fallback compatibility
  const data = new TextEncoder().encode(`kasharian_pin_v1:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return constantTimeEquals(bufferToBase64(digest), storedHash);
}
