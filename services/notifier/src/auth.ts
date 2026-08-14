import { Keypair } from '@stellar/stellar-sdk'

/**
 * Verify that `signature` (hex of a raw ed25519 signature over `message`)
 * was produced by the private key of `address`.
 *
 * Used to prove ownership of a wallet before subscribing it to
 * notifications (F-901 — prevents subscribing a victim's address with an
 * attacker's email). The client signs the challenge string with their
 * Stellar secret key.
 */
export function verifyOwnership(address: string, message: string, signatureHex: string): boolean {
  try {
    const kp = Keypair.fromPublicKey(address)
    const signature = Buffer.from(signatureHex, 'hex')
    return kp.verify(Buffer.from(message), signature)
  } catch {
    return false
  }
}
